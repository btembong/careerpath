import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;
const WEEK = 7 * DAY;
type Who = { name: string | null; firstName: string | null; lastName: string | null; email: string };
const nameOf = (p: Who) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
/** Students see only first name and initial on the rep's pages */
const shortName = (p: Who) => { const n = nameOf(p).split(/\s+/); return n.length > 1 ? `${n[0]} ${n[1][0]}.` : n[0]; };

/**
 * What a country representative sees about their own country: sales, students, teachers and their earnings.
 * Money stays in minor units per currency; the country's own currency is the headline.
 */
@Injectable()
export class RepInsightsService {
  constructor(private prisma: PrismaService) {}

  private async countryOf(rep: UserProfile) {
    if (!rep.countryId) throw new BadRequestException('You are not assigned to a country yet');
    const country = await this.prisma.country.findUnique({ where: { id: rep.countryId } });
    if (!country) throw new NotFoundException('Country not found');
    return country;
  }

  private range(range?: string) {
    const now = new Date();
    if (range === 'last') {
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { start, end: new Date(now.getFullYear(), now.getMonth(), 1), label: 'last month' };
    }
    if (range === 'year') return { start: new Date(now.getFullYear(), 0, 1), end: now, label: 'this year' };
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: 'this month' };
  }

  /** Package and single-course sales to students in the country between two dates */
  private async sales(countryId: string, from: Date, to: Date) {
    const [pkgs, courses] = await Promise.all([
      this.prisma.packagePurchase.findMany({
        where: { student: { countryId }, purchasedAt: { gte: from, lt: to } },
        include: { package: { select: { id: true, name: true, priceAmount: true, currency: true } }, student: { select: { name: true, firstName: true, lastName: true, email: true } } },
        orderBy: { purchasedAt: 'desc' },
      }),
      this.prisma.coursePurchase.findMany({
        where: { student: { countryId }, purchasedAt: { gte: from, lt: to } },
        include: { course: { select: { id: true, title: true } }, student: { select: { name: true, firstName: true, lastName: true, email: true } } },
        orderBy: { purchasedAt: 'desc' },
      }),
    ]);
    return [
      ...pkgs.map(p => ({ kind: 'package' as const, itemId: p.package.id, item: p.package.name, amount: p.amountPaid ?? p.package.priceAmount, currency: p.currency ?? p.package.currency, at: p.purchasedAt, gateway: p.gateway, student: p.student })),
      ...courses.map(c => ({ kind: 'course' as const, itemId: c.course.id, item: c.course.title, amount: c.amountPaid, currency: c.currency, at: c.purchasedAt, gateway: c.gateway, student: c.student })),
    ].sort((a, b) => +b.at - +a.at);
  }

  private totals(rows: { amount: number; currency: string }[]) {
    const m = new Map<string, number>();
    for (const r of rows) m.set(r.currency, (m.get(r.currency) ?? 0) + r.amount);
    return [...m.entries()].map(([currency, amount]) => ({ currency, amount }));
  }

  async overview(rep: UserProfile, rangeKey?: string) {
    const country = await this.countryOf(rep);
    const { start, end, label } = this.range(rangeKey);
    const prevStart = new Date(+start - (+end - +start));
    const now = new Date();
    const weeksStart = new Date(+now - 8 * WEEK);

    const [current, previous, weekly, newStudents, newBefore, activeStudents, wallet, endingSoon, applications, payout] = await Promise.all([
      this.sales(country.id, start, end),
      this.sales(country.id, prevStart, start),
      this.sales(country.id, weeksStart, now),
      this.prisma.userProfile.count({ where: { countryId: country.id, role: 'STUDENT', createdAt: { gte: start, lt: end } } }),
      this.prisma.userProfile.count({ where: { countryId: country.id, role: 'STUDENT', createdAt: { gte: prevStart, lt: start } } }),
      this.prisma.userProfile.count({
        where: { countryId: country.id, role: 'STUDENT', OR: [
          { purchases: { some: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } },
          { coursePurchases: { some: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } } },
        ] },
      }),
      this.prisma.wallet.findUnique({ where: { userId: rep.id } }),
      this.prisma.packagePurchase.count({ where: { student: { countryId: country.id }, expiresAt: { gt: now, lt: new Date(+now + 7 * DAY) } } }),
      this.prisma.userProfile.count({ where: { countryId: country.id, role: 'TEACHER', approvalStatus: 'PENDING' } }),
      this.prisma.payoutAccount.findUnique({ where: { userId: rep.id }, select: { id: true } }),
    ]);
    const earned = wallet ? await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id, type: 'CREDIT', source: 'COUNTRY_BONUS', createdAt: { gte: start, lt: end } },
      select: { amount: true, currency: true, packagePurchaseId: true, coursePurchaseId: true },
    }) : [];
    // Commission comes from a sale (linked purchase); the monthly per-student bonus has none
    const commission = earned.filter(e => e.packagePurchaseId || e.coursePurchaseId);
    const bonus = earned.filter(e => !e.packagePurchaseId && !e.coursePurchaseId);

    const inCurrency = (rows: { amount: number; currency: string }[]) => rows.filter(r => r.currency === country.currency).reduce((n, r) => n + r.amount, 0);
    const weeks = Array.from({ length: 8 }, (_, i) => {
      const from = new Date(+weeksStart + i * WEEK), to = new Date(+from + WEEK);
      return { from, amount: inCurrency(weekly.filter(s => s.at >= from && s.at < to)), count: weekly.filter(s => s.at >= from && s.at < to).length };
    });

    const top = new Map<string, { name: string; kind: string; count: number; amount: number }>();
    for (const s of current) {
      const t = top.get(s.itemId) ?? { name: s.item, kind: s.kind, count: 0, amount: 0 };
      t.count++; if (s.currency === country.currency) t.amount += s.amount;
      top.set(s.itemId, t);
    }

    const salesNow = inCurrency(current), salesBefore = inCurrency(previous);
    return {
      country: { id: country.id, name: country.name, currency: country.currency, commissionPct: country.repCommissionPercent, perStudentBonus: country.perStudentBonus },
      range: label,
      stats: {
        sales: salesNow, salesChangePct: salesBefore ? Math.round(((salesNow - salesBefore) / salesBefore) * 100) : null,
        otherCurrencies: this.totals(current).filter(t => t.currency !== country.currency),
        salesCount: current.length,
        newStudents, newStudentsBefore: newBefore, activeStudents,
        commission: inCurrency(commission), bonus: inCurrency(bonus),
      },
      wallet: { balance: wallet?.balance ?? 0, currency: wallet?.currency ?? country.currency },
      weeks,
      recent: current.slice(0, 6).map(s => ({ kind: s.kind, student: shortName(s.student), item: s.item, amount: s.amount, currency: s.currency, gateway: s.gateway, at: s.at })),
      top: [...top.values()].sort((a, b) => b.count - a.count).slice(0, 4),
      todo: { endingSoon, applications, needsPayout: !payout },
    };
  }

  /** Packages and individually sold courses, with how they sell in the country */
  async packages(rep: UserProfile) {
    const country = await this.countryOf(rep);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [packages, courses, monthSales] = await Promise.all([
      this.prisma.package.findMany({
        where: { isPublished: true },
        select: { id: true, name: true, priceAmount: true, currency: true, courseIds: true, validityDays: true, cohort: { select: { name: true, examDate: true } },
          purchases: { where: { student: { countryId: country.id }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { studentId: true } } },
        orderBy: { name: 'asc' },
      }),
      this.prisma.platformCourse.findMany({
        where: { status: 'PUBLISHED', isSoldIndividually: true },
        select: { id: true, title: true, priceAmount: true, priceCurrency: true, accessMonths: true,
          coursePurchases: { where: { student: { countryId: country.id }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, select: { studentId: true } } },
        orderBy: { title: 'asc' },
      }),
      this.sales(country.id, monthStart, now),
    ]);
    const sold = (id: string) => monthSales.filter(s => s.itemId === id);
    const rows = [
      ...packages.map(p => ({
        kind: 'package' as const, id: p.id, name: p.name, price: p.priceAmount, currency: p.currency,
        detail: p.cohort ? `Cohort · ${p.cohort.name}` : 'Self-paced', access: p.validityDays ? `${Math.round(p.validityDays / 30)} months` : 'No end date',
        courses: p.courseIds.length, activeStudents: new Set(p.purchases.map(x => x.studentId)).size,
        soldThisMonth: sold(p.id).length, revenueThisMonth: this.totals(sold(p.id)), link: `/packages/${p.id}`,
      })),
      ...courses.map(c => ({
        kind: 'course' as const, id: c.id, name: c.title, price: c.priceAmount ?? 0, currency: c.priceCurrency ?? country.currency,
        detail: c.priceAmount ? 'Single course' : 'Single course · free', access: c.accessMonths ? `${c.accessMonths} months` : 'No end date',
        courses: 1, activeStudents: new Set(c.coursePurchases.map(x => x.studentId)).size,
        soldThisMonth: sold(c.id).length, revenueThisMonth: this.totals(sold(c.id)), link: `/student/courses/${c.id}`,
      })),
    ];
    const renewals = await this.prisma.packagePurchase.count({ where: { student: { countryId: country.id }, expiresAt: { gt: now, lt: new Date(+now + 7 * DAY) } } });
    return {
      country: { name: country.name, currency: country.currency },
      stats: { onSale: rows.length, packages: packages.length, courses: courses.length, soldThisMonth: monthSales.length, revenue: this.totals(monthSales), renewals },
      rows,
    };
  }

  /** Teachers who live in the country, including those who have applied */
  async teachers(rep: UserProfile) {
    const country = await this.countryOf(rep);
    const teachers = await this.prisma.userProfile.findMany({
      where: { countryId: country.id, role: 'TEACHER' },
      select: {
        id: true, name: true, firstName: true, lastName: true, email: true, avatarUrl: true, approvalStatus: true, createdAt: true,
        teacherApplication: { select: { subjectAreas: true, submittedAt: true, yearsExperience: true } },
        teachingSubjects: { select: { name: true } },
        platformCourses: { where: { status: 'PUBLISHED' }, select: { id: true } },
        teacherReviews: { select: { rating: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const courseIds = teachers.flatMap(t => t.platformCourses.map(c => c.id));
    const enrolments = courseIds.length ? await this.prisma.courseEnrollment.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds } }, _count: { _all: true } }) : [];
    const studentsBy = new Map(enrolments.map(e => [e.courseId, e._count._all]));
    const rows = teachers.map(t => {
      const ratings = t.teacherReviews.map(r => r.rating);
      return {
        id: t.id, name: nameOf(t), email: t.email, avatarUrl: t.avatarUrl,
        subjects: t.teachingSubjects.length ? t.teachingSubjects.map(s => s.name) : t.teacherApplication?.subjectAreas ?? [],
        years: t.teacherApplication?.yearsExperience ?? null,
        courses: t.platformCourses.length,
        students: t.platformCourses.reduce((n, c) => n + (studentsBy.get(c.id) ?? 0), 0),
        rating: ratings.length ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10 : null, ratings: ratings.length,
        status: t.approvalStatus === 'PENDING' ? 'applied' : t.approvalStatus === 'SUSPENDED' ? 'suspended' : t.approvalStatus === 'REJECTED' ? 'declined' : 'teaching',
        appliedAt: t.teacherApplication?.submittedAt ?? t.createdAt,
      };
    });
    const teaching = rows.filter(r => r.status === 'teaching');
    const rated = teaching.filter(r => r.rating != null);
    return {
      country: { name: country.name },
      stats: {
        teaching: teaching.length, applied: rows.filter(r => r.status === 'applied').length,
        avgRating: rated.length ? Math.round((rated.reduce((n, r) => n + r.rating! * r.ratings, 0) / rated.reduce((n, r) => n + r.ratings, 0)) * 10) / 10 : null,
        ratings: rated.reduce((n, r) => n + r.ratings, 0),
        students: teaching.reduce((n, r) => n + r.students, 0),
      },
      rows,
    };
  }

  /** Students in the rep's country: what they bought, how far they are, and when their access ends */
  async students(rep: UserProfile) {
    const country = await this.countryOf(rep);
    const now = new Date();
    const students = await this.prisma.userProfile.findMany({
      where: { countryId: country.id, role: 'STUDENT' },
      select: {
        id: true, name: true, firstName: true, lastName: true, email: true, createdAt: true, lastActiveDate: true,
        purchases: { select: { purchasedAt: true, expiresAt: true, amountPaid: true, currency: true, package: { select: { name: true, courseIds: true } } }, orderBy: { purchasedAt: 'desc' } },
        coursePurchases: { select: { purchasedAt: true, expiresAt: true, amountPaid: true, currency: true, courseId: true, course: { select: { title: true } } }, orderBy: { purchasedAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    // Lessons in the courses each student has bought, and how many they've finished
    const courseIds = [...new Set(students.flatMap(st => [...st.purchases.flatMap(p => p.package.courseIds), ...st.coursePurchases.map(c => c.courseId)]))];
    const lessonCounts = courseIds.length ? await this.prisma.lesson.groupBy({ by: ['moduleId'], where: { module: { courseId: { in: courseIds } } }, _count: { _all: true } }) : [];
    const modules = courseIds.length ? await this.prisma.courseModule.findMany({ where: { courseId: { in: courseIds } }, select: { id: true, courseId: true } }) : [];
    const lessonsInCourse = new Map<string, number>();
    for (const m of modules) lessonsInCourse.set(m.courseId, (lessonsInCourse.get(m.courseId) ?? 0) + (lessonCounts.find(l => l.moduleId === m.id)?._count._all ?? 0));
    const done = students.length ? await this.prisma.lessonProgress.groupBy({ by: ['studentId'], where: { studentId: { in: students.map(st => st.id) }, completed: true, lesson: { module: { courseId: { in: courseIds } } } }, _count: { _all: true } }) : [];
    const doneBy = new Map(done.map(x => [x.studentId, x._count._all]));
    const lastLesson = students.length ? await this.prisma.lessonProgress.groupBy({ by: ['studentId'], where: { studentId: { in: students.map(st => st.id) } }, _max: { updatedAt: true } }) : [];
    const lastBy = new Map(lastLesson.map(x => [x.studentId, x._max.updatedAt]));

    const rows = students.map(st => {
      const buys = [
        ...st.purchases.map(p => ({ name: p.package.name, at: p.purchasedAt, expiresAt: p.expiresAt, amount: p.amountPaid ?? 0, currency: p.currency ?? country.currency, courses: p.package.courseIds })),
        ...st.coursePurchases.map(c => ({ name: c.course.title, at: c.purchasedAt, expiresAt: c.expiresAt, amount: c.amountPaid, currency: c.currency, courses: [c.courseId] })),
      ].sort((a, b) => +b.at - +a.at);
      const active = buys.filter(b => !b.expiresAt || b.expiresAt > now);
      const ends = active.length && active.every(b => b.expiresAt) ? new Date(Math.max(...active.map(b => +b.expiresAt!))) : null;
      const total = [...new Set(buys.flatMap(b => b.courses))].reduce((n, id) => n + (lessonsInCourse.get(id) ?? 0), 0);
      const lastActive = [st.lastActiveDate, lastBy.get(st.id)].filter((x): x is Date => !!x).sort((a, b) => +b - +a)[0] ?? null;
      return {
        id: st.id, name: nameOf(st), email: st.email, joinedAt: st.createdAt, lastActive,
        bought: buys[0] ? { name: buys[0].name, amount: buys[0].amount, currency: buys[0].currency, at: buys[0].at, more: buys.length - 1 } : null,
        lessons: { done: Math.min(doneBy.get(st.id) ?? 0, total), total },
        access: active.length ? (ends ? 'until' : 'open') : buys.length ? 'ended' : 'none',
        endsAt: ends,
      };
    });
    const week = new Date(+now + 7 * 86_400_000), monthStart = new Date(now.getFullYear(), now.getMonth(), 1), lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      country: { name: country.name, currency: country.currency },
      stats: {
        students: rows.length,
        active: rows.filter(r => r.access === 'until' || r.access === 'open').length,
        joinedThisMonth: rows.filter(r => r.joinedAt >= monthStart).length,
        joinedLastMonth: rows.filter(r => r.joinedAt >= lastMonth && r.joinedAt < monthStart).length,
        endingThisWeek: rows.filter(r => r.endsAt && r.endsAt <= week).length,
      },
      rows,
    };
  }
}
