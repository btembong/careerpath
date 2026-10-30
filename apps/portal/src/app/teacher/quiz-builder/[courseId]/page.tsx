'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Lesson { id: string; title: string; type: string; passMark: number | null; timeLimitSecs: number | null; maxAttempts: number; shuffleQuestions: boolean }
interface Course { id: string; title: string; modules: { id: string; title: string; lessons: Lesson[] }[] }
interface Option { id: string; text: string }
interface Question {
  id: string; questionText: string; type: 'MCQ' | 'SHORT_ANSWER' | 'WRITTEN'; options: Option[] | null; correctAnswer: string;
  explanation: string | null; difficulty: 'EASY' | 'MEDIUM' | 'HARD'; points: number; tags: string[]; videoAtSec: number | null;
}
type Kind = 'choice' | 'truefalse' | 'short' | 'written';
interface Draft { id?: string; kind: Kind; questionText: string; options: Option[]; correct: string; accepted: string; explanation: string; difficulty: Question['difficulty']; points: number; videoAt: string }

const KINDS: [Kind, string][] = [['choice', 'Multiple choice'], ['truefalse', 'True / false'], ['short', 'Short answer'], ['written', 'Written (you grade)']];
const SHORT: Record<Kind, string> = { choice: 'Choice', truefalse: 'T/F', short: 'Short', written: 'Written' };
const LETTERS = 'abcdef';
const kindOf = (q: Question): Kind => q.type === 'WRITTEN' ? 'written' : q.type === 'SHORT_ANSWER' ? 'short' : q.tags?.includes('true-false') ? 'truefalse' : 'choice';
const mmss = (s: number | null) => s == null ? '' : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const toSecs = (v: string) => { if (!v.trim()) return null; const [m, s] = v.split(':').map(Number); return s == null ? Math.round(m) : m * 60 + s; };

function blank(kind: Kind = 'choice'): Draft {
  return {
    kind, questionText: '', difficulty: 'MEDIUM', points: kind === 'written' ? 4 : 1, explanation: '', accepted: '', videoAt: '',
    options: kind === 'truefalse' ? [{ id: 'a', text: 'True' }, { id: 'b', text: 'False' }] : [0, 1, 2, 3].map(i => ({ id: LETTERS[i], text: '' })),
    correct: 'a',
  };
}
function toDraft(q: Question): Draft {
  const kind = kindOf(q);
  return {
    id: q.id, kind, questionText: q.questionText, difficulty: q.difficulty, points: q.points, explanation: q.explanation ?? '',
    options: q.options?.length ? q.options : blank(kind).options, correct: kind === 'choice' || kind === 'truefalse' ? q.correctAnswer : 'a',
    accepted: kind === 'short' || kind === 'written' ? q.correctAnswer : '', videoAt: mmss(q.videoAtSec),
  };
}

