'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { CountryView, CountryInsights } from '@/components/insights/CountryView';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Period = 'month' | 'last' | 'six';
interface Todo { endingSoon: number; applications: number; needsPayout: boolean }

/** The rep's country: their earnings, its students, teachers and sales, and what needs them */
export default function RepDashboardPage() {
  const [period, setPeriod] = useState<Period>('month');
  const [d, setD] = useState<CountryInsights | null>(null);
  const [todo, setTodo] = useState<Todo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setD(null);
    api.get('/countries/country-rep/insights', { params: { period } }).then(r => setD(r.data))
      .catch(e => { const m = e?.response?.data?.message ?? 'Could not load your country'; setError(m); notify.error(m); });
  }, [period]);
  useEffect(() => { api.get('/countries/country-rep/overview').then(r => setTodo(r.data?.todo ?? null)).catch(() => {}); }, []);

  if (error && !d) return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Dashboard" />
      <div className="p-4 lg:px-7 lg:py-6"><div className="rounded-xl border border-line bg-white px-6 py-12 text-center"><p className="text-base font-bold text-navy">{error}</p><p className="mt-1 text-[13.5px] text-ink2">An admin assigns country representatives to a country.</p></div></div>
    </div>
  );

  const items = todo ? [
    todo.endingSoon > 0 && { t: `${todo.endingSoon} student${todo.endingSoon === 1 ? '’s' : 's’'} access ends this week`, a: 'View', href: '/country-rep/students' },
    todo.applications > 0 && { t: `${todo.applications} teacher${todo.applications === 1 ? '' : 's'} applied from ${d?.country.name ?? 'your country'}`, a: 'View', href: '/country-rep/teachers' },
    todo.needsPayout && { t: 'Add your payout account so you can be paid', a: 'Add', href: '/country-rep/profile' },
  ].filter(Boolean) as { t: string; a: string; href: string }[] : [];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title={d?.country.name ?? 'Dashboard'} subtitle="How CareerPath is doing in your country"
        actions={
          <div role="tablist" aria-label="Period" className="flex gap-0.5 rounded-lg border border-line bg-white p-[3px]">
            {([['month', 'This month'], ['last', 'Last month'], ['six', 'Last 6 months']] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={period === k} onClick={() => setPeriod(k)}
                className={clsx('h-7 rounded-md px-2.5 text-[12.5px] text-navy', period === k ? 'bg-accent-soft font-bold' : 'font-medium')}>{l}</button>
            ))}
          </div>
        } />
      <div className="flex flex-col gap-[18px] p-4 lg:px-7 lg:py-6">
        {items.length > 0 && (
          <section className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-xl border border-[#3F6FE8] bg-accent-soft px-[18px] py-3">
            <h3 className="text-[14px] font-bold text-navy">Needs you</h3>
            {items.map(t => <p key={t.t} className="flex gap-2 text-[13px]"><span className="text-ink2">{t.t}</span><Link href={t.href} className="font-bold text-azure-strong hover:underline">{t.a}</Link></p>)}
          </section>
        )}
        {d ? <CountryView d={d} forRep studentsHref="/country-rep/students" teachersHref="/country-rep/teachers" />
          : <div className="flex flex-col gap-4">{[220, 140, 320].map((h, i) => <div key={i} className="animate-pulse rounded-xl border border-line bg-white" style={{ height: h }} />)}</div>}
      </div>
    </div>
  );
}
