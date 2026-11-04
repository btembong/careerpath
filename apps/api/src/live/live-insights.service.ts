import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { resolvePrefs } from '../notifications/notification-prefs';
import { classIcs, googleCalendarLink } from './calendar';

const DAY = 86_400_000;
type Person = { name: string | null; firstName: string | null; lastName: string | null; email: string };
const PERSON = { name: true, firstName: true, lastName: true, email: true } as const;
const nameOf = (p: Person) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
type Cls = { scheduledAt: Date; durationMins: number; status: string };
/** Held: marked completed, or its time has passed and it wasn't cancelled or left running */
const held = (c: Cls, now: number) => c.status === 'COMPLETED' || (c.status === 'SCHEDULED' && c.scheduledAt.getTime() + c.durationMins * 60_000 < now);
const upcoming = (c: Cls, now: number) => c.status === 'ACTIVE' || (c.status === 'SCHEDULED' && c.scheduledAt.getTime() + c.durationMins * 60_000 >= now);
/** Recordings are expected within two days of a class */
const missingRecording = (c: Cls & { recordingUrl: string | null }, now: number) => held(c, now) && !c.recordingUrl && c.scheduledAt.getTime() < now - 2 * DAY;

@Injectable()
export class LiveInsightsService {
  private readonly logger = new Logger(LiveInsightsService.name);
  constructor(private prisma: PrismaService, private mail: MailService) {}

  // ── Student ────────────────────────────────────────────────────────────

  async studentOverview(studentId: string) {
    const now = Date.now();
    const rosters = await this.prisma.cohortRoster.findMany({ where: { studentId }, select: { cohortId: true, addedAt: true } });
    if (!rosters.length) return { live: [], upcoming: [], past: [], attendance: null, catchUp: [] };
    const joined = new Map(rosters.map(r => [r.cohortId, r.addedAt.getTime() - DAY]));
    const classes = await this.prisma.liveClass.findMany({
      where: { cohortId: { in: rosters.map(r => r.cohortId) }, status: { not: 'CANCELLED' } },
      include: {
        cohort: { select: { id: true, name: true, teacher: { select: PERSON }, _count: { select: { students: true } } } },
        attendance: { select: { studentId: true, leftAt: true } },
      },
      orderBy: { scheduledAt: 'asc' },
    });
    const out = (c: (typeof classes)[number]) => ({
      id: c.id, title: c.title, description: c.description, scheduledAt: c.scheduledAt, durationMins: c.durationMins, status: c.status,
      recordingUrl: c.recordingUrl, cohort: { id: c.cohort.id, name: c.cohort.name }, teacher: nameOf(c.cohort.teacher),
    });
    // Only classes held after the student joined count towards their attendance
    const mine = classes.filter(c => held(c, now) && c.scheduledAt.getTime() >= (joined.get(c.cohortId) ?? 0));
    const came = mine.filter(c => c.attendance.some(a => a.studentId === studentId));
    const allHeld = classes.filter(c => held(c, now));
    const possible = allHeld.reduce((n, c) => n + c.cohort._count.students, 0);
    const past = classes.filter(c => held(c, now)).reverse().map(c => ({
      ...out(c), attended: c.attendance.some(a => a.studentId === studentId), beforeJoined: c.scheduledAt.getTime() < (joined.get(c.cohortId) ?? 0),
    }));
    return {
      live: classes.filter(c => c.status === 'ACTIVE').map(c => ({ ...out(c), inClass: c.attendance.filter(a => !a.leftAt).length })),
      upcoming: classes.filter(c => upcoming(c, now) && c.status !== 'ACTIVE').map(out),
      past,
      attendance: {
        attended: came.length, held: mine.length,
        cohortAvgPct: possible ? Math.round((allHeld.reduce((n, c) => n + c.attendance.length, 0) / possible) * 100) : null,
      },
      catchUp: past.filter(c => !c.attended && !c.beforeJoined && c.recordingUrl).slice(0, 5),
    };
  }