export default function QuizBuilderPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const params = useSearchParams();
  const [course, setCourse] = useState<Course | null>(null);
  const [lessonId, setLessonId] = useState<string>(params.get('lessonId') ?? '');
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [draft, setDraft] = useState<Draft>(blank());
  const [saving, setSaving] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    api.get(`/platform-courses/${courseId}`).then(r => {
      setCourse(r.data);
      const quizzes = (r.data.modules as Course['modules']).flatMap(m => m.lessons.filter(l => l.type === 'QUIZ'));
      setLessonId(prev => prev && quizzes.some(q => q.id === prev) ? prev : quizzes[0]?.id ?? '');
    }).catch(() => notify.error('Could not load the course'));
  }, [courseId]);

  const quizzes = useMemo(() => (course?.modules ?? []).flatMap((m, mi) => m.lessons.filter(l => l.type === 'QUIZ').map(l => ({ ...l, module: `Module ${mi + 1}`, moduleTitle: m.title }))), [course]);
  const lesson = quizzes.find(q => q.id === lessonId) ?? null;

  async function loadQuestions(selectId?: string) {
    if (!lessonId) { setQuestions([]); return; }
    const r = await api.get(`/platform-courses/${courseId}/lessons/${lessonId}/questions`);
    const qs: Question[] = r.data;
    setQuestions(qs);
    const pick = qs.find(q => q.id === selectId) ?? qs[0];
    setDraft(pick ? toDraft(pick) : blank());
  }
  useEffect(() => { setQuestions(null); loadQuestions().catch(() => notify.error('Could not load the questions')); }, [lessonId]); // eslint-disable-line react-hooks/exhaustive-deps

  function chooseLesson(id: string) { setLessonId(id); router.replace(`?lessonId=${id}`); }

  async function save() {
    const d = draft;
    if (!d.questionText.trim()) { notify.error('Write the question'); return; }
    const isChoice = d.kind === 'choice' || d.kind === 'truefalse';
    const options = isChoice ? d.options.filter(o => o.text.trim()) : null;
    if (isChoice && (options!.length < 2 || !options!.some(o => o.id === d.correct))) { notify.error('Add at least two answers and tick the correct one'); return; }
    if (d.kind === 'short' && !d.accepted.trim()) { notify.error('Add the accepted answer'); return; }
    const body = {
      type: d.kind === 'written' ? 'WRITTEN' : d.kind === 'short' ? 'SHORT_ANSWER' : 'MCQ',
      questionText: d.questionText, options, correctAnswer: isChoice ? d.correct : d.accepted.trim(),
      explanation: d.explanation || null, difficulty: d.difficulty, points: d.points,
      tags: d.kind === 'truefalse' ? ['true-false'] : [], videoAtSec: toSecs(d.videoAt),
    };
    setSaving(true);
    try {
      const r = d.id
        ? await api.patch(`/platform-courses/${courseId}/lessons/${lessonId}/questions/${d.id}`, body)
        : await api.post(`/platform-courses/${courseId}/lessons/${lessonId}/questions`, body);
      notify.success(d.id ? 'Question saved' : 'Question added');
      await loadQuestions(r.data.id);
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); } finally { setSaving(false); }
  }

  async function remove() {
    if (!draft.id || !confirm('Delete this question?')) return;
    try { await api.delete(`/platform-courses/${courseId}/lessons/${lessonId}/questions/${draft.id}`); notify.success('Deleted'); await loadQuestions(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not delete'); }
  }

  async function aiDraft() {
    setDrafting(true);
    try {
      const r = await api.post(`/ai/generate-quiz/${lessonId}`, { count: 5 });
      notify.success(`Added ${r.data.generated} questions`, { description: 'Check each one before students see it.' });
      await loadQuestions(r.data.questions?.[0]?.id);
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'AI drafting failed'); } finally { setDrafting(false); }
  }

  async function setting(patch: Partial<Lesson>) {
    if (!course || !lesson) return;
    try {
      await api.patch(`/platform-courses/${courseId}/lessons/${lessonId}/quiz-config`, patch);
      setCourse({ ...course, modules: course.modules.map(m => ({ ...m, lessons: m.lessons.map(l => l.id === lessonId ? { ...l, ...patch } : l) })) });
      notify.success('Quiz settings saved');
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); }
  }

  const setD = (p: Partial<Draft>) => setDraft(d => ({ ...d, ...p }));

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Quiz builder" subtitle={course ? `${course.title}${lesson ? ` · ${lesson.module}` : ''}` : ' '}
        backHref={`/teacher/courses/${courseId}/builder`} backLabel="Course builder"
        actions={quizzes.length > 1 && (
          <select value={lessonId} onChange={e => chooseLesson(e.target.value)} className="h-9 max-w-[280px] rounded-md border border-line bg-white px-2.5 text-[13.5px] font-semibold text-navy">
            {quizzes.map(q => <option key={q.id} value={q.id}>{q.module} · {q.title}</option>)}
          </select>
        )} />

      {course && !quizzes.length ? (
        <div className="p-4 lg:px-7 lg:py-6">
          <div className="rounded-lg border border-line bg-white px-6 py-12 text-center">
            <p className="text-base font-bold text-navy">This course has no quiz yet</p>
            <p className="mt-1 text-[13.5px] text-ink2">Add a lesson of type Quiz in the course builder, then come back to write its questions.</p>
            <Link href={`/teacher/courses/${courseId}/builder`} className="mt-4 inline-flex h-9 items-center rounded-md bg-azure-strong px-4 text-[13.5px] font-semibold text-on-accent">Open course builder</Link>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-start gap-[18px] p-4 lg:px-7 lg:py-[22px]">
          <section className="flex min-w-[240px] flex-[0_1_300px] flex-col gap-2 rounded-lg border border-line bg-white p-3.5">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{lesson ? `${lesson.title} · ${questions?.length ?? 0} question${questions?.length === 1 ? '' : 's'}` : 'Loading…'}</p>
            {!questions ? <div className="h-40 rounded bg-subtle animate-pulse" /> : questions.map((q, i) => (
              <button key={q.id} onClick={() => setDraft(toDraft(q))}
                className={clsx('flex items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] text-navy', draft.id === q.id ? 'bg-accent-soft font-semibold' : 'border border-line hover:bg-subtle')}>
                <span className="font-extrabold text-muted">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">{q.questionText}</span>
                <span className="text-[11px] text-muted">{SHORT[kindOf(q)]}</span>
              </button>
            ))}
            <button onClick={() => setDraft(blank())} disabled={!lesson}
              className={clsx('grid h-[34px] place-items-center rounded-md border border-dashed border-azure text-[13px] font-semibold text-azure-strong hover:bg-accent-soft', !draft.id && 'bg-accent-soft')}>Add question</button>
            <button onClick={aiDraft} disabled={!lesson || drafting}
              className="grid h-[34px] place-items-center rounded-md border border-line text-[13px] font-semibold text-navy hover:bg-subtle disabled:opacity-60">{drafting ? 'Drafting…' : 'Draft 5 with AI from the lesson'}</button>
          </section>

          <section className="flex min-w-0 flex-[999_1_440px] flex-col gap-3 rounded-lg border border-line bg-white p-[18px]">
            <div className="flex flex-wrap gap-1.5">
              {KINDS.map(([k, l]) => (
                <button key={k} onClick={() => setD(k === draft.kind ? {} : { kind: k, options: blank(k).options, correct: 'a', points: k === 'written' ? Math.max(draft.points, 2) : draft.points })}
                  className={clsx('rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold', draft.kind === k ? 'border border-azure bg-accent-soft text-navy' : 'border border-line text-ink2 hover:text-navy')}>{l}</button>
              ))}
            </div>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Question</span>
              <textarea rows={2} value={draft.questionText} onChange={e => setD({ questionText: e.target.value })} maxLength={2000} placeholder="Simplify (2³ × 2⁴) ÷ 2⁵"
                className="min-h-[52px] resize-y rounded-md border border-line px-2.5 py-2.5 text-sm text-navy outline-none focus:border-azure" />
            </label>

            {(draft.kind === 'choice' || draft.kind === 'truefalse') && <>
              <p className="text-[13px] font-semibold text-navy">Answers — tick the correct one</p>
              {draft.options.map((o, i) => (
                <div key={o.id} className={clsx('flex items-center gap-2.5 rounded-md border px-3 py-[9px] text-[13.5px]', draft.correct === o.id ? 'border-azure bg-accent-soft' : 'border-line')}>
                  <input type="radio" name="correct" checked={draft.correct === o.id} onChange={() => setD({ correct: o.id })} className="accent-[#3F6FE8]" aria-label={`Answer ${i + 1} is correct`} />
                  {draft.kind === 'truefalse' ? <span className="flex-1 text-navy">{o.text}</span> : (
                    <input value={o.text} onChange={e => setD({ options: draft.options.map(x => x.id === o.id ? { ...x, text: e.target.value } : x) })} placeholder={`Answer ${i + 1}`}
                      className="min-w-0 flex-1 bg-transparent text-navy outline-none" />
                  )}
                  {draft.kind === 'choice' && draft.options.length > 2 && (
                    <button onClick={() => setD({ options: draft.options.filter(x => x.id !== o.id), correct: draft.correct === o.id ? draft.options.find(x => x.id !== o.id)!.id : draft.correct })} className="text-xs text-muted hover:text-navy" aria-label="Remove answer">✕</button>
                  )}
                </div>
              ))}
              {draft.kind === 'choice' && draft.options.length < 6 && (
                <button onClick={() => { const id = [...LETTERS].find(l => !draft.options.some(o => o.id === l))!; setD({ options: [...draft.options, { id, text: '' }] }); }}
                  className="self-start text-[13px] font-semibold text-azure-strong hover:underline">+ Add an answer</button>
              )}
            </>}
            {draft.kind === 'short' && (
              <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Accepted answers</span>
                <input value={draft.accepted} onChange={e => setD({ accepted: e.target.value })} placeholder="5√2 | 5 root 2" className="input-base" />
                <span className="text-xs text-muted">Marked automatically, ignoring capitals and spaces. Separate alternatives with |</span>
              </label>
            )}
            {draft.kind === 'written' && (
              <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Model answer (only you see it while grading)</span>
                <textarea rows={2} value={draft.accepted} onChange={e => setD({ accepted: e.target.value })} className="resize-y rounded-md border border-line px-2.5 py-2 text-[13.5px] text-navy outline-none focus:border-azure" />
              </label>
            )}

            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Explanation students see after answering</span>
              <textarea rows={2} value={draft.explanation} onChange={e => setD({ explanation: e.target.value })} maxLength={4000}
                className="resize-y rounded-md border border-line px-2.5 py-2.5 text-[13.5px] text-ink2 outline-none focus:border-azure" />
            </label>
            <div className="flex flex-wrap items-center gap-3.5 text-[13px] text-ink2">
              <label className="flex items-center gap-1.5">Difficulty:
                <select value={draft.difficulty} onChange={e => setD({ difficulty: e.target.value as Draft['difficulty'] })} className="rounded border border-line px-1.5 py-1 font-semibold text-navy">
                  <option value="EASY">Easy</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5">Marks:
                <input type="number" min={1} max={100} value={draft.points} onChange={e => setD({ points: Math.max(1, Number(e.target.value) || 1) })} className="w-14 rounded border border-line px-1.5 py-1 font-semibold text-navy" />
              </label>
              <label className="flex items-center gap-1.5">Links to video at
                <input value={draft.videoAt} onChange={e => setD({ videoAt: e.target.value })} placeholder="3:40" className="w-16 rounded border border-line px-1.5 py-1 font-semibold text-navy" />
              </label>
            </div>
            <div className="flex gap-2 border-t border-line pt-3">
              {draft.id && <Button variant="secondary" size="sm" onClick={remove}>Delete</Button>}
              <span className="flex-1" />
              <Button size="sm" onClick={save} loading={saving} disabled={!lesson}>{draft.id ? 'Save question' : 'Add question'}</Button>
            </div>
          </section>

          <aside className="flex min-w-0 flex-[1_1_240px] flex-col gap-2 rounded-lg border border-line bg-white p-4">
            <h3 className="text-[15px] font-semibold text-navy">Quiz settings</h3>
            {lesson ? <>
              <SettingRow label="Pass mark">
                <select value={lesson.passMark ?? ''} onChange={e => setting({ passMark: e.target.value === '' ? null : Number(e.target.value) })} className="font-semibold text-navy">
                  <option value="">None</option>{[40, 50, 60, 70, 80, 90, 100].map(n => <option key={n} value={n}>{n}%</option>)}
                </select>
              </SettingRow>
              <SettingRow label="Time limit">
                <select value={lesson.timeLimitSecs ?? ''} onChange={e => setting({ timeLimitSecs: e.target.value === '' ? null : Number(e.target.value) })} className="font-semibold text-navy">
                  <option value="">None</option>{[5, 10, 15, 20, 30, 45, 60, 90].map(n => <option key={n} value={n * 60}>{n} min</option>)}
                </select>
              </SettingRow>
              <SettingRow label="Attempts">
                <select value={lesson.maxAttempts} onChange={e => setting({ maxAttempts: Number(e.target.value) })} className="font-semibold text-navy">
                  <option value={0}>Unlimited</option>{[1, 2, 3, 5].map(n => <option key={n} value={n}>{n}</option>)}
                </select>
              </SettingRow>
              <SettingRow label="Shuffle questions">
                <select value={lesson.shuffleQuestions ? 'on' : 'off'} onChange={e => setting({ shuffleQuestions: e.target.value === 'on' })} className="font-semibold text-navy">
                  <option value="on">On</option><option value="off">Off</option>
                </select>
              </SettingRow>
              <button onClick={() => setPreview(true)} disabled={!questions?.length}
                className="mt-1.5 grid h-[34px] place-items-center rounded-md border border-line text-[13px] font-semibold text-navy hover:bg-subtle disabled:opacity-50">Preview as student</button>
            </> : <div className="h-28 rounded bg-subtle animate-pulse" />}
          </aside>
        </div>
      )}

      {preview && questions && lesson && (
        <Dialog open onOpenChange={o => { if (!o) setPreview(false); }}>
          <DialogContent title={lesson.title} description={`${questions.length} questions${lesson.timeLimitSecs ? ` · ${Math.round(lesson.timeLimitSecs / 60)} minutes` : ''}${lesson.passMark != null ? ` · pass mark ${lesson.passMark}%` : ''}`} size="lg">
            <div className="flex max-h-[60vh] flex-col gap-3 overflow-y-auto">
              {questions.map((q, i) => (
                <div key={q.id} className="rounded-md border border-line p-3.5">
                  <p className="text-[13.5px] font-semibold text-navy">{i + 1}. {q.questionText} <span className="font-normal text-muted">· {q.points} mark{q.points === 1 ? '' : 's'}</span></p>
                  {q.type === 'MCQ' ? (
                    <div className="mt-2 flex flex-col gap-1.5">{(q.options ?? []).map(o => <span key={o.id} className="rounded border border-line px-2.5 py-1.5 text-[13px] text-ink2">{o.text}</span>)}</div>
                  ) : <div className="mt-2 h-14 rounded border border-line bg-subtle" />}
                </div>
              ))}
            </div>
            <DialogFooter><Button size="sm" variant="secondary" onClick={() => setPreview(false)}>Close</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex items-center justify-between gap-2 text-[13px]"><span className="text-ink2">{label}</span>{children}</label>;
}
