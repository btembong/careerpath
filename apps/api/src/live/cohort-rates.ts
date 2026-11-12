import { PrismaService } from '../prisma/prisma.service';

/**
 * What cohort teachers earn: a fee per hour of live class taught, and a share of every sale that puts a
 * student in their class (a package linked to the cohort). Defaults, with an override per cohort.
 * Stored in the `cohortPay` platform setting; amounts in minor units.
 */
export type CohortRates = { perHour: number; share: number; currency: string; perCohort: Record<string, { perHour?: number | null; share?: number | null }> };
const DEFAULT: CohortRates = { perHour: 5000, share: 20, currency: 'XAF', perCohort: {} };

export async function cohortRates(prisma: PrismaService): Promise<CohortRates> {
  const row = await prisma.platformSetting.findUnique({ where: { key: 'cohortPay' } });
  return { ...DEFAULT, ...((row?.value ?? {}) as Partial<CohortRates>) };
}

export const perHourFor = (r: CohortRates, cohortId: string) => r.perCohort[cohortId]?.perHour ?? r.perHour;
export const shareFor = (r: CohortRates, cohortId: string) => r.perCohort[cohortId]?.share ?? r.share;

/** Live classes before this day are never paid (they were taught before pay for classes existed) */
export const CLASS_PAY_FROM = new Date('2026-11-12T00:00:00Z');
