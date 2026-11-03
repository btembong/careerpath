'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { HelpfulEmpty } from '@/components/ui/HelpfulEmpty';

interface Exam {
  id: string; kind: 'MOCK' | 'PAST_PAPER'; title: string; description: string | null; programme: string | null;
  minutes: number; passMark: number; questions: number; examBody: string | null; year: number | null; session: string | null; paperNumber: string | null;
  open: boolean; attemptsAllowed: number; attemptsUsed: number; attemptsLeft: number | null;
  best: number | null; passed: boolean | null; inProgress: string | null; lastResult: string | null;
}

/** Mock exams or past papers a student can sit. */
export function ExamList({ kind }: { kind: 'MOCK' | 'PAST_PAPER' }) {
  const router = useRouter();
  const [rows, setRows] = useState<Exam[] | null>(null);
  const [busy, setBusy] = useState('');
  const [body, setBody] = useState('');
  const papers = kind === 'PAST_PAPER';

  useEffect(() => { api.get(`/test-centre/exams?kind=${kind}`).then(r => setRows(r.data)).catch(() => setRows([])); }, [kind]);

  async function start(e: Exam, practice = false) {
    setBusy(e.id + practice);
    try {
      const { data } = await api.post(`/test-centre/exams/${e.id}/start`, { practice });
      router.push(`/student/tests/${data.id}`);
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not start'); setBusy(''); }
  }

  const bodies = useMemo(() => [...new Set((rows ?? []).map(r => r.examBody).filter((x): x is string => !!x))], [rows]);
  const shown = (rows ?? []).filter(r => !body || r.examBody === body);
  // Past papers read best grouped by exam and year
  const groups = papers
    ? [...new Map(shown.map(r => [`${r.examBody ?? 'Other'} ${r.year ?? ''}`.trim(), shown.filter(x => `${x.examBody ?? 'Other'} ${x.year ?? ''}`.trim() === `${r.examBody ?? 'Other'} ${r.year ?? ''}`.trim())])).entries()]
    : [['', shown] as [string, Exam[]]];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/student/tests" backLabel="Test Centre" />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-navy">{papers ? 'Past papers' : 'Mock exams'}</h1>
          <p className="mt-1 text-sm text-ink2">{papers ? 'Real exam papers. Sit one timed like the day itself, or practise it untimed with answers as you go.' : 'Full papers set by your teachers, timed like the real exam. Your teacher marks the written answers.'}</p>
        </div>
        {papers && bodies.length > 1 && (
          <div role="tablist" className="flex flex-wrap gap-1 self-start rounded-lg border border-line bg-white p-[3px] text-[13px]">
            {['', ...bodies].map(b => <button key={b || 'all'} role="tab" aria-selected={body === b} onClick={() => setBody(b)} className={`rounded-md px-2.5 py-1 ${body === b ? 'bg-[#EAF0FF] font-semibold text-navy' : 'text-ink2'}`}>{b || 'All'}</button>)}
          </div>
        )}
        {rows === null && <p className="text-sm text-muted">Loading…</p>}
        {rows?.length === 0 && (papers
          ? <HelpfulEmpty title="No past papers for your courses yet." body="Past papers appear here as your teachers add them. Until then, a quick test keeps you sharp." cta={{ label: 'Try 10 questions now', href: '/student/tests/new' }} preview={{ icon: '◎', title: 'Past paper', line: '2024 · Paper 1' }} />
          : <HelpfulEmpty title="No mock exams for your courses yet." body="Your teachers add them over time. Until then, a quick test keeps you sharp." cta={{ label: 'Try 10 questions now', href: '/student/tests/new' }} preview={{ icon: '◎', title: 'Quick 10', line: '7 of 10 right' }} />)}
        {groups.map(([label, list]) => (
          <section key={label || 'all'} className="flex flex-col gap-2">
            {label && <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-royal/45">{label}</p>}
            {list.map(e => {
              const done = e.attemptsLeft === 0;
              return (
                <div key={e.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-line bg-white px-4 py-3.5">
                  <div className="min-w-0 flex-1">
                    <strong className="block text-[15px] text-navy">{e.title}{papers && e.paperNumber ? ` · Paper ${e.paperNumber}` : ''}</strong>
                    <span className="text-[13px] text-ink2">{[papers ? e.session : e.programme, `${e.questions} questions`, `${e.minutes} min`, `pass mark ${e.passMark}%`].filter(Boolean).join(' · ')}</span>
                    {e.description && <p className="mt-0.5 text-[12.5px] text-muted">{e.description}</p>}
                  </div>
                  <span className="text-[13px] text-ink2">
                    {e.best != null ? <>Best <strong className={e.passed ? 'text-[#2F57C9]' : 'text-navy'}>{e.best}%</strong>{e.passed ? ' · passed' : ''}</> : e.open ? 'Not taken yet' : ''}
                    {e.attemptsLeft != null && e.open && <> · {e.attemptsLeft} {e.attemptsLeft === 1 ? 'attempt' : 'attempts'} left</>}
                  </span>
                  {!e.open ? <Link href="/student/catalogue" className="h-9 rounded-md border border-line px-3.5 text-[13px] font-semibold leading-9 text-navy">Unlock</Link> : (
                    <div className="flex gap-2">
                      {e.lastResult && <Link href={`/student/tests/${e.lastResult}/result`} className="h-9 rounded-md border border-line px-3.5 text-[13px] font-semibold leading-9 text-navy">Last result</Link>}
                      {papers && <button disabled={!!busy} onClick={() => start(e, true)} className="h-9 rounded-md border border-line px-3.5 text-[13px] font-semibold text-navy disabled:opacity-50">Practise</button>}
                      {e.inProgress
                        ? <Link href={`/student/tests/${e.inProgress}`} className="h-9 rounded-md bg-[#3F6FE8] px-3.5 text-[13px] font-semibold leading-9 text-white">Continue</Link>
                        : <button disabled={!!busy || done} onClick={() => start(e)} className="h-9 rounded-md bg-[#3F6FE8] px-3.5 text-[13px] font-semibold text-white disabled:opacity-50">{done ? 'No attempts left' : busy === e.id + 'false' ? 'Starting…' : papers ? 'Sit the paper' : 'Start exam'}</button>}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
}
