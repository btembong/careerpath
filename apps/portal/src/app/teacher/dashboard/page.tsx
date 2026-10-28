'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';

interface Cohort { id: string; name: string; _count?: { students: number } }
interface Wallet { balance: number; currency: string }
interface Submission {
  id: string;
  submittedAt: string;
  student?: { firstName?: string | null; lastName?: string | null; email?: string };
  assignment?: { title?: string; dueDate?: string | null };
}
interface WrittenAttempt { id: string; submittedAt: string; student: { firstName: string | null; lastName: string | null; email: string } }
interface LiveSession { id: string; title: string; scheduledAt: string; status: string; durationMins?: number | null; cohort?: { name?: string; _count?: { students: number } } }
interface Me { bio: string | null; avatarUrl: string | null; videoIntroUrl: string | null; name?: string | null; firstName?: string | null; lastName?: string | null }
interface Overview {
  cohorts: { id: string; name: string }[];
  cohortId: string | null;
  cohortName: string | null;
  weeks: string[];
  rows: { studentId: string; name: string; cells: number[]; total: number; lastActive: string | null }[];
  max: number;
  quiet: { studentId: string; name: string; reason: string }[];
  courses: { id: string; title: string; status: string; students: number; avgPct: number }[];
}

const card = 'flex flex-col gap-3.5 rounded-lg border border-line bg-white p-[18px]';
const h2 = 'flex items-center gap-2 text-base font-bold text-navy';
const count = 'inline-flex h-5 min-w-5 items-center justify-center rounded bg-accent-soft px-1.5 text-[11.5px] font-bold text-navy';
const label = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-muted';
const th = 'border-b border-line py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted';
const td = 'border-b border-line py-3 pr-3 align-middle';
const btn = 'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors';
const btnPrimary = `${btn} h-9 px-4 text-[13.5px] border border-azure-strong bg-azure-strong text-on-accent hover:brightness-95`;
const btnSecondary = `${btn} h-9 px-4 text-[13.5px] border border-line bg-white text-navy hover:bg-subtle`;
const btnSm = `${btn} h-8 px-3 text-[13px] border border-line bg-white text-navy hover:bg-subtle`;
const link = 'text-[13px] font-semibold text-azure-strong hover:underline';

const STATUS: Record<string, { label: string; blue: boolean }> = {
  PUBLISHED: { label: 'Published', blue: true },
  PENDING_REVIEW: { label: 'In review', blue: false },
  DRAFT: { label: 'Draft', blue: false },
  ARCHIVED: { label: 'Archived', blue: false },
};
const STEPS = [0, 0.2, 0.4, 0.65, 0.92];

function person(s?: { firstName?: string | null; lastName?: string | null; email?: string }) {
  return [s?.firstName, s?.lastName].filter(Boolean).join(' ') || s?.email?.split('@')[0] || 'Student';
}
function ago(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
}

