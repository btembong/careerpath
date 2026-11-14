import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PayoutAccount, Prisma, UserProfile, Withdrawal, WithdrawalStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomInt, randomBytes } from 'crypto';
import { minorToMajor } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { TranzakGateway, TranzakTransfer } from '../payments/gateways/tranzak.gateway';
import { minimumFor, payoutMinimums } from './payout-minimum';

const DAY = 86_400_000;
/** The rules admins can change, in XAF/XOF (zero-decimal, so these are francs) */
export interface PayoutRules {
  autoLimit: number; twoApproversAbove: number; dailyMax: number; clearingDays: number;
  coolingHours: number; lowFloat: number; payeePaysFee: boolean; paused: boolean;
}
export const DEFAULT_RULES: PayoutRules = { autoLimit: 250_000, twoApproversAbove: 1_000_000, dailyMax: 500_000, clearingDays: 7, coolingHours: 48, lowFloat: 500_000, payeePaysFee: true, paused: false };
/** Earnings that can still be refunded wait before they can be withdrawn */
const CLEARING_SOURCES = ['COURSE_SALE', 'COHORT_SHARE', 'COUNTRY_BONUS', 'REVIEW_COMMISSION'] as const;
const PROVIDERS: Record<string, string> = { MTN: 'MTN Mobile Money', ORANGE: 'Orange Money' };
const EARNER_ROLES = ['TEACHER', 'SUBJECT_REVIEWER', 'COUNTRY_REP'];
const homeFor = (role: string) => (role === 'SUBJECT_REVIEWER' ? '/reviewer/wallet' : role === 'COUNTRY_REP' ? '/country-rep/wallet' : '/teacher/wallet');
const nm = (p: { name: string | null; firstName: string | null; lastName: string | null; email: string }) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
const money = (amount: number, currency: string) => `${['XAF', 'XOF'].includes(currency) ? 'FCFA' : currency} ${minorToMajor(amount, currency).toLocaleString('en-GB')}`;
const last = (n: string) => n.replace(/\D/g, '').slice(-3);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const words = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z]+/).filter(w => w.length > 2);
const WEAK_PINS = new Set(['0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999', '1234', '4321', '1212', '0123', '9876', '2580']);

type Approval = { adminId: string; name: string; at: string };

/**
 * Earners take money out of their balance themselves. In Cameroon, MTN and Orange numbers are paid
 * straight through Tranzak; anywhere else the request waits for an admin to pay by hand. Each
 * withdrawal needs the earner's PIN (or a one-time code), takes the money out of the balance at once,
 * and puts it back if the operator refuses it or an admin rejects it. Big or unusual ones wait for
 * one or two admins.
 */