  /** Lobby and classroom details; for the cohort's students, its teacher and admins */
  async classInfo(user: UserProfile, liveClassId: string) {
    const c = await this.prisma.liveClass.findUnique({
      where: { id: liveClassId },
      include: {
        cohort: { select: { id: true, name: true, teacherId: true, teacher: { select: PERSON }, _count: { select: { students: true } } } },
        attendance: { select: { leftAt: true } },
      },
    });
    if (!c) throw new NotFoundException('Live class not found');
    const role = user.role as UserRole;
    if (role === UserRole.STUDENT) {
      const r = await this.prisma.cohortRoster.findUnique({ where: { studentId_cohortId: { studentId: user.id, cohortId: c.cohortId } } });
      if (!r) throw new ForbiddenException('This class is for another cohort');
    } else if (role !== UserRole.ADMIN && c.cohort.teacherId !== user.id) {
      throw new ForbiddenException('Not your class');
    }
    return {
      id: c.id, title: c.title, description: c.description, scheduledAt: c.scheduledAt, durationMins: c.durationMins,
      status: c.status, recordingUrl: c.recordingUrl,
      cohort: { id: c.cohort.id, name: c.cohort.name, students: c.cohort._count.students },
      teacher: nameOf(c.cohort.teacher),
      inClass: c.attendance.filter(a => !a.leftAt).length,
      attended: c.attendance.length,
    };
  }

  // ── Teacher ────────────────────────────────────────────────────────────

  async teacherOverview(teacher: UserProfile) {
    const now = Date.now();
    const cohorts = await this.prisma.cohort.findMany({
      where: { teacherId: teacher.id },
      select: { id: true, name: true, examDate: true, _count: { select: { students: true } } },
      orderBy: { name: 'asc' },
    });
    const classes = cohorts.length ? await this.prisma.liveClass.findMany({
      where: { cohortId: { in: cohorts.map(c => c.id) }, status: { not: 'CANCELLED' } },
      include: { cohort: { select: { id: true, name: true, _count: { select: { students: true } } } }, _count: { select: { attendance: true } } },
      orderBy: { scheduledAt: 'asc' },
    }) : [];
    const row = (c: (typeof classes)[number]) => ({
      id: c.id, title: c.title, description: c.description, scheduledAt: c.scheduledAt, durationMins: c.durationMins, status: c.status,
      recordingUrl: c.recordingUrl, cohort: { id: c.cohort.id, name: c.cohort.name }, rosterSize: c.cohort._count.students, attendedCount: c._count.attendance,
    });
    const weekEnd = now + 7 * DAY;
    const thisWeek = classes.filter(c => upcoming(c, now) && c.scheduledAt.getTime() < weekEnd);
    const recent = classes.filter(c => held(c, now) && c.scheduledAt.getTime() > now - 28 * DAY);
    const possible = recent.reduce((n, c) => n + c.cohort._count.students, 0);
    const termStart = now - 120 * DAY;
    return {
      cohorts: cohorts.map(c => ({ id: c.id, name: c.name, examDate: c.examDate, students: c._count.students })),
      next: (() => { const n = classes.find(c => c.status === 'ACTIVE') ?? classes.find(c => upcoming(c, now)); return n ? row(n) : null; })(),
      stats: {
        thisWeek: thisWeek.length, cohortsThisWeek: new Set(thisWeek.map(c => c.cohortId)).size,
        attendancePct: possible ? Math.round((recent.reduce((n, c) => n + c._count.attendance, 0) / possible) * 100) : null,
        missingRecordings: classes.filter(c => missingRecording(c, now)).length,
        minutesThisTerm: classes.filter(c => held(c, now) && c.scheduledAt.getTime() > termStart).reduce((n, c) => n + c.durationMins, 0),
      },
      upcoming: classes.filter(c => upcoming(c, now)).map(row),
      needsRecording: classes.filter(c => missingRecording(c, now)).reverse().map(row),
      past: classes.filter(c => held(c, now)).reverse().map(row),
    };
  }

  /** Schedule one class, or the same class every week for a number of weeks */
  async scheduleSeries(user: UserProfile, cohortId: string, dto: { title: string; description?: string; scheduledAt: string; durationMinutes?: number; weeks?: number }) {
    const cohort = await this.prisma.cohort.findUnique({ where: { id: cohortId } });
    if (!cohort) throw new NotFoundException('Cohort not found');
    if ((user.role as UserRole) !== UserRole.ADMIN && cohort.teacherId !== user.id) throw new ForbiddenException('Not your cohort');
    const start = new Date(dto.scheduledAt);
    if (!dto.title?.trim() || isNaN(start.getTime())) throw new BadRequestException('A topic and a start time are needed');
    if (start.getTime() < Date.now() - 5 * 60_000) throw new BadRequestException('Choose a time in the future');
    const weeks = Math.min(Math.max(Math.floor(dto.weeks ?? 1), 1), 26);
    const mins = dto.durationMinutes ?? 90;
    if (!(Number.isInteger(mins) && mins >= 15 && mins <= 360)) throw new BadRequestException('Length must be between 15 and 360 minutes');
    const rows = Array.from({ length: weeks }, (_, i) => ({
      cohortId, title: dto.title.trim(), description: dto.description?.trim() || null, dailyRoomUrl: '',
      scheduledAt: new Date(start.getTime() + i * 7 * DAY), durationMins: mins, status: 'SCHEDULED' as const,
    }));
    await this.prisma.liveClass.createMany({ data: rows });
    this.tellCohort(cohortId, rows[0].title, rows[0].description, start, mins, weeks).catch(err => this.logger.warn(`Class emails failed: ${err.message}`));
    return { created: rows.length, last: rows[rows.length - 1].scheduledAt };
  }

