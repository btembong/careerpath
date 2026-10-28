'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { StudyHeatmap } from '@/components/learning/StudyHeatmap';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';

/* ─── Types (shapes returned by the student endpoints) ────────────────────── */

interface Package { id: string; name: string; expiresAt?: string | null; }
interface Me { email: string; firstName?: string | null; name?: string | null; activePackages?: Package[]; }
interface Stats { totalCourses: number; completedCourses: number; streak: number; }
interface WeekHours { week: string; hours: number; lessons: number; }
interface CourseProgress {
  courseId: string; courseTitle: string; percentComplete?: number; certificateEarned?: boolean;
  lessonsCompleted?: number; totalLessons?: number; quizzesPassed?: number; totalQuizzes?: number;
  assignmentsGraded?: number; totalAssignments?: number;
}
interface LastLesson { courseId: string; courseTitle?: string; lessonId?: string; lessonTitle?: string; pct?: number; }
interface LiveSession { id: string; title: string; scheduledAt: string; status?: string; durationMins?: number | null; }
interface Assignment { id: string; title: string; dueAt?: string | null; dueDate?: string | null; status?: string; course?: { title?: string }; cohort?: { name?: string }; }
interface Leader { id: string; name: string; xpTotal: number; rank: number; }

/* ─── Icons and shared styles ─────────────────────────────────────────────── */

const P = {
  play:  'M8 5v14l11-7z',
  book:  'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  video: 'M3 6h12v12H3zM15 10l6-3v10l-6-3',
  badge: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14l-1.5 7 5-3 5 3-1.5-7',
  alert: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v5M12 16.5v.01',
  flame: 'M12 3c1 3 4 5 4 9a4 4 0 0 1-8 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 0-8z',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  ring:  'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14z',
};
function Glyph({ d, size = 16, fill = 'none', className, strokeWidth = 1.6 }: { d: string; size?: number; fill?: string; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d={d} />
    </svg>
  );
}

const card = 'flex flex-col gap-3.5 rounded-lg border border-line bg-white p-[18px]';
const h2 = 'flex items-center gap-2 text-base font-bold text-navy';
const count = 'inline-flex h-5 min-w-5 items-center justify-center rounded bg-accent-soft px-1.5 text-[11.5px] font-bold text-navy';
const label = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-muted';
const btn = 'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors';
const btnPrimary = `${btn} h-9 px-4 text-[13.5px] border border-azure-strong bg-azure-strong text-on-accent hover:brightness-95`;
const btnSecondary = `${btn} h-9 px-4 text-[13.5px] border border-line bg-white text-navy hover:bg-subtle`;
const btnSecondarySm = `${btn} h-8 px-3 text-[13px] border border-line bg-white text-navy hover:bg-subtle`;
const btnPrimarySm = `${btn} h-8 px-3 text-[13px] border border-azure-strong bg-azure-strong text-on-accent hover:brightness-95`;
const link = 'text-[13px] font-semibold text-azure-strong hover:underline';

