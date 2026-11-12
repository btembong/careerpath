import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserProfile } from '@prisma/client';
import { majorToMinor } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { DailyService } from '../live/daily/daily.service';
import { AuditService } from '../audit/audit.service';

const MIN = 60_000, DAY = 86_400_000;
/** A mentor must be in the room this long for a session to count as held */
const HELD_SECS = 5 * 60;
type Rates = { per30: number; currency: string; perMentor: Record<string, number> };
const DEFAULT: Rates = { per30: 2000, currency: 'XAF', perMentor: {} };
type Who = { name: string | null; firstName: string | null; lastName: string | null; email: string };
const nameOf = (p: Who) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
const shortName = (p: Who) => { const n = nameOf(p).split(/\s+/); return n.length > 1 ? `${n[0]} ${n[1][0]}.` : n[0]; };

/**
 * Pays mentors for 1-to-1 sessions that took place. After a session ends, Daily's meeting history says who
 * was in the room: if the mentor was there for 5 minutes or more, the session is completed and the mentor is
 * paid their rate (per 30 minutes, scaled by the session's length). A mentor who never joined is not paid.
 * Each session is settled once.
 */
@Injectable()
export class MentorPayService {
  private readonly logger = new Logger(MentorPayService.name);
  private settling = false;

  constructor(private prisma: PrismaService, private daily: DailyService, private audit: AuditService) {}

