import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;
type Person = { name: string | null; firstName: string | null; lastName: string | null; email: string };
const nameOf = (p: Person) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
type Money = { currency: string; amount: number }[];

@Injectable()
export class AdminTeachersService {
  constructor(private prisma: PrismaService) {}

  /** Approved and suspended teachers with what they teach, how many students, rating and recent earnings */
  async overview() {
    const now = Date.now();
    const teachers = await this.prisma.userProfile.findMany({
      where: { role: 'TEACHER', approvalStatus: { in: ['APPROVED', 'SUSPENDED'] } },
      select: {
        id: true, name: true, firstName: true, lastName: true, email: true, approvalStatus: true, bio: true, videoIntroUrl: true, lastActiveDate: true,
        teacherApplication: { select: { subjectAreas: true } },
        platformCourses: { select: { id: true, status: true } },
        teacherCohorts: { select: { students: { select: { studentId: true } } } },
        teacherReviews: { select: { rating: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const ids = teachers.map(t => t.id);
    const courseIds = teachers.flatMap(t => t.platformCourses.map(c => c.id));
    const [enrol, mentorRatings, earned, paidMonth, pending] = await Promise.all([
      this.prisma.courseEnrollment.findMany({ where: { courseId: { in: courseIds } }, select: { courseId: true, studentId: true } }),
      this.prisma.mentorReview.groupBy({ by: ['teacherId'], where: { teacherId: { in: ids } }, _avg: { rating: true }, _count: { rating: true } }),
      this.prisma.walletTransaction.findMany({
        where: { wallet: { userId: { in: ids } }, type: 'CREDIT', createdAt: { gte: new Date(now - 30 * DAY) } },
        select: { amount: true, currency: true, wallet: { select: { userId: true } } },
      }),
      this.prisma.walletTransaction.groupBy({
        by: ['currency'],
        where: { wallet: { userId: { in: ids } }, type: 'CREDIT', createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
        _sum: { amount: true },
      }),
      this.prisma.userProfile.count({ where: { role: 'TEACHER', approvalStatus: 'PENDING' } }),
    ]);
    const courseOwner = new Map(teachers.flatMap(t => t.platformCourses.map(c => [c.id, t.id] as const)));
    const studentsOf = new Map<string, Set<string>>();
    const add = (t: string, s: string) => { if (!studentsOf.has(t)) studentsOf.set(t, new Set()); studentsOf.get(t)!.add(s); };
    enrol.forEach(e => add(courseOwner.get(e.courseId)!, e.studentId));
    teachers.forEach(t => t.teacherCohorts.forEach(c => c.students.forEach(s => add(t.id, s.studentId))));
    const mentorMap = new Map(mentorRatings.map(m => [m.teacherId, m]));

    const rows = teachers.map(t => {
      const m = mentorMap.get(t.id);
      const ratings = [...t.teacherReviews.map(r => r.rating)];
      const count = ratings.length + (m?._count.rating ?? 0);
      const sum = ratings.reduce((a, b) => a + b, 0) + (m?._avg.rating ?? 0) * (m?._count.rating ?? 0);
      const money = new Map<string, number>();
      earned.filter(e => e.wallet.userId === t.id).forEach(e => money.set(e.currency, (money.get(e.currency) ?? 0) + e.amount));
      return {
        id: t.id, name: nameOf(t), email: t.email, status: t.approvalStatus,
        subjects: t.teacherApplication?.subjectAreas ?? [],
        courses: t.platformCourses.filter(c => c.status !== 'ARCHIVED').length,
        published: t.platformCourses.filter(c => c.status === 'PUBLISHED').length,
        students: studentsOf.get(t.id)?.size ?? 0,
        rating: count ? Math.round((sum / count) * 10) / 10 : null, ratings: count,
        earned30d: [...money].map(([currency, amount]) => ({ currency, amount })) as Money,
        profileComplete: !!t.videoIntroUrl && !!t.bio,
        missing: [!t.videoIntroUrl && 'intro video', !t.bio && 'bio'].filter(Boolean) as string[],
        lastActive: t.lastActiveDate,
      };
    });
    const rated = rows.filter(r => r.rating != null);
    return {
      stats: {
        active: rows.filter(r => r.status === 'APPROVED').length,
        suspended: rows.filter(r => r.status === 'SUSPENDED').length,
        applications: pending,
        students: new Set([...studentsOf.values()].flatMap(s => [...s])).size,
        courses: rows.reduce((n, r) => n + r.published, 0),
        avgRating: rated.length ? Math.round((rated.reduce((n, r) => n + r.rating! * r.ratings, 0) / rated.reduce((n, r) => n + r.ratings, 0)) * 10) / 10 : null,
        ratings: rows.reduce((n, r) => n + r.ratings, 0),
        paidThisMonth: paidMonth.map(p => ({ currency: p.currency, amount: p._sum.amount ?? 0 })) as Money,
      },
      teachers: rows,
    };
  }

  /** One teacher: courses with commission, cohorts with attendance, mentorship and profile */
  async detail(teacherId: string) {
    const now = Date.now();
    const t = await this.prisma.userProfile.findFirst({
      where: { id: teacherId, role: 'TEACHER' },
      select: {
        id: true, name: true, firstName: true, lastName: true, email: true, approvalStatus: true, bio: true, videoIntroUrl: true, lastActiveDate: true, createdAt: true,
        teacherApplication: { select: { subjectAreas: true, yearsExperience: true } },
        platformCourses: { select: { id: true, title: true, status: true, _count: { select: { enrollments: true } } }, orderBy: { title: 'asc' } },
        teacherCohorts: {
          select: {
            id: true, name: true, _count: { select: { students: true } },
            liveClasses: { where: { status: { not: 'CANCELLED' } }, select: { scheduledAt: true, durationMins: true, status: true, recordingUrl: true, _count: { select: { attendance: true } } } },
          },
        },
        mentorSlots: { where: { startsAt: { gte: new Date() } }, select: { isBooked: true } },
      },
    });
    if (!t) throw new NotFoundException('Teacher not found');
    const [assignments, mentor, earned] = await Promise.all([
      this.prisma.courseAssignment.findMany({ where: { courseId: { in: t.platformCourses.map(c => c.id) } }, select: { courseId: true, teacherCommissionPct: true } }),
      this.prisma.mentorReview.aggregate({ where: { teacherId }, _avg: { rating: true }, _count: { rating: true } }),
      this.prisma.walletTransaction.groupBy({ by: ['currency'], where: { wallet: { userId: teacherId }, type: 'CREDIT', createdAt: { gte: new Date(now - 30 * DAY) } }, _sum: { amount: true } }),
    ]);
    const pct = new Map(assignments.map(a => [a.courseId, a.teacherCommissionPct]));
    const ended = (c: { scheduledAt: Date; durationMins: number; status: string }) => c.status === 'COMPLETED' || (c.status === 'SCHEDULED' && c.scheduledAt.getTime() + c.durationMins * 60_000 < now);
    return {
      id: t.id, name: nameOf(t), email: t.email, status: t.approvalStatus, joinedAt: t.createdAt, lastActive: t.lastActiveDate,
      subjects: t.teacherApplication?.subjectAreas ?? [], yearsExperience: t.teacherApplication?.yearsExperience ?? null,
      profile: { video: !!t.videoIntroUrl, bio: !!t.bio },
      courses: t.platformCourses.map(c => ({ id: c.id, title: c.title, status: c.status, students: c._count.enrollments, commissionPct: pct.get(c.id) ?? null })),
      cohorts: t.teacherCohorts.map(c => {
        const held = c.liveClasses.filter(ended);
        const possible = held.length * c._count.students;
        return {
          id: c.id, name: c.name, students: c._count.students, classesHeld: held.length,
          attendancePct: possible ? Math.round((held.reduce((n, x) => n + x._count.attendance, 0) / possible) * 100) : null,
          missingRecordings: held.filter(x => !x.recordingUrl && x.scheduledAt.getTime() < now - 2 * DAY).length,
        };
      }),
      mentorship: {
        freeSlots: t.mentorSlots.filter(s => !s.isBooked).length, booked: t.mentorSlots.filter(s => s.isBooked).length,
        rating: mentor._avg.rating ? Math.round(mentor._avg.rating * 10) / 10 : null, ratings: mentor._count.rating,
      },
      earned30d: earned.map(e => ({ currency: e.currency, amount: e._sum.amount ?? 0 })),
    };
  }

  /** Pause a teacher (no sign-in, hidden from students) or bring them back */
  async setSuspended(teacherId: string, suspended: boolean) {
    const t = await this.prisma.userProfile.findFirst({ where: { id: teacherId, role: 'TEACHER' }, select: { approvalStatus: true } });
    if (!t) throw new NotFoundException('Teacher not found');
    if (suspended && t.approvalStatus !== 'APPROVED') throw new BadRequestException('Only approved teachers can be suspended');
    if (!suspended && t.approvalStatus !== 'SUSPENDED') throw new BadRequestException('This teacher isn’t suspended');
    await this.prisma.userProfile.update({ where: { id: teacherId }, data: { approvalStatus: suspended ? 'SUSPENDED' : 'APPROVED' } });
    return { status: suspended ? 'SUSPENDED' : 'APPROVED' };
  }
}