const ONBOARD_STEPS = [
  { title: 'Welcome to your dashboard', body: 'Your next lesson, what is due, and how your courses are going, on one page.' },
  { title: 'Pick up where you left off', body: 'Continue learning takes you straight back to your last lesson.' },
  { title: 'Never miss a deadline', body: 'Up next lists overdue work, live classes and what is coming, with a button for each.' },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function StudentDashboard() {
  const { user } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [weekly, setWeekly] = useState<WeekHours[]>([]);
  const [courses, setCourses] = useState<CourseProgress[]>([]);
  const [lastLesson, setLastLesson] = useState<LastLesson | null>(null);
  const [live, setLive] = useState<LiveSession[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [hasCohort, setHasCohort] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [onboardStep, setOnboardStep] = useState<number | null>(null);

  // Focus timer
  const [pomMode, setPomMode] = useState<'idle' | 'work' | 'break'>('idle');
  const [pomSeconds, setPomSeconds] = useState(25 * 60);
  const [pomSessions, setPomSessions] = useState(0);

  useEffect(() => {
    Promise.all([
      api.get('/auth/me').then(r => setMe(r.data)).catch(() => setLoadError(true)),
      api.get('/portals/student/stats').then(r => setStats(r.data)).catch(() => {}),
      api.get('/portals/student/weekly-hours').then(r => setWeekly(r.data ?? [])).catch(() => {}),
      api.get('/portals/student/certificate-progress').then(r => setCourses(r.data ?? [])).catch(() => {}),
      api.get('/portals/student/last-lesson').then(r => setLastLesson(r.data ?? null)).catch(() => {}),
      api.get('/live/student/upcoming').then(r => setLive(r.data ?? [])).catch(() => {}),
      api.get('/education/assignments/mine').then(r => setAssignments((r.data ?? []).filter((a: Assignment) => a.status === 'NOT_SUBMITTED'))).catch(() => {}),
    ]).finally(() => setLoading(false));

    api.get('/portals/student/cohorts').then(r => {
      const cohortId: string | undefined = r.data?.[0]?.id;
      setHasCohort(!!cohortId);
      if (cohortId) {
        api.get(`/gamification/leaderboard/${cohortId}`)
          .then(lb => setLeaders((lb.data ?? []).slice(0, 5)))
          .catch(() => {});
      }
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (pomMode === 'idle') return;
    const id = setInterval(() => {
      setPomSeconds(s => {
        if (s > 1) return s - 1;
        if (pomMode === 'work') { setPomSessions(n => n + 1); setPomMode('break'); return 5 * 60; }
        setPomMode('idle');
        return 25 * 60;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [pomMode]);

  useEffect(() => {
    if (loading) return;
    try { if (!localStorage.getItem('cpa_onboarded')) setTimeout(() => setOnboardStep(0), 800); } catch {}
  }, [loading]);

  function nextOnboard() {
    if (onboardStep === null) return;
    if (onboardStep < ONBOARD_STEPS.length - 1) setOnboardStep(onboardStep + 1);
    else { setOnboardStep(null); try { localStorage.setItem('cpa_onboarded', '1'); } catch {} }
  }
  function skipOnboard() { setOnboardStep(null); try { localStorage.setItem('cpa_onboarded', '1'); } catch {} }

  if (loading) return (
    <div className="flex min-h-full flex-col">
      <Topbar />
      <div className="space-y-5 p-4 lg:px-7 lg:py-6">
        <div className="h-14 w-72 rounded-md bg-white animate-pulse" />
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-28 rounded-lg border border-line bg-white animate-pulse" />)}
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="h-80 rounded-lg border border-line bg-white animate-pulse" />
          <div className="h-80 rounded-lg border border-line bg-white animate-pulse" />
        </div>
      </div>
    </div>
  );

  if (loadError && !me) return (
    <div className="flex min-h-full flex-col">
      <Topbar />
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <p className="text-base font-bold text-navy">Your dashboard didn&apos;t load</p>
        <p className="mt-1 text-sm text-ink2">Check your connection, then refresh the page.</p>
        <button type="button" onClick={() => window.location.reload()} className={clsx(btnPrimary, 'mt-5')}>Refresh</button>
      </div>
    </div>
  );

  /* ── Derived ── */
  const now = new Date();
  const firstName = me?.firstName ?? me?.name?.split(' ')[0] ?? user?.name?.split(' ')[0] ?? me?.email?.split('@')[0] ?? 'there';
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const dateLabel = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const streak = stats?.streak ?? 0;

  const dueOf = (a: Assignment) => a.dueAt ?? a.dueDate ?? null;
  const overdue = assignments.filter(a => { const d = dueOf(a); return d && new Date(d) < now; });
  const upcomingLive = live
    .filter(s => s.status === 'ACTIVE' || new Date(s.scheduledAt) > now)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const nextLive = upcomingLive[0];
  const expiring = (me?.activePackages ?? []).filter(p =>
    p.expiresAt && new Date(p.expiresAt) > now && new Date(p.expiresAt).getTime() - now.getTime() < 7 * 86400000);

  const unfinished = courses.filter(c => !c.certificateEarned && (c.percentComplete ?? 0) < 100);
  const inProgress = unfinished.filter(c => (c.percentComplete ?? 0) > 0);
  const certificates = courses.filter(c => c.certificateEarned);
  const thisWeekHours = weekly.length ? weekly[weekly.length - 1].hours : 0;
  // Resume the last lesson unless that course is finished; then the furthest-along unfinished course
  const lastCourseDone = lastLesson ? (courses.find(c => c.courseId === lastLesson.courseId)?.percentComplete ?? 0) >= 100 : true;
  const fallback = [...unfinished].sort((a, b) => (b.percentComplete ?? 0) - (a.percentComplete ?? 0))[0];
  const resume = lastLesson && !lastCourseDone ? lastLesson
    : fallback ? { courseId: fallback.courseId, courseTitle: fallback.courseTitle, pct: fallback.percentComplete } as LastLesson : null;
  const resumeCourse = resume ? courses.find(c => c.courseId === resume.courseId) : undefined;
  const resumeHref = resume
    ? resume.lessonId ? `/student/learn/${resume.courseId}/lesson/${resume.lessonId}` : `/student/learn/${resume.courseId}`
    : '/student/catalogue';
  const nextCert = fallback;

  const fmtHours = (h: number) => {
    const mins = Math.round(h * 60);
    return mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`;
  };
  const day = (iso: string) => new Date(iso);

  const statCards = [
    { label: 'Courses in progress', value: String(inProgress.length), sub: `of ${courses.length} course${courses.length === 1 ? '' : 's'}`, d: P.book },
    { label: 'Study time this week', value: fmtHours(thisWeekHours), sub: 'Real watching only', d: P.clock },
    {
      label: 'Next live class',
      value: nextLive ? day(nextLive.scheduledAt).toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' + day(nextLive.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'None',
      sub: nextLive?.title ?? 'Nothing scheduled', d: P.video,
    },
    { label: 'Certificates', value: String(certificates.length), sub: certificates[0]?.courseTitle ?? 'Finish a course to earn one', d: P.badge },
  ];

  type AgendaItem = { key: string; at: Date; kind: string; tone: 'error' | 'accent' | 'muted'; title: string; meta: string; action?: { label: string; href: string } };
  const agenda: AgendaItem[] = [
    ...assignments.filter(a => dueOf(a)).map(a => {
      const due = new Date(dueOf(a)!);
      const late = due < now;
      return {
        key: 'a' + a.id, at: due, kind: late ? 'Overdue assignment' : 'Assignment due', tone: late ? 'error' as const : 'muted' as const,
        title: a.title,
        meta: `${a.course?.title ?? a.cohort?.name ?? 'Assignment'} · ${late ? 'was due' : 'due'} ${due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`,
        action: { label: 'Submit', href: '/student/assignments' },
      };
    }),
    ...upcomingLive.map(s => ({
      key: 'l' + s.id, at: new Date(s.scheduledAt), kind: s.status === 'ACTIVE' ? 'Live now' : 'Live class', tone: 'accent' as const,
      title: s.title,
      meta: new Date(s.scheduledAt).toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) + (s.durationMins ? ` · ${s.durationMins} min` : ''),
      action: { label: 'Join', href: '/student/live' },
    })),
  ].sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, 5);

  const pomDisplay = `${String(Math.floor(pomSeconds / 60)).padStart(2, '0')}:${String(pomSeconds % 60).padStart(2, '0')}`;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar />

      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">

        {/* Greeting */}
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted">{dateLabel}</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.01em] text-navy">{greeting}, {firstName}</h1>
          </div>
          {streak > 0 && (
            <span className="inline-flex h-7 items-center gap-1.5 rounded bg-accent-soft px-2.5 text-[12.5px] font-semibold text-navy">
              <Glyph d={P.flame} size={14} strokeWidth={1.8} /> {streak}-day streak
            </span>
          )}
          <Link href="/student/calendar" className={btnSecondary}>Study calendar</Link>
          <Link href={resumeHref} className={btnPrimary}>
            <Glyph d={P.play} size={14} fill="currentColor" /> {resume ? 'Resume lesson' : 'Find a course'}
          </Link>
        </div>

        {/* One alert line, only when something needs action */}
        {(overdue.length > 0 || expiring.length > 0) && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-4 py-3">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-red-50 text-error">
              <Glyph d={P.alert} size={16} strokeWidth={1.8} />
            </span>
            <p className="min-w-0 flex-1 text-[13.5px] text-ink2">
              {overdue.length > 0 ? (
                <><strong className="text-navy">{overdue.length} assignment{overdue.length === 1 ? ' is' : 's are'} overdue.</strong> Submit before your teacher closes submissions.</>
              ) : (
                <><strong className="text-navy">{expiring[0].name}</strong> ends on {new Date(expiring[0].expiresAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. Renew to keep your access.</>
              )}
            </p>
            <Link href={overdue.length > 0 ? '/student/assignments' : '/packages'} className={btnSecondarySm}>
              {overdue.length > 0 ? 'View assignments' : 'Renew'}
            </Link>
          </div>
        )}

        {/* Stats */}
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          {statCards.map(s => (
            <div key={s.label} className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
              <div className="flex items-center justify-between">
                <p className={label}>{s.label}</p>
                <span className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-subtle text-ink2"><Glyph d={s.d} /></span>
              </div>
              <p className="text-2xl font-extrabold tracking-[-0.01em] text-navy">{s.value}</p>
              <p className="truncate text-[12.5px] text-muted">{s.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">

          {/* ── Main column ── */}
          <div className="flex min-w-0 flex-col gap-5">

            <section className={card}>
              <div className="flex items-center justify-between gap-3">
                <h2 className={h2}>Continue learning</h2>
                {resume && <Link href={`/student/learn/${resume.courseId}`} className={link}>Open course</Link>}
              </div>
              {resume ? (
                <>
                  <div className="flex items-center gap-3.5">
                    <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-azure-strong">
                      <Glyph d={P.play} size={22} fill="currentColor" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-[12.5px] text-muted">{resume.courseTitle}</p>
                      <p className="mt-0.5 truncate text-base font-bold text-navy">{resume.lessonTitle ?? 'Start the next lesson'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-subtle">
                      <div className="h-1.5 bg-azure" style={{ width: `${resume.pct ?? 0}%` }} />
                    </div>
                    <span className="text-[12.5px] text-ink2">{resume.pct ?? 0}% of the course</span>
                  </div>
                  {resumeCourse && (
                    <dl className="grid grid-cols-3 overflow-hidden rounded-md border border-line">
                      {[
                        ['Lessons', `${resumeCourse.lessonsCompleted ?? 0} of ${resumeCourse.totalLessons ?? 0}`],
                        ['Quizzes passed', `${resumeCourse.quizzesPassed ?? 0} of ${resumeCourse.totalQuizzes ?? 0}`],
                        ['Course progress', `${resumeCourse.percentComplete ?? 0}%`],
                      ].map(([l, v]) => (
                        <div key={l} className="-mr-px border-r border-line px-3 py-2.5">
                          <dt className="text-[11.5px] text-muted">{l}</dt>
                          <dd className="mt-0.5 text-[13.5px] font-semibold text-navy">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Link href={resumeHref} className={btnPrimary}>Resume</Link>
                    <Link href={resumeHref} className={btnSecondary}>Practice</Link>
                  </div>
                </>
              ) : (
                <div className="flex flex-wrap items-center gap-3">
                  <p className="flex-1 text-[13.5px] text-ink2">You haven&apos;t started a course yet. Browse the catalogue to find one for your exam.</p>
                  <Link href="/student/catalogue" className={btnPrimary}>Browse courses</Link>
                </div>
              )}
            </section>

            <section className={card}>
              <div className="flex items-center justify-between">
                <h2 className={h2}>Your courses {courses.length > 0 && <span className={count}>{courses.length}</span>}</h2>
                <Link href="/student/courses" className={link}>All courses</Link>
              </div>
              {courses.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-[13.5px]">
                    <thead>
                      <tr className="text-left">
                        {['Course', 'Progress', 'Lessons', 'Status'].map(h => (
                          <th key={h} className={clsx(label, 'border-b border-line py-2 pr-3 font-semibold', h === 'Progress' && 'w-[30%]')}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {courses.slice(0, 6).map(c => {
                        const pct = c.percentComplete ?? 0;
                        const done = c.certificateEarned || pct >= 100;
                        return (
                          <tr key={c.courseId}>
                            <td className="border-b border-line py-3 pr-3 font-semibold text-navy">
                              <Link href={`/student/learn/${c.courseId}`} className="hover:text-azure-strong">{c.courseTitle}</Link>
                            </td>
                            <td className="border-b border-line py-3 pr-3">
                              <div className="flex items-center gap-2.5">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-subtle">
                                  <div className="h-1.5 bg-azure" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="min-w-[34px] text-[12.5px] text-ink2">{pct}%</span>
                              </div>
                            </td>
                            <td className="border-b border-line py-3 pr-3 text-ink2">{c.lessonsCompleted ?? 0} of {c.totalLessons ?? 0}</td>
                            <td className="border-b border-line py-3">
                              <span className={clsx('inline-flex h-6 items-center rounded px-2 text-xs font-semibold',
                                done ? 'border border-line bg-subtle text-ink2' : 'bg-accent-soft text-navy')}>
                                {done ? 'Completed' : pct > 0 ? 'In progress' : 'Not started'}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-[13.5px] text-ink2">Courses you buy, or get through a package or school, appear here.</p>
              )}
            </section>

            <StudyHeatmap />
          </div>

          {/* ── Right column ── */}
          <div className="flex min-w-0 flex-col gap-5">

            <section className={card}>
              <h2 className={h2}>Up next {agenda.length > 0 && <span className={count}>{agenda.length}</span>}</h2>
              {agenda.length ? (
                <ul>
                  {agenda.map(a => (
                    <li key={a.key} className="flex gap-3 border-t border-line py-3">
                      <span className="w-10 flex-shrink-0 rounded-md border border-line py-1 text-center">
                        <span className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted">{a.at.toLocaleDateString('en-US', { month: 'short' })}</span>
                        <span className="block text-base font-extrabold text-navy">{String(a.at.getDate()).padStart(2, '0')}</span>
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={clsx('text-[11.5px] font-semibold uppercase tracking-[0.04em]',
                          a.tone === 'error' ? 'text-error' : a.tone === 'accent' ? 'text-azure-strong' : 'text-muted')}>{a.kind}</p>
                        <p className="mt-0.5 text-[13.5px] font-semibold text-navy">{a.title}</p>
                        <p className="mt-0.5 truncate text-[12.5px] text-muted">{a.meta}</p>
                      </div>
                      {a.action && <Link href={a.action.href} className={clsx(btnSecondarySm, 'self-center')}>{a.action.label}</Link>}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-[13.5px] text-ink2">Nothing due and no live classes scheduled.</p>
              )}
            </section>

            {hasCohort && (
              <section className={card}>
                <div className="flex items-center justify-between">
                  <h2 className={h2}>Cohort leaderboard</h2>
                  <Link href="/student/leaderboard" className={link}>Full board</Link>
                </div>
                {leaders.length ? (
                  <ol className="flex flex-col gap-0.5">
                    {leaders.map(p => {
                      const isYou = p.id === user?.id;
                      const initials = p.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
                      return (
                        <li key={p.id} className={clsx('flex items-center gap-2.5 rounded-md px-2 py-1.5', isYou && 'bg-accent-soft')}>
                          <span className="w-[18px] text-[12.5px] font-bold text-muted">{p.rank}</span>
                          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-subtle text-[11.5px] font-bold text-ink2">{initials}</span>
                          <span className={clsx('flex-1 truncate text-[13.5px] text-navy', isYou ? 'font-bold' : 'font-medium')}>{p.name}{isYou && ' (you)'}</span>
                          <span className="text-[12.5px] font-semibold text-ink2">{p.xpTotal.toLocaleString()} XP</span>
                        </li>
                      );
                    })}
                  </ol>
                ) : (
                  <p className="text-[13.5px] text-ink2">Points appear as your cohort completes lessons and quizzes.</p>
                )}
              </section>
            )}

            <section className={card}>
              <div className="flex items-center justify-between">
                <h2 className={h2}>Focus timer</h2>
                <span className="text-[12.5px] text-muted">
                  {pomMode === 'break' ? 'Break' : `${pomSessions} session${pomSessions === 1 ? '' : 's'} today`}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <p className="text-[34px] font-extrabold tracking-[-0.02em] text-navy tabular-nums" aria-live="polite">{pomDisplay}</p>
                <div className="ml-auto flex gap-2">
                  {pomMode === 'idle' ? (
                    <button type="button" onClick={() => { setPomSeconds(25 * 60); setPomMode('work'); }} className={btnPrimarySm}>Start focus</button>
                  ) : (
                    <button type="button" onClick={() => setPomMode('idle')} className={btnPrimarySm}>Pause</button>
                  )}
                  <button type="button" onClick={() => { setPomMode('idle'); setPomSeconds(25 * 60); }} className={btnSecondarySm}>Reset</button>
                </div>
              </div>
            </section>

            {nextCert && (
              <section className={card}>
                <h2 className={h2}>Next certificate</h2>
                <p className="-mt-1.5 text-[13px] text-ink2">{nextCert.courseTitle}</p>
                <ul className="flex flex-col gap-2">
                  {[
                    { l: 'lessons complete', done: nextCert.lessonsCompleted ?? 0, total: nextCert.totalLessons ?? 0 },
                    { l: 'quizzes passed', done: nextCert.quizzesPassed ?? 0, total: nextCert.totalQuizzes ?? 0 },
                    { l: 'assignments graded', done: nextCert.assignmentsGraded ?? 0, total: nextCert.totalAssignments ?? 0 },
                  ].filter(i => i.total > 0).map(i => {
                    const ok = i.done >= i.total;
                    return (
                      <li key={i.l} className={clsx('flex items-center gap-2.5 text-[13.5px]', ok ? 'text-azure-strong' : 'text-ink2')}>
                        <Glyph d={ok ? P.check : P.ring} strokeWidth={2} />
                        {i.done} of {i.total} {i.l}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* First-visit tour */}
      {onboardStep !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/30 p-4" role="dialog" aria-modal="true" aria-labelledby="tour-title">
          <div className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-card-lg">
            <p className="text-xs text-muted">Step {onboardStep + 1} of {ONBOARD_STEPS.length}</p>
            <h2 id="tour-title" className="mt-1 text-[17px] font-bold text-navy">{ONBOARD_STEPS[onboardStep].title}</h2>
            <p className="mt-1.5 text-sm text-ink2">{ONBOARD_STEPS[onboardStep].body}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={skipOnboard} className={btnSecondarySm}>Skip</button>
              <button type="button" onClick={nextOnboard} className={btnPrimarySm}>
                {onboardStep < ONBOARD_STEPS.length - 1 ? 'Next' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
