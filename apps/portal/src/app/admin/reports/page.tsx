'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState, useCallback } from 'react';
import { format, subDays } from 'date-fns';
import { DateRange, DayPicker } from 'react-day-picker';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from 'recharts';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

type Tab = 'courses' | 'teachers' | 'countries' | 'purchases' | 'rates';

const CHART_COLORS = ['#5889FA', '#405FAD', '#072061', '#8EB0FC', '#2D4FA0', '#A3BFFD', '#1A3580'];

const fmt = (v: number) =>
  v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(0)}`;

function csvDownload(filename: string, rows: Record<string, unknown>[]) {
  if (!rows.length) { notify.error('No data to export'); return; }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function DateRangePicker({
  range, onChange, onClear,
}: {
  range: DateRange | undefined;
  onChange: (r: DateRange | undefined) => void;
  onClear: () => void;
}) {
  const [open, setOpen] = useState(false);

  const label = range?.from
    ? range.to
      ? `${format(range.from, 'MMM d')} – ${format(range.to, 'MMM d, yyyy')}`
      : format(range.from, 'MMM d, yyyy')
    : 'All time';

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-xl border border-cloud bg-white px-3 py-2 text-xs font-semibold text-navy hover:border-azure/50 transition"
      >
        <Icon name="calendar" size={12} />
        {label}
        {range?.from && (
          <span
            onClick={e => { e.stopPropagation(); onChange(undefined); onClear(); }}
            className="ml-1 flex h-4 w-4 items-center justify-center rounded-full bg-cloud text-royal/50 hover:bg-azure/20 hover:text-azure text-[10px] font-bold"
          >
            ×
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 z-50 rounded-2xl border border-cloud bg-white shadow-xl shadow-navy/10 overflow-hidden">
            <DayPicker
              mode="range"
              selected={range}
              onSelect={r => { onChange(r); if (r?.from && r?.to) setOpen(false); }}
              numberOfMonths={2}
              defaultMonth={subDays(new Date(), 30)}
              classNames={{
                root: 'p-4',
                months: 'flex gap-6',
                month: 'space-y-2',
                month_caption: 'flex justify-center items-center relative h-7 px-8',
                caption_label: 'text-sm font-bold text-navy',
                nav: 'flex items-center gap-1',
                button_previous: 'absolute left-0 h-6 w-6 flex items-center justify-center rounded-lg border border-cloud text-royal/50 hover:bg-cloud transition text-xs cursor-pointer',
                button_next: 'absolute right-0 h-6 w-6 flex items-center justify-center rounded-lg border border-cloud text-royal/50 hover:bg-cloud transition text-xs cursor-pointer',
                month_grid: 'w-full border-collapse',
                weekdays: 'flex',
                weekday: 'w-8 text-[10px] font-semibold text-royal/40 uppercase text-center pb-1',
                week: 'flex w-full mt-1',
                day: 'w-8 h-8 relative text-center',
                day_button: 'w-8 h-8 flex items-center justify-center rounded-lg text-xs font-medium text-navy hover:bg-azure/10 hover:text-azure transition cursor-pointer',
                selected: 'bg-azure text-white [&>button]:bg-azure [&>button]:text-white [&>button]:hover:bg-azure',
                range_middle: 'bg-azure/15 [&>button]:text-azure [&>button]:rounded-none rounded-none',
                range_start: 'bg-azure [&>button]:text-white rounded-l-lg',
                range_end: 'bg-azure [&>button]:text-white rounded-r-lg',
                today: '[&>button]:font-bold [&>button]:border [&>button]:border-azure/30',
                outside: '[&>button]:text-royal/20',
                disabled: '[&>button]:opacity-30 [&>button]:cursor-not-allowed',
              }}
            />
            <div className="border-t border-cloud px-4 py-2.5 flex items-center justify-between">
              <div className="flex gap-2">
                {[7, 30, 90].map(d => (
                  <button key={d} onClick={() => { onChange({ from: subDays(new Date(), d), to: new Date() }); setOpen(false); }}
                    className="rounded-lg px-2.5 py-1 text-[10px] font-semibold text-royal/50 hover:bg-cloud hover:text-navy transition">
                    Last {d}d
                  </button>
                ))}
              </div>
              <button onClick={() => setOpen(false)}
                className="text-xs font-semibold text-azure hover:text-royal transition">
                Done
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default function AdminReportsPage() {
  const [tab, setTab] = useState<Tab>('courses');
  const [data, setData] = useState<Record<Tab, any>>({ courses: null, teachers: null, countries: null, purchases: null, rates: null });
  const [loading, setLoading] = useState<Record<Tab, boolean>>({ courses: true, teachers: true, countries: true, purchases: true, rates: true });
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [newRate, setNewRate] = useState({ currency: '', toUsdRate: '' });
  const [savingRate, setSavingRate] = useState(false);

  const buildQuery = useCallback(() => {
    const params = new URLSearchParams();
    if (dateRange?.from) params.set('startDate', format(dateRange.from, 'yyyy-MM-dd'));
    if (dateRange?.to) params.set('endDate', format(dateRange.to, 'yyyy-MM-dd'));
    return params.toString() ? `?${params.toString()}` : '';
  }, [dateRange]);

  const loadAll = useCallback(() => {
    const q = buildQuery();
    const endpoints: [Tab, string][] = [
      ['courses',   `/reports/admin/reports/courses${q}`],
      ['teachers',  `/reports/admin/reports/teachers${q}`],
      ['countries', `/reports/admin/reports/countries${q}`],
      ['purchases', `/reports/admin/reports/purchases${q}`],
      ['rates',     '/reports/admin/reports/exchange-rates'],
    ];
    setLoading({ courses: true, teachers: true, countries: true, purchases: true, rates: true });
    endpoints.forEach(([key, url]) => {
      api.get(url)
        .then(r => setData(d => ({ ...d, [key]: r.data })))
        .catch(() => {})
        .finally(() => setLoading(l => ({ ...l, [key]: false })));
    });
  }, [buildQuery]);

  useEffect(() => { loadAll(); }, [loadAll]);

  async function saveRate(e: React.FormEvent) {
    e.preventDefault(); setSavingRate(true);
    try {
      await api.post('/reports/admin/reports/exchange-rates', {
        currency: newRate.currency.toUpperCase(),
        toUsdRate: parseFloat(newRate.toUsdRate),
      });
      const r = await api.get('/reports/admin/reports/exchange-rates');
      setData(d => ({ ...d, rates: r.data }));
      setNewRate({ currency: '', toUsdRate: '' });
      notify.success('Rate saved');
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setSavingRate(false); }
  }

  const TABS: [Tab, string][] = [
    ['courses', 'Courses'], ['teachers', 'Teachers'],
    ['countries', 'Countries'], ['purchases', 'Purchases'], ['rates', 'Exchange Rates'],
  ];

  const dateLabel = dateRange?.from && dateRange?.to
    ? `${format(dateRange.from, 'MMM d')} – ${format(dateRange.to, 'MMM d, yyyy')}`
    : 'all time';

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Reports" subtitle="Revenue analytics and platform metrics" />
      <div className="flex-1 p-6 space-y-5">

        {/* Controls row */}
        <div className="flex items-center gap-3 flex-wrap">
          {/* Tab bar */}
          <div className="flex gap-1 rounded-xl border border-cloud bg-surface p-1 flex-wrap">
            {TABS.map(([t, label]) => (
              <button key={t} onClick={() => setTab(t)}
                className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${tab === t ? 'bg-white text-navy shadow-sm border border-cloud' : 'text-royal/50 hover:text-navy'}`}>
                {label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <DateRangePicker
              range={dateRange}
              onChange={r => setDateRange(r)}
              onClear={loadAll}
            />
            {tab !== 'rates' && tab !== 'purchases' && (
              <button
                onClick={() => {
                  const d = data[tab];
                  if (!d?.length) { notify.error('No data to export'); return; }
                  csvDownload(`cpa-${tab}-${format(new Date(), 'yyyy-MM-dd')}.csv`, d);
                  notify.success('CSV downloaded');
                }}
                className="flex items-center gap-1.5 rounded-xl border border-cloud bg-white px-3 py-2 text-xs font-semibold text-navy hover:border-azure/50 transition"
              >
                <Icon name="download" size={12} /> Export CSV
              </button>
            )}
          </div>
        </div>

        {/* Courses */}
        {tab === 'courses' && (
          loading.courses ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-azure border-t-transparent rounded-full animate-spin" /></div> : (
            <div className="space-y-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">
                COURSE REVENUE (USD) · {dateLabel}
              </p>
              {!data.courses?.length ? (
                <Card padding="md">
                  <p className="text-sm text-royal/50 text-center py-8">No course data yet</p>
                </Card>
              ) : (
                <Card padding="md">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.courses.slice(0, 10)} margin={{ top: 4, right: 8, left: 8, bottom: 40 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6ECFD" vertical={false} />
                      <XAxis dataKey="courseId" tick={{ fontSize: 10, fill: '#405FAD' }}
                        angle={-35} textAnchor="end" interval={0} />
                      <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: '#405FAD' }} />
                      <Tooltip formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Revenue (USD)']}
                        contentStyle={{ borderRadius: 12, border: '1px solid #E6ECFD', fontSize: 12 }} />
                      <Bar dataKey="revenueUsd" fill="#5889FA" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {!!data.courses?.length && (
                <Card padding="none">
                  <div className="px-4 py-2.5 border-b border-cloud flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">ALL COURSES</p>
                    <p className="text-[10px] text-royal/30">{data.courses.length} records</p>
                  </div>
                  <ul className="divide-y divide-cloud">
                    {data.courses.map((c: any, i: number) => (
                      <li key={c.courseId ?? i} className="flex items-center gap-4 px-4 py-3">
                        <span className="text-xs font-bold text-royal/30 w-5">{i + 1}</span>
                        <p className="flex-1 text-sm font-semibold text-navy truncate">{c.title ?? `Course ${c.courseId}`}</p>
                        <div className="text-right">
                          <p className="text-sm font-bold text-navy">${Number(c.revenueUsd ?? 0).toFixed(2)}</p>
                          {c.enrollments != null && <p className="text-[10px] text-royal/40">{c.enrollments} enrolled</p>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )
        )}

        {/* Teachers */}
        {tab === 'teachers' && (
          loading.teachers ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-azure border-t-transparent rounded-full animate-spin" /></div> : (
            <div className="space-y-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">
                TEACHER EARNINGS (USD) · {dateLabel}
              </p>
              {!data.teachers?.length ? (
                <Card padding="md">
                  <p className="text-sm text-royal/50 text-center py-8">No teacher data yet</p>
                </Card>
              ) : (
                <Card padding="md">
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.teachers.slice(0, 10)} margin={{ top: 4, right: 8, left: 8, bottom: 48 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E6ECFD" vertical={false} />
                      <XAxis dataKey="email" tick={{ fontSize: 9, fill: '#405FAD' }}
                        angle={-35} textAnchor="end" interval={0} />
                      <YAxis tickFormatter={fmt} tick={{ fontSize: 11, fill: '#405FAD' }} />
                      <Tooltip
                        formatter={(v, name) => [
                          `$${Number(v).toFixed(2)}`,
                          name === 'totalEarnedUsd' ? 'Earned' : 'Paid Out',
                        ]}
                        contentStyle={{ borderRadius: 12, border: '1px solid #E6ECFD', fontSize: 12 }} />
                      <Bar dataKey="totalEarnedUsd" fill="#5889FA" radius={[6, 6, 0, 0]} name="totalEarnedUsd" />
                      <Bar dataKey="totalPaidOutUsd" fill="#A3BFFD" radius={[6, 6, 0, 0]} name="totalPaidOutUsd" />
                    </BarChart>
                  </ResponsiveContainer>
                </Card>
              )}

              {!!data.teachers?.length && (
                <Card padding="none">
                  <div className="px-4 py-2.5 border-b border-cloud flex items-center justify-between">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">ALL TEACHERS</p>
                    <p className="text-[10px] text-royal/30">{data.teachers.length} teachers</p>
                  </div>
                  <ul className="divide-y divide-cloud">
                    {data.teachers.map((t: any, i: number) => (
                      <li key={t.email ?? i} className="flex items-center gap-4 px-4 py-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-azure text-xs font-bold text-white flex-shrink-0">
                          {t.email?.[0]?.toUpperCase() ?? 'T'}
                        </div>
                        <p className="flex-1 text-sm font-semibold text-navy truncate">{t.email}</p>
                        <div className="text-right">
                          <p className="text-sm font-bold text-navy">${Number(t.totalEarnedUsd ?? 0).toFixed(2)}</p>
                          <p className="text-[10px] text-royal/40">${Number(t.totalPaidOutUsd ?? 0).toFixed(2)} paid out</p>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </div>
          )
        )}

        {/* Countries */}
        {tab === 'countries' && (
          loading.countries ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-azure border-t-transparent rounded-full animate-spin" /></div> : (
            <div className="space-y-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">
                REVENUE BY COUNTRY (USD) · {dateLabel}
              </p>
              {!data.countries?.length ? (
                <Card padding="md">
                  <p className="text-sm text-royal/50 text-center py-8">No country data yet</p>
                </Card>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card padding="md">
                    <p className="text-xs font-semibold text-navy mb-4">Revenue share</p>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={data.countries} dataKey="revenueUsd" nameKey="name"
                          cx="50%" cy="50%" outerRadius={90} innerRadius={45}>
                          {data.countries.map((_: any, idx: number) => (
                            <Cell key={idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(v) => [`$${Number(v).toFixed(2)}`, 'Revenue']}
                          contentStyle={{ borderRadius: 12, border: '1px solid #E6ECFD', fontSize: 12 }} />
                        <Legend iconType="circle" iconSize={8}
                          formatter={(value) => <span style={{ fontSize: 11, color: '#405FAD' }}>{value}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  </Card>

                  <Card padding="none">
                    <div className="px-4 py-2.5 border-b border-cloud">
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">BREAKDOWN</p>
                    </div>
                    <ul className="divide-y divide-cloud">
                      {data.countries.map((c: any, i: number) => (
                        <li key={c.countryId ?? i} className="flex items-center gap-3 px-4 py-3">
                          <div className="h-3 w-3 rounded-full flex-shrink-0"
                            style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                          <p className="flex-1 text-sm font-semibold text-navy">{c.name ?? c.code ?? c.countryId}</p>
                          <div className="text-right">
                            <p className="text-sm font-bold text-navy">${Number(c.revenueUsd ?? 0).toFixed(2)}</p>
                            <p className="text-[10px] text-royal/40">{c.sharePercent ?? 0}%</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </Card>
                </div>
              )}
            </div>
          )
        )}

        {/* Purchases */}
        {tab === 'purchases' && (
          loading.purchases ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-azure border-t-transparent rounded-full animate-spin" /></div> : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">
                  PURCHASE HISTORY · {dateLabel}
                </p>
                <button
                  onClick={() => {
                    const d = data.purchases;
                    if (!d?.length) { notify.error('No data to export'); return; }
                    csvDownload(`cpa-purchases-${format(new Date(), 'yyyy-MM-dd')}.csv`, d);
                    notify.success('CSV downloaded');
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-cloud bg-white px-3 py-2 text-xs font-semibold text-navy hover:border-azure/50 transition">
                  <Icon name="download" size={12} /> Export CSV
                </button>
              </div>

              {!data.purchases?.length ? (
                <Card padding="md">
                  <p className="text-sm text-royal/50 text-center py-8">No purchase data for this period</p>
                </Card>
              ) : (
                <Card padding="none">
                  <div className="px-5 py-2.5 border-b border-cloud">
                    <div className="grid grid-cols-12 gap-2 text-[10px] font-semibold uppercase tracking-widest text-royal/40">
                      <span className="col-span-4">Student</span>
                      <span className="col-span-3">Package</span>
                      <span className="col-span-2">Amount</span>
                      <span className="col-span-2">Date</span>
                      <span className="col-span-1">Status</span>
                    </div>
                  </div>
                  <ul className="divide-y divide-cloud">
                    {data.purchases.map((p: any, i: number) => (
                      <li key={p.id ?? i} className="grid grid-cols-12 gap-2 items-center px-5 py-3">
                        <div className="col-span-4 min-w-0">
                          <p className="text-sm font-semibold text-navy truncate">{p.student?.email ?? p.studentEmail ?? '—'}</p>
                        </div>
                        <div className="col-span-3 min-w-0">
                          <p className="text-xs text-royal/60 truncate">{p.package?.name ?? p.packageName ?? '—'}</p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-sm font-semibold text-navy">
                            {p.currency ?? ''} {Number(p.amount ?? p.priceAmount ?? 0).toLocaleString()}
                          </p>
                        </div>
                        <div className="col-span-2">
                          <p className="text-[10px] text-royal/50">
                            {p.purchasedAt || p.createdAt
                              ? new Date(p.purchasedAt ?? p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                              : '—'}
                          </p>
                        </div>
                        <div className="col-span-1">
                          <span className={`text-[10px] font-semibold ${p.status === 'ACTIVE' ? 'text-green-500' : 'text-royal/40'}`}>
                            {p.status ?? 'OK'}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="px-5 py-2.5 border-t border-cloud">
                    <p className="text-[11px] text-royal/40">{data.purchases.length} records</p>
                  </div>
                </Card>
              )}
            </div>
          )
        )}

        {/* Exchange rates */}
        {tab === 'rates' && (
          loading.rates ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-2 border-azure border-t-transparent rounded-full animate-spin" /></div> : (
            <div className="space-y-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">EXCHANGE RATES (→ USD)</p>

              <Card padding="md">
                <p className="text-xs font-semibold text-navy mb-3">Set / update rate</p>
                <form onSubmit={saveRate} className="flex gap-3 items-end flex-wrap">
                  <div className="space-y-1 flex-1 min-w-[120px]">
                    <label className="text-[10px] font-semibold text-royal/50 uppercase">Currency</label>
                    <input value={newRate.currency} onChange={e => setNewRate(f => ({ ...f, currency: e.target.value }))}
                      placeholder="NGN" required
                      className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                  </div>
                  <div className="space-y-1 flex-1 min-w-[160px]">
                    <label className="text-[10px] font-semibold text-royal/50 uppercase">1 unit = ? USD</label>
                    <input type="number" step="any" value={newRate.toUsdRate}
                      onChange={e => setNewRate(f => ({ ...f, toUsdRate: e.target.value }))}
                      placeholder="0.00065" required
                      className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                  </div>
                  <Button type="submit" loading={savingRate} size="sm">Save</Button>
                </form>
              </Card>

              <Card padding="none">
                {!data.rates?.length ? (
                  <div className="flex flex-col items-center py-10">
                    <Icon name="dollar" size={24} className="text-royal/30 mb-2" />
                    <p className="text-sm text-royal/50">No exchange rates set yet</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-cloud">
                    {data.rates.map((r: any) => (
                      <li key={r.currency} className="flex items-center gap-4 px-4 py-3.5">
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cloud text-xs font-bold text-azure">
                          {r.currency.slice(0, 3)}
                        </div>
                        <p className="flex-1 text-sm font-semibold text-navy">{r.currency}</p>
                        <div className="text-right">
                          <p className="text-sm font-bold text-navy">1 {r.currency} = ${r.toUsdRate}</p>
                          <p className="text-[10px] text-royal/40">
                            Updated {new Date(r.updatedAt).toLocaleDateString()}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
          )
        )}
      </div>
    </div>
  );
}
