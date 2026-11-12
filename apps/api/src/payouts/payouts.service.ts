import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { payoutMinimums, minimumFor } from './payout-minimum';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GeneratePayoutsDto } from './dto/generate-payouts.dto';
import { UserProfile } from '@prisma/client';
import { UserRole, minorToMajor } from '@cpa/shared';

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
    private notifications: NotificationsService,
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

    // Every wallet with credits up to the end of this period. What a statement covers is everything
    // earned since that person's previous statement, so a run below the minimum rolls over, never lost.
    const wallets = await this.prisma.wallet.findMany({
      where: { transactions: { some: { type: 'CREDIT', source: { not: 'PAYOUT' }, createdAt: { lte: periodEnd } } } },
      include: { user: { select: { role: true } } },
    });
    const minimums = await payoutMinimums(this.prisma);

    const statements = [];
    const rolledOver: { userId: string; amount: number; currency: string }[] = [];

    for (const wallet of wallets) {
      const recipientType = RECIPIENT_ROLE_MAP[wallet.user.role];
      if (!recipientType) continue;

      const previous = await this.prisma.payoutStatement.findFirst({ where: { recipientId: wallet.userId }, orderBy: { periodEnd: 'desc' }, select: { periodEnd: true } });
      const from = previous?.periodEnd && previous.periodEnd < periodEnd ? previous.periodEnd : null;
      const unsettled = await this.prisma.walletTransaction.findMany({
        where: { walletId: wallet.id, type: 'CREDIT', source: { not: 'PAYOUT' }, createdAt: { lte: periodEnd, ...(from && { gt: from }) } },
        select: { amount: true, createdAt: true },
      });
      // Sum unsettled credits — all in the wallet's single currency (no cross-currency sum)
      const total = unsettled.reduce((sum, tx) => sum + tx.amount, 0);
      if (total === 0) continue;
      if (total < minimumFor(minimums, wallet.currency)) { rolledOver.push({ userId: wallet.userId, amount: total, currency: wallet.currency }); continue; }
      const coversFrom = from ?? unsettled.reduce((a, t) => (t.createdAt < a ? t.createdAt : a), periodStart);

      // Skip if a statement already exists for this wallet + period
      const existing = await this.prisma.payoutStatement.findFirst({
        where: { recipientId: wallet.userId, periodEnd },
      });
      if (existing) continue;

      const statement = await this.prisma.payoutStatement.create({
        data: {
          recipientId: wallet.userId,
          recipientType: recipientType as any,
          periodStart: coversFrom,
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
        const periodLabel = `${coversFrom.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} – ${periodEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;
        this.mail.sendPayoutInitiated(recipient.email, total, wallet.currency, periodLabel).catch(() => {});
      }
    }

    return {
      generated: statements.length,
      statements,
      rolledOver,
    };
  }

  // ── Admin: mark a statement as paid ─────────────────────

  /**
   * Confirm a payout was physically sent.
   * Writes a DEBIT WalletTransaction so the balance reflects "what's still owed."
   * The wallet balance is NEVER edited directly — always through a transaction.
   */
  async markPaid(admin: UserProfile | null, statementId: string, dto: { reference?: string; paidOn?: string; note?: string; override?: boolean } = {}) {
    const statement = await this.prisma.payoutStatement.findUnique({
      where: { id: statementId },
    });
    if (!statement) throw new NotFoundException('Payout statement not found');
    if (statement.status === 'PAID') {
      throw new BadRequestException('Statement is already marked as paid');
    }
    // Money only goes to an account an admin has checked, unless they say otherwise on purpose
    const account = await this.prisma.payoutAccount.findUnique({ where: { userId: statement.recipientId } });
    if (!account && !dto.override) throw new BadRequestException('This person has no payout account yet');
    if (account && !account.isVerified && !dto.override) throw new BadRequestException('Verify their payout account before marking this paid');
    const reference = dto.reference?.trim().slice(0, 120) || null;
    const paidAt = dto.paidOn ? new Date(dto.paidOn) : new Date();
    if (Number.isNaN(+paidAt) || +paidAt > Date.now() + 86_400_000) throw new BadRequestException('Choose the date it was paid');
    const paidTo = account ? `${account.bankName} ·· ${account.accountNumber.replace(/\s+/g, '').slice(-4)}` : null;

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
          description: `Payout for ${statement.periodStart.toISOString().slice(0, 10)} – ${statement.periodEnd.toISOString().slice(0, 10)}${paidTo ? ` to ${paidTo}` : ''}${reference ? ` · ref ${reference}` : ''}`,
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
        data: { status: 'PAID', paidAt, reference, paidTo, note: dto.note?.trim().slice(0, 500) || null, paidById: admin?.id ?? null },
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

    this.notifications.notify(statement.recipientId, {
      type: 'system', title: 'Payout sent',
      body: `${statement.currency} ${minorToMajor(statement.amount, statement.currency).toLocaleString('en-GB')}${paidTo ? ` to ${paidTo}` : ''}${reference ? ` · ref ${reference}` : ''}`,
      href: statement.recipientType === 'TEACHER' ? '/teacher/wallet' : statement.recipientType === 'SUBJECT_REVIEWER' ? '/reviewer/wallet' : '/country-rep/wallet',
    });

    this.audit.log(admin?.id ?? null, 'payout.paid', 'PayoutStatement', statementId, { status: 'PENDING' }, {
      status: 'PAID', reference,
      amount: statement.amount,
      currency: statement.currency,
    });

    return { paid: true, statementId, amount: statement.amount, currency: statement.currency };
  }

  /**
   * One month for the payouts page: statements to pay (with where each would be paid) and what's
   * still owed but not yet on a statement, with totals per currency.
   */
  async overview(month?: string) {
    const now = new Date();
    const [y, m] = /^\d{4}-\d{2}$/.test(month ?? '') ? month!.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
    const periodStart = new Date(y, m - 1, 1), periodEnd = new Date(y, m, 1);
    const statements = await this.prisma.payoutStatement.findMany({ orderBy: [{ status: 'asc' }, { amount: 'desc' }] });
    const people = await this.prisma.userProfile.findMany({
      where: { id: { in: [...new Set(statements.map(s => s.recipientId))] } },
      select: { id: true, name: true, firstName: true, lastName: true, email: true, role: true, country: { select: { name: true } }, payoutAccount: true },
    });
    const who = new Map(people.map(p => [p.id, p]));
    // What each statement is for: the earnings it covers
    const credits = statements.length ? await this.prisma.walletTransaction.findMany({
      where: {
        type: 'CREDIT', source: { not: 'PAYOUT' }, wallet: { userId: { in: [...who.keys()] } },
        createdAt: { gte: new Date(Math.min(...statements.map(x => +x.periodStart))), lte: new Date(Math.max(...statements.map(x => +x.periodEnd))) },
      },
      select: { createdAt: true, description: true, wallet: { select: { userId: true } } },
    }) : [];
    const forText = (st: (typeof statements)[number]) => {
      const xs = credits.filter(c => c.wallet.userId === st.recipientId && c.createdAt >= st.periodStart && c.createdAt <= st.periodEnd);
      const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
      if (st.recipientType === 'COUNTRY_REP') {
        // The monthly bonus is one credit; everything else is commission on a sale
        const bonus = xs.filter(c => c.description?.startsWith('Per-student bonus')).length, sales = xs.length - bonus;
        return [sales ? `commission on ${plural(sales, 'sale')}` : null, bonus ? 'active-student bonus' : null].filter(Boolean).join(' + ') || 'commission';
      }
      if (st.recipientType === 'SUBJECT_REVIEWER') return `${plural(xs.length, 'sale')} of approved courses`;
      return plural(xs.length, 'course sale');
    };
    const nameOf = (p: { name: string | null; firstName: string | null; lastName: string | null; email: string }) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email;
    const row = (s: (typeof statements)[number]) => {
      const p = who.get(s.recipientId);
      const a = p?.payoutAccount;
      return {
        id: s.id, recipientId: s.recipientId, name: p ? nameOf(p) : 'Unknown', email: p?.email ?? null, role: s.recipientType, country: p?.country?.name ?? null,
        what: forText(s), amount: s.amount, currency: s.currency, periodStart: s.periodStart, periodEnd: s.periodEnd, status: s.status, paidAt: s.paidAt, reference: s.reference, paidTo: s.paidTo,
        account: a ? { label: `${a.bankName} ·· ${a.accountNumber.replace(/\s+/g, '').slice(-4)}`, bankName: a.bankName, accountNumber: a.accountNumber, bankCode: a.bankCode, country: a.country, verified: a.isVerified, verifiedAt: a.verifiedAt, id: a.id } : null,
      };
    };
    const rows = statements.map(row);
    const pending = rows.filter(r => r.status === 'PENDING');
    const payable = pending.filter(r => r.account?.verified);
    const totals = (xs: typeof rows) => Object.entries(xs.reduce((m, r) => ({ ...m, [r.currency]: (m[r.currency] ?? 0) + r.amount }), {} as Record<string, number>)).map(([currency, amount]) => ({ currency, amount }));

    // Earned in the chosen month but not on a statement yet (statements cover a period, so check overlap)
    const monthStatements = statements.filter(s => s.periodStart < periodEnd && s.periodEnd > periodStart);
    const wallets = await this.prisma.wallet.findMany({
      where: { transactions: { some: { type: 'CREDIT', source: { not: 'PAYOUT' }, createdAt: { gte: periodStart, lt: periodEnd } } }, userId: { notIn: monthStatements.map(s => s.recipientId) } },
      include: { transactions: { where: { type: 'CREDIT', source: { not: 'PAYOUT' }, createdAt: { gte: periodStart, lt: periodEnd } }, select: { amount: true } }, user: { select: { role: true } } },
    });
    const unstated = wallets.filter(w => RECIPIENT_ROLE_MAP[w.user.role]).map(w => ({ currency: w.currency, amount: w.transactions.reduce((n, t) => n + t.amount, 0) })).filter(x => x.amount > 0);

    const yearStart = new Date(now.getFullYear(), 0, 1);
    const paidThisYear = rows.filter(r => r.status === 'PAID' && r.paidAt && r.paidAt >= yearStart);
    const accountRows = await this.prisma.payoutAccount.findMany({
      orderBy: [{ isVerified: 'asc' }, { updatedAt: 'desc' }],
      include: { user: { select: { id: true, name: true, firstName: true, lastName: true, email: true, role: true, country: { select: { name: true } } } } },
    });
    const accounts = accountRows.filter(a => !a.isVerified).length;
    return {
      month: { start: periodStart, end: periodEnd, label: periodStart.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) },
      ready: { people: payable.length, totals: totals(payable) },
      unstated: { people: unstated.length, totals: totals(unstated as any) },
      stats: {
        toPay: totals(pending), toPayPeople: new Set(pending.map(r => r.recipientId)).size,
        paidThisYear: totals(paidThisYear), noAccount: pending.filter(r => !r.account).length,
        unverified: accounts,
      },
      rows,
      accounts: accountRows.map(a => ({
        id: a.id, userId: a.userId, name: nameOf(a.user), email: a.user.email, role: a.user.role, country: a.user.country?.name ?? null,
        bankName: a.bankName, accountNumber: a.accountNumber, bankCode: a.bankCode, accountCountry: a.country,
        verified: a.isVerified, verifiedAt: a.verifiedAt, updatedAt: a.updatedAt,
      })),
    };
  }

  /** Statements for everything earned in one calendar month (YYYY-MM) */
  createMonth(month: string) {
    if (!/^\d{4}-\d{2}$/.test(month)) throw new BadRequestException('Choose a month');
    const [y, m] = month.split('-').map(Number);
    const start = new Date(y, m - 1, 1), end = new Date(+new Date(y, m, 1) - 1);
    if (start > new Date()) throw new BadRequestException('That month hasn’t started yet');
    return this.generatePayouts({ periodStart: start.toISOString(), periodEnd: end.toISOString() } as any);
  }

  /** Ask people owed money to add or fix their payout account */
  async remind(ids: string[]) {
    const people = await this.prisma.userProfile.findMany({ where: { id: { in: ids } }, select: { id: true, role: true } });
    for (const p of people) {
      this.notifications.notify(p.id, {
        type: 'system', title: 'Add your payout account to get paid',
        body: 'You have earnings waiting. Add your mobile money or bank details so we can pay you.',
        href: p.role === 'TEACHER' ? '/teacher/profile' : p.role === 'SUBJECT_REVIEWER' ? '/reviewer/profile' : '/country-rep/profile',
      }, {
        subject: 'Add your payout account so we can pay you', badge: 'Payout', sender: 'billing', title: 'You have earnings waiting',
        text: 'we\'re ready to pay you, but we don\'t have your payout details yet. Add your mobile money number or bank account on your profile and you\'ll be included in the next payout.',
        cta: 'Add my payout account', footnote: 'It takes a minute. We only use these details to pay you.',
      });
    }
    return { reminded: people.length };
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
