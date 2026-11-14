import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ClassifyService } from './classify.service';
import { CommissionsService } from './commissions.service';

const DAY = 86_400_000;
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };
const PLACEHOLDER = /^(cameroon|new course)$/i;

/** The numbers at the top of each Admin → Content page: the job waiting there, today */
@Injectable()
export class ContentHeroesService {
  constructor(private prisma: PrismaService, private classify: ClassifyService, private commissionsSvc: CommissionsService) {}

  get(section: string) {
    switch (section) {
      case 'courses': return this.courses();
      case 'questions': return this.questions();
      case 'mocks': return this.mocks();
      case 'packages': return this.packages();
      case 'coupons': return this.coupons();
      case 'live': return this.live();
      case 'commissions': return this.commissions();
      default: throw new BadRequestException('Unknown section');
    }
  }

  private async courses() {
    const courses = await this.prisma.platformCourse.findMany({
      where: { status: { not: 'ARCHIVED' } },
      select: { id: true, title: true, status: true, programmeId: true, subjectId: true, isSoldIndividually: true, priceAmount: true, source: true, catalogueHidden: true },
    });
    const [joined, suggestions] = await Promise.all([
      this.prisma.courseEnrollment.groupBy({ by: ['courseId'], where: { enrolledAt: { gte: monthStart() } }, _count: { _all: true }, orderBy: { _count: { courseId: 'desc' } }, take: 3 }),
      this.classify.suggestions(),
    ]);
    const titles = new Map(courses.map(c => [c.id, c.title]));
    const published = courses.filter(c => c.status === 'PUBLISHED');
    const free = published.filter(c => (c.isSoldIndividually && !c.priceAmount) || (c.source === 'WORDPRESS' && !c.isSoldIndividually)).length;
    const tagged = courses.filter(c => c.programmeId && c.subjectId).length;
    const titleMatches = suggestions.courses.filter(c => !c.placeholder && (c.exam?.confidence === 'high' || c.subject?.confidence === 'high')).length;
    return {
      total: courses.length, published: published.length,
      drafts: courses.filter(c => c.status === 'DRAFT').length, inReview: courses.filter(c => c.status === 'PENDING_REVIEW').length,
      placeholders: courses.filter(c => PLACEHOLDER.test(c.title.trim())).length,
      untagged: courses.length - tagged, tagged, titleMatches, free,
      joinedThisMonth: await this.prisma.courseEnrollment.count({ where: { enrolledAt: { gte: monthStart() } } }),
      topJoined: joined.map(j => ({ title: titles.get(j.courseId) ?? 'A course', n: j._count._all })),
    };
  }

  private async questions() {
    const [byStatus, noWhy, byCourse, aiDrafts, aiCheck] = await Promise.all([
      this.prisma.questionBank.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.questionBank.count({ where: { OR: [{ explanation: null }, { explanation: '' }] } }),
      this.prisma.questionBank.groupBy({ by: ['courseId'], _count: { _all: true }, orderBy: { _count: { courseId: 'desc' } }, take: 4 }),
      this.prisma.questionBank.count({ where: { aiDraft: { not: Prisma.DbNull } } }),
      this.prisma.questionBank.count({ where: { aiDraft: { path: ['answerLooksWrong'], equals: true } } }),
    ]);
    const courses = await this.prisma.platformCourse.findMany({ where: { id: { in: byCourse.map(b => b.courseId) } }, select: { id: true, title: true } });
    const n = (s: string) => byStatus.find(b => b.status === s)?._count._all ?? 0;
    const total = byStatus.reduce((t, b) => t + b._count._all, 0);
    const why = await Promise.all(byCourse.map(b => this.prisma.questionBank.count({ where: { courseId: b.courseId, explanation: { not: null }, NOT: { explanation: '' } } })));
    return {
      total, live: n('LIVE'), inReview: n('IN_REVIEW'), drafts: n('DRAFT'), noExplanation: noWhy, explained: total - noWhy, aiDrafts, aiCheck,
      byCourse: byCourse.map((b, i) => ({ courseId: b.courseId, title: courses.find(c => c.id === b.courseId)?.title ?? 'A course', n: b._count._all, explained: why[i] })),
    };
  }

