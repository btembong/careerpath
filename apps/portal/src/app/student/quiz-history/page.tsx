'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Drawer, DrawerContent, DrawerSection } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type State = 'passed' | 'notyet' | 'marking';
interface Attempt {
  id: string; title: string; course: string; courseId: string; lessonId: string | null; module: string | null;
  submittedAt: string; timeTakenSecs: number | null; pct: number | null; state: State;
  attemptNo: number; maxAttempts: number | null; passMark: number | null;
}
interface History {
  stats: { taken: number; thisWeek: number; average: number | null; averageChange: number | null; passed: number; marking: number };
  attempts: Attempt[];
  weak: { questionId: string; text: string; misses: number; courseId: string | null; lessonId: string | null }[];
  trend: number[];
}
interface Review {
  title: string; course: string; courseId: string; lessonId: string | null; submittedAt: string; state: State;
  score: number; maxScore: number; pct: number | null; passMark: number | null; feedback: string | null;
  questions: { id: string; type: string; text: string; points: number; yourAnswer: string | null; correctAnswer: string | null; isCorrect: boolean | null; explanation: string | null }[];
}

const LABEL: Record<State, string> = { passed: 'Passed', notyet: 'Not yet', marking: 'Being marked' };
const TABS: [string, string][] = [['all', 'All'], ['passed', 'Passed'], ['notyet', 'Not yet'], ['marking', 'Being marked']];

