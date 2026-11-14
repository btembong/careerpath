import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfile } from '@prisma/client';

export interface UpsertPayoutAccountDto {
  bankName: string;
  accountNumber: string;
  bankCode?: string;
  country: string;
}

@Injectable()
export class PayoutAccountsService {
  constructor(private prisma: PrismaService) {}

  async getMyAccount(user: UserProfile) {
    const account = await this.prisma.payoutAccount.findUnique({
      where: { userId: user.id },
    });
    return account ?? null;
  }

  /** The older form (no code). Get paid is the main way now; a change here still waits before money can go to it. */
  async upsertMyAccount(user: UserProfile, dto: UpsertPayoutAccountDto) {
    const before = await this.prisma.payoutAccount.findUnique({ where: { userId: user.id } });
    const changed = !before || before.accountNumber.replace(/\D/g, '') !== dto.accountNumber.replace(/\D/g, '');
    const provider = /mtn/i.test(dto.bankName) ? 'MTN' : /orange/i.test(dto.bankName) ? 'ORANGE' : null;
    return this.prisma.payoutAccount.upsert({
      where: { userId: user.id },
      update: {
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        bankCode: dto.bankCode ?? null,
        country: dto.country,
        provider,
        // Reset verification when details change
        isVerified: false,
        verifiedAt: null,
        ...(changed ? { nameCheck: 'unchecked', holderName: null, changedAt: new Date() } : {}),
      },
      create: {
        userId: user.id,
        bankName: dto.bankName,
        accountNumber: dto.accountNumber,
        bankCode: dto.bankCode ?? null,
        country: dto.country,
      },
    });
  }

  // ── Admin ─────────────────────────────────────────────────

  async getAllAccounts() {
    return this.prisma.payoutAccount.findMany({
      include: { user: { select: { email: true, role: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async verifyAccount(accountId: string) {
    const account = await this.prisma.payoutAccount.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException('Payout account not found');
    return this.prisma.payoutAccount.update({
      where: { id: accountId },
      data: { isVerified: true, verifiedAt: new Date() },
    });
  }
}
