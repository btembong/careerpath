'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { QuestionCard, TestQuestion } from '@/components/tests/QuestionCard';

interface Result {
  title: string; mode: string; submittedAt: string; usedSecs: number; timeLimitSecs: number | null;
  score: number; maxScore: number; percent: number; total: number; right: number; wrong: number; pending: number; flagged: number;
  topics: { topic: string; moduleId: string | null; score: number; max: number; percent: number; avgSecs: number; count: number; pending: number }[];
}

const mins = (s: number) => (s < 60 ? `${s} sec` : `${Math.round(s / 60)} min`);

export default function TestResultPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [r, setR] = useState<Result | null>(null);
  const [questions, setQuestions] = useState<TestQuestion[] | null>(null);
  const [review, setReview] = useState(false);
  const [only, setOnly] = useState<'all' | 'wrong' | 'flagged' | 'mark'>('all');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.get(`/test-centre/sessions/${id}/result`).then(x => setR(x.data)).catch(err => {
      if (err?.response?.status === 400) router.replace(`/student/tests/${id}`);
      else notify.error('Could not load your result');
    });
    api.get(`/test-centre/sessions/${id}`).then(x => setQuestions(x.data.questions)).catch(() => {});
  }, [id, router]);
  useEffect(load, [load]);

  async function retake() {
    setBusy(true);
    try {
      const { data } = await api.post('/test-centre/sessions', { preset: 'retake', fromSessionId: id });
      router.push(`/student/tests/${data.id}`);
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not start'); setBusy(false); }
  }

  async function selfMark(questionId: string, score: number) {
    try { await api.post(`/test-centre/sessions/${id}/self-mark`, { questionId, score }); load(); }
    catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not save your mark'); }
  }

  async function aiMark(questionId: string) {
    try { await api.post(`/test-centre/sessions/${id}/ai-mark`, { questionId }); load(); }
    catch (err: any) { notify.error(err?.response?.data?.message ?? 'AI marking didn’t work. Mark yourself instead.'); }
  }

  if (!r) return <div className="flex min-h-full flex-col"><Topbar backHref="/student/tests" backLabel="Test Centre" /><p className="p-7 text-sm text-muted">Loading your result…</p></div>;

  const shown = (questions ?? []).filter(q => only === 'all' || (only === 'wrong' && q.reveal?.isCorrect === false) || (only === 'flagged' && q.flagged) || (only === 'mark' && q.reveal?.needsSelfMark));
  const tiles = [
    { l: 'Score', v: `${r.score} / ${r.maxScore}`, d: r.pending ? `${r.pending} still to mark` : `${r.right} right, ${r.wrong} wrong` },
    { l: 'Questions', v: String(r.total), d: `${r.flagged} flagged` },
    { l: 'Time', v: mins(r.usedSecs), d: r.timeLimitSecs ? `of ${mins(r.timeLimitSecs)}` : 'No time limit' },
    { l: 'Average per question', v: mins(r.total ? Math.round(r.usedSecs / r.total) : 0), d: new Date(r.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/student/tests" backLabel="Test Centre" />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-navy">You scored {r.percent}%</h1>
          <p className="mt-1 text-sm text-ink2">{[r.title, r.mode === 'EXAM' ? 'Exam' : 'Practice'].filter((x, n, all) => all.indexOf(x) === n).join(' · ')}</p>
        </div>
        {r.pending > 0 && (
          <button onClick={() => { setReview(true); setOnly('mark'); }} className="rounded-lg border border-[#5889FA] bg-[#EAF0FF] px-4 py-3 text-left text-sm text-navy">
            <strong>{r.pending} written {r.pending === 1 ? 'answer needs' : 'answers need'} marking.</strong> Compare with the model answer and mark yourself; your score updates. →
          </button>
        )}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map(t => (
            <div key={t.l} className="rounded-[10px] border border-line bg-white px-4 py-3.5">
              <span className="text-[12.5px] text-muted">{t.l}</span>
              <p className="mt-0.5 text-2xl font-extrabold text-navy">{t.v}</p>
              <span className="text-xs text-ink2">{t.d}</span>
            </div>
          ))}
        </div>

        <section className="overflow-x-auto rounded-[10px] border border-line bg-white">
          <table className="w-full min-w-[520px] border-collapse text-[13.5px] text-navy">
            <thead><tr className="bg-subtle text-left text-ink2"><th className="px-4 py-2.5 font-semibold">Topic</th><th className="font-semibold">Score</th><th className="font-semibold">Avg time</th><th className="pr-4 font-semibold">Result</th></tr></thead>
            <tbody>
              {r.topics.map(t => (
                <tr key={t.topic} className="border-t border-line">
                  <td className="px-4 py-2.5">{t.topic}</td>
                  <td>{t.score} / {t.max} · {t.percent}%</td>
                  <td>{t.avgSecs} sec</td>
                  <td className={`pr-4 font-semibold ${t.percent < 60 ? 'text-[#C1352B]' : ''}`}>{t.pending ? 'To mark' : t.percent < 60 ? 'Weak' : t.percent < 75 ? 'Fair' : 'Strong'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <div className="flex flex-wrap gap-2.5">
          <button onClick={() => setReview(v => !v)} className="h-10 rounded-md bg-[#3F6FE8] px-4 text-[13.5px] font-semibold text-white">{review ? 'Hide answers' : 'Review every answer'}</button>
          {r.wrong > 0 && <button onClick={retake} disabled={busy} className="h-10 rounded-md border border-line bg-white px-4 text-[13.5px] font-semibold text-navy disabled:opacity-50">Practise what I got wrong ({r.wrong})</button>}
        </div>

        {review && (
          <>
            <div role="tablist" className="flex flex-wrap gap-1 self-start rounded-lg border border-line bg-white p-[3px] text-[13px]">
              {([['all', 'All'], ['wrong', 'Wrong'], ['flagged', 'Flagged'], ['mark', 'To mark']] as const).map(([k, l]) => (
                <button key={k} role="tab" aria-selected={only === k} onClick={() => setOnly(k)} className={`rounded-md px-2.5 py-1 ${only === k ? 'bg-[#EAF0FF] font-semibold text-navy' : 'text-ink2'}`}>{l}</button>
              ))}
            </div>
            {!shown.length && <p className="text-sm text-muted">Nothing here.</p>}
            {shown.map(q => (
              <section key={q.id} className="rounded-[10px] border border-line bg-white p-5">
                <QuestionCard q={q} value={q.answer} onChange={() => {}} locked onSelfMark={score => selfMark(q.id, score)} onAiMark={() => aiMark(q.id)} />
              </section>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
