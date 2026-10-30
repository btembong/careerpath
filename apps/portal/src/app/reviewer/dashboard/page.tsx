'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';

interface Item {
  courseId: string; title: string; courseStatus: string; programme: string | null; teacher: string;
  lessons: number; quizzes: number; submittedAt: string | null; reviewedAt: string | null;
  decision: 'PENDING' | 'APPROVED' | 'REJECTED'; notes: string | null; commissionPct: number | null; resubmitted: boolean;
}
interface Overview {
  stats: { toReview: number; oldestWaitDays: number | null; reviewed: number; avgReviewDays: number | null; earned: { currency: string; amount: number }[] };
  queue: Item[]; history: Item[];
}

const DAY = 86_400_000;
const abbr = (t: string) => t.split(/[\s·—-]+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'C';
const waited = (d: string | null) => {
  if (!d) return 'Waiting';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / DAY);
  return days <= 0 ? 'Today' : `Waiting ${days} day${days === 1 ? '' : 's'}`;
};

export default function ReviewerDashboard() {
  const [d, setD] = useState<Overview | null>(null);
  const [tab, setTab] = useState<'queue' | 'done'>('queue');
  useEffect(() => { api.get('/reviewer/overview').then(r => setD(r.data)).catch(() => setD({ stats: { toReview: 0, oldestWaitDays: null, reviewed: 0, avgReviewDays: null, earned: [] }, queue: [], history: [] })); }, []);

  const s = d?.stats;
  const earned = s?.earned.length ? s.earned.map(e => `${e.currency} ${minorToMajor(e.amount, e.currency).toLocaleString()}`).join(' · ') : '—';
  const list = tab === 'queue' ? d?.queue ?? [] : d?.history ?? [];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Review queue" subtitle="Courses waiting for your subject review" />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          {[
            { l: 'To review', v: s ? String(s.toReview) : '…', sub: s?.oldestWaitDays != null ? `Oldest waiting ${s.oldestWaitDays} day${s.oldestWaitDays === 1 ? '' : 's'}` : 'Nothing waiting' },
            { l: 'Reviewed', v: s ? String(s.reviewed) : '…', sub: 'All time' },
            { l: 'Average time', v: s?.avgReviewDays != null ? `${s.avgReviewDays} days` : '—', sub: 'From submit to decision' },
            { l: 'Earned', v: earned, sub: 'Your share of sales of courses you reviewed' },
          ].map(x => (
            <div key={x.l} className="rounded-lg border border-line bg-white p-4">
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{x.l}</dt>
              <dd className="mt-1.5 truncate text-[22px] font-extrabold text-navy">{x.v}</dd>
              <dd className="mt-0.5 truncate text-[12.5px] text-muted">{x.sub}</dd>
            </div>
          ))}
        </dl>

        <section className="rounded-lg border border-line bg-white">
          <div role="tablist" aria-label="Reviews" className="flex gap-1 border-b border-line px-4">
            {([['queue', 'To review', d?.queue.length ?? 0], ['done', 'Reviewed', d?.history.length ?? 0]] as ['queue' | 'done', string, number][]).map(([k, l, n]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={clsx('-mb-px h-[46px] border-b-2 px-3 text-[13.5px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent font-medium')}>
                {l} <span className="font-medium text-muted">{n}</span>
              </button>
            ))}
          </div>
          {!d ? <div className="m-4 h-40 rounded-md bg-subtle animate-pulse" /> : !list.length ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink2">{tab === 'queue' ? 'Nothing to review right now. New courses appear here when teachers submit them.' : 'You haven’t reviewed a course yet.'}</p>
          ) : list.map(q => (
            <div key={q.courseId} className="flex flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-3.5 first:border-t-0">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-accent-soft text-[13px] font-extrabold text-azure-strong">{abbr(q.title)}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-navy">{q.title}</p>
                <p className="mt-0.5 truncate text-[12.5px] text-muted">
                  {[q.teacher, q.programme, `${q.lessons} lessons`, q.quizzes ? `${q.quizzes} quiz${q.quizzes === 1 ? '' : 'zes'}` : null, q.resubmitted ? 'resubmitted after changes' : null].filter(Boolean).join(' · ')}
                </p>
              </div>
              {tab === 'queue' ? <>
                <span className={clsx('inline-flex h-6 items-center rounded px-2 text-xs font-semibold', (Date.now() - +new Date(q.submittedAt ?? Date.now())) > 3 * DAY ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>{waited(q.submittedAt)}</span>
                {q.commissionPct != null && <span className="text-[12.5px] text-ink2">Earns {q.commissionPct}% of sales</span>}
                <Link href={`/reviewer/courses/${q.courseId}`} className="inline-flex h-8 items-center rounded-md bg-azure-strong px-3 text-[13px] font-semibold text-on-accent">Start review</Link>
              </> : <>
                <span className={clsx('inline-flex h-6 items-center rounded px-2 text-xs font-semibold', q.decision === 'APPROVED' ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>
                  {q.decision === 'APPROVED' ? 'Approved' : 'Changes asked'}
                </span>
                <span className="text-[12.5px] text-muted">{q.reviewedAt ? new Date(q.reviewedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : ''}</span>
                <Link href={`/reviewer/courses/${q.courseId}`} className="inline-flex h-8 items-center rounded-md border border-line px-3 text-[13px] font-semibold text-navy hover:bg-subtle">View</Link>
              </>}
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}
