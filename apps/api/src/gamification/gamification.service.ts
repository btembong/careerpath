import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const XP_TABLE: Record<string, number> = {
  LESSON_COMPLETE: 10, QUIZ_PASS: 25, ASSIGNMENT_SUBMIT: 10, ASSIGNMENT_PASS: 30,
  FORUM_POST: 5, FORUM_UPVOTE_RECEIVED: 2, STREAK_BONUS: 15, ENROLLMENT: 5,
  CERTIFICATE_EARNED: 100, FLASHCARD_REVIEW: 2, PEER_REVIEW_GIVEN: 15,
};

const BADGE_THRESHOLDS: { badge: string; check: (stats: UserStats) => boolean }[] = [
  { badge: 'FIRST_LESSON',          check: s => s.lessonsCompleted >= 1 },
  { badge: 'FIRST_COURSE_COMPLETE', check: s => s.coursesCompleted >= 1 },
  { badge: 'STREAK_7',              check: s => s.streak >= 7 },
  { badge: 'STREAK_30',             check: s => s.streak >= 30 },
  { badge: 'QUIZ_PERFECT',          check: s => s.perfectQuizzes >= 1 },
  { badge: 'FORUM_HELPER',          check: s => s.forumUpvotesReceived >= 10 },
  { badge: 'CERTIFICATE_FIRST',     check: s => s.certificatesEarned >= 1 },
  { badge: 'PEER_REVIEWER',         check: s => s.peerReviewsGiven >= 3 },
];

/** What the leaderboard shows under "How to earn points" — read from XP_TABLE so it can't drift */
const EARN_GUIDE = [
  { label: 'Finish a lesson', points: XP_TABLE.LESSON_COMPLETE },
  { label: 'Pass a quiz', points: XP_TABLE.QUIZ_PASS },
  { label: 'Hand in an assignment', points: XP_TABLE.ASSIGNMENT_SUBMIT },
  { label: 'Pass an assignment', points: XP_TABLE.ASSIGNMENT_PASS },
  { label: 'Ask or answer in Community', points: XP_TABLE.FORUM_POST },
  { label: 'Reach a 7 or 30-day streak', points: XP_TABLE.STREAK_BONUS },
  { label: 'Earn a certificate', points: XP_TABLE.CERTIFICATE_EARNED },
];

const BADGE_LABELS = [
  { badge: 'FIRST_LESSON', label: 'First lesson', hint: 'Finish any lesson' },
  { badge: 'STREAK_7', label: '7-day streak', hint: 'Learn 7 days in a row' },
  { badge: 'QUIZ_PERFECT', label: 'Quiz master', hint: 'Score 100% on a quiz' },
  { badge: 'FIRST_COURSE_COMPLETE', label: 'Course finished', hint: 'Complete a whole course' },
  { badge: 'CERTIFICATE_FIRST', label: 'First certificate', hint: 'Earn a certificate' },
  { badge: 'FORUM_HELPER', label: 'Helper', hint: 'Get 10 upvotes in Community' },
  { badge: 'STREAK_30', label: '30-day streak', hint: 'Learn 30 days in a row' },
  { badge: 'PEER_REVIEWER', label: 'Peer reviewer', hint: 'Review 3 classmates' },
];

interface UserStats {
  lessonsCompleted: number; coursesCompleted: number; streak: number;
  perfectQuizzes: number; forumUpvotesReceived: number; certificatesEarned: number;
  peerReviewsGiven: number;
}

@Injectable()
export class GamificationService {
  private readonly logger = new Logger(GamificationService.name);

  constructor(private prisma: PrismaService) {}

  /**
   * Award XP at most once per (user, type, key) — e.g. one LESSON_COMPLETE per lesson — so re-marking
   * or re-submitting can't farm points. Never throws: XP must not break the action that earned it.
   */
  async awardOnce(userId: string, type: keyof typeof XP_TABLE, key: string, meta: Record<string, unknown> = {}) {
    try {
      const already = await this.prisma.xPEvent.findFirst({
        where: { userId, type: type as any, meta: { path: ['key'], equals: key } },
        select: { id: true },
      });
      if (already) return;
      await this.awardXP(userId, type, { ...meta, key });
    } catch (err: any) {
      this.logger.warn(`XP ${type} for ${userId} (${key}) failed: ${err.message}`);
    }
  }

  async awardXP(userId: string, type: string, meta?: any) {
    const points = XP_TABLE[type] ?? 0;
    if (points === 0) return;

    await this.prisma.$transaction([
      this.prisma.xPEvent.create({ data: { userId, type: type as any, points, meta } }),
      this.prisma.userProfile.update({ where: { id: userId }, data: { xpTotal: { increment: points } } }),
    ]);

    await this.updateStreak(userId);
    await this.checkAndAwardBadges(userId);
  }