function when(iso: string) {
  const d = Math.floor((Date.now() - +new Date(iso)) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 7 ? `${d} days ago` : d < 14 ? 'last week' : d < 31 ? `${Math.floor(d / 7)} weeks ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
const Badge = ({ state }: { state: State }) => (
  <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-semibold', state === 'passed' ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>{LABEL[state]}</span>
);

export default function QuizHistoryPage() {
  const [d, setD] = useState<History | null>(null);
  const [tab, setTab] = useState('all');
  const [openId, setOpenId] = useState<string | null>(null);

  useEffect(() => { api.get('/portals/student/quiz-history').then(r => setD(r.data)).catch(() => notify.error('Could not load your quizzes')); }, []);

  const list = (d?.attempts ?? []).filter(a => tab === 'all' || a.state === tab);
  const count = (k: string) => (d?.attempts ?? []).filter(a => k === 'all' || a.state === k).length;
  const first = d?.trend[0], last = d?.trend[d.trend.length - 1];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Quiz history" subtitle="Every quiz you’ve taken, and what to practise next" />
      <div className="flex flex-col gap-[18px] p-4 lg:px-7 lg:py-6">
        <dl className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
          {[
            { l: 'Quizzes taken', v: d ? String(d.stats.taken) : '—', sub: d ? `${d.stats.thisWeek} this week` : '' },
            { l: 'Average score', v: d?.stats.average != null ? `${d.stats.average}%` : '—', sub: d?.stats.averageChange != null ? `${d.stats.averageChange >= 0 ? 'up' : 'down'} ${Math.abs(d.stats.averageChange)}% this month` : 'of marked quizzes' },
            { l: 'Passed', v: d ? `${d.stats.passed} of ${d.stats.taken}` : '—', sub: 'pass mark set by each quiz' },
            { l: 'Being marked', v: d ? String(d.stats.marking) : '—', sub: 'written answers' },
          ].map(x => (
            <div key={x.l} className="rounded-lg border border-line bg-white px-4 py-3.5">
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{x.l}</dt>
              <dd className="mt-1.5 text-[22px] font-extrabold text-navy">{x.v}</dd>
              <dd className="mt-0.5 text-[12.5px] text-muted">{x.sub}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap items-start gap-5">
          <section className="min-w-0 flex-[999_1_520px] rounded-lg border border-line bg-white">
            <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line px-4">
              {TABS.map(([k, l]) => (
                <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={clsx('-mb-px h-[46px] whitespace-nowrap border-b-2 px-2.5 text-[13.5px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent font-medium')}>{l} {count(k)}</button>
              ))}
            </div>
            {!d ? <div className="m-4 h-48 rounded-md bg-subtle animate-pulse" /> : !list.length ? (
              <p className="px-4 py-10 text-center text-[13px] text-ink2">{d.attempts.length ? 'Nothing here.' : 'You haven’t taken a quiz yet. Quizzes are at the end of each module.'}</p>
            ) : list.map(a => (
              <button key={a.id} onClick={() => setOpenId(a.id)} className="flex w-full flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-[13px] text-left first:border-t-0 hover:bg-subtle">
                <div className="min-w-0 flex-[1_1_220px]">
                  <p className="truncate text-sm font-semibold text-navy">{a.title}</p>
                  <p className="mt-0.5 truncate text-[12.5px] text-muted">
                    {[a.course, a.module, when(a.submittedAt), a.timeTakenSecs ? `${Math.max(1, Math.round(a.timeTakenSecs / 60))} min` : null, a.maxAttempts && a.attemptNo > 1 ? `attempt ${a.attemptNo} of ${a.maxAttempts}` : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="h-1.5 w-[120px] overflow-hidden rounded-full bg-subtle"><span className="block h-1.5 rounded-full bg-azure" style={{ width: `${a.pct ?? 0}%` }} /></span>
                <strong className="w-[52px] text-right text-sm text-navy">{a.pct != null ? `${a.pct}%` : '—'}</strong>
                <Badge state={a.state} />
                <span className="text-[13px] font-semibold text-azure-strong">Review</span>
              </button>
            ))}
          </section>

          <aside className="flex min-w-0 flex-[1_1_280px] flex-col gap-3.5">
            <section className="flex flex-col gap-2.5 rounded-lg border border-azure bg-white p-4">
              <h3 className="text-[15px] font-semibold text-navy">Practise these next</h3>
              <p className="text-[12.5px] text-muted">Questions you got wrong most often</p>
              {!d ? <div className="h-16 rounded bg-subtle animate-pulse" /> : !d.weak.length ? <p className="text-[13px] text-ink2">Nothing yet — keep going.</p> : d.weak.map(w => (
                <div key={w.questionId} className="flex items-center gap-2 text-[13px]">
                  <span className="min-w-0 flex-1 truncate text-navy" title={w.text}>{w.text}</span>
                  <span className="shrink-0 text-muted">{w.misses === 1 ? 'missed once' : w.misses === 2 ? 'missed twice' : `missed ${w.misses} times`}</span>
                  {w.courseId && w.lessonId && <Link href={`/student/learn/${w.courseId}/lesson/${w.lessonId}`} className="shrink-0 font-semibold text-azure-strong hover:underline">Lesson</Link>}
                </div>
              ))}
            </section>
            <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-white p-4">
              <h3 className="text-[15px] font-semibold text-navy">Your scores</h3>
              {d && d.trend.length > 1 ? <>
                <div className="flex h-[90px] items-end gap-1.5" role="img" aria-label={`Scores of your last ${d.trend.length} quizzes: ${d.trend.join('%, ')}%`}>
                  {d.trend.map((p, i) => <span key={i} title={`${p}%`} className="flex-1 rounded-t-[3px] bg-azure" style={{ height: `${Math.max(4, p)}%` }} />)}
                </div>
                <p className="text-[12.5px] text-muted">Last {d.trend.length} quizzes · {last! >= first! ? 'up' : 'down'} from {first}% to {last}%</p>
              </> : <p className="text-[13px] text-ink2">Take a couple of quizzes to see your trend.</p>}
            </section>
          </aside>
        </div>
      </div>
      {openId && <AttemptDrawer id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function AttemptDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [r, setR] = useState<Review | null>(null);
  useEffect(() => { api.get(`/portals/student/quiz-history/${id}`).then(x => setR(x.data)).catch(() => notify.error('Could not open this attempt')); }, [id]);
  const right = r?.questions.filter(q => q.isCorrect).length ?? 0;
  const auto = r?.questions.filter(q => q.isCorrect != null).length ?? 0;
  return (
    <Drawer open onOpenChange={o => { if (!o) onClose(); }}>
      <DrawerContent title={r?.title ?? 'Quiz'} description={r ? `${r.course} · ${new Date(r.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : ' '}
        footer={r?.lessonId ? <Link href={`/student/learn/${r.courseId}/lesson/${r.lessonId}`} className="inline-flex h-9 items-center rounded-md bg-azure-strong px-4 text-[13.5px] font-semibold text-on-accent">{r.state === 'passed' ? 'Open the quiz' : 'Try again'}</Link> : undefined}>
        {!r ? <div className="h-64 rounded-md bg-subtle animate-pulse" /> : <>
          <div className="flex items-center gap-3 rounded-md border border-line px-4 py-3">
            <span className="text-2xl font-extrabold text-navy">{r.pct != null ? `${r.pct}%` : '—'}</span>
            <span className="flex-1 text-[13px] text-ink2">{r.state === 'marking' ? 'Your teacher is marking the written answers.' : `${r.score} of ${r.maxScore} marks · ${right} of ${auto} marked automatically right${r.passMark != null ? ` · pass mark ${r.passMark}%` : ''}`}</span>
            <Badge state={r.state} />
          </div>
          {r.feedback && <p className="rounded-md border border-azure bg-accent-soft px-3.5 py-3 text-[13.5px] text-navy"><strong>Teacher’s feedback:</strong> {r.feedback}</p>}
          <DrawerSection title="Questions" count={r.questions.length}>
            {r.questions.map((q, i) => (
              <div key={q.id} className="rounded-md border border-line px-3.5 py-3">
                <p className="flex gap-2 text-[13.5px] font-semibold text-navy">
                  <span className={clsx('shrink-0', q.isCorrect === true ? 'text-azure-strong' : 'text-muted')}>{q.isCorrect == null ? '✎' : q.isCorrect ? '✓' : '✗'}</span>
                  <span>{i + 1}. {q.text}</span>
                </p>
                <p className="mt-1.5 text-[13px] text-ink2">Your answer: <span className="text-navy">{q.yourAnswer || 'no answer'}</span></p>
                {q.isCorrect === false && q.correctAnswer && <p className="text-[13px] text-ink2">Right answer: <strong className="text-navy">{q.correctAnswer}</strong></p>}
                {q.explanation && <p className="mt-1.5 rounded bg-subtle px-2.5 py-2 text-[12.5px] text-ink2">{q.explanation}</p>}
              </div>
            ))}
          </DrawerSection>
        </>}
      </DrawerContent>
    </Drawer>
  );
}
