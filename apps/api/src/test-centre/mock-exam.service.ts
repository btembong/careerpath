import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ExamKind, ExamStatus, Prisma, QuestionDifficulty, QuestionStatus, QuestionType, TestMode, TestStatus, UserProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { QuestionBankService } from './question-bank.service';
import { TestCentreService } from './test-centre.service';

export interface Section { title: string; courseIds: string[]; moduleIds?: string[]; tags?: string[]; types?: QuestionType[]; count: number; easy?: number; medium?: number; hard?: number }
export interface ExamInput {
  kind?: ExamKind; title?: string; description?: string | null; programmeId?: string | null;
  courseIds?: string[]; packageIds?: string[];
  timeMinutes?: number; passMark?: number; attemptsAllowed?: number; showAnswers?: boolean;
  randomised?: boolean; sections?: Section[]; questionIds?: string[];
  examBody?: string | null; year?: number | null; session?: string | null; paperNumber?: string | null;
  catMin?: number | null; catMax?: number | null; catStandard?: number | null;
}

const WRITTEN: QuestionType[] = [QuestionType.SHORT_ANSWER, QuestionType.WRITTEN, QuestionType.STRUCTURED];
const MAX_PAPER = 200;

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

@Injectable()
export class MockExamService {
  constructor(private prisma: PrismaService, private bank: QuestionBankService, private tests: TestCentreService) {}

  // ── Staff ────────────────────────────────────────────────
  private async mine(u: UserProfile, id: string) {
    const e = await this.prisma.mockExam.findUnique({ where: { id } });
    if (!e) throw new NotFoundException('Exam not found');
    if (u.role !== 'ADMIN' && e.createdById !== u.id) throw new ForbiddenException('Not your exam');
    return e;
  }

  /** Questions a section could draw from */
  private sectionWhere(sec: Section): Prisma.QuestionBankWhereInput {
    // Matching has its own answer screen, so every bank type can appear in a paper
    const where: Prisma.QuestionBankWhereInput = { courseId: { in: sec.courseIds }, status: QuestionStatus.LIVE };
    if (sec.types?.length) where.type = { in: sec.types };
    if (sec.tags?.length) where.tags = { hasSome: sec.tags };
    return where;
  }

  /** Lessons in the chosen modules, so questions tied to a lesson count for its module */
  private async inModules(sec: Section, ids: { id: string; moduleId: string | null; lessonId: string | null; sourceLessonId: string | null }[]) {
    if (!sec.moduleIds?.length) return ids;
    const lessons = new Set((await this.prisma.lesson.findMany({ where: { moduleId: { in: sec.moduleIds } }, select: { id: true } })).map(l => l.id));
    return ids.filter(q => (q.moduleId && sec.moduleIds!.includes(q.moduleId)) || (q.sourceLessonId && lessons.has(q.sourceLessonId)) || (q.lessonId && lessons.has(q.lessonId)));
  }

  /** Live questions a section can draw from (adaptive tests use this as their item pool) */
  sectionPool(sec: Section) { return this.pool(sec); }

  private async pool(sec: Section) {
    const where = this.sectionWhere(sec);
    const rows = await this.prisma.questionBank.findMany({ where, select: { id: true, difficulty: true, moduleId: true, lessonId: true, sourceLessonId: true } });
    return (await this.inModules(sec, rows)) as { id: string; difficulty: QuestionDifficulty; moduleId: string | null; lessonId: string | null; sourceLessonId: string | null }[];
  }

  /** How many questions each section can draw on, by difficulty */
  async availability(sections: Section[]) {
    return Promise.all(sections.map(async sec => {
      const p = await this.pool(sec);
      return { total: p.length, easy: p.filter(q => q.difficulty === 'EASY').length, medium: p.filter(q => q.difficulty === 'MEDIUM').length, hard: p.filter(q => q.difficulty === 'HARD').length };
    }));
  }

