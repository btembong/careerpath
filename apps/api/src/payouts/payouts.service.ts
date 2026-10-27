import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { GeneratePayoutsDto } from './dto/generate-payouts.dto';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';

const RECIPIENT_ROLE_MAP: Record<string, string> = {
  [UserRole.TEACHER]: 'TEACHER',
  [UserRole.SUBJECT_REVIEWER]: 'SUBJECT_REVIEWER',
  [UserRole.COUNTRY_REP]: 'COUNTRY_REP',
};

@Injectable()
export class PayoutsService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private audit: AuditService,
  ) {}

  // ── Admin: generate payout statements ───────────────────

  /**
   * Roll up each wallet's unsettled CREDIT transactions within the period
   * into a single PayoutStatement per recipient.
   *
   * Rules:
   * - Only transactions with no matching PAYOUT debit are included (unsettled)
   * - Money amounts are NEVER mixed across currencies without conversion
   *   → one PayoutStatement per wallet (each wallet holds one currency)
   * - The wallet balance stays unchanged here — it falls when mark-paid writes the DEBIT
   */
  async generatePayouts(dto: GeneratePayoutsDto) {
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);

    if (periodEnd <= periodStart) {
      throw new BadRequestException('periodEnd must be after periodStart');
    }

    // Find all wallets with unsettled credits in the period
    const wallets = await this.prisma.wallet.findMany({
      where: {
        transactions: {
          some: {
            type: 'CREDIT',
            source: { not: 'PAYOUT' },
            createdAt: { gte: periodStart, lte: periodEnd },
          },
        },
      },
      include: {
        user: { select: { role: true } },
        transactions: {
          where: {
            type: 'CREDIT',
            source: { not: 'PAYOUT' },
            createdAt: { gte: periodStart, lte: periodEnd },
          },
        },
      },
    });

    const statements = [];

    for (const wallet of wallets) {
      const recipientType = RECIPIENT_ROLE_MAP[wallet.user.role];
      if (!recipientType) continue;

      // Sum unsettled credits — all in the wallet's single currency (no cross-currency sum)
      const total = wallet.transactions.reduce((sum, tx) => sum + tx.amount, 0);
      if (total === 0) continue;

      // Skip if a statement already exists for this wallet + period
      const existing = await this.prisma.payoutStatement.findFirst({
        where: {
          recipientId: wallet.userId,
          periodStart,
          periodEnd,
        },
      });
      if (existing) continue;

      const statement = await this.prisma.payoutStatement.create({
        data: {
          recipientId: wallet.userId,
          recipientType: recipientType as any,
          periodStart,
          periodEnd,
          amount: total,
          currency: wallet.currency,
          status: 'PENDING',
        },
      });

      statements.push(statement);

      this.audit.log(null, 'payout.generated', 'PayoutStatement', statement.id, undefined, {
        recipientId: wallet.userId,
        amount: total,
        currency: wallet.currency,
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
      });

      // Notify recipient that a payout is being processed
      const recipient = await this.prisma.userProfile.findUnique({
        where: { id: wallet.userId },
        select: { email: true },
      });
      if (recipient) {
        const periodLabel = `${periodStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – ${periodEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        this.mail.sendPayoutInitiated(recipient.email, total, wallet.currency, periodLabel).catch(() => {});
      }
    }

    return {
      generated: statements.length,
      statements,
    };
  }

  // ── Admin: mark a statement as paid ─────────────────────

  /**
   * Confirm a payout was physically sent.
   * Writes a DEBIT WalletTransaction so the balance reflects "what's still owed."
   * The wallet balance is NEVER edited directly — always through a transaction.
   */
  async markPaid(statementId: string) {
    const statement = await this.prisma.payoutStatement.findUnique({
      where: { id: statementId },
    });
    if (!statement) throw new NotFoundException('Payout statement not found');
    if (statement.status === 'PAID') {
      throw new BadRequestException('Statement is already marked as paid');
    }

    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: statement.recipientId },
    });
    if (!wallet) throw new NotFoundException('Wallet not found for this recipient');

    await this.prisma.$transaction([
      // Write the DEBIT transaction — this is what reduces the balance
      this.prisma.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEBIT',
          source: 'PAYOUT',
          amount: statement.amount,
          currency: statement.currency,
          description: `Payout for period ${statement.periodStart.toISOString().slice(0, 10)} – ${statement.periodEnd.toISOString().slice(0, 10)}`,
        },
      }),
      // Decrement the cached balance
      this.prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { decrement: statement.amount } },
      }),
      // Mark statement paid with timestamp
      this.prisma.payoutStatement.update({
        where: { id: statementId },
        data: { status: 'PAID', paidAt: new Date() },
      }),
    ]);

    // Notify recipient that their payment has been confirmed
    const recipient = await this.prisma.userProfile.findUnique({
      where: { id: statement.recipientId },
      select: { email: true },
    });
    if (recipient) {
      this.mail.sendPayoutCompleted(recipient.email, statement.amount, statement.currency).catch(() => {});
    }

    this.audit.log(null, 'payout.paid', 'PayoutStatement', statementId, { status: 'PENDING' }, {
      status: 'PAID',
      amount: statement.amount,
      currency: statement.currency,
    });

    return { paid: true, statementId, amount: statement.amount, currency: statement.currency };
  }

  async getAllStatements() {
    return this.prisma.payoutStatement.findMany({
      orderBy: { generatedAt: 'desc' },
    });
  }

  // ── Recipient: own statements ────────────────────────────

  async getMyPayouts(user: UserProfile) {
    return this.prisma.payoutStatement.findMany({
      where: { recipientId: user.id },
      orderBy: { generatedAt: 'desc' },
    });
  }
}
