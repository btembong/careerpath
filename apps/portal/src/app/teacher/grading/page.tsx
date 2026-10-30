'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Who { id: string; name: string; avatarUrl: string | null }
type Item =
  | { kind: 'assignment'; id: string; submittedAt: string; student: Who; title: string; where: string; late: boolean; note: string | null; fileUrl: string | null; assignmentId: string; maxPoints: number; hasRubric: boolean }
  | { kind: 'quiz'; id: string; submittedAt: string; student: Who; title: string; where: string; writtenCount: number | null };
interface Queue { stats: { waiting: number; quiz: number; assignment: number; oldestDays: number | null }; items: Item[] }
interface Level { points: number; label: string }
interface Rubric { id: string; total: number; criteria: { id: string; title: string; weight: number; descriptors: Level[] }[] }
interface QuizDetail {
  id: string; feedback: string | null; autoScore: number; title: string; course: string; passMark: number; totalPoints: number;
  questions: { id: string; type: string; questionText: string; points: number; answer: string | null; correctAnswer: string | null; isCorrect: boolean | null }[];
}

function when(iso: string) {
  const days = Math.floor((Date.now() - +new Date(iso)) / 86_400_000);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}
const isImage = (u: string) => /\.(png|jpe?g|webp|gif|svg)(\?|$)/i.test(u);
const isPdf = (u: string) => /\.pdf(\?|$)/i.test(u);
const fileName = (u: string) => decodeURIComponent(u.split('?')[0].split('/').pop() ?? 'file');

export default function GradingPage() {
  const params = useSearchParams();
  const [q, setQ] = useState<Queue | null>(null);
  const [filter, setFilter] = useState<'all' | 'quiz' | 'assignment'>(() => { const f = params.get('filter'); return f === 'quiz' || f === 'assignment' ? f : 'all'; });
  const [currentId, setCurrentId] = useState<string | null>(params.get('item'));

  async function load(keep?: string | null) {
    const r = await api.get('/grading/queue');
    setQ(r.data);
    const items: Item[] = r.data.items;
    setCurrentId(prev => {
      const want = keep ?? prev;
      return want && items.some(i => i.id === want) ? want : items[0]?.id ?? null;
    });
  }
  useEffect(() => { load().catch(() => notify.error('Could not load the grading queue')); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const shown = useMemo(() => (q?.items ?? []).filter(i => filter === 'all' || i.kind === filter), [q, filter]);
  const idx = shown.findIndex(i => i.id === currentId);
  const current = idx >= 0 ? shown[idx] : null;

  function next(afterDone: boolean) {
    const rest = shown.filter(i => i.id !== currentId);
    const following = afterDone ? (shown[idx + 1] ?? rest[0]) : (shown[idx + 1] ?? shown[0]);
    return following?.id ?? null;
  }
  async function done() { const n = next(true); await load(n); }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Grading" subtitle="Written quiz answers and assignment hand-ins, in one queue"
        actions={q && <span className="text-[13px] text-muted">{q.stats.waiting} waiting{q.stats.oldestDays != null ? ` · oldest ${q.stats.oldestDays === 0 ? 'today' : `${q.stats.oldestDays} day${q.stats.oldestDays === 1 ? '' : 's'}`}` : ''}</span>} />
      <div className="flex flex-1 flex-wrap items-stretch">
        <section className="min-w-[260px] flex-[0_1_330px] border-r border-line bg-white max-md:flex-[1_1_100%] max-md:border-b max-md:border-r-0">
          <div className="flex gap-1 border-b border-line px-3 py-2.5 text-[12.5px]">
            {([['all', `All ${q?.stats.waiting ?? ''}`], ['quiz', `Quiz answers ${q?.stats.quiz ?? ''}`], ['assignment', `Assignments ${q?.stats.assignment ?? ''}`]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setFilter(k)} className={clsx('rounded-md px-2.5 py-[5px] text-navy', filter === k ? 'bg-accent-soft font-semibold' : 'hover:bg-subtle')}>{l}</button>
            ))}
          </div>
          {!q ? <div className="m-3 h-48 rounded-md bg-subtle animate-pulse" /> : !shown.length ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink2">Nothing waiting. Nice work.</p>
          ) : (
            <div className="max-h-[calc(100vh-180px)] overflow-y-auto max-md:max-h-64">
              {shown.map(i => (
                <button key={i.id} onClick={() => setCurrentId(i.id)}
                  className={clsx('block w-full border-b border-line px-3.5 py-[11px] text-left', i.id === currentId ? 'border-l-[3px] border-l-azure-strong bg-accent-soft' : 'hover:bg-subtle')}>
                  <p className="text-[13.5px] font-[650] text-navy">{i.student.name}</p>
                  <p className="mt-0.5 text-xs text-muted">
                    {i.kind === 'quiz' ? `Quiz · ${i.title}${i.writtenCount ? ` · ${i.writtenCount} written answer${i.writtenCount === 1 ? '' : 's'}` : ''}` : `Assignment · ${i.title}`} · {when(i.submittedAt)}{i.kind === 'assignment' && i.late ? ' · late' : ''}
                  </p>
                </button>
              ))}
            </div>
          )}
        </section>

        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-3.5 px-4 py-5 lg:px-[26px] lg:py-[22px]">
          {!q ? <div className="h-96 rounded-lg bg-subtle animate-pulse" /> : !current ? (
            <div className="rounded-lg border border-line bg-white px-6 py-14 text-center">
              <p className="text-base font-bold text-navy">All caught up</p>
              <p className="mt-1 text-[13.5px] text-ink2">New hand-ins and written quiz answers will appear here.</p>
            </div>
          ) : current.kind === 'assignment'
            ? <AssignmentGrader key={current.id} item={current} pos={`${idx + 1} of ${shown.length}`} onSkip={() => setCurrentId(next(false))} onDone={done} />
            : <QuizGrader key={current.id} item={current} pos={`${idx + 1} of ${shown.length}`} onSkip={() => setCurrentId(next(false))} onDone={done} />}
        </section>
      </div>
    </div>
  );
}

