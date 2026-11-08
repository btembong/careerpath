import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { PlatformCoursesService } from '../platform-courses/platform-courses.service';
import { GamificationService } from '../gamification/gamification.service';
import { NotificationsService } from '../notifications/notifications.service';

const DAY = 86_400_000;
/** Course-level quizzes (no lesson) have no pass mark of their own */
const DEFAULT_PASS_MARK = 70;

type Who = { name: string | null; firstName: string | null; lastName: string | null; email: string };
const nameOf = (p: Who) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];

/**
 * One grading queue for a teacher: assignment hand-ins in their cohorts and quiz attempts
 * with written answers in their courses.
 */
@Injectable()
export class GradingService {
  constructor(
    private prisma: PrismaService,
    private courses: PlatformCoursesService,
    private gamification: GamificationService,
    private notifications: NotificationsService,
  ) {}

  private async teacherCourseIds(teacherId: string) {
    const [own, assigned] = await Promise.all([
      this.prisma.platformCourse.findMany({ where: { teacherId }, select: { id: true } }),
      this.prisma.courseAssignment.findMany({ where: { teacherId }, select: { courseId: true } }),
    ]);
    return [...new Set([...own.map(c => c.id), ...assigned.map(a => a.courseId)])];
  }

  async queue(teacher: UserProfile) {
    const courseIds = await this.teacherCourseIds(teacher.id);
    const who = { select: { id: true, name: true, firstName: true, lastName: true, email: true, avatarUrl: true } };
    const [subs, attempts] = await Promise.all([
      this.prisma.submission.findMany({
        where: { grade: null, assignment: { cohort: { teacherId: teacher.id } } },
        include: {
          student: who,
          assignment: { select: { id: true, title: true, maxPoints: true, dueDate: true, cohort: { select: { id: true, name: true } }, rubric: { select: { id: true } } } },
        },
        orderBy: { submittedAt: 'asc' },
      }),
      this.prisma.quizAttempt.findMany({
        where: { isFullyGraded: false, courseId: { in: courseIds } },
        include: { student: who },
        orderBy: { submittedAt: 'asc' },
      }),
    ]);

    const lessonIds = [...new Set(attempts.map(a => a.lessonId).filter((x): x is string => !!x))];
    const [lessons, courses, writtenCounts] = await Promise.all([
      this.prisma.lesson.findMany({ where: { id: { in: lessonIds } }, select: { id: true, title: true } }),
      this.prisma.platformCourse.findMany({ where: { id: { in: [...new Set(attempts.map(a => a.courseId))] } }, select: { id: true, title: true } }),
      this.prisma.questionBank.groupBy({ by: ['lessonId'], where: { lessonId: { in: lessonIds }, type: 'WRITTEN' }, _count: { _all: true } }),
    ]);
    const lessonTitle = new Map(lessons.map(l => [l.id, l.title]));
    const courseTitle = new Map(courses.map(c => [c.id, c.title]));
    const written = new Map(writtenCounts.map(w => [w.lessonId, w._count._all]));

    const items = [
      ...subs.map(s => ({
        kind: 'assignment' as const, id: s.id, submittedAt: s.submittedAt,
        student: { id: s.student.id, name: nameOf(s.student), avatarUrl: s.student.avatarUrl },
        title: s.assignment.title, where: s.assignment.cohort.name,
        late: s.submittedAt > s.assignment.dueDate, note: s.note, fileUrl: s.fileUrl,
        assignmentId: s.assignment.id, maxPoints: s.assignment.maxPoints, hasRubric: !!s.assignment.rubric,
      })),
      ...attempts.map(a => ({
        kind: 'quiz' as const, id: a.id, submittedAt: a.submittedAt,
        student: { id: a.student.id, name: nameOf(a.student), avatarUrl: a.student.avatarUrl },
        title: a.lessonId ? (lessonTitle.get(a.lessonId) ?? 'Quiz') : 'Course quiz', where: courseTitle.get(a.courseId) ?? 'Course',
        writtenCount: a.lessonId ? (written.get(a.lessonId) ?? 0) : null,
      })),
    ].sort((x, y) => +x.submittedAt - +y.submittedAt);

    return {
      stats: {
        waiting: items.length,
        quiz: items.filter(i => i.kind === 'quiz').length,
        assignment: items.filter(i => i.kind === 'assignment').length,
        oldestDays: items[0] ? Math.floor((Date.now() - +items[0].submittedAt) / DAY) : null,
      },
      items,
    };
  }

  private async attemptFor(teacher: UserProfile, attemptId: string) {
    const attempt = await this.prisma.quizAttempt.findUnique({
      where: { id: attemptId },
      include: { student: { select: { id: true, name: true, firstName: true, lastName: true, email: true, avatarUrl: true } } },
    });
    if (!attempt) throw new NotFoundException('Quiz attempt not found');
    if ((teacher.role as UserRole) !== UserRole.ADMIN) {
      const ids = await this.teacherCourseIds(teacher.id);
      if (!ids.includes(attempt.courseId)) throw new ForbiddenException('Not your course');
    }
    const questions = await this.prisma.questionBank.findMany({
      where: attempt.lessonId ? { lessonId: attempt.lessonId } : { courseId: attempt.courseId, lessonId: null, bankOnly: false },
      orderBy: { sortOrder: 'asc' },
    });
    return { attempt, questions };
  }

