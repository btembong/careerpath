import { Injectable } from '@nestjs/common';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

// No 0/O/1/I/L so codes are easy to read aloud or type from a phone screen
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

@Injectable()
export class ReferralsService {
  constructor(private prisma: PrismaService) {}

  private newCode(): string {
    return 'CPA-' + Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  }

  /** Returns the user's code, creating one on first use. */
  async ensureCode(userId: string): Promise<string> {
    const existing = await this.prisma.userProfile.findUnique({ where: { id: userId }, select: { referralCode: true } });
    if (existing?.referralCode) return existing.referralCode;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const { referralCode } = await this.prisma.userProfile.update({
          where: { id: userId },
          data: { referralCode: this.newCode() },
          select: { referralCode: true },
        });
        return referralCode!;
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err; // unique clash — try another code
      }
    }
    throw new Error('Could not generate a unique referral code');
  }

  /** Resolve a code typed or carried in a link to the referrer's id; unknown codes are ignored. */
  async findReferrer(code: string | undefined | null): Promise<string | null> {
    const clean = code?.trim().toUpperCase();
    if (!clean) return null;
    const referrer = await this.prisma.userProfile.findUnique({ where: { referralCode: clean }, select: { id: true } });
    return referrer?.id ?? null;
  }

  /**
   * Rewards aren't decided yet, so creditsEarned is always 0 — referrals are tracked so they can be
   * rewarded retroactively once a rule is chosen.
   */
  async getStats(userId: string) {
    const [referralCode, referred, profile] = await Promise.all([
      this.ensureCode(userId),
      this.prisma.userProfile.findMany({
        where: { referredById: userId },
        select: { _count: { select: { purchases: true, coursePurchases: true } } },
      }),
      this.prisma.userProfile.findUnique({
        where: { id: userId },
        select: { wallet: { select: { currency: true } }, country: { select: { currency: true } } },
      }),
    ]);
    return {
      referralCode,
      totalReferrals: referred.length,
      enrolled: referred.filter(r => r._count.purchases + r._count.coursePurchases > 0).length,
      creditsEarned: 0,
      currency: profile?.wallet?.currency ?? profile?.country?.currency ?? 'XAF',
    };
  }
}
