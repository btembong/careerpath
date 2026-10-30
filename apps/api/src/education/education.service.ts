import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CertificatesService } from '../certificates/certificates.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GamificationService } from '../gamification/gamification.service';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { UserProfile } from '@prisma/client';

@Injectable()
export class EducationService {
  constructor(
    private prisma: PrismaService,
    private certificates: CertificatesService,
    private mail: MailService,
    private notifications: NotificationsService,
    private gamification: GamificationService,
  ) {}

  // ── Quiz submission ──────────────────────────────────────

  /**
   * Server-side quiz grading.
   * - MCQ answers are scored here; correctAnswer NEVER leaves the server.
   * - Written answers are flagged PENDING_REVIEW in a separate step.
   * - Returns the auto-score but NOT the correct answers.
   */
  async submitQuiz(student: UserProfile, dto: SubmitQuizDto) {
    // Fetch all questions for this course — includes correctAnswer (server only)
    const questions = await this.prisma.questionBank.findMany({
      where: { courseId: dto.courseId },
    });

    if (questions.length === 0) {
      throw new NotFoundException(`No questions found for course ${dto.courseId}`);
    }

    const questionMap = new Map(questions.map((q) => [q.id, q]));

    let autoScore = 0;
    let hasWritten = false;
    const answersJson: Record<string, string> = {};

    for (const answer of dto.answers) {
      const question = questionMap.get(answer.questionId);
      if (!question) continue; // skip unknown question IDs silently

      answersJson[answer.questionId] = answer.answer;

      if (question.type === 'MCQ') {
        if (answer.answer === question.correctAnswer) {
          autoScore += 1;
        }
      } else {
        // WRITTEN — mark for manual review
        hasWritten = true;
      }
    }

    // Auto-issue certificate if all MCQ and score ≥ 70%
    const passThreshold = Math.ceil(questions.length * 0.7);
    const passed = !hasWritten && autoScore >= passThreshold;

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        studentId: student.id,
        courseId: dto.courseId,
        autoScore,
        manualScore: 0,
        finalScore: autoScore, // updated when manual grading completes
        maxScore: questions.length,
        passed,
        isFullyGraded: !hasWritten,
        answersJson,
      },
    });

    if (passed) {
      await this.gamification.awardOnce(student.id, 'QUIZ_PASS', `course:${dto.courseId}`, {
        perfect: autoScore === questions.length,
      });
    }

    if (passed) {
      try {
        await this.certificates.issueCertificate(student.id, dto.courseId);
      } catch {
        // Non-critical — log and continue
      }
    }

    // Return score without leaking correct answers
    return {
      attemptId: attempt.id,
      autoScore,
      totalQuestions: questions.length,
      passed: !hasWritten && autoScore >= passThreshold,
      isFullyGraded: attempt.isFullyGraded,
      message: hasWritten
        ? 'Written answers submitted and will be reviewed by your teacher.'
        : autoScore >= passThreshold
          ? `Congratulations! You scored ${autoScore}/${questions.length} and earned a certificate.`
          : `You scored ${autoScore}/${questions.length}. Score at least ${passThreshold} to pass.`,
    };
  }

  // ── Assignment submission ─────────────────────────────────

  async submitAssignment(
    student: UserProfile,
    assignmentId: string,
    fileUrl: string | undefined,
    note?: string,
  ) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { cohort: true },
    });

    if (!assignment) throw new NotFoundException('Assignment not found');

    // Verify student is in this cohort
    const roster = await this.prisma.cohortRoster.findUnique({
      where: {
        studentId_cohortId: { studentId: student.id, cohortId: assignment.cohortId },
      },
    });
    if (!roster) throw new ForbiddenException('You are not enrolled in this cohort');

    // Late work is accepted; teachers see it marked late
    const existing = await this.prisma.submission.findUnique({ where: { studentId_assignmentId: { studentId: student.id, assignmentId } }, select: { grade: true } });
    if (existing?.grade != null) throw new BadRequestException('This assignment has already been graded');

    const submission = await this.prisma.submission.upsert({
      where: { studentId_assignmentId: { studentId: student.id, assignmentId } },
      create: {
        assignmentId,
        studentId: student.id,
        fileUrl: fileUrl ?? null,
        note: note?.trim().slice(0, 1000) || null,
        status: 'PENDING_REVIEW',
      },
      update: {
        fileUrl: fileUrl ?? null,
        note: note?.trim().slice(0, 1000) || null,
        submittedAt: new Date(),
        status: 'PENDING_REVIEW',
        feedback: null,
      },
    });
    await this.gamification.awardOnce(student.id, 'ASSIGNMENT_SUBMIT', assignmentId);
    return submission;
  }

  // ── Assignment overviews (student and teacher pages) ─────

  /** Everything a student was set across their cohorts, with what they handed in and their grades */
  async studentAssignmentOverview(studentId: string) {
    const DAY = 86_400_000;
    const now = Date.now();
    const rosters = await this.prisma.cohortRoster.findMany({ where: { studentId }, select: { cohortId: true } });
    const assignments = await this.prisma.assignment.findMany({
      where: { cohortId: { in: rosters.map(r => r.cohortId) } },
      include: {
        cohort: { select: { id: true, name: true, teacher: { select: { name: true, firstName: true, lastName: true, email: true } } } },
        submissions: { where: { studentId }, select: { id: true, fileUrl: true, grade: true, feedback: true, status: true, submittedAt: true, note: true } },
      },
      orderBy: { dueDate: 'asc' },
    });
    const rows = assignments.map(a => {
      const s = a.submissions[0] ?? null;
      const t = a.cohort.teacher;
      const state = !s ? (a.dueDate.getTime() < now ? 'overdue' : 'todo') : s.grade != null ? 'graded' : 'submitted';
      return {
        id: a.id, title: a.title, description: a.description, dueDate: a.dueDate, maxPoints: a.maxPoints,
        cohort: { id: a.cohort.id, name: a.cohort.name },
        teacher: t.name || [t.firstName, t.lastName].filter(Boolean).join(' ') || t.email.split('@')[0],
        state, late: !!s && s.submittedAt > a.dueDate,
        submission: s,
      };
    });
    const graded = rows.filter(r => r.state === 'graded' && r.maxPoints > 0);
    const weekEnd = now + 7 * DAY;
    return {
      stats: {
        dueThisWeek: rows.filter(r => r.state === 'todo' && r.dueDate.getTime() < weekEnd).length,
        nextDue: rows.find(r => r.state === 'todo') ?? null,
        overdue: rows.filter(r => r.state === 'overdue').length,
        avgGradePct: graded.length ? Math.round(graded.reduce((n, r) => n + (r.submission!.grade! / r.maxPoints) * 100, 0) / graded.length) : null,
        graded: graded.length, submitted: rows.filter(r => r.submission).length, total: rows.length,
      },
      assignments: rows,
    };
  }

  /** A teacher's assignments across their cohorts: what to grade, what's set, what's graded */
  async teacherAssignmentOverview(teacher: UserProfile) {
    const DAY = 86_400_000;
    const now = Date.now();
    const cohorts = await this.prisma.cohort.findMany({
      where: { teacherId: teacher.id },
      select: { id: true, name: true, _count: { select: { students: true } } },
    });
    const assignments = await this.prisma.assignment.findMany({
      where: { cohortId: { in: cohorts.map(c => c.id) } },
      include: {
        cohort: { select: { id: true, name: true, _count: { select: { students: true } } } },
        submissions: { include: { student: { select: { id: true, name: true, firstName: true, lastName: true, email: true } } }, orderBy: { submittedAt: 'asc' } },
      },
      orderBy: { dueDate: 'desc' },
    });
    const nm = (p: { name: string | null; firstName: string | null; lastName: string | null; email: string }) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
    const subRow = (a: (typeof assignments)[number], s: (typeof assignments)[number]['submissions'][number]) => ({
      id: s.id, assignmentId: a.id, title: a.title, maxPoints: a.maxPoints, dueDate: a.dueDate,
      cohort: { id: a.cohort.id, name: a.cohort.name },
      student: { id: s.student.id, name: nm(s.student) },
      fileUrl: s.fileUrl, note: s.note, grade: s.grade, feedback: s.feedback,
      submittedAt: s.submittedAt, late: s.submittedAt > a.dueDate,
    });
    const all = assignments.flatMap(a => a.submissions.map(s => subRow(a, s)));
    const toGrade = all.filter(s => s.grade == null).sort((x, y) => x.submittedAt.getTime() - y.submittedAt.getTime());
    const graded = all.filter(s => s.grade != null && s.maxPoints > 0);
    const recentGraded = graded.filter(s => s.submittedAt.getTime() > now - 30 * DAY);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    return {
      cohorts: cohorts.map(c => ({ id: c.id, name: c.name, students: c._count.students })),
      stats: {
        toGrade: toGrade.length,
        oldestWaitDays: toGrade[0] ? Math.floor((now - toGrade[0].submittedAt.getTime()) / DAY) : null,
        // Assignments have no created date; count those due this month
        setThisMonth: assignments.filter(a => a.dueDate >= monthStart).length,
        onTimePct: all.length ? Math.round((all.filter(s => !s.late).length / all.length) * 100) : null,
        avgGradePct: recentGraded.length ? Math.round(recentGraded.reduce((n, s) => n + (s.grade! / s.maxPoints) * 100, 0) / recentGraded.length) : null,
      },
      toGrade,
      graded: graded.sort((x, y) => y.submittedAt.getTime() - x.submittedAt.getTime()).slice(0, 50),
      assignments: assignments.map(a => ({
        id: a.id, title: a.title, description: a.description, dueDate: a.dueDate, maxPoints: a.maxPoints,
        cohort: { id: a.cohort.id, name: a.cohort.name },
        students: a.cohort._count.students, submitted: a.submissions.length,
        graded: a.submissions.filter(s => s.grade != null).length,
        late: a.submissions.filter(s => s.submittedAt > a.dueDate).length,
      })),
    };
  }

  // ── Assignment grading (teacher) ──────────────────────────

  async gradeSubmission(
    teacher: UserProfile,
    submissionId: string,
    dto: GradeSubmissionDto,
  ) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        assignment: { include: { cohort: true } },
        student: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    if (!submission) throw new NotFoundException('Submission not found');

    // Only the teacher who owns the cohort can grade
    if (submission.assignment.cohort.teacherId !== teacher.id) {
      throw new ForbiddenException('You can only grade submissions in your own cohorts');
    }

    if (dto.grade > submission.assignment.maxPoints) {
      throw new BadRequestException(
        `Grade ${dto.grade} exceeds the maximum of ${submission.assignment.maxPoints}`,
      );
    }

    const result = await this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        grade: dto.grade,
        feedback: dto.feedback ?? null,
        status: 'GRADED',
      },
    });

    // Notify student — non-critical
    const studentName = [submission.student.firstName, submission.student.lastName].filter(Boolean).join(' ') || submission.student.email;
    const courseTitle = submission.assignment.cohort.name;
    this.mail.sendAssignmentGraded(submission.student.email, {
      studentName,
      assignmentTitle: submission.assignment.title,
      courseTitle,
      grade: dto.grade,
      maxPoints: submission.assignment.maxPoints,
      feedback: dto.feedback ?? undefined,
    }).catch(() => {});
    if (dto.grade >= submission.assignment.maxPoints / 2) {
      await this.gamification.awardOnce(submission.studentId, 'ASSIGNMENT_PASS', submission.assignmentId);
    }
    this.notifications.notify(submission.studentId, {
      type: 'grade',
      title: 'Assignment graded',
      body: `"${submission.assignment.title}": ${dto.grade}/${submission.assignment.maxPoints}`,
      href: '/student/assignments',
    });

    return result;
  }

  // ── Assignment creation (teacher) ────────────────────────

  async createAssignment(
    teacher: UserProfile,
    cohortId: string,
    dto: { title: string; description: string; maxPoints: number; dueDate: string },
  ) {
    // Verify the teacher owns this cohort
    const cohort = await this.prisma.cohort.findUnique({ where: { id: cohortId } });
    if (!cohort) throw new NotFoundException('Cohort not found');
    if (cohort.teacherId !== teacher.id) throw new ForbiddenException('Not your cohort');

    return this.prisma.assignment.create({
      data: {
        cohortId,
        title: dto.title,
        description: dto.description,
        maxPoints: dto.maxPoints,
        dueDate: new Date(dto.dueDate),
      },
    });
  }

  async getAssignmentSubmissions(teacher: UserProfile, assignmentId: string) {
    const assignment = await this.prisma.assignment.findUnique({
      where: { id: assignmentId },
      include: { cohort: { include: { students: { include: { student: { select: { id: true, email: true, firstName: true, lastName: true } } } } } } },
    });
    if (!assignment) throw new NotFoundException('Assignment not found');
    if (assignment.cohort.teacherId !== teacher.id) throw new ForbiddenException('Not your cohort');

    const submissions = await this.prisma.submission.findMany({
      where: { assignmentId },
      include: { student: { select: { id: true, email: true, firstName: true, lastName: true } } },
    });
    const subMap = new Map(submissions.map(s => [s.studentId, s]));

    // Return every cohort student with their submission (or null)
    return {
      assignment,
      students: assignment.cohort.students.map((r: any) => ({
        student: r.student,
        submission: subMap.get(r.student.id) ?? null,
      })),
    };
  }

  // ── Quiz written-answer grading (teacher) ─────────────────

  async gradeQuizAttempt(
    teacher: UserProfile,
    attemptId: string,
    manualScore: number,
  ) {
    const attempt = await this.prisma.quizAttempt.findUnique({ where: { id: attemptId } });
    if (!attempt) throw new NotFoundException('Quiz attempt not found');

    // Verify the course is assigned to this teacher
    const assignment = await this.prisma.courseAssignment.findUnique({
      where: { courseId: attempt.courseId },
    });
    if (!assignment || assignment.teacherId !== teacher.id) {
      throw new ForbiddenException('Not your course');
    }

    const finalScore = attempt.autoScore + manualScore;
    return this.prisma.quizAttempt.update({
      where: { id: attemptId },
      data: { manualScore, finalScore, isFullyGraded: true },
    });
  }

  // ── Teacher grading queue ─────────────────────────────────

  async getGradingQueue(teacherId: string) {
    return this.prisma.submission.findMany({
      where: {
        status: 'PENDING_REVIEW',
        assignment: { cohort: { teacherId } },
      },
      include: {
        student: { select: { id: true, email: true, firstName: true, lastName: true } },
        assignment: { select: { title: true, maxPoints: true, dueDate: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });
  }

  // ── Student assignments list ──────────────────────────────

  async getStudentAssignments(studentId: string) {
    // Find all cohorts the student is in
    const rosters = await this.prisma.cohortRoster.findMany({
      where: { studentId },
      select: { cohortId: true },
    });
    const cohortIds = rosters.map(r => r.cohortId);

    const assignments = await this.prisma.assignment.findMany({
      where: { cohortId: { in: cohortIds } },
      orderBy: { dueDate: 'asc' },
    });

    const cohortNameMap = new Map<string, string>();
    if (cohortIds.length > 0) {
      const coh = await this.prisma.cohort.findMany({
        where: { id: { in: cohortIds } },
        select: { id: true, name: true },
      });
      coh.forEach(c => cohortNameMap.set(c.id, c.name));
    }

    // Attach this student's submission (if any) to each assignment
    const submissionMap = new Map<string, any>();
    if (assignments.length > 0) {
      const subs = await this.prisma.submission.findMany({
        where: { studentId, assignmentId: { in: assignments.map(a => a.id) } },
      });
      subs.forEach(s => submissionMap.set(s.assignmentId, s));
    }

    return assignments.map(a => {
      const submission = submissionMap.get(a.id) ?? null;
      const cohortName = cohortNameMap.get(a.cohortId) ?? null;
      return {
        ...a,
        cohortName,
        submission,
        // Flat fields used by the dashboard and calendar widgets
        dueAt: a.dueDate,
        status: submission?.status ?? 'NOT_SUBMITTED',
        course: { title: cohortName ?? undefined },
      };
    });
  }

  // ── Quiz questions (public, no correctAnswer) ────────────

  async getQuizQuestions(courseId: string) {
    const questions = await this.prisma.questionBank.findMany({
      where: { courseId },
      select: { id: true, courseId: true, questionText: true, type: true, options: true },
      // correctAnswer intentionally excluded — never sent to client
    });
    return questions;
  }

  async getWrittenQuizQueue(teacherId: string) {
    // Written quiz answers for courses assigned to this teacher
    const assignments = await this.prisma.courseAssignment.findMany({
      where: { teacherId },
      select: { courseId: true },
    });
    const courseIds = assignments.map((a) => a.courseId);

    return this.prisma.quizAttempt.findMany({
      where: {
        isFullyGraded: false,
        courseId: { in: courseIds },
      },
      include: {
        student: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
      orderBy: { submittedAt: 'asc' },
    });
  }
}
