import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserProfile } from '@prisma/client';
import { majorToMinor } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DailyService } from './daily/daily.service';
import { AuditService } from '../audit/audit.service';
import { CLASS_PAY_FROM, cohortRates, perHourFor, shareFor } from './cohort-rates';

const MIN = 60_000, DAY = 86_400_000;
/** A teacher must be in the class this long for it to count as taught */
const TAUGHT_SECS = 5 * 60;
const hm = (mins: number) => (mins >= 60 ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60}` : ''}` : `${mins} min`);
type Who = { name: string | null; firstName: string | null; lastName: string | null; email: string };
const nameOf = (p: Who) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];

/**
 * Pays cohort teachers for the live classes they teach. When a class has ended, Daily's meeting history
 * says how long the teacher was in it: 5 minutes or more and they're paid the cohort's hourly fee for that
 * time (up to the scheduled length plus 30 minutes). A teacher who never joined isn't paid. Each class is
 * settled once. The cohort share of sales is paid at purchase (PaymentsService).
 */
@Injectable()
export class CohortPayService {
  private readonly logger = new Logger(CohortPayService.name);
  private settling = false;

  constructor(private prisma: PrismaService, private daily: DailyService, private audit: AuditService) {}

  @Cron('*/15 * * * *')
  async settle() {
    if (this.settling) return;
    this.settling = true;
    try {
      const classes = await this.prisma.liveClass.findMany({
        where: { status: 'COMPLETED', teacherPay: null, scheduledAt: { gte: CLASS_PAY_FROM, lt: new Date(Date.now() - 10 * MIN) } },
        select: { id: true, title: true, dailyRoomUrl: true, scheduledAt: true, durationMins: true, cohortId: true, cohort: { select: { teacherId: true, name: true } } },
        orderBy: { scheduledAt: 'asc' }, take: 50,
      });
      if (!classes.length) return;
      const r = await cohortRates(this.prisma);
      for (const c of classes) await this.settleOne(c, r, Date.now()).catch(e => this.logger.warn(`Settling class ${c.id} failed: ${e?.message}`));
    } finally { this.settling = false; }
  }

