import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { DailyService } from './daily/daily.service';
import { WhiteboardGateway } from './whiteboard.gateway';
import { CreateCohortDto } from './dto/create-cohort.dto';
import { AddStudentDto } from './dto/add-student.dto';
import { ScheduleClassDto } from './dto/schedule-class.dto';
import { RequestTokenDto } from './dto/request-token.dto';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { randomUUID, createHmac } from 'crypto';

@Injectable()
export class LiveService {
  private readonly logger = new Logger(LiveService.name);

  private readonly webhookSecret: string | undefined;

  constructor(
    private prisma: PrismaService,
    private daily: DailyService,
    private config: ConfigService,
    private whiteboard: WhiteboardGateway,
  ) {
    this.webhookSecret = this.config.get<string>('DAILY_WEBHOOK_SECRET');
  }

  // ── Cohort management ────────────────────────────────────

  async createCohort(teacher: UserProfile, dto: CreateCohortDto) {
    return this.prisma.cohort.create({
      data: { name: dto.name, teacherId: teacher.id },
    });
  }

  async addStudent(teacher: UserProfile, cohortId: string, dto: AddStudentDto) {
    await this.assertTeacherOwnsCohort(teacher.id, cohortId);

    const student = await this.prisma.userProfile.findUnique({
      where: { id: dto.studentId, role: UserRole.STUDENT },
    });
    if (!student) throw new NotFoundException('Student not found');

    const existing = await this.prisma.cohortRoster.findUnique({
      where: { studentId_cohortId: { studentId: dto.studentId, cohortId } },
    });
    if (existing) throw new ConflictException('Student is already enrolled in this cohort');

    return this.prisma.cohortRoster.create({
      data: { studentId: dto.studentId, cohortId, source: 'TEACHER' },
    });
  }

  async removeStudent(teacher: UserProfile, cohortId: string, studentId: string) {
    await this.assertTeacherOwnsCohort(teacher.id, cohortId);
    await this.prisma.cohortRoster.delete({
      where: { studentId_cohortId: { studentId, cohortId } },
    });
    return { removed: true };
  }

  // ── Class scheduling ─────────────────────────────────────

  /**
   * Schedule a class. Daily.co room is created on start, not here.
   */
  async scheduleClass(teacher: UserProfile, cohortId: string, dto: ScheduleClassDto) {
    await this.assertTeacherOwnsCohort(teacher.id, cohortId);

    return this.prisma.liveClass.create({
      data: {
        cohortId,
        title: dto.title,
        description: dto.description ?? null,
        dailyRoomUrl: '',
        scheduledAt: new Date(dto.scheduledAt),
        durationMins: dto.durationMinutes ?? 90,
        status: 'SCHEDULED',
      },
    });
  }

