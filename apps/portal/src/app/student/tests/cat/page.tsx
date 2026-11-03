'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { BAND_LABEL } from '@/components/tests/cat';

interface Cat {
  id: string; title: string; description: string | null; programme: string | null; minutes: number; questions: number; catMin: number | null;
  open: boolean; attemptsLeft: number | null; inProgress: string | null; lastResult: string | null; lastBand: string | null; lastDecision: string | null;
}

const FAQ: [string, string][] = [
  ['How does adaptive testing work?', 'Get a question right and the next one is usually harder; get it wrong and the next is usually easier. That’s how the test finds your level, like the real NCLEX.'],
  ['Why did my test stop early?', 'It stops as soon as it’s 95% sure whether you’re above or below the passing standard, any time after the minimum number of questions. Stopping early isn’t good or bad on its own.'],
  ['Why can’t I go back or skip?', 'Each answer decides the next question, so changing one would change the whole test. The real exam works the same way.'],
  ['What if time runs out?', 'If you’ve answered at least the minimum, you get a result from your answers so far. If not, there isn’t enough to decide.'],
  ['Does the result guarantee a pass?', 'No. It’s a practice estimate from questions on CareerPath Africa, to help you decide what to study next. It isn’t an official score.'],
];

export default function CatListPage() {
  const router = useRouter();
  const [rows, setRows] = useState<Cat[] | null>(null);
  const [busy, setBusy] = useState('');
  const [open, setOpen] = useState<number | null>(0);
  useEffect(() => { api.get('/test-centre/exams?kind=CAT').then(r => setRows(r.data)).catch(() => setRows([])); }, []);

  async function start(c: Cat) {
    setBusy(c.id);
    try { const { data } = await api.post(`/test-centre/exams/${c.id}/start`, {}); router.push(`/student/tests/cat/${data.id}`); }
    catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not start'); setBusy(''); }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/student/tests" backLabel="Test Centre" />
      <div className="flex max-w-4xl flex-col gap-4 p-4 lg:px-7 lg:py-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-navy">CAT readiness exams</h1>
          <p className="mt-1 text-sm text-ink2">Built like the real computer-adaptive NCLEX: each answer sets the next question. Use them to see how ready you are.</p>
        </div>
        {rows === null && <p className="text-sm text-muted">Loading…</p>}
        {rows?.length === 0 && <div className="rounded-lg border border-line bg-white p-5 text-sm text-ink2"><strong className="block text-navy">No readiness exams yet</strong>They’ll appear here when they’re set up for your courses.</div>}
        {rows?.map((c, i) => (
          <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-[10px] border border-line bg-white px-4 py-3.5">
            <span className="w-5 font-bold text-muted">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <strong className="block text-[15px] text-navy">{c.title}</strong>
              <span className="text-[13px] text-ink2">{[c.programme, `${c.catMin ?? '?'} to ${c.questions} questions`, `up to ${c.minutes} min`].filter(Boolean).join(' · ')}</span>
            </div>
            <span className="text-[13px] text-ink2">{c.lastBand ? <>Last: <strong className="text-navy">{BAND_LABEL[c.lastBand]}</strong></> : c.open ? 'Not taken yet' : ''}{c.attemptsLeft != null && c.open ? ` · ${c.attemptsLeft} left` : ''}</span>
            {!c.open ? <Link href="/student/catalogue" className="h-9 rounded-md border border-line px-3.5 text-[13px] font-semibold leading-9 text-navy">Unlock</Link> : (
              <div className="flex gap-2">
                {c.lastResult && <Link href={`/student/tests/${c.lastResult}/result`} className="h-9 rounded-md border border-line px-3.5 text-[13px] font-semibold leading-9 text-navy">Review</Link>}
                {c.inProgress
                  ? <Link href={`/student/tests/cat/${c.inProgress}`} className="h-9 rounded-md bg-[#3F6FE8] px-3.5 text-[13px] font-semibold leading-9 text-white">Continue</Link>
                  : <button disabled={!!busy || c.attemptsLeft === 0} onClick={() => start(c)} className="h-9 rounded-md bg-[#3F6FE8] px-3.5 text-[13px] font-semibold text-white disabled:opacity-50">{c.attemptsLeft === 0 ? 'No attempts left' : busy === c.id ? 'Starting…' : 'Start exam'}</button>}
              </div>
            )}
          </div>
        ))}
        <h2 className="mt-2 text-base font-bold text-navy">Good to know</h2>
        {FAQ.map(([q, a], i) => (
          <div key={q} className="rounded-[10px] border border-line bg-white">
            <button onClick={() => setOpen(open === i ? null : i)} aria-expanded={open === i} className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-semibold text-navy">{q}<span className="text-muted">{open === i ? '−' : '+'}</span></button>
            {open === i && <p className="px-4 pb-3 text-[13.5px] text-ink2">{a}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
