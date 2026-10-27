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