function Header({ label, name, sub, pos }: { label: string; name: string; sub: string; pos: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{label}</p>
        <p className="mt-[3px] text-[19px] font-extrabold text-navy">{name}</p>
        <p className="mt-0.5 text-[13px] text-ink2">{sub}</p>
      </div>
      <span className="text-[13px] text-muted">{pos}</span>
    </div>
  );
}

function AssignmentGrader({ item, pos, onSkip, onDone }: { item: Extract<Item, { kind: 'assignment' }>; pos: string; onSkip: () => void; onDone: () => Promise<void> }) {
  const [rubric, setRubric] = useState<Rubric | null | undefined>(undefined);
  const [picked, setPicked] = useState<Record<string, number>>({});
  const [grade, setGrade] = useState('');
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!item.hasRubric) { setRubric(null); return; }
    api.get(`/rubrics/${item.assignmentId}`).then(r => setRubric(r.data.rubric)).catch(() => setRubric(null));
  }, [item.assignmentId, item.hasRubric]);

  const rubricScore = rubric ? rubric.criteria.reduce((n, c) => n + (picked[c.id] ?? 0), 0) : 0;
  const allPicked = !!rubric && rubric.criteria.every(c => picked[c.id] != null);
  const scaled = rubric && rubric.total ? Math.round((rubricScore / rubric.total) * item.maxPoints) : 0;
  const shownGrade = rubric ? scaled : Number(grade);

  async function save() {
    setSaving(true);
    try {
      if (rubric) {
        if (!allPicked) { notify.error('Pick a level for every criterion'); setSaving(false); return; }
        await api.post(`/rubrics/grade/${item.id}`, { scores: rubric.criteria.map(c => ({ criterionId: c.id, score: picked[c.id] })), feedback });
      } else {
        const n = Number(grade);
        if (grade.trim() === '' || !Number.isInteger(n) || n < 0 || n > item.maxPoints) { notify.error(`Enter a whole number from 0 to ${item.maxPoints}`); setSaving(false); return; }
        await api.patch(`/education/submissions/${item.id}/grade`, { grade: n, feedback: feedback.trim() || undefined });
      }
      notify.success(`Saved ${shownGrade}/${item.maxPoints}`, { description: `${item.student.name.split(' ')[0]} has been told` });
      await onDone();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save the grade'); } finally { setSaving(false); }
  }

  return (
    <>
      <Header label={`${item.title} · assignment`} name={item.student.name} pos={pos}
        sub={`Handed in ${when(item.submittedAt)} · ${item.late ? 'late' : 'on time'}${item.note ? ` · “${item.note}”` : ''}`} />
      <div className="overflow-hidden rounded-lg border border-line bg-white">
        {!item.fileUrl ? <p className="grid h-[210px] place-items-center text-[13.5px] text-muted">No file — the student only left a note.</p>
          : isImage(item.fileUrl) ? <img src={item.fileUrl} alt="Student work" className="max-h-[420px] w-full object-contain" />
          : isPdf(item.fileUrl) ? <iframe src={item.fileUrl} title="Student work" className="h-[420px] w-full" />
          : <p className="grid h-[210px] place-items-center text-[13.5px] text-muted">{fileName(item.fileUrl)}</p>}
        {item.fileUrl && (
          <div className="flex justify-between border-t border-line px-3.5 py-2 text-[12.5px]">
            <span className="truncate text-muted">{fileName(item.fileUrl)}</span>
            <a href={item.fileUrl} target="_blank" rel="noreferrer" className="font-semibold text-azure-strong hover:underline">Open full size</a>
          </div>
        )}
      </div>

      <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-4">
        {rubric === undefined ? <div className="h-20 rounded bg-subtle animate-pulse" /> : rubric ? (
          <>
            <div className="flex justify-between"><h3 className="text-[15px] font-semibold text-navy">Rubric</h3><strong className="text-sm text-navy">{rubricScore} / {rubric.total}</strong></div>
            {rubric.criteria.map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                <span className="flex-[1_1_160px] text-navy">{c.title}</span>
                {c.descriptors.map(l => (
                  <button key={l.points} title={l.label} onClick={() => setPicked({ ...picked, [c.id]: l.points })}
                    className={clsx('rounded-[5px] px-2 py-1 text-xs font-semibold', picked[c.id] === l.points ? 'border border-azure bg-accent-soft text-navy' : 'border border-line text-muted hover:text-navy')}>{l.points}</button>
                ))}
              </div>
            ))}
            {rubric.total !== item.maxPoints && <p className="text-xs text-muted">Rubric is out of {rubric.total}; the grade is scaled to {item.maxPoints}.</p>}
          </>
        ) : (
          <>
            <div className="flex items-center justify-between"><h3 className="text-[15px] font-semibold text-navy">Grade</h3>
              <Link href={`/teacher/rubrics/${item.assignmentId}`} className="text-[13px] font-semibold text-azure-strong hover:underline">Add a rubric</Link></div>
            <label className="flex items-center gap-2 text-[13.5px] text-navy">
              <input type="number" min={0} max={item.maxPoints} value={grade} onChange={e => setGrade(e.target.value)} className="h-[38px] w-24 rounded-md border border-line px-2.5 outline-none focus:border-azure" /> / {item.maxPoints}
            </label>
          </>
        )}
      </section>

      <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Feedback</span>
        <textarea rows={3} value={feedback} onChange={e => setFeedback(e.target.value)} maxLength={4000} placeholder="What went well, and one thing to fix."
          className="resize-none rounded-md border border-line bg-white px-2.5 py-2.5 text-[13.5px] text-navy outline-none focus:border-azure" />
      </label>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onSkip}>Skip</Button>
        <span className="flex-1" />
        <Button onClick={save} loading={saving} disabled={rubric ? !allPicked : grade.trim() === ''}>
          Save {rubric ? (allPicked ? `${scaled}/${item.maxPoints} ` : '') : grade.trim() !== '' ? `${grade}/${item.maxPoints} ` : ''}and next
        </Button>
      </div>
    </>
  );
}