  async rates(): Promise<Rates> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key: 'mentorship' } });
    return { ...DEFAULT, ...((row?.value ?? {}) as Partial<Rates>) };
  }

  /** The fee for one session: the mentor's rate per 30 minutes, scaled by the session's length */
  feeFor(r: Rates, mentorId: string, durationMins: number) {
    const per30 = r.perMentor[mentorId] ?? r.per30;
    return Math.round((per30 * durationMins) / 30);
  }

  // ── Settling sessions ─────────────────────────────────────

  @Cron('*/15 * * * *')
  async settle() {
    if (this.settling) return;
    this.settling = true;
    try {
      const now = Date.now();
      const due = await this.prisma.mentorBooking.findMany({
        where: { status: 'CONFIRMED', slot: { endsAt: { lt: new Date(now - 10 * MIN) } } },
        include: {
          slot: { select: { teacherId: true, startsAt: true, endsAt: true, durationMins: true } },
          student: { select: { name: true, firstName: true, lastName: true, email: true } },
        },
        orderBy: { bookedAt: 'asc' }, take: 50,
      });
      if (!due.length) return;
      const r = await this.rates();
      for (const b of due) await this.settleOne(b, r, now).catch(e => this.logger.warn(`Settling session ${b.id} failed: ${e?.message}`));
    } finally { this.settling = false; }
  }

  private async settleOne(b: { id: string; studentId: string; meetingUrl: string | null; slot: { teacherId: string; startsAt: Date; endsAt: Date; durationMins: number }; student: Who }, r: Rates, now: number) {
    const ended = now - +b.slot.endsAt;
    const attendance = b.meetingUrl ? await this.daily.roomAttendance(this.daily.roomNameFromUrl(b.meetingUrl)) : new Map<string, number>();
    if (attendance == null) {
      // Daily can't be asked right now: try again next time, give up after a week
      if (ended > 7 * DAY) await this.prisma.mentorBooking.updateMany({ where: { id: b.id, status: 'CONFIRMED' }, data: { status: 'MISSED' } });
      return;
    }
    const mentorSecs = attendance.get(b.slot.teacherId) ?? 0;
    const studentSecs = attendance.get(b.studentId) ?? 0;
    if (mentorSecs < HELD_SECS) {
      // Daily's history can lag a little: wait a day before calling it missed
      if (ended > DAY) await this.prisma.mentorBooking.updateMany({ where: { id: b.id, status: 'CONFIRMED' }, data: { status: 'MISSED' } });
      return;
    }
    // Held: mark it once, then pay
    const marked = await this.prisma.mentorBooking.updateMany({ where: { id: b.id, status: 'CONFIRMED' }, data: { status: 'COMPLETED' } });
    if (marked.count !== 1) return;
    const amount = this.feeFor(r, b.slot.teacherId, b.slot.durationMins);
    if (amount <= 0) return;
    const wallet = await this.prisma.wallet.findUnique({ where: { userId: b.slot.teacherId }, select: { currency: true } });
    if (wallet && wallet.currency !== r.currency) {
      this.logger.warn(`Mentor ${b.slot.teacherId} has a ${wallet.currency} wallet; session ${b.id} (${r.currency}) needs paying by hand`);
      return;
    }
    await this.prisma.$transaction(async (tx) => {
      const w = await tx.wallet.upsert({ where: { userId: b.slot.teacherId }, update: { balance: { increment: amount } }, create: { userId: b.slot.teacherId, balance: amount, currency: r.currency } });
      await tx.walletTransaction.create({
        data: {
          walletId: w.id, type: 'CREDIT', source: 'MENTOR_SESSION', amount, currency: r.currency,
          description: `Mentorship session · ${shortName(b.student)} · ${b.slot.durationMins} min${studentSecs < 60 ? ' · the student didn’t join' : ''}`,
        },
      });
    });
  }

  // ── Admin: rates and how mentors are doing ────────────────

  async overview() {
    const r = await this.rates();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const mentors = await this.prisma.userProfile.findMany({
      where: { role: 'TEACHER', deletedAt: null, OR: [{ videoIntroUrl: { not: null } }, { mentorSlots: { some: {} } }] },
      select: { id: true, name: true, firstName: true, lastName: true, email: true, videoIntroUrl: true },
    });
    const ids = mentors.map(m => m.id);
    const [bookings, credits] = await Promise.all([
      this.prisma.mentorBooking.findMany({ where: { slot: { teacherId: { in: ids }, startsAt: { gte: monthStart } } }, select: { status: true, slot: { select: { teacherId: true } } } }),
      this.prisma.walletTransaction.findMany({ where: { source: 'MENTOR_SESSION', createdAt: { gte: monthStart }, wallet: { userId: { in: ids } } }, select: { amount: true, wallet: { select: { userId: true } } } }),
    ]);
    const count = (id: string, s: string) => bookings.filter(b => b.slot.teacherId === id && b.status === s).length;
    return {
      per30: r.per30, currency: r.currency,
      mentors: mentors.map(m => ({
        id: m.id, name: nameOf(m), email: m.email, listed: !!m.videoIntroUrl,
        rate: r.perMentor[m.id] ?? null,
        held: count(m.id, 'COMPLETED'), cancelled: count(m.id, 'CANCELLED'), missed: count(m.id, 'MISSED'), upcoming: count(m.id, 'CONFIRMED'),
        earned: credits.filter(c => c.wallet.userId === m.id).reduce((n, c) => n + c.amount, 0),
      })).sort((a, b) => b.held - a.held || a.name.localeCompare(b.name)),
    };
  }

  /** Change the default rate (per 30 minutes) or one mentor's rate (null goes back to the default) */
  async update(admin: UserProfile, dto: { per30?: number; mentorId?: string; rate?: number | null }) {
    const r = await this.rates();
    const before = { ...r, perMentor: { ...r.perMentor } };
    const toMinor = (v: unknown) => {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0 || n > 1_000_000) throw new BadRequestException('Enter a fee between 0 and 1,000,000');
      return majorToMinor(n, r.currency);
    };
    if (dto.per30 !== undefined) r.per30 = toMinor(dto.per30);
    if (dto.mentorId) {
      const m = await this.prisma.userProfile.findFirst({ where: { id: dto.mentorId, role: 'TEACHER' }, select: { id: true } });
      if (!m) throw new BadRequestException('That person isn’t a teacher');
      if (dto.rate == null) delete r.perMentor[dto.mentorId]; else r.perMentor[dto.mentorId] = toMinor(dto.rate);
    }
    await this.prisma.platformSetting.upsert({ where: { key: 'mentorship' }, update: { value: r }, create: { key: 'mentorship', value: r } });
    this.audit.log(admin.id, 'mentorship.rates', 'PlatformSetting', 'mentorship', before, r);
    return this.overview();
  }
}