  async updateStreak(userId: string) {
    const user = await this.prisma.userProfile.findUnique({ where: { id: userId }, select: { lastActiveDate: true, streak: true } });
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const last = user?.lastActiveDate ? new Date(user.lastActiveDate) : null;
    if (last) last.setHours(0, 0, 0, 0);

    if (!last || last.getTime() === today.getTime()) {
      // Already active today — just update lastActiveDate
      await this.prisma.userProfile.update({ where: { id: userId }, data: { lastActiveDate: new Date() } });
      return;
    }

    const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
    const newStreak = last.getTime() === yesterday.getTime() ? (user!.streak + 1) : 1;

    await this.prisma.userProfile.update({ where: { id: userId }, data: { streak: newStreak, lastActiveDate: new Date() } });

    if (newStreak === 7 || newStreak === 30) {
      await this.awardXP(userId, 'STREAK_BONUS', { streak: newStreak });
    }
  }

  async checkAndAwardBadges(userId: string) {
    const [user, events, alreadyEarned] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { id: userId }, select: { streak: true } }),
      this.prisma.xPEvent.findMany({ where: { userId } }),
      this.prisma.userBadge.findMany({ where: { userId }, select: { badge: true } }),
    ]);
    const earned = new Set(alreadyEarned.map(b => b.badge));

    const countType = (t: string) => events.filter(e => e.type === t).length;

    const stats: UserStats = {
      lessonsCompleted: countType('LESSON_COMPLETE'),
      coursesCompleted: countType('CERTIFICATE_EARNED'),
      streak: user?.streak ?? 0,
      perfectQuizzes: events.filter(e => e.type === 'QUIZ_PASS' && (e.meta as any)?.perfect).length,
      forumUpvotesReceived: countType('FORUM_UPVOTE_RECEIVED'),
      certificatesEarned: countType('CERTIFICATE_EARNED'),
      peerReviewsGiven: countType('PEER_REVIEW_GIVEN'),
    };

    const toAward = BADGE_THRESHOLDS.filter(b => !earned.has(b.badge as any) && b.check(stats));
    if (toAward.length) {
      await this.prisma.userBadge.createMany({
        data: toAward.map(b => ({ userId, badge: b.badge as any })),
        skipDuplicates: true,
      });
    }
  }

  async getMyStats(userId: string) {
    const [user, badges, courses, recentXP] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { id: userId }, select: { xpTotal: true, streak: true, lastActiveDate: true } }),
      this.prisma.userBadge.findMany({ where: { userId }, orderBy: { earnedAt: 'desc' } }),
      this.prisma.courseEnrollment.findMany({
        where: { studentId: userId },
        include: {
          course: {
            select: {
              id: true, title: true,
              modules: { select: { lessons: { select: { id: true } } } },
            },
          },
        },
      }),
      this.prisma.xPEvent.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);

    const courseProgress = await Promise.all(courses.map(async (e) => {
      const lessonIds = e.course.modules.flatMap(m => m.lessons.map(l => l.id));
      const completed = await this.prisma.lessonProgress.count({ where: { studentId: userId, lessonId: { in: lessonIds }, completed: true } });
      return { id: e.course.id, title: e.course.title, progress: lessonIds.length ? Math.round((completed / lessonIds.length) * 100) : 0 };
    }));

    return { xpTotal: user?.xpTotal ?? 0, streak: user?.streak ?? 0, badges, courses: courseProgress, recentXP };
  }

  async getCohortLeaderboard(cohortId: string, user: { id: string; role: string }) {
    // Lists classmates' names, so only cohort members, its teacher, and admins may see it
    if (user.role !== 'ADMIN') {
      const cohort = await this.prisma.cohort.findUnique({ where: { id: cohortId }, select: { teacherId: true } });
      if (!cohort) throw new NotFoundException('Cohort not found');
      const isMember = cohort.teacherId === user.id || !!(await this.prisma.cohortRoster.findUnique({
        where: { studentId_cohortId: { studentId: user.id, cohortId } },
      }));
      if (!isMember) throw new ForbiddenException('Not a member of this cohort');
    }

    const roster = await this.prisma.cohortRoster.findMany({
      where: { cohortId },
      include: { student: { select: { id: true, name: true, firstName: true, lastName: true, avatarUrl: true, xpTotal: true, streak: true } } },
    });

    return roster
      .map(r => ({
        id: r.student.id,
        name: r.student.name ?? ([r.student.firstName, r.student.lastName].filter(Boolean).join(' ') || 'Student'),
        avatarUrl: r.student.avatarUrl,
        xpTotal: r.student.xpTotal,
        streak: r.student.streak,
      }))
      .sort((a, b) => b.xpTotal - a.xpTotal)
      .map((s, i) => ({ ...s, rank: i + 1 }));
  }
  /**
   * The student leaderboard: points earned in a period (XP events), among one cohort or every student.
   * Classmates who turned off "Show my name" appear as "A classmate"; you always see yourself.
   */
  async getBoard(user: { id: string; role: string }, opts: { period?: string; scope?: string; cohortId?: string }) {
    const period = (['week', 'month', 'all'].includes(opts.period ?? '') ? opts.period : 'week') as 'week' | 'month' | 'all';
    const now = new Date();
    const start = period === 'week' ? new Date(now.getTime() - 7 * 86_400_000)
      : period === 'month' ? new Date(now.getTime() - 30 * 86_400_000) : null;
    const prevStart = start ? new Date(start.getTime() - (now.getTime() - start.getTime())) : null;

    const memberships = await this.prisma.cohortRoster.findMany({
      where: { studentId: user.id },
      select: { cohort: { select: { id: true, name: true } } },
    });
    const cohorts = memberships.map(m => m.cohort);
    const scope = opts.scope === 'everyone' || !cohorts.length ? 'everyone' : 'cohort';
    const cohort = scope === 'cohort' ? (cohorts.find(c => c.id === opts.cohortId) ?? cohorts[0]) : null;

    // Who is on the board
    let studentIds: string[];
    if (cohort) {
      const roster = await this.prisma.cohortRoster.findMany({ where: { cohortId: cohort.id }, select: { studentId: true } });
      studentIds = roster.map(r => r.studentId);
    } else {
      const active = await this.prisma.xPEvent.groupBy({
        by: ['userId'], where: start ? { createdAt: { gte: start } } : {},
        _sum: { points: true }, orderBy: { _sum: { points: 'desc' } }, take: 50,
      });
      studentIds = [...new Set([...active.map(a => a.userId), user.id])];
    }

    const sumsFor = async (from: Date | null, to: Date | null) => {
      const rows = await this.prisma.xPEvent.groupBy({
        by: ['userId'],
        where: { userId: { in: studentIds }, ...(from || to ? { createdAt: { ...(from && { gte: from }), ...(to && { lt: to }) } } : {}) },
        _sum: { points: true },
      });
      return new Map(rows.map(r => [r.userId, r._sum.points ?? 0]));
    };
    const [people, current, previous] = await Promise.all([
      this.prisma.userProfile.findMany({
        where: { id: { in: studentIds }, role: 'STUDENT' },
        select: { id: true, name: true, firstName: true, lastName: true, avatarUrl: true, xpTotal: true, streak: true, leaderboardVisible: true },
      }),
      start ? sumsFor(start, null) : Promise.resolve(null),
      prevStart && start ? sumsFor(prevStart, start) : Promise.resolve(null),
    ]);

    type Person = (typeof people)[number];
    const pointsOf = (p: Person) => current ? (current.get(p.id) ?? 0) : p.xpTotal;
    const rankBy = (score: (p: Person) => number) =>
      new Map([...people].sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id)).map((p, i) => [p.id, i + 1]));
    const ranks = rankBy(pointsOf);
    const prevRanks = previous ? rankBy(p => previous.get(p.id) ?? 0) : null;

    const full = (p: Person) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || 'Student';
    const entries = [...people]
      .sort((a, b) => ranks.get(a.id)! - ranks.get(b.id)!)
      .map(p => {
        const isMe = p.id === user.id;
        const hidden = !isMe && !p.leaderboardVisible;
        const name = hidden ? 'A classmate' : full(p);
        const rank = ranks.get(p.id)!;
        return {
          rank, id: hidden ? `hidden-${rank}` : p.id, name, isMe,
          initials: hidden ? '·' : name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase(),
          avatarUrl: hidden ? null : p.avatarUrl, points: pointsOf(p), streak: p.streak,
          move: prevRanks ? prevRanks.get(p.id)! - rank : 0,
        };
      });

    const meIdx = entries.findIndex(e => e.isMe);
    const me = meIdx >= 0 ? entries[meIdx] : null;
    const ahead = meIdx > 0 ? entries[meIdx - 1] : null;
    const [self, earned] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { id: user.id }, select: { leaderboardVisible: true, streak: true } }),
      this.prisma.userBadge.findMany({ where: { userId: user.id } }),
    ]);

    return {
      period, scope, cohorts, cohortId: cohort?.id ?? null, scopeName: cohort?.name ?? 'Everyone',
      leaderboardVisible: self?.leaderboardVisible ?? true,
      me: me ? {
        rank: me.rank, points: me.points, streak: self?.streak ?? 0, of: entries.length,
        gap: ahead ? ahead.points - me.points : 0, aheadName: ahead?.name ?? null,
      } : null,
      entries: entries.slice(0, 50).concat(me && me.rank > 50 ? [me] : []),
      earn: EARN_GUIDE,
      badges: BADGE_LABELS.map(b => {
        const e = earned.find(x => x.badge === b.badge);
        return { ...b, earned: !!e, earnedAt: e?.earnedAt ?? null };
      }),
    };
  }

  async setLeaderboardVisible(userId: string, visible: boolean) {
    await this.prisma.userProfile.update({ where: { id: userId }, data: { leaderboardVisible: !!visible } });
    return { leaderboardVisible: !!visible };
  }
}