  /** Email each student in the cohort (if they want live-class emails), with a calendar file and a Google Calendar link */
  private async tellCohort(cohortId: string, title: string, description: string | null, start: Date, minutes: number, weeks: number) {
    const cohort = await this.prisma.cohort.findUnique({ where: { id: cohortId }, include: { teacher: { select: PERSON } } });
    const first = await this.prisma.liveClass.findFirst({ where: { cohortId, title, scheduledAt: start }, select: { id: true } });
    if (!cohort || !first) return;
    const roster = await this.prisma.cohortRoster.findMany({
      where: { cohortId }, select: { student: { select: { email: true, firstName: true, timezone: true, notificationPrefs: true, deletedAt: true } } },
    });
    const portal = (process.env.PORTAL_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const event = { uid: first.id, title, description, start, minutes, weeks, link: `${portal}/student/live/${first.id}` };
    const ics = classIcs(event), googleLink = googleCalendarLink(event);
    for (const { student: s } of roster) {
      if (s.deletedAt || resolvePrefs(s.notificationPrefs).live?.email === false) continue;
      const when = start.toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: s.timezone || 'Africa/Lagos', timeZoneName: 'short' });
      this.mail.sendClassScheduled(s.email, { firstName: s.firstName ?? '', teacherName: nameOf(cohort.teacher), cohortName: cohort.name, title, when, weeks, classLink: event.link, googleLink, ics }).catch(() => {});
    }
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  async adminOverview() {
    const now = Date.now();
    const classes = await this.prisma.liveClass.findMany({
      where: { scheduledAt: { gte: new Date(now - 180 * DAY) } },
      include: {
        cohort: { select: { id: true, name: true, teacherId: true, teacher: { select: PERSON }, _count: { select: { students: true } } } },
        attendance: { select: { leftAt: true } },
      },
      orderBy: { scheduledAt: 'desc' },
    });
    const row = (c: (typeof classes)[number]) => ({
      id: c.id, title: c.title, scheduledAt: c.scheduledAt, durationMins: c.durationMins, status: c.status, recordingUrl: c.recordingUrl,
      cohort: { id: c.cohort.id, name: c.cohort.name }, teacher: { id: c.cohort.teacherId, name: nameOf(c.cohort.teacher) },
      rosterSize: c.cohort._count.students, attendedCount: c.attendance.length, inClass: c.attendance.filter(a => !a.leftAt).length,
      kind: c.status === 'CANCELLED' ? 'cancelled' : c.status === 'ACTIVE' ? 'live' : held(c, now) ? 'held' : 'upcoming',
      missingRecording: missingRecording(c, now),
    });
    const rows = classes.map(row);
    const weekEnd = now + 7 * DAY;
    const week = rows.filter(r => (r.kind === 'upcoming' || r.kind === 'live') && new Date(r.scheduledAt).getTime() < weekEnd);
    const recent = rows.filter(r => r.kind === 'held' && new Date(r.scheduledAt).getTime() > now - 28 * DAY);
    const possible = recent.reduce((n, r) => n + r.rosterSize, 0);
    const live = rows.filter(r => r.kind === 'live');
    return {
      stats: {
        liveNow: live.length, inClassNow: live.reduce((n, r) => n + r.inClass, 0),
        thisWeek: week.length, cohortsThisWeek: new Set(week.map(r => r.cohort.id)).size, teachersThisWeek: new Set(week.map(r => r.teacher.id)).size,
        attendancePct: possible ? Math.round((recent.reduce((n, r) => n + r.attendedCount, 0) / possible) * 100) : null,
        missingRecordings: rows.filter(r => r.missingRecording).length,
      },
      live,
      classes: rows,
    };
  }
}
