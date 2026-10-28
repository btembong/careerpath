'use client';
import { useEffect, useState } from 'react';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { clsx } from 'clsx';
import { toast } from 'sonner';
import { Topbar } from '@/components/layout/Topbar';
import { StudyHeatmap } from '@/components/learning/StudyHeatmap';
import api from '@/lib/api';

interface Stats {
  totalCourses: number;
  completedCourses: number;
  totalLessons: number;
  completedLessons: number;
  avgQuizScore: number;
  studyHours: number;
  streak: number;
  certificates?: number;
}
interface WeeklyPoint { week: string; hours: number; lessons: number; }
interface QuizScore { courseTitle?: string; score?: number; }
interface ActivityItem { name: string; action: string; target: string; timestamp: string; }

const P = {
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  quiz:  'M4 4h16v16H4zM8 12l3 3 5-6',
  flame: 'M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z',
  badge: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14l-1.5 7 5-3 5 3-1.5-7',
  book:  'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6',
  play:  'M8 5v14l11-7z',
  half:  'M12 21a9 9 0 1 0 0-18v18z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  grad:  'M2 9l10-5 10 5-10 5zM6 11v5c3 2 9 2 12 0v-5',
  lock:  'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
};
function Glyph({ d, size = 16, className }: { d: string; size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d={d} />
    </svg>
  );
}

const card = 'flex flex-col gap-3.5 rounded-lg border border-line bg-white p-[18px]';
const h2 = 'text-base font-bold text-navy';
const label = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-muted';

function Bar1({ pct }: { pct: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-[3px] bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-1.5 bg-azure transition-[width] duration-500" style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
  );
}

