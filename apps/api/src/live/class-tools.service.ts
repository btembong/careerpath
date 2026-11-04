import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { QuestionStatus, QuestionType, TestMode, UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DailyService } from './daily/daily.service';
import { TestCentreService } from '../test-centre/test-centre.service';

const nameOf = (p?: { firstName: string | null; lastName: string | null; name: string | null } | null) =>
  p ? [p.firstName, p.lastName].filter(Boolean).join(' ') || p.name || 'A student' : 'A student';
const shortName = (p?: { firstName: string | null; lastName: string | null; name: string | null } | null) => {
  const full = nameOf(p).split(/\s+/).filter(Boolean);
  return full.length > 1 ? `${full[0]} ${full[full.length - 1][0]}.` : full[0] ?? 'A student';
};
function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/**
 * In-class tools next to the video: a poll, a quick quiz from the question bank, questions that stay
 * on the class page, and breakout groups with their own video rooms. The page asks for the state every
 * few seconds; nothing here needs the video to work.
 */
@Injectable()
export class ClassToolsService {
  constructor(private prisma: PrismaService, private daily: DailyService, private tests: TestCentreService) {}

  /** The class, and whether this person leads it (its teacher or an admin) or is a student in it */
  private async access(user: UserProfile, classId: string) {
    const c = await this.prisma.liveClass.findUnique({ where: { id: classId }, include: { cohort: { select: { id: true, teacherId: true } } } });
    if (!c) throw new NotFoundException('Live class not found');
    const leads = user.role === UserRole.ADMIN || c.cohort.teacherId === user.id;
    if (!leads) {
      const r = await this.prisma.cohortRoster.findUnique({ where: { studentId_cohortId: { studentId: user.id, cohortId: c.cohortId } } });
      if (!r) throw new ForbiddenException('This class is for another cohort');
    }
    return { c, leads };
  }
  private async lead(user: UserProfile, classId: string) {
    const a = await this.access(user, classId);
    if (!a.leads) throw new ForbiddenException('Only the class’s teacher can do that');
    return a;
  }
  private live(c: { status: string }) {
    if (c.status !== 'ACTIVE') throw new BadRequestException('The class isn’t live.');
  }

  // ── Everything the side panel shows ──────────────────────

  async state(user: UserProfile, classId: string) {
    const { c, leads } = await this.access(user, classId);
    const now = new Date();
    const [poll, quiz, questions, groups] = await Promise.all([
      this.prisma.classPoll.findFirst({ where: { liveClassId: classId, status: { not: 'CLOSED' } }, orderBy: { createdAt: 'desc' }, include: { votes: true } }),
      this.prisma.classQuiz.findFirst({ where: { liveClassId: classId }, orderBy: { startedAt: 'desc' } }),
      this.questionsFor(user, classId, leads),
      this.prisma.classGroup.findMany({ where: { liveClassId: classId, endsAt: { gt: now } }, orderBy: { name: 'asc' } }),
    ]);
    const counts = poll ? poll.options.map((_, i) => poll.votes.filter(v => v.option === i).length) : [];
    const mine = groups.find(g => g.memberIds.includes(user.id));
    return {
      status: c.status, leads,
      poll: poll && {
        id: poll.id, question: poll.question, options: poll.options, status: poll.status,
        answered: poll.votes.length, myVote: poll.votes.find(v => v.studentId === user.id)?.option ?? null,
        // Students see the counts only once the teacher shows them
        counts: leads || poll.status === 'SHOWN' ? counts : null,
      },
      quiz: quiz && {
        id: quiz.id, questions: quiz.questionIds.length, endsAt: quiz.endsAt, running: quiz.endsAt > now,
        ...(leads ? { results: await this.quizResults(quiz.id, quiz.questionIds) } : { mySessionId: await this.quizSessionOf(user.id, quiz.id) }),
      },
      questions,
      groups: leads ? await this.groupsWithNames(groups) : [],
      myGroup: mine ? { id: mine.id, name: mine.name, endsAt: mine.endsAt } : null,
    };
  }

