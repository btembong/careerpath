import { Injectable, NotFoundException } from '@nestjs/common';
import { minorToMajor } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;
type Kind = 'package' | 'course' | 'extra';
type Sale = { id: string; at: Date; amount: number; currency: string; kind: Kind; itemId: string; item: string; countryId: string | null; packagePurchaseId: string | null; coursePurchaseId: string | null };
type Who = { name: string | null; firstName: string | null; lastName: string | null; email: string };
const nameOf = (p: Who) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
const shortName = (p: Who) => { const n = nameOf(p).split(/\s+/); return n.length > 1 ? `${n[0]} ${n[1][0]}.` : n[0]; };
const round = (n: number) => Math.round(n * 100) / 100;
const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/**
 * How the platform is doing: people and activity, sign-ups, the student and teacher journeys, learning,
 * and money by country. Money is added up in one currency with the admin's exchange rates (Reports).
 */
@Injectable()
export class InsightsService {
  constructor(private prisma: PrismaService) {}

  private async converter(base: string) {
    const rates = new Map((await this.prisma.exchangeRate.findMany()).map(r => [r.currency, r.toUsdRate]));
    rates.set('USD', 1);
    // Major units in the base currency; a currency without a rate counts as nothing (and is listed apart)
    return (minor: number, currency: string) => {
      const major = minorToMajor(minor, currency);
      if (currency === base) return major;
      const from = rates.get(currency), to = rates.get(base);
      return from && to ? (major * from) / to : 0;
    };
  }

  /** Paid sales between two dates: packages, single courses and extras added later */
  private async sales(from: Date, to: Date, countryId?: string): Promise<Sale[]> {
    const student = countryId ? { student: { countryId } } : {};
    const [pk, cs, ex] = await Promise.all([
      this.prisma.packagePurchase.findMany({ where: { purchasedAt: { gte: from, lt: to }, amountPaid: { gt: 0 }, ...student }, select: { id: true, purchasedAt: true, amountPaid: true, currency: true, package: { select: { id: true, name: true, currency: true } }, student: { select: { countryId: true } } } }),
      this.prisma.coursePurchase.findMany({ where: { purchasedAt: { gte: from, lt: to }, amountPaid: { gt: 0 }, ...student }, select: { id: true, purchasedAt: true, amountPaid: true, currency: true, course: { select: { id: true, title: true } }, student: { select: { countryId: true } } } }),
      this.prisma.paymentAttempt.findMany({ where: { kind: 'addon', status: 'PAID', paidAt: { gte: from, lt: to }, ...student }, select: { id: true, paidAt: true, amount: true, currency: true, title: true, packagePurchaseId: true, coursePurchaseId: true, student: { select: { countryId: true } } } }),
    ]);
    return [
      ...pk.map(p => ({ id: p.id, at: p.purchasedAt, amount: p.amountPaid ?? 0, currency: p.currency ?? p.package.currency, kind: 'package' as const, itemId: p.package.id, item: p.package.name, countryId: p.student.countryId, packagePurchaseId: p.id, coursePurchaseId: null })),
      ...cs.map(c => ({ id: c.id, at: c.purchasedAt, amount: c.amountPaid, currency: c.currency, kind: 'course' as const, itemId: c.course.id, item: c.course.title, countryId: c.student.countryId, packagePurchaseId: null, coursePurchaseId: c.id })),
      ...ex.map(a => ({ id: a.id, at: a.paidAt!, amount: a.amount, currency: a.currency, kind: 'extra' as const, itemId: a.title, item: a.title, countryId: a.student.countryId, packagePurchaseId: null, coursePurchaseId: null })),
    ];
  }

