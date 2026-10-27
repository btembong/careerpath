import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CertificatesService } from '../certificates/certificates.service';
import { MailService } from '../mail/mail.service';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { UserProfile } from '@prisma/client';

@Injectable()
export class EducationService {
  constructor(
    private prisma: PrismaService,
    private certificates: CertificatesService,
    private mail: MailService,
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

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        studentId: student.id,
        courseId: dto.courseId,
        autoScore,
        manualScore: 0,
        finalScore: autoScore, // updated when manual grading completes
        isFullyGraded: !hasWritten,
        answersJson,
      },
    });

    // Auto-issue certificate if all MCQ and score ≥ 70%
    const passThreshold = Math.ceil(questions.length * 0.7);
    if (!hasWritten && autoScore >= passThreshold) {
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

    if (new Date() > assignment.dueDate) {
      throw new BadRequestException('The submission deadline has passed');
    }

    return this.prisma.submission.upsert({
      where: { studentId_assignmentId: { studentId: student.id, assignmentId } },
      create: {
        assignmentId,
        studentId: student.id,
        fileUrl: fileUrl ?? null,
        status: 'PENDING_REVIEW',
      },
      update: {
        fileUrl: fileUrl ?? null,
        status: 'PENDING_REVIEW',
        feedback: null,
      },
    });
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

    return assignments.map(a => ({
      ...a,
      cohortName: cohortNameMap.get(a.cohortId) ?? null,
      submission: submissionMap.get(a.id) ?? null,
    }));
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