export default function ProgressPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [weekly, setWeekly] = useState<WeeklyPoint[]>([]);
  const [quizzes, setQuizzes] = useState<QuizScore[]>([]);
  const [feed, setFeed] = useState<ActivityItem[]>([]);
  const [certCount, setCertCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/portals/student/stats').then(r => setStats(r.data)).catch(() => {}),
      api.get('/portals/student/quiz-scores').then(r => setQuizzes(r.data ?? [])).catch(() => {}),
      api.get('/portals/student/weekly-hours').then(r => setWeekly(r.data ?? [])).catch(() => {}),
      api.get('/certificates').then(r => setCertCount((r.data ?? []).length)).catch(() => {}),
    ]).finally(() => setLoading(false));
    api.get('/portals/student/activity-feed').then(r => setFeed((r.data ?? []).slice(0, 6))).catch(() => {});
  }, []);

  function exportCSV() {
    const rows = [['Week', 'Hours', 'Lessons completed'], ...weekly.map(w => [w.week, w.hours, w.lessons])];
    const blob = new Blob([rows.map(r => r.join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'study_progress.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported your weekly study hours');
  }

  const actions = (
    <button type="button" onClick={exportCSV}
      className="inline-flex h-9 items-center gap-2 rounded-md border border-line bg-white px-3.5 text-[13px] font-semibold text-navy hover:bg-subtle transition-colors">
      Export CSV
    </button>
  );

  if (loading) return (
    <div className="flex min-h-full flex-col">
      <Topbar title="My Progress" subtitle="Study time, completion and quiz results" />
      <div className="grid gap-4 p-4 lg:px-7 lg:py-6 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-28 rounded-lg border border-line bg-white animate-pulse" />)}
      </div>
    </div>
  );

  const certificates = stats?.certificates ?? certCount;
  const coursePct = stats ? Math.round((stats.completedCourses / Math.max(stats.totalCourses, 1)) * 100) : 0;
  const lessonPct = stats ? Math.round((stats.completedLessons / Math.max(stats.totalLessons, 1)) * 100) : 0;
  const thisWeek = weekly.length ? weekly[weekly.length - 1].hours : 0;
  const fmtHours = (h: number) => { const m = Math.round(h * 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };

  const statCards = [
    { label: 'Study time', value: fmtHours(stats?.studyHours ?? 0), sub: `${fmtHours(thisWeek)} this week`, d: P.clock },
    { label: 'Average quiz score', value: `${stats?.avgQuizScore ?? 0}%`, sub: 'Best attempt per quiz', d: P.quiz },
    { label: 'Day streak', value: String(stats?.streak ?? 0), sub: 'Days in a row', d: P.flame },
    { label: 'Certificates', value: String(certificates), sub: 'Earned so far', d: P.badge },
  ];

  const s = stats;
  const achievements = [
    { label: 'Enrolled', hint: 'Start your first course', earned: (s?.totalCourses ?? 0) > 0, d: P.book },
    { label: 'First lesson', hint: 'Complete a lesson', earned: (s?.completedLessons ?? 0) > 0, d: P.play },
    { label: 'Halfway', hint: 'Finish half of your lessons', earned: lessonPct >= 50, d: P.half },
    { label: 'Course complete', hint: 'Finish every lesson in a course', earned: (s?.completedCourses ?? 0) > 0, d: P.check },
    { label: 'Certified', hint: 'Earn a certificate', earned: certificates > 0, d: P.badge },
    { label: '3-day streak', hint: 'Study three days in a row', earned: (s?.streak ?? 0) >= 3, d: P.flame },
    { label: 'Week streak', hint: 'Study seven days in a row', earned: (s?.streak ?? 0) >= 7, d: P.flame },
    { label: 'Scholar', hint: 'Take three or more courses', earned: (s?.totalCourses ?? 0) >= 3, d: P.grad },
  ];
  const earned = achievements.filter(a => a.earned).length;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="My Progress" subtitle="Study time, completion and quiz results" actions={actions} />

      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">

        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          {statCards.map(c => (
            <div key={c.label} className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
              <div className="flex items-center justify-between">
                <p className={label}>{c.label}</p>
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-subtle text-ink2"><Glyph d={c.d} /></span>
              </div>
              <p className="text-2xl font-extrabold tracking-[-0.01em] text-navy">{c.value}</p>
              <p className="text-[12.5px] text-muted">{c.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-5 md:grid-cols-2">
          {[
            { title: 'Course completion', pct: coursePct, sub: `${s?.completedCourses ?? 0} of ${s?.totalCourses ?? 0} courses finished` },
            { title: 'Lesson completion', pct: lessonPct, sub: `${s?.completedLessons ?? 0} of ${s?.totalLessons ?? 0} lessons finished` },
          ].map(c => (
            <section key={c.title} className={card}>
              <div className="flex items-baseline justify-between">
                <h2 className={h2}>{c.title}</h2>
                <span className="rounded bg-accent-soft px-1.5 py-0.5 text-xs font-bold text-navy">{c.pct}%</span>
              </div>
              <Bar1 pct={c.pct} />
              <p className="text-[13px] text-ink2">{c.sub}</p>
            </section>
          ))}
        </div>

        <section className={card}>
          <div>
            <h2 className={h2}>Weekly study time</h2>
            <p className="mt-0.5 text-[13px] text-muted">Hours of video watched in each of the last 8 weeks</p>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={weekly} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="var(--color-line)" />
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} />
                <Tooltip cursor={{ fill: 'var(--color-subtle)' }}
                  contentStyle={{ border: '1px solid var(--color-line)', borderRadius: 6, boxShadow: 'none', fontSize: 12, background: 'var(--color-white)', color: 'var(--color-navy)' }}
                  formatter={(v) => [`${v} h`, 'Study time']} />
                <Bar dataKey="hours" fill="#5889FA" radius={[3, 3, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>

        <StudyHeatmap />

        <div className="grid items-start gap-5 lg:grid-cols-2">
          <section className={card}>
            <h2 className={h2}>Quiz scores by course</h2>
            {quizzes.length ? (
              <ul className="flex flex-col gap-3.5">
                {quizzes.map(q => (
                  <li key={q.courseTitle} className="flex flex-col gap-1.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="truncate text-[13.5px] font-semibold text-navy">{q.courseTitle ?? 'Course'}</span>
                      <span className="text-[13px] font-semibold text-ink2">{q.score ?? 0}%</span>
                    </div>
                    <Bar1 pct={q.score ?? 0} />
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13.5px] text-ink2">Your scores appear here after your first quiz.</p>
            )}
          </section>

          <section className={card}>
            <div className="flex items-center justify-between">
              <h2 className={h2}>Achievements</h2>
              <span className="text-[12.5px] text-muted">{earned} of {achievements.length} earned</span>
            </div>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {achievements.map(a => (
                <li key={a.label} title={a.earned ? a.label : a.hint}
                  className={clsx('flex flex-col items-center gap-1.5 rounded-md border p-3 text-center',
                    a.earned ? 'border-transparent bg-accent-soft' : 'border-line bg-white')}>
                  <span className={clsx('flex h-8 w-8 items-center justify-center rounded-md',
                    a.earned ? 'bg-white text-azure-strong' : 'bg-subtle text-muted')}>
                    <Glyph d={a.earned ? a.d : P.lock} />
                  </span>
                  <span className={clsx('text-xs font-semibold', a.earned ? 'text-navy' : 'text-muted')}>{a.label}</span>
                </li>
              ))}
            </ul>
          </section>
        </div>

        {feed.length > 0 && (
          <section className={card}>
            <h2 className={h2}>Your classmates this month</h2>
            <ul>
              {feed.map((f, i) => (
                <li key={i} className="flex items-center gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-subtle text-[11.5px] font-bold text-ink2">
                    {f.name.slice(0, 1).toUpperCase()}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-[13.5px] text-ink2">
                    <strong className="font-semibold text-navy">{f.name}</strong> {f.action} <span className="text-navy">{f.target}</span>
                  </p>
                  <span className="text-[12px] text-muted">
                    {new Date(f.timestamp).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