  private async mocks() {
    const [mocks, sessions, questions] = await Promise.all([
      this.prisma.mockExam.findMany({ where: { status: { not: 'ARCHIVED' } }, select: { id: true, title: true, status: true, kind: true } }),
      this.prisma.testSession.findMany({ where: { mockExamId: { not: null }, submittedAt: { not: null } }, select: { score: true, maxScore: true, submittedAt: true, mockExamId: true } }),
      this.prisma.questionBank.count({ where: { status: 'LIVE' } }),
    ]);
    const scored = sessions.filter(s => s.score != null && s.maxScore > 0);
    return {
      total: mocks.length, live: mocks.filter(m => m.status === 'PUBLISHED').length, drafts: mocks.filter(m => m.status === 'DRAFT').length,
      pastPapers: mocks.filter(m => m.kind === 'PAST_PAPER').length,
      attempts: sessions.length, attemptsThisMonth: sessions.filter(s => s.submittedAt! >= monthStart()).length,
      avgPct: scored.length ? Math.round(scored.reduce((t, s) => t + (s.score! / s.maxScore) * 100, 0) / scored.length) : null,
      questionsAvailable: questions,
      top: mocks.map(m => ({ title: m.title, status: m.status, attempts: sessions.filter(s => s.mockExamId === m.id).length })).sort((a, b) => b.attempts - a.attempts).slice(0, 3),
    };
  }

  private async packages() {
    const pkgs = await this.prisma.package.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, priceAmount: true, currency: true, courseIds: true, isPublished: true, bestValue: true, cohortId: true, _count: { select: { purchases: true } } },
    });
    const month = await this.prisma.packagePurchase.findMany({ where: { purchasedAt: { gte: monthStart() } }, select: { amountPaid: true, currency: true, packageId: true } });
    return {
      total: pkgs.length, published: pkgs.filter(p => p.isPublished).length, unpublished: pkgs.filter(p => !p.isPublished).length,
      bestValueSet: pkgs.some(p => p.bestValue && p.isPublished),
      soldThisMonth: month.length,
      list: pkgs.slice(0, 4).map(p => ({ id: p.id, name: p.name, priceAmount: p.priceAmount, currency: p.currency, courses: p.courseIds.length, published: p.isPublished, bestValue: p.bestValue, live: !!p.cohortId, sold: p._count.purchases, soldThisMonth: month.filter(m => m.packageId === p.id).length })),
    };
  }

  private async coupons() {
    const now = new Date();
    const cs = await this.prisma.coupon.findMany({ select: { code: true, isActive: true, expiresAt: true, maxRedemptions: true, redeemedCount: true, percentOff: true, amountOff: true } });
    const active = cs.filter(c => c.isActive && (!c.expiresAt || c.expiresAt > now) && (c.maxRedemptions == null || c.redeemedCount < c.maxRedemptions));
    return {
      total: cs.length, active: active.length,
      endingSoon: active.filter(c => c.expiresAt && c.expiresAt.getTime() - now.getTime() < 7 * DAY).length,
      used: cs.reduce((t, c) => t + c.redeemedCount, 0),
      top: [...cs].sort((a, b) => b.redeemedCount - a.redeemedCount).slice(0, 3).map(c => ({ code: c.code, used: c.redeemedCount, max: c.maxRedemptions, off: c.percentOff ? `${c.percentOff}% off` : 'amount off' })),
    };
  }

  private async live() {
    const now = Date.now(), weekEnd = new Date(now + 7 * DAY);
    const [liveNow, week, held, cohorts] = await Promise.all([
      this.prisma.liveClass.count({ where: { status: 'ACTIVE' } }),
      this.prisma.liveClass.findMany({ where: { scheduledAt: { gte: new Date(now), lt: weekEnd }, status: 'SCHEDULED' }, orderBy: { scheduledAt: 'asc' }, take: 3, select: { title: true, scheduledAt: true, cohort: { select: { name: true } } } }),
      this.prisma.liveClass.findMany({ where: { scheduledAt: { lt: new Date(now - 2 * 3600_000), gte: new Date(now - 60 * DAY) }, status: { in: ['COMPLETED', 'SCHEDULED'] } }, select: { recordingUrl: true, recordingId: true } }),
      this.prisma.cohort.count(),
    ]);
    const thisWeek = await this.prisma.liveClass.count({ where: { scheduledAt: { gte: new Date(now), lt: weekEnd } } });
    return {
      liveNow, thisWeek, cohorts,
      next: week.map(w => ({ title: w.title, at: w.scheduledAt, cohort: w.cohort.name })),
      held60: held.length, missingRecordings: held.filter(h => !h.recordingUrl && !h.recordingId).length,
    };
  }

  /** The same numbers as the Commissions table below the hero, so the two always agree */
  private async commissions() {
    const { rows, stats } = await this.commissionsSvc.list();
    return {
      courses: stats.courses, noReviewer: stats.noReviewer, waiting: stats.waiting, teacherPending: stats.teacherPending,
      approved: rows.filter(r => r.review === 'APPROVED').length,
      teacherShare: stats.defaultTeacherPct, reviewerShare: stats.usualReviewerPct,
    };
  }
}
