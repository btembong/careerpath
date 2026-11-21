'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { useTestOverview } from '@/components/tests/TestTiles';
import { StudyHeatmap } from '@/components/learning/StudyHeatmap';
import { FocusMode, focusToday } from '@/components/learning/FocusMode';
import { BigCourseCard, ROW_GRID, cardTitle, type CardCourse } from '@/components/public/course/BigCourseCard';
import { Icon, type IconName } from '@/components/ui/Icon';
import { useAuth } from '@/hooks/useAuth';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

/* ─── Types (shapes returned by the student endpoints) ────────────────────── */

interface Package { id: string; name: string; expiresAt?: string | null; }
interface Me { email: string; firstName?: string | null; name?: string | null; activePackages?: Package[]; programmeInterestIds?: string[] }
interface Stats { totalCourses: number; completedCourses: number; streak: number; }
interface WeekHours { week: string; hours: number; lessons: number; }
interface CourseProgress {
  courseId: string; courseTitle: string; percentComplete?: number; certificateEarned?: boolean;
  lessonsCompleted?: number; totalLessons?: number; quizzesPassed?: number; totalQuizzes?: number;
  assignmentsGraded?: number; totalAssignments?: number;
}
interface LiveSession { id: string; title: string; scheduledAt: string; status?: string; durationMins?: number | null; }
interface Assignment { id: string; title: string; dueAt?: string | null; dueDate?: string | null; status?: string; course?: { title?: string }; cohort?: { name?: string }; }
interface Leader { id: string; name: string; xpTotal: number; rank: number; }
interface Next { id: string; title: string; type: string; durationSecs: number | null; module: string }
interface LibRow {
  id: string; title: string; coverUrl?: string | null; source: string; contentImportedAt?: string | null; programme: string | null; teacher: string | null;
  lessons: number; done: number; pct: number; state: 'going' | 'new' | 'done'; next: Next | null;
  access: { kind: 'package'; packageId: string; name: string } | { kind: 'single' | 'free' | 'website' };
}
interface Library { stats: { courses: number; certificates: number; weekDays?: number[] }; resume: { id: string; title: string; pct: number; next: Next | null } | null; courses: LibRow[] }
/** The public course list: what a card shows */
interface PubCourse {
  id: string; slug: string; title: string; coverUrl: string | null; level?: string | null; topics?: string[]; questions: number; lessons: number; website: boolean; added: string;
  exam: { id: string; name: string } | null; subject: { name: string } | null; selling: CardCourse['selling']; price: CardCourse['price']; inPackage: boolean;
  teacher: { name: string | null; avatarUrl: string | null } | null;
}
interface Teacher { id: string; name: string; avatarUrl?: string | null; subjectAreas: string[]; courseIds: string[] }
interface Booking { status: string; slot: { startsAt: string; endsAt: string; teacher: { id: string } } }