  private async clean(u: UserProfile, dto: ExamInput, current?: { kind: ExamKind; randomised: boolean }) {
    const kind = dto.kind ?? current?.kind ?? ExamKind.MOCK;
    const title = (dto.title ?? '').trim();
    if (title.length < 3) throw new BadRequestException('Give the exam a name.');
    const minutes = Number(dto.timeMinutes);
    if (!Number.isFinite(minutes) || minutes < 1 || minutes > 480) throw new BadRequestException('Time limit must be between 1 minute and 8 hours.');
    const passMark = Math.round(Number(dto.passMark ?? 50));
    if (passMark < 1 || passMark > 100) throw new BadRequestException('Pass mark must be between 1% and 100%.');
    const attemptsAllowed = Math.round(Number(dto.attemptsAllowed ?? 0));
    if (attemptsAllowed < 0 || attemptsAllowed > 50) throw new BadRequestException('Attempts must be between 0 (no limit) and 50.');

    // Who can take it: courses must be ones this person can work on; packages must exist
    const scope = await this.bank.scopedCourseIds(u);
    const courseIds = [...new Set(dto.courseIds ?? [])];
    if (scope && courseIds.some(c => !scope.includes(c))) throw new ForbiddenException('You can only use your own courses.');
    if (courseIds.length && (await this.prisma.platformCourse.count({ where: { id: { in: courseIds } } })) !== courseIds.length) throw new BadRequestException('One of the courses doesn’t exist.');
    const packageIds = [...new Set(dto.packageIds ?? [])];
    if (packageIds.length && (await this.prisma.package.count({ where: { id: { in: packageIds } } })) !== packageIds.length) throw new BadRequestException('One of the packages doesn’t exist.');
    if (!courseIds.length && !packageIds.length) throw new BadRequestException('Say who can take it: pick at least one course or package.');

    // An adaptive test always draws from sections; there, each section is a content area and its count is its share
    const randomised = kind === ExamKind.PAST_PAPER ? false : kind === ExamKind.CAT ? true : dto.randomised ?? current?.randomised ?? true;
    let cat: { catMin: number | null; catMax: number | null; catStandard: number | null } = { catMin: null, catMax: null, catStandard: null };
    if (kind === ExamKind.CAT) {
      const min = Math.round(Number(dto.catMin ?? 30)), max = Math.round(Number(dto.catMax ?? 60)), std = Number(dto.catStandard ?? 0);
      if (!(min >= 5 && max >= min && max <= 300)) throw new BadRequestException('Set the fewest and most questions: at least 5, and no more than 300.');
      if (!(std >= -3 && std <= 3)) throw new BadRequestException('The passing standard must be between -3 and 3.');
      cat = { catMin: min, catMax: max, catStandard: std };
    }
    let sections: Section[] | null = null;
    let questionIds: string[] = [];
    if (randomised) {
      sections = (dto.sections ?? []).map(s => ({
        title: (s.title ?? '').trim() || 'Section', courseIds: [...new Set(s.courseIds ?? [])], moduleIds: s.moduleIds ?? [], tags: (s.tags ?? []).filter(Boolean),
        types: s.types ?? [], count: Math.round(Number(s.count) || 0), easy: Math.round(Number(s.easy) || 0), medium: Math.round(Number(s.medium) || 0), hard: Math.round(Number(s.hard) || 0),
      }));
      if (!sections.length) throw new BadRequestException('Add at least one section.');
      for (const s of sections) {
        if (!s.courseIds.length) throw new BadRequestException(`Pick where “${s.title}” draws questions from.`);
        if (scope && s.courseIds.some(c => !scope.includes(c))) throw new ForbiddenException('Sections can only use your own courses.');
        if (s.count < 1) throw new BadRequestException(`“${s.title}” needs at least one question.`);
        if ((s.easy ?? 0) + (s.medium ?? 0) + (s.hard ?? 0) > s.count) throw new BadRequestException(`“${s.title}”: easy, medium and hard add up to more than its questions.`);
      }
      if (kind !== ExamKind.CAT && sections.reduce((n, s) => n + s.count, 0) > MAX_PAPER) throw new BadRequestException(`A paper can have up to ${MAX_PAPER} questions.`);
    } else {
      questionIds = [...new Set(dto.questionIds ?? [])];
      if (questionIds.length > MAX_PAPER) throw new BadRequestException(`A paper can have up to ${MAX_PAPER} questions.`);
      if (questionIds.length) {
        const found = await this.prisma.questionBank.findMany({ where: { id: { in: questionIds } }, select: { id: true, courseId: true } });
        if (found.length !== questionIds.length) throw new BadRequestException('One of the questions no longer exists.');
        if (scope && found.some(q => !scope.includes(q.courseId))) throw new ForbiddenException('You can only use questions from your own courses.');
      }
    }
    const year = dto.year == null || (dto.year as unknown) === '' ? null : Math.round(Number(dto.year));
    if (year != null && (year < 1950 || year > new Date().getFullYear())) throw new BadRequestException('Check the year.');
    return {
      kind, title: title.slice(0, 160), description: (dto.description ?? '').trim() || null, programmeId: dto.programmeId || null,
      courseIds, packageIds, timeLimitSecs: Math.round(minutes * 60), passMark, attemptsAllowed, showAnswers: dto.showAnswers ?? true,
      randomised, sections: (sections ?? Prisma.DbNull) as Prisma.InputJsonValue | typeof Prisma.DbNull, questionIds,
      examBody: kind === ExamKind.PAST_PAPER ? (dto.examBody ?? '').trim() || null : null,
      year: kind === ExamKind.PAST_PAPER ? year : null,
      session: kind === ExamKind.PAST_PAPER ? (dto.session ?? '').trim() || null : null,
      paperNumber: kind === ExamKind.PAST_PAPER ? (dto.paperNumber ?? '').trim() || null : null,
      ...cat,
    };
  }

