import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CourseOutline {
  id: string;
  title: string;
  coverUrl: string | null;
  lessonIds: string[];
  quizLessonIds: string[];
}

/** Read-only progress figures for the student dashboard, progress and profile pages. Database only (no WordPress calls). */
@Injectable()
export class StudentInsightsService {
  constructor(private prisma: PrismaService) {}

  /** Courses the student can currently open: active packages, active single-course purchases, and enrollments. */
  private async accessibleCourses(studentId: string): Promise<CourseOutline[]> {
    const now = new Date();
    const active = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
    const [pkgs, purchases, enrollments] = await Promise.all([
      this.prisma.packagePurchase.findMany({ where: { studentId, ...active }, select: { package: { select: { courseIds: true } } } }),
      this.prisma.coursePurchase.findMany({ where: { studentId, ...active }, select: { courseId: true } }),
      this.prisma.courseEnrollment.findMany({ where: { studentId }, select: { courseId: true } }),
    ]);
    const ids = [...new Set([
      ...pkgs.flatMap(p => p.package.courseIds),
      ...purchases.map(p => p.courseId),
      ...enrollments.map(e => e.courseId),
    ])];
    if (!ids.length) return [];

    const courses = await this.prisma.platformCourse.findMany({
      where: { id: { in: ids }, status: 'PUBLISHED' },
      select: {
        id: true, title: true, coverUrl: true,
        modules: { select: { lessons: { select: { id: true, type: true } } } },
      },
      orderBy: { title: 'asc' },
    });
    return courses.map(c => {
      const lessons = c.modules.flatMap(m => m.lessons);
      return {
        id: c.id,
        title: c.title,
        coverUrl: c.coverUrl,
        lessonIds: lessons.map(l => l.id),
        quizLessonIds: lessons.filter(l => l.type === 'QUIZ').map(l => l.id),
      };
    });
  }

  /** Best quiz percentage per quiz lesson (or per course when the attempt has no lesson). */
  private async bestQuizScores(studentId: string) {
    const attempts = await this.prisma.quizAttempt.findMany({
      where: { studentId, maxScore: { gt: 0 } },
      select: { courseId: true, lessonId: true, finalScore: true, maxScore: true, passed: true },
    });
    const best = new Map<string, { courseId: string; lessonId: string | null; pct: number; passed: boolean }>();
    for (const a of attempts) {
      const key = a.lessonId ?? `course:${a.courseId}`;
      const pct = Math.round((a.finalScore / a.maxScore) * 100);
      const prev = best.get(key);
      if (!prev || pct > prev.pct) best.set(key, { courseId: a.courseId, lessonId: a.lessonId, pct, passed: a.passed || !!prev?.passed });
      else if (a.passed) prev.passed = true;
    }
    return [...best.values()];
  }

  private async courseProgress(studentId: string) {
    const courses = await this.accessibleCourses(studentId);
    const allLessonIds = courses.flatMap(c => c.lessonIds);
    const [completedRows, quizzes, certs] = await Promise.all([
      allLessonIds.length
        ? this.prisma.lessonProgress.findMany({ where: { studentId, completed: true, lessonId: { in: allLessonIds } }, select: { lessonId: true } })
        : [],
      this.bestQuizScores(studentId),
      this.prisma.certificate.findMany({ where: { studentId }, select: { courseId: true } }),
    ]);
    const completed = new Set(completedRows.map(r => r.lessonId));
    const passedQuizLessons = new Set(quizzes.filter(q => q.passed && q.lessonId).map(q => q.lessonId!));
    const certified = new Set(certs.map(c => c.courseId));

    return courses.map(c => {
      const lessonsCompleted = c.lessonIds.filter(id => completed.has(id)).length;
      const totalLessons = c.lessonIds.length;
      return {
        ...c,
        lessonsCompleted,
        totalLessons,
        percentComplete: totalLessons ? Math.round((lessonsCompleted / totalLessons) * 100) : 0,
        quizzesPassed: c.quizLessonIds.filter(id => passedQuizLessons.has(id)).length,
        totalQuizzes: c.quizLessonIds.length,
        certificateEarned: certified.has(c.id),
      };
    });
  }

  // ── Endpoints ────────────────────────────────────────────

  async getStats(studentId: string) {
    const [progress, quizzes, watched, profile, certificates] = await Promise.all([
      this.courseProgress(studentId),
      this.bestQuizScores(studentId),
      this.prisma.lessonProgress.aggregate({ where: { studentId }, _sum: { watchedSecs: true } }),
      this.prisma.userProfile.findUnique({ where: { id: studentId }, select: { streak: true } }),
      this.prisma.certificate.count({ where: { studentId } }),
    ]);
    return {
      totalCourses: progress.length,
      completedCourses: progress.filter(c => c.certificateEarned || (c.totalLessons > 0 && c.lessonsCompleted === c.totalLessons)).length,
      totalLessons: progress.reduce((s, c) => s + c.totalLessons, 0),
      completedLessons: progress.reduce((s, c) => s + c.lessonsCompleted, 0),
      avgQuizScore: quizzes.length ? Math.round(quizzes.reduce((s, q) => s + q.pct, 0) / quizzes.length) : 0,
      studyHours: Math.round(((watched._sum.watchedSecs ?? 0) / 3600) * 10) / 10,
      streak: profile?.streak ?? 0,
      certificates,
    };
  }

