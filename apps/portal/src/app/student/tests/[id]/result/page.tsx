'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { QuestionCard, TestQuestion } from '@/components/tests/QuestionCard';
import { BAND_LABEL, BANDS, REASON } from '@/components/tests/cat';
import { Celebrate } from '@/components/celebrate/Celebrate';

interface Result {
  title: string; mode: string; submittedAt: string; usedSecs: number; timeLimitSecs: number | null;
  score: number; maxScore: number; percent: number; total: number; right: number; wrong: number; pending: number; flagged: number;
  topics: { topic: string; moduleId: string | null; score: number; max: number; percent: number; avgSecs: number; count: number; pending: number }[];
  exam: { id: string; kind: 'MOCK' | 'PAST_PAPER'; title: string; passMark: number; showAnswers: boolean } | null;
  passed: boolean | null; rank: { better: number; takers: number } | null; waitingForTeacher: number;
  cat: { decision: 'ABOVE' | 'BELOW' | 'UNDECIDED'; reason: string; probability: number; band: string; items: number; byArea: { area: string; items: number; right: number; standing: 'ABOVE' | 'NEAR' | 'BELOW' }[] } | null;
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

  if (r.cat) {
    const c = r.cat;
    const heading = c.decision === 'UNDECIDED' ? 'Not enough answers for a result' : c.decision === 'ABOVE' ? 'Likely ready, keep it up' : 'Not ready yet. Here’s where to focus';
    return (
      <div className="flex min-h-full flex-col">
        <Topbar backHref="/student/tests/cat" backLabel="CAT readiness" />
        <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-6">
          {c.decision === 'ABOVE' && (
            <Celebrate emoji="🎯" l1="Ready, by our" l2="readiness test."
              sub={`${r.title} stopped after ${c.items} questions: about a ${Math.round(c.probability * 100)}% chance you’re above the standard.`}
              next={{ label: 'What to practise next', href: '/student/tests' }}
              share={{ c1: r.title.split(/\s+/)[0] || 'Exam', c2: 'ready.', c3: `Readiness: ${BAND_LABEL[c.band] ?? 'Ready'} · CareerPath Africa practice test`, label: 'Practice estimate' }} />
          )}
          <div>
            <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-navy">{heading}</h1>
            <p className="mt-1 text-sm text-ink2">CAT readiness · {r.title} · {c.items} questions · {REASON[c.reason] ?? ''}</p>
          </div>
          <section className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-white p-[18px]">
            <h2 className="text-[15px] font-bold text-navy">Your readiness</h2>
            <div className="grid grid-cols-2 gap-1 sm:grid-cols-4">
              {BANDS.map(b => <span key={b} className={`rounded-md px-2 py-2.5 text-center text-[13px] ${c.decision !== 'UNDECIDED' && c.band === b ? 'bg-[#3F6FE8] font-bold text-white' : 'bg-subtle text-muted'}`}>{BAND_LABEL[b]}</span>)}
            </div>
            {c.decision !== 'UNDECIDED' && <p className="text-[13px] text-ink2">From your answers, there’s about a {Math.round(c.probability * 100)}% chance you’re above the passing standard.</p>}
            {c.decision === 'UNDECIDED' && <p className="text-[13px] text-ink2">The test needs a minimum number of answers before it can judge. Try again when you have time to finish.</p>}
            <p className="text-xs text-muted">A practice estimate from your answers on CareerPath Africa. It isn’t an official score and doesn’t guarantee a result.</p>
          </section>
          <div className="grid gap-3 sm:grid-cols-3">
            {[{ l: 'Questions', v: String(c.items), d: REASON[c.reason] ?? '' }, { l: 'Right', v: `${r.right} of ${c.items}`, d: 'Harder questions follow right answers' }, { l: 'Time', v: mins(r.usedSecs), d: r.timeLimitSecs ? `of ${mins(r.timeLimitSecs)}` : '' }].map(t => (
              <div key={t.l} className="rounded-[10px] border border-line bg-white px-4 py-3.5"><span className="text-[12.5px] text-muted">{t.l}</span><p className="mt-0.5 text-2xl font-extrabold text-navy">{t.v}</p><span className="text-xs text-ink2">{t.d}</span></div>
            ))}
          </div>
          {c.byArea.length > 0 && (
            <section className="overflow-x-auto rounded-[10px] border border-line bg-white">
              <table className="w-full min-w-[480px] border-collapse text-[13.5px] text-navy">
                <thead><tr className="bg-subtle text-left text-ink2"><th className="px-4 py-2.5 font-semibold">Area</th><th className="font-semibold">Questions</th><th className="font-semibold">Right</th><th className="pr-4 font-semibold">Compared with the standard</th></tr></thead>
                <tbody>{c.byArea.map(a => (
                  <tr key={a.area} className="border-t border-line"><td className="px-4 py-2.5">{a.area}</td><td>{a.items}</td><td>{a.right}</td>
                    <td className={`pr-4 font-semibold ${a.standing === 'BELOW' ? 'text-[#C1352B]' : ''}`}>{a.standing === 'ABOVE' ? 'Above' : a.standing === 'BELOW' ? 'Below' : 'Near'}</td></tr>
                ))}</tbody>
              </table>
            </section>
          )}
          <div className="flex flex-wrap gap-2.5">
            <button onClick={() => setReview(v => !v)} className="h-10 rounded-md bg-[#3F6FE8] px-4 text-[13.5px] font-semibold text-white">{review ? 'Hide answers' : 'Review my answers'}</button>
            {r.wrong > 0 && <button onClick={retake} disabled={busy} className="h-10 rounded-md border border-line bg-white px-4 text-[13.5px] font-semibold text-navy disabled:opacity-50">Practise what I got wrong ({r.wrong})</button>}
          </div>
          {review && (questions ?? []).map(q => (
            <section key={q.id} className="rounded-[10px] border border-line bg-white p-5"><QuestionCard q={q} value={q.answer} onChange={() => {}} locked /></section>
          ))}
        </div>
      </div>
    );
  }

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
        {r.exam && r.passed && !r.waitingForTeacher && (() => {
          const best = [...r.topics].filter(t => t.max > 0).sort((a, b) => b.percent - a.percent)[0];
          const what = r.exam.kind === 'PAST_PAPER' ? 'past paper' : 'mock';
          return (
            <Celebrate emoji="🎉" l1="You passed." l2={`${r.percent}% on ${r.exam.title}.`}
              sub={`The pass mark was ${r.exam.passMark}%.${best ? ` Your strongest area was ${best.topic}.` : ''}`}
              next={{ label: 'See my answers', onClick: () => { setReview(true); setTimeout(() => document.getElementById('answers')?.scrollIntoView({ behavior: 'smooth' }), 50); } }}
              share={{ c1: 'Passed my', c2: /mock|paper/i.test(r.exam.title) ? `${r.exam.title}.` : `${r.exam.title} ${what}.`, c3: `Scored ${r.percent}% · practising on CareerPath Africa`, label: 'Mock result' }} />
          );
        })()}
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-navy">You scored {r.percent}%</h1>
          <p className="mt-1 text-sm text-ink2">{[r.title, r.exam?.kind === 'MOCK' ? 'Mock exam' : r.exam?.kind === 'PAST_PAPER' ? (r.mode === 'EXAM' ? 'Past paper' : 'Past paper practice') : r.mode === 'EXAM' ? 'Exam' : 'Practice'].filter((x, n, all) => all.indexOf(x) === n).join(' · ')}</p>
        </div>
        {r.exam && (
          <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg px-4 py-3 text-sm ${r.waitingForTeacher ? 'border border-line bg-white text-navy' : r.passed ? 'bg-[#3F6FE8] text-white' : 'border border-[#EFC4C0] bg-[#FDF1F0] text-navy'}`}>
            <strong>{r.waitingForTeacher ? `Your teacher is marking ${r.waitingForTeacher} written ${r.waitingForTeacher === 1 ? 'answer' : 'answers'}` : r.passed ? `Passed. The pass mark is ${r.exam.passMark}%` : `Not a pass yet. The pass mark is ${r.exam.passMark}%`}</strong>
            {r.waitingForTeacher > 0 && <span>Your score will update when they’re done.</span>}
            {r.rank && <span>{r.rank.better === 0 ? 'Top score so far' : `${r.rank.better} of ${r.rank.takers} students did better`}</span>}
            {!r.exam.showAnswers && <span>Your teacher keeps the right answers back for this exam.</span>}
          </div>
        )}
        {r.pending > 0 && !r.waitingForTeacher && (
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
                  <td className={`pr-4 font-semibold ${t.pending ? 'text-ink2' : t.percent < 60 ? 'text-[#C1352B]' : ''}`}>{t.pending ? 'To mark' : t.percent < 60 ? 'Weak' : t.percent < 75 ? 'Fair' : 'Strong'}</td>
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
            <div id="answers" role="tablist" className="flex flex-wrap gap-1 self-start rounded-lg border border-line bg-white p-[3px] text-[13px]">
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