  /** Before publishing: every section must be able to fill its places, and a fixed paper needs live questions */
  private async assertReady(e: { kind?: ExamKind; randomised: boolean; sections: Prisma.JsonValue; questionIds: string[]; catMax?: number | null }) {
    if (e.kind === ExamKind.CAT) {
      // An adaptive test needs more questions than its longest run, or every student sees the same ones
      const sections = (e.sections ?? []) as unknown as Section[];
      const ids = new Set<string>();
      for (const sec of sections) for (const r of await this.pool({ ...sec, types: [QuestionType.MCQ, QuestionType.TRUE_FALSE, QuestionType.FILL_BLANK, QuestionType.MATCHING] })) ids.add(r.id);
      if (ids.size < (e.catMax ?? 60)) throw new BadRequestException(`An adaptive test needs at least as many automatically marked questions as its maximum (${e.catMax}); these areas have ${ids.size}. Aim for several times more.`);
      return;
    }
    if (e.randomised) {
      const sections = (e.sections ?? []) as unknown as Section[];
      const avail = await this.availability(sections);
      const short = sections.flatMap((s, i) => {
        const a = avail[i];
        const out: string[] = [];
        if (a.total < s.count) out.push(`“${s.title}” needs ${s.count} questions but only ${a.total} are live`);
        for (const d of ['easy', 'medium', 'hard'] as const) if ((s[d] ?? 0) > a[d]) out.push(`“${s.title}” asks for ${s[d]} ${d} but has ${a[d]}`);
        return out;
      });
      if (short.length) throw new BadRequestException(`Not enough questions yet: ${short.join('; ')}.`);
    } else {
      if (!e.questionIds.length) throw new BadRequestException('Add questions to the paper first.');
      const live = await this.prisma.questionBank.count({ where: { id: { in: e.questionIds }, status: QuestionStatus.LIVE } });
      if (live !== e.questionIds.length) throw new BadRequestException(`${e.questionIds.length - live} of the paper’s questions aren’t live yet. Get them approved first.`);
    }
  }