  async getUpcomingClasses(cohortId: string) {
    return this.prisma.liveClass.findMany({
      where: { cohortId, status: { in: ['SCHEDULED', 'ACTIVE'] } },
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async getStudentUpcoming(studentId: string) {
    const rosters = await this.prisma.cohortRoster.findMany({
      where: { studentId },
      select: { cohortId: true },
    });
    const cohortIds = rosters.map((r) => r.cohortId);
    if (cohortIds.length === 0) return [];
    return this.prisma.liveClass.findMany({
      where: { cohortId: { in: cohortIds }, status: { in: ['SCHEDULED', 'ACTIVE'] } },
      include: {
        cohort: {
          select: {
            id: true,
            name: true,
            teacher: { select: { id: true, email: true, firstName: true, lastName: true } },
          },
        },
      },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
    });
  }

  async getTeacherUpcoming(teacherId: string) {
    const cohorts = await this.prisma.cohort.findMany({
      where: { teacherId },
      select: { id: true },
    });
    const cohortIds = cohorts.map((c) => c.id);
    if (cohortIds.length === 0) return [];
    return this.prisma.liveClass.findMany({
      where: { cohortId: { in: cohortIds }, status: { in: ['SCHEDULED', 'ACTIVE'] } },
      include: { cohort: { select: { id: true, name: true } } },
      orderBy: { scheduledAt: 'asc' },
      take: 20,
    });
  }

  // ── Class lifecycle: SCHEDULED → ACTIVE → COMPLETED ─────

  /**
   * Teacher starts the class:
   * 1. Creates the Daily.co room using the stored durationMins
   * 2. Marks LiveClass ACTIVE
   */
  async startClass(teacher: UserProfile, liveClassId: string) {
    const liveClass = await this.getLiveClassForTeacher(teacher.id, liveClassId);

    if (liveClass.status !== 'SCHEDULED') {
      throw new BadRequestException(`Class is already ${liveClass.status}`);
    }

    const cohortStudentCount = await this.prisma.cohortRoster.count({
      where: { cohortId: liveClass.cohortId },
    });

    const roomName = `cpa-${randomUUID()}`;
    const room = await this.daily.createRoom({
      name: roomName,
      startsAt: new Date(),
      durationMinutes: liveClass.durationMins,
      maxParticipants: cohortStudentCount,
    });

    return this.prisma.liveClass.update({
      where: { id: liveClassId },
      data: { status: 'ACTIVE', dailyRoomUrl: room.url },
    });
  }

  /**
   * Teacher ends the class:
   * 1. Force-closes the Daily.co room
   * 2. Marks LiveClass COMPLETED + records leftAt on any open attendance records
   */
  async endClass(teacher: UserProfile, liveClassId: string) {
    const liveClass = await this.getLiveClassForTeacher(teacher.id, liveClassId);

    if (liveClass.status !== 'ACTIVE') {
      throw new BadRequestException('Class is not currently active');
    }

    if (liveClass.dailyRoomUrl) {
      const roomName = this.daily.roomNameFromUrl(liveClass.dailyRoomUrl);
      await this.daily.closeRoom(roomName);
    }

    // Close any open attendance records
    await this.prisma.liveAttendance.updateMany({
      where: { liveClassId, leftAt: null },
      data: { leftAt: new Date() },
    });

    // Snapshot the whiteboard state before clearing the room
    const whiteboardSnapshot = this.whiteboard.getSnapshot(liveClassId);
    this.whiteboard.clearRoom(liveClassId);

    return this.prisma.liveClass.update({
      where: { id: liveClassId },
      data: {
        status: 'COMPLETED',
        whiteboardSnapshot: whiteboardSnapshot.length > 0
          ? JSON.stringify(whiteboardSnapshot)
          : undefined,
      },
    });
  }

  /**
   * Teacher cancels a SCHEDULED class.
   */
  /** Change a class's details or add its recording. Admins may edit any class. */
  async updateClass(user: UserProfile, liveClassId: string, dto: { title?: string; description?: string | null; scheduledAt?: string; durationMins?: number; recordingUrl?: string | null }) {
    const liveClass = await this.prisma.liveClass.findUnique({ where: { id: liveClassId }, include: { cohort: true } });
    if (!liveClass) throw new NotFoundException('Live class not found');
    if ((user.role as string) !== 'ADMIN' && liveClass.cohort.teacherId !== user.id) throw new ForbiddenException('Not your class');
    if (dto.scheduledAt !== undefined && liveClass.status !== 'SCHEDULED') throw new BadRequestException('Only scheduled classes can be moved');
    if (dto.durationMins !== undefined && !(Number.isInteger(dto.durationMins) && dto.durationMins >= 15 && dto.durationMins <= 360)) {
      throw new BadRequestException('Length must be between 15 and 360 minutes');
    }
    if (dto.recordingUrl && !/^https:\/\//i.test(dto.recordingUrl.trim())) throw new BadRequestException('The recording link must start with https://');
    const when = dto.scheduledAt ? new Date(dto.scheduledAt) : undefined;
    if (when && isNaN(when.getTime())) throw new BadRequestException('Invalid date');
    return this.prisma.liveClass.update({
      where: { id: liveClassId },
      data: {
        ...(dto.title !== undefined && dto.title.trim() && { title: dto.title.trim() }),
        ...(dto.description !== undefined && { description: dto.description?.trim() || null }),
        ...(when && { scheduledAt: when }),
        ...(dto.durationMins !== undefined && { durationMins: dto.durationMins }),
        ...(dto.recordingUrl !== undefined && { recordingUrl: dto.recordingUrl?.trim() || null }),
      },
    });
  }

  async cancelClass(teacher: UserProfile, liveClassId: string) {
    const liveClass = await this.getLiveClassForTeacher(teacher.id, liveClassId);

    if (liveClass.status !== 'SCHEDULED') {
      throw new BadRequestException('Only scheduled classes can be cancelled');
    }

    return this.prisma.liveClass.update({
      where: { id: liveClassId },
      data: { status: 'CANCELLED' },
    });
  }

  // ── Token issuance ───────────────────────────────────────

  async requestToken(user: UserProfile, dto: RequestTokenDto) {
    const liveClass = await this.prisma.liveClass.findUnique({
      where: { id: dto.liveClassId },
      include: { cohort: true },
    });

    if (!liveClass) throw new NotFoundException('Live class not found');
    if (liveClass.status !== 'ACTIVE') {
      throw new ForbiddenException('This class is not currently active');
    }
    if (!liveClass.dailyRoomUrl) {
      throw new ForbiddenException('Room not ready yet');
    }

    const roomName = this.daily.roomNameFromUrl(liveClass.dailyRoomUrl);
    const isTeacher = user.role === UserRole.TEACHER && liveClass.cohort.teacherId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;

    const userName = `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email;

    if (isTeacher || isAdmin) {
      const token = await this.daily.createToken({
        roomName,
        userId: user.id,
        userName,
        isOwner: true,
        exp: new Date(Date.now() + 4 * 60 * 60 * 1000),
      });
      return { token, roomUrl: liveClass.dailyRoomUrl, role: 'owner' };
    }

    if (user.role === UserRole.STUDENT) {
      await this.assertStudentCanJoin(user.id, liveClass.cohort.id);

      const token = await this.daily.createToken({
        roomName,
        userId: user.id,
        userName,
        isOwner: false,
        exp: new Date(Date.now() + 4 * 60 * 60 * 1000),
      });
      return { token, roomUrl: liveClass.dailyRoomUrl, role: 'attendee' };
    }

    throw new ForbiddenException('You do not have access to this class');
  }

  // ── Attendance ───────────────────────────────────────────

  /**
   * Called when a student enters the Daily.co room (via postMessage from iframe).
   * Creates or updates the attendance record.
   */
  async recordAttendance(student: UserProfile, liveClassId: string) {
    const liveClass = await this.prisma.liveClass.findUnique({ where: { id: liveClassId } });
    if (!liveClass) throw new NotFoundException('Live class not found');
    if (liveClass.status !== 'ACTIVE') throw new BadRequestException('Class is not active');

    await this.assertStudentCanJoin(student.id, liveClass.cohortId);

    return this.prisma.liveAttendance.upsert({
      where: { liveClassId_studentId: { liveClassId, studentId: student.id } },
      create: { liveClassId, studentId: student.id, joinedAt: new Date() },
      update: { joinedAt: new Date(), leftAt: null },
    });
  }

  /**
   * Called when a student leaves the room (tab close / postMessage).
   */
  async leaveClass(student: UserProfile, liveClassId: string) {
    await this.prisma.liveAttendance.updateMany({
      where: { liveClassId, studentId: student.id, leftAt: null },
      data: { leftAt: new Date() },
    });
    return { ok: true };
  }

  /**
   * Teacher or admin view: who attended this class.
   */
  async getClassAttendance(user: UserProfile, liveClassId: string) {
    const liveClass = await this.prisma.liveClass.findUnique({
      where: { id: liveClassId },
      include: { cohort: { select: { teacherId: true } } },
    });
    if (!liveClass) throw new NotFoundException('Live class not found');

    const isTeacher = user.role === UserRole.TEACHER && liveClass.cohort.teacherId === user.id;
    const isAdmin = user.role === UserRole.ADMIN;
    if (!isTeacher && !isAdmin) throw new ForbiddenException('Not your class');

    return this.prisma.liveAttendance.findMany({
      where: { liveClassId },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
      },
      orderBy: { joinedAt: 'asc' },
    });
  }

  // ── Recording webhook (Daily.co → API) ───────────────────

  /**
   * Receives Daily.co webhooks — recording ready, participant events, etc.
   * No JWT auth — guarded by HMAC-SHA256 signature instead.
   * Daily.co signs the raw body with the webhook secret from the dashboard.
   * Header: x-daily-signature = hmac-sha256:<hex>
   */
  async handleDailyWebhook(payload: any, signature?: string) {
    // Verify signature when DAILY_WEBHOOK_SECRET is configured
    if (this.webhookSecret) {
      if (!signature) {
        this.logger.warn('Daily webhook received without signature — rejecting');
        return { ignored: true };
      }
      const rawBody = JSON.stringify(payload);
      const expected = `hmac-sha256:${createHmac('sha256', this.webhookSecret).update(rawBody).digest('hex')}`;
      if (signature !== expected) {
        this.logger.warn('Daily webhook signature mismatch — possible spoofing attempt');
        return { ignored: true };
      }
    }

    const type: string = payload?.type ?? '';

    // ── Recording ready ────────────────────────────────────
    if (type === 'recording.ready-to-download') {
      const roomName: string = payload?.properties?.room_name;
      const recordingUrl: string = payload?.properties?.s3_url ?? payload?.properties?.recording_url;

      if (!roomName || !recordingUrl) {
        this.logger.warn('Daily webhook: missing room_name or recording_url', payload);
        return { ignored: true };
      }

      const liveClass = await this.prisma.liveClass.findFirst({
        where: { dailyRoomUrl: { contains: roomName } },
      });

      if (!liveClass) {
        this.logger.warn(`Daily webhook: no LiveClass found for room ${roomName}`);
        return { ignored: true };
      }

      await this.prisma.liveClass.update({
        where: { id: liveClass.id },
        data: { recordingUrl },
      });

      this.logger.log(`Recording stored for class ${liveClass.id}: ${recordingUrl}`);
      return { ok: true };
    }

    // All other event types (participant-joined, participant-left, etc.) acknowledged
    this.logger.log(`Daily webhook event received: ${type}`);
    return { ok: true };
  }

  // ── Admin overview ───────────────────────────────────────

  async getAdminOverview() {
    const [allClasses, activeClasses, totalAttendance] = await Promise.all([
      this.prisma.liveClass.findMany({
        include: {
          cohort: {
            select: {
              id: true,
              name: true,
              teacher: { select: { id: true, firstName: true, lastName: true, email: true } },
            },
          },
          _count: { select: { attendance: true } },
        },
        orderBy: { scheduledAt: 'desc' },
        take: 100,
      }),
      this.prisma.liveClass.count({ where: { status: 'ACTIVE' } }),
      this.prisma.liveAttendance.count(),
    ]);

    const stats = {
      total: allClasses.length,
      active: activeClasses,
      scheduled: allClasses.filter(c => c.status === 'SCHEDULED').length,
      completed: allClasses.filter(c => c.status === 'COMPLETED').length,
      cancelled: allClasses.filter(c => c.status === 'CANCELLED').length,
      totalAttendance,
    };

    return { stats, classes: allClasses };
  }

  // ── Helpers ──────────────────────────────────────────────

  private async assertTeacherOwnsCohort(teacherId: string, cohortId: string) {
    const cohort = await this.prisma.cohort.findUnique({ where: { id: cohortId } });
    if (!cohort) throw new NotFoundException('Cohort not found');
    if (cohort.teacherId !== teacherId) throw new ForbiddenException('Not your cohort');
    return cohort;
  }

  private async getLiveClassForTeacher(teacherId: string, liveClassId: string) {
    const liveClass = await this.prisma.liveClass.findUnique({
      where: { id: liveClassId },
      include: { cohort: true },
    });
    if (!liveClass) throw new NotFoundException('Live class not found');
    if (liveClass.cohort.teacherId !== teacherId) {
      throw new ForbiddenException('Not your class');
    }
    return liveClass;
  }

  private async assertStudentCanJoin(studentId: string, cohortId: string) {
    const [roster, activePurchase] = await Promise.all([
      this.prisma.cohortRoster.findUnique({
        where: { studentId_cohortId: { studentId, cohortId } },
      }),
      this.prisma.packagePurchase.findFirst({
        where: {
          studentId,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
      }),
    ]);

    if (!roster) {
      throw new ForbiddenException('You are not enrolled in this cohort');
    }
    if (!activePurchase) {
      throw new ForbiddenException(
        'You need an active package to join live classes.',
      );
    }
  }
}
