import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma, UserProfile } from '@prisma/client';
import { minorToMajor } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { PaymentsService } from './payments.service';

const MIN = 60_000, DAY = 86_400_000;
type Who = { name: string | null; firstName: string | null; lastName: string | null; email: string };
const nameOf = (p: Who) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
/** "Abena Mensah" → "A. M." for public checks */
const initials = (p: Who) => nameOf(p).split(/\s+/).filter(Boolean).slice(0, 3).map(w => `${w[0].toUpperCase()}.`).join(' ');

/**
 * Payments after checkout: every attempt and what became of it, asking the gateway when a
 * confirmation never arrived (automatically, by the student, or by an admin), refunds, and the
 * public receipt check.
 */
@Injectable()
export class PaymentOpsService {
  private readonly logger = new Logger(PaymentOpsService.name);
  private sweeping = false;

  constructor(private prisma: PrismaService, private payments: PaymentsService, private audit: AuditService) {}

  // ── Asking the gateway ───────────────────────────────────

  /** Check one attempt with its gateway; gives access if it was paid and we never heard */
  async check(attemptId: string) {
    const a = await this.prisma.paymentAttempt.findUnique({ where: { id: attemptId } });
    if (!a) throw new NotFoundException('Payment not found');
    if (a.status === 'PAID' || a.status === 'REFUNDED') return { status: a.status, changed: false };
    if (!a.sessionId) {
      await this.prisma.paymentAttempt.update({ where: { id: a.id }, data: { status: 'FAILED', failureReason: 'The gateway never started this payment', checkedAt: new Date() } });
      return { status: 'FAILED', changed: true };
    }
    const gw = this.payments.gatewayByName(a.gateway);
    const res = await gw.lookup(a.sessionId);
    if (res.status === 'paid' && res.event) {
      const ok = await this.payments.completeFromEvent(res.event, gw);
      const now = await this.prisma.paymentAttempt.findUnique({ where: { id: a.id } });
      if (!ok || now?.status !== 'PAID') {
        await this.prisma.paymentAttempt.update({ where: { id: a.id }, data: { checkedAt: new Date(), failureReason: 'Paid, but the payment details didn’t match an order — check it by hand' } });
        return { status: 'PENDING', changed: false, reason: 'Paid, but needs a look' };
      }
      this.audit.log(null, 'payment.recovered', 'PaymentAttempt', a.id, { status: a.status }, { status: 'PAID' });
      return { status: 'PAID', changed: true };
    }
    // Waiting payments get a little time before being called abandoned
    const old = Date.now() - +a.createdAt > 2 * 60 * MIN;
    const status = res.status === 'failed' ? 'FAILED' : res.status === 'abandoned' || (res.status === 'pending' && old) ? 'ABANDONED' : 'PENDING';
    await this.prisma.paymentAttempt.update({ where: { id: a.id }, data: { status, failureReason: res.reason ?? (status === 'ABANDONED' ? 'Not finished' : null), checkedAt: new Date() } });
    return { status, changed: status !== a.status, reason: res.reason };
  }

