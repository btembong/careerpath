'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { QuestionCard, TestQuestion } from '@/components/tests/QuestionCard';

interface View {
  id: string; title: string; status: string; number: number; min: number; max: number; remainingSecs: number | null;
  question: Omit<TestQuestion, 'answer' | 'flagged' | 'reveal' | 'parts' | 'difficulty'> | null;
}
const clock = (s: number) => { const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60; return h ? `${h}:${String(m).padStart(2, '0')}:${String(x).padStart(2, '0')}` : `${m}:${String(x).padStart(2, '0')}`; };
const given = (v: unknown) => v != null && v !== '' && !(typeof v === 'object' && Object.values(v as object).every(x => !String(x ?? '').trim()));

/** An adaptive test: one question at a time, no going back, no skipping. */
export default function CatRunner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [v, setV] = useState<View | null>(null);
  const [value, setValue] = useState<unknown>(null);
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [quit, setQuit] = useState(false);
  const shown = useRef(Date.now());

  const load = useCallback(async () => {
    const { data } = await api.get<View>(`/test-centre/cat/${id}`);
    if (data.status !== 'IN_PROGRESS' || !data.question) { router.replace(`/student/tests/${id}/result`); return; }
    setV(data); setLeft(data.remainingSecs); setValue(null); shown.current = Date.now();
  }, [id, router]);
  useEffect(() => { load().catch(() => notify.error('Could not open this test')); }, [load]);

  useEffect(() => {
    if (left == null) return;
    if (left <= 0) { load().catch(() => router.replace(`/student/tests/${id}/result`)); return; }
    const t = setTimeout(() => setLeft(l => (l == null ? l : l - 1)), 1000);
    return () => clearTimeout(t);
  }, [left, load, id, router]);

  async function submit() {
    if (!v?.question || !given(value)) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/test-centre/cat/${id}/answer`, { questionId: v.question.id, answer: value, timeSecs: Math.round((Date.now() - shown.current) / 1000) });
      if (data.done) router.replace(`/student/tests/${id}/result`); else await load();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Your answer didn’t send. Check your connection and try again.');
      if (/Time is up|finished/.test(err?.response?.data?.message ?? '')) router.replace(`/student/tests/${id}/result`);
    } finally { setBusy(false); }
  }

  async function end() {
    setBusy(true);
    try { await api.post(`/test-centre/sessions/${id}/submit`); router.replace(`/student/tests/${id}/result`); }
    catch { notify.error('Could not end the test'); setBusy(false); }
  }

  if (!v?.question) return <div className="p-7 text-sm text-muted">Loading your test…</div>;
  const q: TestQuestion = { ...v.question, answer: value, flagged: false, reveal: null, parts: [], difficulty: '' }; // no difficulty shown: that's what the test is adjusting

  return (
    <div className="flex min-h-full flex-col gap-4 bg-surface p-4 lg:px-7 lg:py-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-[10px] bg-[#3F6FE8] px-4 py-3 text-white">
        <strong className="text-sm">CAT readiness · {v.title}</strong>
        <span className="flex-1 text-[13px]">Question {v.number} · ends between {v.min} and {v.max} questions</span>
        {left != null && <strong role="timer" className="text-lg tabular-nums">{clock(left)}</strong>}
        <button onClick={() => setQuit(true)} className="text-[13px] font-semibold text-white/90 underline">End test</button>
      </div>
      <section className="mx-auto flex w-full max-w-3xl flex-col gap-4 rounded-[10px] border border-line bg-white p-5">
        <QuestionCard key={q.id} q={{ ...q, marks: 1 }} value={value} onChange={setValue} locked={busy} />
        <div className="flex flex-wrap items-center gap-2.5 border-t border-line pt-3">
          <span className="flex-1 text-[12.5px] text-muted">Each answer sets the next question. You can’t go back or skip.</span>
          <button onClick={submit} disabled={busy || !given(value)} className="h-[38px] rounded-md bg-[#3F6FE8] px-5 text-[13.5px] font-semibold text-white disabled:opacity-50">{busy ? 'Sending…' : 'Submit answer'}</button>
        </div>
      </section>
      {quit && (
        <div role="dialog" aria-modal="true" aria-label="End test" className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
          <div className="flex w-full max-w-sm flex-col gap-3 rounded-[10px] bg-white p-5">
            <strong className="text-lg text-navy">End this test now?</strong>
            <p className="text-sm text-ink2">{v.number - 1 < v.min ? `You’ve answered ${v.number - 1} of the ${v.min} needed for a result, so this attempt won’t give you one. It still counts as an attempt.` : 'You’ll get a result from your answers so far.'}</p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setQuit(false)} className="h-9 rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy">Keep going</button>
              <button onClick={end} disabled={busy} className="h-9 rounded-md bg-[#3F6FE8] px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-50">End test</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
