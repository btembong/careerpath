import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Who teaches which course. Shared by the admin's "assign teacher" action and the automatic link that
 * gives a WordPress tutor the courses they wrote on careerpathafrica.com.
 */
@Injectable()
export class TeacherCoursesService {
  private readonly logger = new Logger(TeacherCoursesService.name);

  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  /**
   * Sales pay the teacher on the course assignment, so it must follow the course's teacher.
   * A new assignment gets the default commission; an existing one keeps its percentage.
   */
  async syncAssignedTeacher(courseIds: string[], teacherId: string | null) {
    if (!courseIds.length) return;
    const row = await this.prisma.platformSetting.findUnique({ where: { key: 'pricing' } });
    const pct = ((row?.value ?? {}) as { defaultTeacherCommissionPct?: number | null }).defaultTeacherCommissionPct ?? null;
    await this.prisma.$transaction(courseIds.map(courseId => this.prisma.courseAssignment.upsert({
      where: { courseId },
      update: { teacherId },
      create: { courseId, teacherId, teacherCommissionPct: teacherId ? pct : null },
    })));
  }

  /**
   * Give a tutor the WordPress courses they wrote: courses still waiting for a teacher whose WordPress
   * author has the tutor's email. Only courses no admin has decided on: one with an assignment (a teacher
   * given, "no teacher yet" chosen, or a commission set) is left alone, so an admin's choice always sticks.
   * Only for tutors who have finished their teacher profile, so the courses don't land on an empty profile.
   */
  async linkWordPressCourses(teacherId: string): Promise<{ count: number; titles: string[] }> {
    const t = await this.prisma.userProfile.findUnique({ where: { id: teacherId }, select: { id: true, email: true, role: true, onboardingCompleted: true, deletedAt: true } });
    if (!t || t.role !== 'TEACHER' || !t.onboardingCompleted || t.deletedAt) return { count: 0, titles: [] };
    const found = await this.prisma.platformCourse.findMany({
      where: { teacherPending: true, source: 'WORDPRESS', wpAuthorEmail: { equals: t.email, mode: 'insensitive' } },
      select: { id: true, title: true },
      orderBy: { title: 'asc' },
    });
    const decided = new Set((await this.prisma.courseAssignment.findMany({ where: { courseId: { in: found.map(c => c.id) } }, select: { courseId: true } })).map(a => a.courseId));
    const courses = found.filter(c => !decided.has(c.id));
    if (!courses.length) return { count: 0, titles: [] };
    const ids = courses.map(c => c.id);
    await this.prisma.platformCourse.updateMany({ where: { id: { in: ids }, teacherPending: true }, data: { teacherId: t.id, teacherPending: false } });
    await this.syncAssignedTeacher(ids, t.id);
    this.logger.log(`Linked ${ids.length} WordPress course(s) to ${t.email}`);

    const n = ids.length;
    this.notifications.notify(t.id, {
      type: 'system',
      title: n === 1 ? 'Your course from careerpathafrica.com is here' : `Your ${n} courses from careerpathafrica.com are here`,
      body: n === 1
        ? `"${courses[0].title}" is now in My courses. Check its lessons and details.`
        : `${courses.slice(0, 2).map(c => `"${c.title}"`).join(', ')}${n > 2 ? ` and ${n - 2} more` : ''} are now in My courses.`,
      href: '/teacher/courses',
    });
    return { count: n, titles: courses.map(c => c.title) };
  }

  /** After a WordPress pull: link new or newly-authored courses to tutors who are already set up */
  async linkAllWaiting(): Promise<number> {
    const emails = await this.prisma.platformCourse.findMany({
      where: { teacherPending: true, source: 'WORDPRESS', wpAuthorEmail: { not: null } },
      select: { wpAuthorEmail: true }, distinct: ['wpAuthorEmail'],
    });
    let linked = 0;
    for (const { wpAuthorEmail } of emails) {
      const t = await this.prisma.userProfile.findFirst({
        where: { email: { equals: wpAuthorEmail!, mode: 'insensitive' }, role: 'TEACHER', onboardingCompleted: true, deletedAt: null },
        select: { id: true },
      });
      if (t) linked += (await this.linkWordPressCourses(t.id)).count;
    }
    return linked;
  }
}