  async list(u: UserProfile, kind?: ExamKind) {
    const exams = await this.prisma.mockExam.findMany({
      where: { ...(u.role === 'ADMIN' ? {} : { createdById: u.id }), ...(kind ? { kind } : {}), status: { not: ExamStatus.ARCHIVED } },
      orderBy: { updatedAt: 'desc' },
    });
    const ids = exams.map(e => e.id);
    const [attempts, toMark] = await Promise.all([
      this.prisma.testSession.groupBy({ by: ['mockExamId'], where: { mockExamId: { in: ids }, status: TestStatus.SUBMITTED }, _count: true }),
      this.markingQueue(u),
    ]);
    return {
      toMark: toMark.length,
      exams: exams.map(e => ({
        id: e.id, kind: e.kind, title: e.title, status: e.status, timeLimitSecs: e.timeLimitSecs, passMark: e.passMark, attemptsAllowed: e.attemptsAllowed,
        randomised: e.randomised, questionCount: e.kind === ExamKind.CAT ? e.catMax ?? 0 : e.randomised ? ((e.sections ?? []) as unknown as Section[]).reduce((n, s) => n + s.count, 0) : e.questionIds.length,
        catMin: e.catMin, catMax: e.catMax,
        examBody: e.examBody, year: e.year, session: e.session, paperNumber: e.paperNumber,
        attempts: attempts.find(a => a.mockExamId === e.id)?._count ?? 0, toMark: toMark.filter(t => t.examId === e.id).length, updatedAt: e.updatedAt,
      })),
    };
  }

  async get(u: UserProfile, id: string) {
    const e = await this.mine(u, id);
    const questions = e.questionIds.length
      ? await this.prisma.questionBank.findMany({ where: { id: { in: e.questionIds } }, select: { id: true, questionText: true, type: true, difficulty: true, status: true, points: true, courseId: true } })
      : [];
    const by = new Map(questions.map(q => [q.id, q]));
    return {
      ...e, timeMinutes: Math.round(e.timeLimitSecs / 60),
      availability: e.randomised ? await this.availability((e.sections ?? []) as unknown as Section[]) : null,
      questions: e.questionIds.map(qid => by.get(qid)).filter(Boolean),
    };
  }

  async create(u: UserProfile, dto: ExamInput) {
    const data = await this.clean(u, dto);
    return this.prisma.mockExam.create({ data: { ...data, createdById: u.id } });
  }

  async update(u: UserProfile, id: string, dto: ExamInput) {
    const e = await this.mine(u, id);
    const data = await this.clean(u, dto, e);
    if (e.status === ExamStatus.PUBLISHED) await this.assertReady({ kind: data.kind, randomised: data.randomised, sections: data.sections as Prisma.JsonValue, questionIds: data.questionIds, catMax: data.catMax });
    return this.prisma.mockExam.update({ where: { id }, data });
  }

  async setStatus(u: UserProfile, id: string, status: ExamStatus) {
    const e = await this.mine(u, id);
    if (status === ExamStatus.PUBLISHED) await this.assertReady(e);
    return this.prisma.mockExam.update({ where: { id }, data: { status } });
  }

  async remove(u: UserProfile, id: string) {
    const e = await this.mine(u, id);
    // Keep students' results: an exam that's been taken is archived instead
    if (await this.prisma.testSession.count({ where: { mockExamId: id } })) {
      await this.prisma.mockExam.update({ where: { id }, data: { status: ExamStatus.ARCHIVED } });
      return { archived: true };
    }
    await this.prisma.mockExam.delete({ where: { id: e.id } });
    return { deleted: true };
  }

