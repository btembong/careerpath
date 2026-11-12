import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DailyService } from '../live/daily/daily.service';
import { MailService } from '../mail/mail.service';
import { CreateSlotDto } from './dto/create-slot.dto';
import { BookSlotDto } from './dto/book-slot.dto';
import { CancelBookingDto } from './dto/cancel-booking.dto';
import { ReviewBookingDto } from './dto/review-booking.dto';
import { UserProfile } from '@prisma/client';
import { randomUUID } from 'crypto';

function fmtDate(d: Date) {
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });
}
function displayName(u: { firstName?: string | null; lastName?: string | null; email: string }) {
  return [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
}

/** Mentors are only discoverable/bookable once approved and with an intro video. */
const MENTOR_VISIBLE = { approvalStatus: 'APPROVED' as const, videoIntroUrl: { not: null } };

@Injectable()
export class MentorshipService {
  constructor(
    private prisma: PrismaService,
    private daily: DailyService,
    private mail: MailService,
  ) {}

  // ── Teacher: manage availability ─────────────────────────

  async createSlot(teacher: UserProfile, dto: CreateSlotDto) {
    const startsAt = new Date(dto.startsAt);
    const durationMins = dto.durationMins ?? 30;
    const endsAt = new Date(startsAt.getTime() + durationMins * 60_000);

    if (startsAt < new Date()) {
      throw new BadRequestException('Cannot create a slot in the past');
    }

    // The same time each week; skip any week where it would overlap a slot the teacher already has
    const weeks = Math.min(Math.max(dto.repeatWeeks ?? 1, 1), 12);
    const WEEK = 7 * 86_400_000;
    const wanted = Array.from({ length: weeks }, (_, i) => ({ s: new Date(startsAt.getTime() + i * WEEK), e: new Date(endsAt.getTime() + i * WEEK) }));
    const existing = await this.prisma.mentorSlot.findMany({
      where: { teacherId: teacher.id, startsAt: { lt: wanted[wanted.length - 1].e }, endsAt: { gt: wanted[0].s } },
      select: { startsAt: true, endsAt: true },
    });
    const free = wanted.filter(w => !existing.some(x => x.startsAt < w.e && x.endsAt > w.s));
    if (!free.length) throw new ConflictException('You already have a time slot then');
    await this.prisma.mentorSlot.createMany({ data: free.map(w => ({ teacherId: teacher.id, startsAt: w.s, endsAt: w.e, durationMins })) });
    return { created: free.length, skipped: weeks - free.length };
  }

  /**
   * How many sessions the student may still book this month. Packages can set a monthly number;
   * if none of the student's active packages does, there is no limit.
   */
  async getAllowance(studentId: string) {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const [purchases, coursePurchases, used] = await Promise.all([
      this.prisma.packagePurchase.findMany({
        where: { studentId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { addOns: true, package: { select: { mentorshipSessionsPerMonth: true } } },
      }),
      this.prisma.coursePurchase.findMany({
        where: { studentId, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        select: { addOns: true },
      }),
      this.prisma.mentorBooking.count({
        where: { studentId, status: { not: 'CANCELLED' }, slot: { startsAt: { gte: monthStart, lt: nextMonth } } },
      }),
    ]);
    // Mentorship bought as an add-on (with a course or a package) adds its sessions a month
    const addOnMonthly = (v: unknown) => (Array.isArray(v) ? (v as { kind?: string; perMonth?: number }[]) : []).filter(x => x.kind === 'mentorship').map(x => x.perMonth ?? 0);
    const limits = [...purchases.map(p => p.package.mentorshipSessionsPerMonth), ...purchases.flatMap(p => addOnMonthly(p.addOns)), ...coursePurchases.flatMap(p => addOnMonthly(p.addOns))].filter((n): n is number => n != null);
    const perMonth = limits.length ? limits.reduce((a, b) => a + b, 0) : null;
    const viaAddOn = coursePurchases.some(p => addOnMonthly(p.addOns).length > 0);
    return { hasPackage: purchases.length > 0 || viaAddOn, perMonth, used, left: perMonth == null ? null : Math.max(0, perMonth - used) };
  }

  async getMySlots(teacherId: string) {
    return this.prisma.mentorSlot.findMany({
      where: { teacherId, startsAt: { gte: new Date() } },
      include: {
        booking: {
          include: {
            student: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  async deleteSlot(teacher: UserProfile, slotId: string) {
    const slot = await this.prisma.mentorSlot.findUnique({ where: { id: slotId } });
    if (!slot) throw new NotFoundException('Slot not found');
    if (slot.teacherId !== teacher.id) throw new ForbiddenException('Not your slot');
    if (slot.isBooked) throw new BadRequestException('Cannot delete a booked slot');

    await this.prisma.mentorSlot.delete({ where: { id: slotId } });
    return { deleted: true };
  }

  // Teacher: see all their upcoming bookings
  async getTeacherBookings(teacherId: string) {
    return this.prisma.mentorBooking.findMany({
      where: {
        slot: { teacherId },
        status: { not: 'CANCELLED' },
      },
      include: {
        slot: true,
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
        review: { select: { rating: true, comment: true } },
      },
      orderBy: { slot: { startsAt: 'asc' } },
    });
  }

  // ── Student: browse and book ──────────────────────────────

  /**
   * Return all teachers who have at least one open slot in the future.
   * Includes their average review rating and number of completed sessions.
   */
  async getAvailableMentors() {
    const slots = await this.prisma.mentorSlot.findMany({
      where: { isBooked: false, startsAt: { gte: new Date() }, teacher: MENTOR_VISIBLE },
      include: {
        teacher: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            name: true,
            email: true,
            bio: true,
            avatarUrl: true,
            videoIntroUrl: true,
            teachingSubjects: { select: { id: true, name: true } },
          },
        },
      },
    });

    // Deduplicate teachers, collect slot counts
    const map = new Map<string, { teacher: any; openSlots: number }>();
    for (const s of slots) {
      if (!map.has(s.teacherId)) {
        map.set(s.teacherId, { teacher: s.teacher, openSlots: 0 });
      }
      map.get(s.teacherId)!.openSlots += 1;
    }

    // Fetch avg ratings for these teachers
    const teacherIds = [...map.keys()];
    const reviews = await this.prisma.mentorReview.groupBy({
      by: ['teacherId'],
      where: { teacherId: { in: teacherIds } },
      _avg: { rating: true },
      _count: { rating: true },
    });
    const reviewMap = new Map(reviews.map(r => [r.teacherId, r]));

    return [...map.values()].map(({ teacher, openSlots }) => {
      const rev = reviewMap.get(teacher.id);
      return {
        ...teacher,
        openSlots,
        avgRating: rev?._avg?.rating ? Math.round(rev._avg.rating * 10) / 10 : null,
        reviewCount: rev?._count?.rating ?? 0,
      };
    });
  }

  async getTeacherSlots(teacherId: string) {
    return this.prisma.mentorSlot.findMany({
      where: {
        teacherId,
        isBooked: false,
        startsAt: { gte: new Date() },
        teacher: MENTOR_VISIBLE,
      },
      orderBy: { startsAt: 'asc' },
    });
  }

  /**
   * Book a mentorship slot.
   * Creates a Daily.co room and stores the meeting URL on the booking.
   */
  async bookSlot(student: UserProfile, dto: BookSlotDto) {
    const slot = await this.prisma.mentorSlot.findUnique({
      where: { id: dto.slotId },
      include: {
        teacher: {
          select: { id: true, email: true, firstName: true, lastName: true, videoIntroUrl: true, approvalStatus: true },
        },
      },
    });

    if (!slot) throw new NotFoundException('Slot not found');
    if (!slot.teacher.videoIntroUrl || slot.teacher.approvalStatus !== 'APPROVED') {
      throw new ForbiddenException('This mentor is not taking bookings yet.');
    }
    if (slot.isBooked) throw new ConflictException('This slot has already been booked');
    if (slot.startsAt < new Date()) throw new BadRequestException('Slot has already passed');

    // Student must have an active package to book mentorship
    const activePurchase = await this.prisma.packagePurchase.findFirst({
      where: {
        studentId: student.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
    });
    const allowance = await this.getAllowance(student.id);
    // A package, or a course bought with the mentorship add-on
    if (!activePurchase && !allowance.hasPackage) {
      throw new ForbiddenException('You need an active package, or mentorship added to a course, to book sessions.');
    }
    if (allowance.left === 0) {
      throw new ForbiddenException(`You’ve used all ${allowance.perMonth} mentorship sessions in your package this month.`);
    }

    // Create Daily.co room for the session
    const roomName = `mentor-${randomUUID()}`;
    const room = await this.daily.createRoom({
      name: roomName,
      startsAt: slot.startsAt,
      durationMinutes: slot.durationMins,
    });

    const [booking] = await this.prisma.$transaction([
      this.prisma.mentorBooking.create({
        data: {
          slotId: slot.id,
          studentId: student.id,
          notes: dto.notes ?? null,
          status: 'CONFIRMED',
          meetingUrl: room.url,
        },
      }),
      this.prisma.mentorSlot.update({
        where: { id: slot.id },
        data: { isBooked: true },
      }),
    ]);

    const teacherName = displayName(slot.teacher);
    const studentName = displayName({ firstName: student.firstName, lastName: student.lastName, email: student.email });
    const dateStr = fmtDate(slot.startsAt);
    const timeStr = fmtTime(slot.startsAt);

    // Booking confirmation emails — non-critical
    this.mail.sendMentorshipBookingStudent(student.email, {
      studentName,
      teacherName,
      dateStr,
      timeStr,
      durationMins: slot.durationMins,
      meetingUrl: room.url,
      bookingId: booking.id,
    }).catch(() => {});

    this.mail.sendMentorshipBookingTeacher(slot.teacher.email, {
      teacherName,
      studentName,
      dateStr,
      timeStr,
      durationMins: slot.durationMins,
      meetingUrl: room.url,
      notes: dto.notes ?? undefined,
    }).catch(() => {});

    return {
      bookingId: booking.id,
      teacher: slot.teacher,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      durationMins: slot.durationMins,
      meetingUrl: room.url,
      status: 'CONFIRMED',
    };
  }

  // ── Session token ─────────────────────────────────────────

  async getSessionToken(user: UserProfile, bookingId: string) {
    const booking = await this.prisma.mentorBooking.findUnique({
      where: { id: bookingId },
      include: {
        slot: { include: { teacher: { select: { id: true, email: true, firstName: true, lastName: true } } } },
        student: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === 'CANCELLED') throw new BadRequestException('This booking was cancelled');

    const isTeacher = booking.slot.teacher.id === user.id;
    const isStudent = booking.studentId === user.id;

    if (!isTeacher && !isStudent) {
      throw new ForbiddenException('You are not part of this session');
    }

    if (!booking.meetingUrl) {
      throw new BadRequestException('No video room associated with this booking');
    }

    const roomName = this.daily.roomNameFromUrl(booking.meetingUrl);
    const userName = isTeacher
      ? `${booking.slot.teacher.firstName ?? ''} ${booking.slot.teacher.lastName ?? ''}`.trim() || booking.slot.teacher.email
      : `${booking.student.firstName ?? ''} ${booking.student.lastName ?? ''}`.trim() || booking.student.email;

    const token = await this.daily.createToken({
      roomName,
      userId: user.id,
      userName,
      isOwner: isTeacher,
      exp: booking.slot.endsAt,
    });

    return {
      token,
      roomUrl: booking.meetingUrl,
      isOwner: isTeacher,
      startsAt: booking.slot.startsAt,
      endsAt: booking.slot.endsAt,
      durationMins: booking.slot.durationMins,
    };
  }

  // ── Cancel booking ────────────────────────────────────────

  async cancelBooking(user: UserProfile, bookingId: string, dto: CancelBookingDto) {
    const booking = await this.prisma.mentorBooking.findUnique({
      where: { id: bookingId },
      include: {
        slot: { include: { teacher: { select: { id: true, email: true, firstName: true, lastName: true } } } },
        student: { select: { id: true, email: true, firstName: true, lastName: true } },
      },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === 'CANCELLED') throw new BadRequestException('Booking is already cancelled');
    if (booking.status === 'COMPLETED') throw new BadRequestException('Cannot cancel a completed session');

    const isTeacher = booking.slot.teacher.id === user.id;
    const isStudent = booking.studentId === user.id;

    // Admins can cancel any booking (both people are told, as when either of them cancels)
    if (!isTeacher && !isStudent && user.role !== 'ADMIN') {
      throw new ForbiddenException('You are not part of this booking');
    }

    if (booking.slot.startsAt < new Date()) {
      throw new BadRequestException('Cannot cancel a session that has already started');
    }

    await this.prisma.$transaction([
      this.prisma.mentorBooking.update({
        where: { id: bookingId },
        data: {
          status: 'CANCELLED',
          cancelledAt: new Date(),
          cancelReason: dto.reason ?? null,
        },
      }),
      this.prisma.mentorSlot.update({
        where: { id: booking.slotId },
        data: { isBooked: false },
      }),
    ]);

    // Notify the other party — non-critical
    const cancelledByRole = isTeacher ? 'teacher' : 'student';
    const dateStr = fmtDate(booking.slot.startsAt);
    const timeStr = fmtTime(booking.slot.startsAt);
    const teacherName = displayName(booking.slot.teacher);
    const studentName = displayName(booking.student);

    if (isTeacher) {
      // Teacher cancelled — notify student
      this.mail.sendMentorshipCancellation(
        booking.student.email, studentName, teacherName, dateStr, timeStr, cancelledByRole,
      ).catch(() => {});
    } else {
      // Student cancelled — notify teacher
      this.mail.sendMentorshipCancellation(
        booking.slot.teacher.email, teacherName, studentName, dateStr, timeStr, cancelledByRole,
      ).catch(() => {});
    }

    return { cancelled: true };
  }

  // ── My Bookings (student) ─────────────────────────────────

  /** The board from a mentoring session, for its student, its mentor or an admin */
  async board(user: UserProfile, bookingId: string) {
    const b = await this.prisma.mentorBooking.findUnique({ where: { id: bookingId }, include: { slot: { select: { teacherId: true, startsAt: true } } } });
    if (!b) throw new NotFoundException('Booking not found');
    if (user.role !== 'ADMIN' && b.studentId !== user.id && b.slot.teacherId !== user.id) throw new ForbiddenException('Not your session');
    let elements: unknown[] = [];
    try { elements = b.whiteboardSnapshot ? JSON.parse(b.whiteboardSnapshot) : []; } catch { elements = []; }
    return { elements, startsAt: b.slot.startsAt };
  }

  async getMyBookings(studentId: string) {
    return this.prisma.mentorBooking.findMany({
      where: { studentId },
      include: {
        slot: {
          include: {
            teacher: { select: { id: true, firstName: true, lastName: true, email: true, bio: true } },
          },
        },
        review: { select: { rating: true, comment: true } },
      },
      orderBy: { slot: { startsAt: 'desc' } },
    });
  }

  // ── Review ────────────────────────────────────────────────

  async submitReview(student: UserProfile, bookingId: string, dto: ReviewBookingDto) {
    const booking = await this.prisma.mentorBooking.findUnique({
      where: { id: bookingId },
      include: { slot: { select: { teacherId: true, endsAt: true } }, review: true },
    });

    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.studentId !== student.id) throw new ForbiddenException('Not your booking');
    if (booking.status === 'CANCELLED') throw new BadRequestException('Cannot review a cancelled booking');
    if (booking.review) throw new ConflictException('You have already reviewed this session');

    if (booking.slot.endsAt > new Date()) {
      throw new BadRequestException('Session has not ended yet');
    }

    return this.prisma.mentorReview.create({
      data: {
        bookingId,
        studentId: student.id,
        teacherId: booking.slot.teacherId,
        rating: dto.rating,
        comment: dto.comment ?? null,
      },
    });
  }

  // ── Admin ─────────────────────────────────────────────────

  async getAdminBookings() {
    return this.prisma.mentorBooking.findMany({
      include: {
        slot: {
          include: {
            teacher: { select: { id: true, firstName: true, lastName: true, email: true } },
          },
        },
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
        review: { select: { rating: true } },
      },
      orderBy: { slot: { startsAt: 'desc' } },
    });
  }
}
