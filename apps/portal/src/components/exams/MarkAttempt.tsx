'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Written {
  questionId: string; number: number; type: string; text: string; parts: { label?: string; text?: string; marks?: number; markScheme?: string }[];
  modelAnswer: string | null; explanation: string | null; marks: number; answer: unknown; score: number | null; feedback: string | null;
}
interface Attempt { exam: { title: string; passMark: number }; student: string; score: number | null; maxScore: number; submittedAt: string; written: Written[] }

const field = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-navy outline-none focus:border-[#5889FA]';

/** A teacher marks the written answers in one student's mock exam attempt. */
export function MarkAttempt({ back }: { back: string }) {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [a, setA] = useState<Attempt | null>(null);
  const [marks, setMarks] = useState<Record<string, { score: string; feedback: string }>>({});
  const [saving, setSaving] = useState('');

  const load = useCallback(() => api.get(`/mock-exams/attempts/${sessionId}`).then(r => {
    setA(r.data);
    setMarks(Object.fromEntries(r.data.written.map((w: Written) => [w.questionId, { score: w.score == null ? '' : String(w.score), feedback: w.feedback ?? '' }])));
  }).catch(e => notify.error(e?.response?.data?.message ?? 'Could not open this attempt')), [sessionId]);
  useEffect(() => { load(); }, [load]);

  async function save(w: Written) {
    const m = marks[w.questionId];
    if (!m || m.score === '') return;
    setSaving(w.questionId);
    try {
      const { data } = await api.post(`/mock-exams/attempts/${sessionId}/mark`, { questionId: w.questionId, score: Number(m.score), feedback: m.feedback });
      notify.success(data.left ? `Saved. ${data.left} left to mark.` : 'All marked. The student can see their result.');
      load();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save the mark'); }
    finally { setSaving(''); }
  }

  const text = (v: unknown) => (v && typeof v === 'object' ? Object.entries(v as Record<string, string>).map(([k, x]) => `${k} ${x}`).join('\n') : String(v ?? ''));
  if (!a) return <div className="flex min-h-full flex-col"><Topbar backHref={back} backLabel="Mock exams" /><p className="p-7 text-sm text-muted">Loading…</p></div>;
  const left = a.written.filter(w => w.score == null).length;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref={back} backLabel="Mock exams" />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-navy">Mark {a.student}’s answers</h1>
          <p className="mt-1 text-sm text-ink2">{a.exam.title} · score so far {a.score ?? 0} / {a.maxScore} · pass mark {a.exam.passMark}% · {left ? `${left} to mark` : 'all marked'}</p>
        </div>
        {a.written.map(w => {
          const m = marks[w.questionId] ?? { score: '', feedback: '' };
          return (
            <section key={w.questionId} className="flex flex-col gap-3 rounded-[10px] border border-line bg-white p-5">
              <p className="text-[12.5px] text-muted">Question {w.number} · {w.marks} marks{w.score != null ? ` · marked ${w.score}` : ''}</p>
              <p className="whitespace-pre-line text-[15px] font-semibold text-navy">{w.text}</p>
              {w.parts.map(p => <p key={p.label} className="text-sm text-navy"><strong>{p.label}</strong> {p.text} <span className="text-muted">({p.marks} marks)</span>{p.markScheme && <span className="mt-0.5 block rounded-md bg-[#EAF0FF] px-2.5 py-1 text-[13px]"><strong>Scheme:</strong> {p.markScheme}</span>}</p>)}
              <div className="rounded-lg border border-line bg-subtle p-3 text-sm text-navy"><span className="text-xs font-semibold text-muted">Student’s answer</span><p className="mt-1 whitespace-pre-line">{text(w.answer) || <em className="text-muted">Left blank</em>}</p></div>
              {(w.modelAnswer || w.explanation) && <p className="rounded-lg bg-[#EAF0FF] px-3 py-2 text-[13px] text-navy">{w.modelAnswer && <><strong>Model answer:</strong> {w.modelAnswer} </>}{w.explanation && <><strong>Why:</strong> {w.explanation}</>}</p>}
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Mark<input aria-label={`Mark for question ${w.number}`} type="number" min={0} max={w.marks} step={0.5} className={`${field} w-24`} value={m.score} onChange={e => setMarks(x => ({ ...x, [w.questionId]: { ...m, score: e.target.value } }))} /></label>
                <span className="pb-2 text-sm text-ink2">out of {w.marks}</span>
                <label className="flex min-w-[240px] flex-1 flex-col gap-1 text-[13px] font-semibold text-navy">Feedback <span className="font-normal text-muted">(optional, the student sees it)</span><input className={field} value={m.feedback} onChange={e => setMarks(x => ({ ...x, [w.questionId]: { ...m, feedback: e.target.value } }))} /></label>
                <button disabled={saving === w.questionId || m.score === ''} onClick={() => save(w)} className="h-[38px] rounded-md bg-[#3F6FE8] px-4 text-[13.5px] font-semibold text-white disabled:opacity-50">{w.score != null ? 'Update' : 'Save mark'}</button>
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
