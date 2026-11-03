'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';
import { ProgressViz } from '@/components/progress/ProgressViz';

interface Stats { totalCourses: number; completedCourses: number; totalLessons: number; completedLessons: number; avgQuizScore: number | null; studyHours: number; streak: number; certificates: number }
interface Week { week: string; hours: number; lessons: number }
interface Activity { months: { key: string; label: string }[]; rows: { courseId: string; title: string; total: number; cells: { month: string; total: number }[] }[]; max: number }
interface Gami { xpTotal: number; streak: number; badges: { badge: string }[]; courses: { id: string; title: string; progress: number }[]; recentXP: { id: string; type: string; points: number; createdAt: string }[] }
interface QuizScore { courseId: string; courseTitle: string; score: number }

const BADGES: Record<string, string> = {
  FIRST_LESSON: 'First lesson', FIVE_LESSONS: '5 lessons', TWENTY_LESSONS: '20 lessons', FIRST_QUIZ_PASS: 'First quiz passed', QUIZ_PERFECT: 'Perfect quiz',
  STREAK_7: '7-day streak', STREAK_30: '30-day streak', TOP_SCORER: 'Top scorer', COURSE_COMPLETE: 'Course finished', FIRST_COURSE_COMPLETE: 'First course finished', CERTIFICATE_FIRST: 'First certificate',
};
const XP: Record<string, string> = {
  LESSON_COMPLETE: 'Lesson done', QUIZ_PASS: 'Quiz passed', QUIZ_PERFECT: 'Perfect quiz', STREAK_BONUS: 'Streak bonus', ASSIGNMENT_SUBMIT: 'Assignment handed in',
  ASSIGNMENT_PASS: 'Assignment passed', ENROLLMENT: 'Joined a course', FORUM_POST: 'Helped in the community', CERTIFICATE_EARNED: 'Certificate earned', FLASHCARD_REVIEW: 'Flashcards reviewed',
};
const SHADES = ['bg-subtle', 'bg-[#C8D5F5]', 'bg-[#8FAAF5]', 'bg-azure', 'bg-azure-strong'];
const hm = (h: number) => { const m = Math.round(h * 60); return m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`; };

export default function ProgressPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [weeks, setWeeks] = useState<Week[] | null>(null);
  const [act, setAct] = useState<Activity | null>(null);
  const [g, setG] = useState<Gami | null>(null);
  const [scores, setScores] = useState<QuizScore[]>([]);

  useEffect(() => {
    api.get('/portals/student/stats').then(r => setStats(r.data)).catch(() => {});
    api.get('/portals/student/weekly-hours').then(r => setWeeks(r.data)).catch(() => setWeeks([]));
    api.get('/portals/student/study-activity').then(r => setAct(r.data)).catch(() => {});
    api.get('/gamification/me').then(r => setG(r.data)).catch(() => {});
    api.get('/portals/student/quiz-scores').then(r => setScores(r.data ?? [])).catch(() => {});
  }, []);

  const thisWeek = weeks?.[weeks.length - 1];
  const maxH = Math.max(0.5, ...(weeks ?? []).map(w => w.hours));
  const level = (n: number) => !n || !act?.max ? 0 : Math.min(4, Math.ceil((n / act.max) * 4));
  const scoreOf = (id: string) => scores.find(s => s.courseId === id)?.score;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="My progress" subtitle="How much you’ve done, how well, and where your time goes" />
      <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
        <div className="w-full"><ProgressViz /></div>
        <div className="flex min-w-0 flex-[999_1_540px] flex-col gap-4">
          <dl className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            {[
              { l: 'Lessons done', v: stats ? `${stats.completedLessons} of ${stats.totalLessons}` : '—', sub: stats ? `${stats.completedCourses} course${stats.completedCourses === 1 ? '' : 's'} finished` : '' },
              { l: 'Average quiz', v: stats?.avgQuizScore != null ? `${stats.avgQuizScore}%` : '—', sub: scores.length ? `across ${scores.length} course${scores.length === 1 ? '' : 's'}` : 'no quizzes yet' },
              { l: 'This week', v: thisWeek ? hm(thisWeek.hours) : '—', sub: thisWeek ? `${thisWeek.lessons} lesson${thisWeek.lessons === 1 ? '' : 's'} done` : '' },
              { l: 'Certificates', v: stats ? String(stats.certificates) : '—', sub: 'earned' },
            ].map(s => (
              <div key={s.l} className="rounded-lg border border-line bg-white px-[15px] py-[13px]">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{s.l}</dt>
                <dd className="mt-[5px] text-[20px] font-extrabold text-navy">{s.v}</dd>
                <dd className="mt-0.5 text-[12px] text-muted">{s.sub}</dd>
              </div>
            ))}
          </dl>

          <section className="rounded-lg border border-line bg-white p-[18px]">
            <div className="flex items-baseline justify-between"><h2 className="text-[16px] font-bold text-navy">Time studied</h2><span className="text-[12.5px] text-muted">a week · last {weeks?.length || 8} weeks</span></div>
            <div className="mt-3.5 flex h-[130px] items-end gap-3">
              {(weeks ?? Array.from({ length: 8 }, () => null)).map((w, i, all) => (
                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[11px] text-muted">{w ? (w.hours ? `${Math.round(w.hours * 10) / 10}h` : '0') : ''}</span>
                  <span className={clsx('w-full rounded-t-[3px]', !w ? 'animate-pulse bg-subtle' : i === all.length - 1 ? 'bg-azure-strong' : 'bg-azure')}
                    style={{ height: w ? Math.max(2, Math.round((w.hours / maxH) * 100)) : 40 }} title={w ? `${hm(w.hours)} · ${w.lessons} lessons` : undefined} />
                  <span className="text-[11px] text-muted">{w?.week ?? ''}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-white p-[18px]">
            <div className="flex items-baseline justify-between"><h2 className="text-[16px] font-bold text-navy">Activity by course</h2><span className="text-[12.5px] text-muted">lessons, practice and quizzes each month</span></div>
            {!act ? <div className="mt-3 h-24 animate-pulse rounded bg-subtle" /> : act.rows.length ? (
              <div className="mt-3 flex flex-col gap-1.5 overflow-x-auto">
                <div className="flex min-w-[560px] items-center gap-2.5 text-[11px] text-muted"><span className="w-[210px] shrink-0" /><span className="grid flex-1 grid-cols-12 gap-1">{act.months.map(m => <span key={m.key} className="text-center">{m.label}</span>)}</span></div>
                {act.rows.map(r => (
                  <div key={r.courseId} className="flex min-w-[560px] items-center gap-2.5 text-[13px] text-navy">
                    <span className="w-[210px] shrink-0 truncate" title={r.title}>{r.title}</span>
                    <span className="grid flex-1 grid-cols-12 gap-1">{r.cells.map(c => <span key={c.month} title={`${c.total} done`} className={clsx('h-3.5 rounded-[3px]', SHADES[level(c.total)])} />)}</span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-3 text-[13px] text-ink2">Your activity shows here once you start a lesson.</p>}
          </section>

          <section className="rounded-lg border border-line bg-white">
            <h2 className="border-b border-line px-[18px] py-3.5 text-[16px] font-bold text-navy">Your courses</h2>
            {!g ? <div className="m-4 h-24 animate-pulse rounded bg-subtle" /> : g.courses.length ? g.courses.map(c => {
              const q = scoreOf(c.id);
              return (
                <Link key={c.id} href={`/student/learn/${c.id}`} className="flex items-center gap-3.5 border-b border-line px-[18px] py-3 text-[13.5px] last:border-b-0 hover:bg-subtle">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-navy">{c.title}</p>
                    <span className="mt-1.5 block h-1.5 rounded-[3px] bg-subtle"><span className="block h-1.5 rounded-[3px] bg-azure" style={{ width: `${c.progress}%` }} /></span>
                  </div>
                  <span className="w-[100px] shrink-0 text-right text-[12.5px] text-muted">{c.progress >= 100 ? 'finished' : `${c.progress}% done`}</span>
                  <span className="w-[70px] shrink-0 text-right font-bold text-navy" title="Average quiz score">{q != null ? `${q}%` : '—'}</span>
                </Link>
              );
            }) : <p className="px-[18px] py-8 text-center text-[13px] text-ink2">No courses yet. <Link href="/student/catalogue" className="font-semibold text-azure-strong hover:underline">Browse the catalogue</Link></p>}
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
          <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-4">
            <h3 className="text-[15px] font-semibold text-navy">Points and badges</h3>
            <p className="text-[24px] font-extrabold text-navy">{g ? `${g.xpTotal.toLocaleString('en-GB')} XP` : '—'}</p>
            <p className="text-[13px] text-ink2">{g ? `${g.streak}-day streak · ${g.badges.length} badge${g.badges.length === 1 ? '' : 's'}` : ' '}</p>
            {!!g?.badges.length && <div className="flex flex-wrap gap-1.5">{g.badges.map((b, i) => <span key={i} className="rounded bg-accent-soft px-2 py-1 text-[12px] font-semibold text-navy">{BADGES[b.badge] ?? b.badge.toLowerCase().replace(/_/g, ' ')}</span>)}</div>}
            <Link href="/student/leaderboard" className="text-[13px] font-semibold text-azure-strong hover:underline">See the leaderboard</Link>
          </section>
          <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
            <h3 className="text-[15px] font-semibold text-navy">Recent points</h3>
            {!g ? <div className="h-24 animate-pulse rounded bg-subtle" /> : g.recentXP.length ? g.recentXP.slice(0, 8).map(x => (
              <p key={x.id} className="flex justify-between gap-2 text-[13px] text-navy"><span>{XP[x.type] ?? x.type.toLowerCase().replace(/_/g, ' ')}</span><strong>+{x.points}</strong></p>
            )) : <p className="text-[13px] text-ink2">Finish a lesson to earn your first points.</p>}
          </section>
          <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
            <h3 className="text-[15px] font-semibold text-navy">Keep going</h3>
            <p className="text-[13px] text-ink2">See every quiz you’ve taken and what to revise in Quiz history.</p>
            <Link href="/student/quiz-history" className="text-[13px] font-semibold text-azure-strong hover:underline">Quiz history</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
