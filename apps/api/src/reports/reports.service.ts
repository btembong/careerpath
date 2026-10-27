import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(private prisma: PrismaService) {}

  // ── Exchange rate helper ──────────────────────────────────

  /**
   * Load all exchange rates into a lookup map.
   * USD → USD is always 1.0.
   * Money amounts across different currencies are NEVER summed without going
   * through this table (see PLAN.md hard rule #12).
   */
  private async getRateMap(): Promise<Map<string, number>> {
    const rates = await this.prisma.exchangeRate.findMany();
    const map = new Map<string, number>(rates.map((r) => [r.currency, r.toUsdRate]));
    map.set('USD', 1.0);
    return map;
  }

  private toUsd(amount: number, currency: string, rateMap: Map<string, number>): number {
    const rate = rateMap.get(currency.toUpperCase()) ?? 0;
    return Math.round(amount * rate * 100) / 100; // round to 2dp
  }

  // ── Revenue by course ─────────────────────────────────────

  async getCourseRevenue() {
    const rateMap = await this.getRateMap();

    // All purchases with their package's course list and price
    const purchases = await this.prisma.packagePurchase.findMany({
      include: {
        package: {
          select: { courseIds: true, priceAmount: true, currency: true },
        },
      },
    });

    const courseRevenue = new Map<string, number>(); // courseId → USD

    for (const purchase of purchases) {
      const { courseIds, priceAmount, currency } = purchase.package;
      if (courseIds.length === 0) continue;

      // Even split across courses (default — see PLAN.md §7)
      const perCourseAmount = priceAmount / courseIds.length;
      const perCourseUsd = this.toUsd(perCourseAmount, currency, rateMap);

      for (const courseId of courseIds) {
        courseRevenue.set(courseId, (courseRevenue.get(courseId) ?? 0) + perCourseUsd);
      }
    }

    return Array.from(courseRevenue.entries())
      .map(([courseId, revenueUsd]) => ({ courseId, revenueUsd }))
      .sort((a, b) => b.revenueUsd - a.revenueUsd);
  }

  // ── Revenue by teacher ────────────────────────────────────

  async getTeacherRevenue() {
    const rateMap = await this.getRateMap();

    // Credits to teacher wallets from course sales
    const teacherCredits = await this.prisma.walletTransaction.findMany({
      where: { type: 'CREDIT', source: 'COURSE_SALE' },
      include: {
        wallet: {
          include: { user: { select: { email: true, role: true } } },
        },
      },
    });

    // Paid-out totals per teacher
    const payoutTotals = await this.prisma.walletTransaction.groupBy({
      by: ['walletId'],
      where: { type: 'DEBIT', source: 'PAYOUT' },
      _sum: { amount: true },
    });
    const payoutMap = new Map(payoutTotals.map((p) => [p.walletId, p._sum.amount ?? 0]));

    const teacherMap = new Map<
      string,
      { email: string; totalEarnedUsd: number; totalPaidOutUsd: number; currency: string }
    >();

    for (const tx of teacherCredits) {
      const key = tx.walletId;
      const usd = this.toUsd(tx.amount, tx.currency, rateMap);
      const existing = teacherMap.get(key);
      if (existing) {
        existing.totalEarnedUsd += usd;
      } else {
        teacherMap.set(key, {
          email: tx.wallet.user.email,
          totalEarnedUsd: usd,
          totalPaidOutUsd: 0,
          currency: tx.currency,
        });
      }
    }

    // Attach payout totals
    for (const [walletId, entry] of teacherMap.entries()) {
      const paidRaw = payoutMap.get(walletId) ?? 0;
      entry.totalPaidOutUsd = this.toUsd(paidRaw, entry.currency, rateMap);
    }

    return Array.from(teacherMap.values()).sort(
      (a, b) => b.totalEarnedUsd - a.totalEarnedUsd,
    );
  }

  // ── Revenue by country ────────────────────────────────────

  /**
   * Revenue per country, normalized to USD for comparison.
   * Each purchase is attributed to the purchasing student's countryId.
   * Includes each country's % share of total platform revenue.
   */
  async getCountryRevenue() {
    const rateMap = await this.getRateMap();

    const purchases = await this.prisma.packagePurchase.findMany({
      include: {
        student: { select: { countryId: true } },
        package: { select: { priceAmount: true, currency: true } },
      },
    });

    const countries = await this.prisma.country.findMany({
      select: { id: true, code: true, name: true, currency: true },
    });
    const countryLookup = new Map(countries.map((c) => [c.id, c]));

    const revenueMap = new Map<string, number>(); // countryId → USD

    for (const purchase of purchases) {
      const countryId = purchase.student.countryId;
      if (!countryId) continue;
      const usd = this.toUsd(purchase.package.priceAmount, purchase.package.currency, rateMap);
      revenueMap.set(countryId, (revenueMap.get(countryId) ?? 0) + usd);
    }

    const totalUsd = Array.from(revenueMap.values()).reduce((a, b) => a + b, 0);

    return Array.from(revenueMap.entries())
      .map(([countryId, revenueUsd]) => {
        const country = countryLookup.get(countryId);
        return {
          countryId,
          code: country?.code ?? 'UNKNOWN',
          name: country?.name ?? 'Unknown',
          revenueUsd,
          sharePercent: totalUsd > 0 ? Math.round((revenueUsd / totalUsd) * 10000) / 100 : 0,
        };
      })
      .sort((a, b) => b.revenueUsd - a.revenueUsd);
  }

  // ── Exchange rate management ──────────────────────────────

  async upsertExchangeRate(currency: string, toUsdRate: number) {
    return this.prisma.exchangeRate.upsert({
      where: { currency: currency.toUpperCase() },
      update: { toUsdRate },
      create: { currency: currency.toUpperCase(), toUsdRate },
    });
  }

  async getExchangeRates() {
    return this.prisma.exchangeRate.findMany({ orderBy: { currency: 'asc' } });
  }
}
