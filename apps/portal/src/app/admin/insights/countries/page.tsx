'use client';
import { useEffect, useState, Suspense as _Suspense } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Suspense = _Suspense as any;
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { InsightsTabs } from '@/components/insights/InsightsTabs';
import { CountryView, CountryInsights, majorMoney } from '@/components/insights/CountryView';
import { KIND_COLOURS, KpiTile } from '@/components/wallet/WalletCharts';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Row { id: string; code: string; name: string; currency: string; rep: string | null; students: number; newStudents: number; teachers: number; sales: number; salesCount: number; teachersEarned: number; repEarned: number; kept: number; trend: number[] }
interface All { base: string; period: string; months: { label: string; start: string }[]; rows: Row[]; unknown: { students: number; teachers: number }; totals: { students: number; newStudents: number; teachers: number; sales: number; teachersEarned: number; repEarned: number; kept: number; trend: number[] } }

const n = (v: number) => v.toLocaleString('en-GB');
const colourOf = (i: number) => KIND_COLOURS[i % KIND_COLOURS.length];

function Inner() {
  const params = useSearchParams();
  const router = useRouter();
  const [tab, setTab] = useState(params.get('c') ?? 'all');
  const [period, setPeriod] = useState('month');
  const [all, setAll] = useState<All | null>(null);
  const [one, setOne] = useState<CountryInsights | null>(null);

  useEffect(() => { api.get('/reports/admin/insights/countries', { params: { period } }).then(r => setAll(r.data)).catch(() => notify.error('Could not load countries')); }, [period]);
  useEffect(() => {
    if (tab === 'all') return;
    setOne(null);
    api.get(`/reports/admin/insights/countries/${tab}`, { params: { period } }).then(r => setOne(r.data)).catch(() => notify.error('Could not load that country'));
  }, [tab, period]);
  const pick = (id: string) => { setTab(id); router.replace(id === 'all' ? '/admin/insights/countries' : `/admin/insights/countries?c=${id}`, { scroll: false }); };

  const base = all?.base ?? 'XAF';
  const m = (v: number) => (v ? majorMoney(v, base) : '—');
  const rows = all?.rows ?? [];
  const share = rows.filter(r => r.sales > 0);
  const totalSales = Math.max(1, share.reduce((s, r) => s + r.sales, 0));
  const idx = (id: string) => rows.findIndex(r => r.id === id);

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Insights" subtitle="Students, teachers and money, country by country"
        actions={<>
          <select aria-label="Period" value={period} onChange={e => setPeriod(e.target.value)} className="h-9 rounded-md border border-line bg-white px-2.5 text-[13px] font-semibold text-navy">
            <option value="month">This month</option><option value="last">Last month</option><option value="six">Last 6 months</option>
          </select>
          <Link href="/admin/countries" className="hidden h-9 items-center rounded-md border border-line px-3 text-[13px] font-semibold text-navy hover:bg-subtle sm:inline-flex">Country settings</Link>
        </>} />
      <InsightsTabs />

      <nav aria-label="Country" className="flex gap-1.5 overflow-x-auto border-b border-line bg-white px-4 pt-3 lg:px-7">
        {[{ id: 'all', code: 'All', name: 'All countries', students: all?.totals.students ?? 0, i: -1 }, ...rows.map((r, i) => ({ id: r.id, code: r.code, name: r.name, students: r.students, i }))].map(t => (
          <button key={t.id} type="button" onClick={() => pick(t.id)} aria-current={tab === t.id ? 'page' : undefined}
            className={clsx('flex flex-shrink-0 items-center gap-2.5 rounded-t-md border-b-[3px] px-3.5 pb-3 pt-2.5 text-left', tab === t.id ? 'border-[#3F6FE8] bg-[#F7F9FF]' : 'border-transparent hover:bg-subtle')}>
            <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-md text-[11px] font-extrabold text-[#FFFFFF]" style={{ background: t.i < 0 ? '#072061' : colourOf(t.i) }}>{t.code}</span>
            <span><span className="block text-sm font-bold text-navy">{t.name}</span><span className="block text-[11.5px] text-muted">{n(t.students)} students</span></span>
          </button>
        ))}
      </nav>

      <div className="flex flex-col gap-[18px] p-4 lg:px-7 lg:py-6">
        {tab !== 'all' ? (
          one ? <CountryView d={one} studentsHref="/admin/users" teachersHref="/admin/teachers" /> : <div className="h-[600px] animate-pulse rounded-xl border border-line bg-white" />
        ) : !all ? <div className="h-[600px] animate-pulse rounded-xl border border-line bg-white" /> : <>
          <dl className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-5">
            <KpiTile label="Students" value={n(all.totals.students)} change={all.totals.newStudents} changeIsPct={false} sub={`${n(all.totals.newStudents)} joined · ${all.period.toLowerCase()}`} series={all.totals.trend.map(() => all.totals.students)} />
            <KpiTile label="Teachers" value={n(all.totals.teachers)} change={null} changeIsPct={false} sub={`in ${rows.filter(r => r.teachers).length} countries`} series={all.totals.trend.map(() => all.totals.teachers)} />
            <KpiTile label="Sales" value={m(all.totals.sales)} change={null} changeIsPct sub="added up at your exchange rates" series={all.totals.trend} />
            <KpiTile label="Paid to teachers and reps" value={m(all.totals.teachersEarned + all.totals.repEarned)} change={null} changeIsPct sub="from these sales" series={all.totals.trend} />
            <KpiTile label="CareerPath kept" value={m(all.totals.kept)} change={null} changeIsPct sub={all.totals.sales ? `${Math.round((all.totals.kept / all.totals.sales) * 100)}% of sales` : 'no sales yet'} series={all.totals.trend} />
          </dl>

          {share.length > 0 && (
            <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base font-bold text-navy">Share of sales</h2><span className="text-[12.5px] text-muted">{all.period} · added up in FCFA at your exchange rates</span></div>
              <div className="flex h-[18px] gap-[2px]">{share.map(r => <span key={r.id} className="block h-[18px] rounded" style={{ background: colourOf(idx(r.id)), flex: `${r.sales} 1 0` }} />)}</div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12.5px] text-ink2">{share.map(r => <li key={r.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: colourOf(idx(r.id)) }} />{r.name} · <strong className="text-navy">{Math.round((r.sales / totalSales) * 100)}%</strong></li>)}</ul>
            </section>
          )}

          <section className="overflow-hidden rounded-xl border border-line bg-white">
            <div className="flex justify-between px-[18px] py-3.5"><h2 className="text-base font-bold text-navy">Countries side by side</h2><span className="text-[12.5px] text-muted">Tap a country to open it</span></div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-[13.5px]">
                <thead><tr>{['Country', 'Students', 'New', 'Teachers', 'Sales', 'Teachers earned', 'Rep earned', 'CareerPath kept', 'Last 6 months'].map((l, i) => <th key={l} className={clsx('border-t border-line px-[18px] py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted', i ? 'text-right' : 'text-left')}>{l}</th>)}</tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id} onClick={() => pick(r.id)} className="cursor-pointer hover:bg-subtle">
                      <td className="border-t border-line px-[18px] py-3"><span className="flex items-center gap-2.5"><span className="flex h-[30px] w-[30px] items-center justify-center rounded-md text-[11px] font-extrabold text-[#FFFFFF]" style={{ background: colourOf(i) }}>{r.code}</span><span><strong className="block text-navy">{r.name}</strong><span className="text-xs text-muted">{r.rep ?? 'No rep yet'}</span></span></span></td>
                      {[n(r.students), `+${n(r.newStudents)}`, n(r.teachers), r.sales ? m(r.sales) : 'No sales', m(r.teachersEarned), m(r.repEarned), r.sales ? m(r.kept) : '—'].map((v, j) => (
                        <td key={j} className={clsx('whitespace-nowrap border-t border-line px-[18px] py-3 text-right font-semibold', v === '—' || v === 'No sales' ? 'text-muted' : 'text-navy')}>{v}</td>
                      ))}
                      <td className="border-t border-line px-[18px] py-2">
                        <svg aria-hidden viewBox="0 0 100 28" preserveAspectRatio="none" className="ml-auto block h-7 w-[100px]"><polyline points={r.trend.map((v, k) => `${Math.round((k * 100) / 5)},${Math.round(26 - (v / Math.max(1, ...r.trend)) * 22)}`).join(' ')} fill="none" stroke="#3F6FE8" strokeWidth={2} vectorEffect="non-scaling-stroke" /></svg>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {(all.unknown.students > 0 || all.unknown.teachers > 0) && <p className="border-t border-line px-[18px] py-3 text-[12.5px] text-muted">{n(all.unknown.students)} students and {n(all.unknown.teachers)} teachers haven’t set their country, so they aren’t in any row.</p>}
          </section>
        </>}
      </div>
    </div>
  );
}

export default function InsightsCountriesPage() {
  return <Suspense fallback={<div className="m-7 h-64 animate-pulse rounded-xl border border-line bg-white" />}><Inner /></Suspense>;
}
