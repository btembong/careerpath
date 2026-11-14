import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UserProfile } from '@prisma/client';
import { UserRole, majorToMinor, minorToMajor } from '@cpa/shared';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { payoutMinimums, minimumFor } from '../payouts/payout-minimum';

const WALLET_ROLES: UserRole[] = [
  UserRole.TEACHER,
  UserRole.SUBJECT_REVIEWER,
  UserRole.COUNTRY_REP,
];

@Injectable()
export class WalletsService {
  constructor(private prisma: PrismaService, private audit: AuditService, private notifications: NotificationsService) {}

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

  // ── Admin overview (the Wallets page) ─────────────────────

  /**
   * Everything the admin Wallets page shows: what's owed (in the main currency, others listed), the next
   * payout run, six-month trends, every earner with their trend and payout status, earnings by kind
   * this month, and the latest manual credits.
   */
  async overview() {
    const now = new Date();
    const monthStart = (back: number) => new Date(now.getFullYear(), now.getMonth() - back, 1);
    const bounds = Array.from({ length: 6 }, (_, i) => [monthStart(5 - i), monthStart(4 - i)] as const);
    const since = bounds[0][0];

    const [wallets, minimums, accounts, sales] = await Promise.all([
      this.prisma.wallet.findMany({
        include: {
          user: { select: { id: true, email: true, role: true, name: true, firstName: true, lastName: true } },
          transactions: { where: { createdAt: { gte: since } }, select: { type: true, source: true, amount: true, createdAt: true, packagePurchaseId: true, coursePurchaseId: true } },
        },
      }),
      payoutMinimums(this.prisma),
      this.prisma.payoutAccount.findMany({ select: { userId: true, isVerified: true } }),
      Promise.all([
        this.prisma.packagePurchase.findMany({ where: { purchasedAt: { gte: since } }, select: { purchasedAt: true, amountPaid: true, currency: true } }),
        this.prisma.coursePurchase.findMany({ where: { purchasedAt: { gte: since } }, select: { purchasedAt: true, amountPaid: true, currency: true } }),
      ]),
    ]);
    const verified = new Map(accounts.map(a => [a.userId, a.isVerified]));

    // The main currency: the one most is owed in (or most sales, before anything is owed)
    const owedBy = new Map<string, number>();
    for (const w of wallets) owedBy.set(w.currency, (owedBy.get(w.currency) ?? 0) + w.balance);
    const allSales = [...sales[0], ...sales[1]].map(s => ({ at: s.purchasedAt, amount: s.amountPaid ?? 0, currency: s.currency ?? '' }));
    const currency = [...owedBy.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      ?? [...allSales.reduce((m, s) => m.set(s.currency, (m.get(s.currency) ?? 0) + 1), new Map<string, number>()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
      ?? 'XAF';
    const mine = wallets.filter(w => w.currency === currency);
    const tx = mine.flatMap(w => w.transactions);
    const per = (xs: { createdAt?: Date; at?: Date; amount: number }[]) => bounds.map(([a, b]) => xs.filter(x => { const d = x.createdAt ?? x.at!; return d >= a && d < b; }).reduce((n, x) => n + x.amount, 0));
    const earned = per(tx.filter(t => t.type === 'CREDIT' && t.source !== 'PAYOUT'));
    const paid = per(tx.filter(t => t.type === 'DEBIT' && t.source === 'PAYOUT'));
    const sold = per(allSales.filter(s => s.currency === currency));
    const kept = sold.map((s, i) => (s ? Math.round(((s - earned[i]) / s) * 100) : null));
    const min = minimumFor(minimums, currency);

    const status = (w: (typeof wallets)[number]) => w.balance <= 0 ? 'nothing' : !verified.get(w.userId) ? 'missing' : w.balance < minimumFor(minimums, w.currency) ? 'low' : 'ready';
    const lastPaid = await this.prisma.payoutStatement.findMany({ where: { status: 'PAID' }, orderBy: { paidAt: 'desc' }, select: { recipientId: true, amount: true, currency: true, paidAt: true } });
    const lastBy = new Map<string, (typeof lastPaid)[number]>();
    for (const s of lastPaid) if (!lastBy.has(s.recipientId)) lastBy.set(s.recipientId, s);

    const KIND = (t: { source: string; packagePurchaseId: string | null; coursePurchaseId: string | null }) =>
      t.source === 'COURSE_SALE' ? 'Course sales' : t.source === 'LIVE_CLASS' ? 'Live classes taught' : t.source === 'COHORT_SHARE' ? 'Cohort shares' : t.source === 'MENTOR_SESSION' ? 'Mentorship'
        : t.source === 'REVIEW_COMMISSION' ? 'Review shares' : t.source === 'COUNTRY_BONUS' ? 'Rep commission and bonus' : 'Added by admin';
    const thisMonth = tx.filter(t => t.type === 'CREDIT' && t.source !== 'PAYOUT' && t.createdAt >= bounds[5][0]);
    const byKind = new Map<string, number>();
    for (const t of thisMonth) byKind.set(KIND(t), (byKind.get(KIND(t)) ?? 0) + t.amount);

    const manual = await this.prisma.walletTransaction.findMany({
      where: { source: 'MANUAL_CREDIT' }, orderBy: { createdAt: 'desc' }, take: 3,
      select: { amount: true, currency: true, description: true, createdAt: true, createdById: true, wallet: { select: { user: { select: { name: true, firstName: true, lastName: true, email: true } } } } },
    });
    const admins = new Map((await this.prisma.userProfile.findMany({ where: { id: { in: manual.map(m => m.createdById).filter((x): x is string => !!x) } }, select: { id: true, name: true, firstName: true, lastName: true, email: true } })).map(a => [a.id, nameOf(a) ?? a.email]));

    const owing = mine.filter(w => w.balance > 0);
    const roleTotal = (r: string) => owing.filter(w => w.user.role === r).reduce((n, w) => n + w.balance, 0);
    return {
      currency, minimum: min,
      owed: owing.reduce((n, w) => n + w.balance, 0), owedPeople: owing.length,
      owedByRole: [['TEACHER', 'Teachers'], ['SUBJECT_REVIEWER', 'Reviewers'], ['COUNTRY_REP', 'Country reps']].map(([r, l]) => ({ role: r, label: l, amount: roleTotal(r) })).filter(x => x.amount > 0),
      otherCurrencies: [...owedBy.entries()].filter(([c, n]) => c !== currency && n > 0).map(([c, n]) => ({ currency: c, amount: n })),
      nextRun: monthStart(-1),
      run: { ready: wallets.filter(w => status(w) === 'ready').length, missing: wallets.filter(w => status(w) === 'missing').length, low: wallets.filter(w => status(w) === 'low').length },
      months: bounds.map(([a]) => a),
      kpis: { earned, paid, sold, kept },
      earners: wallets.map(w => {
        const series = per(w.transactions.filter(t => t.type === 'CREDIT' && t.source !== 'PAYOUT'));
        const last = lastBy.get(w.userId);
        return {
          walletId: w.id, userId: w.userId, name: nameOf(w.user) ?? w.user.email, email: w.user.email, role: w.user.role,
          owed: w.balance, currency: w.currency, series, status: status(w),
          lastPayout: last ? { amount: last.amount, currency: last.currency, at: last.paidAt } : null,
        };
      }).sort((a, b) => b.owed - a.owed),
      byKind: [...byKind.entries()].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount),
      manualCredits: manual.map(m => ({ amount: m.amount, currency: m.currency, reason: m.description, at: m.createdAt, to: nameOf(m.wallet.user) ?? m.wallet.user.email, by: m.createdById ? admins.get(m.createdById) ?? null : null })),
    };
  }

  // ── Manual credits ────────────────────────────────────────

  /** People an admin can pay by hand (teachers, reviewers, country reps), with their wallet currency */
  async payees(q?: string) {
    const term = q?.trim();
    const people = await this.prisma.userProfile.findMany({
      where: {
        role: { in: WALLET_ROLES }, deletedAt: null,
        ...(term && { OR: [{ email: { contains: term, mode: 'insensitive' } }, { name: { contains: term, mode: 'insensitive' } }, { firstName: { contains: term, mode: 'insensitive' } }, { lastName: { contains: term, mode: 'insensitive' } }] }),
      },
      select: { id: true, email: true, role: true, name: true, firstName: true, lastName: true, wallet: { select: { currency: true, balance: true } } },
      orderBy: [{ firstName: 'asc' }, { email: 'asc' }],
      take: 20,
    });
    return people.map(p => ({ id: p.id, email: p.email, role: p.role, name: nameOf(p), walletCurrency: p.wallet?.currency ?? null, balance: p.wallet?.balance ?? null }));
  }

  /**
   * Add money to someone's wallet by hand: work the rules don't cover (marking, a bonus, a correction).
   * It's paid with their next payout like any other earning, and recorded with the admin who added it.
   */
  async addCredit(admin: UserProfile, dto: { userId?: string; amount?: number; currency?: string; reason?: string }) {
    const person = dto.userId ? await this.prisma.userProfile.findUnique({ where: { id: dto.userId }, select: { id: true, role: true, deletedAt: true, name: true, firstName: true, lastName: true, email: true, wallet: { select: { currency: true } } } }) : null;
    if (!person || person.deletedAt || !WALLET_ROLES.includes(person.role as UserRole)) throw new BadRequestException('Choose a teacher, reviewer or country rep');
    const amountMajor = Number(dto.amount);
    if (!Number.isFinite(amountMajor) || amountMajor <= 0) throw new BadRequestException('Enter an amount above zero');
    const currency = String(dto.currency ?? '').trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('Choose a currency');
    const reason = String(dto.reason ?? '').trim();
    if (reason.length < 3) throw new BadRequestException('Give a reason they’ll see, for example “Marking the November mock exam”');
    if (reason.length > 200) throw new BadRequestException('Keep the reason under 200 characters');
    // One wallet per person, in one currency
    if (person.wallet && person.wallet.currency !== currency) throw new BadRequestException(`Their wallet is in ${person.wallet.currency}. Add the credit in ${person.wallet.currency}.`);
    const amount = majorToMinor(amountMajor, currency);
    if (amount > 100_000_000_00) throw new BadRequestException('That amount is too large');

    const tx = await this.prisma.$transaction(async (db) => {
      const wallet = await db.wallet.upsert({
        where: { userId: person.id },
        update: { balance: { increment: amount } },
        create: { userId: person.id, balance: amount, currency },
      });
      return db.walletTransaction.create({
        data: { walletId: wallet.id, type: 'CREDIT', source: 'MANUAL_CREDIT', amount, currency, description: reason, createdById: admin.id },
      });
    });

    this.audit.log(admin.id, 'wallet.manual_credit', 'WalletTransaction', tx.id, undefined, { userId: person.id, amount, currency, reason });
    const shown = `${currency === 'XAF' ? 'FCFA' : currency} ${minorToMajor(amount, currency).toLocaleString('en-GB')}`;
    this.notifications.notify(person.id, {
      type: 'earnings',
      title: `${shown} added to your earnings`,
      body: `${reason}. It’s paid with your next payout.`,
      href: person.role === UserRole.COUNTRY_REP ? '/country-rep/wallet' : person.role === UserRole.SUBJECT_REVIEWER ? '/reviewer/wallet' : '/teacher/wallet',
    });
    return { id: tx.id, amount, currency, to: nameOf(person) ?? person.email };
  }
}

const nameOf = (p: { name: string | null; firstName: string | null; lastName: string | null }) =>
  p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || null;
