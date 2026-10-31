import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { AssignCourseDto } from './dto/assign-course.dto';
import { ReviewCourseDto, ReviewDecision } from './dto/review-course.dto';
import { UserRole } from '@cpa/shared';
import { UserProfile } from '@prisma/client';

@Injectable()
export class CoursesService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private audit: AuditService,
  ) {}

  // ── Admin: assign teacher + reviewer ────────────────────

  async assignCourse(courseId: string, dto: AssignCourseDto) {
    // Get previous assignment to detect reviewer change
    const previous = await this.prisma.courseAssignment.findUnique({ where: { courseId } });

    const assignment = await this.prisma.courseAssignment.upsert({
      where: { courseId },
      update: {
        teacherId: dto.teacherId ?? null,
        teacherCommissionPct: dto.teacherCommissionPct ?? null,
        reviewerId: dto.reviewerId ?? null,
        reviewerCommissionPct: dto.reviewerCommissionPct ?? null,
      },
      create: {
        courseId,
        teacherId: dto.teacherId ?? null,
        teacherCommissionPct: dto.teacherCommissionPct ?? null,
        reviewerId: dto.reviewerId ?? null,
        reviewerCommissionPct: dto.reviewerCommissionPct ?? null,
      },
    });

    // Notify reviewer if newly assigned (or changed)
    if (dto.reviewerId && dto.reviewerId !== previous?.reviewerId) {
      const [reviewer, course] = await Promise.all([
        this.prisma.userProfile.findUnique({ where: { id: dto.reviewerId }, select: { email: true } }),
        this.prisma.platformCourse.findUnique({ where: { id: courseId }, select: { title: true } })
          .catch(() => null),
      ]);
      const title = course?.title ?? `Course ${courseId.slice(-6)}`;
      if (reviewer) this.mail.sendReviewerAssigned(reviewer.email, title).catch(() => {});
    }

    this.audit.log(null, 'course.assigned', 'CourseAssignment', courseId, previous ?? undefined, {
      teacherId: dto.teacherId,
      reviewerId: dto.reviewerId,
      teacherCommissionPct: dto.teacherCommissionPct,
      reviewerCommissionPct: dto.reviewerCommissionPct,
    });

    return assignment;
  }

  // ── Admin: list all assignments ──────────────────────────

  async listAssignments() {
    return this.prisma.courseAssignment.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 200,
    });
  }

  // ── Reviewer: their queue ────────────────────────────────

  async getReviewerQueue(reviewerId: string) {
    return this.prisma.courseAssignment.findMany({
      where: {
        reviewerId,
        reviewStatus: 'PENDING',
      },
      orderBy: { updatedAt: 'asc' },
    });
  }

  // ── Reviewer: queue, history and earnings ────────────────

  async getReviewerOverview(reviewerId: string) {
    const DAY = 86_400_000;
    const now = Date.now();
    const assignments = await this.prisma.courseAssignment.findMany({ where: { reviewerId } });
    const courses = await this.prisma.platformCourse.findMany({
      where: { id: { in: assignments.map(a => a.courseId) } },
      select: {
        id: true, title: true, status: true,
        programme: { select: { name: true, shortName: true } },
        teacher: { select: { name: true, firstName: true, lastName: true, email: true } },
        modules: { select: { lessons: { select: { type: true } } } },
      },
    });
    const byId = new Map(courses.map(c => [c.id, c]));
    const row = (a: (typeof assignments)[number]) => {
      const c = byId.get(a.courseId);
      if (!c) return null;
      const lessons = c.modules.flatMap(m => m.lessons);
      const t = c.teacher;
      return {
        courseId: c.id, title: c.title, courseStatus: c.status,
        programme: c.programme ? c.programme.shortName ?? c.programme.name : null,
        teacher: t.name || [t.firstName, t.lastName].filter(Boolean).join(' ') || t.email.split('@')[0],
        lessons: lessons.length, quizzes: lessons.filter(l => l.type === 'QUIZ').length,
        submittedAt: a.submittedAt, reviewedAt: a.reviewedAt, decision: a.reviewStatus,
        notes: a.reviewNotes, checklist: a.reviewChecklist,
        commissionPct: a.reviewerCommissionPct,
        // A course that was sent back before and has come in again
        resubmitted: a.reviewStatus === 'PENDING' && !!a.reviewedAt,
      };
    };
    const queue = assignments.filter(a => a.reviewStatus === 'PENDING').map(row).filter(Boolean)
      .sort((x, y) => (x!.submittedAt?.getTime() ?? 0) - (y!.submittedAt?.getTime() ?? 0));
    const history = assignments.filter(a => a.reviewStatus !== 'PENDING' && a.reviewedAt).map(row).filter(Boolean)
      .sort((x, y) => y!.reviewedAt!.getTime() - x!.reviewedAt!.getTime());
    const timed = history.filter(h => h!.submittedAt && h!.reviewedAt! >= h!.submittedAt!);
    const earnings = await this.prisma.walletTransaction.groupBy({
      by: ['currency'],
      where: { wallet: { userId: reviewerId }, source: 'REVIEW_COMMISSION' },
      _sum: { amount: true },
    });
    const oldest = queue[0]?.submittedAt;
    return {
      stats: {
        toReview: queue.length,
        oldestWaitDays: oldest ? Math.floor((now - oldest.getTime()) / DAY) : null,
        reviewed: history.length,
        avgReviewDays: timed.length ? Math.round((timed.reduce((n, h) => n + (h!.reviewedAt!.getTime() - h!.submittedAt!.getTime()), 0) / timed.length / DAY) * 10) / 10 : null,
        earned: earnings.map(e => ({ currency: e.currency, amount: e._sum.amount ?? 0 })),
        approved: history.filter(h => h!.decision === 'APPROVED').length,
        sentBack: history.filter(h => h!.decision === 'REJECTED').length,
        // The share of each sale a reviewer earns, as set by admins per course (usually the same everywhere)
        commissionPct: (() => { const xs = assignments.map(a => a.reviewerCommissionPct).filter((x): x is number => x != null); return xs.length ? Math.round((xs.reduce((n, x) => n + x, 0) / xs.length) * 10) / 10 : null; })(),
      },
      queue,
      history,
    };
  }

  // ── Reviewer: approve or reject ──────────────────────────

  async reviewCourse(courseId: string, reviewer: UserProfile, dto: ReviewCourseDto) {
    const assignment = await this.prisma.courseAssignment.findUnique({
      where: { courseId },
    });

    if (!assignment) throw new NotFoundException('Course assignment not found');

    // A reviewer can only act on courses assigned to them
    if (
      reviewer.role !== UserRole.ADMIN &&
      assignment.reviewerId !== reviewer.id
    ) {
      throw new ForbiddenException('This course is not in your review queue');
    }

    if (dto.decision === ReviewDecision.REJECTED && !dto.notes) {
      throw new BadRequestException('Notes are required when rejecting a course');
    }

    const updated = await this.prisma.courseAssignment.update({
      where: { courseId },
      data: {
        reviewStatus: dto.decision,
        reviewNotes: dto.notes ?? null,
        reviewedAt: new Date(),
        ...(dto.checklist && { reviewChecklist: cleanChecklist(dto.checklist) }),
      },
    });

    // Notify teacher when course is approved
    if (dto.decision === ReviewDecision.APPROVED && assignment.teacherId) {
      const [teacher, course] = await Promise.all([
        this.prisma.userProfile.findUnique({ where: { id: assignment.teacherId }, select: { email: true } }),
        this.prisma.platformCourse.findUnique({ where: { id: courseId }, select: { title: true } }).catch(() => null),
      ]);
      const title = course?.title ?? `Course ${courseId.slice(-6)}`;
      if (teacher) this.mail.sendCourseApproved(teacher.email, title).catch(() => {});
    }

    this.audit.log(
      reviewer.id,
      dto.decision === ReviewDecision.APPROVED ? 'course.approved' : 'course.rejected',
      'CourseAssignment',
      courseId,
      { reviewStatus: assignment.reviewStatus },
      { reviewStatus: dto.decision, reviewNotes: dto.notes },
    );

    return updated;
  }
}

const CHECKLIST_KEYS = ['accuracy', 'syllabus', 'media', 'quizzes', 'preview'];
/** Only the known checklist items, each 'good' or 'fix' */
function cleanChecklist(c: Record<string, string>) {
  return Object.fromEntries(CHECKLIST_KEYS.filter(k => c[k] === 'good' || c[k] === 'fix').map(k => [k, c[k]]));
}