  /** Who was paid out of these sales, by wallet source (teachers, reviewers, class teachers, reps) */
  private async creditsFor(sales: Sale[]) {
    const pk = sales.filter(s => s.kind === 'package').map(s => s.id), cs = sales.filter(s => s.kind === 'course').map(s => s.id);
    if (!pk.length && !cs.length) return [];
    return this.prisma.walletTransaction.findMany({
      where: { type: 'CREDIT', OR: [...(pk.length ? [{ packagePurchaseId: { in: pk } }] : []), ...(cs.length ? [{ coursePurchaseId: { in: cs } }] : [])] },
      select: { amount: true, currency: true, source: true, packagePurchaseId: true, coursePurchaseId: true },
    });
  }

  private periodOf(key?: string) {
    const now = new Date();
    if (key === 'last') return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1), label: 'Last month' };
    if (key === 'six') return { start: new Date(now.getFullYear(), now.getMonth() - 5, 1), end: now, label: 'Last 6 months' };
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: 'This month' };
  }

  private months6() {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
      const a = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1), b = new Date(now.getFullYear(), now.getMonth() - 4 + i, 1);
      return { start: a, end: b, label: a.toLocaleDateString('en-GB', { month: 'short' }) };
    });
  }

  // ── Overview ───────────────────────────────────────────

  async overview(daysKey?: string) {
    const days = ['7', '30', '365'].includes(daysKey ?? '') ? Number(daysKey) : 30;
    const now = new Date(), from = new Date(+now - days * DAY), prevFrom = new Date(+from - days * DAY);
    const base = 'XAF';
    const convert = await this.converter(base);
    const live = { deletedAt: null };

    const [roleCounts, countryUsers, newStudents, newStudentsPrev, newTeachers, pending, oldestPending, payingIds, lessons, lessonsPrev, quizzes, certs, watched, classes, mentorHeld, mentorMissed, teacherApps, approved, withCourse, withSales, devicesRaw] = await Promise.all([
      this.prisma.userProfile.groupBy({ by: ['role'], where: live, _count: { _all: true } }),
      this.prisma.userProfile.groupBy({ by: ['countryId', 'role'], where: live, _count: { _all: true } }),
      this.prisma.userProfile.count({ where: { ...live, role: 'STUDENT', createdAt: { gte: from } } }),
      this.prisma.userProfile.count({ where: { ...live, role: 'STUDENT', createdAt: { gte: prevFrom, lt: from } } }),
      this.prisma.userProfile.count({ where: { ...live, role: 'TEACHER', createdAt: { gte: from } } }),
      this.prisma.userProfile.count({ where: { ...live, role: 'TEACHER', approvalStatus: 'PENDING' } }),
      this.prisma.userProfile.findFirst({ where: { ...live, role: 'TEACHER', approvalStatus: 'PENDING' }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      Promise.all([
        this.prisma.packagePurchase.findMany({ where: { amountPaid: { gt: 0 } }, select: { studentId: true }, distinct: ['studentId'] }),
        this.prisma.coursePurchase.findMany({ where: { amountPaid: { gt: 0 } }, select: { studentId: true }, distinct: ['studentId'] }),
      ]).then(([a, b]) => new Set([...a, ...b].map(x => x.studentId))),
      this.prisma.lessonProgress.count({ where: { completed: true, updatedAt: { gte: from } } }),
      this.prisma.lessonProgress.count({ where: { completed: true, updatedAt: { gte: prevFrom, lt: from } } }),
      this.prisma.quizAttempt.count({ where: { submittedAt: { gte: from } } }),
      this.prisma.certificate.count({ where: { issuedAt: { gte: from } } }),
      this.prisma.lessonProgress.aggregate({ where: { updatedAt: { gte: from } }, _sum: { watchedSecs: true } }),
      this.prisma.liveClass.findMany({ where: { scheduledAt: { gte: from, lt: now }, status: { not: 'CANCELLED' } }, select: { id: true, cohortId: true, _count: { select: { attendance: true } } } }),
      this.prisma.mentorBooking.count({ where: { status: 'COMPLETED', slot: { startsAt: { gte: from } } } }),
      this.prisma.mentorBooking.count({ where: { status: 'MISSED', slot: { startsAt: { gte: from } } } }),
      this.prisma.teacherApplication.count(),
      this.prisma.userProfile.count({ where: { ...live, role: 'TEACHER', approvalStatus: 'APPROVED' } }),
      this.prisma.platformCourse.findMany({ where: { status: 'PUBLISHED', teacherPending: false, teacher: { role: 'TEACHER' } }, select: { teacherId: true }, distinct: ['teacherId'] }),
      this.prisma.walletTransaction.findMany({ where: { type: 'CREDIT', source: 'COURSE_SALE' }, select: { wallet: { select: { userId: true } } }, distinct: ['walletId'] }),
      this.prisma.userProfile.groupBy({ by: ['lastDevice'], where: { ...live, lastSeenAt: { gte: new Date(+now - 30 * DAY) } }, _count: { _all: true } }),
    ]);

    const byRole = (r: string) => roleCounts.find(x => x.role === r)?._count._all ?? 0;
    const total = roleCounts.reduce((n, r) => n + r._count._all, 0);
    const students = byRole('STUDENT');

    // Active people: one ActiveDay row per person per day
    const actFrom = new Date(+dayStart(now) - 182 * DAY);
    const act = await this.prisma.activeDay.findMany({ where: { day: { gte: actFrom } }, select: { userId: true, day: true } });
    const distinctSince = (a: Date, b: Date) => new Set(act.filter(x => x.day >= a && x.day < b).map(x => x.userId)).size;
    const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const series = (n: number, span: number) => Array.from({ length: n }, (_, i) => {
      const end = new Date(+today + DAY - (n - 1 - i) * span * DAY);
      return distinctSince(new Date(+end - span * DAY), end);
    });

    // Live classes: attendance against each class's roster
    const rosters = classes.length ? await this.prisma.cohortRoster.groupBy({ by: ['cohortId'], where: { cohortId: { in: [...new Set(classes.map(c => c.cohortId))] } }, _count: { _all: true } }) : [];
    const seats = classes.reduce((n, c) => n + (rosters.find(r => r.cohortId === c.cohortId)?._count._all ?? 0), 0);
    const came = classes.reduce((n, c) => n + c._count.attendance, 0);

    // Map: people and sales by country
    const [countries, sales, signupsByCountry] = await Promise.all([
      this.prisma.country.findMany({ select: { id: true, code: true, name: true } }),
      this.sales(from, now),
      this.prisma.userProfile.groupBy({ by: ['countryId'], where: { ...live, createdAt: { gte: from } }, _count: { _all: true } }),
    ]);
    const cu = (id: string | null, role: string) => countryUsers.find(x => x.countryId === id && x.role === role)?._count._all ?? 0;
    const map = countries.map(c => ({
      code: c.code.toUpperCase(), name: c.name, id: c.id,
      students: cu(c.id, 'STUDENT'), teachers: cu(c.id, 'TEACHER'),
      signups: signupsByCountry.find(x => x.countryId === c.id)?._count._all ?? 0,
      sales: round(sales.filter(s => s.countryId === c.id).reduce((n, s) => n + convert(s.amount, s.currency), 0)),
    }));
    const unknown = { students: cu(null, 'STUDENT'), teachers: cu(null, 'TEACHER') };

    // Sign-ups over time: by day (up to 30 days) or by month
    const signupRows = await this.prisma.userProfile.findMany({ where: { ...live, createdAt: { gte: from }, role: { in: ['STUDENT', 'TEACHER'] } }, select: { createdAt: true, role: true, signupSource: true, id: true, onboardingCompleted: true } });
    const buckets = days <= 30
      ? Array.from({ length: days }, (_, i) => { const a = new Date(+dayStart(now) - (days - 1 - i) * DAY); return { start: a, end: new Date(+a + DAY), label: a.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) }; })
      : Array.from({ length: 12 }, (_, i) => { const a = new Date(now.getFullYear(), now.getMonth() - 11 + i, 1); return { start: a, end: new Date(now.getFullYear(), now.getMonth() - 10 + i, 1), label: a.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }) }; });
    const signups = buckets.map(b => {
      const r = signupRows.filter(x => x.createdAt >= b.start && x.createdAt < b.end);
      return { label: b.label, students: r.filter(x => x.role === 'STUDENT').length, teachers: r.filter(x => x.role === 'TEACHER').length };
    });

    // The student journey, for students who signed up in the period
    const newIds = signupRows.filter(x => x.role === 'STUDENT').map(x => x.id);
    const [opened, finished, seatIds] = newIds.length ? await Promise.all([
      this.prisma.lessonProgress.findMany({ where: { studentId: { in: newIds } }, select: { studentId: true }, distinct: ['studentId'] }),
      this.prisma.lessonProgress.findMany({ where: { studentId: { in: newIds }, completed: true }, select: { studentId: true }, distinct: ['studentId'] }),
      this.prisma.orgSeat.findMany({ where: { studentId: { in: newIds } }, select: { studentId: true } }),
    ]) : [[], [], []];
    const school = new Set(seatIds.map(s => s.studentId));
    const newStudentRows = signupRows.filter(x => x.role === 'STUDENT');
    const sourceOf = (x: { id: string; signupSource: string | null }) => school.has(x.id) ? 'school' : x.signupSource === 'referral' ? 'referral' : x.signupSource === 'website' || x.signupSource === 'import' ? 'website' : x.signupSource === 'google' ? 'google' : 'portal';
    const sourceCount = (k: string) => newStudentRows.filter(x => sourceOf(x) === k).length;

    const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
    const dev = (k: string) => devicesRaw.find(d => d.lastDevice === k)?._count._all ?? 0;
    return {
      days, base,
      total, newUsers: signupRows.length, countries: new Set(countryUsers.filter(x => x.countryId).map(x => x.countryId)).size,
      roles: [['STUDENT', 'Students'], ['TEACHER', 'Teachers'], ['SUBJECT_REVIEWER', 'Reviewers'], ['COUNTRY_REP', 'Country reps'], ['ORG_ADMIN', 'School staff'], ['ADMIN', 'Admins']].map(([r, l]) => ({ role: r, label: l, count: byRole(r) })),
      paidPct: students ? Math.round((payingIds.size / students) * 100) : 0,
      active: {
        today: distinctSince(today, new Date(+today + DAY)), week: distinctSince(new Date(+today - 6 * DAY), new Date(+today + DAY)), month: distinctSince(new Date(+today - 29 * DAY), new Date(+today + DAY)),
        todaySeries: series(14, 1), weekSeries: series(8, 7), monthSeries: series(6, 30),
      },
      kpis: {
        newStudents, newStudentsChange: pct(newStudents, newStudentsPrev), newTeachers, pending,
        oldestPendingDays: oldestPending ? Math.floor((+now - +oldestPending.createdAt) / DAY) : null,
        paying: payingIds.size, lessons, lessonsChange: pct(lessons, lessonsPrev),
        classesHeld: classes.length, attendancePct: seats ? Math.round((came / seats) * 100) : null,
        mentorHeld, mentorMissed,
      },
      map, unknown,
      signups, signupsBy: days <= 30 ? 'day' : 'month',
      funnel: [
        { label: 'Signed up', n: newIds.length },
        { label: 'Finished onboarding', n: newStudentRows.filter(x => x.onboardingCompleted).length },
        { label: 'Opened a first lesson', n: opened.length },
        { label: 'Finished a lesson', n: finished.length },
        { label: 'Paid for a course or package', n: newIds.filter(id => payingIds.has(id)).length },
      ],
      teachers: [
        { label: 'Teacher accounts', n: Math.max(teacherApps, byRole('TEACHER')) }, { label: 'Approved', n: approved },
        { label: 'Have a course', n: withCourse.length }, { label: 'Have sales', n: withSales.length },
      ],
      sources: [
        { key: 'portal', label: 'Signed up on the portal', n: sourceCount('portal') },
        { key: 'referral', label: 'A friend’s link', n: sourceCount('referral') },
        { key: 'school', label: 'Invited by their school', n: sourceCount('school') },
        { key: 'website', label: 'Came from the website', n: sourceCount('website') },
        { key: 'google', label: 'Google sign-in', n: sourceCount('google') },
      ].filter(s => s.n > 0 || s.key !== 'google'),
      learning: { lessons, quizzes, hours: Math.round((watched._sum.watchedSecs ?? 0) / 3600), certificates: certs },
      devices: { phone: dev('phone'), tablet: dev('tablet'), computer: dev('computer') },
    };
  }

  // ── All countries side by side ──────────────────────────

  async countries(periodKey?: string) {
    const base = 'XAF';
    const convert = await this.converter(base);
    const { start, end, label } = this.periodOf(periodKey);
    const months = this.months6();
    const [countries, users, newUsers, sales, sales6] = await Promise.all([
      this.prisma.country.findMany({ select: { id: true, code: true, name: true, currency: true, reps: { where: { role: 'COUNTRY_REP' }, select: { name: true, firstName: true, lastName: true, email: true }, take: 1 } }, orderBy: { name: 'asc' } }),
      this.prisma.userProfile.groupBy({ by: ['countryId', 'role'], where: { deletedAt: null }, _count: { _all: true } }),
      this.prisma.userProfile.groupBy({ by: ['countryId'], where: { deletedAt: null, role: 'STUDENT', createdAt: { gte: start, lt: end } }, _count: { _all: true } }),
      this.sales(start, end),
      this.sales(months[0].start, new Date()),
    ]);
    const credits = await this.creditsFor(sales);
    const saleCountry = new Map(sales.map(s => [s.id, s.countryId]));
    const creditCountry = (c: { packagePurchaseId: string | null; coursePurchaseId: string | null }) => saleCountry.get((c.packagePurchaseId ?? c.coursePurchaseId)!) ?? null;
    const sum = (xs: { amount: number; currency: string }[]) => round(xs.reduce((n, x) => n + convert(x.amount, x.currency), 0));
    const cu = (id: string | null, role: string) => users.find(x => x.countryId === id && x.role === role)?._count._all ?? 0;

    const rows = countries.map(c => {
      const mine = sales.filter(s => s.countryId === c.id), cr = credits.filter(x => creditCountry(x) === c.id);
      const salesV = sum(mine);
      const teachersEarned = sum(cr.filter(x => x.source === 'COURSE_SALE' || x.source === 'COHORT_SHARE' || x.source === 'REVIEW_COMMISSION'));
      const repEarned = sum(cr.filter(x => x.source === 'COUNTRY_BONUS'));
      return {
        id: c.id, code: c.code.toUpperCase(), name: c.name, currency: c.currency, rep: c.reps[0] ? nameOf(c.reps[0]) : null,
        students: cu(c.id, 'STUDENT'), newStudents: newUsers.find(x => x.countryId === c.id)?._count._all ?? 0, teachers: cu(c.id, 'TEACHER'),
        sales: salesV, salesCount: mine.length, teachersEarned, repEarned, kept: round(salesV - teachersEarned - repEarned),
        trend: months.map(m => sum(sales6.filter(s => s.countryId === c.id && s.at >= m.start && s.at < m.end))),
      };
    }).sort((a, b) => b.sales - a.sales || b.students - a.students);
    const t = (k: 'students' | 'newStudents' | 'teachers' | 'sales' | 'teachersEarned' | 'repEarned' | 'kept') => round(rows.reduce((n, r) => n + r[k], 0));
    return {
      base, period: label, months: months.map(m => ({ label: m.label, start: m.start })), rows,
      unknown: { students: cu(null, 'STUDENT'), teachers: cu(null, 'TEACHER') },
      totals: { students: t('students'), newStudents: t('newStudents'), teachers: t('teachers'), sales: t('sales'), teachersEarned: t('teachersEarned'), repEarned: t('repEarned'), kept: t('kept'),
        trend: months.map((_, i) => round(rows.reduce((n, r) => n + r.trend[i], 0))) },
    };
  }

  // ── One country (admin, or the country's rep) ────────────

  async country(countryId: string, periodKey?: string, forRep?: { repId: string }) {
    const c = await this.prisma.country.findUnique({ where: { id: countryId }, include: { reps: { where: { role: 'COUNTRY_REP' }, select: { id: true, name: true, firstName: true, lastName: true, email: true }, take: 1 } } });
    if (!c) throw new NotFoundException('Country not found');
    const base = c.currency;
    const convert = await this.converter(base);
    const { start, end, label } = this.periodOf(periodKey);
    const prevStart = new Date(+start - (+end - +start));
    const months = this.months6();
    const now = new Date();
    const sum = (xs: { amount: number; currency: string }[]) => round(xs.reduce((n, x) => n + convert(x.amount, x.currency), 0));

    const [sales, prevSales, sales6, students, newStudents, newPrev, teachers, studentGrowth, newest] = await Promise.all([
      this.sales(start, end, c.id), this.sales(prevStart, start, c.id), this.sales(months[0].start, now, c.id),
      this.prisma.userProfile.count({ where: { deletedAt: null, role: 'STUDENT', countryId: c.id } }),
      this.prisma.userProfile.count({ where: { deletedAt: null, role: 'STUDENT', countryId: c.id, createdAt: { gte: start, lt: end } } }),
      this.prisma.userProfile.count({ where: { deletedAt: null, role: 'STUDENT', countryId: c.id, createdAt: { gte: prevStart, lt: start } } }),
      this.prisma.userProfile.findMany({ where: { deletedAt: null, role: 'TEACHER', approvalStatus: 'APPROVED', countryId: c.id }, select: { id: true, name: true, firstName: true, lastName: true, email: true, teacherApplication: { select: { subjectAreas: true } }, platformCourses: { where: { status: 'PUBLISHED' }, select: { id: true } }, teacherCohorts: { select: { id: true } } } }),
      Promise.all(months.map(m => this.prisma.userProfile.count({ where: { deletedAt: null, role: 'STUDENT', countryId: c.id, createdAt: { lt: m.end } } }))),
      this.prisma.userProfile.findMany({ where: { deletedAt: null, role: 'STUDENT', countryId: c.id }, orderBy: { createdAt: 'desc' }, take: 6, select: { id: true, name: true, firstName: true, lastName: true, email: true, createdAt: true, _count: { select: { purchases: true, coursePurchases: true } } } }),
    ]);
    const active = await this.prisma.activeDay.findMany({ where: { day: { gte: new Date(+now - 30 * DAY) }, user: { countryId: c.id, role: 'STUDENT' } }, select: { userId: true }, distinct: ['userId'] });

    const credits = await this.creditsFor(sales);
    const bySource = (...src: string[]) => sum(credits.filter(x => src.includes(x.source)));
    const salesV = sum(sales), prevV = sum(prevSales);
    const courseTeachers = bySource('COURSE_SALE'), reviewers = bySource('REVIEW_COMMISSION'), classTeachers = bySource('COHORT_SHARE'), repCut = bySource('COUNTRY_BONUS');

    // Teachers who live here: what they earned in the period (all sources), and their students
    const tIds = teachers.map(t => t.id);
    const [tCredits, enrol] = await Promise.all([
      tIds.length ? this.prisma.walletTransaction.findMany({ where: { type: 'CREDIT', createdAt: { gte: start, lt: end }, wallet: { userId: { in: tIds } } }, select: { amount: true, currency: true, wallet: { select: { userId: true } } } }) : [],
      tIds.length ? this.prisma.courseEnrollment.groupBy({ by: ['courseId'], where: { courseId: { in: teachers.flatMap(t => t.platformCourses.map(x => x.id)) } }, _count: { _all: true } }) : [],
    ]);
    const teacherRows = teachers.map(t => ({
      id: t.id, name: nameOf(t),
      subjects: (t.teacherApplication?.subjectAreas ?? []).filter(s => !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s)).slice(0, 2),
      courses: t.platformCourses.length, classes: t.teacherCohorts.length,
      students: t.platformCourses.reduce((n, x) => n + (enrol.find(e => e.courseId === x.id)?._count._all ?? 0), 0),
      earned: forRep ? null : sum(tCredits.filter(x => x.wallet.userId === t.id)),
    })).sort((a, b) => (b.earned ?? b.students) - (a.earned ?? a.students)).slice(0, 8);

    // Best sellers
    const top = new Map<string, { name: string; kind: Kind; count: number; amount: number }>();
    for (const s of sales) { const x = top.get(s.kind + s.itemId) ?? { name: s.item, kind: s.kind, count: 0, amount: 0 }; x.count++; x.amount += convert(s.amount, s.currency); top.set(s.kind + s.itemId, x); }

    // The rep: their own earnings and what they're owed
    const rep = c.reps[0] ?? null;
    const repWallet = rep ? await this.prisma.wallet.findUnique({ where: { userId: rep.id } }) : null;
    const repTx = repWallet ? await this.prisma.walletTransaction.findMany({ where: { walletId: repWallet.id, type: 'CREDIT', source: 'COUNTRY_BONUS', createdAt: { gte: start, lt: end } }, select: { amount: true, currency: true, packagePurchaseId: true, coursePurchaseId: true } }) : [];
    const commission = sum(repTx.filter(x => x.packagePurchaseId || x.coursePurchaseId)), bonus = sum(repTx.filter(x => !x.packagePurchaseId && !x.coursePurchaseId));

    return {
      period: label, base,
      country: { id: c.id, code: c.code.toUpperCase(), name: c.name, currency: c.currency },
      rep: rep ? { name: nameOf(rep), commissionPct: c.repCommissionPercent, perStudentBonus: c.perStudentBonus, commission, bonus, earned: round(commission + bonus), owed: repWallet?.balance ?? 0, owedCurrency: repWallet?.currency ?? c.currency } : null,
      kpis: {
        students, newStudents, newStudentsBefore: newPrev, activeStudents: active.length,
        teachers: teachers.length, teachersWithStudents: teacherRows.filter(t => t.students > 0).length,
        sales: salesV, salesCount: sales.length, salesChange: prevV ? Math.round(((salesV - prevV) / prevV) * 100) : null,
        paidToTeachers: round(courseTeachers + reviewers + classTeachers),
      },
      trends: { students: studentGrowth, sales: months.map(m => sum(sales6.filter(s => s.at >= m.start && s.at < m.end))) },
      months: months.map(m => ({ label: m.label, start: m.start, package: sum(sales6.filter(s => s.kind === 'package' && s.at >= m.start && s.at < m.end)), course: sum(sales6.filter(s => s.kind === 'course' && s.at >= m.start && s.at < m.end)), extra: sum(sales6.filter(s => s.kind === 'extra' && s.at >= m.start && s.at < m.end)) })),
      split: forRep ? null : [
        { key: 'kept', label: 'CareerPath kept', amount: round(salesV - courseTeachers - reviewers - classTeachers - repCut) },
        { key: 'course', label: 'Course teachers', amount: courseTeachers },
        { key: 'class', label: 'Class teachers', amount: classTeachers },
        { key: 'review', label: 'Reviewers', amount: reviewers },
        { key: 'rep', label: 'Country rep', amount: repCut },
      ],
      teachers: teacherRows,
      top: [...top.values()].sort((a, b) => b.amount - a.amount).slice(0, 5).map(x => ({ ...x, amount: round(x.amount) })),
      newest: newest.map(s => ({ name: shortName(s), joinedAt: s.createdAt, bought: s._count.purchases + s._count.coursePurchases > 0 })),
    };
  }
}