  /** Every 15 minutes: attempts still waiting after 5 minutes (up to 3 days old) are checked */
  @Cron('*/15 * * * *')
  async sweep() {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      const due = await this.prisma.paymentAttempt.findMany({
        where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 5 * MIN), gt: new Date(Date.now() - 3 * DAY) }, OR: [{ checkedAt: null }, { checkedAt: { lt: new Date(Date.now() - 10 * MIN) } }] },
        orderBy: { createdAt: 'asc' }, take: 50, select: { id: true },
      });
      for (const a of due) await this.check(a.id).catch(e => this.logger.warn(`Payment check ${a.id} failed: ${e?.message}`));
    } finally { this.sweeping = false; }
  }

  /** A student who paid but sees no course: check their recent unfinished payments */
  async checkMine(student: UserProfile) {
    const recent = await this.prisma.paymentAttempt.findMany({ where: { studentId: student.id, status: { in: ['PENDING', 'ABANDONED', 'FAILED'] }, createdAt: { gt: new Date(Date.now() - 7 * DAY) } }, orderBy: { createdAt: 'desc' }, take: 5 });
    const results = [];
    for (const a of recent) {
      const r = await this.check(a.id).catch(() => ({ status: 'UNKNOWN', changed: false }));
      results.push({ title: a.title, amount: a.amount, currency: a.currency, at: a.createdAt, status: r.status, delivered: r.status === 'PAID' });
    }
    const delivered = results.filter(r => r.delivered);
    const receipts = delivered.length ? await this.prisma.paymentAttempt.findMany({ where: { id: { in: recent.filter((_, i) => results[i].delivered).map(a => a.id) } }, select: { packagePurchaseId: true, coursePurchaseId: true } }) : [];
    return { checked: results.length, delivered: delivered.length, results, receipts };
  }

  // ── Admin ────────────────────────────────────────────────

  async list(q: { status?: string; search?: string; page?: string }) {
    const page = Math.max(1, Number(q.page) || 1);
    const term = q.search?.trim();
    const statusWhere: Prisma.PaymentAttemptWhereInput =
      q.status === 'paid' ? { status: 'PAID' } : q.status === 'waiting' ? { status: 'PENDING' } : q.status === 'failed' ? { status: { in: ['FAILED', 'ABANDONED'] } } : q.status === 'refunded' ? { status: 'REFUNDED' } : {};
    const searchWhere: Prisma.PaymentAttemptWhereInput = term ? { OR: [{ sessionId: { contains: term, mode: 'insensitive' } }, { title: { contains: term, mode: 'insensitive' } }, { student: { email: { contains: term, mode: 'insensitive' } } }] } : {};
    const where = { ...statusWhere, ...searchWhere };
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const [rows, total, counts, paidMonth, startedMonth, refunds, stuck] = await Promise.all([
      this.prisma.paymentAttempt.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * 50, take: 50, include: { student: { select: { id: true, name: true, firstName: true, lastName: true, email: true } } } }),
      this.prisma.paymentAttempt.count({ where }),
      this.prisma.paymentAttempt.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.paymentAttempt.findMany({ where: { status: { in: ['PAID', 'REFUNDED'] }, paidAt: { gte: monthStart } }, select: { amount: true, currency: true } }),
      this.prisma.paymentAttempt.count({ where: { createdAt: { gte: monthStart } } }),
      this.prisma.refund.findMany({ where: { createdAt: { gte: monthStart } }, select: { amount: true, currency: true } }),
      this.prisma.paymentAttempt.count({ where: { status: 'PENDING', createdAt: { lt: new Date(Date.now() - 60 * MIN) } } }),
    ]);
    // Receipts for paid rows
    const [pp, cp] = await Promise.all([
      this.prisma.packagePurchase.findMany({ where: { id: { in: rows.map(r => r.packagePurchaseId).filter((x): x is string => !!x) } }, select: { id: true, invoiceNo: true, refundedAt: true } }),
      this.prisma.coursePurchase.findMany({ where: { id: { in: rows.map(r => r.coursePurchaseId).filter((x): x is string => !!x) } }, select: { id: true, invoiceNo: true, refundedAt: true } }),
    ]);
    const sum = (xs: { amount: number; currency: string }[]) => Object.entries(xs.reduce((m, x) => ({ ...m, [x.currency]: (m[x.currency] ?? 0) + x.amount }), {} as Record<string, number>)).map(([currency, amount]) => ({ currency, amount }));
    const count = (s: string[]) => counts.filter(c => s.includes(c.status)).reduce((n, c) => n + c._count._all, 0);
    const paidThisMonth = await this.prisma.paymentAttempt.count({ where: { status: { in: ['PAID', 'REFUNDED'] }, createdAt: { gte: monthStart } } });
    return {
      rows: rows.map(r => {
        const purchase = pp.find(x => x.id === r.packagePurchaseId) ?? cp.find(x => x.id === r.coursePurchaseId);
        return {
          id: r.id, kind: r.kind, title: r.title, amount: r.amount, currency: r.currency, gateway: r.gateway, sessionId: r.sessionId, status: r.status,
          failureReason: r.failureReason, createdAt: r.createdAt, paidAt: r.paidAt, checkedAt: r.checkedAt,
          purchaseId: r.packagePurchaseId ?? r.coursePurchaseId, receipt: purchase?.invoiceNo ?? null,
          student: { id: r.student.id, name: nameOf(r.student), email: r.student.email },
        };
      }),
      total, page, pages: Math.max(1, Math.ceil(total / 50)),
      counts: { all: count(['PENDING', 'PAID', 'FAILED', 'ABANDONED', 'REFUNDED']), paid: count(['PAID']), waiting: count(['PENDING']), failed: count(['FAILED', 'ABANDONED']), refunded: count(['REFUNDED']) },
      stats: { paidThisMonth: sum(paidMonth), paidCount: paidMonth.length, successRate: startedMonth ? Math.round((paidThisMonth / startedMonth) * 100) : null, refunded: sum(refunds), refundCount: refunds.length, waitingOverHour: stuck },
    };
  }

  /** Check everything still waiting, now */
  async checkAll() {
    const waiting = await this.prisma.paymentAttempt.findMany({ where: { status: 'PENDING', createdAt: { gt: new Date(Date.now() - 7 * DAY) } }, select: { id: true }, take: 100 });
    let recovered = 0, closed = 0;
    for (const a of waiting) {
      const r = await this.check(a.id).catch(() => null);
      if (r?.status === 'PAID') recovered++; else if (r?.changed) closed++;
    }
    return { checked: waiting.length, recovered, closed };
  }

  /** What happened to one payment, for the drawer */
  async detail(id: string) {
    const a = await this.prisma.paymentAttempt.findUnique({ where: { id }, include: { student: { select: { id: true, name: true, firstName: true, lastName: true, email: true, phone: true } } } });
    if (!a) throw new NotFoundException('Payment not found');
    const purchase = a.packagePurchaseId ? await this.prisma.packagePurchase.findUnique({ where: { id: a.packagePurchaseId } }) : a.coursePurchaseId ? await this.prisma.coursePurchase.findUnique({ where: { id: a.coursePurchaseId } }) : null;
    const [refunds, others] = await Promise.all([
      purchase ? this.prisma.refund.findMany({ where: { purchaseId: purchase.id }, orderBy: { createdAt: 'asc' } }) : [],
      // Other payments for the same thing the same day: a likely double charge
      this.prisma.paymentAttempt.findMany({ where: { id: { not: a.id }, studentId: a.studentId, status: { in: ['PAID', 'REFUNDED'] }, packageId: a.packageId, courseId: a.courseId, createdAt: { gt: new Date(+a.createdAt - DAY), lt: new Date(+a.createdAt + DAY) } }, select: { id: true, createdAt: true, amount: true, currency: true } }),
    ]);
    const refunded = (refunds as { amount: number }[]).reduce((n, r) => n + r.amount, 0);
    return {
      id: a.id, kind: a.kind, title: a.title, amount: a.amount, currency: a.currency, gateway: a.gateway, sessionId: a.sessionId, status: a.status, failureReason: a.failureReason,
      createdAt: a.createdAt, paidAt: a.paidAt, checkedAt: a.checkedAt,
      student: { id: a.student.id, name: nameOf(a.student), email: a.student.email, phone: a.student.phone },
      purchase: purchase ? { id: purchase.id, receipt: purchase.invoiceNo, expiresAt: purchase.expiresAt, refundedAt: purchase.refundedAt, active: !purchase.expiresAt || purchase.expiresAt > new Date() } : null,
      refunds: refunds.map(r => ({ amount: r.amount, currency: r.currency, reason: r.reason, endedAccess: r.endedAccess, clawedBack: r.clawedBack, at: r.createdAt })),
      refundable: purchase ? Math.max(0, a.amount - refunded) : 0,
      sameDayPayments: others,
    };
  }

  /**
   * Record a refund already sent through the gateway. Optionally ends access, and takes back the
   * matching share of commission from wallets that still hold it (never below zero).
   */
  async refund(admin: UserProfile, attemptId: string, dto: { amount: number; reason: string; endAccess?: boolean }) {
    const d = await this.detail(attemptId);
    if (!d.purchase) throw new BadRequestException('Only a paid payment can be refunded');
    const amount = Math.round(Number(dto.amount));
    if (!Number.isFinite(amount) || amount < 1 || amount > d.refundable) throw new BadRequestException(`Refund between 1 and ${minorToMajor(d.refundable, d.currency).toLocaleString('en-GB')} ${d.currency}`);
    const reason = String(dto.reason ?? '').trim().slice(0, 300);
    if (!reason) throw new BadRequestException('Say why');
    const share = amount / d.amount;
    const link = d.kind === 'package' ? { packagePurchaseId: d.purchase.id } : { coursePurchaseId: d.purchase.id };
    const credits = await this.prisma.walletTransaction.findMany({ where: { ...link, type: 'CREDIT' }, include: { wallet: true } });
    let clawedBack = 0;
    await this.prisma.$transaction(async tx => {
      for (const c of credits) {
        const take = Math.min(Math.floor(c.amount * share), Math.max(0, (await tx.wallet.findUnique({ where: { id: c.walletId } }))!.balance));
        if (take <= 0) continue;
        await tx.walletTransaction.create({ data: { walletId: c.walletId, type: 'DEBIT', source: 'ADJUSTMENT', amount: take, currency: c.currency, ...link, description: `Refund: ${d.title} (${reason})` } });
        await tx.wallet.update({ where: { id: c.walletId }, data: { balance: { decrement: take } } });
        clawedBack += take;
      }
      const data = { refundedAt: new Date(), ...(dto.endAccess ? { expiresAt: new Date() } : {}) };
      if (d.kind === 'package') await tx.packagePurchase.update({ where: { id: d.purchase!.id }, data });
      else await tx.coursePurchase.update({ where: { id: d.purchase!.id }, data });
      await tx.refund.create({ data: { kind: d.kind, purchaseId: d.purchase!.id, studentId: d.student.id, amount, currency: d.currency, reason, endedAccess: !!dto.endAccess, clawedBack, byId: admin.id } });
      if (amount + (d.amount - d.refundable) >= d.amount) await tx.paymentAttempt.update({ where: { id: d.id }, data: { status: 'REFUNDED' } });
    });
    this.audit.log(admin.id, 'payment.refunded', 'PaymentAttempt', d.id, undefined, { amount, currency: d.currency, reason, endAccess: !!dto.endAccess, clawedBack });
    return { refunded: amount, clawedBack };
  }

  // ── Public receipt check ─────────────────────────────────

  async verifyReceipt(number: string) {
    const no = String(number ?? '').trim().toUpperCase();
    if (!/^CPA-[A-Z0-9-]{4,30}$/.test(no)) return { valid: false as const };
    const select = { invoiceNo: true, purchasedAt: true, amountPaid: true, currency: true, refundedAt: true, student: { select: { name: true, firstName: true, lastName: true, email: true } } };
    const p = await this.prisma.packagePurchase.findUnique({ where: { invoiceNo: no }, select: { ...select, package: { select: { name: true } } } });
    const c = p ? null : await this.prisma.coursePurchase.findUnique({ where: { invoiceNo: no }, select: { ...select, course: { select: { title: true } } } });
    const x = p ?? c;
    if (!x) return { valid: false as const };
    return {
      valid: true as const, receipt: x.invoiceNo, paidOn: x.purchasedAt, item: p ? p.package.name : c!.course.title,
      amount: x.amountPaid ?? 0, currency: x.currency ?? 'GHS', billedTo: initials(x.student), refunded: !!x.refundedAt,
    };
  }

  /** Students only see their own payments; admins any */
  assertOwner(user: UserProfile, studentId: string) {
    if (user.role !== 'ADMIN' && user.id !== studentId) throw new ForbiddenException();
  }
}
