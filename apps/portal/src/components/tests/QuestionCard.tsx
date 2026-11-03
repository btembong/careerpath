'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useAiEnabled } from '@/lib/ai';

export interface Reveal {
  isCorrect: boolean | null; score: number | null; correctAnswer: string | null; modelAnswer: string | null;
  explanation: string | null; needsSelfMark: boolean;
  lesson: { id: string; courseId: string; title: string } | null; percentRight: number | null;
  markedBy?: string | null; aiFeedback?: string | null;
}
export interface TestQuestion {
  id: string; type: string; text: string; imageUrl: string | null; difficulty: string;
  options: { id: string; text: string }[] | null;
  parts: { label: string; text: string; marks: number; markScheme?: string }[];
  marks: number; answer: unknown; flagged: boolean; reveal: Reveal | null;
}

export const TYPE_LABEL: Record<string, string> = { MCQ: 'Single answer', TRUE_FALSE: 'True / false', FILL_BLANK: 'Fill the blank', SHORT_ANSWER: 'Short answer', WRITTEN: 'Essay', STRUCTURED: 'Structured' };
export const isWritten = (t: string) => t === 'SHORT_ANSWER' || t === 'WRITTEN' || t === 'STRUCTURED';
const field = 'w-full rounded-lg border border-line bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-[#5889FA] disabled:bg-subtle';

function optionsOf(q: TestQuestion) {
  if (q.type === 'TRUE_FALSE') return [{ id: 'True', text: 'True' }, { id: 'False', text: 'False' }];
  return q.options ?? [];
}

