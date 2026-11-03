'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

export interface TestOverview {
  total: number; pools: { unused: number; wrong: number; learning: number; mastered: number; flagged: number };
  courseCount: number; packageCount: number; testsTaken: number; streak: number;
  inProgress: { id: string; title: string; mode: string } | null;
  topics: { topic: string; moduleId: string | null; percent: number; answered: number }[];
  recent: { id: string; title: string; mode: string; submittedAt: string; percent: number | null; questionCount: number }[];
}

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const ICONS = {
  create: 'M12 5v14M5 12h14',
  random: 'M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5',
  cat: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  papers: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9ZM14 3v6h6M8 13h8M8 17h6',
  warm: 'M12 3v2M12 19v2M5 5l1.4 1.4M17.6 17.6 19 19M3 12h2M19 12h2M5 19l1.4-1.4M17.6 6.4 19 5M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z',
  history: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 2',
};

function Tile({ icon, title, sub, stat, href, onClick, solid, soon, busy }: {
  icon: keyof typeof ICONS; title: string; sub: string; stat?: string; href?: string; onClick?: () => void; solid?: boolean; soon?: boolean; busy?: boolean;
}) {
  const inner = (
    <>
      <span className={`flex h-[34px] w-[34px] items-center justify-center rounded-lg ${solid ? 'bg-white/20' : 'bg-[#3F6FE8]'}`}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={ICONS[icon]} /></svg>
      </span>
      <span className="flex flex-col gap-0.5">
        <strong className={`text-[15px] ${solid ? 'text-white' : 'text-navy'}`}>{title}</strong>
        <span className={`text-[13px] leading-snug ${solid ? 'text-white/85' : 'text-ink2'}`}>{sub}</span>
      </span>
      <span className="flex items-center justify-between">
        <span className={`text-xs font-semibold ${solid ? 'text-white' : soon ? 'text-muted' : 'text-[#3F6FE8]'}`}>{busy ? 'Starting…' : soon ? 'Coming soon' : stat}</span>
        {!soon && <span aria-hidden className={`font-bold ${solid ? 'text-white' : 'text-muted'}`}>→</span>}
      </span>
    </>
  );
  const cls = `flex flex-col gap-3 rounded-[10px] p-4 text-left transition ${solid ? 'bg-[#3F6FE8]' : 'border border-line bg-white'} ${soon ? 'opacity-80' : solid ? 'hover:bg-[#2F57C9]' : 'hover:border-[#5889FA]'}`;
  if (soon) return <div className={cls}>{inner}</div>;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button type="button" onClick={onClick} disabled={busy} className={cls}>{inner}</button>;
}

export function useTestOverview() {
  const [data, setData] = useState<TestOverview | null>(null);
  useEffect(() => { api.get('/test-centre/overview').then(r => setData(r.data)).catch(() => {}); }, []);
  return data;
}

/** The Test Centre's shortcuts. `compact` is the three-tile row on the dashboard. */
export function TestTiles({ data, compact }: { data: TestOverview | null; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState('');

  async function quick(preset: 'surprise' | 'warmup') {
    setBusy(preset);
    try {
      const { data: s } = await api.post('/test-centre/sessions', { preset });
      router.push(`/student/tests/${s.id}`);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Could not start. Try again.');
      setBusy('');
    }
  }

  const unused = data ? `${plural(data.pools.unused, 'unused question')}` : '';
  const scope = data ? [plural(data.courseCount, 'course'), data.packageCount ? plural(data.packageCount, 'package') : ''].filter(Boolean).join(', ') : '';
  const weak = data ? (data.pools.wrong ? `${data.pools.wrong} to fix` : data.streak ? `${plural(data.streak, 'day')} in a row` : 'Ten quick questions') : '';

  if (compact) return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Tile icon="create" title="Create a test" sub="Your filters, up to 150 questions" stat={unused} href="/student/tests/new" />
      <Tile icon="warm" title="Daily warm-up" sub="Ten questions on your weak topics" stat={weak} onClick={() => quick('warmup')} busy={busy === 'warmup'} />
      <Tile icon="history" title="Test Centre" sub="Mock exams, results and more" stat={data ? plural(data.testsTaken, 'test') + ' taken' : ''} href="/student/tests" />
    </div>
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Tile icon="create" title="Create a test" sub="Your filters, up to 150 questions" stat={unused} href="/student/tests/new" />
      <Tile icon="random" title="Surprise me" sub="A random mix from everything you study" stat={scope} onClick={() => quick('surprise')} busy={busy === 'surprise'} />
      <Tile icon="cat" title="CAT readiness exams" sub="Adapts to you. Are you ready for NCLEX?" solid soon />
      <Tile icon="papers" title="Past papers" sub="Real exam years, paper by paper" soon />
      <Tile icon="warm" title="Daily warm-up" sub="Ten questions on your weak topics" stat={weak} onClick={() => quick('warmup')} busy={busy === 'warmup'} />
      <Tile icon="history" title="Previous tests" sub="Review or retake past attempts" stat={data ? plural(data.testsTaken, 'test') + ' taken' : ''} href="/student/tests/history" />
    </div>
  );
}