  // ── Poll ─────────────────────────────────────────────────

  async createPoll(user: UserProfile, classId: string, dto: { question: string; options: string[] }) {
    const { c } = await this.lead(user, classId); this.live(c);
    const question = String(dto?.question ?? '').trim().slice(0, 300);
    const options = (Array.isArray(dto?.options) ? dto.options : []).map(o => String(o ?? '').trim().slice(0, 120)).filter(Boolean);
    if (!question) throw new BadRequestException('Write the question.');
    if (options.length < 2 || options.length > 6) throw new BadRequestException('Give between 2 and 6 answers.');
    // One poll at a time
    await this.prisma.classPoll.updateMany({ where: { liveClassId: classId, status: { not: 'CLOSED' } }, data: { status: 'CLOSED' } });
    return this.prisma.classPoll.create({ data: { liveClassId: classId, question, options } });
  }

  async vote(user: UserProfile, classId: string, pollId: string, option: number) {
    const { leads } = await this.access(user, classId);
    if (leads) throw new BadRequestException('Students answer polls; you see the results.');
    const poll = await this.prisma.classPoll.findFirst({ where: { id: pollId, liveClassId: classId } });
    if (!poll) throw new NotFoundException('Poll not found');
    if (poll.status !== 'OPEN') throw new BadRequestException('This poll is closed.');
    const n = Math.floor(Number(option));
    if (!(n >= 0 && n < poll.options.length)) throw new BadRequestException('Pick one of the answers.');
    await this.prisma.classPollVote.upsert({ where: { pollId_studentId: { pollId, studentId: user.id } }, create: { pollId, studentId: user.id, option: n }, update: { option: n } });
    return { option: n };
  }

  async setPoll(user: UserProfile, classId: string, pollId: string, status: string) {
    await this.lead(user, classId);
    if (!['OPEN', 'SHOWN', 'CLOSED'].includes(status)) throw new BadRequestException('Unknown poll status');
    const r = await this.prisma.classPoll.updateMany({ where: { id: pollId, liveClassId: classId }, data: { status } });
    if (!r.count) throw new NotFoundException('Poll not found');
    return { status };
  }

  // ── Questions and answers ────────────────────────────────

  private async questionsFor(user: UserProfile, classId: string, leads: boolean) {
    const qs = await this.prisma.classQuestion.findMany({ where: { liveClassId: classId }, include: { votes: { select: { userId: true } } } });
    const authors = await this.prisma.userProfile.findMany({ where: { id: { in: qs.filter(q => !q.anonymous).map(q => q.authorId) } }, select: { id: true, firstName: true, lastName: true, name: true } });
    return qs
      .map(q => ({
        id: q.id, body: q.body, answer: q.answer, state: q.state, createdAt: q.createdAt, answeredAt: q.answeredAt,
        who: q.anonymous ? 'Anonymous' : shortName(authors.find(a => a.id === q.authorId)),
        mine: q.authorId === user.id, votes: q.votes.length, voted: q.votes.some(v => v.userId === user.id),
      }))
      .sort((a, b) => b.votes - a.votes || +a.createdAt - +b.createdAt);
  }

  async ask(user: UserProfile, classId: string, dto: { body: string; anonymous?: boolean }) {
    const { c, leads } = await this.access(user, classId);
    if (leads) throw new BadRequestException('Students ask here; you answer.');
    if (c.status === 'CANCELLED') throw new BadRequestException('This class was cancelled.');
    const body = String(dto?.body ?? '').trim().slice(0, 500);
    if (body.length < 3) throw new BadRequestException('Write your question.');
    const recent = await this.prisma.classQuestion.count({ where: { liveClassId: classId, authorId: user.id, createdAt: { gt: new Date(Date.now() - 60_000) } } });
    if (recent >= 3) throw new BadRequestException('Wait a minute before asking again.');
    return this.prisma.classQuestion.create({ data: { liveClassId: classId, authorId: user.id, anonymous: !!dto?.anonymous, body }, select: { id: true } });
  }

