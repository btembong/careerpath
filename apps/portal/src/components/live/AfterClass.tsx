'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { BoardViewer } from '@/components/live/BoardViewer';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface After {
  board: unknown[];
  questions: { id: string; body: string; answer: string | null; state: string; who: string; votes: number; mine: boolean }[];
  polls: { id: string; question: string; options: string[]; counts: number[]; myVote: number | null }[];
  quizzes: { id: string; questions: number; mine?: { sessionId: string; right: number; of: number } | null; results?: { takers: number } }[];
}
interface Upcoming { id: string; title: string; scheduledAt: string; durationMins: number; description: string | null }
interface Info { id: string; title: string; scheduledAt: string; durationMins: number; recordingUrl: string | null; cohort: { name: string }; teacher: string }

const day = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
const STATE: Record<string, string> = { LIVE: 'Answered live in class', LATER: 'The teacher will answer after class', ANSWERED: 'Answered', OPEN: 'Waiting for an answer' };

/** Google Calendar link: no download, works on any phone */
function googleLink(c: Upcoming) {
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const start = new Date(c.scheduledAt), end = new Date(start.getTime() + c.durationMins * 60_000);
  const q = new URLSearchParams({ action: 'TEMPLATE', text: `Live class: ${c.title}`, dates: `${f(start)}/${f(end)}`, details: `${c.description ? c.description + '\n\n' : ''}Join: ${window.location.origin}/student/live/${c.id}` });
  return `https://calendar.google.com/calendar/render?${q}`;
}

/** Adds a class to the person's calendar: an .ics file (Outlook, Apple, Android) or Google Calendar */
export function AddToCalendar({ c }: { c: Upcoming }) {
  const [open, setOpen] = useState(false);
  async function ics() {
    try {
      const r = await api.get(`/live/classes/${c.id}/calendar.ics`, { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.data); a.download = 'careerpath-class.ics'; a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000); setOpen(false);
    } catch { notify.error('Could not make the calendar file'); }
  }
  return (
    <div className="relative self-start">
      <button onClick={() => setOpen(v => !v)} aria-expanded={open} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line bg-white px-2.5 text-[12.5px] font-semibold text-azure-strong hover:bg-subtle">
        <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4M12 13v5M9.5 15.5h5" /></svg>
        Add to calendar
      </button>
      {open && (
        <div className="absolute left-0 top-9 z-10 flex w-[210px] flex-col rounded-lg border border-line bg-white p-1 shadow-lg">
          <a href={googleLink(c)} target="_blank" rel="noopener noreferrer" onClick={() => setOpen(false)} className="rounded-md px-3 py-2 text-[13px] text-navy hover:bg-subtle">Google Calendar</a>
          <button onClick={ics} className="rounded-md px-3 py-2 text-left text-[13px] text-navy hover:bg-subtle">Outlook, Apple or phone (.ics)</button>
        </div>
      )}
    </div>
  );
}