@Injectable()
export class WithdrawalsService {
  private readonly logger = new Logger(WithdrawalsService.name);
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private mail: MailService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private tranzak: TranzakGateway,
  ) {}

  // ── Rules ───────────────────────────────────────────────

  async rules(): Promise<PayoutRules> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key: 'payouts' } });
    return { ...DEFAULT_RULES, ...(((row?.value ?? {}) as { rules?: Partial<PayoutRules> }).rules ?? {}) };
  }

  async setRules(admin: UserProfile, dto: Partial<PayoutRules> & { code?: string }) {
    await this.checkAdmin(admin.id, dto.code);
    const before = await this.rules();
    const next: PayoutRules = { ...before };
    for (const k of ['autoLimit', 'twoApproversAbove', 'dailyMax', 'clearingDays', 'coolingHours', 'lowFloat'] as const) {
      if (dto[k] != null) {
        const v = Math.round(Number(dto[k]));
        if (!Number.isFinite(v) || v < 0) throw new BadRequestException(`${k} must be a positive number`);
        next[k] = v;
      }
    }
    if (dto.payeePaysFee != null) next.payeePaysFee = !!dto.payeePaysFee;
    if (dto.paused != null) next.paused = !!dto.paused;
    if (next.twoApproversAbove < next.autoLimit) throw new BadRequestException('The two-admin line must be above the approval line');
    const row = await this.prisma.platformSetting.findUnique({ where: { key: 'payouts' } });
    const value = { ...((row?.value ?? {}) as object), rules: next } as unknown as Prisma.InputJsonValue;
    await this.prisma.platformSetting.upsert({ where: { key: 'payouts' }, update: { value }, create: { key: 'payouts', value } });
    this.audit.log(admin.id, 'payouts.rules', 'PlatformSetting', 'payouts', before, next);
    return next;
  }

  // ── One-time codes (earners for account changes and forgotten PINs; admins for approvals) ──

  async sendCode(user: UserProfile, purpose: 'account' | 'withdraw' | 'admin') {
    const wait = `cpa:payout-code-wait:${user.id}`;
    if (await this.redis.get(wait)) throw new BadRequestException('A code was sent less than a minute ago. Check your email.');
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    await this.redis.set(`cpa:payout-code:${user.id}`, JSON.stringify({ hash: sha(code), tries: 0 }), 600);
    await this.redis.set(wait, '1', 60);
    const what = purpose === 'admin' ? 'approve payouts on CareerPath Africa' : purpose === 'account' ? 'change where your earnings are paid' : 'withdraw your earnings';
    await this.mail.sendNotice(user.email, `${code} is your CareerPath payout code`, {
      badge: 'Payouts', title: `Your code: ${code}`, firstName: user.firstName,
      text: `Use this code to ${what}. It works once, for 10 minutes.\n\nIf you didn’t ask for it, someone may be trying to use your account: change your password and reply to this email.`,
      cta: purpose === 'admin' ? 'Open Settlements' : 'Open Get paid', href: purpose === 'admin' ? '/admin/settlements' : homeFor(user.role),
    }, 'payouts');
    return { sent: true, to: user.email.replace(/^(.{2}).*(@.*)$/, '$1…$2') };
  }

  /** Admins: one code unlocks Settlements actions for 15 minutes */
  private async checkAdmin(adminId: string, code?: string) {
    const ok = `cpa:payout-admin-ok:${adminId}`;
    if (await this.redis.get(ok)) return;
    await this.checkCode(adminId, code);
    await this.redis.set(ok, '1', 900);
  }

  private async checkCode(userId: string, code?: string) {
    const key = `cpa:payout-code:${userId}`;
    const raw = await this.redis.get(key);
    if (!raw) throw new BadRequestException('Ask for a new code: the last one has expired.');
    const c = JSON.parse(raw) as { hash: string; tries: number };
    if (!code || sha(code.trim()) !== c.hash) {
      if (c.tries + 1 >= 5) await this.redis.del(key);
      else await this.redis.set(key, JSON.stringify({ ...c, tries: c.tries + 1 }), 600);
      throw new BadRequestException('That code isn’t right.');
    }
    await this.redis.del(key);
  }

  // ── The earner ─────────────────────────────────────────

  /** Ready to withdraw, still clearing, and being sent */
  async balance(userId: string, rules?: PayoutRules) {
    const r = rules ?? (await this.rules());
    const wallet = await this.prisma.wallet.findUnique({ where: { userId } });
    if (!wallet) return { currency: null as string | null, balance: 0, clearing: 0, available: 0, sending: 0, nextClearsAt: null as Date | null, clearingByDay: [] as { day: string; amount: number }[] };
    const since = new Date(Date.now() - r.clearingDays * DAY);
    const recent = await this.prisma.walletTransaction.findMany({
      where: { walletId: wallet.id, type: 'CREDIT', source: { in: [...CLEARING_SOURCES] }, createdAt: { gt: since } },
      select: { amount: true, createdAt: true }, orderBy: { createdAt: 'asc' },
    });
    const clearing = Math.min(Math.max(0, wallet.balance), recent.reduce((n, t) => n + t.amount, 0));
    const sending = await this.prisma.withdrawal.aggregate({ where: { userId, status: { in: ['SENDING', 'AWAITING_APPROVAL'] } }, _sum: { amount: true } });
    return {
      currency: wallet.currency, balance: wallet.balance, clearing,
      available: Math.max(0, wallet.balance - clearing), sending: sending._sum.amount ?? 0,
      nextClearsAt: recent[0] ? new Date(recent[0].createdAt.getTime() + r.clearingDays * DAY) : null,
      // What becomes withdrawable on each of the next days, for the week strip
      clearingByDay: Array.from({ length: Math.max(1, r.clearingDays) }, (_, i) => {
        const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() + i);
        const end = new Date(start.getTime() + DAY);
        return { day: start.toISOString(), amount: recent.filter(t => { const at = t.createdAt.getTime() + r.clearingDays * DAY; return at >= start.getTime() && at < end.getTime(); }).reduce((n, t) => n + t.amount, 0) };
      }),
    };
  }

  /** Everything the Get paid section needs */
  async mine(user: UserProfile) {
    const rules = await this.rules();
    const [bal, account, list, mins] = await Promise.all([
      this.balance(user.id, rules),
      this.prisma.payoutAccount.findUnique({ where: { userId: user.id } }),
      this.prisma.withdrawal.findMany({ where: { userId: user.id }, orderBy: { requestedAt: 'desc' }, take: 30 }),
      payoutMinimums(this.prisma),
    ]);
    const statements = await this.prisma.payoutStatement.findMany({ where: { recipientId: user.id, status: 'PAID' }, orderBy: { paidAt: 'desc' }, take: 10 });
    const today = await this.todayTotal(user.id);
    const cur = bal.currency ?? 'XAF';
    const auto = !!account && this.automatic(account, cur);
    return {
      ...bal,
      minimum: minimumFor(mins, cur),
      dailyLeft: auto ? Math.max(0, rules.dailyMax - today) : null,
      approvalAbove: rules.autoLimit, paused: rules.paused, payeePaysFee: rules.payeePaysFee,
      account: account ? {
        provider: account.provider, label: account.bankName, last: last(account.accountNumber), country: account.country,
        holderName: account.holderName, nameCheck: account.nameCheck ?? (account.isVerified ? 'confirmed' : 'unchecked'), confirmedByAdmin: account.isVerified,
        automatic: auto, hasPin: !!account.pinHash,
        readyAt: this.readyAt(account, rules), lockedUntil: account.pinLockedUntil && account.pinLockedUntil > new Date() ? account.pinLockedUntil : null,
        pinSetAt: account.pinSetAt, lockedByUser: account.lockedByUser, autoMode: account.autoMode, autoThreshold: account.autoThreshold, nextAutoAt: this.nextAuto(account),
        since: account.createdAt, changedAt: account.changedAt,
      } : null,
      withdrawals: list.map(w => this.row(w)),
      statements: statements.map(s => ({ id: s.id, amount: s.amount, currency: s.currency, paidAt: s.paidAt, paidTo: s.paidTo, reference: s.reference })),
    };
  }

  private automatic(a: { provider: string | null; country: string }, currency: string) {
    return (a.provider === 'MTN' || a.provider === 'ORANGE') && /^(cm|cameroon)$/i.test(a.country.trim()) && currency === 'XAF';
  }
  private readyAt(a: { changedAt: Date | null }, r: PayoutRules) {
    const t = a.changedAt ? a.changedAt.getTime() + r.coolingHours * 3600_000 : 0;
    return t > Date.now() ? new Date(t) : null;
  }
  private row(w: Withdrawal) {
    return {
      id: w.id, amount: w.amount, fee: w.fee, currency: w.currency, status: w.status, method: w.method, paidTo: w.paidTo, sentAt: w.sentAt, payeeName: w.payeeName,
      reference: w.transferId ?? w.reference, failureReason: w.failureReason, requestedAt: w.requestedAt, completedAt: w.completedAt,
      approvals: (w.approvals as Approval[]).length, approvalsNeeded: w.approvalsNeeded,
    };
  }
  private async todayTotal(userId: string) {
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const s = await this.prisma.withdrawal.aggregate({ where: { userId, requestedAt: { gte: start }, status: { notIn: ['FAILED', 'REJECTED'] } }, _sum: { amount: true } });
    return s._sum.amount ?? 0;
  }

  /** Save where money goes, with a one-time code; check the name with the operator where we can */
  async setAccount(user: UserProfile, dto: { provider?: string; number?: string; country?: string; bankName?: string; pin?: string; code?: string }) {
    if (!EARNER_ROLES.includes(user.role)) throw new ForbiddenException();
    await this.checkCode(user.id, dto.code);
    const provider = String(dto.provider ?? '').toUpperCase();
    const country = (dto.country ?? 'CM').trim() || 'CM';
    let number = String(dto.number ?? '').replace(/[^\d]/g, '');
    if (provider === 'MTN' || provider === 'ORANGE') {
      if (/^6\d{8}$/.test(number)) number = `237${number}`;
      if (!/^2376\d{8}$/.test(number)) throw new BadRequestException('Enter a Cameroon mobile number, for example 6 70 00 00 00');
    } else if (number.length < 6) throw new BadRequestException('Enter the account or phone number');
    const label = PROVIDERS[provider] ?? (dto.bankName?.trim() || 'Mobile money');
    if (dto.pin != null) this.validPin(dto.pin);

    // The name the operator has on the number, when Tranzak lets us ask
    let holderName: string | null = null, nameCheck = 'unchecked';
    if (provider === 'MTN' || provider === 'ORANGE') {
      try {
        const r = await this.tranzak.checkName(number);
        if (r.name) {
          holderName = r.name.trim().toUpperCase();
          const mine = new Set(words(nm(user)));
          nameCheck = words(holderName).some(w => mine.has(w)) ? 'match' : 'mismatch';
        }
      } catch (err: any) { this.logger.log(`Name check unavailable: ${err?.message}`); }
    }

    const before = await this.prisma.payoutAccount.findUnique({ where: { userId: user.id } });
    const changed = !before || before.accountNumber.replace(/\D/g, '') !== number || before.provider !== (provider || null);
    // A brand-new account can be paid straight away; a changed one waits, in case someone else changed it
    const hadMoneyOut = before ? await this.prisma.withdrawal.count({ where: { userId: user.id, status: 'PAID' } }) + await this.prisma.payoutStatement.count({ where: { recipientId: user.id, status: 'PAID' } }) : 0;
    const data = {
      bankName: label, accountNumber: number, country, provider: provider || null,
      ...(changed ? { holderName, nameCheck, isVerified: false, verifiedAt: null, changedAt: before && hadMoneyOut ? new Date() : null } : {}),
      ...(dto.pin != null ? { pinHash: await bcrypt.hash(dto.pin, 10), pinFailures: 0, pinLockedUntil: null, pinSetAt: new Date() } : {}),
    };
    const saved = await this.prisma.payoutAccount.upsert({ where: { userId: user.id }, update: data, create: { userId: user.id, ...data } as Prisma.PayoutAccountUncheckedCreateInput });
    this.audit.log(user.id, 'payout.account', 'PayoutAccount', saved.id, before ? { to: `${before.bankName} ·· ${last(before.accountNumber)}` } : undefined, { to: `${label} ·· ${last(number)}`, nameCheck: changed ? nameCheck : saved.nameCheck });
    if (before && changed) {
      this.mail.sendNotice(user.email, 'Your payout account was changed', {
        badge: 'Payouts', title: 'Your payout account was changed', firstName: user.firstName,
        text: `Your earnings will now be paid to ${label} ·· ${last(number)}.${data.changedAt ? ' For your safety, withdrawals to the new number open in 48 hours.' : ''}\n\nIf you didn’t make this change, reply to this email straight away.`,
        cta: 'Open Get paid', href: homeFor(user.role),
      }, 'security').catch(() => {});
    }
    if (changed && nameCheck !== 'match') this.notifyAdmins('Payout account to check', `${nm(user)}: ${label} ·· ${last(number)}${holderName ? ` is registered to ${holderName}` : ''}`);
    return this.mine(user);
  }

  async setPin(user: UserProfile, dto: { pin?: string; code?: string }) {
    await this.checkCode(user.id, dto.code);
    this.validPin(dto.pin);
    const a = await this.prisma.payoutAccount.findUnique({ where: { userId: user.id } });
    if (!a) throw new BadRequestException('Add your payout account first');
    await this.prisma.payoutAccount.update({ where: { id: a.id }, data: { pinHash: await bcrypt.hash(dto.pin!, 10), pinFailures: 0, pinLockedUntil: null, pinSetAt: new Date() } });
    this.audit.log(user.id, 'payout.pin', 'PayoutAccount', a.id);
    return { saved: true };
  }

  private validPin(pin?: string) {
    if (!pin || !/^\d{4}$/.test(pin)) throw new BadRequestException('Your PIN is 4 digits');
    if (WEAK_PINS.has(pin)) throw new BadRequestException('Choose a PIN that’s harder to guess');
  }

  /** Take money out: PIN or code, the rules, then send it or queue it for approval */
  async withdraw(user: UserProfile, dto: { amount?: number; pin?: string; code?: string }) {
    if (!EARNER_ROLES.includes(user.role)) throw new ForbiddenException();
    const rules = await this.rules();
    if (rules.paused) throw new BadRequestException('Withdrawals are paused for a short while. Your balance is safe; try again later.');
    const account = await this.prisma.payoutAccount.findUnique({ where: { userId: user.id } });
    if (!account) throw new BadRequestException('Add your payout account first');
    if (account.lockedByUser) throw new BadRequestException('You locked withdrawals. Unlock them in Safety with a code from your email.');
    const ready = this.readyAt(account, rules);
    if (ready) throw new BadRequestException(`Your payout account changed recently. Withdrawals to it open ${ready.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}.`);

    // Who's asking: the PIN, or a one-time code when they don't have one or forgot it
    if (dto.code) await this.checkCode(user.id, dto.code);
    else {
      if (!account.pinHash) throw new BadRequestException('Set your withdrawal PIN first, or use a code');
      if (account.pinLockedUntil && account.pinLockedUntil > new Date()) throw new BadRequestException(`Too many wrong PINs. Try again after ${account.pinLockedUntil.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}, or use a code.`);
      if (!dto.pin || !(await bcrypt.compare(dto.pin, account.pinHash))) {
        const fails = account.pinFailures + 1;
        await this.prisma.payoutAccount.update({ where: { id: account.id }, data: fails >= 5 ? { pinFailures: 0, pinLockedUntil: new Date(Date.now() + 30 * 60_000) } : { pinFailures: fails } });
        throw new BadRequestException(fails >= 5 ? 'Too many wrong PINs. Withdrawals are locked for 30 minutes; you can use a code instead.' : `That PIN isn’t right. ${5 - fails} tr${5 - fails === 1 ? 'y' : 'ies'} left.`);
      }
      if (account.pinFailures) await this.prisma.payoutAccount.update({ where: { id: account.id }, data: { pinFailures: 0 } });
    }
    return this.row(await this.take(user, account, Number(dto.amount), rules, false));
  }

  /** Take the money out of the balance and send it, or queue it for approval. The caller has checked who's asking. */
  private async take(user: UserProfile, account: PayoutAccount, requested: number, rules: PayoutRules, scheduled: boolean): Promise<Withdrawal> {
    const bal = await this.balance(user.id, rules);
    const currency = bal.currency ?? 'XAF';
    const auto = this.automatic(account, currency);
    let amount = Math.floor(requested);
    if (['XAF', 'XOF'].includes(currency)) amount = Math.floor(amount / 10) * 10;
    const min = minimumFor(await payoutMinimums(this.prisma), currency);
    if (!Number.isFinite(amount) || amount <= 0) throw new BadRequestException('Enter an amount');
    if (amount < min) throw new BadRequestException(`The smallest withdrawal is ${money(min, currency)}`);
    if (amount > bal.available) throw new BadRequestException(`You can withdraw up to ${money(bal.available, currency)} now${bal.clearing ? `; ${money(bal.clearing, currency)} is still clearing` : ''}.`);
    if (auto && (await this.todayTotal(user.id)) + amount > rules.dailyMax) throw new BadRequestException(`The most you can withdraw in a day is ${money(rules.dailyMax, currency)}.`);

    // Why a person should look first
    const flags: string[] = [];
    if (!auto) flags.push('by-hand');
    if (auto && amount > rules.autoLimit) flags.push('over-limit');
    if (account.nameCheck !== 'match' && !account.isVerified) flags.push('name-unconfirmed');
    const past = await this.prisma.withdrawal.findMany({ where: { userId: user.id, status: 'PAID' }, select: { amount: true }, take: 10, orderBy: { requestedAt: 'desc' } });
    if (past.length >= 3 && amount > 3 * (past.reduce((n, p) => n + p.amount, 0) / past.length) && amount > 50_000) flags.push('unusual');
    const approvalsNeeded = flags.length ? (amount > rules.twoApproversAbove ? 2 : 1) : 0;
    const paidTo = `${account.bankName} ·· ${last(account.accountNumber)}`;

    const w = await this.prisma.$transaction(async db => {
      const wallet = await db.wallet.findUnique({ where: { userId: user.id } });
      const took = await db.wallet.updateMany({ where: { id: wallet!.id, balance: { gte: amount } }, data: { balance: { decrement: amount } } });
      if (took.count !== 1) throw new BadRequestException('Your balance changed. Refresh and try again.');
      const debit = await db.walletTransaction.create({ data: { walletId: wallet!.id, type: 'DEBIT', source: 'PAYOUT', amount, currency, description: `${scheduled ? 'Automatic withdrawal' : 'Withdrawal'} to ${paidTo}` } });
      return db.withdrawal.create({
        data: {
          userId: user.id, amount, currency, status: approvalsNeeded ? 'AWAITING_APPROVAL' : 'SENDING', method: auto ? 'tranzak' : 'manual',
          paidTo, payeeNumber: account.accountNumber, payeeName: account.holderName, reference: this.newRef(), debitTxId: debit.id, approvalsNeeded, flags,
        },
      });
    });
    this.audit.log(scheduled ? null : user.id, scheduled ? 'payout.auto' : 'payout.withdraw', 'Withdrawal', w.id, undefined, { amount, currency, paidTo, flags });
    if (approvalsNeeded) {
      this.notifyAdmins(`Withdrawal to approve: ${money(amount, currency)}`, `${nm(user)} · ${paidTo}${flags.includes('by-hand') ? ' · to pay by hand' : ''}`);
      return w;
    }
    return this.send(w);
  }

  // ── Automatic payouts and the earner's own lock ────────

  /** Turn automatic payouts on (needs a code: it's the earner saying yes to every future payment) or off */
  async setAuto(user: UserProfile, dto: { mode?: string | null; threshold?: number; code?: string }) {
    const a = await this.prisma.payoutAccount.findUnique({ where: { userId: user.id } });
    if (!a) throw new BadRequestException('Add your payout account first');
    const mode = dto.mode && ['weekly', 'monthly', 'threshold'].includes(dto.mode) ? dto.mode : null;
    if (mode) await this.checkCode(user.id, dto.code);
    let threshold: number | null = null;
    if (mode === 'threshold') {
      const min = minimumFor(await payoutMinimums(this.prisma), 'XAF');
      threshold = Math.floor(Number(dto.threshold) / 10) * 10;
      if (!threshold || threshold < min) throw new BadRequestException(`Choose an amount of at least ${money(min, 'XAF')}`);
    }
    await this.prisma.payoutAccount.update({ where: { id: a.id }, data: { autoMode: mode, autoThreshold: threshold } });
    this.audit.log(user.id, 'payout.auto-setting', 'PayoutAccount', a.id, { mode: a.autoMode }, { mode, threshold });
    return this.mine(user);
  }

  /** Lost phone: lock straight away; unlocking needs a code from email */
  async setLock(user: UserProfile, dto: { locked?: boolean; code?: string }) {
    const a = await this.prisma.payoutAccount.findUnique({ where: { userId: user.id } });
    if (!a) throw new BadRequestException('Add your payout account first');
    if (!dto.locked) await this.checkCode(user.id, dto.code);
    await this.prisma.payoutAccount.update({ where: { id: a.id }, data: { lockedByUser: !!dto.locked } });
    this.audit.log(user.id, dto.locked ? 'payout.lock' : 'payout.unlock', 'PayoutAccount', a.id);
    if (dto.locked) this.mail.sendNotice(user.email, 'You locked withdrawals', { badge: 'Payouts', title: 'Withdrawals are locked', firstName: user.firstName, text: 'No one can withdraw from your CareerPath Africa balance until you unlock it with a code from this email address. Your earnings keep adding up as usual.\n\nIf you didn’t do this, reply to this email.', cta: 'Open Get paid', href: homeFor(user.role) }, 'security').catch(() => {});
    return this.mine(user);
  }

  /** When the next automatic payout runs, for the earner's page */
  private nextAuto(a: { autoMode: string | null }) {
    if (!a.autoMode) return null;
    const d = new Date(); d.setUTCHours(8, 0, 0, 0);
    if (a.autoMode === 'threshold') { if (d.getTime() <= Date.now()) d.setUTCDate(d.getUTCDate() + 1); return d; }
    for (let i = 0; i < 40; i++) {
      if (d.getTime() > Date.now() && (a.autoMode === 'weekly' ? d.getUTCDay() === 5 : d.getUTCDate() === 1)) return d;
      d.setUTCDate(d.getUTCDate() + 1);
    }
    return null;
  }

  /** 09:00 in Cameroon: pay out everyone whose automatic payout is due */
  @Cron('0 8 * * *')
  async runAutomatic() {
    const rules = await this.rules();
    if (rules.paused) return;
    const now = new Date();
    const modes = ['threshold', ...(now.getUTCDay() === 5 ? ['weekly'] : []), ...(now.getUTCDate() === 1 ? ['monthly'] : [])];
    const due = await this.prisma.payoutAccount.findMany({ where: { autoMode: { in: modes }, lockedByUser: false }, include: { user: true } });
    const min = minimumFor(await payoutMinimums(this.prisma), 'XAF');
    for (const a of due) {
      try {
        if (this.readyAt(a, rules) || !EARNER_ROLES.includes(a.user.role) || a.user.deletedAt) continue;
        if (await this.prisma.withdrawal.count({ where: { userId: a.userId, status: { in: ['SENDING', 'AWAITING_APPROVAL'] } } })) continue;
        const bal = await this.balance(a.userId, rules);
        const floor = a.autoMode === 'threshold' ? Math.max(min, a.autoThreshold ?? 0) : Math.max(min, 1);
        if (bal.available < floor) continue;
        const room = this.automatic(a, bal.currency ?? 'XAF') ? rules.dailyMax - (await this.todayTotal(a.userId)) : bal.available;
        const amount = Math.min(bal.available, room);
        if (amount < min) continue;
        await this.take(a.user, a, amount, rules, true);
      } catch (err: any) { this.logger.warn(`Automatic payout for ${a.userId}: ${err?.message}`); }
    }
  }

  private newRef() { return `CPA-WD-${Date.now().toString(36).toUpperCase()}-${randomBytes(3).toString('hex').toUpperCase()}`; }

  /** Hand it to Tranzak. A reply that never comes back is found later by our reference. */
  private async send(w: Withdrawal): Promise<Withdrawal> {
    const rules = await this.rules();
    const account = await this.prisma.payoutAccount.findUnique({ where: { userId: w.userId } });
    w = await this.prisma.withdrawal.update({ where: { id: w.id }, data: { status: 'SENDING', sentAt: new Date(), failureReason: null } });
    try {
      const t = await this.tranzak.transferToMobileWallet({
        amount: w.amount, currency: w.currency, number: w.payeeNumber, ref: w.reference,
        name: account?.nameCheck === 'match' ? account.holderName : null, verifyName: account?.nameCheck === 'match',
        description: `CareerPath Africa earnings ${w.reference}`, payeePaysFee: rules.payeePaysFee,
      });
      w = await this.prisma.withdrawal.update({ where: { id: w.id }, data: { transferId: t.transferId, fee: t.fee ?? null } });
      return this.settle(w, t);
    } catch (err: any) {
      // No answer at all: it may have gone through. The check every 5 minutes finds out by our reference.
      if (err?.isAxiosError && !err.response) { this.logger.warn(`Transfer ${w.reference}: no reply (${err.message})`); return w; }
      const reason = err?.response?.data?.errorMsg ?? err?.message ?? 'Tranzak refused the transfer';
      this.logger.warn(`Transfer ${w.reference} refused: ${reason}`);
      // Usually the payout account is short. Hold it for an admin rather than bouncing the earner.
      w = await this.prisma.withdrawal.update({ where: { id: w.id }, data: { status: 'AWAITING_APPROVAL', failureReason: String(reason).slice(0, 300), approvalsNeeded: Math.max(1, w.approvalsNeeded), flags: { set: [...new Set([...w.flags, 'send-failed'])] } } });
      this.notifyAdmins('A withdrawal couldn’t be sent', `${money(w.amount, w.currency)} to ${w.paidTo}: ${reason}`);
      return w;
    }
  }

  /** Apply what Tranzak says happened */
  private async settle(w: Withdrawal, t: TranzakTransfer): Promise<Withdrawal> {
    const s = String(t.status).toUpperCase();
    if (s === 'SUCCESSFUL') return this.paid(w, { fee: t.fee ?? w.fee ?? null, transferId: t.transferId });
    if (s === 'FAILED' || s === 'CANCELLED') return this.giveBack(w, 'FAILED', t.errorMessage ? `The operator refused it: ${t.errorMessage}` : 'The operator refused it');
    return w;
  }

  private async paid(w: Withdrawal, o: { fee?: number | null; transferId?: string | null; reference?: string | null }) {
    const done = await this.prisma.withdrawal.updateMany({ where: { id: w.id, status: { in: ['SENDING', 'AWAITING_APPROVAL'] } }, data: { status: 'PAID', completedAt: new Date(), fee: o.fee ?? w.fee, transferId: o.transferId ?? w.transferId, ...(o.reference ? { failureReason: null } : {}) } });
    const fresh = await this.prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
    if (!done.count) return fresh;
    const u = await this.prisma.userProfile.findUniqueOrThrow({ where: { id: w.userId } });
    const ref = o.reference ?? o.transferId ?? w.reference;
    this.notifications.notify(u.id, { type: 'system', title: 'Money sent', body: `${money(w.amount, w.currency)} to ${w.paidTo} · ref ${ref}`, href: homeFor(u.role) });
    this.mail.sendNotice(u.email, `${money(w.amount, w.currency)} is on its way to you`, {
      badge: 'Payouts', title: `${money(w.amount, w.currency)} sent`, firstName: u.firstName,
      text: `Your withdrawal has been sent to ${w.paidTo}.${fresh.fee ? ` The operator’s fee was ${money(fresh.fee, w.currency)}.` : ''}`,
      details: [['Amount', money(w.amount, w.currency)], ['Sent to', w.paidTo], ['Reference', ref]],
      cta: 'See your withdrawals', href: homeFor(u.role),
    }, 'payouts').catch(() => {});
    this.audit.log(null, 'payout.paid', 'Withdrawal', w.id, undefined, { amount: w.amount, ref });
    return fresh;
  }

  /** Put the money back: the debit goes, as if it had never left */
  private async giveBack(w: Withdrawal, status: 'FAILED' | 'REJECTED', reason: string, adminId?: string) {
    const fresh = await this.prisma.$transaction(async db => {
      const moved = await db.withdrawal.updateMany({ where: { id: w.id, status: { in: ['SENDING', 'AWAITING_APPROVAL'] } }, data: { status, failureReason: reason.slice(0, 300), completedAt: new Date(), rejectedById: adminId ?? null } });
      if (!moved.count) return null;
      if (w.debitTxId) await db.walletTransaction.delete({ where: { id: w.debitTxId } }).catch(() => null);
      await db.wallet.update({ where: { userId: w.userId }, data: { balance: { increment: w.amount } } });
      return db.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
    });
    if (!fresh) return this.prisma.withdrawal.findUniqueOrThrow({ where: { id: w.id } });
    const u = await this.prisma.userProfile.findUniqueOrThrow({ where: { id: w.userId } });
    this.notifications.notify(u.id, { type: 'system', title: 'Withdrawal returned to your balance', body: `${money(w.amount, w.currency)}: ${reason}`, href: homeFor(u.role) });
    this.mail.sendNotice(u.email, 'Your withdrawal was returned to your balance', {
      badge: 'Payouts', title: 'Your withdrawal didn’t go through', firstName: u.firstName,
      text: `${money(w.amount, w.currency)} to ${w.paidTo} wasn’t sent, so it’s back in your balance. You can withdraw it again.`,
      quote: reason, quoteLabel: 'Why', cta: 'Open Get paid', href: homeFor(u.role),
    }, 'payouts').catch(() => {});
    this.audit.log(adminId ?? null, `payout.${status.toLowerCase()}`, 'Withdrawal', w.id, undefined, { amount: w.amount, reason });
    return fresh;
  }

  /** From Tranzak's TRANSFER.COMPLETED notice */
  async onTransferEvent(resource: TranzakTransfer) {
    const w = await this.prisma.withdrawal.findFirst({ where: { OR: [{ transferId: resource.transferId }, ...(resource.customTransactionRef ? [{ reference: resource.customTransactionRef }] : [])] } });
    if (!w || w.status !== 'SENDING') return;
    if (!w.transferId) await this.prisma.withdrawal.update({ where: { id: w.id }, data: { transferId: resource.transferId } });
    await this.settle({ ...w, transferId: resource.transferId }, resource);
  }

  /** Ask Tranzak about one still being sent */
  async refresh(id: string) {
    const w = await this.prisma.withdrawal.findUnique({ where: { id } });
    if (!w) throw new NotFoundException();
    if (w.status !== 'SENDING') return this.row(w);
    try {
      const t = w.transferId ? await this.tranzak.transferDetails(w.transferId) : await this.tranzak.transferByRef(w.reference);
      if (t) {
        if (!w.transferId) await this.prisma.withdrawal.update({ where: { id: w.id }, data: { transferId: t.transferId, fee: t.fee ?? null } });
        return this.row(await this.settle({ ...w, transferId: t.transferId }, t));
      }
      // Tranzak never got it: put it in front of an admin to send again
      if (w.sentAt && w.sentAt.getTime() < Date.now() - 30 * 60_000) {
        return this.row(await this.prisma.withdrawal.update({ where: { id: w.id }, data: { status: 'AWAITING_APPROVAL', approvalsNeeded: Math.max(1, w.approvalsNeeded), failureReason: 'Tranzak has no record of it', flags: { set: [...new Set([...w.flags, 'send-failed'])] } } }));
      }
    } catch (err: any) { this.logger.warn(`Refresh ${w.reference}: ${err?.message}`); }
    return this.row(w);
  }

  @Cron('*/5 * * * *')
  async checkSending() {
    const stuck = await this.prisma.withdrawal.findMany({ where: { status: 'SENDING', sentAt: { lt: new Date(Date.now() - 2 * 60_000) } }, select: { id: true }, take: 50 });
    for (const s of stuck) await this.refresh(s.id).catch(() => null);
  }

  // ── Admin ──────────────────────────────────────────────

  private notifyAdmins(title: string, body: string) {
    this.prisma.userProfile.findMany({ where: { role: 'ADMIN', deletedAt: null }, select: { id: true } })
      .then(a => this.notifications.notify(a.map(x => x.id), { type: 'system', title, body, href: '/admin/settlements' }))
      .catch(() => {});
  }

  async overview(admin: UserProfile) {
    const rules = await this.rules();
    const unlocked = !!(await this.redis.get(`cpa:payout-admin-ok:${admin.id}`));
    const start = new Date(); start.setHours(0, 0, 0, 0);
    const [tz, awaiting, today, failedToday, wallets, accounts] = await Promise.all([
      this.tranzak.balances().then(b => ({ ok: true as const, ...b })).catch((err: any) => ({ ok: false as const, error: err?.response?.data?.errorMsg ?? err?.message ?? 'Couldn’t reach Tranzak' })),
      this.prisma.withdrawal.aggregate({ where: { status: 'AWAITING_APPROVAL' }, _sum: { amount: true }, _count: true }),
      this.prisma.withdrawal.aggregate({ where: { status: 'PAID', completedAt: { gte: start } }, _sum: { amount: true }, _count: true }),
      this.prisma.withdrawal.count({ where: { status: 'FAILED', completedAt: { gte: start } } }),
      this.prisma.wallet.findMany({ where: { balance: { gt: 0 }, user: { role: { in: EARNER_ROLES as any }, deletedAt: null } }, select: { balance: true, currency: true } }),
      this.prisma.payoutAccount.count({ where: { isVerified: false, OR: [{ nameCheck: { not: 'match' } }, { nameCheck: null }] } }),
    ]);
    const owed: Record<string, number> = {};
    wallets.forEach(w => { owed[w.currency] = (owed[w.currency] ?? 0) + w.balance; });
    // How fast money goes out: what was paid in the last 30 days, per day; until there is history, assume a tenth of what's owed
    const month = await this.prisma.withdrawal.aggregate({ where: { status: 'PAID', currency: 'XAF', completedAt: { gte: new Date(Date.now() - 30 * DAY) } }, _sum: { amount: true } });
    const perDay = Math.max(Math.round((month._sum.amount ?? 0) / 30), Math.round((owed.XAF ?? 0) / 10));
    const float = tz.ok ? tz.payout.available : 0;
    const cover = { perDay, days: perDay ? Math.floor(float / perDay) : null, topUpForTwoWeeks: tz.ok ? Math.max(0, Math.ceil((perDay * 14 + Math.max(0, (owed.XAF ?? 0) - perDay * 14) - float) / 1000) * 1000) : null, basedOnHistory: !!month._sum.amount };
    return {
      tranzak: tz, owed, rules, unlocked, cover,
      awaiting: { count: awaiting._count, amount: awaiting._sum.amount ?? 0 },
      today: { count: today._count, amount: today._sum.amount ?? 0, failed: failedToday },
      accountsToCheck: accounts,
    };
  }

  async list(q: { status?: string; search?: string; take?: number }) {
    const status = q.status && q.status !== 'all' ? (q.status.toUpperCase() as WithdrawalStatus) : undefined;
    const rows = await this.prisma.withdrawal.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(q.search ? { OR: [{ reference: { contains: q.search, mode: 'insensitive' } }, { transferId: { contains: q.search, mode: 'insensitive' } }, { user: { OR: [{ email: { contains: q.search, mode: 'insensitive' } }, { name: { contains: q.search, mode: 'insensitive' } }, { firstName: { contains: q.search, mode: 'insensitive' } }, { lastName: { contains: q.search, mode: 'insensitive' } }] } }] } : {}),
      },
      orderBy: { requestedAt: 'desc' }, take: Math.min(200, q.take ?? 100),
      include: { user: { select: { id: true, name: true, firstName: true, lastName: true, email: true, role: true, avatarUrl: true, createdAt: true, payoutAccount: { select: { nameCheck: true, holderName: true, isVerified: true, changedAt: true, createdAt: true, country: true } } } } },
    });
    // What they earned, so an approver can see where the money came from
    const ids = [...new Set(rows.filter(r => r.status === 'AWAITING_APPROVAL').map(r => r.userId))];
    const trail = new Map<string, { source: string; amount: number }[]>();
    const months = new Map<string, number[]>();
    const usual = new Map<string, number | null>();
    const sixAgo = new Date(); sixAgo.setDate(1); sixAgo.setHours(0, 0, 0, 0); sixAgo.setMonth(sixAgo.getMonth() - 5);
    for (const id of ids) {
      const g = await this.prisma.walletTransaction.groupBy({ by: ['source'], where: { wallet: { userId: id }, type: 'CREDIT', createdAt: { gte: new Date(Date.now() - 90 * DAY) } }, _sum: { amount: true } });
      trail.set(id, g.map(x => ({ source: x.source, amount: x._sum.amount ?? 0 })).sort((a, b) => b.amount - a.amount));
      const credits = await this.prisma.walletTransaction.findMany({ where: { wallet: { userId: id }, type: 'CREDIT', createdAt: { gte: sixAgo } }, select: { amount: true, createdAt: true } });
      const series = Array(6).fill(0);
      credits.forEach(c => { const m = (c.createdAt.getFullYear() - sixAgo.getFullYear()) * 12 + c.createdAt.getMonth() - sixAgo.getMonth(); if (m >= 0 && m < 6) series[m] += c.amount; });
      months.set(id, series);
      const past = await this.prisma.withdrawal.findMany({ where: { userId: id, status: 'PAID' }, select: { amount: true }, take: 10, orderBy: { requestedAt: 'desc' } });
      usual.set(id, past.length ? Math.round(past.reduce((n, p) => n + p.amount, 0) / past.length) : null);
    }
    // A plain risk level, so an approver knows where to look hardest
    const risk = (w: (typeof rows)[number]) => {
      const a = w.user.payoutAccount;
      const recent = !!a?.changedAt && Date.now() - a.changedAt.getTime() < 7 * DAY;
      if (recent || (a && a.nameCheck === 'mismatch' && !a.isVerified)) return 'high';
      if (w.flags.includes('unusual') || w.flags.includes('name-unconfirmed') || w.amount > 1_000_000) return 'medium';
      return 'low';
    };
    return rows.map(w => ({
      ...this.row(w), flags: w.flags, transferId: w.transferId, ourRef: w.reference, payeeName: w.payeeName, sentAt: w.sentAt,
      approvedBy: (w.approvals as Approval[]).map(a => a.name),
      user: { id: w.user.id, name: nm(w.user), email: w.user.email, role: w.user.role, avatarUrl: w.user.avatarUrl, since: w.user.createdAt },
      account: w.user.payoutAccount, earned90d: trail.get(w.userId) ?? null,
      months: months.get(w.userId) ?? null, usual: usual.get(w.userId) ?? null, risk: w.status === 'AWAITING_APPROVAL' ? risk(w) : null,
    }));
  }

  async approve(admin: UserProfile, id: string, code?: string) {
    await this.checkAdmin(admin.id, code);
    const w = await this.prisma.withdrawal.findUnique({ where: { id } });
    if (!w) throw new NotFoundException();
    if (w.status !== 'AWAITING_APPROVAL') throw new BadRequestException('This one isn’t waiting for approval');
    if (w.userId === admin.id) throw new ForbiddenException('You can’t approve money paid to yourself');
    if (w.method === 'manual') throw new BadRequestException('This one is paid by hand: pay it, then use “Mark paid” with the reference');
    const approvals = w.approvals as Approval[];
    // A retry after a failed send needs a fresh approval, so the earlier ones don't count again
    const valid = w.flags.includes('send-failed') && w.failureReason ? [] : approvals;
    if (valid.some(a => a.adminId === admin.id)) throw new BadRequestException('You’ve already approved this. A second admin has to approve it too.');
    const next = [...valid, { adminId: admin.id, name: nm(admin), at: new Date().toISOString() }];
    let fresh = await this.prisma.withdrawal.update({ where: { id }, data: { approvals: next as unknown as Prisma.InputJsonValue } });
    this.audit.log(admin.id, 'payout.approve', 'Withdrawal', id, undefined, { approvals: next.length, of: w.approvalsNeeded });
    if (next.length >= w.approvalsNeeded) {
      // A send that failed before goes again under a new reference, so Tranzak doesn't refuse it as a duplicate
      if (w.flags.includes('send-failed')) fresh = await this.prisma.withdrawal.update({ where: { id }, data: { reference: this.newRef(), transferId: null } });
      fresh = await this.send(fresh);
    }
    return this.row(fresh);
  }

  async reject(admin: UserProfile, id: string, reason?: string) {
    const w = await this.prisma.withdrawal.findUnique({ where: { id } });
    if (!w) throw new NotFoundException();
    if (w.status !== 'AWAITING_APPROVAL') throw new BadRequestException('Only withdrawals waiting for approval can be refused');
    if (!reason?.trim()) throw new BadRequestException('Say why, so they know what to do');
    return this.row(await this.giveBack(w, 'REJECTED', `Refused by CareerPath: ${reason.trim()}`, admin.id));
  }

  /** Paid by hand (outside Cameroon, another provider, or Tranzak down) */
  async markPaid(admin: UserProfile, id: string, dto: { reference?: string; code?: string }) {
    await this.checkAdmin(admin.id, dto.code);
    const w = await this.prisma.withdrawal.findUnique({ where: { id } });
    if (!w) throw new NotFoundException();
    if (w.status !== 'AWAITING_APPROVAL') throw new BadRequestException('This one isn’t waiting to be paid');
    if (w.userId === admin.id) throw new ForbiddenException('You can’t pay yourself');
    if (!dto.reference?.trim()) throw new BadRequestException('Add the mobile money or bank reference, so they can trace it');
    const approvals = [...(w.approvals as Approval[]), { adminId: admin.id, name: nm(admin), at: new Date().toISOString() }];
    await this.prisma.withdrawal.update({ where: { id }, data: { approvals: approvals as unknown as Prisma.InputJsonValue, method: 'manual', transferId: dto.reference.trim().slice(0, 120) } });
    this.audit.log(admin.id, 'payout.manual', 'Withdrawal', id, undefined, { reference: dto.reference.trim() });
    return this.row(await this.paid({ ...w, transferId: dto.reference.trim() }, { reference: dto.reference.trim(), transferId: dto.reference.trim().slice(0, 120) }));
  }

  async topUp(admin: UserProfile, dto: { amount?: number; code?: string }) {
    await this.checkAdmin(admin.id, dto.code);
    const amount = Math.floor(Number(dto.amount) / 10) * 10;
    if (!amount || amount < 1000) throw new BadRequestException('Enter an amount of at least FCFA 1,000');
    const ref = `CPA-TOPUP-${Date.now().toString(36).toUpperCase()}`;
    try { await this.tranzak.topUpPayoutAccount(amount, 'XAF', ref); }
    catch (err: any) { throw new BadRequestException(err?.response?.data?.errorMsg ?? err?.message ?? 'Tranzak refused the top-up'); }
    this.audit.log(admin.id, 'payouts.topup', 'Tranzak', ref, undefined, { amount });
    return { toppedUp: amount, reference: ref };
  }

  /** Each month: paid through Tranzak, paid by hand (withdrawals and the old statements), failed, people */
  async history() {
    const since = new Date(); since.setDate(1); since.setHours(0, 0, 0, 0); since.setMonth(since.getMonth() - 11);
    const [w, st] = await Promise.all([
      this.prisma.withdrawal.findMany({ where: { requestedAt: { gte: since } }, select: { userId: true, amount: true, fee: true, status: true, method: true, currency: true, completedAt: true, requestedAt: true } }),
      this.prisma.payoutStatement.findMany({ where: { status: 'PAID', paidAt: { gte: since } }, select: { recipientId: true, amount: true, currency: true, paidAt: true } }),
    ]);
    const key = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const months = new Map<string, { month: string; people: Set<string>; api: number; hand: number; fees: number; failed: number; returned: number; currency: string }>();
    const get = (m: string, cur: string) => { if (!months.has(m)) months.set(m, { month: m, people: new Set(), api: 0, hand: 0, fees: 0, failed: 0, returned: 0, currency: cur }); return months.get(m)!; };
    for (const x of w) {
      const m = get(key(x.completedAt ?? x.requestedAt), x.currency);
      if (x.status === 'PAID') { m.people.add(x.userId); if (x.method === 'tranzak') m.api += x.amount; else m.hand += x.amount; m.fees += x.fee ?? 0; }
      if (x.status === 'FAILED') { m.failed++; m.returned += x.amount; }
    }
    for (const s of st) { const m = get(key(s.paidAt!), s.currency); m.people.add(s.recipientId); m.hand += s.amount; }
    return [...months.values()].sort((a, b) => b.month.localeCompare(a.month)).map(m => ({ ...m, people: m.people.size, total: m.api + m.hand }));
  }

  async accountsToCheck() {
    const rows = await this.prisma.payoutAccount.findMany({
      where: { isVerified: false, OR: [{ nameCheck: { not: 'match' } }, { nameCheck: null }] },
      include: { user: { select: { id: true, name: true, firstName: true, lastName: true, email: true, role: true } } }, orderBy: { updatedAt: 'desc' }, take: 100,
    });
    return rows.map(a => ({ id: a.id, user: { id: a.user.id, name: nm(a.user), email: a.user.email, role: a.user.role }, label: a.bankName, last: last(a.accountNumber), country: a.country, holderName: a.holderName, nameCheck: a.nameCheck ?? 'unchecked', automatic: this.automatic(a, 'XAF'), updatedAt: a.updatedAt }));
  }
}
