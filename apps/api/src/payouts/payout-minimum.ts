import { PrismaService } from '../prisma/prisma.service';

/**
 * The smallest amount paid out in a run, per currency, in minor units. Below it, earnings roll over to
 * the next run (mobile money fees make tiny payouts poor value). Admins can change them in the
 * `payouts` platform setting; a currency without one has no minimum.
 */
const DEFAULT_MINIMUMS: Record<string, number> = { XAF: 5000, XOF: 5000 };

export async function payoutMinimums(prisma: PrismaService): Promise<Record<string, number>> {
  const row = await prisma.platformSetting.findUnique({ where: { key: 'payouts' } });
  const set = ((row?.value ?? {}) as { minimums?: Record<string, number> }).minimums ?? {};
  return { ...DEFAULT_MINIMUMS, ...set };
}

export const minimumFor = (mins: Record<string, number>, currency: string) => mins[currency.toUpperCase()] ?? 0;