  /** Average of the best score per quiz, grouped by course. */
  async getQuizScores(studentId: string) {
    const quizzes = await this.bestQuizScores(studentId);
    if (!quizzes.length) return [];
    const courseIds = [...new Set(quizzes.map(q => q.courseId))];
    const titles = new Map(
      (await this.prisma.platformCourse.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } }))
        .map(c => [c.id, c.title]),
    );
    return courseIds
      .map(id => {
        const scores = quizzes.filter(q => q.courseId === id).map(q => q.pct);
        return { courseId: id, courseTitle: titles.get(id) ?? 'Course', score: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) };
      })
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Study time for the last 8 weeks (oldest first). Approximate: lesson progress only stores
   * the latest update time, so each lesson's watch time counts in the week it was last touched.
   */
  async getWeeklyHours(studentId: string) {
    const WEEK = 7 * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const rows = await this.prisma.lessonProgress.findMany({
      where: { studentId, updatedAt: { gte: new Date(now - 8 * WEEK) } },
      select: { watchedSecs: true, completed: true, updatedAt: true },
    });
    return Array.from({ length: 8 }, (_, i) => {
      const end = now - (7 - i) * WEEK;
      const start = end - WEEK;
      const inWeek = rows.filter(r => r.updatedAt.getTime() > start && r.updatedAt.getTime() <= end);
      return {
        week: new Date(start).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }),
        hours: Math.round((inWeek.reduce((s, r) => s + r.watchedSecs, 0) / 3600) * 10) / 10,
        lessons: inWeek.filter(r => r.completed).length,
      };
    });
  }

  /**
   * Study activity per course per month, for the progress heatmap: lessons completed, practice sets and quizzes.
   * Watching minutes aren't recorded per day, so a square counts activities rather than time.
   */
  async getStudyActivity(studentId: string, monthsBack = 12) {
    const months = Math.min(Math.max(Math.floor(monthsBack) || 12, 3), 12);
    const now = new Date();
    const keys = Array.from({ length: months }, (_, i) => {
      const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - i), 1));
      return { key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' }) };
    });
    const since = new Date(keys[0].key + '-01T00:00:00Z');

    const [lessonsDone, practice, quizzes] = await Promise.all([
      this.prisma.xPEvent.findMany({
        where: { userId: studentId, type: 'LESSON_COMPLETE', createdAt: { gte: since } },
        select: { meta: true, createdAt: true },
      }),
      this.prisma.practiceAttempt.findMany({
        where: { studentId, createdAt: { gte: since } },
        select: { lessonId: true, createdAt: true },
      }),
      this.prisma.quizAttempt.findMany({
        where: { studentId, submittedAt: { gte: since } },
        select: { courseId: true, submittedAt: true },
      }),
    ]);

    // Lesson → course for the lesson-based records
    const lessonIds = [...new Set([
      ...lessonsDone.map(e => (e.meta as { key?: string } | null)?.key).filter((k): k is string => !!k),
      ...practice.map(p => p.lessonId),
    ])];
    const lessonCourse = new Map(
      (await this.prisma.lesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, module: { select: { courseId: true } } } }))
        .map(l => [l.id, l.module.courseId]),
    );

    type Kind = 'lessons' | 'practice' | 'quizzes';
    const grid = new Map<string, Map<string, Record<Kind, number>>>();
    const add = (courseId: string | undefined, at: Date, kind: Kind) => {
      if (!courseId) return;
      const month = at.toISOString().slice(0, 7);
      const row = grid.get(courseId) ?? new Map<string, Record<Kind, number>>();
      const cell = row.get(month) ?? { lessons: 0, practice: 0, quizzes: 0 };
      cell[kind]++;
      row.set(month, cell);
      grid.set(courseId, row);
    };
    lessonsDone.forEach(e => add(lessonCourse.get((e.meta as { key?: string } | null)?.key ?? ''), e.createdAt, 'lessons'));
    practice.forEach(p => add(lessonCourse.get(p.lessonId), p.createdAt, 'practice'));
    quizzes.forEach(q => add(q.courseId, q.submittedAt, 'quizzes'));

    const courses = await this.prisma.platformCourse.findMany({
      where: { id: { in: [...grid.keys()] } },
      select: { id: true, title: true, subject: { select: { name: true } } },
    });
    const rows = courses.map(c => {
      const row = grid.get(c.id)!;
      const cells = keys.map(k => {
        const v = row.get(k.key) ?? { lessons: 0, practice: 0, quizzes: 0 };
        return { month: k.key, ...v, total: v.lessons + v.practice + v.quizzes };
      });
      return { courseId: c.id, title: c.title, subject: c.subject?.name ?? null, total: cells.reduce((s, x) => s + x.total, 0), cells };
    }).sort((a, b) => b.total - a.total).slice(0, 8);

    return {
      months: keys,
      rows,
      max: Math.max(0, ...rows.flatMap(r => r.cells.map(c => c.total))),
    };
  }

  /** Most recently touched lesson in a course the student can still open, for "Continue learning". */
  async getLastLesson(studentId: string) {
    const progress = await this.courseProgress(studentId);
    const lessonIds = progress.flatMap(c => c.lessonIds);
    if (!lessonIds.length) return null;
    const last = await this.prisma.lessonProgress.findFirst({
      where: { studentId, lessonId: { in: lessonIds } },
      orderBy: { updatedAt: 'desc' },
      select: { lesson: { select: { id: true, title: true, module: { select: { courseId: true } } } } },
    });
    if (!last) return null;
    const course = progress.find(c => c.id === last.lesson.module.courseId);
    return {
      courseId: last.lesson.module.courseId,
      courseTitle: course?.title,
      lessonId: last.lesson.id,
      lessonTitle: last.lesson.title,
      pct: course?.percentComplete ?? 0,
      coverUrl: course?.coverUrl ?? undefined,
    };
  }

  async getCertificateProgress(studentId: string) {
    const progress = await this.courseProgress(studentId);
    return progress.map(c => ({
      courseId: c.id,
      courseTitle: c.title,
      percentComplete: c.percentComplete,
      certificateEarned: c.certificateEarned,
      lessonsCompleted: c.lessonsCompleted,
      totalLessons: c.totalLessons,
      quizzesPassed: c.quizzesPassed,
      totalQuizzes: c.totalQuizzes,
    }));
  }

  async getEnrollments(studentId: string) {
    const progress = await this.courseProgress(studentId);
    return progress.map(c => ({ id: c.id, title: c.title, progress: c.percentComplete, thumbnailUrl: c.coverUrl ?? undefined }));
  }

  /**
   * Recent achievements of classmates (students sharing a cohort). First names only — no emails —
   * because this is shown to other students.
   */
  async getActivityFeed(studentId: string, limit = 10) {
    const myCohorts = await this.prisma.cohortRoster.findMany({ where: { studentId }, select: { cohortId: true } });
    if (!myCohorts.length) return [];
    const mates = await this.prisma.cohortRoster.findMany({
      where: { cohortId: { in: myCohorts.map(c => c.cohortId) }, studentId: { not: studentId } },
      select: { student: { select: { id: true, firstName: true, name: true } } },
    });
    if (!mates.length) return [];
    const nameOf = new Map(mates.map(m => [m.student.id, m.student.firstName || m.student.name?.split(' ')[0] || 'A classmate']));
    const ids = [...nameOf.keys()];
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [lessons, quizzes, certs] = await Promise.all([
      this.prisma.lessonProgress.findMany({
        where: { studentId: { in: ids }, completed: true, updatedAt: { gte: since } },
        orderBy: { updatedAt: 'desc' }, take: limit,
        select: { studentId: true, updatedAt: true, lesson: { select: { title: true } } },
      }),
      this.prisma.quizAttempt.findMany({
        where: { studentId: { in: ids }, passed: true, submittedAt: { gte: since } },
        orderBy: { submittedAt: 'desc' }, take: limit,
        select: { studentId: true, submittedAt: true, courseId: true },
      }),
      this.prisma.certificate.findMany({
        where: { studentId: { in: ids }, issuedAt: { gte: since } },
        orderBy: { issuedAt: 'desc' }, take: limit,
        select: { studentId: true, issuedAt: true, course: { select: { title: true } } },
      }),
    ]);

    // QuizAttempt has no course relation, so resolve titles separately
    const quizCourseTitles = new Map(
      (await this.prisma.platformCourse.findMany({
        where: { id: { in: [...new Set(quizzes.map(q => q.courseId))] } },
        select: { id: true, title: true },
      })).map(c => [c.id, c.title]),
    );

    return [
      ...lessons.map(l => ({ userId: l.studentId, action: 'completed', target: l.lesson.title, at: l.updatedAt })),
      ...quizzes.map(q => ({ userId: q.studentId, action: 'passed a quiz in', target: quizCourseTitles.get(q.courseId) ?? 'a course', at: q.submittedAt })),
      ...certs.map(c => ({ userId: c.studentId, action: 'earned a certificate in', target: c.course?.title ?? 'a course', at: c.issuedAt })),
    ]
      .sort((a, b) => b.at.getTime() - a.at.getTime())
      .slice(0, limit)
      .map(e => ({ userId: e.userId, name: nameOf.get(e.userId)!, action: e.action, target: e.target, timestamp: e.at.toISOString() }));
  }
}
