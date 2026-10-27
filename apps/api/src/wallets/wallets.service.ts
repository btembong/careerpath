import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';

const WALLET_ROLES: UserRole[] = [
  UserRole.TEACHER,
  UserRole.SUBJECT_REVIEWER,
  UserRole.COUNTRY_REP,
];

@Injectable()
export class WalletsService {
  constructor(private prisma: PrismaService) {}

  // ── Own wallet ────────────────────────────────────────────

  async getMyWallet(user: UserProfile, cursor?: string, take = 50) {
    if (!WALLET_ROLES.includes(user.role as UserRole)) {
      throw new ForbiddenException('Wallets are only available to teachers, reviewers, and country reps');
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: user.id },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: take + 1, // fetch one extra to detect hasMore
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        },
      },
    });

    if (!wallet) {
      return {
        balance: 0,
        currency: null,
        transactions: [],
        nextCursor: null,
        message: 'No wallet yet — it will be created when your first commission is credited.',
      };
    }

    const hasMore = wallet.transactions.length > take;
    const transactions = hasMore ? wallet.transactions.slice(0, take) : wallet.transactions;
    const nextCursor = hasMore ? transactions[transactions.length - 1].id : null;

    return { ...wallet, transactions, nextCursor };
  }

  // ── Admin: all wallets ────────────────────────────────────

  async getAllWallets() {
    return this.prisma.wallet.findMany({
      include: {
        user: { select: { email: true, role: true } },
        _count: { select: { transactions: true } },
      },
      orderBy: { balance: 'desc' },
    });
  }

  async getWalletById(walletId: string) {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      include: {
        user: { select: { email: true, role: true } },
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }
}