const card = 'flex flex-col gap-3 rounded-2xl border border-line bg-white p-4';
const h2 = 'text-[17px] font-extrabold tracking-[-0.01em] text-navy';
const kicker = 'text-[10.5px] font-extrabold uppercase tracking-[0.07em] text-muted';
const link = 'text-[13px] font-bold text-azure-strong hover:underline';
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
const minutes = (h: number) => Math.round(h * 60);
const fmtTime = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}` : `${m} min`);
const lessonName = (t: string) => t.replace(/^\d+[.)]\s*/, '');
const website = (r: LibRow) => r.source === 'WORDPRESS' && !r.contentImportedAt && r.lessons === 0;
/** Where Continue goes: the next lesson, or the course's overview */
const learnHref = (r: { id: string; next: Next | null }) => (r.next ? `/student/learn/${r.id}/lesson/${r.next.id}` : `/student/learn/${r.id}`);
const DAYS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const GOALS = [5, 10, 15, 20, 30];
const GOAL_KEY = 'cpa:weekGoal';

const ONBOARD_STEPS = [
  { title: 'Welcome to your dashboard', body: 'Your next lesson, your week, and how your courses are going, on one page.' },
  { title: 'Pick up where you left off', body: 'Continue takes you straight back to your next lesson. Set a weekly goal under This week.' },
  { title: 'Study with focus', body: 'Start focus opens a quiet room with a timer, background sound and a study playlist.' },
];

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function StudentDashboard() {
  const router = useRouter();
  const testCentre = useTestOverview();
  const { user } = useAuth();
  const [me, setMe] = useState<Me | null>(null);
  const [lib, setLib] = useState<Library | null>(null);
  const [pub, setPub] = useState<PubCourse[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [weekly, setWeekly] = useState<WeekHours[]>([]);
  const [certs, setCerts] = useState<CourseProgress[]>([]);
  const [live, setLive] = useState<LiveSession[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [booking, setBooking] = useState<Booking | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [hasCohort, setHasCohort] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [onboardStep, setOnboardStep] = useState<number | null>(null);
  const [goal, setGoal] = useState<number | null>(null);
  const [focusOpen, setFocusOpen] = useState(false);
  const [focus, setFocus] = useState({ sessions: 0, minutes: 0 });
  const [warming, setWarming] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/auth/me').then(r => setMe(r.data)).catch(() => setLoadError(true)),
      api.get('/portals/student/library').then(r => setLib(r.data)).catch(() => setLib({ stats: { courses: 0, certificates: 0 }, resume: null, courses: [] })),
      api.get('/portals/student/stats').then(r => setStats(r.data)).catch(() => {}),
      api.get('/portals/student/weekly-hours').then(r => setWeekly(r.data ?? [])).catch(() => {}),
      api.get('/portals/student/certificate-progress').then(r => setCerts(r.data ?? [])).catch(() => {}),
      api.get('/live/student/upcoming').then(r => setLive(r.data ?? [])).catch(() => {}),
      api.get('/education/assignments/mine').then(r => setAssignments((r.data ?? []).filter((a: Assignment) => a.status === 'NOT_SUBMITTED'))).catch(() => {}),
    ]).finally(() => setLoading(false));

    // Cards, teachers and the leaderboard fill in after the page shows
    api.get('/catalogue/course-list').then(r => setPub(r.data?.courses ?? [])).catch(() => {});
    api.get('/teachers', { params: { limit: 100 } }).then(r => setTeachers(r.data?.data ?? r.data ?? [])).catch(() => {});
    api.get('/mentorship/bookings/mine').then(r => setBooking(((r.data ?? []) as Booking[]).filter(b => b.status === 'CONFIRMED' && new Date(b.slot.endsAt).getTime() > Date.now())
      .sort((a, b) => +new Date(a.slot.startsAt) - +new Date(b.slot.startsAt))[0] ?? null)).catch(() => {});
    api.get('/portals/student/cohorts').then(r => {
      const cohortId: string | undefined = r.data?.[0]?.id;
      setHasCohort(!!cohortId);
      if (cohortId) api.get(`/gamification/leaderboard/${cohortId}`).then(lb => setLeaders((lb.data ?? []).slice(0, 5))).catch(() => {});
    }).catch(() => {});

    setFocus(focusToday());
    try { const g = Number(localStorage.getItem(GOAL_KEY)); if (g > 0) setGoal(g); } catch { /* storage blocked */ }
  }, []);

  useEffect(() => {
    if (loading) return;
    try { if (!localStorage.getItem('cpa_onboarded')) setTimeout(() => setOnboardStep(0), 800); } catch { /* storage blocked */ }
  }, [loading]);

  const onSession = useCallback(() => setFocus(focusToday()), []);
  const closeFocus = useCallback(() => { setFocusOpen(false); setFocus(focusToday()); }, []);

  const pubById = useMemo(() => new Map(pub.map(p => [p.id, p])), [pub]);

  function nextOnboard() {
    if (onboardStep === null) return;
    if (onboardStep < ONBOARD_STEPS.length - 1) setOnboardStep(onboardStep + 1);
    else skipOnboard();
  }
  function skipOnboard() { setOnboardStep(null); try { localStorage.setItem('cpa_onboarded', '1'); } catch { /* storage blocked */ } }
  function pickGoal(g: number) { setGoal(g); try { localStorage.setItem(GOAL_KEY, String(g)); } catch { /* storage blocked */ } }
  async function warmup() {
    setWarming(true);
    try { const { data: s } = await api.post('/test-centre/sessions', { preset: 'warmup' }); router.push(`/student/tests/${s.id}`); }
    catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not start. Try again.'); setWarming(false); }
  }

  if (loading) return (
    <div className="flex min-h-full flex-col">
      <Topbar />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <div className="h-[230px] animate-pulse rounded-[18px] bg-[#3F6FE8]/70" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">{[0, 1, 2, 3, 4].map(i => <div key={i} className="h-[104px] animate-pulse rounded-2xl border border-line bg-white" />)}</div>
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-80 animate-pulse rounded-2xl border border-line bg-white" />
          <div className="h-80 animate-pulse rounded-2xl border border-line bg-white" />
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
        <button type="button" onClick={() => window.location.reload()} className="mt-5 inline-flex h-10 items-center rounded-lg bg-azure-strong px-4 text-[14px] font-extrabold text-on-accent">Refresh</button>
      </div>
    </div>
  );

  /* ── Derived ── */
  const now = new Date();
  const streak = stats?.streak ?? 0;
  const rows = lib?.courses ?? [];

  // The one course to continue, here and first among the cards
  const resume = lib?.resume ? rows.find(c => c.id === lib.resume!.id) ?? null : rows.find(c => c.state === 'new' && c.next && !website(c)) ?? null;
  const resumeTitle = resume ? cardTitle(resume.title).title : '';

  // This week: lessons a day, the goal, study time against last week
  const weekDays = lib?.stats.weekDays ?? [0, 0, 0, 0, 0, 0, 0];
  const today = (now.getDay() + 6) % 7;
  const thisWeek = weekDays.reduce((a, b) => a + b, 0);
  const recent = weekly.slice(-5, -1).map(w => w.lessons);
  const suggested = Math.min(30, GOALS.find(g => g >= Math.max(5, Math.ceil((recent.length ? Math.max(...recent) : 0) * 1.2))) ?? 30);
  const weekGoal = goal ?? suggested;
  const toGo = Math.max(0, weekGoal - thisWeek);
  const barMax = Math.max(1, ...weekDays);
  const studyNow = minutes(weekly.at(-1)?.hours ?? 0), studyLast = minutes(weekly.at(-2)?.hours ?? 0);
  const studyDiff = studyNow - studyLast;

  // The next certificate: the course they're continuing, else the furthest along
  const unfinished = certs.filter(c => !c.certificateEarned && (c.percentComplete ?? 0) < 100);
  const nextCert = (resume && unfinished.find(c => c.courseId === resume.id)) ?? [...unfinished].sort((a, b) => (b.percentComplete ?? 0) - (a.percentComplete ?? 0))[0];
  const certCount = lib?.stats.certificates ?? certs.filter(c => c.certificateEarned).length;

  // Continue learning: what they're in the middle of, then what they haven't started
  const toCard = (r: LibRow): CardCourse => {
    const p = pubById.get(r.id);
    return {
      id: r.id, slug: p?.slug ?? r.id, title: r.title, coverUrl: p?.coverUrl ?? r.coverUrl ?? null, exam: r.programme, subject: p?.subject?.name ?? null,
      level: p?.level ?? null, lessons: r.lessons, questions: p?.questions ?? 0, topics: p?.topics ?? [], website: website(r),
      selling: r.access.kind === 'free' || r.access.kind === 'website' ? 'free' : 'paid', price: null,
      teacher: p?.teacher ?? (r.teacher ? { name: r.teacher, avatarUrl: null } : null),
    };
  };
  const continuing = [...rows.filter(r => r.state === 'going'), ...rows.filter(r => r.state === 'new')]
    .sort((a, b) => Number(b.id === resume?.id) - Number(a.id === resume?.id)).slice(0, 4);

  // For your exam: courses for the exams they study (or chose), not started yet
  const mineIds = new Set(rows.map(r => r.id));
  const exams = new Set([...rows.map(r => pubById.get(r.id)?.exam?.id), ...(me?.programmeInterestIds ?? [])].filter(Boolean) as string[]);
  const forExam = pub.filter(p => p.exam && exams.has(p.exam.id) && !mineIds.has(p.id))
    .sort((a, b) => Number(a.website) - Number(b.website)).slice(0, 4);

  // Teachers: whoever teaches their courses, and their mentor
  const yourTeachers: { t: Teacher; role: string }[] = [];
  const mentor = booking ? teachers.find(t => t.id === booking.slot.teacher.id) : undefined;
  if (mentor) yourTeachers.push({ t: mentor, role: `Your mentor · ${new Date(booking!.slot.startsAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` });
  for (const t of teachers) {
    const n = rows.filter(r => t.courseIds?.includes(r.id)).length;
    if (!n || yourTeachers.some(y => y.t.id === t.id)) continue;
    const subject = t.subjectAreas.find(s => !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s));
    yourTeachers.push({ t, role: [subject, `${n} of your courses`.replace(/^1 of your courses$/, 'Your course')].filter(Boolean).join(' · ') });
  }

  // Up next: due work, live classes, a mentor session, a quiz that's next
  const dueOf = (a: Assignment) => a.dueAt ?? a.dueDate ?? null;
  const overdue = assignments.filter(a => { const d = dueOf(a); return d && new Date(d) < now; });
  const expiring = (me?.activePackages ?? []).filter(p =>
    p.expiresAt && new Date(p.expiresAt) > now && new Date(p.expiresAt).getTime() - now.getTime() < 7 * 86400000);
  const upcomingLive = live.filter(s => s.status === 'ACTIVE' || new Date(s.scheduledAt) > now);
  type Item = { key: string; at: number; icon: IconName; title: string; meta: string; tone?: 'error' | 'accent'; action?: { label: string; href: string } };
  const agenda: Item[] = [
    ...assignments.filter(a => dueOf(a)).map(a => {
      const due = new Date(dueOf(a)!), late = due < now;
      return { key: 'a' + a.id, at: due.getTime(), icon: 'assignments' as IconName, tone: late ? 'error' as const : undefined, title: a.title,
        meta: `${late ? 'Overdue · was due' : 'Due'} ${due.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${a.course?.title ? ` · ${cardTitle(a.course.title).title}` : ''}`,
        action: { label: 'Submit', href: '/student/assignments' } };
    }),
    ...upcomingLive.map(s => ({ key: 'l' + s.id, at: new Date(s.scheduledAt).getTime(), icon: 'live' as IconName, tone: 'accent' as const, title: s.title,
      meta: `${s.status === 'ACTIVE' ? 'Live now' : new Date(s.scheduledAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}${s.durationMins ? ` · ${s.durationMins} min` : ''}`,
      action: { label: 'Join', href: '/student/live' } })),
    ...(booking ? [{ key: 'm', at: new Date(booking.slot.startsAt).getTime(), icon: 'calendar' as IconName, title: `Mentor session · ${new Date(booking.slot.startsAt).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}`,
      meta: mentor ? mentor.name : 'Your mentor', action: { label: 'Open', href: '/student/mentorship' } }] : []),
  ].sort((a, b) => a.at - b.at).slice(0, 4);
  if (resume?.next?.type === 'QUIZ') agenda.push({ key: 'q', at: Infinity, icon: 'grade', title: `Quiz: ${lessonName(resume.next.title)}`, meta: resumeTitle, action: { label: 'Start', href: learnHref(resume) } });

  // Practise: weak topics for the warm-up
  const weak = (testCentre?.topics ?? []).filter(t => t.answered > 0).sort((a, b) => a.percent - b.percent).slice(0, 2).map(t => t.topic);
  const practice = !!testCentre && testCentre.total > 0;
  const task = resume?.next ? { title: `${resumeTitle} · ${lessonName(resume.next.title)}`, sub: resume.next.type === 'QUIZ' ? 'Take the quiz' : `${resume.next.type === 'VIDEO' ? 'Watch' : 'Read'} the lesson`, href: learnHref(resume) } : null;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar />

      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">

        <DashboardHero />

        {/* One alert line, only when something needs action */}
        {(overdue.length > 0 || expiring.length > 0) && (
          <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white px-4 py-3">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-red-50 text-error"><Icon name="alert" size={16} /></span>
            <p className="min-w-0 flex-1 text-[13.5px] text-ink2">
              {overdue.length > 0
                ? <><strong className="text-navy">{overdue.length} assignment{overdue.length === 1 ? ' is' : 's are'} overdue.</strong> Submit before your teacher closes submissions.</>
                : <><strong className="text-navy">{expiring[0].name}</strong> ends on {new Date(expiring[0].expiresAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}. Renew to keep your access.</>}
            </p>
            <Link href={overdue.length > 0 ? '/student/assignments' : `/packages/${expiring[0]?.id ?? ''}`} className="inline-flex h-8 items-center rounded-lg border border-line px-3 text-[13px] font-bold text-navy hover:bg-subtle">
              {overdue.length > 0 ? 'View assignments' : 'Renew'}
            </Link>
          </div>
        )}

        {/* The week at a glance */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-[1.2fr_1.1fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-1 rounded-2xl border border-line bg-white px-3.5 py-3">
            <span className={kicker}>This week</span>
            <b className="text-[22px] font-extrabold text-navy">{plural(thisWeek, 'lesson')}</b>
            <span className="h-1.5 overflow-hidden rounded-full bg-subtle"><span className="block h-full rounded-full bg-[linear-gradient(90deg,#3F6FE8,#8EA8FF)]" style={{ width: `${Math.min(100, (thisWeek / weekGoal) * 100)}%` }} /></span>
            <span className="flex flex-wrap items-center gap-x-1 text-[11.5px] text-muted">
              <label className="inline-flex items-center gap-0.5">Goal
                <select aria-label="Weekly goal" value={weekGoal} onChange={e => pickGoal(Number(e.target.value))} className="cursor-pointer rounded bg-transparent font-bold text-navy outline-none hover:bg-subtle">
                  {GOALS.map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              · {toGo ? `${toGo} to go by Sunday` : 'Goal reached'}
            </span>
          </div>
          <div className="flex items-end justify-between gap-1.5 rounded-2xl border border-line bg-white px-3.5 py-3" aria-label="Lessons each day this week">
            {weekDays.map((n, i) => (
              <span key={i} title={`${DAY_NAMES[i]}: ${plural(n, 'lesson')}`} className="flex h-20 flex-1 flex-col items-center justify-end gap-1">
                <i className={clsx('block w-full max-w-[22px] rounded-[5px_5px_2px_2px]', i === today ? 'bg-azure' : i > today ? 'bg-subtle' : 'bg-azure-strong')} style={{ height: n ? 8 + (n / barMax) * 48 : 4 }} />
                <em className={clsx('text-[10.5px] not-italic', i === today ? 'font-extrabold text-navy' : 'text-muted')}>{DAYS[i]}</em>
              </span>
            ))}
          </div>
          <div className="flex flex-col gap-1 rounded-2xl border border-line bg-white px-3.5 py-3">
            <span className={kicker}>Streak</span>
            <b className="flex items-center gap-1.5 text-[22px] font-extrabold text-navy"><Icon name="star" size={18} className="text-[#FFB547]" />{plural(streak, 'day')}</b>
            <span className="text-[11.5px] text-muted">{!streak ? 'Finish a lesson to start one' : weekDays[today] ? 'You studied today' : 'Study today to keep it'}</span>
          </div>
          <div className="flex flex-col gap-1 rounded-2xl border border-line bg-white px-3.5 py-3">
            <span className={kicker}>Study time</span>
            <b className="text-[22px] font-extrabold text-navy">{fmtTime(studyNow)}</b>
            <span className="text-[11.5px] text-muted">this week{weekly.length > 1 ? ` · ${studyDiff === 0 ? 'same as last' : `${fmtTime(Math.abs(studyDiff))} ${studyDiff > 0 ? 'more' : 'less'} than last`}` : ''}</span>
          </div>
          <div className="col-span-2 flex flex-col gap-1 rounded-2xl border border-line bg-white px-3.5 py-3 lg:col-span-1">
            <span className={kicker}>Certificates</span>
            <b className="text-[22px] font-extrabold text-navy">{certCount}</b>
            <span className="truncate text-[11.5px] text-muted">{nextCert ? `${cardTitle(nextCert.courseTitle).title} is ${nextCert.percentComplete ?? 0}% of the way` : 'Finish a course to earn one'}</span>
          </div>
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">

          {/* ── Main column ── */}
          <div className="flex min-w-0 flex-col gap-5">

            <section className="flex flex-col gap-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className={h2}>Continue learning</h2>
                <Link href="/student/courses" className={link}>My courses ({rows.length}) →</Link>
              </div>
              {continuing.length ? (
                <div className="@container"><div className={ROW_GRID}>
                  {continuing.map(c => (
                    <BigCourseCard key={c.id} c={toCard(c)} href={`/student/learn/${c.id}`} onlyIn={c.access.kind === 'package' ? c.access.name : null}
                      mine={website(c) ? null : { pct: c.pct, next: c.next?.title ?? null, href: learnHref(c) }} />
                  ))}
                </div></div>
              ) : (
                <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-white p-4">
                  <p className="min-w-0 flex-1 text-[13.5px] text-ink2">{rows.length ? 'You’ve finished every course you have. Well done.' : 'You haven’t started a course yet. Find one for your exam in the catalogue.'}</p>
                  <Link href="/student/catalogue" className="inline-flex h-9 items-center rounded-lg bg-azure-strong px-3.5 text-[13px] font-extrabold text-on-accent">Browse courses</Link>
                </div>
              )}
            </section>

            {practice && (
              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className={h2}>Practise</h2>
                  <Link href="/student/tests" className={link}>Test Centre →</Link>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <button type="button" onClick={warmup} disabled={warming} className="keep-light flex flex-col gap-1.5 rounded-2xl border border-[#3F6FE8] bg-[linear-gradient(135deg,#2F57C9,#5B82F5)] p-4 text-left text-[12.5px] text-[#EEF3FF] transition hover:brightness-105">
                    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-[#FFFFFF] text-[#2F57C9]"><Icon name="star" size={16} /></span>
                    <b className="text-[15px] text-[#FFFFFF]">Daily warm-up</b>
                    <span>10 questions on your weak topics{weak.length ? `: ${weak.join(', ')}` : ''}</span>
                    <em className="mt-auto pt-1 font-extrabold not-italic text-[#FFFFFF]">{warming ? 'Starting…' : 'Start · 5 min'}</em>
                  </button>
                  <Link href="/student/tests/new" className="flex flex-col gap-1.5 rounded-2xl border border-line bg-white p-4 text-[12.5px] text-muted transition hover:border-azure">
                    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-accent-soft text-azure-strong"><Icon name="grade" size={16} /></span>
                    <b className="text-[15px] text-navy">Create a test</b>
                    <span>Your subjects and topics, up to 150 questions{testCentre!.pools.unused ? ` · ${testCentre!.pools.unused} you haven’t seen` : ''}</span>
                    <em className="mt-auto pt-1 font-extrabold not-italic text-azure-strong">Build one →</em>
                  </Link>
                  <Link href="/student/tests/mocks" className="flex flex-col gap-1.5 rounded-2xl border border-line bg-white p-4 text-[12.5px] text-muted transition hover:border-azure">
                    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] bg-accent-soft text-azure-strong"><Icon name="clock" size={16} /></span>
                    <b className="text-[15px] text-navy">Mock exam</b>
                    <span>Full papers set by your teachers, timed like the real one</span>
                    <em className="mt-auto pt-1 font-extrabold not-italic text-azure-strong">See what’s on →</em>
                  </Link>
                </div>
              </section>
            )}

            <StudyHeatmap />

            {forExam.length > 0 && (
              <section className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <h2 className={h2}>For your exam</h2>
                  <Link href="/student/catalogue" className={link}>Catalogue →</Link>
                </div>
                <div className="@container"><div className={ROW_GRID}>
                  {forExam.map(p => (
                    <BigCourseCard key={p.id} href={`/student/courses/${p.id}`} c={{
                      id: p.id, slug: p.slug, title: p.title, coverUrl: p.coverUrl, exam: p.exam?.name ?? null, subject: p.subject?.name ?? null, level: p.level ?? null,
                      lessons: p.lessons, questions: p.questions, topics: p.topics ?? [], website: p.website, added: p.added, selling: p.selling, price: p.price, inPackage: p.inPackage, teacher: p.teacher,
                    }} />
                  ))}
                </div></div>
              </section>
            )}
          </div>

          {/* ── Side column ── */}
          <div className="flex min-w-0 flex-col gap-4">

            <section className={card}>
              <h2 className="text-[15px] font-extrabold text-navy">Up next</h2>
              {agenda.length ? agenda.map(a => (
                <div key={a.key} className="flex items-center gap-2.5 border-t border-line pt-2.5">
                  <span className={clsx('flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg', a.tone === 'error' ? 'bg-red-50 text-error' : 'bg-accent-soft text-azure-strong')}><Icon name={a.icon} size={15} /></span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <b className="truncate text-[13px] text-navy">{a.title}</b>
                    <span className={clsx('truncate text-[11.5px]', a.tone === 'error' ? 'font-semibold text-error' : 'text-muted')}>{a.meta}</span>
                  </span>
                  {a.action && <Link href={a.action.href} className="text-[12.5px] font-extrabold text-azure-strong hover:underline">{a.action.label}</Link>}
                </div>
              )) : <p className="text-[13px] text-ink2">Nothing due and no live classes scheduled.</p>}
              {!hasCohort && !upcomingLive.length && (
                <div className="flex items-center gap-2.5 border-t border-line pt-2.5">
                  <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-azure-strong"><Icon name="live" size={15} /></span>
                  <span className="flex min-w-0 flex-1 flex-col"><b className="text-[13px] text-navy">No live class yet</b><span className="text-[11.5px] text-muted">A package with a class adds one</span></span>
                  <Link href="/packages" className="text-[12.5px] font-extrabold text-azure-strong hover:underline">See</Link>
                </div>
              )}
            </section>

            {yourTeachers.length > 0 && (
              <section className={card}>
                <h2 className="text-[15px] font-extrabold text-navy">Your teachers</h2>
                {yourTeachers.slice(0, 3).map(({ t, role }) => (
                  <div key={t.id} className="group flex items-center gap-2.5">
                    <Link href={`/student/teachers/${t.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                      <span className="flex h-9 w-9 flex-shrink-0 -rotate-[4deg] items-center justify-center overflow-hidden rounded-[10px] bg-[#FFFDF8] text-[13px] font-extrabold text-[#3F6FE8] transition-transform group-hover:rotate-0">
                        {t.avatarUrl ? <img src={t.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : t.name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()}
                      </span>
                      <span className="flex min-w-0 flex-col"><b className="truncate text-[13px] text-navy group-hover:text-azure-strong">{t.name}</b><span className="truncate text-[11.5px] text-muted">{role}</span></span>
                    </Link>
                    <Link href={`/student/messages?to=${t.id}`} className="text-[12.5px] font-extrabold text-azure-strong hover:underline">Message</Link>
                  </div>
                ))}
                <Link href="/student/teachers" className={link}>All teachers →</Link>
              </section>
            )}

            {nextCert && (
              <section className={card}>
                <h2 className="text-[15px] font-extrabold text-navy">Next certificate</h2>
                <b className="-mt-1 text-[13px] text-ink2">{cardTitle(nextCert.courseTitle).title}</b>
                <ul className="flex flex-col gap-1.5">
                  {[
                    { l: 'lessons', done: nextCert.lessonsCompleted ?? 0, total: nextCert.totalLessons ?? 0 },
                    { l: 'quizzes passed', done: nextCert.quizzesPassed ?? 0, total: nextCert.totalQuizzes ?? 0 },
                    { l: 'assignments graded', done: nextCert.assignmentsGraded ?? 0, total: nextCert.totalAssignments ?? 0 },
                  ].filter(i => i.total > 0).map(i => (
                    <li key={i.l} className={clsx('flex items-center gap-2 text-[12.5px]', i.done >= i.total ? 'text-navy' : 'text-muted')}>
                      <Icon name={i.done >= i.total ? 'checkLine' : 'check'} size={13} className={i.done >= i.total ? 'text-[#1F9D55]' : 'text-muted'} />
                      {i.done} of {i.total} {i.l}
                    </li>
                  ))}
                </ul>
                <span className="h-1.5 overflow-hidden rounded-full bg-subtle"><span className="block h-full rounded-full bg-azure" style={{ width: `${nextCert.percentComplete ?? 0}%` }} /></span>
              </section>
            )}

            {hasCohort && (
              <section className={card}>
                <div className="flex items-center justify-between">
                  <h2 className="text-[15px] font-extrabold text-navy">Cohort leaderboard</h2>
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
                          <span className={clsx('flex-1 truncate text-[13px] text-navy', isYou ? 'font-bold' : 'font-medium')}>{p.name}{isYou && ' (you)'}</span>
                          <span className="text-[12px] font-semibold text-ink2">{p.xpTotal.toLocaleString()} XP</span>
                        </li>
                      );
                    })}
                  </ol>
                ) : <p className="text-[13px] text-ink2">Points appear as your cohort completes lessons and quizzes.</p>}
              </section>
            )}

            <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-white p-4">
              <span className="flex min-w-0 flex-1 flex-col">
                <h2 className="text-[15px] font-extrabold text-navy">Focus</h2>
                <span className="text-[12px] text-muted">{focus.sessions ? `${plural(focus.sessions, 'session')} today · ${focus.minutes} min` : 'A timer, calm sound and a study playlist'}</span>
              </span>
              <button type="button" onClick={() => setFocusOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-azure-strong px-3.5 text-[13px] font-extrabold text-on-accent hover:brightness-95"><Icon name="play" size={13} />Start focus</button>
            </section>
          </div>
        </div>
      </div>

      <FocusMode open={focusOpen} onClose={closeFocus} task={task} onSession={onSession} />

      {/* First-visit tour */}
      {onboardStep !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/30 p-4" role="dialog" aria-modal="true" aria-labelledby="tour-title">
          <div className="w-full max-w-sm rounded-lg border border-line bg-white p-6 shadow-card-lg">
            <p className="text-xs text-muted">Step {onboardStep + 1} of {ONBOARD_STEPS.length}</p>
            <h2 id="tour-title" className="mt-1 text-[17px] font-bold text-navy">{ONBOARD_STEPS[onboardStep].title}</h2>
            <p className="mt-1.5 text-sm text-ink2">{ONBOARD_STEPS[onboardStep].body}</p>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={skipOnboard} className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle">Skip</button>
              <button type="button" onClick={nextOnboard} className="inline-flex h-8 items-center rounded-md bg-azure-strong px-3 text-[13px] font-semibold text-on-accent">
                {onboardStep < ONBOARD_STEPS.length - 1 ? 'Next' : 'Done'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
