import { BadRequestException, Injectable } from '@nestjs/common';
import { UserProfile, WalletTxSource, WalletTxType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
const weekStart = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; };
const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : null);
const nm = (p: { name: string | null; firstName: string | null; lastName: string | null; email: string }) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
const person = { id: true, name: true, firstName: true, lastName: true, email: true, avatarUrl: true } as const;

export const SECTIONS = ['courses', 'mentorship', 'bank', 'recordings', 'quizzes'] as const;
export type Section = (typeof SECTIONS)[number];

/** The numbers at the top of the teacher's working pages: courses, mentorship, question bank and mocks, recordings, quizzes */
@Injectable()
export class TeacherWorkService {
  constructor(private prisma: PrismaService) {}

  get(t: UserProfile, section: string) {
    switch (section as Section) {
      case 'courses': return this.courses(t);
      case 'mentorship': return this.mentorship(t);
      case 'bank': return this.bank(t);
      case 'recordings': return this.recordings(t);
      case 'quizzes': return this.quizzes(t);
      default: throw new BadRequestException('Unknown section');
    }
  }

  /** What the teacher earned this month from one source, in their wallet's currency */
  private async earned(userId: string, source: WalletTxSource) {
    const wallet = await this.prisma.wallet.findFirst({ where: { userId }, select: { id: true, currency: true } });
    if (!wallet) return { amount: 0, currency: null as string | null, byCourse: {} as Record<string, number> };
    const rows = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id, type: WalletTxType.CREDIT, source, createdAt: { gte: monthStart() }, currency: wallet.currency },
      select: { amount: true, courseId: true },
    });
    const byCourse: Record<string, number> = {};
    rows.forEach(r => { if (r.courseId) byCourse[r.courseId] = (byCourse[r.courseId] ?? 0) + r.amount; });
    return { amount: rows.reduce((n, r) => n + r.amount, 0), currency: wallet.currency, byCourse };
  }

  /** Students across the teacher's courses, sales and earnings this month, and how each course is doing */
  private async courses(t: UserProfile) {
    const courses = await this.prisma.platformCourse.findMany({
      where: { teacherId: t.id, status: { not: 'ARCHIVED' } },
      select: { id: true, title: true, status: true, modules: { select: { lessons: { select: { id: true } } } } },
    });
    const ids = courses.map(c => c.id);
    const [enrolments, sales, earned, rating] = await Promise.all([
      this.prisma.courseEnrollment.findMany({ where: { courseId: { in: ids } }, select: { courseId: true, studentId: true, enrolledAt: true, completedAt: true } }),
      this.prisma.coursePurchase.findMany({ where: { courseId: { in: ids }, refundedAt: null, purchasedAt: { gte: monthStart() } }, select: { courseId: true } }),
      this.earned(t.id, WalletTxSource.COURSE_SALE),
      this.prisma.teacherReview.aggregate({ where: { teacherId: t.id }, _avg: { rating: true }, _count: true }),
    ]);
    const weekAgo = Date.now() - 7 * DAY;
    const rows = await Promise.all(courses.map(async c => {
      const lessonIds = c.modules.flatMap(m => m.lessons.map(l => l.id));
      const students = enrolments.filter(e => e.courseId === c.id).map(e => e.studentId);
      const done = lessonIds.length && students.length
        ? await this.prisma.lessonProgress.count({ where: { lessonId: { in: lessonIds }, studentId: { in: students }, completed: true } })
        : 0;
      return {
        id: c.id, title: c.title, status: c.status, students: students.length,
        avgPct: lessonIds.length && students.length ? pct(done, lessonIds.length * students.length) : null,
        salesThisMonth: sales.filter(s => s.courseId === c.id).length,
        earnedThisMonth: earned.byCourse[c.id] ?? 0,
      };
    }));
    const live = rows.filter(r => r.status === 'PUBLISHED');
    return {
      stats: {
        courses: courses.length, published: live.length,
        inReview: rows.filter(r => r.status === 'PENDING_REVIEW').length, drafts: rows.filter(r => r.status === 'DRAFT').length,
        students: new Set(enrolments.map(e => e.studentId)).size,
        newThisWeek: enrolments.filter(e => e.enrolledAt.getTime() > weekAgo).length,
        finished: enrolments.filter(e => e.completedAt).length,
        salesThisMonth: sales.length,
        earnedThisMonth: earned.amount, currency: earned.currency,
        avgPct: avg(live.filter(r => r.avgPct != null && r.students).map(r => r.avgPct!)),
        rating: rating._avg.rating != null ? Math.round(rating._avg.rating * 10) / 10 : null, ratings: rating._count,
      },
      courses: rows.sort((a, b) => b.students - a.students || a.title.localeCompare(b.title)),
    };
  }

  /** The next session and what the student wrote, free times this week, held and earned this month, and the week */
  private async mentorship(t: UserProfile) {
    const now = new Date(), wk = weekStart(), wkEnd = new Date(wk.getTime() + 7 * DAY);
    const [next, weekSlots, heldMonth, earned, rating] = await Promise.all([
      this.prisma.mentorBooking.findFirst({
        where: { slot: { teacherId: t.id, startsAt: { gte: new Date(now.getTime() - 60 * 60_000) } }, cancelledAt: null, status: { notIn: ['CANCELLED', 'MISSED', 'COMPLETED'] } },
        orderBy: { slot: { startsAt: 'asc' } },
        select: { id: true, notes: true, meetingUrl: true, slot: { select: { startsAt: true, durationMins: true } }, student: { select: person } },
      }),
      this.prisma.mentorSlot.findMany({
        where: { teacherId: t.id, startsAt: { gte: wk, lt: wkEnd } }, orderBy: { startsAt: 'asc' },
        select: { id: true, startsAt: true, durationMins: true, isBooked: true, booking: { select: { status: true, cancelledAt: true, student: { select: person } } } },
      }),
      this.prisma.mentorBooking.count({ where: { slot: { teacherId: t.id, startsAt: { gte: monthStart(), lt: now } }, cancelledAt: null, status: { notIn: ['CANCELLED', 'MISSED'] } } }),
      this.earned(t.id, WalletTxSource.MENTOR_SESSION),
      this.prisma.mentorReview.aggregate({ where: { teacherId: t.id }, _avg: { rating: true }, _count: true }),
    ]);
    const week = weekSlots.map(s => {
      const b = s.booking && !s.booking.cancelledAt && s.booking.status !== 'CANCELLED' ? s.booking : null;
      const past = s.startsAt < now;
      return {
        id: s.id, startsAt: s.startsAt, durationMins: s.durationMins,
        state: b ? (past || b.status === 'COMPLETED' ? 'held' : 'booked') : past ? 'past' : 'free',
        student: b ? nm(b.student).split(' ')[0] : null,
      };
    });
    const freeAhead = await this.prisma.mentorSlot.count({ where: { teacherId: t.id, isBooked: false, startsAt: { gte: now, lt: new Date(now.getTime() + 7 * DAY) } } });
    return {
      next: next ? { id: next.id, notes: next.notes, meetingUrl: next.meetingUrl, startsAt: next.slot.startsAt, durationMins: next.slot.durationMins, student: { id: next.student.id, name: nm(next.student), avatarUrl: next.student.avatarUrl } } : null,
      stats: {
        freeThisWeek: freeAhead, bookedThisWeek: week.filter(w => w.state === 'booked').length,
        heldThisMonth: heldMonth, earnedThisMonth: earned.amount, currency: earned.currency,
        rating: rating._avg.rating != null ? Math.round(rating._avg.rating * 10) / 10 : null, ratings: rating._count,
      },
      weekStart: wk, week,
    };
  }

  /** Questions written and waiting, mocks live and how students score, the most-missed question, questions by topic */
  private async bank(t: UserProfile) {
    const myCourses = await this.prisma.platformCourse.findMany({ where: { teacherId: t.id }, select: { id: true } });
    const mine = { OR: [{ createdById: t.id }, { courseId: { in: myCourses.map(c => c.id) } }] };
    const [questions, mocks] = await Promise.all([
      this.prisma.questionBank.findMany({ where: mine, select: { id: true, status: true, createdAt: true, tags: true, moduleId: true } }),
      this.prisma.mockExam.findMany({ where: { createdById: t.id, status: { not: 'ARCHIVED' } }, select: { id: true, title: true, status: true, passMark: true } }),
    ]);
    const sessions = mocks.length ? await this.prisma.testSession.findMany({
      where: { mockExamId: { in: mocks.map(m => m.id) }, submittedAt: { not: null } },
      select: { mockExamId: true, score: true, maxScore: true, studentId: true },
    }) : [];
    const scored = sessions.filter(s => s.score != null && s.maxScore > 0).map(s => ({ ...s, p: (s.score! / s.maxScore) * 100 }));

    // Most missed: wrong answers in tests and lesson quizzes, on questions with at least 3 answers
    const [testWrong, quizWrong] = await Promise.all([
      this.prisma.testAnswer.groupBy({ by: ['questionId'], where: { isCorrect: false, question: mine }, _count: { _all: true }, orderBy: { _count: { questionId: 'desc' } }, take: 5 }),
      this.prisma.quizAttemptAnswer.groupBy({ by: ['questionId'], where: { isCorrect: false, question: mine }, _count: { _all: true }, orderBy: { _count: { questionId: 'desc' } }, take: 5 }),
    ]);
    const wrong = new Map<string, number>();
    [...testWrong, ...quizWrong].forEach(r => wrong.set(r.questionId, (wrong.get(r.questionId) ?? 0) + r._count._all));
    let missed: { id: string; text: string; missed: number; answered: number; pct: number } | null = null;
    for (const [id, n] of [...wrong].sort((a, b) => b[1] - a[1])) {
      const [ta, qa, q] = await Promise.all([
        this.prisma.testAnswer.count({ where: { questionId: id, isCorrect: { not: null } } }),
        this.prisma.quizAttemptAnswer.count({ where: { questionId: id, isCorrect: { not: null } } }),
        this.prisma.questionBank.findUnique({ where: { id }, select: { questionText: true } }),
      ]);
      if (ta + qa >= 3 && q) { missed = { id, text: q.questionText.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(), missed: n, answered: ta + qa, pct: pct(n, ta + qa) }; break; }
    }

    // By topic: the first tag, else the module
    const modules = await this.prisma.courseModule.findMany({ where: { id: { in: [...new Set(questions.map(q => q.moduleId).filter(Boolean) as string[])] } }, select: { id: true, title: true } });
    const modTitle = new Map(modules.map(m => [m.id, m.title]));
    const topics = new Map<string, number>();
    questions.forEach(q => { const k = q.tags[0]?.trim() || (q.moduleId && modTitle.get(q.moduleId)) || 'No topic'; topics.set(k, (topics.get(k) ?? 0) + 1); });
    const byTopic = [...topics].map(([topic, n]) => ({ topic, n })).sort((a, b) => b.n - a.n);

    return {
      stats: {
        questions: questions.length, live: questions.filter(q => q.status === 'LIVE').length,
        inReview: questions.filter(q => q.status === 'IN_REVIEW').length, drafts: questions.filter(q => q.status === 'DRAFT').length,
        addedThisMonth: questions.filter(q => q.createdAt >= monthStart()).length,
        mocks: mocks.length, mocksLive: mocks.filter(m => m.status === 'PUBLISHED').length, mockDrafts: mocks.filter(m => m.status === 'DRAFT').length,
        attempts: scored.length, students: new Set(sessions.map(s => s.studentId)).size, avgPct: avg(scored.map(s => s.p)),
      },
      mocks: mocks.map(m => {
        const mine = scored.filter(s => s.mockExamId === m.id);
        return { id: m.id, title: m.title, status: m.status, attempts: mine.length, avgPct: avg(mine.map(s => s.p)), passPct: mine.length ? pct(mine.filter(s => s.p >= m.passMark).length, mine.length) : null };
      }).sort((a, b) => b.attempts - a.attempts),
      missed,
      byTopic: byTopic.length > 6 ? [...byTopic.slice(0, 5), { topic: 'Other topics', n: byTopic.slice(5).reduce((n, x) => n + x.n, 0) }] : byTopic,
    };
  }

  /** Classes recorded and watched, the most watched, and held classes still without a recording */
  private async recordings(t: UserProfile) {
    const now = Date.now();
    const classes = await this.prisma.liveClass.findMany({
      where: { cohort: { teacherId: t.id } }, orderBy: { scheduledAt: 'desc' },
      select: {
        id: true, title: true, scheduledAt: true, durationMins: true, status: true, recordingUrl: true, recordingId: true,
        cohort: { select: { id: true, name: true, _count: { select: { students: true } } } },
        views: { select: { views: true, lastAt: true } },
      },
    });
    const ended = (c: (typeof classes)[number]) => c.status === 'COMPLETED' || (c.status === 'SCHEDULED' && c.scheduledAt.getTime() + c.durationMins * 60_000 < now);
    const held = classes.filter(ended);
    const row = (c: (typeof classes)[number]) => ({
      id: c.id, title: c.title, scheduledAt: c.scheduledAt, durationMins: c.durationMins, status: c.status, recordingUrl: c.recordingUrl,
      cohort: { id: c.cohort.id, name: c.cohort.name }, rosterSize: c.cohort._count.students,
      views: c.views.reduce((n, v) => n + v.views, 0), viewers: c.views.length,
      viewersPct: c.cohort._count.students ? pct(c.views.length, c.cohort._count.students) : null,
    });
    const recorded = held.filter(c => c.recordingUrl || c.recordingId).map(row);
    // Daily recordings take a few minutes to arrive; a class counts as missing two hours after it ends
    const missing = held.filter(c => !c.recordingUrl && !c.recordingId && c.scheduledAt.getTime() + c.durationMins * 60_000 < now - 2 * 3600_000).map(row);
    const weekAgo = now - 7 * DAY;
    return {
      stats: {
        recorded: recorded.length, missing: missing.length,
        views: recorded.reduce((n, r) => n + r.views, 0),
        viewsThisWeek: classes.reduce((n, c) => n + c.views.filter(v => v.lastAt.getTime() > weekAgo).length, 0),
        avgViewersPct: avg(recorded.filter(r => r.viewersPct != null).map(r => r.viewersPct!)),
      },
      mostWatched: [...recorded].filter(r => r.views).sort((a, b) => b.views - a.views).slice(0, 3),
      missing, recorded,
    };
  }

  /** Quizzes per module and the modules without one, how students score, the hardest quiz, and rubrics */
  private async quizzes(t: UserProfile) {
    const courses = await this.prisma.platformCourse.findMany({
      where: { teacherId: t.id, status: { not: 'ARCHIVED' } }, orderBy: { title: 'asc' },
      select: { id: true, title: true, status: true, modules: { orderBy: { sortOrder: 'asc' }, select: { id: true, title: true, lessons: { select: { id: true, title: true, type: true } } } } },
    });
    const quizLessons = courses.flatMap(c => c.modules.flatMap(m => m.lessons.filter(l => l.type === 'QUIZ').map(l => ({ ...l, course: c, module: m }))));
    const ids = quizLessons.map(q => q.id);
    const [attempts, qCounts, cohorts] = await Promise.all([
      ids.length ? this.prisma.quizAttempt.findMany({ where: { lessonId: { in: ids } }, select: { lessonId: true, finalScore: true, maxScore: true, passed: true, isFullyGraded: true, submittedAt: true } }) : [],
      ids.length ? this.prisma.questionBank.groupBy({ by: ['lessonId'], where: { lessonId: { in: ids }, bankOnly: false }, _count: { _all: true } }) : [],
      this.prisma.cohort.findMany({ where: { teacherId: t.id }, select: { assignments: { select: { id: true, title: true, dueDate: true, rubric: { select: { id: true } } } } } }),
    ]);
    const qn = new Map<string, number>((qCounts as { lessonId: string | null; _count: { _all: number } }[]).map(q => [q.lessonId ?? '', q._count._all]));
    const quizzes = quizLessons.map(q => {
      const a = attempts.filter(x => x.lessonId === q.id && x.maxScore > 0);
      return {
        id: q.id, title: q.title, courseId: q.course.id, course: q.course.title, module: q.module.title,
        questions: qn.get(q.id) ?? 0, attempts: a.length,
        avgPct: avg(a.map(x => (x.finalScore / x.maxScore) * 100)), passPct: a.length ? pct(a.filter(x => x.passed).length, a.length) : null,
      };
    });
    const all = attempts.filter(a => a.maxScore > 0);
    const rated = quizzes.filter(q => q.attempts >= 3 && q.avgPct != null);
    const hardest = (rated.length ? rated : quizzes.filter(q => q.attempts && q.avgPct != null)).sort((a, b) => a.avgPct! - b.avgPct!)[0] ?? null;
    const noQuiz = courses.flatMap(c => c.modules.filter(m => m.lessons.length && !m.lessons.some(l => l.type === 'QUIZ')).map(m => ({ courseId: c.id, course: c.title, moduleId: m.id, module: m.title, lessons: m.lessons.length })));
    const assignments = cohorts.flatMap(c => c.assignments);
    return {
      stats: {
        quizzes: quizzes.length, modules: courses.reduce((n, c) => n + c.modules.length, 0), modulesWithoutQuiz: noQuiz.length,
        emptyQuizzes: quizzes.filter(q => !q.questions).length,
        attempts: all.length, attemptsThisMonth: all.filter(a => a.submittedAt >= monthStart()).length,
        avgPct: avg(all.map(a => (a.finalScore / a.maxScore) * 100)), passPct: all.length ? pct(all.filter(a => a.passed).length, all.length) : null,
        toMark: attempts.filter(a => !a.isFullyGraded).length,
        assignments: assignments.length, rubrics: assignments.filter(a => a.rubric).length,
      },
      hardest, noQuiz,
      courses: courses.map(c => ({ id: c.id, title: c.title, status: c.status, quizzes: quizzes.filter(q => q.courseId === c.id) })),
      withoutRubric: assignments.filter(a => !a.rubric).sort((a, b) => b.dueDate.getTime() - a.dueDate.getTime()).slice(0, 6).map(a => ({ id: a.id, title: a.title, dueDate: a.dueDate })),
    };
  }
}
