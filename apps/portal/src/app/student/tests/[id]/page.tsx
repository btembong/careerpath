'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { QuestionCard, TestQuestion } from '@/components/tests/QuestionCard';

interface Session { id: string; title: string; mode: 'PRACTICE' | 'EXAM'; status: string; remainingSecs: number | null; questions: TestQuestion[] }

function clock(secs: number) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}
const given = (v: unknown) => v != null && v !== '' && !(typeof v === 'object' && Object.values(v as object).every(x => !String(x ?? '').trim()));

export default function TakeTestPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [s, setS] = useState<Session | null>(null);
  const [i, setI] = useState(0);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const shownAt = useRef(Date.now());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ questionId: string; answer: unknown } | null>(null);

  const load = useCallback(async () => {
    const { data } = await api.get<Session>(`/test-centre/sessions/${id}`);
    if (data.status === 'SUBMITTED') { router.replace(`/student/tests/${id}/result`); return; }
    setS(data);
    setLeft(data.remainingSecs);
    setValues(Object.fromEntries(data.questions.map(q => [q.id, q.answer])));
    const first = data.questions.findIndex(q => q.answer == null);
    setI(first >= 0 ? first : 0);
  }, [id, router]);

  useEffect(() => { load().catch(() => notify.error('Could not open this test')); }, [load]);

  const send = useCallback(async (body: { questionId: string; answer?: unknown; flagged?: boolean }) => {
    const timeSecs = Math.round((Date.now() - shownAt.current) / 1000);
    shownAt.current = Date.now();
    try {
      const { data } = await api.post<TestQuestion>(`/test-centre/sessions/${id}/answer`, { ...body, timeSecs });
      setSaveFailed(false);
      return data;
    } catch (err: any) {
      if (err?.response?.status === 400 && /Time is up|finished/.test(err.response.data?.message ?? '')) router.replace(`/student/tests/${id}/result`);
      else setSaveFailed(true);
      return null;
    }
  }, [id, router]);

  const flush = useCallback(async () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const p = pending.current;
    pending.current = null;
    if (p) await send(p);
  }, [send]);

  // The server holds the real clock; this just shows it, and picks up the result when it runs out
  useEffect(() => {
    if (left == null) return;
    if (left <= 0) { flush().finally(() => router.replace(`/student/tests/${id}/result`)); return; }
    const t = setTimeout(() => setLeft(l => (l == null ? l : l - 1)), 1000);
    return () => clearTimeout(t);
  }, [left, id, router, flush]);

  // Answers save as you go; only warn when one is still waiting to save
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (pending.current) e.preventDefault(); };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);

  if (!s) return <div className="p-7 text-sm text-muted">Loading your test…</div>;
  const q = s.questions[i];
  if (!q) return <div className="p-7 text-sm text-muted">This test has no questions. <Link href="/student/tests" className="font-semibold text-[#3F6FE8]">Back to the Test Centre</Link></div>;

  const exam = s.mode === 'EXAM';
  const answered = s.questions.filter(x => given(values[x.id])).length;
  const flagged = s.questions.filter(x => x.flagged).length;
  const right = s.questions.filter(x => x.reveal?.isCorrect).length;
  const revealed = !!q.reveal;
  const last = i === s.questions.length - 1;

  const setQuestion = (next: TestQuestion) => setS(cur => (cur ? { ...cur, questions: cur.questions.map(x => (x.id === next.id ? next : x)) } : cur));

  function change(v: unknown) {
    setValues(cur => ({ ...cur, [q.id]: v }));
    if (!exam) return;
    pending.current = { questionId: q.id, answer: v };
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(flush, typeof v === 'string' && q.type !== 'MCQ' && q.type !== 'TRUE_FALSE' ? 800 : 0);
  }

  async function go(n: number) {
    await flush();
    shownAt.current = Date.now();
    setI(n);
    document.querySelector('main')?.scrollTo?.({ top: 0 });
  }

  async function check() {
    setBusy(true);
    const data = await send({ questionId: q.id, answer: values[q.id] });
    if (data) setQuestion(data);
    setBusy(false);
  }

  async function flag() {
    const data = await send({ questionId: q.id, flagged: !q.flagged });
    if (data) setQuestion(data);
  }

  async function selfMark(score: number) {
    try {
      await api.post(`/test-centre/sessions/${id}/self-mark`, { questionId: q.id, score });
      setQuestion({ ...q, reveal: q.reveal ? { ...q.reveal, score, needsSelfMark: false, isCorrect: score >= q.marks / 2 } : null });
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not save your mark'); }
  }

  async function finish() {
    setBusy(true);
    await flush();
    try {
      await api.post(`/test-centre/sessions/${id}/submit`);
      router.replace(`/student/tests/${id}/result`);
    } catch { notify.error('Could not submit. Check your connection and try again.'); setBusy(false); }
  }

  return (
    <div className="flex min-h-full flex-col gap-4 bg-surface p-4 lg:px-7 lg:py-6">
      <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] px-4 py-3 ${exam ? 'bg-[#3F6FE8] text-white' : 'border border-line bg-white text-navy'}`}>
        <strong className="text-sm">{[exam ? 'Exam' : 'Practice', s.title].filter((x, n, all) => all.indexOf(x) === n).join(' · ')}</strong>
        <span className="flex-1 text-[13px]">Question {i + 1} of {s.questions.length}{!exam && ` · ${right} right so far`}</span>
        {left != null && <strong role="timer" className={`text-lg tabular-nums ${left < 60 ? 'animate-pulse' : ''}`}>{clock(left)}</strong>}
        {!exam && <button onClick={finish} disabled={busy} className="text-[13px] font-semibold text-[#3F6FE8]">End practice</button>}
      </div>
      {saveFailed && <p role="alert" className="rounded-lg border border-[#EFC4C0] bg-[#FDF1F0] px-3.5 py-2.5 text-[13px] text-[#C1352B]">Your last answer didn’t save. Check your connection; it will save when you move on.</p>}

      <div className={`grid items-start gap-3.5 ${exam ? 'lg:grid-cols-[1fr_280px]' : ''}`}>
        <section className="flex min-w-0 flex-col gap-4 rounded-[10px] border border-line bg-white p-5">
          <QuestionCard key={q.id} q={q} value={values[q.id]} onChange={change} locked={revealed && !exam} onSelfMark={selfMark} />
          <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-3">
            {i > 0 && <button onClick={() => go(i - 1)} className="h-[38px] rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy">Back</button>}
            <button onClick={flag} aria-pressed={q.flagged} className={`h-[38px] rounded-md border px-3.5 text-[13.5px] font-semibold ${q.flagged ? 'border-[#5889FA] bg-[#EAF0FF] text-navy' : 'border-line text-navy'}`}>{q.flagged ? '⚑ Flagged' : '⚑ Flag for review'}</button>
            <span className="min-w-[120px] flex-1 text-[12.5px] text-muted">{exam ? 'Answers and your score appear after you submit.' : 'You see the answer straight away. Nothing here counts as a grade.'}</span>
            {!exam && !revealed && <button onClick={check} disabled={busy || !given(values[q.id])} className="h-[38px] rounded-md bg-[#3F6FE8] px-4 text-[13.5px] font-semibold text-white disabled:opacity-50">Check answer</button>}
            {!exam && !revealed && !last && <button onClick={() => go(i + 1)} className="h-[38px] rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy">Skip</button>}
            {!exam && revealed && (last
              ? <button onClick={finish} disabled={busy || !!q.reveal?.needsSelfMark} className="h-[38px] rounded-md bg-[#3F6FE8] px-4 text-[13.5px] font-semibold text-white disabled:opacity-50">See my results</button>
              : <button onClick={() => go(i + 1)} disabled={!!q.reveal?.needsSelfMark} className="h-[38px] rounded-md bg-[#3F6FE8] px-4 text-[13.5px] font-semibold text-white disabled:opacity-50">Next question</button>)}
            {exam && !last && <button onClick={() => go(i + 1)} className="h-[38px] rounded-md bg-[#3F6FE8] px-4 text-[13.5px] font-semibold text-white">Next</button>}
            {exam && last && <button onClick={() => setConfirm(true)} className="h-[38px] rounded-md bg-[#3F6FE8] px-4 text-[13.5px] font-semibold text-white">Submit exam</button>}
          </div>
        </section>

        {exam && (
          <aside className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-white p-4 lg:sticky lg:top-4">
            <strong className="text-sm text-navy">Questions</strong>
            <div className="grid grid-cols-6 gap-1.5">
              {s.questions.map((x, n) => (
                <button key={x.id} onClick={() => go(n)} aria-label={`Question ${n + 1}${x.flagged ? ', flagged' : ''}`} aria-current={n === i}
                  className={`h-[30px] rounded-md text-[12.5px] font-semibold ${n === i ? 'bg-navy text-white' : x.flagged ? 'border border-[#5889FA] bg-white text-[#3F6FE8]' : given(values[x.id]) ? 'bg-[#EAF0FF] text-navy' : 'border border-line text-muted'}`}>
                  {x.flagged && n !== i ? '⚑' : n + 1}
                </button>
              ))}
            </div>
            <span className="text-xs text-muted">{answered} answered · {flagged} flagged · {s.questions.length - answered} to go</span>
            <button onClick={() => setConfirm(true)} className="h-9 rounded-md border border-line text-[13px] font-semibold text-navy hover:border-[#5889FA]">Submit exam</button>
          </aside>
        )}
      </div>

      {confirm && (
        <div role="dialog" aria-modal="true" aria-label="Submit exam" className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
          <div className="flex w-full max-w-sm flex-col gap-3 rounded-[10px] bg-white p-5">
            <strong className="text-lg text-navy">Submit your exam?</strong>
            <p className="text-sm text-ink2">{s.questions.length - answered ? `You still have ${s.questions.length - answered} unanswered, and they’ll score zero.` : 'You’ve answered every question.'} You can’t change your answers after this.</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirm(false)} className="h-9 rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy">Keep going</button>
              <button onClick={finish} disabled={busy} className="h-9 rounded-md bg-[#3F6FE8] px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-50">{busy ? 'Submitting…' : 'Submit'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
