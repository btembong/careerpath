'use client';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { TestTiles, useTestOverview, plural } from '@/components/tests/TestTiles';

const when = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

export default function TestCentrePage() {
  const data = useTestOverview();
  const nothing = data && data.total === 0;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-navy">Test Centre</h1>
          <p className="mt-1 text-sm text-ink2">Test yourself on anything you’re studying, the way the real exam will.</p>
        </div>

        {data?.inProgress && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[#5889FA] bg-[#EAF0FF] px-4 py-3 text-sm text-navy">
            <span className="flex-1">You have a test in progress: <strong>{data.inProgress.title}</strong></span>
            <Link href={`/student/tests/${data.inProgress.id}`} className="font-semibold text-[#3F6FE8]">Continue →</Link>
          </div>
        )}

        {nothing && (
          <div className="rounded-lg border border-line bg-white p-5 text-sm text-ink2">
            <strong className="block text-navy">No questions yet</strong>
            Buying or joining a course unlocks its questions here. <Link href="/student/catalogue" className="font-semibold text-[#3F6FE8]">Browse the catalogue</Link>
          </div>
        )}

        <TestTiles data={data} />

        <div className="grid items-start gap-4 lg:grid-cols-[1.3fr_1fr]">
          <section className="flex flex-col gap-3 rounded-lg border border-line bg-white p-[18px]">
            <h2 className="text-base font-bold text-navy">Where you’re strong and weak</h2>
            {!data?.topics.length && <p className="text-sm text-muted">Answer at least three questions on a topic to see how you’re doing.</p>}
            {data?.topics.map(t => (
              <div key={t.topic} className="grid grid-cols-[minmax(0,180px)_1fr_90px] items-center gap-3 text-[13.5px] text-navy">
                <span className="truncate" title={t.topic}>{t.topic}</span>
                <span className="h-2 rounded bg-subtle"><span className={`block h-2 rounded ${t.percent < 60 ? 'bg-[#C1352B]' : 'bg-[#3F6FE8]'}`} style={{ width: `${t.percent}%` }} /></span>
                <span className="text-right text-ink2">{t.percent}% · {t.percent < 60 ? 'weak' : t.percent < 75 ? 'fair' : 'strong'}</span>
              </div>
            ))}
          </section>
          <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-[18px]">
            <div className="flex items-center justify-between"><h2 className="text-base font-bold text-navy">Recent tests</h2>
              {!!data?.recent.length && <Link href="/student/tests/history" className="text-[13px] font-semibold text-[#3F6FE8]">See all</Link>}</div>
            {!data?.recent.length && <p className="text-sm text-muted">Your finished tests will show here.</p>}
            {data?.recent.map(r => (
              <Link key={r.id} href={`/student/tests/${r.id}/result`} className="flex items-center justify-between gap-3 border-b border-line py-2 text-[13.5px] last:border-0">
                <span className="min-w-0"><strong className="block truncate text-navy">{r.title}</strong>
                  <span className="text-xs text-muted">{r.mode === 'EXAM' ? 'Exam' : 'Practice'} · {plural(r.questionCount, 'question')} · {when(r.submittedAt)}</span></span>
                <strong className="text-navy">{r.percent != null ? `${r.percent}%` : '—'}</strong>
              </Link>
            ))}
          </section>
        </div>
      </div>
    </div>
  );
}