/** One page after a class: recording, the board as the teacher left it, questions with answers, poll and quiz */
export function AfterClass({ info }: { info: Info }) {
  const [a, setA] = useState<After | null>(null);
  const [next, setNext] = useState<Upcoming[]>([]);
  const [tab, setTab] = useState<'notes' | 'qa' | 'poll'>('notes');
  useEffect(() => {
    api.get(`/live/classes/${info.id}/after`).then(r => setA(r.data)).catch(() => setA({ board: [], questions: [], polls: [], quizzes: [] }));
    api.get('/live/student/upcoming').then(r => setNext((r.data ?? []).slice(0, 3))).catch(() => {});
  }, [info.id]);
  const rec = info.recordingUrl;

  return (
    <div className="grid min-h-0 flex-1 items-start gap-4 overflow-y-auto p-3 sm:p-5 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="flex min-w-0 flex-col gap-3.5">
        <section className="flex flex-wrap items-center gap-3.5 rounded-[10px] border border-line bg-white px-5 py-4">
          <div className="min-w-[240px] flex-1">
            <span className="text-[12.5px] text-muted">{info.cohort.name} · {day(info.scheduledAt)} · {info.durationMins} min</span>
            <p className="mt-1 text-[22px] font-extrabold text-navy">{info.title}</p>
            <span className="text-[13px] text-ink2">{info.teacher}</span>
          </div>
          {rec
            ? <Link href={`/student/recordings/${info.id}`} className="inline-flex h-[42px] items-center gap-2 rounded-md bg-[#3F6FE8] px-4 text-sm font-bold text-white hover:bg-[#2F57C9]">
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><path d="M8 5v14l11-7z" fill="currentColor" /></svg>Watch recording</Link>
            : <span className="text-[13px] text-muted">The recording appears here a few minutes after class.</span>}
        </section>

        <div role="tablist" className="flex gap-1 self-start rounded-lg border border-line bg-white p-[3px] text-[13px]">
          {([['notes', 'Class notes'], ['qa', `Questions and answers${a?.questions.length ? ` (${a.questions.length})` : ''}`], ['poll', 'Poll and quiz']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx('rounded-md px-3 py-1.5 font-semibold', tab === k ? 'bg-accent-soft text-navy' : 'text-ink2')}>{l}</button>
          ))}
        </div>

        {!a ? <div className="h-[420px] animate-pulse rounded-[10px] bg-subtle" /> : tab === 'notes' ? (
          <section className="flex flex-col gap-2 rounded-[10px] border border-line bg-white p-3">
            <div className="flex flex-wrap items-center gap-2 px-1 text-[13px]"><strong className="text-navy">Class notes</strong><span className="text-muted">The whiteboard as {info.teacher} left it · read only · “Save as image” in the menu downloads it</span></div>
            <BoardViewer elements={a.board} />
          </section>
        ) : tab === 'qa' ? (
          <section className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-white p-4">
            {!a.questions.length && <p className="text-[13.5px] text-ink2">No questions were asked in this class.</p>}
            {a.questions.map(q => (
              <div key={q.id} className="flex flex-col gap-1.5 rounded-lg bg-subtle px-3.5 py-3">
                <span className="text-xs text-muted">{q.who}{q.mine ? ' (you)' : ''} · ▲ {q.votes}</span>
                <strong className="text-sm text-navy">{q.body}</strong>
                {q.answer ? <p className="text-[13.5px] text-ink2">{q.answer}</p> : <span className="text-xs font-semibold text-azure-strong">{STATE[q.state] ?? ''}</span>}
              </div>
            ))}
          </section>
        ) : (
          <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-white p-4 text-sm">
            {!a.polls.length && !a.quizzes.length && <p className="text-[13.5px] text-ink2">No poll or quiz in this class.</p>}
            {a.polls.map(p => (
              <div key={p.id} className="flex flex-wrap justify-between gap-2"><strong className="text-navy">Poll · {p.question}</strong>
                <span className="text-muted">{p.myVote != null ? `You said ${p.options[p.myVote]}` : `${p.counts.reduce((x, y) => x + y, 0)} answered`}</span></div>
            ))}
            {a.quizzes.map(q => (
              <div key={q.id} className="flex flex-wrap justify-between gap-2"><strong className="text-navy">Quick quiz · {q.questions} questions</strong>
                {q.mine ? <Link href={`/student/tests/${q.mine.sessionId}/result`} className="font-bold text-azure-strong hover:underline">{q.mine.right} of {q.mine.of} right · in your Test Centre history</Link>
                  : q.results ? <span className="text-muted">{q.results.takers} took it</span> : <span className="text-muted">You didn’t take it</span>}</div>
            ))}
          </section>
        )}
      </div>

      <aside className="flex flex-col gap-3.5">
        <section className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-white p-4">
          <strong className="text-[15px] text-navy">Coming up</strong>
          {!next.length && <p className="text-[13px] text-muted">No classes scheduled yet.</p>}
          {next.map(c => (
            <div key={c.id} className="flex flex-col gap-1.5 rounded-lg border border-line px-3 py-2.5">
              <strong className="text-[13.5px] text-navy">{c.title}</strong>
              <span className="text-[12.5px] text-muted">{day(c.scheduledAt)} · {c.durationMins} min</span>
              <AddToCalendar c={c} />
            </div>
          ))}
          <span className="text-xs text-muted">Works with Google Calendar, Outlook and your phone.</span>
        </section>
        <Link href="/student/live" className="text-[13px] font-semibold text-azure-strong hover:underline">All live classes →</Link>
      </aside>
    </div>
  );
}
