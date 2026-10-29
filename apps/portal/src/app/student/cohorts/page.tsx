'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';

interface ClassItem { id: string; title: string; description: string | null; scheduledAt: string; durationMins: number; status: string; recordingUrl: string | null; live: boolean; attended?: boolean; beforeJoined?: boolean }
interface Overview {
  cohorts: { id: string; name: string }[];
  cohort: { id: string; name: string; sittingLabel: string | null; examDate: string | null; startDate: string | null } | null;
  teacher?: { id: string; name: string; avatarUrl: string | null; bio: string | null; subjects: string[]; yearsExperience: number | null };
  next?: ClassItem | null;
  stats?: { attended: number; held: number; cohortAttendancePct: number | null; submitted: number; assignments: number; overdue: number; dueSoon: { title: string; dueDate: string } | null; avgGradePct: number | null; graded: number };
  courseProgress?: { id: string; title: string; pct: number }[];
  classes?: { upcoming: ClassItem[]; past: ClassItem[] };
  assignments?: { id: string; title: string; dueDate: string; maxPoints: number; state: 'todo' | 'overdue' | 'waiting' | 'graded'; grade: number | null; submittedAt: string | null }[];
  members?: { id: string; name: string; role: string; me: boolean }[];
  package?: { id: string; name: string; courses: number; expiresAt: string | null } | null;
}

type Tab = 'classes' | 'work' | 'group';
const DAY = 86_400_000;
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const time = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayLabel = (d: string) => {
  const t = new Date(d), now = new Date();
  const days = Math.round((new Date(t.toDateString()).getTime() - new Date(now.toDateString()).getTime()) / DAY);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  return t.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
};
const inDays = (d: string) => {
  const days = Math.round((new Date(new Date(d).toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / DAY);
  return days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
};
const longDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

/** A calendar file for one class, so students can add it to their phone calendar */
function downloadIcs(c: ClassItem, cohort: string) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = new Date(c.scheduledAt), end = new Date(start.getTime() + c.durationMins * 60_000);
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CareerPath Africa//Live class//EN', 'BEGIN:VEVENT',
    `UID:${c.id}@careerpathafrica`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`,
    `SUMMARY:${c.title.replace(/[,;]/g, ' ')}`, `DESCRIPTION:Live class for ${cohort.replace(/[,;]/g, ' ')}`,
    `URL:${window.location.origin}/student/live/${c.id}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = 'live-class.ics';
  a.click();
  URL.revokeObjectURL(a.href);
}

const badge = (blue: boolean) => clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-semibold', blue ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2');
const btn = (primary: boolean) => clsx('inline-flex h-8 items-center whitespace-nowrap rounded-md border px-3 text-[13px] font-semibold',
  primary ? 'border-azure-strong bg-azure-strong text-on-accent' : 'border-line bg-white text-navy hover:bg-subtle');

