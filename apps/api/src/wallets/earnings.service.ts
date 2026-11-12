import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { UserRole, minorToMajor } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { payoutMinimums, minimumFor } from '../payouts/payout-minimum';

const DAY = 86_400_000;
type Who = { name: string | null; firstName: string | null; lastName: string | null; email: string };
const shortName = (p: Who) => { const n = (p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0]).split(/\s+/); return n.length > 1 ? `${n[0]} ${n[1][0]}.` : n[0]; };

/** Masks an account number to its last four digits, e.g. "MTN Mobile Money ·· 1182" */
export const payoutLabel = (a: { bankName: string; accountNumber: string }) => `${a.bankName} ·· ${a.accountNumber.replace(/\s+/g, '').slice(-4)}`;

/**
 * Earnings for teachers, reviewers and country reps: what's owed, what was earned in a period,
 * where it came from, and payouts — read from wallet transactions (never edited directly).
 */
@Injectable()
export class EarningsService {
  constructor(private prisma: PrismaService) {}

  private range(key?: string) {
    const now = new Date();
    if (key === 'last') return { start: new Date(now.getFullYear(), now.getMonth() - 1, 1), end: new Date(now.getFullYear(), now.getMonth(), 1), label: 'last month' };
    if (key === 'year') return { start: new Date(now.getFullYear(), now.getMonth() - 5, 1), end: now, label: 'the last 6 months' };
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: now, label: 'this month' };
  }

  async mine(user: UserProfile, rangeKey?: string) {
    const role = user.role as UserRole;
    if (![UserRole.TEACHER, UserRole.SUBJECT_REVIEWER, UserRole.COUNTRY_REP].includes(role)) throw new ForbiddenException('Earnings are for teachers, reviewers and country reps');
    const { start, end, label } = this.range(rangeKey);
    const prevStart = new Date(+start - (+end - +start));
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [wallet, account, statements] = await Promise.all([
      this.prisma.wallet.findUnique({ where: { userId: user.id } }),
      this.prisma.payoutAccount.findUnique({ where: { userId: user.id } }),
      this.prisma.payoutStatement.findMany({ where: { recipientId: user.id }, orderBy: { periodEnd: 'desc' }, take: 24 }),
    ]);
    const currency = wallet?.currency ?? (await this.prisma.country.findUnique({ where: { id: user.countryId ?? '' }, select: { currency: true } }))?.currency ?? 'GHS';
    const tx = wallet ? await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id, createdAt: { gte: new Date(Math.min(+sixMonthsAgo, +prevStart)) } },
      orderBy: { createdAt: 'desc' },
      include: {
        packagePurchase: { select: { package: { select: { name: true } }, student: { select: { name: true, firstName: true, lastName: true, email: true } } } },
        coursePurchase: { select: { course: { select: { title: true } }, student: { select: { name: true, firstName: true, lastName: true, email: true } } } },
      },
    }) : [];
    const credits = tx.filter(t => t.type === 'CREDIT');
    const inRange = (t: { createdAt: Date }, a: Date, b: Date) => t.createdAt >= a && t.createdAt < b;
    const sum = (xs: { amount: number }[]) => xs.reduce((n, t) => n + t.amount, 0);
    const earned = sum(credits.filter(t => inRange(t, start, end)));
    const earnedBefore = sum(credits.filter(t => inRange(t, prevStart, start)));
    const paidAllTime = (await (wallet ? this.prisma.walletTransaction.aggregate({ where: { walletId: wallet.id, type: 'DEBIT', source: 'PAYOUT' }, _sum: { amount: true } }) : null))?._sum.amount ?? 0;

    const months = Array.from({ length: 6 }, (_, i) => {
      const a = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1), b = new Date(now.getFullYear(), now.getMonth() - 4 + i, 1);
      return { month: a, amount: sum(credits.filter(t => inRange(t, a, b))) };
    });

    // Where the money came from in the period
    const periodCredits = credits.filter(t => inRange(t, start, end));
    let breakdown: { name: string; amount: number; detail: string }[] = [];
    let share: { label: string; value: string } | null = null;
    if (role === UserRole.COUNTRY_REP) {
      const commission = periodCredits.filter(t => t.packagePurchaseId || t.coursePurchaseId);
      const bonus = periodCredits.filter(t => !t.packagePurchaseId && !t.coursePurchaseId);
      breakdown = [
        { name: 'Commission on sales', amount: sum(commission), detail: `${commission.length} sale${commission.length === 1 ? '' : 's'}` },
        { name: 'Active-student bonus', amount: sum(bonus), detail: bonus[0]?.description?.replace(/^Per-student bonus:\s*/, '') ?? 'paid on the 1st' },
      ];
      const c = user.countryId ? await this.prisma.country.findUnique({ where: { id: user.countryId }, select: { repCommissionPercent: true, perStudentBonus: true, currency: true } }) : null;
      share = { label: 'Your terms', value: [c?.repCommissionPercent != null ? `${c.repCommissionPercent}%` : null, c?.perStudentBonus ? `+ ${c.currency} ${minorToMajor(c.perStudentBonus, c.currency)} a student` : null].filter(Boolean).join(' ') || 'not set' };
    } else {
      const byCourse = new Map<string, { amount: number; count: number }>();
      for (const t of periodCredits) {
        const k = t.courseId ?? 'other';
        const cur = byCourse.get(k) ?? { amount: 0, count: 0 };
        cur.amount += t.amount; cur.count++;
        byCourse.set(k, cur);
      }
      const titles = await this.prisma.platformCourse.findMany({ where: { id: { in: [...byCourse.keys()].filter(k => k !== 'other') } }, select: { id: true, title: true } });
      breakdown = [...byCourse.entries()].map(([k, v]) => ({ name: titles.find(c => c.id === k)?.title ?? 'Other earnings', amount: v.amount, detail: `${v.count} sale${v.count === 1 ? '' : 's'}` })).sort((a, b) => b.amount - a.amount);
      const pcts = (await this.prisma.courseAssignment.findMany({
        where: role === UserRole.TEACHER ? { teacherId: user.id } : { reviewerId: user.id },
        select: { teacherCommissionPct: true, reviewerCommissionPct: true },
      })).map(a => role === UserRole.TEACHER ? a.teacherCommissionPct : a.reviewerCommissionPct).filter((x): x is number => x != null);
      let pct: number | null = pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null;
      if (pct == null && role === UserRole.TEACHER) {
        const row = await this.prisma.platformSetting.findUnique({ where: { key: 'pricing' } });
        pct = (row?.value as any)?.defaultTeacherCommissionPct ?? null;
      }
      share = { label: 'Your share', value: pct != null ? `${pct}%` : 'set per course' };
    }

    // The 1st of next month, when statements are made
    const nextPayout = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const describe = (t: (typeof tx)[number]) => {
      const p = t.packagePurchase ?? t.coursePurchase;
      const item = t.packagePurchase?.package.name ?? t.coursePurchase?.course.title ?? null;
      const kind = t.source === 'PAYOUT' ? 'Payout' : t.source === 'REVIEW_COMMISSION' ? 'Review share' : t.source === 'COUNTRY_BONUS' ? (p ? 'Commission' : 'Active-student bonus') : t.source === 'COURSE_SALE' ? 'Course sale'
        : t.source === 'MANUAL_CREDIT' ? 'Added by CareerPath' : t.source === 'MENTOR_SESSION' ? 'Mentorship session' : t.source === 'LIVE_CLASS' ? 'Live class taught' : t.source === 'COHORT_SHARE' ? 'Cohort share' : 'Adjustment';
      return {
        id: t.id, at: t.createdAt, type: t.type, amount: t.amount, currency: t.currency,
        title: item ? `${kind} · ${item}` : kind,
        detail: [p ? shortName(p.student) : null, t.packagePurchase ? 'package' : t.coursePurchase ? 'single course' : null, !p ? t.description : null].filter(Boolean).join(' · '),
      };
    };

    // ── The wallet as drawn: earnings by kind, KPIs with six-month trends, the payout minimum ──
    const kindOf = (t: (typeof tx)[number]): string =>
      t.source === 'COURSE_SALE' ? 'sale' : t.source === 'LIVE_CLASS' ? 'class' : t.source === 'COHORT_SHARE' ? 'cohort' : t.source === 'MENTOR_SESSION' ? 'mentor'
        : t.source === 'REVIEW_COMMISSION' ? 'review' : t.source === 'COUNTRY_BONUS' ? (t.packagePurchaseId || t.coursePurchaseId ? 'commission' : 'bonus') : 'credit';
    const sharePct = share?.value ?? '';
    const KINDS: Record<string, [string, string][]> = {
      [UserRole.TEACHER]: [['sale', 'Course sales'], ['class', 'Live classes'], ['cohort', 'Cohort share'], ['mentor', 'Mentorship'], ['credit', 'Added by CareerPath']],
      [UserRole.SUBJECT_REVIEWER]: [['review', 'Review share'], ['credit', 'Added by CareerPath']],
      [UserRole.COUNTRY_REP]: [['commission', 'Commission'], ['bonus', 'Active-student bonus'], ['credit', 'Added by CareerPath']],
    };
    const HOW: Record<string, string> = {
      sale: sharePct && sharePct !== 'set per course' ? `${sharePct} of each sale of your courses` : 'Your share of each sale of your courses',
      class: 'For each live class you teach', cohort: 'Of sales that put a student in your class', mentor: 'For each mentorship session held',
      review: sharePct && sharePct !== 'set per course' ? `${sharePct} of each sale of courses you approved` : 'Your share of courses you approved',
      commission: 'On every sale to a student in your country', bonus: 'Each month, per student with an active package', credit: 'Marking, bonuses and corrections',
    };
    const kinds = KINDS[role];
    const monthBounds = months.map((m, i) => [m.month, i < 5 ? months[i + 1].month : new Date(now.getFullYear(), now.getMonth() + 1, 1)] as const);
    const byKindMonth = monthBounds.map(([a, b]) => Object.fromEntries(kinds.map(([k]) => [k, sum(credits.filter(t => inRange(t, a, b) && kindOf(t) === k))])));
    const split = kinds.map(([key, name]) => ({ key, name, how: HOW[key], amount: sum(periodCredits.filter(t => kindOf(t) === key)) }));

    // Which months the chosen period covers, for KPI values and their change
    const idx = rangeKey === 'last' ? [4] : rangeKey === 'year' ? [0, 1, 2, 3, 4, 5] : [5];
    const prevIdx = rangeKey === 'last' ? [3] : rangeKey === 'year' ? null : [4];
    const kpi = (label: string, series: number[], opts: { money?: boolean; unit?: string; sub?: string } = {}) => {
      const value = idx.reduce((n, i) => n + series[i], 0);
      const before = prevIdx ? prevIdx.reduce((n, i) => n + series[i], 0) : null;
      const change = before == null ? null : opts.money ? (before ? Math.round(((value - before) / before) * 100) : null) : value - before;
      return { label, value, money: !!opts.money, unit: opts.unit ?? null, sub: opts.sub ?? null, series, change, changeIsPct: !!opts.money };
    };
    const monthlyCredits = months.map(m => m.amount);
    let kpis: ReturnType<typeof kpi>[] = [];
    if (role === UserRole.TEACHER) {
      const [classes, bookings] = await Promise.all([
        this.prisma.liveClass.findMany({ where: { cohort: { teacherId: user.id }, status: 'COMPLETED', scheduledAt: { gte: sixMonthsAgo } }, select: { scheduledAt: true, durationMins: true } }),
        this.prisma.mentorBooking.findMany({ where: { slot: { teacherId: user.id, startsAt: { gte: sixMonthsAgo, lt: now } }, status: { not: 'CANCELLED' } }, select: { slot: { select: { startsAt: true } } } }),
      ]);
      const per = <T,>(xs: T[], at: (x: T) => Date, val: (x: T) => number = () => 1) => monthBounds.map(([a, b]) => xs.filter(x => at(x) >= a && at(x) < b).reduce((n, x) => n + val(x), 0));
      const sales = per(credits.filter(t => t.source === 'COURSE_SALE'), t => t.createdAt);
      kpis = [
        kpi('Earned', monthlyCredits, { money: true }),
        kpi('Course sales', sales, { sub: 'sold, alone or in packages' }),
        kpi('Hours taught', per(classes, c => c.scheduledAt, c => Math.round((c.durationMins / 60) * 10) / 10), { unit: 'h', sub: 'live classes' }),
        kpi('Mentor sessions', per(bookings, b => b.slot.startsAt), { sub: 'held' }),
      ];
    } else if (role === UserRole.SUBJECT_REVIEWER) {
      const assigned = await this.prisma.courseAssignment.findMany({ where: { reviewerId: user.id }, select: { reviewStatus: true, reviewedAt: true, submittedAt: true } });
      const approvedBy = monthBounds.map(([, b]) => assigned.filter(a => a.reviewStatus === 'APPROVED' && a.reviewedAt && a.reviewedAt < b).length);
      const submitted = monthBounds.map(([a, b]) => assigned.filter(x => x.submittedAt && x.submittedAt >= a && x.submittedAt < b).length);
      kpis = [
        kpi('Earned', monthlyCredits, { money: true }),
        { ...kpi('Approved courses', approvedBy, { sub: 'earning for you' }), value: approvedBy[5], change: approvedBy[5] - approvedBy[4] },
        kpi('Sent for review', submitted, { sub: `${assigned.filter(a => a.reviewStatus === 'PENDING').length} waiting now` }),
        { ...kpi('Paid to you', monthBounds.map(() => 0), { money: true, sub: 'all time' }), value: paidAllTime, change: null },
      ];
    } else {
      const countryId = user.countryId ?? '';
      const [pp, cp, students] = await Promise.all([
        this.prisma.packagePurchase.findMany({ where: { student: { countryId }, purchasedAt: { gte: sixMonthsAgo } }, select: { purchasedAt: true } }),
        this.prisma.coursePurchase.findMany({ where: { student: { countryId }, purchasedAt: { gte: sixMonthsAgo } }, select: { purchasedAt: true } }),
        this.prisma.userProfile.findMany({ where: { countryId, role: 'STUDENT', createdAt: { gte: sixMonthsAgo } }, select: { createdAt: true } }),
      ]);
      const per = (xs: Date[]) => monthBounds.map(([a, b]) => xs.filter(d => d >= a && d < b).length);
      const active = await Promise.all(monthBounds.map(([, b]) => this.prisma.packagePurchase.count({ where: { student: { countryId }, purchasedAt: { lt: b }, OR: [{ expiresAt: null }, { expiresAt: { gte: b } }] } })));
      kpis = [
        kpi('Earned', monthlyCredits, { money: true }),
        kpi('Sales in your country', per([...pp.map(x => x.purchasedAt), ...cp.map(x => x.purchasedAt)])),
        { ...kpi('Active students', active, { sub: 'with a package' }), value: active[5], change: active[5] - active[4] },
        kpi('New students', per(students.map(s => s.createdAt)), { sub: 'signed up' }),
      ];
    }
    const minimum = minimumFor(await payoutMinimums(this.prisma), currency);

    return {
      currency, range: label,
      kinds: kinds.map(([key, name]) => ({ key, name })),
      byKindMonth, split, kpis, minimum,
      owed: wallet?.balance ?? 0,
      nextPayout,
      account: account ? { label: payoutLabel(account), verified: account.isVerified } : null,
      stats: {
        earned, earnedBefore, changePct: earnedBefore ? Math.round(((earned - earnedBefore) / earnedBefore) * 100) : null,
        count: periodCredits.filter(t => t.source !== 'COUNTRY_BONUS' || t.packagePurchaseId || t.coursePurchaseId).length,
        paidAllTime, share,
      },
      months, breakdown,
      activity: tx.slice(0, 60).map(t => ({ ...describe(t), kind: t.type === 'DEBIT' ? 'payout' : kindOf(t) })),
      payouts: statements.map(s => ({ id: s.id, periodStart: s.periodStart, periodEnd: s.periodEnd, amount: s.amount, currency: s.currency, status: s.status, paidAt: s.paidAt, reference: s.reference, paidTo: s.paidTo })),
    };
  }
}