  /** Written answers in finished mock attempts that still need a teacher's mark */
  async markingQueue(u: UserProfile) {
    const exams = await this.prisma.mockExam.findMany({ where: { kind: ExamKind.MOCK, ...(u.role === 'ADMIN' ? {} : { createdById: u.id }) }, select: { id: true, title: true } });
    if (!exams.length) return [];
    const sessions = await this.prisma.testSession.findMany({
      where: { mockExamId: { in: exams.map(e => e.id) }, status: TestStatus.SUBMITTED, answers: { some: { score: null } } },
      orderBy: { submittedAt: 'asc' },
      select: { id: true, mockExamId: true, submittedAt: true, student: { select: { firstName: true, lastName: true, email: true } }, _count: { select: { answers: { where: { score: null } } } } },
    });
    const title = new Map(exams.map(e => [e.id, e.title]));
    return sessions.map(s => ({
      sessionId: s.id, examId: s.mockExamId!, examTitle: title.get(s.mockExamId!) ?? '', submittedAt: s.submittedAt,
      student: [s.student.firstName, s.student.lastName].filter(Boolean).join(' ') || s.student.email, toMark: s._count.answers,
    }));
  }

  private async markable(u: UserProfile, sessionId: string) {
    const s = await this.prisma.testSession.findUnique({ where: { id: sessionId }, include: { mockExam: true, student: { select: { firstName: true, lastName: true, email: true } } } });
    if (!s?.mockExam) throw new NotFoundException('Attempt not found');
    if (u.role !== 'ADMIN' && s.mockExam.createdById !== u.id) throw new ForbiddenException('Not your exam');
    if (s.status !== TestStatus.SUBMITTED) throw new BadRequestException('The student hasn’t finished yet.');
    return s;
  }

  async attemptForMarking(u: UserProfile, sessionId: string) {
    const s = await this.markable(u, sessionId);
    const [questions, answers] = await Promise.all([
      this.prisma.questionBank.findMany({ where: { id: { in: s.questionIds } } }),
      this.prisma.testAnswer.findMany({ where: { sessionId } }),
    ]);
    const qBy = new Map(questions.map(q => [q.id, q]));
    const aBy = new Map(answers.map(a => [a.questionId, a]));
    return {
      sessionId, exam: { id: s.mockExam!.id, title: s.mockExam!.title, passMark: s.mockExam!.passMark },
      student: [s.student.firstName, s.student.lastName].filter(Boolean).join(' ') || s.student.email,
      score: s.score, maxScore: s.maxScore, submittedAt: s.submittedAt,
      written: s.questionIds.flatMap((id, n) => {
        const q = qBy.get(id);
        if (!q || !WRITTEN.includes(q.type)) return [];
        const a = aBy.get(id);
        const parts = Array.isArray(q.parts) ? (q.parts as { label?: string; text?: string; marks?: number; markScheme?: string }[]) : [];
        const max = q.type === QuestionType.STRUCTURED ? parts.reduce((t, p) => t + (Number(p.marks) || 0), 0) || q.points : q.points;
        return [{ questionId: id, number: n + 1, type: q.type, text: q.questionText, parts, modelAnswer: q.correctAnswer || null, explanation: q.explanation, marks: max, answer: a?.answer ?? null, score: a?.score ?? null, feedback: a?.markedBy === 'TEACHER' ? a.aiFeedback : null }];
      }),
    };
  }

