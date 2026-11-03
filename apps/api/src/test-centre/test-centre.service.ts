import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { CourseSource, Prisma, QuestionDifficulty, QuestionStatus, QuestionType, TestMode, TestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const AUTO_MARKED: QuestionType[] = [QuestionType.MCQ, QuestionType.TRUE_FALSE, QuestionType.FILL_BLANK, QuestionType.MATCHING];
const OFFERED: QuestionType[] = [...AUTO_MARKED, QuestionType.SHORT_ANSWER, QuestionType.WRITTEN, QuestionType.STRUCTURED];

type Pair = { id: string; text: string; match: string };
const pairsOf = (q: { options: Prisma.JsonValue }): Pair[] => (Array.isArray(q.options) ? (q.options as unknown as Pair[]) : []);
/** The same order every time for a question, so a reload doesn't reshuffle the answers */
function seededShuffle<T>(list: T[], seed: string): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    const j = Math.abs(h) % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
const MAX_QUESTIONS = 150;
const MASTERED_STREAK = 3;

export type Pool = 'all' | 'unused' | 'wrong' | 'learning' | 'mastered' | 'flagged';

export interface TestFilters {
  programmeId?: string; subjectId?: string;
  courseIds?: string[]; packageIds?: string[]; moduleIds?: string[]; lessonIds?: string[];
  pool?: Pool; difficulty?: QuestionDifficulty[]; types?: QuestionType[];
}

export interface StartTest extends TestFilters {
  mode?: TestMode; count?: number; timeMinutes?: number | null; title?: string;
  /** surprise: random practice · warmup: weakest first · retake: what was wrong in fromSessionId */
  preset?: 'surprise' | 'warmup' | 'retake';
  fromSessionId?: string;
}

type Part = { label?: string; text?: string; marks?: number; markScheme?: string };

const parts = (q: { parts: Prisma.JsonValue }): Part[] => (Array.isArray(q.parts) ? (q.parts as unknown as Part[]) : []);
const maxMarks = (q: { type: QuestionType; points: number; parts: Prisma.JsonValue }) =>
  q.type === QuestionType.STRUCTURED ? parts(q).reduce((n, p) => n + (Number(p.marks) || 0), 0) || q.points : q.points;
const same = (a: unknown, b: string) => String(a ?? '').trim().toLowerCase() === b.trim().toLowerCase();
const blank = (a: unknown) => a == null || a === '' || (typeof a === 'object' && Object.values(a as object).every(v => !String(v ?? '').trim()));

function shuffled<T>(list: T[]): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

@Injectable()
export class TestCentreService {
  /** Set by CatService: decides and closes an adaptive test that's ended here (submitted or out of time) */
  catFinish?: (sessionId: string, reason: 'TIME' | 'ENDED') => Promise<unknown>;

  constructor(private prisma: PrismaService) {}

  /** Marking rule shared with adaptive tests */
  mark(q: { type: QuestionType; correctAnswer: string; points: number; options: Prisma.JsonValue }, answer: unknown) { return this.autoMark(q, answer); }
  recordProgressFor(studentId: string, questionId: string, correct: boolean) { return this.recordProgress(studentId, questionId, correct); }

  /** Buying a course or package unlocks its questions. Same rules as PlatformCoursesService.studentHasCourseAccess, for many courses at once. */
  async accessibleCourseIds(studentId: string): Promise<string[]> {
    const active = { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
    const [pkgs, bought, enrolled] = await Promise.all([
      this.prisma.packagePurchase.findMany({ where: { studentId, ...active }, select: { package: { select: { courseIds: true } } } }),
      this.prisma.coursePurchase.findMany({ where: { studentId, ...active }, select: { courseId: true } }),
      this.prisma.courseEnrollment.findMany({ where: { studentId }, select: { courseId: true } }),
    ]);
    const paid = new Set([...pkgs.flatMap(p => p.package.courseIds), ...bought.map(b => b.courseId)]);
    const joined = enrolled.map(e => e.courseId);
    const courses = await this.prisma.platformCourse.findMany({
      where: { id: { in: [...paid, ...joined] }, status: 'PUBLISHED' },
      select: { id: true, source: true, isSoldIndividually: true, priceAmount: true },
    });
    const joinedSet = new Set(joined);
    return courses.filter(c => {
      if (paid.has(c.id)) return true;
      const priced = c.isSoldIndividually && (c.priceAmount ?? 0) > 0;
      const joinCounts = (c.source === CourseSource.WORDPRESS && !priced) || (c.isSoldIndividually && !c.priceAmount);
      return joinCounts && joinedSet.has(c.id);
    }).map(c => c.id);
  }

  private questionWhere(courseIds: string[]): Prisma.QuestionBankWhereInput {
    return { courseId: { in: courseIds }, status: QuestionStatus.LIVE, type: { in: OFFERED } };
  }

  /** Which pool a student's record puts a question in */
  private poolOf(p?: { seen: number; correctStreak: number; lastCorrect: boolean | null; flagged: boolean }): Exclude<Pool, 'all' | 'flagged'> {
    if (!p || p.seen === 0) return 'unused';
    if (p.lastCorrect === false) return 'wrong';
    return p.correctStreak >= MASTERED_STREAK ? 'mastered' : 'learning';
  }

  async catalog(studentId: string) {
    const ids = await this.accessibleCourseIds(studentId);
    const [courses, questions, progress, packages] = await Promise.all([
      this.prisma.platformCourse.findMany({
        where: { id: { in: ids } },
        orderBy: { title: 'asc' },
        select: {
          id: true, title: true, programmeId: true, subjectId: true,
          programme: { select: { id: true, name: true, shortName: true } },
          subject: { select: { id: true, name: true } },
          modules: { orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, lessons: { orderBy: { sortOrder: 'asc' }, select: { id: true, title: true } } } },
        },
      }),
      this.prisma.questionBank.findMany({ where: this.questionWhere(ids), select: { id: true, courseId: true, lessonId: true, sourceLessonId: true, moduleId: true, type: true, difficulty: true } }),
      this.prisma.questionProgress.findMany({ where: { studentId }, select: { questionId: true, seen: true, correctStreak: true, lastCorrect: true, flagged: true } }),
      this.prisma.packagePurchase.findMany({
        where: { studentId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
        select: { package: { select: { id: true, name: true, courseIds: true } } },
      }),
    ]);

    const byLesson = new Map<string, number>();
    const byModule = new Map<string, number>();
    const byCourse = new Map<string, number>();
    const lessonModule = new Map(courses.flatMap(c => c.modules.flatMap(m => m.lessons.map(l => [l.id, m.id] as const))));
    for (const q of questions) {
      byCourse.set(q.courseId, (byCourse.get(q.courseId) ?? 0) + 1);
      const lesson = q.sourceLessonId ?? q.lessonId;
      if (lesson) byLesson.set(lesson, (byLesson.get(lesson) ?? 0) + 1);
      const mod = q.moduleId ?? (lesson ? lessonModule.get(lesson) : undefined);
      if (mod) byModule.set(mod, (byModule.get(mod) ?? 0) + 1);
    }

    const records = new Map(progress.map(p => [p.questionId, p]));
    const pools = { unused: 0, wrong: 0, learning: 0, mastered: 0, flagged: 0 };
    for (const q of questions) {
      const r = records.get(q.id);
      pools[this.poolOf(r)]++;
      if (r?.flagged) pools.flagged++;
    }
    const typeCount: Record<string, number> = {};
    const difficultyCount: Record<string, number> = {};
    for (const q of questions) {
      typeCount[q.type] = (typeCount[q.type] ?? 0) + 1;
      difficultyCount[q.difficulty] = (difficultyCount[q.difficulty] ?? 0) + 1;
    }

    const idSet = new Set(ids);
    const named = (list: ({ id: string; name: string } | null)[]) => [...new Map(list.filter((x): x is { id: string; name: string } => !!x).map(x => [x.id, x])).values()].sort((a, b) => a.name.localeCompare(b.name));
    return {
      total: questions.length, pools, typeCount, difficultyCount,
      programmes: named(courses.map(c => (c.programme ? { id: c.programme.id, name: c.programme.shortName ?? c.programme.name } : null))),
      subjects: named(courses.map(c => c.subject)),
      packages: packages.map(p => ({ id: p.package.id, name: p.package.name, courseIds: p.package.courseIds.filter(c => idSet.has(c)) })).filter(p => p.courseIds.length),
      courses: courses.map(c => ({
        id: c.id, title: c.title, programmeId: c.programmeId, subjectId: c.subjectId, count: byCourse.get(c.id) ?? 0,
        modules: c.modules.map(m => ({
          id: m.id, title: m.title, count: byModule.get(m.id) ?? 0,
          lessons: m.lessons.map(l => ({ id: l.id, title: l.title, count: byLesson.get(l.id) ?? 0 })).filter(l => l.count > 0),
        })).filter(m => m.count > 0),
      })),
    };
  }

  /** Question ids matching the filters, only ever inside what the student has access to */
  private async matches(studentId: string, f: TestFilters): Promise<string[]> {
    let ids = await this.accessibleCourseIds(studentId);
    if (f.courseIds?.length) ids = ids.filter(id => f.courseIds!.includes(id));
    if (f.packageIds?.length) {
      const pkgs = await this.prisma.package.findMany({ where: { id: { in: f.packageIds } }, select: { courseIds: true } });
      const inPkgs = new Set(pkgs.flatMap(p => p.courseIds));
      ids = ids.filter(id => inPkgs.has(id));
    }
    if (f.programmeId || f.subjectId) {
      const rows = await this.prisma.platformCourse.findMany({
        where: { id: { in: ids }, ...(f.programmeId ? { programmeId: f.programmeId } : {}), ...(f.subjectId ? { subjectId: f.subjectId } : {}) },
        select: { id: true },
      });
      ids = rows.map(r => r.id);
    }
    if (!ids.length) return [];

    const where: Prisma.QuestionBankWhereInput = this.questionWhere(ids);
    if (f.difficulty?.length) where.difficulty = { in: f.difficulty };
    if (f.types?.length) where.type = { in: f.types.filter(t => OFFERED.includes(t)) };
    if (f.moduleIds?.length || f.lessonIds?.length) {
      const inModules = f.moduleIds?.length
        ? (await this.prisma.lesson.findMany({ where: { moduleId: { in: f.moduleIds } }, select: { id: true } })).map(l => l.id)
        : [];
      const lessons = [...inModules, ...(f.lessonIds ?? [])];
      where.OR = [
        { lessonId: { in: lessons } }, { sourceLessonId: { in: lessons } },
        ...(f.moduleIds?.length ? [{ moduleId: { in: f.moduleIds } }] : []),
      ];
    }
    const questions = await this.prisma.questionBank.findMany({ where, select: { id: true } });
    const pool = f.pool ?? 'all';
    if (pool === 'all') return questions.map(q => q.id);
    const records = new Map((await this.prisma.questionProgress.findMany({ where: { studentId, questionId: { in: questions.map(q => q.id) } } })).map(p => [p.questionId, p]));
    return questions.filter(q => {
      const r = records.get(q.id);
      return pool === 'flagged' ? !!r?.flagged : this.poolOf(r) === pool;
    }).map(q => q.id);
  }

  async countMatches(studentId: string, f: TestFilters) {
    return { count: (await this.matches(studentId, f)).length };
  }

  async start(studentId: string, dto: StartTest) {
    const count = Math.min(Math.max(Math.floor(Number(dto.count) || 0) || (dto.preset === 'warmup' ? 10 : 20), 1), MAX_QUESTIONS);
    let mode = dto.mode === TestMode.EXAM ? TestMode.EXAM : TestMode.PRACTICE;
    let title = (dto.title ?? '').trim().slice(0, 120);
    let picked: string[];

    if (dto.preset === 'surprise') {
      picked = shuffled(await this.matches(studentId, {})).slice(0, count);
      title = 'Surprise mix';
    } else if (dto.preset === 'warmup') {
      // Weakest first: got wrong, then still learning, then new
      const pick = async (pool: Pool) => shuffled(await this.matches(studentId, { pool }));
      picked = [...await pick('wrong'), ...await pick('learning'), ...await pick('unused')].slice(0, count);
      title = 'Daily warm-up';
      mode = TestMode.PRACTICE;
    } else if (dto.preset === 'retake') {
      const from = await this.prisma.testSession.findFirst({ where: { id: dto.fromSessionId, studentId }, select: { title: true, answers: { where: { isCorrect: false }, select: { questionId: true } } } });
      if (!from) throw new NotFoundException('Test not found');
      const allowed = new Set(await this.matches(studentId, {}));
      picked = shuffled(from.answers.map(a => a.questionId).filter(id => allowed.has(id)));
      title = `Retake: ${from.title}`.slice(0, 120);
      mode = TestMode.PRACTICE;
    } else {
      picked = shuffled(await this.matches(studentId, dto)).slice(0, count);
    }
    if (!picked.length) throw new BadRequestException('No questions match. Try fewer filters.');

    const minutes = dto.timeMinutes === null ? null : Number(dto.timeMinutes) || null;
    const limit = mode === TestMode.EXAM
      ? Math.round((minutes ?? Math.ceil(picked.length * 1.5)) * 60)
      : minutes ? Math.round(minutes * 60) : null;
    if (limit != null && (limit < 60 || limit > 8 * 3600)) throw new BadRequestException('Time limit must be between 1 minute and 8 hours.');

    return this.createSession(studentId, {
      mode, title: title || (mode === TestMode.EXAM ? 'Exam' : 'Practice'), ids: picked, limitSecs: limit,
      filters: { programmeId: dto.programmeId, subjectId: dto.subjectId, courseIds: dto.courseIds, packageIds: dto.packageIds, moduleIds: dto.moduleIds, lessonIds: dto.lessonIds, pool: dto.pool, difficulty: dto.difficulty, types: dto.types, preset: dto.preset } as Prisma.InputJsonValue,
    });
  }

  async createSession(studentId: string, o: { mode: TestMode; title: string; ids: string[]; limitSecs: number | null; mockExamId?: string; filters?: Prisma.InputJsonValue }) {
    const questions = await this.prisma.questionBank.findMany({ where: { id: { in: o.ids } }, select: { type: true, points: true, parts: true } });
    return this.prisma.testSession.create({
      data: {
        studentId, mode: o.mode, title: o.title.slice(0, 120), questionIds: o.ids, timeLimitSecs: o.limitSecs, mockExamId: o.mockExamId,
        expiresAt: o.limitSecs ? new Date(Date.now() + o.limitSecs * 1000) : null,
        maxScore: questions.reduce((n, q) => n + maxMarks(q), 0),
        filters: o.filters,
      },
      select: { id: true },
    });
  }

  private async owned(studentId: string, id: string) {
    const s = await this.prisma.testSession.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Test not found');
    if (s.studentId !== studentId) throw new ForbiddenException('Not your test');
    return s;
  }

  /** Time ran out: finish it on the server, whatever the browser thinks */
  private async finishIfExpired<T extends { id: string; status: TestStatus; expiresAt: Date | null; studentId: string }>(s: T) {
    if (s.status === TestStatus.IN_PROGRESS && s.expiresAt && s.expiresAt.getTime() <= Date.now()) {
      await this.submit(s.studentId, s.id);
      return true;
    }
    return false;
  }

  private async examOf(s: { mockExamId: string | null }) {
    return s.mockExamId ? this.prisma.mockExam.findUnique({ where: { id: s.mockExamId }, select: { id: true, kind: true, title: true, passMark: true, showAnswers: true } }) : null;
  }

  /** What the student may see of a question. Answers stay here until practice has been answered or the exam is over. */
  private async present(sessionMode: TestMode, finished: boolean, ids: string[], sessionId: string, hideAnswers = false) {
    const [questions, answers] = await Promise.all([
      this.prisma.questionBank.findMany({ where: { id: { in: ids } } }),
      this.prisma.testAnswer.findMany({ where: { sessionId } }),
    ]);
    const lessonIds = questions.map(q => q.sourceLessonId ?? q.lessonId).filter((x): x is string => !!x);
    const [lessons, stats] = await Promise.all([
      this.prisma.lesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true } }),
      this.prisma.testAnswer.groupBy({ by: ['questionId', 'isCorrect'], where: { questionId: { in: ids }, isCorrect: { not: null } }, _count: true }),
    ]);
    const lessonBy = new Map(lessons.map(l => [l.id, l.title]));
    const qBy = new Map(questions.map(q => [q.id, q]));
    const aBy = new Map(answers.map(a => [a.questionId, a]));
    return ids.flatMap(id => {
      const q = qBy.get(id);
      if (!q) return [];
      const a = aBy.get(id);
      const answered = !!a && a.answer != null;
      const show = finished || (sessionMode === TestMode.PRACTICE && answered);
      // Some mock exams keep the answers back; the student still sees their own marks
      const full = show && !hideAnswers;
      const pairs = q.type === QuestionType.MATCHING ? pairsOf(q) : [];
      const lesson = q.sourceLessonId ?? q.lessonId;
      const total = stats.filter(s => s.questionId === id).reduce((n, s) => n + s._count, 0);
      const right = stats.find(s => s.questionId === id && s.isCorrect)?._count ?? 0;
      return [{
        id: q.id, type: q.type, text: q.questionText, imageUrl: q.imageUrl, difficulty: q.difficulty,
        options: Array.isArray(q.options) ? (q.options as { id?: string; text?: string }[]).map(o => ({ id: o.id, text: o.text })) : null,
        choices: pairs.length ? seededShuffle([...new Set(pairs.map(p => p.match))], q.id) : undefined,
        parts: parts(q).map(p => ({ label: p.label, text: p.text, marks: p.marks, ...(full ? { markScheme: p.markScheme } : {}) })),
        marks: maxMarks(q),
        answer: a?.answer ?? null, flagged: a?.flagged ?? false,
        reveal: show ? {
          isCorrect: a?.isCorrect ?? null, score: a?.score ?? null,
          correctAnswer: full && AUTO_MARKED.includes(q.type) && q.type !== QuestionType.MATCHING ? q.correctAnswer : null,
          correctPairs: full && pairs.length ? Object.fromEntries(pairs.map(p => [p.id, p.match])) : null,
          modelAnswer: full && !AUTO_MARKED.includes(q.type) ? q.correctAnswer || null : null,
          explanation: full ? q.explanation : null,
          needsSelfMark: answered && !AUTO_MARKED.includes(q.type) && a?.score == null,
          markedBy: a?.markedBy ?? null, aiFeedback: a?.aiFeedback ?? null,
          lesson: lesson && lessonBy.has(lesson) ? { id: lesson, courseId: q.courseId, title: lessonBy.get(lesson) } : null,
          percentRight: total >= 5 ? Math.round((right / total) * 100) : null,
        } : null,
      }];
    });
  }

  async session(studentId: string, id: string) {
    let s = await this.owned(studentId, id);
    if (await this.finishIfExpired(s)) s = await this.owned(studentId, id);
    const finished = s.status === TestStatus.SUBMITTED;
    const exam = await this.examOf(s);
    const questions = await this.present(s.mode, finished, s.questionIds, s.id, !!exam && !exam.showAnswers);
    return {
      id: s.id, title: s.title, mode: s.mode, status: s.status, timeLimitSecs: s.timeLimitSecs,
      remainingSecs: s.expiresAt && !finished ? Math.max(0, Math.round((s.expiresAt.getTime() - Date.now()) / 1000)) : null,
      exam: exam ? { id: exam.id, kind: exam.kind, passMark: exam.passMark, showAnswers: exam.showAnswers } : null,
      // In a teacher's mock exam the teacher marks written answers, not the student
      selfMarking: exam?.kind !== 'MOCK',
      questions: questions.map(q => (q.reveal && exam?.kind === 'MOCK' ? { ...q, reveal: { ...q.reveal, needsSelfMark: false } } : q)),
    };
  }

  private async recordProgress(studentId: string, questionId: string, correct: boolean) {
    const now = await this.prisma.questionProgress.findUnique({ where: { studentId_questionId: { studentId, questionId } }, select: { correctStreak: true } });
    await this.prisma.questionProgress.upsert({
      where: { studentId_questionId: { studentId, questionId } },
      create: { studentId, questionId, seen: 1, correctStreak: correct ? 1 : 0, lastCorrect: correct },
      update: { seen: { increment: 1 }, correctStreak: correct ? (now?.correctStreak ?? 0) + 1 : 0, lastCorrect: correct },
    });
  }

  private autoMark(q: { type: QuestionType; correctAnswer: string; points: number; options: Prisma.JsonValue }, answer: unknown) {
    if (q.type === QuestionType.MATCHING) {
      const pairs = pairsOf(q);
      const given = (answer && typeof answer === 'object' ? answer : {}) as Record<string, unknown>;
      const right = pairs.filter(p => same(given[p.id], p.match)).length;
      return { isCorrect: pairs.length > 0 && right === pairs.length, score: pairs.length ? (q.points * right) / pairs.length : 0 };
    }
    const isCorrect = same(answer, q.correctAnswer);
    return { isCorrect, score: isCorrect ? q.points : 0 };
  }

  async answer(studentId: string, id: string, dto: { questionId: string; answer?: unknown; flagged?: boolean; timeSecs?: number }) {
    const s = await this.owned(studentId, id);
    if (s.mode === TestMode.CAT) throw new BadRequestException('Adaptive tests are answered one question at a time on their own screen.');
    if (await this.finishIfExpired(s)) throw new BadRequestException('Time is up. Your test has been submitted.');
    if (s.status !== TestStatus.IN_PROGRESS) throw new BadRequestException('This test is already finished.');
    if (!s.questionIds.includes(dto.questionId)) throw new NotFoundException('That question isn’t in this test');
    const q = await this.prisma.questionBank.findUnique({ where: { id: dto.questionId } });
    if (!q) throw new NotFoundException('Question not found');

    const key = { sessionId_questionId: { sessionId: id, questionId: q.id } };
    const existing = await this.prisma.testAnswer.findUnique({ where: key });
    const time = Math.min(Math.max(Math.round(Number(dto.timeSecs) || 0), 0), 3600);
    const flag = typeof dto.flagged === 'boolean' ? dto.flagged : undefined;
    if (flag !== undefined) {
      await this.prisma.questionProgress.upsert({
        where: { studentId_questionId: { studentId, questionId: q.id } },
        create: { studentId, questionId: q.id, flagged: flag }, update: { flagged: flag },
      });
    }

    const data: Prisma.TestAnswerUncheckedUpdateInput = { ...(flag !== undefined ? { flagged: flag } : {}), timeSecs: (existing?.timeSecs ?? 0) + time };
    const giving = dto.answer !== undefined && !blank(dto.answer);
    // Practice locks once answered, otherwise you could try each option until it says right
    const locked = s.mode === TestMode.PRACTICE && existing?.answer != null;
    if (giving && !locked) {
      data.answer = dto.answer as Prisma.InputJsonValue;
      if (s.mode === TestMode.PRACTICE && AUTO_MARKED.includes(q.type)) {
        const m = this.autoMark(q, dto.answer);
        data.isCorrect = m.isCorrect; data.score = m.score;
        await this.recordProgress(studentId, q.id, m.isCorrect);
      }
    }
    await this.prisma.testAnswer.upsert({
      where: key,
      create: { sessionId: id, questionId: q.id, ...(data as Omit<Prisma.TestAnswerUncheckedCreateInput, 'sessionId' | 'questionId'>), timeSecs: time },
      update: data,
    });
    const [one] = await this.present(s.mode, false, [q.id], id);
    return one;
  }

  async selfMark(studentId: string, id: string, dto: { questionId: string; score: number }) {
    const s = await this.owned(studentId, id);
    const q = await this.prisma.questionBank.findUnique({ where: { id: dto.questionId } });
    if (!q || !s.questionIds.includes(dto.questionId)) throw new NotFoundException('That question isn’t in this test');
    if (AUTO_MARKED.includes(q.type)) throw new BadRequestException('This question is marked automatically.');
    if ((await this.examOf(s))?.kind === 'MOCK') throw new BadRequestException('Your teacher marks the written answers in this exam.');
    const key = { sessionId_questionId: { sessionId: id, questionId: q.id } };
    const a = await this.prisma.testAnswer.findUnique({ where: key });
    if (!a || a.answer == null) throw new BadRequestException('There’s no answer to mark.');
    if (s.mode === TestMode.EXAM && s.status !== TestStatus.SUBMITTED) throw new BadRequestException('Mark your answers after you submit.');
    const max = maxMarks(q);
    const score = Number(dto.score);
    if (!Number.isFinite(score) || score < 0 || score > max) throw new BadRequestException(`Give a mark from 0 to ${max}.`);
    const first = a.score == null;
    const isCorrect = score >= max / 2;
    await this.prisma.testAnswer.update({ where: key, data: { score, isCorrect, markedBy: 'SELF' } });
    if (first) await this.recordProgress(studentId, q.id, isCorrect);
    if (s.status === TestStatus.SUBMITTED) await this.resum(id);
    return { score, isCorrect };
  }

  private async resum(id: string) {
    const { _sum } = await this.prisma.testAnswer.aggregate({ where: { sessionId: id }, _sum: { score: true } });
    await this.prisma.testSession.update({ where: { id }, data: { score: _sum.score ?? 0 } });
  }

  async submit(studentId: string, id: string) {
    const s = await this.owned(studentId, id);
    if (s.status === TestStatus.SUBMITTED) return { id, status: s.status };
    if (s.mode === TestMode.CAT && this.catFinish) {
      await this.catFinish(id, s.expiresAt && s.expiresAt.getTime() <= Date.now() ? 'TIME' : 'ENDED');
      return { id, status: TestStatus.SUBMITTED };
    }
    const [questions, answers] = await Promise.all([
      this.prisma.questionBank.findMany({ where: { id: { in: s.questionIds } } }),
      this.prisma.testAnswer.findMany({ where: { sessionId: id } }),
    ]);
    const aBy = new Map(answers.map(a => [a.questionId, a]));
    for (const q of questions) {
      const a = aBy.get(q.id);
      const answered = !!a && a.answer != null;
      if (a?.score != null) continue; // already marked in practice
      if (!answered) {
        // Left blank: no marks, and it doesn't move the question out of "unused"
        await this.prisma.testAnswer.upsert({
          where: { sessionId_questionId: { sessionId: id, questionId: q.id } },
          create: { sessionId: id, questionId: q.id, isCorrect: false, score: 0 },
          update: { isCorrect: false, score: 0 },
        });
      } else if (AUTO_MARKED.includes(q.type)) {
        const m = this.autoMark(q, a!.answer);
        await this.prisma.testAnswer.update({ where: { id: a!.id }, data: m });
        await this.recordProgress(studentId, q.id, m.isCorrect);
      }
    }
    await this.prisma.testSession.update({ where: { id }, data: { status: TestStatus.SUBMITTED, submittedAt: new Date() } });
    await this.resum(id);
    return { id, status: TestStatus.SUBMITTED };
  }

  async result(studentId: string, id: string) {
    let s = await this.owned(studentId, id);
    if (await this.finishIfExpired(s)) s = await this.owned(studentId, id);
    if (s.status !== TestStatus.SUBMITTED) throw new BadRequestException('Finish the test first.');
    const answers = await this.prisma.testAnswer.findMany({
      where: { sessionId: id },
      select: { questionId: true, answer: true, isCorrect: true, score: true, flagged: true, timeSecs: true, question: { select: { type: true, points: true, parts: true, moduleId: true, lessonId: true, sourceLessonId: true, courseId: true } } },
    });
    const topics = await this.topicNames(answers.map(a => a.question));
    const groups = new Map<string, { topic: string; moduleId: string | null; score: number; max: number; time: number; n: number; right: number; pending: number }>();
    for (const a of answers) {
      const t = topics(a.question);
      const g = groups.get(t.key) ?? { topic: t.name, moduleId: t.moduleId, score: 0, max: 0, time: 0, n: 0, right: 0, pending: 0 };
      g.score += a.score ?? 0; g.max += maxMarks(a.question); g.time += a.timeSecs; g.n++;
      if (a.isCorrect) g.right++;
      if (a.score == null) g.pending++;
      groups.set(t.key, g);
    }
    const used = s.submittedAt ? Math.round((s.submittedAt.getTime() - s.startedAt.getTime()) / 1000) : 0;
    const exam = await this.examOf(s);
    const percent = s.maxScore ? Math.round(((s.score ?? 0) / s.maxScore) * 100) : 0;
    let rank: { better: number; takers: number } | null = null;
    if (exam && s.mode === TestMode.EXAM) {
      // Each student's best finished attempt at this paper
      const others = await this.prisma.testSession.findMany({ where: { mockExamId: exam.id, status: TestStatus.SUBMITTED, mode: TestMode.EXAM }, select: { studentId: true, score: true, maxScore: true } });
      const best = new Map<string, number>();
      for (const o of others) { const p = o.maxScore ? (o.score ?? 0) / o.maxScore : 0; if (p > (best.get(o.studentId) ?? -1)) best.set(o.studentId, p); }
      if (best.size >= 5) rank = { better: [...best.entries()].filter(([id, p]) => id !== studentId && p > percent / 100).length, takers: best.size };
    }
    return {
      cat: s.mode === TestMode.CAT ? ((s.cat as { result?: unknown } | null)?.result ?? null) : null,
      exam: exam ? { id: exam.id, kind: exam.kind, title: exam.title, passMark: exam.passMark, showAnswers: exam.showAnswers } : null,
      passed: exam ? percent >= exam.passMark : null,
      rank, waitingForTeacher: exam?.kind === 'MOCK' ? answers.filter(a => a.score == null).length : 0,
      id: s.id, title: s.title, mode: s.mode, startedAt: s.startedAt, submittedAt: s.submittedAt, timeLimitSecs: s.timeLimitSecs, usedSecs: used,
      score: s.score ?? 0, maxScore: s.maxScore, percent: s.maxScore ? Math.round(((s.score ?? 0) / s.maxScore) * 100) : 0,
      total: s.questionIds.length, right: answers.filter(a => a.isCorrect === true).length, wrong: answers.filter(a => a.isCorrect === false).length,
      pending: answers.filter(a => a.score == null).length, flagged: answers.filter(a => a.flagged).length,
      topics: [...groups.values()].map(g => ({ topic: g.topic, moduleId: g.moduleId, score: g.score, max: g.max, percent: g.max ? Math.round((g.score / g.max) * 100) : 0, avgSecs: g.n ? Math.round(g.time / g.n) : 0, count: g.n, right: g.right, pending: g.pending })).sort((a, b) => a.percent - b.percent),
    };
  }

  /** Names questions by module, or by course when they have none */
  private async topicNames(questions: { moduleId: string | null; lessonId: string | null; sourceLessonId: string | null; courseId: string }[]) {
    const lessonIds = [...new Set(questions.map(q => q.sourceLessonId ?? q.lessonId).filter((x): x is string => !!x))];
    const lessons = await this.prisma.lesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, moduleId: true } });
    const lessonModule = new Map(lessons.map(l => [l.id, l.moduleId]));
    const moduleIds = [...new Set([...questions.map(q => q.moduleId), ...lessons.map(l => l.moduleId)].filter((x): x is string => !!x))];
    const [modules, courses] = await Promise.all([
      this.prisma.courseModule.findMany({ where: { id: { in: moduleIds } }, select: { id: true, title: true } }),
      this.prisma.platformCourse.findMany({ where: { id: { in: [...new Set(questions.map(q => q.courseId))] } }, select: { id: true, title: true } }),
    ]);
    const moduleName = new Map(modules.map(m => [m.id, m.title]));
    const courseName = new Map(courses.map(c => [c.id, c.title]));
    return (q: { moduleId: string | null; lessonId: string | null; sourceLessonId: string | null; courseId: string }) => {
      const lesson = q.sourceLessonId ?? q.lessonId;
      const mod = q.moduleId ?? (lesson ? lessonModule.get(lesson) : undefined) ?? null;
      return mod && moduleName.has(mod)
        ? { key: mod, moduleId: mod as string | null, name: moduleName.get(mod)! }
        : { key: q.courseId, moduleId: null as string | null, name: courseName.get(q.courseId) ?? 'Other' };
    };
  }

  async history(studentId: string) {
    const rows = await this.prisma.testSession.findMany({
      where: { studentId }, orderBy: { startedAt: 'desc' }, take: 100,
      select: { id: true, title: true, mode: true, status: true, startedAt: true, submittedAt: true, score: true, maxScore: true, questionIds: true, expiresAt: true },
    });
    return rows.map(r => ({ ...r, questionCount: r.questionIds.length, questionIds: undefined, percent: r.maxScore && r.score != null ? Math.round((r.score / r.maxScore) * 100) : null }));
  }

  async overview(studentId: string) {
    const [catalog, sessions, answers] = await Promise.all([
      this.catalog(studentId),
      this.history(studentId),
      this.prisma.testAnswer.findMany({
        where: { session: { studentId }, isCorrect: { not: null }, answer: { not: Prisma.DbNull } }, // blanks aren't evidence of a weak topic
        orderBy: { session: { startedAt: 'desc' } }, take: 1000,
        select: { score: true, question: { select: { type: true, points: true, parts: true, moduleId: true, lessonId: true, sourceLessonId: true, courseId: true } } },
      }),
    ]);
    const topics = await this.topicNames(answers.map(a => a.question));
    const groups = new Map<string, { topic: string; moduleId: string | null; score: number; max: number; n: number }>();
    for (const a of answers) {
      const t = topics(a.question);
      const g = groups.get(t.key) ?? { topic: t.name, moduleId: t.moduleId, score: 0, max: 0, n: 0 };
      g.score += a.score ?? 0; g.max += maxMarks(a.question); g.n++;
      groups.set(t.key, g);
    }
    // Consecutive days with a finished test, counting back from today or yesterday
    const days = new Set(sessions.filter(s => s.submittedAt).map(s => s.submittedAt!.toISOString().slice(0, 10)));
    let streak = 0;
    const cursor = new Date();
    if (!days.has(cursor.toISOString().slice(0, 10))) cursor.setUTCDate(cursor.getUTCDate() - 1);
    while (days.has(cursor.toISOString().slice(0, 10))) { streak++; cursor.setUTCDate(cursor.getUTCDate() - 1); }

    const open = sessions.find(s => s.status === TestStatus.IN_PROGRESS && (!s.expiresAt || s.expiresAt.getTime() > Date.now()));
    return {
      total: catalog.total, pools: catalog.pools,
      courseCount: catalog.courses.filter(c => c.count > 0).length, packageCount: catalog.packages.length,
      testsTaken: sessions.filter(s => s.status === TestStatus.SUBMITTED).length, streak,
      inProgress: open ? { id: open.id, title: open.title, mode: open.mode } : null,
      topics: [...groups.values()].filter(g => g.n >= 3 && g.max > 0).map(g => ({ topic: g.topic, moduleId: g.moduleId, percent: Math.round((g.score / g.max) * 100), answered: g.n })).sort((a, b) => a.percent - b.percent).slice(0, 6),
      recent: sessions.filter(s => s.status === TestStatus.SUBMITTED).slice(0, 5),
    };
  }
}