  async quizAttempt(teacher: UserProfile, attemptId: string) {
    const { attempt, questions } = await this.attemptFor(teacher, attemptId);
    const answers = (attempt.answersJson ?? {}) as Record<string, string>;
    const [lesson, course] = await Promise.all([
      attempt.lessonId ? this.prisma.lesson.findUnique({ where: { id: attempt.lessonId }, select: { title: true, passMark: true } }) : null,
      this.prisma.platformCourse.findUnique({ where: { id: attempt.courseId }, select: { title: true } }),
    ]);
    const optionText = (q: (typeof questions)[number], id: string | undefined) =>
      Array.isArray(q.options) ? ((q.options as any[]).find(o => o?.id === id)?.text ?? id ?? null) : (id ?? null);
    return {
      id: attempt.id, submittedAt: attempt.submittedAt, isFullyGraded: attempt.isFullyGraded,
      feedback: attempt.feedback, autoScore: attempt.autoScore, manualScore: attempt.manualScore,
      student: { id: attempt.student.id, name: nameOf(attempt.student), avatarUrl: attempt.student.avatarUrl },
      title: lesson?.title ?? 'Course quiz', course: course?.title ?? 'Course', passMark: lesson?.passMark ?? DEFAULT_PASS_MARK,
      totalPoints: questions.reduce((n, q) => n + q.points, 0),
      questions: questions.map(q => {
        const given = answers[q.id];
        const auto = q.type !== 'WRITTEN';
        return {
          id: q.id, type: q.type, questionText: q.questionText, points: q.points,
          answer: q.type === 'MCQ' ? optionText(q, given) : (given ?? null),
          correctAnswer: q.type === 'MCQ' ? optionText(q, q.correctAnswer) : (q.correctAnswer || null),
          isCorrect: auto ? this.autoCorrect(q.type, given, q.correctAnswer) : null,
          explanation: q.explanation,
        };
      }),
    };
  }

  /** Same rule as the quiz itself: options by id, short answers case-insensitively (alternatives split by |). */
  private autoCorrect(type: string, given: string | undefined, correct: string) {
    if (given == null || given === '') return false;
    if (type === 'SHORT_ANSWER') {
      const norm = (x: string) => x.trim().toLowerCase().replace(/\s+/g, ' ');
      return correct.split('|').map(norm).includes(norm(String(given)));
    }
    return String(given) === correct;
  }

  /** Mark each written answer; the attempt's score, pass and lesson completion follow. */
  async gradeQuizAttempt(teacher: UserProfile, attemptId: string, dto: { marks: Record<string, number>; feedback?: string }) {
    const { attempt, questions } = await this.attemptFor(teacher, attemptId);
    const written = questions.filter(q => q.type === 'WRITTEN');
    let manual = 0;
    for (const q of written) {
      const m = Number(dto.marks?.[q.id]);
      if (!Number.isFinite(m) || m < 0 || m > q.points) throw new BadRequestException(`Give question "${q.questionText.slice(0, 40)}" 0 to ${q.points} marks`);
      manual += m;
    }
    const maxScore = questions.reduce((n, q) => n + q.points, 0);
    const finalScore = attempt.autoScore + manual;
    const pct = maxScore ? Math.round((finalScore / maxScore) * 100) : 100;
    const lesson = attempt.lessonId ? await this.prisma.lesson.findUnique({ where: { id: attempt.lessonId }, select: { passMark: true, title: true } }) : null;
    const passMark = attempt.lessonId ? lesson?.passMark ?? null : DEFAULT_PASS_MARK;
    const passed = passMark == null || pct >= passMark;

    await this.prisma.quizAttempt.update({
      where: { id: attemptId },
      data: { manualScore: Math.round(manual), finalScore: Math.round(finalScore), maxScore, passed, isFullyGraded: true, feedback: dto.feedback?.trim() || null, gradedAt: new Date() },
    });
    if (passed && attempt.lessonId) {
      await this.gamification.awardOnce(attempt.studentId, 'QUIZ_PASS', attempt.lessonId, { perfect: pct === 100 });
      await this.courses.markLessonComplete(attempt.studentId, attempt.lessonId);
    }
    this.notifications.notify(attempt.studentId, {
      type: 'grade', title: 'Quiz marked',
      body: `${lesson?.title ?? 'Your quiz'}: ${Math.round(finalScore)}/${maxScore} (${pct}%)${passed ? ' · passed' : ''}`,
      href: attempt.lessonId ? `/student/learn/${attempt.courseId}/lesson/${attempt.lessonId}` : '/student/quiz-history',
    }, {
      subject: `Your quiz was marked: ${lesson?.title ?? 'quiz'}`, badge: 'Grades', kind: 'grade', title: 'Your quiz is marked',
      text: `your teacher marked the written answers in ${lesson?.title ? `"${lesson.title}"` : 'your quiz'}.${passMark != null ? (passed ? ' You passed.' : ` The pass mark is ${passMark}%; have another look and try again.`) : ''}`,
      details: [['Score', `${Math.round(finalScore)} / ${maxScore}`], ['Percentage', `${pct}%`]],
      quote: dto.feedback?.trim() || null, quoteLabel: 'Teacher’s feedback',
      cta: 'See my answers',
    });
    return { finalScore, maxScore, percentage: pct, passed };
  }
}
