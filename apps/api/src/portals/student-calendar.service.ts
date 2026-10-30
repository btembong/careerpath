import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 86_400_000;

type Event = {
  id: string; kind: 'live' | 'due' | 'mentor' | 'study';
  title: string; startsAt: Date; durationMins: number; detail: string; href: string | null; done?: boolean;
};

@Injectable()
export class StudentCalendarService {
  constructor(private prisma: PrismaService) {}

  /** Classes, deadlines, mentorship sessions and planned study time between two dates */
  async calendar(studentId: string, fromIso?: string, toIso?: string) {
    const now = new Date();
    const from = fromIso ? new Date(fromIso) : new Date(now.getFullYear(), now.getMonth(), 1);
    const to = toIso ? new Date(toIso) : new Date(now.getFullYear(), now.getMonth() + 1, 1);
    if (isNaN(from.getTime()) || isNaN(to.getTime()) || to <= from || to.getTime() - from.getTime() > 100 * DAY) {
      throw new BadRequestException('Choose a range of up to 100 days');
    }
    const rosters = await this.prisma.cohortRoster.findMany({ where: { studentId }, select: { cohortId: true } });
    const cohortIds = rosters.map(r => r.cohortId);
    const [classes, assignments, bookings, blocks, cohorts] = await Promise.all([
      this.prisma.liveClass.findMany({
        where: { cohortId: { in: cohortIds }, status: { not: 'CANCELLED' }, scheduledAt: { gte: from, lt: to } },
        include: { cohort: { select: { name: true } } },
      }),
      this.prisma.assignment.findMany({
        where: { cohortId: { in: cohortIds }, dueDate: { gte: from, lt: to } },
        include: { cohort: { select: { name: true } }, submissions: { where: { studentId }, select: { id: true } } },
      }),
      this.prisma.mentorBooking.findMany({
        where: { studentId, status: { not: 'CANCELLED' }, slot: { startsAt: { gte: from, lt: to } } },
        include: { slot: { include: { teacher: { select: { name: true, firstName: true, lastName: true, email: true } } } } },
      }),
      this.prisma.studyBlock.findMany({ where: { studentId, startsAt: { gte: from, lt: to } } }),
      this.prisma.cohort.findMany({ where: { id: { in: cohortIds }, examDate: { gte: now } }, select: { examDate: true, sittingLabel: true }, orderBy: { examDate: 'asc' }, take: 1 }),
    ]);
    const nm = (p: { name: string | null; firstName: string | null; lastName: string | null; email: string }) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
    const events: Event[] = [
      ...classes.map(c => ({ id: c.id, kind: 'live' as const, title: c.title, startsAt: c.scheduledAt, durationMins: c.durationMins, detail: `Live class · ${c.cohort.name}`, href: `/student/live/${c.id}` })),
      ...assignments.map(a => ({ id: a.id, kind: 'due' as const, title: a.title, startsAt: a.dueDate, durationMins: 0, detail: `Assignment due · ${a.cohort.name}`, href: `/student/assignments?id=${a.id}`, done: a.submissions.length > 0 })),
      ...bookings.map(b => ({ id: b.id, kind: 'mentor' as const, title: `Mentorship with ${nm(b.slot.teacher)}`, startsAt: b.slot.startsAt, durationMins: b.slot.durationMins, detail: b.notes ?? 'One-to-one session', href: `/student/mentorship` })),
      ...blocks.map(s => ({ id: s.id, kind: 'study' as const, title: s.topic, startsAt: s.startsAt, durationMins: s.durationMins, detail: 'Your study time', href: s.courseId ? `/student/learn/${s.courseId}` : null, done: s.done })),
    ].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());

    // This week (Monday to Sunday): planned study vs time actually spent on lessons
    const today = new Date(now.toDateString());
    const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY);
    const sunday = new Date(monday.getTime() + 7 * DAY);
    const [weekBlocks, watched] = await Promise.all([
      this.prisma.studyBlock.findMany({ where: { studentId, startsAt: { gte: monday, lt: sunday } }, select: { durationMins: true, done: true } }),
      this.prisma.lessonProgress.aggregate({ where: { studentId, updatedAt: { gte: monday, lt: sunday } }, _sum: { watchedSecs: true } }),
    ]);
    const exam = cohorts[0];
    return {
      events,
      week: {
        plannedMins: weekBlocks.reduce((n, b) => n + b.durationMins, 0),
        doneMins: weekBlocks.filter(b => b.done).reduce((n, b) => n + b.durationMins, 0),
        lessonMins: Math.round((watched._sum.watchedSecs ?? 0) / 60),
      },
      exam: exam?.examDate ? { date: exam.examDate, label: exam.sittingLabel, daysLeft: Math.ceil((exam.examDate.getTime() - now.getTime()) / DAY) } : null,
    };
  }

  async addBlock(studentId: string, dto: { startsAt: string; durationMins?: number; topic: string; courseId?: string; repeatWeeks?: number }) {
    const start = new Date(dto.startsAt);
    const mins = dto.durationMins ?? 60;
    if (isNaN(start.getTime())) throw new BadRequestException('Choose a start time');
    if (!dto.topic?.trim()) throw new BadRequestException('Say what you’ll study');
    if (!(Number.isInteger(mins) && mins >= 15 && mins <= 240)) throw new BadRequestException('Study time must be between 15 and 240 minutes');
    const weeks = Math.min(Math.max(dto.repeatWeeks ?? 1, 1), 12);
    await this.prisma.studyBlock.createMany({
      data: Array.from({ length: weeks }, (_, i) => ({
        studentId, startsAt: new Date(start.getTime() + i * 7 * DAY), durationMins: mins,
        topic: dto.topic.trim().slice(0, 120), courseId: dto.courseId || null,
      })),
    });
    return { created: weeks };
  }

  async updateBlock(studentId: string, id: string, dto: { done?: boolean; startsAt?: string; durationMins?: number; topic?: string }) {
    const b = await this.prisma.studyBlock.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Study time not found');
    if (b.studentId !== studentId) throw new ForbiddenException('Not yours');
    return this.prisma.studyBlock.update({
      where: { id },
      data: {
        ...(dto.done !== undefined && { done: !!dto.done }),
        ...(dto.startsAt && { startsAt: new Date(dto.startsAt) }),
        ...(dto.durationMins && { durationMins: dto.durationMins }),
        ...(dto.topic?.trim() && { topic: dto.topic.trim().slice(0, 120) }),
      },
    });
  }

  async deleteBlock(studentId: string, id: string) {
    const b = await this.prisma.studyBlock.findUnique({ where: { id } });
    if (!b) throw new NotFoundException('Study time not found');
    if (b.studentId !== studentId) throw new ForbiddenException('Not yours');
    await this.prisma.studyBlock.delete({ where: { id } });
    return { deleted: true };
  }
}
