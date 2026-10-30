'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Lesson { id: string; title: string; type: 'VIDEO' | 'TEXT' | 'QUIZ' | 'LIVE'; content: string | null; videoUrl: string | null; durationSecs: number | null; isFree: boolean; attachments?: { id: string; name?: string; fileName?: string; url: string }[] }
interface Course {
  id: string; title: string; description: string | null; shortDescription: string | null; outcomes?: string[];
  programme: { name: string; shortName: string | null } | null; subject: { name: string } | null;
  teacher: { name: string | null; firstName: string | null; lastName: string | null; email: string } | null;
  modules: { id: string; title: string; lessons: Lesson[] }[];
}
interface Question { id: string; prompt?: string; question?: string; text?: string; options?: string[] | null; correctAnswer?: unknown; explanation?: string | null }
interface Item { courseId: string; decision: string; notes: string | null; checklist: Record<string, 'good' | 'fix'> | null; submittedAt: string | null; reviewedAt: string | null; commissionPct: number | null }

const CHECKS: [string, string][] = [['accuracy', 'Accurate content'], ['syllabus', 'Matches the syllabus'], ['media', 'Clear video and audio'], ['quizzes', 'Quizzes test the right skills'], ['preview', 'Free preview is useful']];
const KIND: Record<Lesson['type'], string> = { VIDEO: 'Video', TEXT: 'Reading', QUIZ: 'Quiz', LIVE: 'Live' };

