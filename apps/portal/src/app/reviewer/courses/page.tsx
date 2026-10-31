'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Row {
  courseId: string; title: string; programme: string | null; teacher: string; lessons: number; quizzes: number;
  submittedAt: string | null; reviewedAt: string | null; decision: 'PENDING' | 'APPROVED' | 'REJECTED'; resubmitted: boolean;
}
interface Overview {
  stats: { toReview: number; oldestWaitDays: number | null; reviewed: number; avgReviewDays: number | null; approved: number; sentBack: number };
  queue: Row[]; history: Row[];
}
type Tab = 'all' | 'todo' | 'back' | 'approved';

const stateOf = (r: Row) => r.decision === 'PENDING' ? (r.resubmitted ? 'Resubmitted' : 'To review') : r.decision === 'APPROVED' ? 'Approved' : 'Sent back';
function ago(iso: string | null) {
  if (!iso) return '—';
  const d = Math.floor((Date.now() - +new Date(iso)) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 7 ? `${d} days ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
const th = 'border-b border-line px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted';
const td = 'border-b border-line px-4 py-3 align-top';

export default function ReviewerCoursesPage() {
  const [d, setD] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  useEffect(() => { api.get('/reviewer/overview').then(r => setD(r.data)).catch(() => notify.error('Could not load your courses')); }, []);

  // Latest state of each course: anything waiting first, then most recently reviewed
  const all = d ? [...d.queue, ...d.history.filter(h => !d.queue.some(x => x.courseId === h.courseId))] : [];
  const pick: Record<Tab, (r: Row) => boolean> = {
    all: () => true, todo: r => r.decision === 'PENDING', back: r => r.decision === 'REJECTED', approved: r => r.decision === 'APPROVED',
  };
  const rows = all.filter(pick[tab]).filter(r => !q.trim() || `${r.title} ${r.teacher} ${r.programme ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const s = d?.stats;
  const approvalRate = s && s.reviewed ? Math.round((s.approved / s.reviewed) * 100) : null;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Courses" subtitle="Every course you’ve been asked to review" />
      <div className="flex flex-col gap-[18px] p-4 lg:px-7 lg:py-6">
        <dl className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
          {[
            { l: 'To review', v: s ? String(s.toReview) : '—', sub: s?.oldestWaitDays != null ? `oldest ${s.oldestWaitDays === 0 ? 'today' : `${s.oldestWaitDays} day${s.oldestWaitDays === 1 ? '' : 's'}`}` : 'nothing waiting' },
            { l: 'Reviewed', v: s ? String(s.reviewed) : '—', sub: 'decisions made' },
            { l: 'Average time', v: s?.avgReviewDays != null ? `${s.avgReviewDays} day${s.avgReviewDays === 1 ? '' : 's'}` : '—', sub: 'target 3 days' },
            { l: 'Approved', v: approvalRate != null ? `${approvalRate}%` : '—', sub: s ? `${s.approved} of ${s.reviewed}` : '' },
          ].map(x => (
            <div key={x.l} className="rounded-lg border border-line bg-white px-4 py-3.5">
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{x.l}</dt>
              <dd className="mt-1.5 text-[22px] font-extrabold text-navy">{x.v}</dd>
              <dd className="mt-0.5 text-[12.5px] text-muted">{x.sub}</dd>
            </div>
          ))}
        </dl>
        <section className="rounded-lg border border-line bg-white">
          <div className="flex flex-wrap items-center gap-1 border-b border-line px-4">
            {([['all', 'All'], ['todo', 'To review'], ['back', 'Sent back'], ['approved', 'Approved']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
                className={clsx('-mb-px h-[46px] border-b-2 px-2.5 text-[13.5px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent font-medium')}>{l} {all.filter(pick[k]).length}</button>
            ))}
            <span className="flex-1" />
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search courses or teachers" aria-label="Search courses"
              className="my-2 h-8 w-56 rounded-md border border-line px-2.5 text-[13px] text-navy outline-none focus:border-azure max-sm:w-full" />
          </div>
          {!d ? <div className="m-4 h-48 rounded-md bg-subtle animate-pulse" /> : !rows.length ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink2">{all.length ? 'Nothing here.' : 'No courses have been assigned to you yet.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
                <thead><tr>{['Course', 'Teacher', 'Size', 'Sent', 'Status', ''].map(h => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map(r => {
                    const st = stateOf(r);
                    const waiting = r.decision === 'PENDING';
                    return (
                      <tr key={r.courseId} className="hover:bg-subtle">
                        <td className={td}><strong className="text-navy">{r.title}</strong>{r.programme && <><br /><span className="text-[12.5px] text-muted">{r.programme}</span></>}</td>
                        <td className={clsx(td, 'text-navy')}>{r.teacher}</td>
                        <td className={clsx(td, 'text-ink2')}>{r.lessons} lesson{r.lessons === 1 ? '' : 's'} · {r.quizzes} quiz{r.quizzes === 1 ? '' : 'zes'}</td>
                        <td className={clsx(td, 'text-ink2')}>{ago(r.submittedAt)}{!waiting && r.reviewedAt && <><br /><span className="text-[12.5px] text-muted">decided {ago(r.reviewedAt)}</span></>}</td>
                        <td className={td}><span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-semibold', waiting ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>{st}</span></td>
                        <td className={clsx(td, 'text-right')}><Link href={`/reviewer/courses/${r.courseId}`} className="font-semibold text-azure-strong hover:underline">{waiting ? 'Review' : 'Open'}</Link></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