  async mark(u: UserProfile, sessionId: string, dto: { questionId: string; score: number; feedback?: string }) {
    const s = await this.markable(u, sessionId);
    if (!s.questionIds.includes(dto.questionId)) throw new NotFoundException('That question isn’t in this attempt');
    const q = await this.prisma.questionBank.findUnique({ where: { id: dto.questionId } });
    if (!q || !WRITTEN.includes(q.type)) throw new BadRequestException('Only written answers are marked by hand.');
    const parts = Array.isArray(q.parts) ? (q.parts as { marks?: number }[]) : [];
    const max = q.type === QuestionType.STRUCTURED ? parts.reduce((t, p) => t + (Number(p.marks) || 0), 0) || q.points : q.points;
    const score = Number(dto.score);
    if (!Number.isFinite(score) || score < 0 || score > max) throw new BadRequestException(`Give a mark from 0 to ${max}.`);
    const key = { sessionId_questionId: { sessionId, questionId: q.id } };
    await this.prisma.testAnswer.upsert({
      where: key,
      create: { sessionId, questionId: q.id, score, isCorrect: score >= max / 2, markedBy: 'TEACHER', aiFeedback: (dto.feedback ?? '').trim().slice(0, 1500) || null },
      update: { score, isCorrect: score >= max / 2, markedBy: 'TEACHER', aiFeedback: (dto.feedback ?? '').trim().slice(0, 1500) || null },
    });
    const { _sum } = await this.prisma.testAnswer.aggregate({ where: { sessionId }, _sum: { score: true } });
    await this.prisma.testSession.update({ where: { id: sessionId }, data: { score: _sum.score ?? 0 } });
    const left = await this.prisma.testAnswer.count({ where: { sessionId, score: null } });
    return { score, left };
  }

