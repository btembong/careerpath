'use client';
import { DashboardHero } from '@/components/dashboard/DashboardHero';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { BarChart, Bar, ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { Topbar } from '@/components/layout/Topbar';
import { minorToMajor } from '@cpa/shared';
import api from '@/lib/api';

type Range = '7d' | 'month' | 'year';
interface Overview {
  range: Range;
  revenueUsd: number;
  prevRevenueUsd: number;
  missingRates: string[];
  newStudents: number;
  prevNewStudents: number;
  activePackages: number;
  weekly: { week: string; usd: number }[];
  recentPurchases: { name: string; item: string; amount: number; currency: string; method: string; at: string }[];
  countries: { name: string; students: number; pct: number }[];
  today: { signups: number; purchases: number; liveClasses: number; openTickets: number };
  pending: { kind: 'teacher' | 'course'; id: string; title: string; meta: string; since: string }[];
}
interface PackageSales { packageId: string; packageName: string; currency: string | null; count: number; revenue: number }

const card = 'flex flex-col gap-3.5 rounded-lg border border-line bg-white p-[18px]';
const h2 = 'flex items-center gap-2 text-base font-bold text-navy';
const count = 'inline-flex h-5 min-w-5 items-center justify-center rounded bg-accent-soft px-1.5 text-[11.5px] font-bold text-navy';
const label = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-muted';
const th = 'border-b border-line py-2 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted';
const td = 'border-b border-line py-3 pr-3 align-middle';
const btn = 'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-colors';
const btnPrimary = `${btn} h-9 px-4 text-[13.5px] border border-azure-strong bg-azure-strong text-on-accent hover:brightness-95`;
const btnSecondary = `${btn} h-9 px-4 text-[13.5px] border border-line bg-white text-navy hover:bg-subtle`;
const btnSm = `${btn} h-8 px-3 text-[13px] border border-line bg-white text-navy hover:bg-subtle`;
const link = 'text-[13px] font-semibold text-azure-strong hover:underline';

const RANGES: { key: Range; label: string; prev: string }[] = [
  { key: '7d', label: '7 days', prev: 'vs the 7 days before' },
  { key: 'month', label: 'This month', prev: 'vs the same days last month' },
  { key: 'year', label: 'This year', prev: 'vs the same days last year' },
];

const usd = (n: number) => `USD ${n.toLocaleString(undefined, { maximumFractionDigits: n < 100 ? 2 : 0 })}`;
function change(now: number, before: number) {
  if (!before) return now ? 'New' : '';
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct >= 0 ? '+' : ''}${pct}%`;
}
function waiting(iso: string) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return days <= 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`;
}

