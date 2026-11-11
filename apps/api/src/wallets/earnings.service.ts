import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { UserRole, minorToMajor } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';

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
    if (key === 'year') return { start: new Date(now.getFullYear(), 0, 1), end: now, label: 'this year' };
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
      const kind = t.source === 'PAYOUT' ? 'Payout' : t.source === 'REVIEW_COMMISSION' ? 'Review share' : t.source === 'COUNTRY_BONUS' ? (p ? 'Commission' : 'Active-student bonus') : t.source === 'COURSE_SALE' ? 'Course sale' : 'Adjustment';
      return {
        id: t.id, at: t.createdAt, type: t.type, amount: t.amount, currency: t.currency,
        title: item ? `${kind} · ${item}` : kind,
        detail: [p ? shortName(p.student) : null, t.packagePurchase ? 'package' : t.coursePurchase ? 'single course' : null, !p ? t.description : null].filter(Boolean).join(' · '),
      };
    };

    return {
      currency, range: label,
      owed: wallet?.balance ?? 0,
      nextPayout,
      account: account ? { label: payoutLabel(account), verified: account.isVerified } : null,
      stats: {
        earned, earnedBefore, changePct: earnedBefore ? Math.round(((earned - earnedBefore) / earnedBefore) * 100) : null,
        count: periodCredits.filter(t => t.source !== 'COUNTRY_BONUS' || t.packagePurchaseId || t.coursePurchaseId).length,
        paidAllTime, share,
      },
      months, breakdown,
      activity: tx.slice(0, 60).map(describe),
      payouts: statements.map(s => ({ id: s.id, periodStart: s.periodStart, periodEnd: s.periodEnd, amount: s.amount, currency: s.currency, status: s.status, paidAt: s.paidAt, reference: s.reference, paidTo: s.paidTo })),
    };
  }
}
