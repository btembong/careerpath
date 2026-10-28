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
}