  // ── Students ─────────────────────────────────────────────
  async canTake(studentId: string, e: { courseIds: string[]; packageIds: string[] }, courses?: string[], packages?: string[]) {
    courses ??= await this.tests.accessibleCourseIds(studentId);
    packages ??= (await this.prisma.packagePurchase.findMany({ where: { studentId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { packageId: true } })).map(p => p.packageId);
    return e.courseIds.some(c => courses!.includes(c)) || e.packageIds.some(p => packages!.includes(p));
  }

  async forStudent(studentId: string, kind: ExamKind) {
    const [courses, packages] = await Promise.all([
      this.tests.accessibleCourseIds(studentId),
      this.prisma.packagePurchase.findMany({ where: { studentId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { packageId: true } }).then(r => r.map(p => p.packageId)),
    ]);
    const exams = await this.prisma.mockExam.findMany({ where: { kind, status: ExamStatus.PUBLISHED }, orderBy: kind === ExamKind.PAST_PAPER ? [{ examBody: 'asc' }, { year: 'desc' }, { paperNumber: 'asc' }] : { updatedAt: 'desc' } });
    const programmes = await this.prisma.programme.findMany({ where: { id: { in: exams.map(e => e.programmeId).filter((x): x is string => !!x) } }, select: { id: true, name: true, shortName: true } });
    const mine = await this.prisma.testSession.findMany({
      where: { studentId, mockExamId: { in: exams.map(e => e.id) } }, orderBy: { startedAt: 'desc' },
      select: { id: true, mockExamId: true, mode: true, status: true, score: true, maxScore: true, expiresAt: true, cat: true },
    });
    return Promise.all(exams.map(async e => {
      const open = await this.canTake(studentId, e, courses, packages);
      const tries = mine.filter(m => m.mockExamId === e.id);
      const exams = tries.filter(t => (t.mode === TestMode.EXAM || t.mode === TestMode.CAT) && t.status === TestStatus.SUBMITTED);
      const best = exams.reduce<number | null>((b, t) => { const p = t.maxScore ? Math.round(((t.score ?? 0) / t.maxScore) * 100) : 0; return b == null || p > b ? p : b; }, null);
      const running = tries.find(t => t.status === TestStatus.IN_PROGRESS && (!t.expiresAt || t.expiresAt.getTime() > Date.now()));
      const used = tries.filter(t => t.mode === TestMode.EXAM || t.mode === TestMode.CAT).length;
      const lastCat = e.kind === ExamKind.CAT ? ((exams[0]?.cat as { result?: { band: string; decision: string } } | null)?.result ?? null) : null;
      const pr = programmes.find(p => p.id === e.programmeId);
      return {
        id: e.id, kind: e.kind, title: e.title, description: e.description, programme: pr ? pr.shortName ?? pr.name : null,
        minutes: Math.round(e.timeLimitSecs / 60), passMark: e.passMark,
        questions: e.kind === ExamKind.CAT ? e.catMax ?? 0 : e.randomised ? ((e.sections ?? []) as unknown as Section[]).reduce((n, s) => n + s.count, 0) : e.questionIds.length,
        catMin: e.catMin, lastBand: lastCat?.band ?? null, lastDecision: lastCat?.decision ?? null,
        examBody: e.examBody, year: e.year, session: e.session, paperNumber: e.paperNumber,
        open, attemptsAllowed: e.attemptsAllowed, attemptsUsed: used, attemptsLeft: e.attemptsAllowed ? Math.max(e.attemptsAllowed - used, 0) : null,
        best, passed: best != null ? best >= e.passMark : null, inProgress: running?.id ?? null, lastResult: exams[0]?.id ?? null,
      };
    }));
  }

  async start(studentId: string, examId: string, dto: { practice?: boolean }) {
    const e = await this.prisma.mockExam.findUnique({ where: { id: examId } });
    if (!e || e.status !== ExamStatus.PUBLISHED) throw new NotFoundException('This exam isn’t available.');
    if (e.kind === ExamKind.CAT) throw new BadRequestException('Adaptive tests start from the CAT readiness page.');
    if (!(await this.canTake(studentId, e))) throw new ForbiddenException('Buy one of the courses or packages this exam belongs to first.');
    // Practice is for past papers; a mock exam is always sat as an exam
    const mode = dto.practice && e.kind === ExamKind.PAST_PAPER ? TestMode.PRACTICE : TestMode.EXAM;
    const running = await this.prisma.testSession.findFirst({ where: { studentId, mockExamId: e.id, status: TestStatus.IN_PROGRESS, mode } });
    if (running && (!running.expiresAt || running.expiresAt.getTime() > Date.now())) return { id: running.id, resumed: true };
    if (mode === TestMode.EXAM && e.attemptsAllowed) {
      const used = await this.prisma.testSession.count({ where: { studentId, mockExamId: e.id, mode: TestMode.EXAM } });
      if (used >= e.attemptsAllowed) throw new BadRequestException(`You’ve used all ${e.attemptsAllowed} attempts at this exam.`);
    }

    let ids: string[];
    if (e.randomised) {
      ids = [];
      for (const sec of (e.sections ?? []) as unknown as Section[]) {
        const pool = shuffled(await this.pool(sec)).filter(q => !ids.includes(q.id));
        const take: string[] = [];
        for (const d of ['EASY', 'MEDIUM', 'HARD'] as const) {
          const want = sec[d.toLowerCase() as 'easy' | 'medium' | 'hard'] ?? 0;
          take.push(...pool.filter(q => q.difficulty === d).slice(0, want).map(q => q.id));
        }
        // The rest of the section: any difficulty
        take.push(...pool.filter(q => !take.includes(q.id)).slice(0, Math.max(sec.count - take.length, 0)).map(q => q.id));
        ids.push(...shuffled(take));
      }
    } else {
      const live = new Set((await this.prisma.questionBank.findMany({ where: { id: { in: e.questionIds }, status: QuestionStatus.LIVE }, select: { id: true } })).map(q => q.id));
      ids = e.questionIds.filter(id => live.has(id));
    }
    if (!ids.length) throw new BadRequestException('This exam has no questions ready yet. Tell your teacher.');
    const label = e.kind === ExamKind.PAST_PAPER ? [e.examBody, e.year, e.session, e.paperNumber && `Paper ${e.paperNumber}`].filter(Boolean).join(' ') : '';
    return this.tests.createSession(studentId, {
      mode, title: label ? `${e.title} (${label})` : e.title, ids, mockExamId: e.id,
      limitSecs: mode === TestMode.EXAM ? e.timeLimitSecs : null,
    });
  }
}