function QuizGrader({ item, pos, onSkip, onDone }: { item: Extract<Item, { kind: 'quiz' }>; pos: string; onSkip: () => void; onDone: () => Promise<void> }) {
  const [d, setD] = useState<QuizDetail | null>(null);
  const [marks, setMarks] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get(`/grading/quiz/${item.id}`).then(r => setD(r.data)).catch(() => notify.error('Could not load this quiz')); }, [item.id]);

  const written = d?.questions.filter(x => x.type === 'WRITTEN') ?? [];
  const auto = d?.questions.filter(x => x.type !== 'WRITTEN') ?? [];
  const allMarked = written.every(w => marks[w.id] != null);
  const total = (d?.autoScore ?? 0) + written.reduce((n, w) => n + (marks[w.id] ?? 0), 0);
  const pct = d?.totalPoints ? Math.round((total / d.totalPoints) * 100) : 0;

  async function save() {
    if (!allMarked) { notify.error('Give marks for every written answer'); return; }
    setSaving(true);
    try {
      const r = await api.post(`/grading/quiz/${item.id}`, { marks, feedback });
      notify.success(`Saved ${r.data.finalScore}/${r.data.maxScore}${r.data.passed ? ' · passed' : ''}`, { description: `${item.student.name.split(' ')[0]} has been told` });
      await onDone();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); } finally { setSaving(false); }
  }

  return (
    <>
      <Header label={`${item.where} · quiz`} name={item.student.name} pos={pos} sub={`${item.title} · handed in ${when(item.submittedAt)}`} />
      {!d ? <div className="h-72 rounded-lg bg-subtle animate-pulse" /> : (
        <>
          {written.map((w, i) => (
            <section key={w.id} className="flex flex-col gap-2 rounded-lg border border-line bg-white p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Written answer {i + 1} of {written.length} · {w.points} mark{w.points === 1 ? '' : 's'}</p>
              <p className="text-[14px] font-semibold text-navy">{w.questionText}</p>
              <p className="whitespace-pre-wrap rounded-md bg-subtle px-3 py-2.5 text-[13.5px] text-ink2">{w.answer || <em className="text-muted">No answer</em>}</p>
              {w.correctAnswer && <p className="text-xs text-muted">Model answer: {w.correctAnswer}</p>}
              <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                <span className="mr-1 text-navy">Marks</span>
                {Array.from({ length: w.points + 1 }, (_, n) => (
                  <button key={n} onClick={() => setMarks({ ...marks, [w.id]: n })}
                    className={clsx('min-w-[30px] rounded-[5px] px-2 py-1 text-xs font-semibold', marks[w.id] === n ? 'border border-azure bg-accent-soft text-navy' : 'border border-line text-muted hover:text-navy')}>{n}</button>
                ))}
              </div>
            </section>
          ))}
          {auto.length > 0 && (
            <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
              <div className="flex justify-between"><h3 className="text-[15px] font-semibold text-navy">Marked automatically</h3><strong className="text-sm text-navy">{d.autoScore} / {auto.reduce((n, a) => n + a.points, 0)}</strong></div>
              {auto.map(a => (
                <p key={a.id} className="flex gap-2 text-[13px]">
                  <span className={a.isCorrect ? 'text-azure-strong' : 'text-muted'}>{a.isCorrect ? '✓' : '✗'}</span>
                  <span className="min-w-0 flex-1 truncate text-ink2">{a.questionText}</span>
                  <span className="shrink-0 text-muted">{a.answer ?? '—'}</span>
                </p>
              ))}
            </section>
          )}
          <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Feedback</span>
            <textarea rows={3} value={feedback} onChange={e => setFeedback(e.target.value)} maxLength={4000}
              className="resize-none rounded-md border border-line bg-white px-2.5 py-2.5 text-[13.5px] text-navy outline-none focus:border-azure" />
          </label>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={onSkip}>Skip</Button>
            <span className="flex-1 text-right text-[12.5px] text-muted">{allMarked ? `${pct}% · pass mark ${d.passMark}%` : ''}</span>
            <Button onClick={save} loading={saving} disabled={!allMarked}>Save {allMarked ? `${total}/${d.totalPoints} ` : ''}and next</Button>
          </div>
        </>
      )}
    </>
  );
}