  async voteQuestion(user: UserProfile, classId: string, questionId: string) {
    await this.access(user, classId);
    const q = await this.prisma.classQuestion.findFirst({ where: { id: questionId, liveClassId: classId } });
    if (!q) throw new NotFoundException('Question not found');
    if (q.authorId === user.id) throw new BadRequestException('You can’t vote for your own question.');
    const existing = await this.prisma.classQuestionVote.findUnique({ where: { questionId_userId: { questionId, userId: user.id } } });
    if (existing) await this.prisma.classQuestionVote.delete({ where: { id: existing.id } });
    else await this.prisma.classQuestionVote.create({ data: { questionId, userId: user.id } });
    return { voted: !existing };
  }

  async answer(user: UserProfile, classId: string, questionId: string, dto: { state: string; answer?: string }) {
    await this.lead(user, classId);
    if (!['OPEN', 'LIVE', 'LATER', 'ANSWERED'].includes(dto?.state)) throw new BadRequestException('Unknown state');
    const answer = dto.answer != null ? String(dto.answer).trim().slice(0, 2000) || null : undefined;
    if (dto.state === 'ANSWERED' && !answer) throw new BadRequestException('Write the answer.');
    const r = await this.prisma.classQuestion.updateMany({
      where: { id: questionId, liveClassId: classId },
      data: { state: dto.state, ...(answer !== undefined ? { answer } : {}), answeredAt: ['LIVE', 'ANSWERED'].includes(dto.state) ? new Date() : null },
    });
    if (!r.count) throw new NotFoundException('Question not found');
    return { state: dto.state };
  }

  // ── Quick quiz ───────────────────────────────────────────

  /** Courses the teacher can quiz from: their own (admins: any) with live multiple-choice questions */
  async quizCourses(user: UserProfile, classId: string) {
    await this.lead(user, classId);
    const courses = await this.prisma.platformCourse.findMany({
      where: user.role === UserRole.ADMIN ? {} : { teacherId: user.id },
      select: { id: true, title: true }, orderBy: { title: 'asc' },
    });
    const counts = await this.prisma.questionBank.groupBy({ by: ['courseId'], where: { courseId: { in: courses.map(c => c.id) }, status: QuestionStatus.LIVE, type: { in: [QuestionType.MCQ, QuestionType.TRUE_FALSE] } }, _count: { _all: true } });
    return courses.map(c => ({ ...c, questions: counts.find(x => x.courseId === c.id)?._count._all ?? 0 })).filter(c => c.questions > 0);
  }

  async startQuiz(user: UserProfile, classId: string, dto: { courseId: string; count?: number; secondsEach?: number }) {
    const { c } = await this.lead(user, classId); this.live(c);
    const allowed = await this.quizCourses(user, classId);
    if (!allowed.some(x => x.id === dto?.courseId)) throw new ForbiddenException('Pick one of your courses with questions.');
    const count = Math.min(Math.max(Math.floor(Number(dto.count) || 3), 1), 10);
    const secondsEach = Math.min(Math.max(Math.floor(Number(dto.secondsEach) || 60), 20), 300);
    const pool = await this.prisma.questionBank.findMany({ where: { courseId: dto.courseId, status: QuestionStatus.LIVE, type: { in: [QuestionType.MCQ, QuestionType.TRUE_FALSE] } }, select: { id: true } });
    const questionIds = shuffled(pool.map(q => q.id)).slice(0, count);
    const running = await this.prisma.classQuiz.findFirst({ where: { liveClassId: classId, endsAt: { gt: new Date() } } });
    if (running) throw new BadRequestException('A quiz is already running.');
    return this.prisma.classQuiz.create({ data: { liveClassId: classId, courseId: dto.courseId, questionIds, secondsEach, endsAt: new Date(Date.now() + questionIds.length * secondsEach * 1000) } });
  }

  private async quizSessionOf(studentId: string, quizId: string) {
    const s = await this.prisma.testSession.findFirst({ where: { studentId, filters: { path: ['classQuizId'], equals: quizId } }, select: { id: true } });
    return s?.id ?? null;
  }