export default function AdminDashboard() {
  const [range, setRange] = useState<Range>('month');
  const [data, setData] = useState<Overview | null>(null);
  const [sales, setSales] = useState<PackageSales[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    api.get('/portals/admin/billing/stats').then(r => setSales(r.data?.salesPerPackage ?? [])).catch(() => {});
  }, []);
  useEffect(() => {
    setFailed(false);
    api.get(`/portals/admin/overview?range=${range}`).then(r => setData(r.data)).catch(() => setFailed(true));
  }, [range]);

  const now = new Date();
  const r = RANGES.find(x => x.key === range)!;
  const totalSold = sales.reduce((t, s) => t + s.count, 0);

  if (failed && !data) return (
    <div className="flex min-h-full flex-col">
      <Topbar />
      <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
        <p className="text-base font-bold text-navy">The overview didn&apos;t load</p>
        <p className="mt-1 text-sm text-ink2">Check your connection, then refresh the page.</p>
        <button type="button" onClick={() => window.location.reload()} className={clsx(btnPrimary, 'mt-5')}>Refresh</button>
      </div>
    </div>
  );

  const stats = data ? [
    { label: 'Revenue', value: usd(data.revenueUsd), delta: change(data.revenueUsd, data.prevRevenueUsd), sub: r.prev },
    { label: 'New students', value: String(data.newStudents), delta: change(data.newStudents, data.prevNewStudents), sub: r.prev },
    { label: 'Active packages', value: String(data.activePackages), delta: '', sub: `${totalSold} sold in total` },
    { label: 'Waiting for a decision', value: String(data.pending.length), delta: '', sub: `${data.pending.filter(p => p.kind === 'teacher').length} teachers, ${data.pending.filter(p => p.kind === 'course').length} courses` },
  ] : [];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <DashboardHero />

        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-xl font-extrabold tracking-[-0.01em] text-navy">Platform overview</h2>
          </div>
          <div role="group" aria-label="Period" className="flex gap-0.5 rounded-md border border-line bg-white p-0.5">
            {RANGES.map(x => (
              <button key={x.key} type="button" aria-pressed={range === x.key} onClick={() => setRange(x.key)}
                className={clsx('h-[30px] rounded px-2.5 text-[12.5px] font-semibold transition-colors',
                  range === x.key ? 'bg-accent-soft text-navy' : 'text-muted hover:text-navy')}>
                {x.label}
              </button>
            ))}
          </div>
          <Link href="/admin/reports" className={btnSecondary}>Reports</Link>
          <Link href="/admin/packages" className={btnPrimary}>New package</Link>
        </div>

        {!data ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
            {[0, 1, 2, 3].map(i => <div key={i} className="h-28 rounded-lg border border-line bg-white animate-pulse" />)}
          </div>
        ) : (
          <>
            {(data.pending.length > 0 || data.missingRates.length > 0) && (
              <div className="flex flex-col gap-2">
                {data.pending.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-4 py-3">
                    <p className="min-w-0 flex-1 text-[13.5px] text-ink2">
                      <strong className="text-navy">{data.pending.length} item{data.pending.length === 1 ? ' needs' : 's need'} a decision.</strong>{' '}
                      Teacher applications and courses approved by a reviewer wait for you.
                    </p>
                    <a href="#decisions" className={btnSm}>Review now</a>
                  </div>
                )}
                {data.missingRates.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-4 py-3">
                    <p className="min-w-0 flex-1 text-[13.5px] text-ink2">
                      <strong className="text-navy">Revenue in {data.missingRates.join(', ')} isn&apos;t counted yet.</strong>{' '}
                      Add {data.missingRates.length === 1 ? 'its' : 'their'} exchange rate to USD so totals include it.
                    </p>
                    <Link href="/admin/reports" className={btnSm}>Set exchange rates</Link>
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              {stats.map(s => (
                <div key={s.label} className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
                  <p className={label}>{s.label}</p>
                  <p className="truncate text-2xl font-extrabold tracking-[-0.01em] text-navy">{s.value}</p>
                  <p className="truncate text-[12.5px] text-muted">
                    {s.delta && <span className="font-bold text-azure-strong">{s.delta} </span>}{s.sub}
                  </p>
                </div>
              ))}
            </div>

            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,2fr)_minmax(300px,1fr)]">
              <div className="flex min-w-0 flex-col gap-5">

                <section className={card}>
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className={h2}>Revenue by week</h2>
                      <p className="mt-0.5 text-[13px] text-muted">Last 12 weeks, all payment methods, in USD</p>
                    </div>
                    <Link href="/admin/reports" className={link}>Reports</Link>
                  </div>
                  <div className="h-56">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.weekly} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                        <CartesianGrid vertical={false} stroke="var(--color-line)" />
                        <XAxis dataKey="week" tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} />
                        <YAxis tick={{ fontSize: 11, fill: 'var(--color-muted)' }} tickLine={false} axisLine={false} />
                        <Tooltip cursor={{ fill: 'var(--color-subtle)' }}
                          contentStyle={{ border: '1px solid var(--color-line)', borderRadius: 6, boxShadow: 'none', fontSize: 12, background: 'var(--color-white)', color: 'var(--color-navy)' }}
                          formatter={(v) => [usd(Number(v)), 'Revenue']} />
                        <Bar dataKey="usd" fill="#5889FA" radius={[3, 3, 0, 0]} maxBarSize={36} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </section>

                <section id="decisions" className={clsx(card, 'scroll-mt-4')}>
                  <h2 className={h2}>Waiting for a decision {data.pending.length > 0 && <span className={count}>{data.pending.length}</span>}</h2>
                  {data.pending.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
                        <thead><tr><th className={th}>Item</th><th className={th}>Type</th><th className={th}>Waiting</th><th className={th} /></tr></thead>
                        <tbody>
                          {data.pending.map(p => (
                            <tr key={p.kind + p.id}>
                              <td className={td}><span className="font-semibold text-navy">{p.title}</span>{p.meta && <span className="block text-xs text-muted">{p.meta}</span>}</td>
                              <td className={td}>
                                <span className={clsx('inline-flex h-6 items-center rounded px-2 text-xs font-semibold',
                                  p.kind === 'course' ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>
                                  {p.kind === 'course' ? 'Course to publish' : 'Teacher application'}
                                </span>
                              </td>
                              <td className={clsx(td, 'text-ink2')}>{waiting(p.since)}</td>
                              <td className={clsx(td, 'text-right')}>
                                <Link href={p.kind === 'course' ? '/admin/courses/manage' : '/admin/teachers'} className={btnSm}>Open</Link>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="text-[13.5px] text-ink2">Nothing waiting. New teacher applications and courses ready to publish appear here.</p>}
                </section>

                <section className={card}>
                  <div className="flex items-center justify-between">
                    <h2 className={h2}>Sales by package</h2>
                    <Link href="/admin/packages" className={link}>Packages</Link>
                  </div>
                  {sales.length ? (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
                        <thead><tr><th className={th}>Package</th><th className={th}>Sold</th><th className={th}>Revenue</th><th className={clsx(th, 'w-[28%]')}>Share of sales</th></tr></thead>
                        <tbody>
                          {sales.map(s => {
                            const share = totalSold ? Math.round((s.count / totalSold) * 100) : 0;
                            const major = minorToMajor(s.revenue, s.currency);
                            return (
                              <tr key={s.packageId}>
                                <td className={clsx(td, 'font-semibold text-navy')}>{s.packageName}</td>
                                <td className={clsx(td, 'text-ink2')}>{s.count}</td>
                                <td className={clsx(td, 'text-ink2')}>{s.currency ?? ''} {major.toLocaleString()}</td>
                                <td className={td}>
                                  <div className="flex items-center gap-2.5">
                                    <div className="h-1.5 flex-1 overflow-hidden rounded-[3px] bg-subtle"><div className="h-1.5 bg-azure" style={{ width: `${share}%` }} /></div>
                                    <span className="min-w-[32px] text-[12.5px] text-ink2">{share}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="text-[13.5px] text-ink2">No packages sold yet.</p>}
                </section>
              </div>

              <div className="flex min-w-0 flex-col gap-5">
                <section className={card}>
                  <h2 className={h2}>Recent purchases</h2>
                  {data.recentPurchases.length ? (
                    <ul>
                      {data.recentPurchases.map((p, i) => (
                        <li key={i} className="flex items-center gap-2.5 border-t border-line py-2.5">
                          <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-md bg-subtle text-[11.5px] font-bold text-ink2">
                            {p.name.split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-semibold text-navy">{p.name}</p>
                            <p className="truncate text-[12.5px] text-muted">{p.item}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[13px] font-semibold text-ink2">{p.currency} {p.amount.toLocaleString()}</p>
                            <p className="text-[11.5px] text-muted">{p.method}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : <p className="text-[13.5px] text-ink2">No purchases yet.</p>}
                </section>

                <section className={card}>
                  <h2 className={h2}>Students by country</h2>
                  {data.countries.length ? data.countries.map(c => (
                    <div key={c.name} className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[13.5px]"><span className="font-semibold text-navy">{c.name}</span><span className="text-ink2">{c.students}</span></div>
                      <div className="h-1.5 overflow-hidden rounded-[3px] bg-subtle"><div className="h-1.5 bg-azure" style={{ width: `${c.pct}%` }} /></div>
                    </div>
                  )) : <p className="text-[13.5px] text-ink2">No students yet.</p>}
                </section>

                <section className={card}>
                  <h2 className={h2}>Today</h2>
                  <dl className="grid grid-cols-2 overflow-hidden rounded-md border border-line">
                    {[
                      ['Sign-ups', data.today.signups], ['Purchases', data.today.purchases],
                      ['Live classes', data.today.liveClasses], ['Open tickets', data.today.openTickets],
                    ].map(([l, v]) => (
                      <div key={String(l)} className="-mb-px -mr-px border-b border-r border-line px-3 py-2.5">
                        <dt className="text-[11.5px] text-muted">{l}</dt>
                        <dd className="mt-0.5 text-[15px] font-bold text-navy">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