export default function TeacherDashboard() {
  const { user } = useAuth();
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [written, setWritten] = useState<WrittenAttempt[]>([]);
  const [live, setLive] = useState<LiveSession[]>([]);
  const [me, setMe] = useState<Me | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [cohortId, setCohortId] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/portals/teacher/cohorts').then(r => setCohorts(r.data ?? [])).catch(() => setLoadError(true)),
      api.get('/wallets/me/wallet').then(r => setWallet(r.data)).catch(() => {}),
      api.get('/education/submissions/queue').then(r => setSubmissions(r.data ?? [])).catch(() => {}),
      api.get('/education/quizzes/written-queue').then(r => setWritten(r.data ?? [])).catch(() => {}),
      api.get('/live/teacher/upcoming').then(r => setLive(r.data ?? [])).catch(() => {}),
      api.get('/auth/me').then(r => setMe(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    api.get(`/portals/teacher/overview${cohortId ? `?cohortId=${cohortId}` : ''}`)
      .then(r => setOverview(r.data)).catch(() => {});
  }, [cohortId]);

  if (loading) return (
    <div className="flex min-h-full flex-col">
      <Topbar />
      <div className="grid gap-4 p-4 lg:px-7 lg:py-6 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {[0, 1, 2, 3].map(i => <div key={i} className="h-28 rounded-lg border border-line bg-white animate-pulse" />)}
      </div>
    </div>
  );

  if (loadError && !cohorts.length && !live.length) return (
    <div className="flex min-h-full flex-col">
      <Topbar />
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <p className="text-base font-bold text-navy">Your dashboard didn&apos;t load</p>
        <p className="mt-1 text-sm text-ink2">Check your connection, then refresh the page.</p>
        <button type="button" onClick={() => window.location.reload()} className={clsx(btnPrimary, 'mt-5')}>Refresh</button>
      </div>
    </div>
  );

  const now = new Date();
  const firstName = me?.firstName ?? user?.firstName ?? me?.name?.split(' ')[0] ?? user?.email?.split('@')[0] ?? 'there';
  const greeting = now.getHours() < 12 ? 'Good morning' : now.getHours() < 17 ? 'Good afternoon' : 'Good evening';
  const dateLabel = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  const profileSteps = [!!me?.avatarUrl, !!me?.bio, !!me?.videoIntroUrl];
  const profilePct = Math.round((profileSteps.filter(Boolean).length / profileSteps.length) * 100);
  const students = cohorts.reduce((t, c) => t + (c._count?.students ?? 0), 0);
  const upcoming = live.filter(s => s.status === 'ACTIVE' || new Date(s.scheduledAt) > now)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const nextClass = upcoming[0];

  const queue = [
    ...submissions.map(s => {
      const due = s.assignment?.dueDate ? new Date(s.assignment.dueDate) : null;
      return { key: 's' + s.id, student: person(s.student), work: s.assignment?.title ?? 'Assignment', kind: 'Assignment', at: s.submittedAt, late: !!due && new Date(s.submittedAt) > due, href: `/teacher/grade/${s.id}` };
    }),
    ...written.map(w => ({ key: 'w' + w.id, student: person(w.student), work: 'Written quiz answers', kind: 'Written quiz', at: w.submittedAt, late: false, href: '/teacher/quiz-grading' })),
  ].sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

  const stats = [
    { label: 'Students', value: String(students), sub: `in ${cohorts.length} cohort${cohorts.length === 1 ? '' : 's'}` },
    { label: 'Waiting to grade', value: String(queue.length), sub: `${submissions.length} assignment${submissions.length === 1 ? '' : 's'}, ${written.length} written quiz${written.length === 1 ? '' : 'zes'}` },
    {
      label: 'Next class',
      value: nextClass ? new Date(nextClass.scheduledAt).toLocaleDateString('en-GB', { weekday: 'short' }) + ' ' + new Date(nextClass.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) : 'None',
      sub: nextClass?.title ?? 'Nothing scheduled',
    },
    { label: 'Available earnings', value: wallet ? `${wallet.currency} ${Number(wallet.balance).toLocaleString()}` : '—', sub: 'Ready to withdraw' },
  ];

  const level = (n: number) => (!n || !overview?.max) ? 0 : Math.min(4, Math.max(1, Math.ceil((n / overview.max) * 4)));

  return (
    <div className="flex min-h-full flex-col">
      <Topbar />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">

        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-muted">{dateLabel}</p>
            <h1 className="mt-1 text-2xl font-extrabold tracking-[-0.01em] text-navy">{greeting}, {firstName}</h1>
          </div>
          <Link href="/teacher/live" className={btnSecondary}>Schedule a class</Link>
          <Link href="/teacher/courses" className={btnPrimary}>New course</Link>
        </div>

        {profilePct < 100 && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-4 py-3">
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-accent-soft text-azure-strong">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0" /></svg>
            </span>
            <p className="min-w-0 flex-1 text-[13.5px] text-ink2">
              <strong className="text-navy">Your profile is {profilePct}% complete.</strong>{' '}
              Add {[!me?.avatarUrl && 'a photo', !me?.bio && 'a bio', !me?.videoIntroUrl && 'an intro video'].filter(Boolean).join(' and ')} so students can find and trust you.
            </p>
            <Link href="/teacher/profile" className={btnSm}>Complete profile</Link>
          </div>
        )}

        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
          {stats.map(s => (
            <div key={s.label} className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
              <p className={label}>{s.label}</p>
              <p className="truncate text-2xl font-extrabold tracking-[-0.01em] text-navy">{s.value}</p>
              <p className="truncate text-[12.5px] text-muted">{s.sub}</p>
            </div>
          ))}
        </div>

        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
          <div className="flex min-w-0 flex-col gap-5">

            <section className={card}>
              <div className="flex items-center justify-between">
                <h2 className={h2}>Waiting for you {queue.length > 0 && <span className={count}>{queue.length}</span>}</h2>
                <Link href="/teacher/quiz-grading" className={link}>Grading queue</Link>
              </div>
              {queue.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
                    <thead><tr><th className={th}>Student</th><th className={th}>Work</th><th className={th}>Submitted</th><th className={th} /></tr></thead>
                    <tbody>
                      {queue.slice(0, 6).map(q => (
                        <tr key={q.key}>
                          <td className={clsx(td, 'font-semibold text-navy')}>{q.student}</td>
                          <td className={clsx(td, 'text-ink2')}>{q.work}<span className="block text-xs text-muted">{q.kind}{q.late && ' · submitted late'}</span></td>
                          <td className={clsx(td, 'text-ink2')}>{ago(q.at)}</td>
                          <td className={clsx(td, 'text-right')}><Link href={q.href} className={btnSm}>Grade</Link></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-[13.5px] text-ink2">Nothing to grade. New submissions appear here.</p>}
            </section>

            <section className={card}>
              <div className="flex items-center justify-between">
                <h2 className={h2}>Your courses {overview?.courses.length ? <span className={count}>{overview.courses.length}</span> : null}</h2>
                <Link href="/teacher/courses" className={link}>All courses</Link>
              </div>
              {overview?.courses.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
                    <thead><tr><th className={th}>Course</th><th className={th}>Status</th><th className={th}>Students</th><th className={clsx(th, 'w-[28%]')}>Average progress</th></tr></thead>
                    <tbody>
                      {overview.courses.map(c => {
                        const st = STATUS[c.status] ?? { label: c.status, blue: false };
                        return (
                          <tr key={c.id}>
                            <td className={clsx(td, 'font-semibold text-navy')}>
                              <Link href={`/teacher/courses/${c.id}/builder`} className="hover:text-azure-strong">{c.title}</Link>
                            </td>
                            <td className={td}>
                              <span className={clsx('inline-flex h-6 items-center rounded px-2 text-xs font-semibold',
                                st.blue ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>{st.label}</span>
                            </td>
                            <td className={clsx(td, 'text-ink2')}>{c.students || '—'}</td>
                            <td className={td}>
                              <div className="flex items-center gap-2.5">
                                <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-subtle"><div className="h-1.5 bg-azure" style={{ width: `${c.avgPct}%` }} /></div>
                                <span className="min-w-[32px] text-[12.5px] text-ink2">{c.avgPct}%</span>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-[13.5px] text-ink2">Courses you create appear here with their status and progress.</p>}
            </section>

            {overview && overview.cohorts.length > 0 && (
              <section className={card}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className={h2}>Cohort activity</h2>
                    <p className="mt-0.5 text-[13px] text-muted">Lessons, practice and quizzes per student each week. Pale rows have stopped studying.</p>
                  </div>
                  {overview.cohorts.length > 1 ? (
                    <select aria-label="Cohort" value={overview.cohortId ?? ''} onChange={e => setCohortId(e.target.value)}
                      className="h-8 rounded-md border border-line bg-white px-2 text-[13px] font-semibold text-navy outline-none focus:border-azure">
                      {overview.cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                    </select>
                  ) : <span className="text-[13px] font-semibold text-ink2">{overview.cohortName}</span>}
                </div>
                {overview.rows.length ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[560px] table-fixed border-separate" style={{ borderSpacing: 4 }}>
                      <caption className="sr-only">Study activity by student and week</caption>
                      <thead>
                        <tr>
                          <th scope="col" className="w-[28%]"><span className="sr-only">Student</span></th>
                          {overview.weeks.map(w => <th key={w} scope="col" className="pb-1 text-center text-xs font-medium text-muted">{w}</th>)}
                        </tr>
                      </thead>
                      <tbody>
                        {overview.rows.map(r => (
                          <tr key={r.studentId}>
                            <th scope="row" className="max-w-0 pr-3 text-left text-[13px] font-medium text-ink2"><span className="block truncate">{r.name}</span></th>
                            {r.cells.map((n, i) => {
                              const l = level(n);
                              const t = `${r.name}, week of ${overview.weeks[i]}: ${n} activit${n === 1 ? 'y' : 'ies'}`;
                              return <td key={i} title={t} aria-label={t}
                                className={l ? 'h-8 rounded' : 'h-8 rounded border border-line bg-subtle'}
                                style={l ? { background: `rgba(88, 137, 250, ${STEPS[l]})` } : undefined} />;
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="text-[13.5px] text-ink2">Students in this cohort appear here once enrolled.</p>}
              </section>
            )}
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <section className={card}>
              <h2 className={h2}>Upcoming classes {upcoming.length > 0 && <span className={count}>{upcoming.length}</span>}</h2>
              {upcoming.length ? (
                <ul>
                  {upcoming.slice(0, 4).map(s => {
                    const d = new Date(s.scheduledAt);
                    const isLive = s.status === 'ACTIVE';
                    return (
                      <li key={s.id} className="flex gap-3 border-t border-line py-3">
                        <span className="w-10 flex-shrink-0 rounded-md border border-line py-1 text-center">
                          <span className="block text-[10.5px] font-bold uppercase tracking-[0.06em] text-muted">{d.toLocaleDateString('en-US', { month: 'short' })}</span>
                          <span className="block text-base font-extrabold text-navy">{String(d.getDate()).padStart(2, '0')}</span>
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-semibold text-navy">{s.title}</p>
                          <p className="mt-0.5 text-[12.5px] text-muted">
                            {d.toLocaleString('en-GB', { weekday: 'long', hour: '2-digit', minute: '2-digit' })}
                            {s.cohort?.name ? ` · ${s.cohort.name}` : ''}
                          </p>
                        </div>
                        <Link href={`/teacher/live/${s.id}`} className={clsx(btnSm, 'self-center')}>{isLive ? 'Join' : 'Open'}</Link>
                      </li>
                    );
                  })}
                </ul>
              ) : <p className="text-[13.5px] text-ink2">No classes scheduled.</p>}
            </section>

            <section className={card}>
              <h2 className={h2}>Students to check on {overview?.quiet.length ? <span className={count}>{overview.quiet.length}</span> : null}</h2>
              {overview?.quiet.length ? (
                <ul>
                  {overview.quiet.slice(0, 5).map(s => (
                    <li key={s.studentId} className="flex items-center gap-2.5 border-t border-line py-2.5">
                      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-md bg-subtle text-[11.5px] font-bold text-ink2">
                        {s.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold text-navy">{s.name}</p>
                        <p className="text-[12.5px] text-muted">{s.reason}</p>
                      </div>
                      <Link href="/teacher/messages" className={btnSm}>Message</Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[13.5px] text-ink2">Everyone in this cohort has studied in the last two weeks.</p>}
            </section>

            <section className={card}>
              <div className="flex items-center justify-between">
                <h2 className={h2}>Earnings</h2>
                <Link href="/teacher/wallet" className={link}>Wallet</Link>
              </div>
              <p className="text-2xl font-extrabold text-navy">{wallet ? `${wallet.currency} ${Number(wallet.balance).toLocaleString()}` : '—'}</p>
              <p className="-mt-2 text-[12.5px] text-muted">Available to withdraw</p>
              <Link href="/teacher/wallet" className={clsx(btnSm, 'self-start')}>Request payout</Link>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
