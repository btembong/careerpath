import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;
/** Days kept free before the exam for past papers */
const REVISION_DAYS = 4;
const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, ' ');

type Question = { id: string; type: string; questionText: string; options: unknown; correctAnswer: string; explanation: string | null; points: number; lessonId: string | null };

/** Student quiz history and the roadmap to their exam */
@Injectable()
export class StudentProgressService {
  constructor(private prisma: PrismaService) {}

  private isRight(q: Question, given: unknown) {
    if (given == null || given === '') return false;
    if (q.type === 'SHORT_ANSWER') return q.correctAnswer.split('|').map(norm).includes(norm(String(given)));
    return String(given) === q.correctAnswer;
  }
  private optionText(q: Question, id: unknown) {
    if (id == null) return null;
    return Array.isArray(q.options) ? ((q.options as any[]).find(o => o?.id === id)?.text ?? String(id)) : String(id);
  }

  // ── Quiz history ─────────────────────────────────────────

  async quizHistory(studentId: string) {
    const attempts = await this.prisma.quizAttempt.findMany({ where: { studentId }, orderBy: { submittedAt: 'desc' } });
    const lessonIds = [...new Set(attempts.map(a => a.lessonId).filter((x): x is string => !!x))];
    const courseIds = [...new Set(attempts.map(a => a.courseId))];
    const [lessons, courses, questions] = await Promise.all([
      this.prisma.lesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true, passMark: true, maxAttempts: true, module: { select: { title: true, sortOrder: true, courseId: true } } } }),
      this.prisma.platformCourse.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true, modules: { select: { id: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } } } }),
      this.prisma.questionBank.findMany({ where: { OR: [{ lessonId: { in: lessonIds } }, { courseId: { in: courseIds }, lessonId: null, bankOnly: false }] } }),
    ]);
    const lessonBy = new Map(lessons.map(l => [l.id, l]));
    const courseBy = new Map(courses.map(c => [c.id, c]));

    // Attempt number per quiz, oldest first
    const seq = new Map<string, number>();
    const numbered = new Map<string, number>();
    for (const a of [...attempts].reverse()) {
      const k = a.lessonId ?? `course:${a.courseId}`;
      seq.set(k, (seq.get(k) ?? 0) + 1);
      numbered.set(a.id, seq.get(k)!);
    }

    const rows = attempts.map(a => {
      const l = a.lessonId ? lessonBy.get(a.lessonId) : null;
      const c = courseBy.get(a.courseId);
      const moduleNo = l && c ? c.modules.findIndex(m => m.sortOrder === l.module.sortOrder) + 1 : 0;
      const state = !a.isFullyGraded ? 'marking' : a.passed ? 'passed' : 'notyet';
      return {
        id: a.id, title: l?.title ?? 'Course quiz', course: c?.title ?? 'Course', courseId: a.courseId, lessonId: a.lessonId,
        module: l ? `Module ${moduleNo || '?'}` : null,
        submittedAt: a.submittedAt, timeTakenSecs: a.timeTakenSecs,
        pct: a.isFullyGraded && a.maxScore ? Math.round((a.finalScore / a.maxScore) * 100) : null,
        score: a.finalScore, maxScore: a.maxScore, state,
        attemptNo: numbered.get(a.id), maxAttempts: l?.maxAttempts || null, passMark: l?.passMark ?? null,
      };
    });

    // Questions missed most often (auto-marked ones)
    const qBy = new Map(questions.map(q => [q.id, q as Question]));
    const misses = new Map<string, number>();
    for (const a of attempts) {
      const answers = (a.answersJson ?? {}) as Record<string, unknown>;
      for (const q of questions) {
        if (q.type === 'WRITTEN') continue;
        if ((a.lessonId ? q.lessonId !== a.lessonId : q.courseId !== a.courseId || q.lessonId) || !(q.id in answers)) continue;
        if (!this.isRight(q as Question, answers[q.id])) misses.set(q.id, (misses.get(q.id) ?? 0) + 1);
      }
    }
    const weak = [...misses.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([id, n]) => {
      const q = qBy.get(id)!;
      const l = q.lessonId ? lessonBy.get(q.lessonId) : null;
      return { questionId: id, text: q.questionText, misses: n, courseId: l?.module.courseId ?? null, lessonId: q.lessonId };
    });

    const graded = rows.filter(r => r.pct != null);
    const weekAgo = Date.now() - 7 * DAY;
    const monthAgo = Date.now() - 30 * DAY;
    const avg = (xs: typeof rows) => xs.length ? Math.round(xs.reduce((n, r) => n + r.pct!, 0) / xs.length) : null;
    const recent = graded.filter(r => +r.submittedAt > monthAgo), before = graded.filter(r => +r.submittedAt <= monthAgo);
    return {
      stats: {
        taken: rows.length, thisWeek: rows.filter(r => +r.submittedAt > weekAgo).length,
        average: avg(graded), averageChange: recent.length && before.length ? avg(recent)! - avg(before)! : null,
        passed: rows.filter(r => r.state === 'passed').length, marking: rows.filter(r => r.state === 'marking').length,
      },
      attempts: rows,
      weak,
      trend: graded.slice(0, 8).reverse().map(r => r.pct!),
    };
  }

  async quizAttempt(studentId: string, attemptId: string) {
    const a = await this.prisma.quizAttempt.findUnique({ where: { id: attemptId } });
    if (!a) throw new NotFoundException('Quiz attempt not found');
    if (a.studentId !== studentId) throw new ForbiddenException('Not your attempt');
    const [questions, lesson, course] = await Promise.all([
      this.prisma.questionBank.findMany({ where: a.lessonId ? { lessonId: a.lessonId } : { courseId: a.courseId, lessonId: null, bankOnly: false }, orderBy: { sortOrder: 'asc' } }),
      a.lessonId ? this.prisma.lesson.findUnique({ where: { id: a.lessonId }, select: { title: true, passMark: true } }) : null,
      this.prisma.platformCourse.findUnique({ where: { id: a.courseId }, select: { title: true } }),
    ]);
    const answers = (a.answersJson ?? {}) as Record<string, unknown>;
    return {
      id: a.id, title: lesson?.title ?? 'Course quiz', course: course?.title ?? 'Course', courseId: a.courseId, lessonId: a.lessonId,
      submittedAt: a.submittedAt, state: !a.isFullyGraded ? 'marking' : a.passed ? 'passed' : 'notyet',
      score: a.finalScore, maxScore: a.maxScore, pct: a.isFullyGraded && a.maxScore ? Math.round((a.finalScore / a.maxScore) * 100) : null,
      passMark: lesson?.passMark ?? null, feedback: a.feedback, writtenMarks: a.isFullyGraded ? a.manualScore : null,
      questions: questions.map(q => {
        const given = answers[q.id];
        const written = q.type === 'WRITTEN';
        return {
          id: q.id, type: q.type, text: q.questionText, points: q.points,
          yourAnswer: q.type === 'MCQ' ? this.optionText(q as Question, given) : (given == null ? null : String(given)),
          // Answers are only shown once the attempt is marked
          correctAnswer: written || !a.isFullyGraded ? null : q.type === 'MCQ' ? this.optionText(q as Question, q.correctAnswer) : q.correctAnswer.split('|')[0],
          isCorrect: written ? null : this.isRight(q as Question, given),
          explanation: a.isFullyGraded ? q.explanation : null,
        };
      }),
    };
  }

  // ── Roadmap ──────────────────────────────────────────────

  async roadmap(studentId: string, packageId?: string) {
    const now = new Date();
    const purchases = await this.prisma.packagePurchase.findMany({
      where: { studentId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      include: { package: { include: { cohort: { select: { id: true, name: true, examDate: true, sittingLabel: true, startDate: true } } } } },
      orderBy: { purchasedAt: 'asc' },
    });
    const programmes = purchases.map(p => ({ id: p.package.id, name: p.package.name }));
    const pick = purchases.find(p => p.package.id === packageId) ?? purchases.find(p => p.package.cohort?.examDate) ?? purchases[0];
    if (!pick) return { programmes, programme: null };
    const pkg = pick.package;
    const cohort = pkg.cohort;

    const courses = await this.prisma.platformCourse.findMany({
      where: { id: { in: pkg.courseIds } },
      select: { id: true, title: true, modules: { orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, lessons: { orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, type: true } } } } },
    });
    courses.sort((a, b) => pkg.courseIds.indexOf(a.id) - pkg.courseIds.indexOf(b.id));
    const allLessons = courses.flatMap(c => c.modules.flatMap(m => m.lessons));
    const [progress, attempts] = await Promise.all([
      this.prisma.lessonProgress.findMany({ where: { studentId, lessonId: { in: allLessons.map(l => l.id) } }, select: { lessonId: true, completed: true, updatedAt: true } }),
      this.prisma.quizAttempt.findMany({ where: { studentId, lessonId: { in: allLessons.filter(l => l.type === 'QUIZ').map(l => l.id) } }, select: { lessonId: true, finalScore: true, maxScore: true, isFullyGraded: true, submittedAt: true } }),
    ]);
    const done = new Map(progress.filter(p => p.completed).map(p => [p.lessonId, p.updatedAt]));
    const bestPct = (lessonId: string) => {
      const xs = attempts.filter(a => a.lessonId === lessonId && a.isFullyGraded && a.maxScore).map(a => Math.round((a.finalScore / a.maxScore) * 100));
      return xs.length ? Math.max(...xs) : null;
    };

    const exam = cohort?.examDate ?? null;
    const revisionStart = exam ? new Date(exam.getTime() - REVISION_DAYS * DAY) : null;

    type Step = { kind: 'module' | 'live' | 'revision' | 'exam'; course: string; courseId?: string; title: string; detail: string; state: 'done' | 'now' | 'next' | 'later'; date: Date | null; doneAt?: Date | null; lessonId?: string | null };
    const modules: Step[] = [];
    for (const c of courses) {
      c.modules.forEach((m, mi) => {
        const content = m.lessons.filter(l => l.type !== 'QUIZ');
        const quizzes = m.lessons.filter(l => l.type === 'QUIZ');
        const doneCount = content.filter(l => done.has(l.id)).length;
        const allDone = m.lessons.length > 0 && m.lessons.every(l => done.has(l.id));
        const quizPct = quizzes.map(q => bestPct(q.id)).filter((x): x is number => x != null);
        const parts = [`${doneCount} of ${content.length} lesson${content.length === 1 ? '' : 's'}`];
        if (quizzes.length) parts.push(quizPct.length ? `quiz ${Math.max(...quizPct)}%` : quizzes.length === 1 ? 'quiz' : `${quizzes.length} quizzes`);
        const doneDates = m.lessons.map(l => done.get(l.id)).filter((d): d is Date => !!d);
        modules.push({
          kind: 'module', course: courses.length > 1 || c.modules.length > 1 ? `${c.title} · Module ${mi + 1}` : c.title, courseId: c.id, title: m.title,
          detail: parts.join(' · '), state: allDone ? 'done' : 'later', date: null,
          doneAt: allDone && doneDates.length ? new Date(Math.max(...doneDates.map(d => +d))) : null,
          lessonId: m.lessons.find(l => !done.has(l.id))?.id ?? m.lessons[0]?.id ?? null,
        });
      });
    }
    // The first unfinished module is "now", the one after "next"; aim dates spread evenly up to revision
    const open = modules.filter(s => s.state !== 'done');
    if (open[0]) open[0].state = 'now';
    if (open[1]) open[1].state = 'next';
    if (revisionStart && revisionStart > now && open.length) {
      const span = (+revisionStart - +now) / open.length;
      open.forEach((s, i) => { s.date = new Date(+now + span * (i + 1)); });
    }

    const live = cohort ? await this.prisma.liveClass.findMany({
      where: { cohortId: cohort.id, scheduledAt: { gt: now }, status: { not: 'CANCELLED' } },
      orderBy: { scheduledAt: 'asc' }, take: 2, select: { id: true, title: true, scheduledAt: true, durationMins: true },
    }) : [];
    const ahead: Step[] = [
      ...open,
      ...live.map(l => ({ kind: 'live' as const, course: 'Live class', title: l.title, detail: `With your teacher · ${l.durationMins} minutes`, state: 'later' as const, date: l.scheduledAt })),
    ].sort((a, b) => (a.date ? +a.date : Infinity) - (b.date ? +b.date : Infinity));
    const steps: Step[] = [
      ...modules.filter(s => s.state === 'done').map(s => ({ ...s, date: s.doneAt ?? null })),
      ...ahead,
      ...(exam ? [
        { kind: 'revision' as const, course: 'Revision', title: 'Past papers and weak topics', detail: 'Your most-missed questions and timed papers', state: 'later' as const, date: revisionStart },
        { kind: 'exam' as const, course: 'Exam', title: cohort?.sittingLabel ?? pkg.name, detail: courses.map(c => c.title).join(', '), state: 'later' as const, date: exam },
      ] : []),
    ];

    // Pace: how far through you are against how far through the time you are
    const lessonsTotal = allLessons.length;
    const lessonsDone = allLessons.filter(l => done.has(l.id)).length;
    const start = cohort?.startDate ?? pick.purchasedAt;
    const expectedPct = revisionStart && revisionStart > start
      ? Math.max(0, Math.min(100, Math.round(((+now - +start) / (+revisionStart - +start)) * 100))) : null;
    const donePct = lessonsTotal ? Math.round((lessonsDone / lessonsTotal) * 100) : 0;
    const daysLeft = exam ? Math.ceil((+exam - +now) / DAY) : null;
    const studyDaysLeft = revisionStart ? Math.max(0, Math.ceil((+revisionStart - +now) / DAY)) : null;
    const quizzesLeft = allLessons.filter(l => l.type === 'QUIZ' && !done.has(l.id)).length;
    const lessonsLeft = allLessons.filter(l => l.type !== 'QUIZ' && !done.has(l.id)).length;
    // Behind by: the lessons you'd have done at the expected pace, in days at that pace
    const perDay = expectedPct != null && revisionStart && +revisionStart > +start ? lessonsTotal / ((+revisionStart - +start) / DAY) : null;
    const behindDays = expectedPct != null && perDay ? Math.round(((expectedPct - donePct) / 100) * lessonsTotal / perDay) : null;

    // This week: study time, live classes and deadlines
    const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const sunday = new Date(+monday + 7 * DAY);
    const [blocks, assignments] = await Promise.all([
      this.prisma.studyBlock.findMany({ where: { studentId, startsAt: { gte: monday, lt: sunday } }, orderBy: { startsAt: 'asc' } }),
      cohort ? this.prisma.assignment.findMany({ where: { cohortId: cohort.id, dueDate: { gte: monday, lt: sunday } }, select: { title: true, dueDate: true, submissions: { where: { studentId }, select: { id: true } } } }) : [],
    ]);
    const weekLive = cohort ? await this.prisma.liveClass.findMany({ where: { cohortId: cohort.id, scheduledAt: { gte: monday, lt: sunday }, status: { not: 'CANCELLED' } }, select: { title: true, scheduledAt: true, status: true } }) : [];
    const week = [
      ...blocks.map(b => ({ kind: 'study', title: b.topic, at: b.startsAt, done: b.done })),
      ...weekLive.map(l => ({ kind: 'live', title: `Live class: ${l.title}`, at: l.scheduledAt, done: l.scheduledAt < now })),
      ...assignments.map(a => ({ kind: 'assignment', title: a.title, at: a.dueDate, done: a.submissions.length > 0 })),
    ].sort((a, b) => +a.at - +b.at);

    return {
      programmes,
      programme: {
        id: pkg.id, name: pkg.name,
        exam: exam ? { date: exam, label: cohort?.sittingLabel ?? null, cohort: cohort?.name ?? null, courses: courses.map(c => c.title) } : null,
        pace: { daysLeft, studyDaysLeft, donePct, expectedPct, behindDays, lessonsLeft, quizzesLeft, lessonsDone, lessonsTotal,
          perDayNeeded: studyDaysLeft ? Math.ceil((lessonsLeft + quizzesLeft) / Math.max(1, studyDaysLeft)) : null },
        steps: steps.map(s => ({ kind: s.kind, course: s.course, courseId: s.courseId ?? null, lessonId: s.lessonId ?? null, title: s.title, detail: s.detail, state: s.state, date: s.date })),
        week,
      },
    };
  }
}