export default function StudentCohortPage() {
  const [data, setData] = useState<Overview | null>(null);
  const [cohortId, setCohortId] = useState<string>('');
  const [tab, setTab] = useState<Tab>('classes');

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get('id') ?? '';
    setCohortId(fromUrl);
  }, []);
  useEffect(() => {
    setData(null);
    api.get('/portals/student/cohort-overview', { params: cohortId ? { cohortId } : {} })
      .then(r => setData(r.data)).catch(() => setData({ cohorts: [], cohort: null }));
  }, [cohortId]);

  if (!data) return (
    <div className="flex min-h-full flex-col">
      <Topbar title="My cohort" subtitle="Your class, live lessons and assignments in one place" />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <div className="h-40 rounded-lg border border-line bg-white animate-pulse" />
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">{[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-lg border border-line bg-white animate-pulse" />)}</div>
      </div>
    </div>
  );

  if (!data.cohort) return (
    <div className="flex min-h-full flex-col">
      <Topbar title="My cohort" subtitle="Your class, live lessons and assignments in one place" />
      <div className="m-4 rounded-lg border border-line bg-white p-10 text-center lg:m-7">
        <p className="text-sm font-semibold text-navy">You’re not in a cohort yet</p>
        <p className="mx-auto mt-1 max-w-md text-[13px] text-ink2">Packages with live classes put you in a cohort with a teacher and classmates preparing for the same exam.</p>
        <Link href="/packages" className={clsx(btn(true), 'mt-4 h-9 px-4')}>Browse packages</Link>
      </div>
    </div>
  );

  const { cohort, teacher, next, stats, classes, assignments = [], members = [], courseProgress = [] } = data;
  const now = Date.now();
  const nextStart = next ? new Date(next.scheduledAt).getTime() : 0;
  const canJoin = !!next && (next.live || nextStart - now <= 10 * 60_000);
  const examDays = cohort.examDate ? Math.ceil((new Date(cohort.examDate).getTime() - now) / DAY) : null;
  const mainCourse = [...courseProgress].sort((a, b) => b.pct - a.pct)[0];
  const tabs: [Tab, string, number][] = [['classes', 'Live classes', (classes?.upcoming.length ?? 0) + (classes?.past.length ?? 0)], ['work', 'Assignments', assignments.length], ['group', 'Group', members.length]];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="My cohort" subtitle="Your class, live lessons and assignments in one place"
        actions={data.cohorts.length > 1 ? (
          <label className="flex h-9 items-center gap-2 rounded-md border border-line bg-white px-2.5 text-[13.5px] text-ink2">
            <span className="text-muted">Cohort:</span>
            <select aria-label="Cohort" value={cohort.id} onChange={e => setCohortId(e.target.value)} className="bg-transparent font-semibold text-navy outline-none">
              {data.cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
        ) : undefined} />

      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <section className={clsx('flex flex-wrap items-stretch gap-5 rounded-lg border bg-white p-5', next ? 'border-azure' : 'border-line')}>
          <div className="flex min-w-0 flex-[999_1_380px] flex-col gap-1.5">
            {next ? (
              <>
                <span className="inline-flex h-6 items-center gap-1.5 self-start rounded bg-accent-soft px-2 text-xs font-bold text-navy">
                  <span className={clsx('h-[7px] w-[7px] rounded-full bg-azure-strong', next.live && 'animate-pulse')} />
                  {next.live ? 'Live now' : `Next live class · ${dayLabel(next.scheduledAt).toLowerCase()}`}
                </span>
                <p className="mt-1.5 text-xl font-extrabold text-navy">{next.title}</p>
                <p className="text-[13.5px] text-ink2">{dayLabel(next.scheduledAt)}, {time(next.scheduledAt)}{teacher ? ` · with ${teacher.name}` : ''} · {next.durationMins} min</p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {canJoin
                    ? <Link href={`/student/live/${next.id}`} className={clsx(btn(true), 'h-[38px] px-[18px] text-sm')}>Join class</Link>
                    : <span className="inline-flex h-[38px] items-center rounded-md border border-line bg-subtle px-3.5 text-sm font-semibold text-muted">Opens 10 min before</span>}
                  <button type="button" onClick={() => downloadIcs(next, cohort.name)} className={clsx(btn(false), 'h-[38px] px-3.5 text-sm')}>Add to calendar</button>
                </div>
              </>
            ) : (
              <>
                <p className="text-xl font-extrabold text-navy">{cohort.name}</p>
                <p className="text-[13.5px] text-ink2">No live class is scheduled yet. Your teacher will add the next one here.</p>
              </>
            )}
          </div>
          {examDays != null && examDays >= 0 && (
            <div className="flex flex-[1_1_220px] flex-col justify-center gap-1 rounded-md bg-subtle px-4 py-3.5">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{cohort.sittingLabel ?? 'Your exam'}</p>
              <p className="text-[30px] font-extrabold tracking-[-0.01em] text-navy">{examDays === 0 ? 'Today' : `${examDays} day${examDays === 1 ? '' : 's'}`}</p>
              <p className="text-[13px] text-ink2">{examDays === 0 ? 'Good luck!' : `until your exam on ${new Date(cohort.examDate!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}`}</p>
            </div>
          )}
        </section>

        {stats && (
          <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            {[
              { l: 'Classes attended', v: stats.held ? `${stats.attended} of ${stats.held}` : '—', sub: stats.held ? `${Math.round((stats.attended / stats.held) * 100)}%${stats.cohortAttendancePct != null ? ` · cohort average ${stats.cohortAttendancePct}%` : ''}` : 'No classes held yet' },
              { l: 'Assignments', v: stats.assignments ? `${stats.submitted} of ${stats.assignments}` : '—', sub: stats.overdue ? `${stats.overdue} overdue` : stats.dueSoon ? `${stats.dueSoon.title} due ${dayLabel(stats.dueSoon.dueDate).toLowerCase()}` : stats.assignments ? 'All caught up' : 'None set yet' },
              { l: 'Average grade', v: stats.avgGradePct != null ? `${stats.avgGradePct}%` : '—', sub: stats.graded ? `Across ${stats.graded} graded assignment${stats.graded === 1 ? '' : 's'}` : 'Nothing graded yet' },
              { l: 'Course progress', v: mainCourse ? `${mainCourse.pct}%` : '—', sub: mainCourse ? mainCourse.title : 'No courses linked yet' },
            ].map(s => (
              <div key={s.l} className="rounded-lg border border-line bg-white p-4">
                <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{s.l}</dt>
                <dd className="mt-1.5 text-[22px] font-extrabold text-navy">{s.v}</dd>
                <dd className="mt-0.5 truncate text-[12.5px] text-muted">{s.sub}</dd>
              </div>
            ))}
          </dl>
        )}

        <div className="flex flex-wrap items-start gap-5">
          <section className="min-w-0 flex-[999_1_520px] rounded-lg border border-line bg-white">
            <div role="tablist" aria-label="Cohort" className="flex gap-1 border-b border-line px-4">
              {tabs.map(([k, l, n]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={clsx('-mb-px h-[46px] border-b-2 px-3 text-[13.5px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent font-medium')}>
                  {l} <span className="font-medium text-muted">{n}</span>
                </button>
              ))}
            </div>

            {tab === 'classes' && (
              <div>
                <p className="px-[18px] pb-1.5 pt-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted">Coming up</p>
                {!classes?.upcoming.length && <p className="border-t border-line px-[18px] py-3 text-[13px] text-ink2">Nothing scheduled yet.</p>}
                {classes?.upcoming.map(c => (
                  <div key={c.id} className="flex items-center gap-3.5 border-t border-line px-[18px] py-3">
                    <div className="w-12 flex-shrink-0 rounded-md bg-accent-soft py-1.5 text-center">
                      <p className="text-[11px] font-bold uppercase text-azure-strong">{new Date(c.scheduledAt).toLocaleDateString('en-GB', { month: 'short' })}</p>
                      <p className="text-lg font-extrabold text-navy">{String(new Date(c.scheduledAt).getDate()).padStart(2, '0')}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy">{c.title}</p>
                      <p className="mt-0.5 text-[12.5px] text-muted">
                        {new Date(c.scheduledAt).toLocaleDateString('en-GB', { weekday: 'short' })} {time(c.scheduledAt)} – {time(new Date(new Date(c.scheduledAt).getTime() + c.durationMins * 60_000).toISOString())}
                      </p>
                    </div>
                    {c.live ? <Link href={`/student/live/${c.id}`} className={btn(true)}>Join</Link> : <span className="text-[12.5px] text-muted">{inDays(c.scheduledAt)}</span>}
                  </div>
                ))}
                <p className="px-[18px] pb-1.5 pt-[18px] text-xs font-semibold uppercase tracking-[0.06em] text-muted">Past classes</p>
                {!classes?.past.length && <p className="border-t border-line px-[18px] py-3 text-[13px] text-ink2">No classes held yet.</p>}
                {classes?.past.map(c => (
                  <div key={c.id} className="flex flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy">{c.title}</p>
                      <p className="mt-0.5 text-[12.5px] text-muted">{new Date(c.scheduledAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {c.durationMins} min</p>
                    </div>
                    <span className={badge(!!c.attended)}>{c.attended ? 'Attended' : c.beforeJoined ? 'Before you joined' : 'Missed'}</span>
                    {c.recordingUrl
                      ? <a href={c.recordingUrl} target="_blank" rel="noopener noreferrer" className={btn(false)}>Watch recording</a>
                      : <span className="inline-flex h-8 items-center px-1 text-[12.5px] text-muted">Recording coming</span>}
                  </div>
                ))}
              </div>
            )}

            {tab === 'work' && (
              <div>
                {!assignments.length && <p className="px-[18px] py-6 text-center text-[13px] text-ink2">Your teacher hasn’t set any assignments yet.</p>}
                {assignments.map(a => {
                  const meta = a.state === 'graded' || a.state === 'waiting'
                    ? `Submitted ${a.submittedAt ? new Date(a.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' }) : ''}`
                    : `${a.state === 'overdue' ? 'Was due' : 'Due'} ${new Date(a.dueDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · ${a.maxPoints} marks`;
                  const state = a.state === 'graded' ? `Graded · ${a.grade}/${a.maxPoints}` : a.state === 'waiting' ? 'Waiting for grade' : a.state === 'overdue' ? 'Overdue' : 'To do';
                  const cta = a.state === 'graded' ? 'See feedback' : a.state === 'waiting' ? 'View' : 'Start';
                  return (
                    <div key={a.id} className="flex flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-3.5 first:border-t-0">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-navy">{a.title}</p>
                        <p className="mt-0.5 text-[12.5px] text-muted">{meta}</p>
                      </div>
                      <span className={badge(a.state === 'graded')}>{state}</span>
                      <Link href={`/student/assignments?id=${a.id}`} className={btn(a.state === 'todo' || a.state === 'overdue')}>{cta}</Link>
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'group' && (
              <div className="grid gap-2.5 p-4 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
                {members.map(m => (
                  <div key={m.id} className="flex items-center gap-2.5 rounded-md border border-line p-2.5">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md bg-accent-soft text-xs font-bold text-navy">{initials(m.name)}</span>
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-semibold text-navy">{m.name}</p>
                      <p className="text-xs text-muted">{m.role}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
            {teacher && (
              <section className="flex flex-col gap-3 rounded-lg border border-line bg-white p-[18px]">
                <h3 className="text-[15px] font-semibold text-navy">Your teacher</h3>
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-accent-soft text-[15px] font-extrabold text-azure-strong">{initials(teacher.name)}</span>
                  <div className="min-w-0">
                    <p className="text-[14.5px] font-semibold text-navy">{teacher.name}</p>
                    <p className="truncate text-[12.5px] text-muted">
                      {[teacher.subjects.slice(0, 2).join(', '), teacher.yearsExperience ? `${teacher.yearsExperience} years teaching` : null].filter(Boolean).join(' · ') || 'Cohort teacher'}
                    </p>
                  </div>
                </div>
                <Link href={`/student/messages?to=${teacher.id}`} className={clsx(btn(false), 'h-9 justify-center text-[13.5px]')}>Send a message</Link>
              </section>
            )}
            {data.package && (
              <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-white p-[18px]">
                <h3 className="text-[15px] font-semibold text-navy">Included with</h3>
                <p className="text-[13.5px] font-semibold text-navy">{data.package.name}</p>
                <p className="text-[12.5px] text-muted">
                  {data.package.expiresAt ? `Access until ${longDate(data.package.expiresAt)}` : 'No time limit'} · {data.package.courses} course{data.package.courses === 1 ? '' : 's'}
                </p>
                <Link href={`/packages/${data.package.id}`} className="text-[13px] font-semibold text-azure-strong hover:underline">View package</Link>
              </section>
            )}
            <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-[18px]">
              <h3 className="text-[15px] font-semibold text-navy">How live classes work</h3>
              <ul className="list-disc space-y-1.5 pl-[18px] text-[13px] text-ink2">
                <li>Join from this page up to 10 minutes before the start.</li>
                <li>Missed one? The recording appears here once your teacher adds it.</li>
                <li>Attendance counts towards your progress report.</li>
              </ul>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