  async settleOne(c: { id: string; title: string; dailyRoomUrl: string; scheduledAt: Date; durationMins: number; cohortId: string; cohort: { teacherId: string; name: string } }, r: Awaited<ReturnType<typeof cohortRates>>, now: number) {
    const ended = now - (+c.scheduledAt + c.durationMins * MIN);
    const attendance = await this.daily.roomAttendance(this.daily.roomNameFromUrl(c.dailyRoomUrl));
    if (attendance == null) {
      if (ended > 7 * DAY) await this.prisma.liveClass.updateMany({ where: { id: c.id, teacherPay: null }, data: { teacherPay: 'MISSED' } });
      return;
    }
    const secs = attendance.get(c.cohort.teacherId) ?? 0;
    if (secs < TAUGHT_SECS) {
      // Daily's history can lag a little: wait a day before calling it missed
      if (ended > DAY) await this.prisma.liveClass.updateMany({ where: { id: c.id, teacherPay: null }, data: { teacherPay: 'MISSED' } });
      return;
    }
    const mins = Math.min(Math.round(secs / 60), c.durationMins + 30);
    const amount = Math.round((perHourFor(r, c.cohortId) * mins) / 60);
    // Settle once, then pay
    const marked = await this.prisma.liveClass.updateMany({ where: { id: c.id, teacherPay: null }, data: { teacherPay: 'PAID', teacherPaidMins: mins, teacherPaidAmount: amount } });
    if (marked.count !== 1 || amount <= 0) return;
    const wallet = await this.prisma.wallet.findUnique({ where: { userId: c.cohort.teacherId }, select: { currency: true } });
    if (wallet && wallet.currency !== r.currency) {
      this.logger.warn(`Teacher ${c.cohort.teacherId} has a ${wallet.currency} wallet; class ${c.id} (${r.currency}) needs paying by hand`);
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      const w = await tx.wallet.upsert({ where: { userId: c.cohort.teacherId }, update: { balance: { increment: amount } }, create: { userId: c.cohort.teacherId, balance: amount, currency: r.currency } });
      await tx.walletTransaction.create({ data: { walletId: w.id, type: 'CREDIT', source: 'LIVE_CLASS', amount, currency: r.currency, description: `${c.title} · ${c.cohort.name} · ${hm(mins)}` } });
    });
  }

  // ── Admin: rates and how each cohort's teacher is doing ───

  async overview() {
    const r = await cohortRates(this.prisma);
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const cohorts = await this.prisma.cohort.findMany({
      select: {
        id: true, name: true, sittingLabel: true,
        teacher: { select: { id: true, name: true, firstName: true, lastName: true, email: true } },
        _count: { select: { students: true, packages: true } },
        liveClasses: { where: { scheduledAt: { gte: monthStart } }, select: { status: true, teacherPay: true, teacherPaidMins: true, teacherPaidAmount: true } },
      },
      orderBy: { name: 'asc' },
    });
    const shares = await this.prisma.walletTransaction.findMany({
      where: { source: 'COHORT_SHARE', createdAt: { gte: monthStart } },
      select: { amount: true, packagePurchase: { select: { package: { select: { cohortId: true } } } } },
    });
    return {
      perHour: r.perHour, share: r.share, currency: r.currency,
      cohorts: cohorts.map(c => {
        const paid = c.liveClasses.filter(l => l.teacherPay === 'PAID');
        const classPay = paid.reduce((n, l) => n + (l.teacherPaidAmount ?? 0), 0);
        const sharePay = shares.filter(s => s.packagePurchase?.package.cohortId === c.id).reduce((n, s) => n + s.amount, 0);
        return {
          id: c.id, name: c.name, sitting: c.sittingLabel, teacher: nameOf(c.teacher), students: c._count.students, packages: c._count.packages,
          perHour: r.perCohort[c.id]?.perHour ?? null, share: r.perCohort[c.id]?.share ?? null,
          taught: paid.length, mins: paid.reduce((n, l) => n + (l.teacherPaidMins ?? 0), 0),
          missed: c.liveClasses.filter(l => l.teacherPay === 'MISSED').length,
          upcoming: c.liveClasses.filter(l => l.status === 'SCHEDULED').length,
          earned: classPay + sharePay, classPay, sharePay,
        };
      }),
    };
  }

  /** Change the defaults, or one cohort's rates (null goes back to the default) */
  async update(admin: UserProfile, dto: { perHour?: number; share?: number; cohortId?: string; cohortPerHour?: number | null; cohortShare?: number | null }) {
    const r = await cohortRates(this.prisma);
    const before = JSON.parse(JSON.stringify(r));
    const fee = (v: unknown) => { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new BadRequestException('Enter a fee between 0 and 10,000,000'); return majorToMinor(n, r.currency); };
    const pct = (v: unknown) => { const n = Number(v); if (!Number.isFinite(n) || n < 0 || n > 100) throw new BadRequestException('The share must be 0 to 100%'); return Math.round(n * 10) / 10; };
    if (dto.perHour !== undefined) r.perHour = fee(dto.perHour);
    if (dto.share !== undefined) r.share = pct(dto.share);
    if (dto.cohortId) {
      if (!(await this.prisma.cohort.findUnique({ where: { id: dto.cohortId }, select: { id: true } }))) throw new BadRequestException('Cohort not found');
      const own = { ...(r.perCohort[dto.cohortId] ?? {}) };
      if (dto.cohortPerHour !== undefined) own.perHour = dto.cohortPerHour == null ? null : fee(dto.cohortPerHour);
      if (dto.cohortShare !== undefined) own.share = dto.cohortShare == null ? null : pct(dto.cohortShare);
      if (own.perHour == null && own.share == null) delete r.perCohort[dto.cohortId]; else r.perCohort[dto.cohortId] = own;
    }
    await this.prisma.platformSetting.upsert({ where: { key: 'cohortPay' }, update: { value: r }, create: { key: 'cohortPay', value: r } });
    this.audit.log(admin.id, 'cohort.rates', 'PlatformSetting', 'cohortPay', before, r);
    return this.overview();
  }
}