  /** A student opens the quiz: one Test Centre practice session each, timed to the quiz */
  async joinQuiz(user: UserProfile, classId: string, quizId: string) {
    const { c, leads } = await this.access(user, classId);
    if (leads) throw new BadRequestException('Students take the quiz; you see the results.');
    const quiz = await this.prisma.classQuiz.findFirst({ where: { id: quizId, liveClassId: classId } });
    if (!quiz) throw new NotFoundException('Quiz not found');
    const existing = await this.quizSessionOf(user.id, quizId);
    if (existing) return { id: existing };
    const left = Math.floor((quiz.endsAt.getTime() - Date.now()) / 1000);
    if (left < 10) throw new BadRequestException('This quiz has finished.');
    return this.tests.createSession(user.id, {
      mode: TestMode.PRACTICE, title: `Class quiz: ${c.title}`, ids: quiz.questionIds, limitSecs: Math.max(60, left),
      filters: { classQuizId: quiz.id, liveClassId: classId },
    });
  }

  private async quizResults(quizId: string, questionIds: string[]) {
    const answers = await this.prisma.testAnswer.findMany({ where: { session: { filters: { path: ['classQuizId'], equals: quizId } } }, select: { questionId: true, isCorrect: true } });
    const qs = await this.prisma.questionBank.findMany({ where: { id: { in: questionIds } }, select: { id: true, questionText: true } });
    const takers = await this.prisma.testSession.count({ where: { filters: { path: ['classQuizId'], equals: quizId } } });
    return {
      takers,
      questions: questionIds.map((id, i) => {
        const a = answers.filter(x => x.questionId === id && x.isCorrect !== null);
        return { n: i + 1, text: (qs.find(q => q.id === id)?.questionText ?? '').replace(/<[^>]+>/g, '').slice(0, 140), answered: a.length, right: a.filter(x => x.isCorrect).length };
      }),
    };
  }

  // ── Groups ───────────────────────────────────────────────

  private async groupsWithNames(groups: { id: string; name: string; memberIds: string[]; endsAt: Date }[]) {
    const people = await this.prisma.userProfile.findMany({ where: { id: { in: groups.flatMap(g => g.memberIds) } }, select: { id: true, firstName: true, lastName: true, name: true } });
    return groups.map(g => ({ id: g.id, name: g.name, endsAt: g.endsAt, members: g.memberIds.map(id => shortName(people.find(p => p.id === id))) }));
  }

