'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type StepState = 'done' | 'now' | 'next' | 'later';
interface Step { kind: 'module' | 'live' | 'revision' | 'exam'; course: string; courseId: string | null; lessonId: string | null; title: string; detail: string; state: StepState; date: string | null }
interface Programme {
  id: string; name: string;
  exam: { date: string; label: string | null; cohort: string | null; courses: string[] } | null;
  pace: { daysLeft: number | null; studyDaysLeft: number | null; donePct: number; expectedPct: number | null; behindDays: number | null; lessonsLeft: number; quizzesLeft: number; lessonsDone: number; lessonsTotal: number; perDayNeeded: number | null };
  steps: Step[];
  week: { kind: string; title: string; at: string; done: boolean }[];
}
interface Data { programmes: { id: string; name: string }[]; programme: Programme | null }

const STATE: Record<StepState, string> = { done: 'Done', now: 'Now', next: 'Next', later: 'Later' };
const day = (iso: string, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' }) => new Date(iso).toLocaleDateString('en-GB', opts);

function headline(p: Programme['pace']) {
  if (p.lessonsLeft + p.quizzesLeft === 0) return 'You’ve finished every lesson';
  if (p.behindDays == null) return `${p.donePct}% done`;
  if (p.behindDays >= 3) return `You’re about ${p.behindDays >= 10 ? `${Math.round(p.behindDays / 7)} weeks` : p.behindDays >= 6 ? 'a week' : `${p.behindDays} days`} behind`;
  if (p.behindDays <= -3) return 'You’re ahead of schedule';
  return 'You’re on track';
}

export default function RoadmapPage() {
  const [d, setD] = useState<Data | null>(null);
  const [pkg, setPkg] = useState<string>('');
  useEffect(() => {
    api.get('/portals/student/roadmap', { params: { packageId: pkg || undefined } }).then(r => setD(r.data)).catch(() => notify.error('Could not load your roadmap'));
  }, [pkg]);
  const p = d?.programme ?? null;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Roadmap"
        subtitle={p?.exam ? `Your path to ${p.exam.label ?? 'the exam'} · ${day(p.exam.date, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}` : 'Your path through your programme'}
        actions={d && d.programmes.length > 0 && (
          <label className="flex h-9 items-center gap-1 rounded-md border border-line bg-white px-3 text-[13.5px] text-navy">Programme:
            <select value={p?.id ?? ''} onChange={e => setPkg(e.target.value)} className="max-w-[220px] bg-transparent font-semibold outline-none">
              {d.programmes.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </label>
        )} />
      {!d ? <div className="m-4 h-96 rounded-lg bg-subtle animate-pulse lg:mx-7 lg:my-6" /> : !p ? (
        <div className="p-4 lg:px-7 lg:py-6">
          <div className="rounded-lg border border-line bg-white px-6 py-12 text-center">
            <p className="text-base font-bold text-navy">No programme yet</p>
            <p className="mt-1 text-[13.5px] text-ink2">Your roadmap appears when you join a package — it plans your way to the exam.</p>
            <Link href="/packages" className="mt-4 inline-flex h-9 items-center rounded-md bg-azure-strong px-4 text-[13.5px] font-semibold text-on-accent">See packages</Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
            <section className="flex flex-wrap items-center gap-[18px] rounded-lg border border-azure bg-white px-5 py-[18px]">
              {p.pace.daysLeft != null && p.pace.daysLeft >= 0 && (
                <div className="border-r border-line px-4 py-1.5 text-center">
                  <p className="text-[30px] font-extrabold text-azure-strong">{p.pace.daysLeft}</p>
                  <p className="text-xs text-muted">day{p.pace.daysLeft === 1 ? '' : 's'} to the exam</p>
                </div>
              )}
              <div className="min-w-0 flex-[1_1_260px]">
                <p className="text-[17px] font-extrabold text-navy">{headline(p.pace)}</p>
                <p className="mt-[3px] text-[13.5px] text-ink2">
                  {p.pace.lessonsLeft} lesson{p.pace.lessonsLeft === 1 ? '' : 's'} and {p.pace.quizzesLeft} quiz{p.pace.quizzesLeft === 1 ? '' : 'zes'} left.
                  {p.pace.perDayNeeded ? ` Finishing ${p.pace.perDayNeeded} a day gets you there with time to revise.` : ''}
                </p>
                <span className="relative mt-2.5 block h-2 rounded-full bg-subtle">
                  <span className="block h-2 rounded-full bg-azure" style={{ width: `${p.pace.donePct}%` }} />
                  {p.pace.expectedPct != null && <span className="absolute -top-1 h-4 w-0.5 bg-navy" style={{ left: `${p.pace.expectedPct}%` }} title="Where you should be by now" />}
                </span>
                <p className="mt-1 flex justify-between text-[11.5px] text-muted"><span>{p.pace.donePct}% done</span>{p.pace.expectedPct != null && <span>where you should be: {p.pace.expectedPct}%</span>}</p>
              </div>
              <Link href="/student/calendar" className="inline-flex h-[38px] items-center rounded-md bg-azure-strong px-4 text-[13.5px] font-semibold text-on-accent hover:opacity-90">Plan my study time</Link>
            </section>

            <section className="rounded-lg border border-line bg-white px-5 pb-3 pt-2">
              {p.steps.map((s, i) => {
                const last = i === p.steps.length - 1;
                const href = s.kind === 'module' && s.courseId ? (s.lessonId ? `/student/learn/${s.courseId}/lesson/${s.lessonId}` : `/student/courses/${s.courseId}`) : s.kind === 'live' ? '/student/live' : null;
                const body = (
                  <div className="flex flex-1 flex-wrap items-center gap-2.5 pb-3.5 pt-3">
                    <div className="min-w-0 flex-[1_1_260px]">
                      <p className="text-xs text-muted">{s.course}</p>
                      <p className="mt-0.5 text-[14.5px] font-[650] text-navy">{s.title}</p>
                      <p className="mt-0.5 text-[12.5px] text-ink2">{s.detail}</p>
                    </div>
                    {s.date && <span className="text-[12.5px] text-muted">{s.state === 'done' ? `done ${day(s.date)}` : s.kind === 'module' ? `aim: by ${day(s.date)}` : s.kind === 'revision' ? `from ${day(s.date)}` : day(s.date, { weekday: 'short', day: 'numeric', month: 'short' })}</span>}
                    <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-semibold', s.state === 'now' ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>{s.kind === 'exam' ? 'Exam' : STATE[s.state]}</span>
                  </div>
                );
                return (
                  <div key={`${s.kind}-${i}`} className="flex gap-3.5">
                    <div className="flex w-[22px] flex-col items-center">
                      <span className={clsx('mt-4 h-3.5 w-3.5 shrink-0 rounded-full', s.state === 'done' ? 'bg-azure' : s.state === 'now' ? 'border-[3px] border-azure-strong bg-white' : 'border-2 border-line bg-white')} />
                      {!last && <span className={clsx('w-0.5 flex-1', s.state === 'done' ? 'bg-azure' : 'bg-line')} />}
                    </div>
                    {href ? <Link href={href} className="flex flex-1 rounded-md hover:bg-subtle">{body}</Link> : body}
                  </div>
                );
              })}
            </section>
          </div>

          <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-3.5">
            <section className="flex flex-col gap-[9px] rounded-lg border border-line bg-white p-4">
              <h3 className="text-[15px] font-semibold text-navy">This week</h3>
              {!p.week.length ? <p className="text-[13px] text-ink2">Nothing planned. <Link href="/student/calendar" className="font-semibold text-azure-strong">Plan study time</Link></p> : p.week.map((w, i) => (
                <p key={i} className="flex gap-2 text-[13px]">
                  <span className={clsx('mt-0.5 h-3.5 w-3.5 shrink-0 rounded-[3px]', w.done ? 'bg-azure' : 'border-[1.5px] border-line')} aria-label={w.done ? 'Done' : 'To do'} />
                  <span className={clsx('min-w-0 flex-1', w.done ? 'text-muted' : 'text-navy')}>{w.title}</span>
                  <span className="shrink-0 text-muted">{new Date(w.at).toLocaleDateString('en-GB', { weekday: 'short' })}{w.kind === 'live' ? ` ${new Date(w.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : ''}</span>
                </p>
              ))}
            </section>
            {p.exam && (
              <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
                <h3 className="text-[15px] font-semibold text-navy">The exam</h3>
                <p className="text-[13px] text-ink2">{[p.exam.label, p.exam.courses.join(', ')].filter(Boolean).join(' · ')}</p>
                <p className="text-[13px] font-bold text-navy">{day(p.exam.date, { weekday: 'long', day: 'numeric', month: 'long' })}, {new Date(p.exam.date).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}</p>
                {p.exam.cohort && <p className="text-[12.5px] text-muted">Your cohort: {p.exam.cohort}</p>}
              </section>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}