export default function ReviewCoursePage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const [c, setC] = useState<Course | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [seen, setSeen] = useState<Set<string>>(new Set());
  const [video, setVideo] = useState<string | null>(null);
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [checks, setChecks] = useState<Record<string, 'good' | 'fix'>>({});
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  // What the reviewer has opened is kept on this device
  const seenKey = `cpa-review-seen-${courseId}`;
  useEffect(() => {
    try { setSeen(new Set(JSON.parse(localStorage.getItem(seenKey) ?? '[]'))); } catch {}
    Promise.all([api.get(`/platform-courses/${courseId}`), api.get('/reviewer/overview').catch(() => ({ data: { queue: [], history: [] } }))])
      .then(([cr, or]) => {
        setC(cr.data);
        const first = cr.data.modules?.[0]?.lessons?.[0];
        if (first) setCurrent(first.id);
        const it: Item | undefined = [...(or.data.queue ?? []), ...(or.data.history ?? [])].find((x: Item) => x.courseId === courseId);
        if (it) { setItem(it); setChecks(it.checklist ?? {}); setNotes(it.decision === 'PENDING' ? '' : it.notes ?? ''); }
      })
      .catch(() => { notify.error('Could not open this course'); router.push('/reviewer/dashboard'); });
  }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  const lessons = c?.modules.flatMap(m => m.lessons) ?? [];
  const lesson = lessons.find(l => l.id === current) ?? null;
  const idx = lesson ? lessons.indexOf(lesson) : -1;

  useEffect(() => {
    if (!lesson) return;
    setVideo(null); setQuestions(null);
    setSeen(s => { const n = new Set(s).add(lesson.id); try { localStorage.setItem(seenKey, JSON.stringify([...n])); } catch {} return n; });
    if (lesson.type === 'VIDEO' && lesson.videoUrl) api.get(`/platform-courses/${courseId}/lessons/${lesson.id}/signed-video`).then(r => setVideo(r.data.url)).catch(() => setVideo(lesson.videoUrl));
    if (lesson.type === 'QUIZ' || lesson.type === 'TEXT') api.get(`/platform-courses/${courseId}/lessons/${lesson.id}/questions`).then(r => setQuestions(r.data ?? [])).catch(() => setQuestions([]));
  }, [lesson?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function decide(decision: 'APPROVED' | 'REJECTED') {
    if (decision === 'REJECTED' && !notes.trim()) { notify.error('Tell the teacher what to change'); return; }
    setBusy(decision);
    try {
      await api.patch(`/reviewer/courses/${courseId}/review`, { decision, notes: notes.trim() || undefined, checklist: checks });
      notify.success(decision === 'APPROVED' ? 'Course approved' : 'Sent back to the teacher', { description: decision === 'APPROVED' ? 'An admin will publish it.' : 'They’ll see your notes in the course builder.' });
      router.push('/reviewer/dashboard');
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not save your review'); }
    finally { setBusy(null); }
  }

  if (!c) return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/reviewer/dashboard" backLabel="Review queue" title="Course" />
      <div className="m-4 h-96 rounded-lg border border-line bg-white animate-pulse lg:m-7" />
    </div>
  );

  const teacher = c.teacher ? c.teacher.name || [c.teacher.firstName, c.teacher.lastName].filter(Boolean).join(' ') || c.teacher.email : '';
  const decided = item && item.decision !== 'PENDING';
  const fixes = CHECKS.filter(([k]) => checks[k] === 'fix').length;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/reviewer/dashboard" backLabel="Review queue" title={c.title}
        subtitle={[teacher, c.programme ? c.programme.shortName ?? c.programme.name : null, c.subject?.name, item?.submittedAt ? `submitted ${new Date(item.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : null].filter(Boolean).join(' · ')} />

      <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-3 rounded-lg border border-line bg-white p-[18px]">
          {lesson ? <>
            {lesson.type === 'VIDEO' ? (
              video ? <video key={video} src={video} controls className="aspect-video w-full rounded-md bg-navy" />
                : <div className="flex aspect-video w-full items-center justify-center rounded-md bg-navy text-[13.5px] text-white/70">{lesson.videoUrl ? 'Loading video…' : 'This lesson has no video yet'}</div>
            ) : (
              <div className="max-h-[420px] overflow-y-auto rounded-md border border-line bg-subtle p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-[0.06em] text-muted">{KIND[lesson.type]}</p>
                {lesson.content ? <div className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink2">{lesson.content.replace(/<[^>]+>/g, '')}</div>
                  : lesson.type !== 'QUIZ' && <p className="text-[13px] text-muted">No written content.</p>}
                {questions && questions.length > 0 && (
                  <ol className="mt-3 list-decimal space-y-2.5 pl-5 text-[13.5px] text-navy">
                    {questions.map(q => (
                      <li key={q.id}>
                        <p className="font-semibold">{q.prompt ?? q.question ?? q.text}</p>
                        {Array.isArray(q.options) && <p className="text-[12.5px] text-ink2">{q.options.join(' · ')}</p>}
                        {q.correctAnswer != null && <p className="text-[12.5px] text-azure-strong">Answer: {String(Array.isArray(q.correctAnswer) ? q.correctAnswer.join(', ') : q.correctAnswer)}</p>}
                        {q.explanation && <p className="text-[12.5px] text-muted">{q.explanation}</p>}
                      </li>
                    ))}
                  </ol>
                )}
                {lesson.type === 'QUIZ' && questions && !questions.length && <p className="text-[13px] text-muted">This quiz has no questions yet.</p>}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-muted">
              <span className="font-semibold text-navy">{lesson.title}</span>
              <span className="flex items-center gap-3">
                Lesson {idx + 1} of {lessons.length}
                <button type="button" disabled={idx <= 0} onClick={() => setCurrent(lessons[idx - 1].id)} className="font-semibold text-azure-strong disabled:text-muted">Previous</button>
                <button type="button" disabled={idx >= lessons.length - 1} onClick={() => setCurrent(lessons[idx + 1].id)} className="font-semibold text-azure-strong disabled:text-muted">Next lesson</button>
              </span>
            </div>
          </> : <p className="py-10 text-center text-[13px] text-ink2">This course has no lessons yet.</p>}

          <div className="mt-1 flex items-baseline justify-between">
            <h3 className="text-[15px] font-semibold text-navy">Outline</h3>
            <span className="text-[12.5px] text-muted">{seen.size > lessons.length ? lessons.length : lessons.filter(l => seen.has(l.id)).length} of {lessons.length} opened</span>
          </div>
          {c.modules.map((m, mi) => (
            <div key={m.id}>
              <p className="mb-1 mt-1 text-xs font-semibold uppercase tracking-[0.06em] text-muted">{/^module/i.test(m.title) ? m.title : `Module ${mi + 1} — ${m.title}`}</p>
              {m.lessons.map(l => (
                <button key={l.id} type="button" onClick={() => setCurrent(l.id)}
                  className={clsx('flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px]', l.id === current ? 'bg-accent-soft font-semibold text-navy' : 'text-ink2 hover:bg-subtle')}>
                  <span className={clsx('w-4 text-center', seen.has(l.id) ? 'text-azure-strong' : 'text-muted')}>{l.id === current ? '▶' : seen.has(l.id) ? '✓' : '○'}</span>
                  <span className="min-w-0 flex-1 truncate">{l.title}</span>
                  <span className="text-xs text-muted">{KIND[l.type]}{l.isFree ? ' · free preview' : ''}</span>
                </button>
              ))}
            </div>
          ))}
        </section>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 rounded-lg border border-azure bg-white p-[18px] lg:sticky lg:top-6">
          <h3 className="text-[15px] font-semibold text-navy">{decided ? 'Your review' : 'Your review'}</h3>
          {decided && (
            <p className="rounded-md bg-accent-soft px-3 py-2 text-[13px] text-ink2">
              You {item!.decision === 'APPROVED' ? 'approved' : 'asked for changes to'} this course on {new Date(item!.reviewedAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.
            </p>
          )}
          {CHECKS.map(([k, label]) => (
            <div key={k} className="flex items-center justify-between gap-2.5 text-[13.5px] text-navy">
              <span>{label}</span>
              <span className="flex gap-1">
                {(['good', 'fix'] as const).map(v => (
                  <button key={v} type="button" disabled={!!decided} onClick={() => setChecks(x => ({ ...x, [k]: v }))}
                    className={clsx('h-[26px] rounded-[5px] border px-2.5 text-xs font-semibold', checks[k] === v ? 'border-azure bg-accent-soft text-navy' : 'border-line text-muted hover:text-navy')}>
                    {v === 'good' ? 'Good' : 'Fix'}
                  </button>
                ))}
              </span>
            </div>
          ))}
          <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Notes for the teacher</span>
            <textarea rows={4} value={notes} disabled={!!decided} onChange={e => setNotes(e.target.value)} maxLength={2000}
              placeholder={fixes ? 'What should the teacher change?' : 'Optional when approving'} className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" />
          </label>
          {!decided && <>
            <div className="flex gap-2">
              <Button variant="secondary" className="flex-1" loading={busy === 'REJECTED'} onClick={() => decide('REJECTED')}>Ask for changes</Button>
              <Button className="flex-1" loading={busy === 'APPROVED'} disabled={fixes > 0} onClick={() => decide('APPROVED')}>Approve</Button>
            </div>
            <p className="text-[12.5px] text-muted">
              {fixes ? `You marked ${fixes} item${fixes === 1 ? '' : 's'} to fix — ask for changes, or change them to Good to approve.` : 'Approving sends the course to an admin to publish.'}
              {item?.commissionPct != null ? ` You earn ${item.commissionPct}% of its sales.` : ''}
            </p>
          </>}
        </aside>
      </div>
    </div>
  );
}
