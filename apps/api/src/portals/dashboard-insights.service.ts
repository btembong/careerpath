import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { minorToMajor } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 24 * 60 * 60 * 1000;
/** "2 Sep" — three-letter months everywhere (en-GB writes "Sept") */
const dayMonth = (d: Date) => `${d.getUTCDate()} ${d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' })}`;
const WEEK = 7 * DAY;

function displayName(u: { name?: string | null; firstName?: string | null; lastName?: string | null; email?: string }) {
  return u.name || [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email?.split('@')[0] || 'Student';
}
function shortName(u: { name?: string | null; firstName?: string | null; lastName?: string | null; email?: string }) {
  const full = displayName(u).trim().split(/\s+/);
  return full.length > 1 ? `${full[0]} ${full[full.length - 1][0]}.` : full[0];
}

/** Read-only figures for the teacher and admin dashboards. */
@Injectable()
export class DashboardInsightsService {
  constructor(private prisma: PrismaService) {}

  // ── Teacher ───────────────────────────────────────────────

  /**
   * Cohort activity heatmap (students × last 8 weeks), the teacher's courses with progress,
   * and students who have gone quiet. Activity = lessons completed, practice sets and quizzes.
   */
  async getTeacherOverview(teacher: UserProfile, cohortId?: string) {
    const cohorts = await this.prisma.cohort.findMany({
      where: teacher.role === 'ADMIN' ? {} : { teacherId: teacher.id },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    });
    const cohort = cohortId ? cohorts.find(c => c.id === cohortId) : cohorts[0];
    if (cohortId && !cohort) throw new ForbiddenException('Not your cohort');

    const now = Date.now();
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const end = now - (7 - i) * WEEK;
      return { start: end - WEEK, end, label: dayMonth(new Date(end - WEEK)) };
    });
    const since = new Date(weeks[0].start);

    let rows: { studentId: string; name: string; cells: number[]; total: number; lastActive: string | null }[] = [];
    if (cohort) {
      const roster = await this.prisma.cohortRoster.findMany({
        where: { cohortId: cohort.id },
        select: { student: { select: { id: true, name: true, firstName: true, lastName: true, email: true } } },
      });
      const ids = roster.map(r => r.student.id);
      const [lessons, practice, quizzes] = await Promise.all([
        this.prisma.xPEvent.findMany({ where: { userId: { in: ids }, type: 'LESSON_COMPLETE', createdAt: { gte: since } }, select: { userId: true, createdAt: true } }),
        this.prisma.practiceAttempt.findMany({ where: { studentId: { in: ids }, createdAt: { gte: since } }, select: { studentId: true, createdAt: true } }),
        this.prisma.quizAttempt.findMany({ where: { studentId: { in: ids }, submittedAt: { gte: since } }, select: { studentId: true, submittedAt: true } }),
      ]);
      const events = [
        ...lessons.map(e => ({ id: e.userId, at: e.createdAt.getTime() })),
        ...practice.map(e => ({ id: e.studentId, at: e.createdAt.getTime() })),
        ...quizzes.map(e => ({ id: e.studentId, at: e.submittedAt.getTime() })),
      ];
      rows = roster.map(({ student }) => {
        const mine = events.filter(e => e.id === student.id);
        const cells = weeks.map(w => mine.filter(e => e.at > w.start && e.at <= w.end).length);
        const last = mine.reduce((m, e) => Math.max(m, e.at), 0);
        return { studentId: student.id, name: displayName(student), cells, total: cells.reduce((a, b) => a + b, 0), lastActive: last ? new Date(last).toISOString() : null };
      }).sort((a, b) => b.total - a.total);
    }

    // Quiet = nothing in the last two weeks
    const quiet = rows
      .filter(r => r.cells.slice(-2).every(c => c === 0))
      .map(r => ({
        studentId: r.studentId,
        name: r.name,
        reason: r.lastActive
          ? `No study for ${Math.max(2, Math.floor((now - new Date(r.lastActive).getTime()) / WEEK))} weeks`
          : 'No study in the last 8 weeks',
      }));

    // Courses with enrolled students and average lesson completion
    const courses = await this.prisma.platformCourse.findMany({
      where: teacher.role === 'ADMIN' ? { teacherId: teacher.id } : { teacherId: teacher.id },
      select: {
        id: true, title: true, status: true,
        modules: { select: { lessons: { select: { id: true } } } },
        enrollments: { select: { studentId: true } },
      },
      orderBy: { updatedAt: 'desc' },
      take: 8,
    });
    const courseRows = await Promise.all(courses.map(async c => {
      const lessonIds = c.modules.flatMap(m => m.lessons.map(l => l.id));
      const students = c.enrollments.map(e => e.studentId);
      const done = lessonIds.length && students.length
        ? await this.prisma.lessonProgress.count({ where: { lessonId: { in: lessonIds }, studentId: { in: students }, completed: true } })
        : 0;
      return {
        id: c.id, title: c.title, status: c.status,
        students: students.length,
        avgPct: lessonIds.length && students.length ? Math.round((done / (lessonIds.length * students.length)) * 100) : 0,
      };
    }));

    const max = Math.max(0, ...rows.flatMap(r => r.cells));
    return {
      cohorts,
      cohortId: cohort?.id ?? null,
      cohortName: cohort?.name ?? null,
      weeks: weeks.map(w => w.label),
      rows,
      max,
      quiet,
      courses: courseRows,
    };
  }

  // ── Admin ─────────────────────────────────────────────────

  private async rateMap() {
    const rates = await this.prisma.exchangeRate.findMany();
    const map = new Map<string, number>(rates.map(r => [r.currency.toUpperCase(), r.toUsdRate]));
    map.set('USD', 1);
    return map;
  }

  /**
   * Platform overview for a period ('7d' | 'month' | 'year') compared with the period before.
   * Money is converted to USD through the exchange-rate table; currencies without a rate are listed, never guessed.
   */
  async getAdminOverview(range = 'month') {
    const now = new Date();
    let start: Date;
    if (range === '7d') start = new Date(now.getTime() - 7 * DAY);
    else if (range === 'year') start = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
    else start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const prevStart = new Date(start.getTime() - (now.getTime() - start.getTime()));
    const weeksStart = new Date(now.getTime() - 12 * WEEK);
    const earliest = new Date(Math.min(prevStart.getTime(), weeksStart.getTime()));
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const [rates, pkgPurchases, coursePurchases, newStudents, prevStudents, byCountry, signupsToday, liveToday, openTickets, pendingTeachers, pendingCourses, activePackages] = await Promise.all([
      this.rateMap(),
      this.prisma.packagePurchase.findMany({
        where: { purchasedAt: { gte: earliest } },
        select: { amountPaid: true, currency: true, purchasedAt: true, gateway: true, package: { select: { name: true, currency: true, priceAmount: true } }, student: { select: { name: true, firstName: true, lastName: true, email: true } } },
        orderBy: { purchasedAt: 'desc' },
      }),
      this.prisma.coursePurchase.findMany({
        where: { purchasedAt: { gte: earliest } },
        select: { amountPaid: true, currency: true, purchasedAt: true, gateway: true, course: { select: { title: true } }, student: { select: { name: true, firstName: true, lastName: true, email: true } } },
        orderBy: { purchasedAt: 'desc' },
      }),
      this.prisma.userProfile.count({ where: { role: 'STUDENT', createdAt: { gte: start } } }),
      this.prisma.userProfile.count({ where: { role: 'STUDENT', createdAt: { gte: prevStart, lt: start } } }),
      this.prisma.userProfile.groupBy({ by: ['countryId'], where: { role: 'STUDENT' }, _count: { id: true } }),
      this.prisma.userProfile.count({ where: { createdAt: { gte: todayStart } } }),
      this.prisma.liveClass.count({ where: { scheduledAt: { gte: todayStart, lt: new Date(todayStart.getTime() + DAY) } } }),
      this.prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      this.prisma.userProfile.findMany({
        where: { role: 'TEACHER', approvalStatus: 'PENDING' },
        select: { id: true, email: true, createdAt: true, teacherApplication: { select: { firstName: true, lastName: true, subjectAreas: true, yearsExperience: true, submittedAt: true } } },
        orderBy: { createdAt: 'asc' },
        take: 10,
      }),
      this.prisma.platformCourse.findMany({
        where: { status: 'PENDING_REVIEW' },
        select: { id: true, title: true, updatedAt: true, teacher: { select: { name: true, firstName: true, lastName: true, email: true } } },
        orderBy: { updatedAt: 'asc' },
        take: 10,
      }),
      this.prisma.package.count({ where: { isPublished: true } }),
    ]);

    const missing = new Set<string>();
    const usd = (minor: number | null | undefined, currency: string | null | undefined) => {
      const cur = (currency ?? 'USD').toUpperCase();
      const rate = rates.get(cur);
      if (rate === undefined) { missing.add(cur); return 0; }
      return minorToMajor(minor ?? 0, cur) * rate;
    };
    const sales = [
      ...pkgPurchases.map(p => {
        const currency = p.currency ?? p.package.currency;
        const minor = p.amountPaid ?? p.package.priceAmount;
        return { at: p.purchasedAt, usd: usd(minor, currency), minor, currency, item: p.package.name, gateway: p.gateway, student: p.student };
      }),
      ...coursePurchases.map(c => ({ at: c.purchasedAt, usd: usd(c.amountPaid, c.currency), minor: c.amountPaid, currency: c.currency, item: c.course.title, gateway: c.gateway, student: c.student })),
    ].sort((a, b) => b.at.getTime() - a.at.getTime());

    const sum = (from: Date, to?: Date) => Math.round(sales
      .filter(s => s.at >= from && (!to || s.at < to))
      .reduce((t, s) => t + s.usd, 0) * 100) / 100;

    const weekly = Array.from({ length: 12 }, (_, i) => {
      const end = new Date(now.getTime() - (11 - i) * WEEK);
      const from = new Date(end.getTime() - WEEK);
      return { week: dayMonth(from), usd: sum(from, end) };
    });

    const countryIds = byCountry.map(c => c.countryId).filter((x): x is string => !!x);
    const countryNames = new Map((await this.prisma.country.findMany({ where: { id: { in: countryIds } }, select: { id: true, name: true } })).map(c => [c.id, c.name]));
    const totalStudents = byCountry.reduce((t, c) => t + c._count.id, 0);
    const countries = byCountry
      .map(c => ({ name: c.countryId ? (countryNames.get(c.countryId) ?? 'Unknown') : 'Not set', students: c._count.id }))
      .sort((a, b) => b.students - a.students)
      .slice(0, 5)
      .map(c => ({ ...c, pct: totalStudents ? Math.round((c.students / totalStudents) * 100) : 0 }));

    const GATEWAY: Record<string, string> = { TRANZAK: 'Mobile money', STRIPE: 'Card', PAYSTACK: 'Paystack', FREE: 'Free', WALLET: 'Wallet', MANUAL: 'Manual', DEMO: 'Demo' };

    return {
      range,
      revenueUsd: sum(start),
      prevRevenueUsd: sum(prevStart, start),
      missingRates: [...missing],
      newStudents,
      prevNewStudents: prevStudents,
      activePackages,
      weekly,
      recentPurchases: sales.slice(0, 6).map(s => ({
        name: shortName(s.student),
        item: s.item,
        amount: minorToMajor(s.minor ?? 0, s.currency),
        currency: s.currency,
        method: s.gateway ? (GATEWAY[s.gateway.toUpperCase()] ?? s.gateway) : '—',
        at: s.at.toISOString(),
      })),
      countries,
      today: { signups: signupsToday, purchases: sales.filter(s => s.at >= todayStart).length, liveClasses: liveToday, openTickets },
      pending: [
        ...pendingTeachers.map(t => ({
          kind: 'teacher' as const,
          id: t.id,
          title: t.teacherApplication?.firstName ? `${t.teacherApplication.firstName} ${t.teacherApplication.lastName ?? ''}`.trim() : t.email,
          meta: [t.teacherApplication?.subjectAreas?.slice(0, 2).join(', '), t.teacherApplication?.yearsExperience != null ? `${t.teacherApplication.yearsExperience} years` : null].filter(Boolean).join(' · '),
          since: (t.teacherApplication?.submittedAt ?? t.createdAt).toISOString(),
        })),
        ...pendingCourses.map(c => ({
          kind: 'course' as const,
          id: c.id,
          title: c.title,
          meta: `By ${displayName(c.teacher)}`,
          since: c.updatedAt.toISOString(),
        })),
      ],
    };
  }

  /** Throws when a teacher asks about a cohort they don't teach (used by the controller for clarity). */
  async assertCohort(teacher: UserProfile, cohortId: string) {
    const c = await this.prisma.cohort.findUnique({ where: { id: cohortId }, select: { teacherId: true } });
    if (!c) throw new NotFoundException('Cohort not found');
    if (teacher.role !== 'ADMIN' && c.teacherId !== teacher.id) throw new ForbiddenException('Not your cohort');
  }
}
