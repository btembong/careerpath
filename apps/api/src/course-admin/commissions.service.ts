import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { defaultTeacherShare } from './default-share';

type Who = { name: string | null; firstName: string | null; lastName: string | null; email: string };
const nameOf = (p: Who) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email;
const pctOk = (v: unknown) => v === null || (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100);

/**
 * Who teaches and reviews each course, and their share of its sales. Sales credit the teacher on the
 * course assignment, so saving here always points it at the course's own teacher.
 */
@Injectable()
export class CommissionsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notifications: NotificationsService) {}

  async list() {
    const [courses, assignments, reviewers, setting] = await Promise.all([
      this.prisma.platformCourse.findMany({
        where: { status: { not: 'ARCHIVED' } },
        select: {
          id: true, title: true, source: true, status: true, teacherId: true, teacherPending: true,
          programme: { select: { shortName: true, name: true } }, subject: { select: { id: true, name: true } },
          teacher: { select: { name: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { title: 'asc' },
      }),
      this.prisma.courseAssignment.findMany(),
      this.prisma.userProfile.findMany({ where: { role: 'SUBJECT_REVIEWER' }, select: { id: true, name: true, firstName: true, lastName: true, email: true, teachingSubjects: { select: { id: true, name: true } } } }),
      this.prisma.platformSetting.findUnique({ where: { key: 'pricing' } }),
    ]);
    const byCourse = new Map(assignments.map(a => [a.courseId, a]));
    const people = new Map((await this.prisma.userProfile.findMany({ where: { id: { in: [...new Set(assignments.flatMap(a => [a.teacherId, a.reviewerId]).filter((x): x is string => !!x))] } }, select: { id: true, name: true, firstName: true, lastName: true, email: true } })).map(p => [p.id, nameOf(p)]));
    const now = Date.now();
    const rows = courses.map(c => {
      const a = byCourse.get(c.id);
      const teacherId = c.teacherPending ? null : c.teacherId;
      return {
        id: c.id, title: c.title, source: c.source, status: c.status,
        tag: [c.programme?.shortName ?? c.programme?.name, c.subject?.name].filter(Boolean).join(' · '), subjectId: c.subject?.id ?? null,
        teacher: teacherId ? { id: teacherId, name: nameOf(c.teacher) } : null,
        teacherPct: a?.teacherCommissionPct ?? null,
        // Sales pay this person; flagged when it isn't the course's teacher
        paysTo: a?.teacherId && a.teacherId !== teacherId ? { id: a.teacherId, name: people.get(a.teacherId) ?? 'someone else' } : null,
        reviewer: a?.reviewerId ? { id: a.reviewerId, name: people.get(a.reviewerId) ?? 'Reviewer' } : null,
        reviewerPct: a?.reviewerCommissionPct ?? null,
        review: a?.reviewStatus ?? null, submittedAt: a?.submittedAt ?? null, reviewedAt: a?.reviewedAt ?? null,
        waitingDays: a?.reviewStatus === 'PENDING' && a.submittedAt ? Math.floor((now - +a.submittedAt) / 86_400_000) : null,
      };
    });
    const waiting = rows.filter(r => r.review === 'PENDING' && r.submittedAt);
    const used = assignments.map(a => a.reviewerCommissionPct).filter((x): x is number => x != null);
    const commonReviewerPct = used.length ? [...used].sort((x, y) => used.filter(v => v === y).length - used.filter(v => v === x).length)[0] : null;
    return {
      rows,
      reviewers: reviewers.map(r => ({ id: r.id, name: nameOf(r), email: r.email, subjects: r.teachingSubjects })),
      stats: {
        courses: rows.length, fromWordPress: rows.filter(r => r.source === 'WORDPRESS').length,
        noReviewer: rows.filter(r => !r.reviewer).length, waiting: waiting.length,
        oldestWaitingDays: waiting.length ? Math.max(...waiting.map(r => r.waitingDays ?? 0)) : null,
        teacherPending: rows.filter(r => !r.teacher).length, wrongPayee: rows.filter(r => r.paysTo).length,
        defaultTeacherPct: ((setting?.value ?? {}) as { defaultTeacherCommissionPct?: number | null }).defaultTeacherCommissionPct ?? null,
        usualReviewerPct: commonReviewerPct,
      },
    };
  }

  async save(admin: UserProfile, courseIds: string[], dto: { teacherPct?: number | null; reviewerId?: string | null; reviewerPct?: number | null }) {
    if (!courseIds.length) throw new BadRequestException('Choose at least one course');
    if (dto.teacherPct !== undefined && !pctOk(dto.teacherPct)) throw new BadRequestException('The teacher’s share must be 0 to 100%');
    if (dto.reviewerPct !== undefined && !pctOk(dto.reviewerPct)) throw new BadRequestException('The reviewer’s share must be 0 to 100%');
    if (dto.reviewerId) {
      const r = await this.prisma.userProfile.findFirst({ where: { id: dto.reviewerId, role: 'SUBJECT_REVIEWER' }, select: { id: true } });
      if (!r) throw new BadRequestException('That person isn’t a subject reviewer');
    }
    const courses = await this.prisma.platformCourse.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true, teacherId: true, teacherPending: true } });
    if (!courses.length) throw new NotFoundException('Course not found');
    const before = await this.prisma.courseAssignment.findMany({ where: { courseId: { in: courses.map(c => c.id) } } });
    const defaultPct = await defaultTeacherShare(this.prisma);
    await this.prisma.$transaction(courses.map(c => {
      const data = {
        teacherId: c.teacherPending ? null : c.teacherId,
        ...(dto.teacherPct !== undefined && { teacherCommissionPct: dto.teacherPct }),
        ...(dto.reviewerId !== undefined && { reviewerId: dto.reviewerId }),
        ...(dto.reviewerPct !== undefined && { reviewerCommissionPct: dto.reviewerPct }),
      };
      // A first assignment for a course with a teacher starts at the default share unless one was given
      const create = { courseId: c.id, ...(!c.teacherPending && dto.teacherPct === undefined && { teacherCommissionPct: defaultPct }), ...data };
      return this.prisma.courseAssignment.upsert({ where: { courseId: c.id }, update: data, create });
    }));
    // Tell a newly assigned reviewer what's now theirs
    const newlyTheirs = dto.reviewerId ? courses.filter(c => before.find(b => b.courseId === c.id)?.reviewerId !== dto.reviewerId) : [];
    if (dto.reviewerId && newlyTheirs.length) {
      this.notifications.notify(dto.reviewerId, { type: 'system', title: `${newlyTheirs.length} course${newlyTheirs.length === 1 ? '' : 's'} to review`, body: 'You’re now the reviewer. They show in your review queue when the teacher submits them.', href: '/reviewer/courses' }, {
        subject: `You're the reviewer for ${newlyTheirs.length === 1 ? `"${newlyTheirs[0].title}"` : `${newlyTheirs.length} courses`}`,
        badge: 'Review', sender: 'partnerships', title: newlyTheirs.length === 1 ? 'A course to review' : `${newlyTheirs.length} courses to review`,
        text: `you're now the subject reviewer for ${newlyTheirs.length === 1 ? 'this course' : 'these courses'}. ${newlyTheirs.length === 1 ? 'It shows' : 'They show'} in your review queue when the teacher sends ${newlyTheirs.length === 1 ? 'it' : 'them'} for review.`,
        details: newlyTheirs.slice(0, 8).map((c, i) => [`Course ${i + 1}`, c.title] as [string, string]),
        cta: 'Open my review queue',
      });
    }
    for (const c of courses) {
      this.audit.log(admin.id, 'course.commission', 'CourseAssignment', c.id, before.find(b => b.courseId === c.id) ?? undefined, dto as Record<string, unknown>);
    }
    return { updated: courses.length };
  }
}
