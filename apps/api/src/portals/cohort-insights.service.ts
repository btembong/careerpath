import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';

type Person = { id: string; name: string | null; firstName: string | null; lastName: string | null; email: string };
const PERSON = { id: true, name: true, firstName: true, lastName: true, email: true } as const;
/** A person's name — the email only as a last resort (admins see emails separately) */
const nameOf = (p: Person) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];

const DAY = 86_400_000;
/** Default "needs attention" rule: inactive this many days, or missed this many of the last 4 classes */
const INACTIVE_DAYS = 7;
const MISSED_CLASSES = 2;

type ClassRow = { id: string; title: string; scheduledAt: Date; durationMins: number; status: string; recordingUrl: string | null; dailyRoomUrl: string; description: string | null };
const ended = (c: ClassRow, now: number) => c.status === 'COMPLETED' || (c.status !== 'CANCELLED' && c.status !== 'ACTIVE' && c.scheduledAt.getTime() + c.durationMins * 60_000 < now);
const isLive = (c: ClassRow) => c.status === 'ACTIVE';

@Injectable()
export class CohortInsightsService {
  constructor(private prisma: PrismaService) {}

  // ── Shared loading ─────────────────────────────────────────────────────

  private async load(cohortId: string) {
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      include: {
        teacher: { select: { ...PERSON, bio: true, avatarUrl: true } },
        students: { include: { student: { select: { ...PERSON, lastActiveDate: true } } } },
        liveClasses: { orderBy: { scheduledAt: 'asc' } },
        assignments: { orderBy: { dueDate: 'asc' }, include: { submissions: { select: { studentId: true, grade: true, status: true, submittedAt: true } } } },
        packages: { select: { id: true, name: true, courseIds: true, priceAmount: true, currency: true, validityDays: true, isPublished: true, _count: { select: { purchases: true } } } },
        progressAlerts: { select: { type: true, enabled: true, thresholdDays: true } },
      },
    });
    if (!cohort) throw new NotFoundException('Cohort not found');
    const classIds = cohort.liveClasses.map(c => c.id);
    const attendance = classIds.length
      ? await this.prisma.liveAttendance.findMany({ where: { liveClassId: { in: classIds } }, select: { liveClassId: true, studentId: true } })
      : [];
    const attended = new Set(attendance.map(a => `${a.liveClassId}:${a.studentId}`));
    const courseIds = [...new Set(cohort.packages.flatMap(p => p.courseIds))];
    return { cohort, attended, courseIds };
  }

  /** Percentage of lessons completed per student and course */
  private async progress(studentIds: string[], courseIds: string[]) {
    const out = new Map<string, Map<string, number>>();
    if (!studentIds.length || !courseIds.length) return { out, courses: [] as { id: string; title: string }[] };
    const [courses, lessons] = await Promise.all([
      this.prisma.platformCourse.findMany({ where: { id: { in: courseIds } }, select: { id: true, title: true } }),
      this.prisma.lesson.findMany({ where: { module: { courseId: { in: courseIds } } }, select: { id: true, module: { select: { courseId: true } } } }),
    ]);
    const courseOf = new Map(lessons.map(l => [l.id, l.module.courseId]));
    const totals = new Map<string, number>();
    lessons.forEach(l => totals.set(l.module.courseId, (totals.get(l.module.courseId) ?? 0) + 1));
    const done = await this.prisma.lessonProgress.findMany({
      where: { studentId: { in: studentIds }, completed: true, lessonId: { in: lessons.map(l => l.id) } },
      select: { studentId: true, lessonId: true },
    });
    const counts = new Map<string, number>();
    done.forEach(d => { const k = `${d.studentId}:${courseOf.get(d.lessonId)}`; counts.set(k, (counts.get(k) ?? 0) + 1); });
    for (const s of studentIds) {
      const m = new Map<string, number>();
      for (const c of courses) {
        const total = totals.get(c.id) ?? 0;
        m.set(c.id, total ? Math.round(((counts.get(`${s}:${c.id}`) ?? 0) / total) * 100) : 0);
      }
      out.set(s, m);
    }
    return { out, courses };
  }

  /** Attendance, assignments and the "needs attention" flag for one student in a loaded cohort */
  private studentFacts(ctx: Awaited<ReturnType<CohortInsightsService['load']>>, studentId: string, joinedAt: Date, lastActive: Date | null, now: number) {
    const { cohort, attended } = ctx;
    // Only classes held since the student joined count against them
    const held = cohort.liveClasses.filter(c => ended(c, now) && c.scheduledAt >= new Date(joinedAt.getTime() - DAY));
    const came = held.filter(c => attended.has(`${c.id}:${studentId}`)).length;
    const lastFour = held.slice(-4);
    const missedRecent = lastFour.filter(c => !attended.has(`${c.id}:${studentId}`)).length;
    const subs = cohort.assignments.map(a => ({ a, s: a.submissions.find(x => x.studentId === studentId) }));
    const submitted = subs.filter(x => x.s).length;
    const overdue = subs.filter(x => !x.s && x.a.dueDate.getTime() < now).length;
    const graded = subs.filter(x => x.s?.grade != null && x.a.maxPoints > 0);
    const avgGrade = graded.length ? Math.round(graded.reduce((n, x) => n + (x.s!.grade! / x.a.maxPoints) * 100, 0) / graded.length) : null;
    const rule = (t: string) => cohort.progressAlerts.find(a => a.type === t);
    const inactiveRule = rule('INACTIVE');
    const inactiveLimit = inactiveRule?.enabled === false ? Infinity : inactiveRule?.thresholdDays ?? INACTIVE_DAYS;
    // Overdue work flags a student unless the teacher turned that rule off
    const flagOverdue = rule('ASSIGNMENT_OVERDUE')?.enabled !== false;
    const since = lastActive ?? joinedAt;
    const inactiveDays = Math.floor((now - since.getTime()) / DAY);
    const inactive = inactiveDays >= inactiveLimit;
    const missing = missedRecent >= MISSED_CLASSES;
    const flag = inactive && missing ? 'Falling behind'
      : missing ? `Missed ${missedRecent} classes`
      : inactive ? `Inactive ${inactiveDays} days`
      : overdue && flagOverdue ? `${overdue} overdue`
      : null;
    const reasons = [
      missing && `missed ${missedRecent} of the last ${lastFour.length} classes`,
      inactive && `hasn’t been active for ${inactiveDays} days`,
      overdue && `has ${overdue} overdue assignment${overdue === 1 ? '' : 's'}`,
    ].filter(Boolean) as string[];
    return { held: held.length, came, submitted, overdue, avgGrade, flag, flagReason: reasons.length ? reasons.join(', ') : null, inactiveDays, subs };
  }

  private classOut(c: ClassRow) {
    return { id: c.id, title: c.title, description: c.description, scheduledAt: c.scheduledAt, durationMins: c.durationMins, status: c.status, recordingUrl: c.recordingUrl, live: isLive(c) };
  }

  private nextClass(classes: ClassRow[], now: number) {
    return classes.find(c => isLive(c)) ?? classes.find(c => c.status === 'SCHEDULED' && c.scheduledAt.getTime() + c.durationMins * 60_000 >= now) ?? null;
  }

  // ── Student ────────────────────────────────────────────────────────────

  async studentOverview(student: UserProfile, cohortId?: string) {
    const rosters = await this.prisma.cohortRoster.findMany({
      where: { studentId: student.id },
      include: { cohort: { select: { id: true, name: true, examDate: true } } },
      orderBy: { addedAt: 'desc' },
    });
    const cohorts = rosters.map(r => ({ id: r.cohort.id, name: r.cohort.name, examDate: r.cohort.examDate }));
    if (!rosters.length) return { cohorts, cohort: null };
    const roster = rosters.find(r => r.cohortId === cohortId) ?? rosters[0];
    const ctx = await this.load(roster.cohortId);
    const { cohort } = ctx;
    const now = Date.now();
    const me = this.studentFacts(ctx, student.id, roster.addedAt, cohort.students.find(s => s.studentId === student.id)?.student.lastActiveDate ?? null, now);

    // Cohort-wide attendance on held classes, for comparison
    const heldAll = cohort.liveClasses.filter(c => ended(c, now));
    const possible = heldAll.length * cohort.students.length;
    const cohortAttendance = possible ? Math.round((heldAll.reduce((n, c) => n + cohort.students.filter(s => ctx.attended.has(`${c.id}:${s.studentId}`)).length, 0) / possible) * 100) : null;

    // The class's own averages, to set the student's numbers against
    const classFacts = cohort.students.map(s => this.studentFacts(ctx, s.studentId, (s as { addedAt?: Date }).addedAt ?? roster.addedAt, null, now));
    const graded = classFacts.map(f => f.avgGrade).filter((g): g is number => g != null);
    const classAvgGradePct = graded.length ? Math.round(graded.reduce((a, b) => a + b, 0) / graded.length) : null;
    const classSubmittedAvg = classFacts.length ? Math.round((classFacts.reduce((n, f) => n + f.submitted, 0) / classFacts.length) * 10) / 10 : null;

    const { out, courses } = await this.progress([student.id], ctx.courseIds);
    const mine = out.get(student.id);
    const courseProgress = courses.map(c => ({ id: c.id, title: c.title, pct: mine?.get(c.id) ?? 0 }));

    const [teacherApp, purchase] = await Promise.all([
      this.prisma.teacherApplication.findUnique({ where: { userId: cohort.teacherId }, select: { subjectAreas: true, yearsExperience: true } }).catch(() => null),
      this.prisma.packagePurchase.findFirst({
        where: { studentId: student.id, packageId: { in: cohort.packages.map(p => p.id) } },
        orderBy: { purchasedAt: 'desc' }, select: { packageId: true, expiresAt: true },
      }),
    ]);
    const pkg = purchase ? cohort.packages.find(p => p.id === purchase.packageId) : null;
    const dueSoon = me.subs.find(x => !x.s && x.a.dueDate.getTime() >= now);

    return {
      cohorts,
      cohort: { id: cohort.id, name: cohort.name, sittingLabel: cohort.sittingLabel, examDate: cohort.examDate, startDate: cohort.startDate },
      teacher: {
        id: cohort.teacher.id, name: nameOf(cohort.teacher), avatarUrl: cohort.teacher.avatarUrl, bio: cohort.teacher.bio,
        subjects: teacherApp?.subjectAreas ?? [], yearsExperience: teacherApp?.yearsExperience ?? null,
      },
      next: (() => { const n = this.nextClass(cohort.liveClasses, now); return n ? { ...this.classOut(n), dailyRoomUrl: n.dailyRoomUrl } : null; })(),
      stats: {
        attended: me.came, held: me.held, cohortAttendancePct: cohortAttendance,
        submitted: me.submitted, assignments: cohort.assignments.length, overdue: me.overdue,
        dueSoon: dueSoon ? { title: dueSoon.a.title, dueDate: dueSoon.a.dueDate } : null,
        avgGradePct: me.avgGrade, classAvgGradePct, classSubmittedAvg, graded: me.subs.filter(x => x.s?.grade != null).length,
      },
      courseProgress,
      classes: {
        upcoming: cohort.liveClasses.filter(c => !ended(c, now) && c.status !== 'CANCELLED').map(c => this.classOut(c)),
        // Classes held before the student joined are not counted as missed
        past: cohort.liveClasses.filter(c => ended(c, now)).reverse().map(c => ({
          ...this.classOut(c), attended: ctx.attended.has(`${c.id}:${student.id}`), beforeJoined: c.scheduledAt.getTime() < roster.addedAt.getTime() - DAY,
        })),
      },
      assignments: me.subs.map(({ a, s }) => ({
        id: a.id, title: a.title, dueDate: a.dueDate, maxPoints: a.maxPoints,
        state: !s ? (a.dueDate.getTime() < now ? 'overdue' : 'todo') : s.grade != null ? 'graded' : 'waiting',
        grade: s?.grade ?? null, submittedAt: s?.submittedAt ?? null,
      })),
      members: [
        { id: cohort.teacher.id, name: nameOf(cohort.teacher), role: 'Teacher', me: false },
        ...cohort.students.map(s => ({ id: s.studentId, name: nameOf(s.student), role: s.studentId === student.id ? 'You' : 'Student', me: s.studentId === student.id })),
      ],
      package: pkg ? { id: pkg.id, name: pkg.name, courses: pkg.courseIds.length, expiresAt: purchase!.expiresAt } : null,
    };
  }

  // ── Teacher ────────────────────────────────────────────────────────────

  private assertCanSee(cohort: { teacherId: string }, user: UserProfile) {
    if ((user.role as UserRole) !== UserRole.ADMIN && cohort.teacherId !== user.id) throw new ForbiddenException('Not your cohort');
  }

  async teacherOverview(user: UserProfile, cohortId: string) {
    const ctx = await this.load(cohortId);
    const { cohort } = ctx;
    this.assertCanSee(cohort, user);
    const now = Date.now();
    const ids = cohort.students.map(s => s.studentId);
    const { out, courses } = await this.progress(ids, ctx.courseIds);
    const avgOf = (sid: string) => { const m = out.get(sid); return m && m.size ? Math.round([...m.values()].reduce((a, b) => a + b, 0) / m.size) : 0; };

    const students = cohort.students.map(r => {
      const f = this.studentFacts(ctx, r.studentId, r.addedAt, r.student.lastActiveDate, now);
      return {
        id: r.studentId, name: nameOf(r.student), progress: avgOf(r.studentId),
        attended: f.came, held: f.held, submitted: f.submitted, assignments: cohort.assignments.length,
        lastActive: r.student.lastActiveDate, flag: f.flag,
      };
    }).sort((a, b) => Number(!!b.flag) - Number(!!a.flag) || a.progress - b.progress);

    // Attendance over the last 4 weeks of held classes
    const recent = cohort.liveClasses.filter(c => ended(c, now) && c.scheduledAt.getTime() > now - 28 * DAY);
    const possible = recent.length * ids.length;
    const attendancePct = possible ? Math.round((recent.reduce((n, c) => n + ids.filter(s => ctx.attended.has(`${c.id}:${s}`)).length, 0) / possible) * 100) : null;
    const ungraded = cohort.assignments.map(a => ({ a, n: a.submissions.filter(s => s.grade == null).length })).filter(x => x.n > 0);

    return {
      cohort: { id: cohort.id, name: cohort.name, sittingLabel: cohort.sittingLabel, examDate: cohort.examDate, startDate: cohort.startDate },
      next: (() => { const n = this.nextClass(cohort.liveClasses, now); return n ? this.classOut(n) : null; })(),
      stats: {
        students: ids.length, attention: students.filter(s => s.flag).length,
        avgProgress: ids.length ? Math.round(students.reduce((n, s) => n + s.progress, 0) / ids.length) : null,
        courses: courses.length, attendancePct,
        toGrade: ungraded.reduce((n, x) => n + x.n, 0), toGradeTitle: ungraded[0]?.a.title ?? null,
      },
      students,
      classes: cohort.liveClasses.filter(c => c.status !== 'CANCELLED').map(c => ({
        ...this.classOut(c), ended: ended(c, now),
        attendedCount: ids.filter(s => ctx.attended.has(`${c.id}:${s}`)).length, rosterSize: ids.length,
      })),
      assignments: cohort.assignments.map(a => ({
        id: a.id, title: a.title, dueDate: a.dueDate, maxPoints: a.maxPoints,
        submitted: a.submissions.length, graded: a.submissions.filter(s => s.grade != null).length, total: ids.length,
      })),
    };
  }

  async teacherStudent(user: UserProfile, cohortId: string, studentId: string) {
    const ctx = await this.load(cohortId);
    const { cohort } = ctx;
    this.assertCanSee(cohort, user);
    const r = cohort.students.find(s => s.studentId === studentId);
    if (!r) throw new NotFoundException('Student is not in this cohort');
    const now = Date.now();
    const f = this.studentFacts(ctx, studentId, r.addedAt, r.student.lastActiveDate, now);
    const { out, courses } = await this.progress([studentId], ctx.courseIds);
    const m = out.get(studentId);
    const held = cohort.liveClasses.filter(c => ended(c, now) && c.scheduledAt >= new Date(r.addedAt.getTime() - DAY));
    return {
      student: { id: studentId, name: nameOf(r.student), joinedAt: r.addedAt, lastActive: r.student.lastActiveDate },
      flag: f.flag, flagReason: f.flagReason,
      progress: m && m.size ? Math.round([...m.values()].reduce((a, b) => a + b, 0) / m.size) : 0,
      attended: f.came, held: f.held, avgGradePct: f.avgGrade,
      courses: courses.map(c => ({ id: c.id, title: c.title, pct: m?.get(c.id) ?? 0 })),
      recentClasses: held.slice(-5).reverse().map(c => ({ id: c.id, title: c.title, scheduledAt: c.scheduledAt, attended: ctx.attended.has(`${c.id}:${studentId}`) })),
      assignments: f.subs.map(({ a, s }) => ({
        id: a.id, title: a.title, maxPoints: a.maxPoints, dueDate: a.dueDate,
        state: !s ? (a.dueDate.getTime() < now ? 'overdue' : 'todo') : s.grade != null ? 'graded' : 'waiting', grade: s?.grade ?? null,
      })),
    };
  }

  /** Every student across the teacher's cohorts, with progress and why they need attention */
  async teacherStudents(user: UserProfile) {
    const cohorts = await this.prisma.cohort.findMany({ where: { teacherId: user.id }, select: { id: true, name: true } });
    const now = Date.now();
    const rows: { id: string; name: string; cohort: { id: string; name: string }; progress: number; attended: number; held: number; submitted: number; assignments: number; lastActive: Date | null; flag: string | null; flagReason: string | null }[] = [];
    for (const c of cohorts) {
      const ctx = await this.load(c.id);
      const ids = ctx.cohort.students.map(s => s.studentId);
      const { out } = await this.progress(ids, ctx.courseIds);
      for (const r of ctx.cohort.students) {
        const f = this.studentFacts(ctx, r.studentId, r.addedAt, r.student.lastActiveDate, now);
        const m = out.get(r.studentId);
        rows.push({
          id: r.studentId, name: nameOf(r.student), cohort: { id: c.id, name: c.name },
          progress: m && m.size ? Math.round([...m.values()].reduce((a, b) => a + b, 0) / m.size) : 0,
          attended: f.came, held: f.held, submitted: f.submitted, assignments: ctx.cohort.assignments.length,
          lastActive: r.student.lastActiveDate, flag: f.flag, flagReason: f.flagReason,
        });
      }
    }
    rows.sort((a, b) => Number(!!b.flag) - Number(!!a.flag) || a.progress - b.progress);
    const unique = new Set(rows.map(r => r.id));
    return {
      cohorts,
      stats: {
        students: unique.size,
        attention: rows.filter(r => r.flag).length,
        avgProgress: rows.length ? Math.round(rows.reduce((n, r) => n + r.progress, 0) / rows.length) : null,
        activeThisWeek: new Set(rows.filter(r => r.lastActive && now - r.lastActive.getTime() < 7 * DAY).map(r => r.id)).size,
      },
      students: rows,
    };
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  private status(c: { startDate: Date | null; examDate: Date | null }, now: number) {
    if (c.examDate && c.examDate.getTime() < now - DAY) return 'ended';
    if (c.startDate && c.startDate.getTime() > now) return 'upcoming';
    return 'running';
  }

  async adminList() {
    const now = Date.now();
    const cohorts = await this.prisma.cohort.findMany({
      include: {
        teacher: { select: PERSON },
        _count: { select: { students: true } },
        packages: { select: { id: true, name: true, isPublished: true } },
        liveClasses: { where: { status: { in: ['SCHEDULED', 'ACTIVE'] }, scheduledAt: { gte: new Date(now - 3 * 3_600_000) } }, orderBy: { scheduledAt: 'asc' }, take: 1, select: { title: true, scheduledAt: true, status: true } },
      },
      orderBy: { name: 'asc' },
    });
    const rows = cohorts.map(c => ({
      id: c.id, name: c.name, sittingLabel: c.sittingLabel, examDate: c.examDate, startDate: c.startDate,
      teacher: { id: c.teacher.id, name: nameOf(c.teacher) }, students: c._count.students,
      nextClass: c.liveClasses[0] ?? null, packages: c.packages, status: this.status(c, now),
    }));
    const weekStart = new Date(now - 7 * DAY);
    const [joinedThisWeek, classesThisWeek, lastWeek] = await Promise.all([
      this.prisma.cohortRoster.count({ where: { addedAt: { gte: weekStart } } }),
      this.prisma.liveClass.count({ where: { scheduledAt: { gte: new Date(now), lt: new Date(now + 7 * DAY) }, status: { not: 'CANCELLED' } } }),
      this.prisma.liveClass.findMany({
        where: { scheduledAt: { gte: weekStart, lt: new Date(now) }, status: { not: 'CANCELLED' } },
        select: { _count: { select: { attendance: true } }, cohort: { select: { _count: { select: { students: true } } } } },
      }),
    ]);
    const possible = lastWeek.reduce((n, c) => n + c.cohort._count.students, 0);
    return {
      stats: {
        running: rows.filter(r => r.status === 'running').length,
        upcoming: rows.filter(r => r.status === 'upcoming').length,
        students: rows.filter(r => r.status !== 'ended').reduce((n, r) => n + r.students, 0),
        joinedThisWeek, classesThisWeek,
        attendanceLastWeekPct: possible ? Math.round((lastWeek.reduce((n, c) => n + c._count.attendance, 0) / possible) * 100) : null,
        withoutPackage: rows.filter(r => r.status !== 'ended' && !r.packages.some(p => p.isPublished)).length,
      },
      cohorts: rows,
    };
  }

  async adminDetail(cohortId: string) {
    const ctx = await this.load(cohortId);
    const { cohort } = ctx;
    const now = Date.now();
    const ids = cohort.students.map(s => s.studentId);
    const held = cohort.liveClasses.filter(c => ended(c, now));
    const possible = held.length * ids.length;
    const { out } = await this.progress(ids, ctx.courseIds);
    const avgs = ids.map(s => { const m = out.get(s); return m && m.size ? [...m.values()].reduce((a, b) => a + b, 0) / m.size : 0; });
    const revenue = await this.prisma.packagePurchase.groupBy({
      by: ['currency'],
      where: { packageId: { in: cohort.packages.map(p => p.id) }, amountPaid: { gt: 0 } },
      _sum: { amountPaid: true },
    });
    return {
      cohort: { id: cohort.id, name: cohort.name, sittingLabel: cohort.sittingLabel, examDate: cohort.examDate, startDate: cohort.startDate, status: this.status(cohort, now) },
      teacher: { id: cohort.teacher.id, name: nameOf(cohort.teacher), email: cohort.teacher.email },
      stats: {
        attendancePct: possible ? Math.round((held.reduce((n, c) => n + ids.filter(s => ctx.attended.has(`${c.id}:${s}`)).length, 0) / possible) * 100) : null,
        avgProgress: ids.length ? Math.round(avgs.reduce((a, b) => a + b, 0) / ids.length) : null,
        held: held.length,
        ahead: cohort.liveClasses.filter(c => !ended(c, now) && c.status !== 'CANCELLED').length,
      },
      revenue: revenue.filter(r => r.currency).map(r => ({ currency: r.currency!, amount: r._sum.amountPaid ?? 0 })),
      members: cohort.students
        .map(s => ({ id: s.studentId, name: nameOf(s.student), email: s.student.email, source: s.source, addedAt: s.addedAt }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      packages: cohort.packages.map(p => ({ id: p.id, name: p.name, priceAmount: p.priceAmount, currency: p.currency, validityDays: p.validityDays, isPublished: p.isPublished, sold: p._count.purchases })),
      upcoming: cohort.liveClasses.filter(c => !ended(c, now) && c.status !== 'CANCELLED').slice(0, 5).map(c => this.classOut(c)),
    };
  }
}