  /** Students in the room right now, split at random into groups of `size`, each with its own video room */
  async startGroups(user: UserProfile, classId: string, dto: { size?: number; minutes?: number }) {
    const { c } = await this.lead(user, classId); this.live(c);
    if (await this.prisma.classGroup.count({ where: { liveClassId: classId, endsAt: { gt: new Date() } } })) throw new BadRequestException('Groups are already running.');
    const size = Math.min(Math.max(Math.floor(Number(dto?.size) || 4), 2), 8);
    const minutes = Math.min(Math.max(Math.floor(Number(dto?.minutes) || 10), 2), 60);
    const here = await this.prisma.liveAttendance.findMany({ where: { liveClassId: classId, leftAt: null }, select: { studentId: true } });
    const ids = shuffled([...new Set(here.map(h => h.studentId))]);
    if (ids.length < 2) throw new BadRequestException('Groups need at least 2 students in the room.');
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += size) chunks.push(ids.slice(i, i + size));
    // A last group of one joins the one before
    if (chunks.length > 1 && chunks[chunks.length - 1].length === 1) chunks[chunks.length - 2].push(...chunks.pop()!);
    const endsAt = new Date(Date.now() + minutes * 60_000);
    const made = [];
    for (const [i, memberIds] of chunks.entries()) {
      const room = await this.daily.createRoom({ name: `grp-${classId.slice(0, 8)}-${Date.now().toString(36)}-${i + 1}`, startsAt: new Date(), durationMinutes: minutes + 5, maxParticipants: memberIds.length + 1 });
      made.push(await this.prisma.classGroup.create({ data: { liveClassId: classId, name: `Group ${i + 1}`, roomUrl: room.url, memberIds, endsAt } }));
    }
    return { groups: made.length, endsAt };
  }

  async endGroups(user: UserProfile, classId: string) {
    await this.lead(user, classId);
    const r = await this.prisma.classGroup.updateMany({ where: { liveClassId: classId, endsAt: { gt: new Date() } }, data: { endsAt: new Date() } });
    return { ended: r.count };
  }

  /** A video token for a group room: its members, or the teacher dropping in */
  async groupToken(user: UserProfile, classId: string, groupId: string) {
    const { leads } = await this.access(user, classId);
    const g = await this.prisma.classGroup.findFirst({ where: { id: groupId, liveClassId: classId, endsAt: { gt: new Date() } } });
    if (!g) throw new NotFoundException('This group has finished.');
    if (!leads && !g.memberIds.includes(user.id)) throw new ForbiddenException('You’re in another group.');
    const token = await this.daily.createToken({
      roomName: this.daily.roomNameFromUrl(g.roomUrl), userId: user.id,
      userName: `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email, isOwner: leads, exp: new Date(g.endsAt.getTime() + 5 * 60_000),
    });
    return { roomUrl: g.roomUrl, token, endsAt: g.endsAt };
  }

  // ── After class ──────────────────────────────────────────

  /** One page after the class: the board as it was left, questions with answers, polls and quiz results */
  async after(user: UserProfile, classId: string) {
    const { c, leads } = await this.access(user, classId);
    const [polls, quizzes, questions] = await Promise.all([
      this.prisma.classPoll.findMany({ where: { liveClassId: classId }, orderBy: { createdAt: 'asc' }, include: { votes: true } }),
      this.prisma.classQuiz.findMany({ where: { liveClassId: classId }, orderBy: { startedAt: 'asc' } }),
      this.questionsFor(user, classId, leads),
    ]);
    let board: unknown[] = [];
    try { board = c.whiteboardSnapshot ? JSON.parse(c.whiteboardSnapshot) : []; } catch { board = []; }
    const myQuiz = async (quizId: string) => {
      const s = await this.prisma.testSession.findFirst({ where: { studentId: user.id, filters: { path: ['classQuizId'], equals: quizId } }, include: { answers: { select: { isCorrect: true } } } });
      return s ? { sessionId: s.id, right: s.answers.filter(a => a.isCorrect).length, of: s.questionIds.length } : null;
    };
    return {
      board,
      questions: questions.filter(q => leads || q.state !== 'OPEN' || q.mine),
      polls: polls.map(p => ({ id: p.id, question: p.question, options: p.options, counts: p.options.map((_, i) => p.votes.filter(v => v.option === i).length), myVote: p.votes.find(v => v.studentId === user.id)?.option ?? null })),
      quizzes: await Promise.all(quizzes.map(async q => ({ id: q.id, questions: q.questionIds.length, startedAt: q.startedAt, ...(leads ? { results: await this.quizResults(q.id, q.questionIds) } : { mine: await myQuiz(q.id) }) }))),
    };
  }

  // ── Calendar ─────────────────────────────────────────────

  /** An .ics file for one class: works with Google Calendar, Outlook and phones */
  async calendar(user: UserProfile, classId: string) {
    const { c } = await this.access(user, classId);
    const portal = (process.env.PORTAL_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    // Calendar text escapes backslash, semicolon, comma and line breaks
    const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const end = new Date(c.scheduledAt.getTime() + c.durationMins * 60_000);
    const link = `${portal}/student/live/${c.id}`;
    return [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CareerPath Africa//Live classes//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', `UID:${c.id}@careerpathafrica.com`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(c.scheduledAt)}`, `DTEND:${stamp(end)}`,
      `SUMMARY:${esc(`Live class: ${c.title}`)}`, `DESCRIPTION:${esc(`${c.description ? c.description + '\n\n' : ''}Join: ${link}`)}`, `URL:${link}`,
      'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Live class in 30 minutes', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR', '',
    ].join('\r\n');
  }
}