/** One question. `value` is what's been chosen or typed; locked questions can't be changed. */
export function QuestionCard({ q, value, onChange, locked, onSelfMark, onAiMark }: {
  q: TestQuestion; value: unknown; onChange: (v: unknown) => void; locked: boolean; onSelfMark?: (score: number) => void; onAiMark?: () => Promise<void>;
}) {
  const aiOn = useAiEnabled();
  const [aiBusy, setAiBusy] = useState(false);
  const r = q.reveal;
  const same = (a: unknown, b: string | null) => b != null && String(a ?? '').trim().toLowerCase() === b.trim().toLowerCase();
  const partValues = (value && typeof value === 'object' ? value : {}) as Record<string, string>;
  const [mark, setMark] = useState('');

  return (
    <div className="flex flex-col gap-3.5">
      <p className="text-[12.5px] text-muted">{TYPE_LABEL[q.type] ?? q.type} · {q.marks} {q.marks === 1 ? 'mark' : 'marks'} · {q.difficulty[0] + q.difficulty.slice(1).toLowerCase()}</p>
      <p className="whitespace-pre-line text-[17px] font-semibold leading-snug text-navy">{q.text}</p>
      {q.imageUrl && (/* eslint-disable-next-line @next/next/no-img-element */ <img src={q.imageUrl} alt="" className="max-h-72 max-w-full self-start rounded-lg border border-line" />)}

      {(q.type === 'MCQ' || q.type === 'TRUE_FALSE') && optionsOf(q).map((o, i) => {
        const chosen = same(value, o.id);
        const right = r && same(o.id, r.correctAnswer);
        const wrong = r && chosen && !right;
        return (
          <button key={o.id} type="button" disabled={locked} onClick={() => onChange(o.id)} aria-pressed={chosen}
            className={`flex items-center gap-3 rounded-lg px-3.5 py-3 text-left text-[14.5px] text-navy transition ${right || (!r && chosen) ? 'border border-[#5889FA] bg-[#F3F6FF]' : wrong ? 'border border-[#EFC4C0] bg-[#FDF1F0]' : 'border border-line'} ${locked ? '' : 'hover:border-[#5889FA]'}`}>
            <span className={`flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-md text-[13px] font-bold ${right || (!r && chosen) ? 'bg-[#3F6FE8] text-white' : wrong ? 'bg-[#C1352B] text-white' : 'bg-subtle'}`}>{String.fromCharCode(65 + i)}</span>
            <span className="flex-1">{o.text}</span>
            {right && <strong className="text-[12.5px]">✓ Correct answer</strong>}
            {wrong && <strong className="text-[12.5px]">Your answer</strong>}
          </button>
        );
      })}

      {q.type === 'FILL_BLANK' && <input aria-label="Your answer" className={field} disabled={locked} value={String(value ?? '')} onChange={e => onChange(e.target.value)} placeholder="Type your answer" />}
      {(q.type === 'SHORT_ANSWER' || q.type === 'WRITTEN') && <textarea aria-label="Your answer" className={field} rows={q.type === 'WRITTEN' ? 9 : 4} disabled={locked} value={String(value ?? '')} onChange={e => onChange(e.target.value)} placeholder="Type your answer" />}
      {q.type === 'STRUCTURED' && q.parts.map(p => (
        <div key={p.label} className="flex flex-col gap-1.5">
          <div className="flex justify-between gap-3 text-[14.5px] text-navy"><span><strong>{p.label}</strong> {p.text}</span><span className="flex-shrink-0 text-[13px] text-muted">{p.marks} {p.marks === 1 ? 'mark' : 'marks'}</span></div>
          <textarea aria-label={`Answer to ${p.label}`} className={field} rows={3} disabled={locked} value={partValues[p.label] ?? ''} onChange={e => onChange({ ...partValues, [p.label]: e.target.value })} />
          {p.markScheme && <p className="rounded-md bg-[#EAF0FF] px-3 py-2 text-[13px] text-navy"><strong>Marking scheme:</strong> {p.markScheme}</p>}
        </div>
      ))}

      {r && q.type === 'FILL_BLANK' && <p className={`text-sm font-semibold ${r.isCorrect ? 'text-[#2F57C9]' : 'text-[#C1352B]'}`}>{r.isCorrect ? '✓ Correct' : `Correct answer: ${r.correctAnswer}`}</p>}
      {r && (r.explanation || r.modelAnswer || r.lesson || r.percentRight != null) && (
        <div className="flex flex-col gap-1.5 rounded-lg bg-[#EAF0FF] p-3.5 text-sm leading-snug text-navy">
          {r.modelAnswer && <span><strong>Model answer:</strong> {r.modelAnswer}</span>}
          {r.explanation ? <span><strong>Why:</strong> <span className="whitespace-pre-line">{r.explanation}</span></span> : !isWritten(q.type) && <span className="text-ink2">The teacher hasn’t added an explanation for this one yet.</span>}
          {(r.lesson || r.percentRight != null) && (
            <span className="text-[13px]">
              {r.lesson && <Link href={`/student/learn/${r.lesson.courseId}/lesson/${r.lesson.id}`} className="font-semibold text-[#3F6FE8]">Open the lesson: {r.lesson.title} →</Link>}
              {r.lesson && r.percentRight != null && ' · '}
              {r.percentRight != null && `${r.percentRight}% of students got this right`}
            </span>
          )}
        </div>
      )}
      {r?.needsSelfMark && onSelfMark && (
        <form onSubmit={e => { e.preventDefault(); if (mark !== '') onSelfMark(Number(mark)); }} className="flex flex-wrap items-center gap-2 rounded-lg border border-[#5889FA] p-3 text-sm text-navy">
          <span className="font-semibold">Mark yourself against the answer:</span>
          <input aria-label="Your mark" type="number" min={0} max={q.marks} step={0.5} value={mark} onChange={e => setMark(e.target.value)} className="h-9 w-16 rounded-lg border border-line text-center outline-none focus:border-[#5889FA]" />
          <span>out of {q.marks}</span>
          <button className="h-9 rounded-md bg-[#3F6FE8] px-3 font-semibold text-white disabled:opacity-50" disabled={mark === ''}>Save mark</button>
          {aiOn && onAiMark && <button type="button" disabled={aiBusy} onClick={async () => { setAiBusy(true); try { await onAiMark(); } finally { setAiBusy(false); } }} className="h-9 rounded-md border border-[#5889FA] px-3 font-semibold text-[#3F6FE8] disabled:opacity-50">{aiBusy ? 'Marking…' : 'Mark with AI'}</button>}
        </form>
      )}
      {r && isWritten(q.type) && r.score != null && <p className="text-sm font-semibold text-[#2F57C9]">{r.markedBy === 'AI' ? 'AI mark' : 'Your mark'}: {r.score} of {q.marks}</p>}
      {r?.aiFeedback && <p className="rounded-lg border border-line px-3 py-2 text-[13px] text-navy"><strong>AI feedback:</strong> {r.aiFeedback} <span className="text-muted">You can still change the mark.</span></p>}
    </div>
  );
}
