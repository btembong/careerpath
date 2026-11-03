import { Injectable } from '@nestjs/common';
import { TestMode, TestStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

const DAY = 24 * 3600 * 1000;
const BAND_ORDER = ['NEEDS_WORK', 'GETTING_THERE', 'NEAR_READY', 'READY'];

/** Progress you can see: mock and CAT results over time, a study calendar, and three headline tiles. */
@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService) {}

  async forStudent(studentId: string) {
    const now = new Date();
    // Calendar: five full weeks ending this week, Monday first
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const dow = (today.getUTCDay() + 6) % 7; // 0 = Monday
    const calStart = new Date(today.getTime() - (dow + 28) * DAY);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const lastMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
    const since = new Date(Math.min(calStart.getTime(), lastMonthStart.getTime()));

    const [exams, lessons, sessions] = await Promise.all([
      this.prisma.testSession.findMany({
        where: { studentId, status: TestStatus.SUBMITTED, mode: { in: [TestMode.EXAM, TestMode.CAT] }, maxScore: { gt: 0 } },
        orderBy: { submittedAt: 'asc' },
        select: { id: true, title: true, mode: true, score: true, maxScore: true, submittedAt: true, startedAt: true, cat: true, mockExam: { select: { passMark: true, kind: true } } },
        take: 200,
      }),
      this.prisma.lessonProgress.findMany({ where: { studentId, updatedAt: { gte: since } }, select: { updatedAt: true, watchedSecs: true } }),
      this.prisma.testSession.findMany({ where: { studentId, startedAt: { gte: since } }, select: { startedAt: true, submittedAt: true } }),
    ]);

    // ── Results over time (last 12) ──
    const results = exams.map(s => {
      const r = (s.cat as { result?: { decision: string; probability: number; band: string } } | null)?.result;
      const isCat = s.mode === TestMode.CAT;
      return {
        id: s.id, title: s.title, kind: isCat ? 'CAT' : s.mockExam?.kind === 'PAST_PAPER' ? 'PAST_PAPER' : 'MOCK',
        date: (s.submittedAt ?? s.startedAt).toISOString(),
        percent: isCat ? (r && r.decision !== 'UNDECIDED' ? Math.round(r.probability * 100) : null) : Math.round(((s.score ?? 0) / s.maxScore) * 100),
        band: isCat && r && r.decision !== 'UNDECIDED' ? r.band : null,
        passMark: s.mockExam?.passMark ?? null,
      };
    }).filter(x => x.percent != null);
    const recent = results.slice(-12);

    // ── Tiles ──
    const mocks = results.filter(r => r.kind !== 'CAT');
    const best = mocks.reduce<number | null>((b, r) => (b == null || r.percent! > b ? r.percent : b), null);
    const firstMock = mocks[0];
    const cats = results.filter(r => r.kind === 'CAT' && r.band);
    const lastCat = cats[cats.length - 1];
    const prevCat = cats[cats.length - 2];
    const secsIn = (from: Date, to: Date) =>
      lessons.filter(l => l.updatedAt >= from && l.updatedAt < to).reduce((t, l) => t + l.watchedSecs, 0)
      + sessions.filter(s => s.startedAt >= from && s.startedAt < to && s.submittedAt).reduce((t, s) => t + Math.min(3 * 3600, (s.submittedAt!.getTime() - s.startedAt.getTime()) / 1000), 0);
    const thisMonth = secsIn(monthStart, new Date(now.getTime() + DAY));
    const lastMonth = secsIn(lastMonthStart, monthStart);

    // ── Calendar: activities per day ──
    const counts = new Map<string, number>();
    const bump = (d: Date) => { const k = d.toISOString().slice(0, 10); counts.set(k, (counts.get(k) ?? 0) + 1); };
    lessons.forEach(l => bump(l.updatedAt));
    sessions.forEach(s => bump(s.startedAt));
    const days = Array.from({ length: 35 }, (_, i) => {
      const d = new Date(calStart.getTime() + i * DAY);
      const k = d.toISOString().slice(0, 10);
      const n = counts.get(k) ?? 0;
      return { date: k, count: n, level: d > today ? -1 : n === 0 ? 0 : n <= 1 ? 1 : n <= 3 ? 2 : 3 };
    });
    let streak = 0;
    for (let i = days.findIndex(d => d.date === today.toISOString().slice(0, 10)); i >= 0; i--) {
      if (days[i].count > 0) streak++;
      else if (days[i].date !== today.toISOString().slice(0, 10)) break;
    }

    return {
      results: recent,
      passMark: [...recent].reverse().find(r => r.passMark != null)?.passMark ?? 50,
      tiles: {
        bestMock: best == null ? null : { value: best, since: firstMock && mocks.length > 1 ? best - firstMock.percent! : null, sinceDate: firstMock?.date ?? null },
        readiness: lastCat ? { band: lastCat.band, title: lastCat.title, up: prevCat ? BAND_ORDER.indexOf(lastCat.band!) - BAND_ORDER.indexOf(prevCat.band!) : null, prev: prevCat?.band ?? null } : null,
        studied: { thisMonthHours: Math.round((thisMonth / 3600) * 10) / 10, lastMonthHours: Math.round((lastMonth / 3600) * 10) / 10 },
      },
      calendar: { days, streak },
    };
  }
}
