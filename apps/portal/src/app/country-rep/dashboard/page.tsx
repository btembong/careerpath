'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import { minorToMajor } from '@cpa/shared';
import api from '@/lib/api';
import { money } from '@/lib/money';

type Range = 'month' | 'last' | 'year';
interface Overview {
  country: { name: string; currency: string; commissionPct: number | null; perStudentBonus: number | null };
  range: string;
  stats: { sales: number; salesChangePct: number | null; otherCurrencies: { currency: string; amount: number }[]; salesCount: number; newStudents: number; newStudentsBefore: number; activeStudents: number; commission: number; bonus: number };
  wallet: { balance: number; currency: string };
  weeks: { from: string; amount: number; count: number }[];
  recent: { kind: 'package' | 'course'; student: string; item: string; amount: number; currency: string; gateway: string | null; at: string }[];
  top: { name: string; kind: string; count: number; amount: number }[];
  todo: { endingSoon: number; applications: number; needsPayout: boolean };
}

const short = (amount: number, currency: string) => {
  const v = minorToMajor(amount, currency);
  return v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1)}k` : String(Math.round(v));
};
const GATEWAY: Record<string, string> = { paystack: 'card or mobile money', tranzak: 'mobile money', stripe: 'card' };
function when(iso: string) {
  const d = Math.floor((Date.now() - +new Date(iso)) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function RepDashboardPage() {
  const [range, setRange] = useState<Range>('month');
  const [d, setD] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api.get('/countries/country-rep/overview', { params: { range } }).then(r => setD(r.data))
      .catch(e => { const m = e?.response?.data?.message ?? 'Could not load your country'; setError(m); notify.error(m); });
  }, [range]);

  if (error && !d) return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Dashboard" />
      <div className="p-4 lg:px-7 lg:py-6"><div className="rounded-lg border border-line bg-white px-6 py-12 text-center"><p className="text-base font-bold text-navy">{error}</p><p className="mt-1 text-[13.5px] text-ink2">An admin assigns country representatives to a country.</p></div></div>
    </div>
  );

  const c = d?.country.currency ?? '';
  const s = d?.stats;
  const max = Math.max(1, ...(d?.weeks.map(w => w.amount) ?? [1]));
  const topMax = Math.max(1, ...(d?.top.map(t => t.count) ?? [1]));
  const todo = d ? [
    d.todo.endingSoon > 0 && { t: `${d.todo.endingSoon} student${d.todo.endingSoon === 1 ? '’s' : 's’'} access ends this week`, a: 'View', href: '/country-rep/students' },
    d.todo.applications > 0 && { t: `${d.todo.applications} teacher${d.todo.applications === 1 ? '' : 's'} applied from ${d.country.name}`, a: 'View', href: '/country-rep/teachers' },
    d.todo.needsPayout && { t: 'Add your payout account', a: 'Add', href: '/country-rep/profile' },
  ].filter(Boolean) as { t: string; a: string; href: string }[] : [];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title={d?.country.name ?? 'Dashboard'} subtitle="How CareerPath is doing in your country"
        actions={
          <div role="tablist" aria-label="Period" className="flex gap-1 rounded-lg border border-line bg-white p-1 text-[13px]">
            {([['month', 'This month'], ['last', 'Last month'], ['year', 'This year']] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={range === k} onClick={() => setRange(k)}
                className={clsx('rounded-md px-3 py-1.5 text-navy', range === k ? 'bg-accent-soft font-semibold' : 'font-medium hover:bg-subtle')}>{l}</button>
            ))}
          </div>
        } />
      <div className="flex flex-col gap-[18px] p-4 lg:px-7 lg:py-6">
        <dl className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
          {[
            { l: 'Sales', v: s ? money(s.sales, c) : '—', sub: s ? (s.salesChangePct != null ? `${s.salesChangePct >= 0 ? '+' : ''}${s.salesChangePct}% on the period before` : `${s.salesCount} sale${s.salesCount === 1 ? '' : 's'}`) + (s.otherCurrencies.length ? ` · plus ${s.otherCurrencies.map(o => money(o.amount, o.currency)).join(', ')}` : '') : '' },
            { l: 'New students', v: s ? String(s.newStudents) : '—', sub: s ? `${s.newStudentsBefore} the period before` : '' },
            { l: 'Active students', v: s ? String(s.activeStudents) : '—', sub: 'with a package or course' },
            { l: 'Your commission', v: s ? money(s.commission, c) : '—', sub: s ? (s.bonus ? `plus ${money(s.bonus, c)} new-student bonus` : `${d!.range}`) : '', blue: true },
          ].map(x => (
            <div key={x.l} className={clsx('rounded-lg border bg-white px-4 py-3.5', x.blue ? 'border-azure' : 'border-line')}>
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{x.l}</dt>
              <dd className="mt-1.5 text-[22px] font-extrabold text-navy">{x.v}</dd>
              <dd className="mt-0.5 text-[12.5px] text-muted">{x.sub}</dd>
            </div>
          ))}
        </dl>

        <div className="flex flex-wrap items-start gap-5">
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
            <section className="rounded-lg border border-line bg-white p-[18px]">
              <div className="flex items-baseline justify-between"><h2 className="text-base font-bold text-navy">Sales by week</h2><span className="text-[12.5px] text-muted">{c} · last 8 weeks</span></div>
              {!d ? <div className="mt-3.5 h-[150px] rounded bg-subtle animate-pulse" /> : (
                <div className="mt-3.5 flex h-[150px] items-end gap-2.5" role="img" aria-label={`Weekly sales: ${d.weeks.map(w => money(w.amount, c)).join(', ')}`}>
                  {d.weeks.map((w, i) => (
                    <div key={w.from} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`Week of ${new Date(w.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: ${money(w.amount, c)} · ${w.count} sale${w.count === 1 ? '' : 's'}`}>
                      <span className="text-[11px] text-muted">{w.amount ? short(w.amount, c) : ''}</span>
                      <span className={clsx('w-full rounded-t-[3px]', i === d.weeks.length - 1 ? 'bg-azure-strong' : 'bg-azure')} style={{ height: `${Math.max(2, Math.round((w.amount / max) * 100))}px` }} />
                      <span className="text-[11px] text-muted">{new Date(w.from).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                    </div>
                  ))}
                </div>
              )}
            </section>
            <section className="rounded-lg border border-line bg-white">
              <div className="flex justify-between border-b border-line px-[18px] py-3.5"><h2 className="text-base font-bold text-navy">Recent sales</h2><Link href="/country-rep/students" className="text-[13px] font-semibold text-azure-strong hover:underline">All students</Link></div>
              {!d ? <div className="m-4 h-32 rounded bg-subtle animate-pulse" /> : !d.recent.length ? <p className="px-4 py-8 text-center text-[13px] text-ink2">No sales {d.range}.</p> : d.recent.map((r, i) => (
                <div key={i} className="flex items-center gap-3 border-t border-line px-[18px] py-[11px] text-[13.5px] first-of-type:border-t-0">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md bg-accent-soft text-xs font-extrabold text-navy">{r.student.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}</span>
                  <div className="min-w-0 flex-1"><p className="font-semibold text-navy">{r.student}</p><p className="mt-px truncate text-[12.5px] text-muted">{r.item}{r.kind === 'course' ? ' (course)' : ''}{r.gateway && GATEWAY[r.gateway] ? ` · ${GATEWAY[r.gateway]}` : ''}</p></div>
                  <span className="text-[12.5px] text-muted">{when(r.at)}</span>
                  <strong className="w-24 text-right text-navy">{money(r.amount, r.currency)}</strong>
                </div>
              ))}
            </section>
          </div>
          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
            {todo.length > 0 && (
              <section className="flex flex-col gap-2 rounded-lg border border-azure bg-white p-4">
                <h3 className="text-[15px] font-semibold text-navy">Needs you</h3>
                {todo.map(t => <p key={t.t} className="flex justify-between gap-2 text-[13px]"><span className="text-ink2">{t.t}</span><Link href={t.href} className="whitespace-nowrap font-semibold text-azure-strong hover:underline">{t.a}</Link></p>)}
              </section>
            )}
            <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-4">
              <h3 className="text-[15px] font-semibold text-navy">Best-selling</h3>
              {!d ? <div className="h-20 rounded bg-subtle animate-pulse" /> : !d.top.length ? <p className="text-[13px] text-ink2">No sales {d.range}.</p> : d.top.map(t => (
                <div key={t.name} className="flex flex-col gap-1 text-[13px]">
                  <p className="flex justify-between gap-2"><span className="truncate text-navy">{t.name}</span><strong className="shrink-0 text-navy">{t.count} sold</strong></p>
                  <span className="h-1.5 rounded-full bg-subtle"><span className="block h-1.5 rounded-full bg-azure" style={{ width: `${(t.count / topMax) * 100}%` }} /></span>
                </div>
              ))}
            </section>
            <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
              <h3 className="text-[15px] font-semibold text-navy">Your earnings</h3>
              <p className="text-[13px] text-ink2">
                {d?.country.commissionPct != null ? `${d.country.commissionPct}% of sales in ${d.country.name}` : 'Your commission rate hasn’t been set yet'}
                {d?.country.perStudentBonus ? `, plus ${money(d.country.perStudentBonus, c)} a month for each active student.` : '.'}
              </p>
              {d && <p className="text-[13px]"><strong className="text-navy">{money(d.wallet.balance, d.wallet.currency)}</strong> <span className="text-muted">in your wallet · <Link href="/country-rep/wallet" className="font-semibold text-azure-strong hover:underline">Wallet</Link></span></p>}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}
