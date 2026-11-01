import { Injectable } from '@nestjs/common';
import { minorToMajor } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';

type Sale = { at: Date; amount: number; currency: string; kind: 'package' | 'course'; title: string; courseIds: string[]; countryId: string | null; studentEmail: string; gateway: string | null; invoiceNo: string | null; id: string };
const DAY = 86_400_000;

/**
 * One month of the business in a currency the admin picks: revenue, sales, new students and payouts,
 * sales by day, and breakdowns by course, teacher and country. Money in other currencies is converted
 * with the admin-maintained rates (1 unit = x USD); a currency with no rate is reported apart rather
 * than counted as zero.
 */
@Injectable()
export class ReportsOverviewService {
  constructor(private prisma: PrismaService) {}

  async overview(month?: string, base = 'GHS') {
    const now = new Date();
    const [y, m] = /^\d{4}-\d{2}$/.test(month ?? '') ? month!.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
    const start = new Date(y, m - 1, 1), end = new Date(y, m, 1), prevStart = new Date(y, m - 2, 1);
    base = base.toUpperCase();

    const rates = new Map((await this.prisma.exchangeRate.findMany()).map(r => [r.currency, r.toUsdRate]));
    rates.set('USD', 1);
    // Major units in the base currency, or null when either rate is missing
    const convert = (minor: number, currency: string) => {
      const major = minorToMajor(minor, currency);
      if (currency === base) return major;
      const from = rates.get(currency), to = rates.get(base);
      return from && to ? (major * from) / to : null;
    };

    const sales = await this.sales(prevStart, end);
    const inMonth = sales.filter(s => s.at >= start), before = sales.filter(s => s.at < start);
    const unconverted: Record<string, number> = {};
    const total = (xs: Sale[], track = false) => xs.reduce((n, s) => {
      const v = convert(s.amount, s.currency);
      if (v == null) { if (track) unconverted[s.currency] = (unconverted[s.currency] ?? 0) + s.amount; return n; }
      return n + v;
    }, 0);
    const revenue = total(inMonth, true), revenueBefore = total(before);

    const [newStudents, newBefore, payouts] = await Promise.all([
      this.prisma.userProfile.count({ where: { role: 'STUDENT', createdAt: { gte: start, lt: end } } }),
      this.prisma.userProfile.count({ where: { role: 'STUDENT', createdAt: { gte: prevStart, lt: start } } }),
      this.prisma.payoutStatement.findMany({ where: { status: 'PAID', paidAt: { gte: start, lt: end } }, select: { amount: true, currency: true } }),
    ]);
    const paidOut = payouts.reduce((n, p) => n + (convert(p.amount, p.currency) ?? 0), 0);

    const days = Array.from({ length: Math.round((+end - +start) / DAY) }, (_, i) => {
      const a = new Date(+start + i * DAY), b = new Date(+a + DAY);
      return { date: a, amount: Math.round(total(inMonth.filter(s => s.at >= a && s.at < b)) * 100) / 100 };
    });

    // Courses: a package sale is split evenly across its courses, as in the other reports
    const byCourse = new Map<string, { revenue: number; sales: number }>();
    for (const s of inMonth) {
      const v = convert(s.amount, s.currency) ?? 0;
      for (const id of s.courseIds) {
        const c = byCourse.get(id) ?? { revenue: 0, sales: 0 };
        c.revenue += v / s.courseIds.length; c.sales += 1;
        byCourse.set(id, c);
      }
    }
    const courseIds = [...byCourse.keys()];
    const [courses, enrolments, certificates] = await Promise.all([
      this.prisma.platformCourse.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true, teacherId: true, teacherPending: true, programme: { select: { shortName: true, name: true } }, subject: { select: { name: true } }, teacher: { select: { id: true, name: true, firstName: true, lastName: true, email: true } } } }),
      this.prisma.courseEnrollment.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds } }, _count: { _all: true } }),
      this.prisma.certificate.groupBy({ by: ['courseId'], where: { courseId: { in: courseIds } }, _count: { _all: true } }),
    ]);
    const count = (xs: { courseId: string; _count: { _all: number } }[], id: string) => xs.find(x => x.courseId === id)?._count._all ?? 0;
    const nameOf = (p: { name: string | null; firstName: string | null; lastName: string | null; email: string }) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email;
    const courseRows = courses.map(c => {
      const v = byCourse.get(c.id)!, students = count(enrolments, c.id);
      return {
        id: c.id, title: c.title, tag: [c.programme?.shortName ?? c.programme?.name, c.subject?.name].filter(Boolean).join(' · '),
        teacher: c.teacherPending ? null : nameOf(c.teacher), revenue: Math.round(v.revenue * 100) / 100, sales: v.sales, students,
        completion: students ? Math.round((count(certificates, c.id) / students) * 100) : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // Teachers: revenue of their courses, and what they earned in the month
    const teacherIds = [...new Set(courses.filter(c => !c.teacherPending).map(c => c.teacherId))];
    const earnings = teacherIds.length ? await this.prisma.walletTransaction.findMany({ where: { type: 'CREDIT', source: 'COURSE_SALE', createdAt: { gte: start, lt: end }, wallet: { userId: { in: teacherIds } } }, select: { amount: true, currency: true, wallet: { select: { userId: true } } } }) : [];
    const teacherRows = teacherIds.map(id => {
      const mine = courseRows.filter(c => courses.find(x => x.id === c.id)?.teacherId === id);
      const t = courses.find(c => c.teacherId === id)!.teacher;
      return {
        id, name: nameOf(t), email: t.email, courses: mine.length,
        revenue: Math.round(mine.reduce((n, c) => n + c.revenue, 0) * 100) / 100,
        earned: Math.round(earnings.filter(e => e.wallet.userId === id).reduce((n, e) => n + (convert(e.amount, e.currency) ?? 0), 0) * 100) / 100,
      };
    }).sort((a, b) => b.revenue - a.revenue);

    // Countries: by the buyer's country
    const countries = await this.prisma.country.findMany({ select: { id: true, name: true, currency: true } });
    const newByCountry = await this.prisma.userProfile.groupBy({ by: ['countryId'], where: { role: 'STUDENT', createdAt: { gte: start, lt: end } }, _count: { _all: true } });
    const countryRows = countries.map(c => {
      const mine = inMonth.filter(s => s.countryId === c.id);
      return { id: c.id, name: c.name, currency: c.currency, sales: mine.length, revenue: Math.round(total(mine) * 100) / 100, newStudents: newByCountry.find(x => x.countryId === c.id)?._count._all ?? 0 };
    }).filter(c => c.sales || c.newStudents).sort((a, b) => b.revenue - a.revenue);

    const pct = (a: number, b: number) => (b ? Math.round(((a - b) / b) * 100) : null);
    return {
      month: { start, end, label: start.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) },
      base, rates: [...rates.entries()].filter(([c]) => c !== 'USD').map(([currency, toUsd]) => ({ currency, toUsd })),
      unconverted: Object.entries(unconverted).map(([currency, amount]) => ({ currency, amount })),
      stats: {
        revenue: Math.round(revenue * 100) / 100, revenueChange: pct(revenue, revenueBefore),
        sales: inMonth.length, packageSales: inMonth.filter(s => s.kind === 'package').length, courseSales: inMonth.filter(s => s.kind === 'course').length,
        newStudents, newStudentsChange: pct(newStudents, newBefore), paidOut: Math.round(paidOut * 100) / 100,
      },
      days, courses: courseRows, teachers: teacherRows, countries: countryRows,
      purchases: inMonth.sort((a, b) => +b.at - +a.at).slice(0, 500).map(s => ({ id: s.id, at: s.at, kind: s.kind, title: s.title, studentEmail: s.studentEmail, amount: s.amount, currency: s.currency, inBase: convert(s.amount, s.currency), gateway: s.gateway, invoiceNo: s.invoiceNo })),
    };
  }

  /** Paid sales of packages and single courses in a window */
  private async sales(from: Date, to: Date): Promise<Sale[]> {
    const [pk, cs] = await Promise.all([
      this.prisma.packagePurchase.findMany({ where: { purchasedAt: { gte: from, lt: to }, amountPaid: { gt: 0 } }, select: { id: true, purchasedAt: true, amountPaid: true, currency: true, gateway: true, invoiceNo: true, package: { select: { name: true, courseIds: true, currency: true } }, student: { select: { email: true, countryId: true } } } }),
      this.prisma.coursePurchase.findMany({ where: { purchasedAt: { gte: from, lt: to }, amountPaid: { gt: 0 } }, select: { id: true, purchasedAt: true, amountPaid: true, currency: true, gateway: true, invoiceNo: true, courseId: true, course: { select: { title: true } }, student: { select: { email: true, countryId: true } } } }),
    ]);
    return [
      ...pk.map(p => ({ id: p.id, at: p.purchasedAt, amount: p.amountPaid ?? 0, currency: p.currency ?? p.package.currency, kind: 'package' as const, title: p.package.name, courseIds: p.package.courseIds.length ? p.package.courseIds : [], countryId: p.student.countryId, studentEmail: p.student.email, gateway: p.gateway, invoiceNo: p.invoiceNo })),
      ...cs.map(c => ({ id: c.id, at: c.purchasedAt, amount: c.amountPaid, currency: c.currency, kind: 'course' as const, title: c.course.title, courseIds: [c.courseId], countryId: c.student.countryId, studentEmail: c.student.email, gateway: c.gateway, invoiceNo: c.invoiceNo })),
    ];
  }
}
