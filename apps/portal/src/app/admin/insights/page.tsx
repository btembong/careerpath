'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { InsightsTabs } from '@/components/insights/InsightsTabs';
import { AfricaTiles, AFRICA, RAMP, shade } from '@/components/insights/AfricaTiles';
import { majorMoney } from '@/components/insights/CountryView';
import { KIND_COLOURS } from '@/components/wallet/WalletCharts';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Metric = 'students' | 'teachers' | 'signups' | 'sales';
interface Overview {
  days: number; base: string; total: number; newUsers: number; countries: number; paidPct: number;
  roles: { role: string; label: string; count: number }[];
  active: { today: number; week: number; month: number; todaySeries: number[]; weekSeries: number[]; monthSeries: number[] };
  kpis: { newStudents: number; newStudentsChange: number | null; newTeachers: number; pending: number; oldestPendingDays: number | null; paying: number; lessons: number; lessonsChange: number | null; classesHeld: number; attendancePct: number | null; mentorHeld: number; mentorMissed: number };
  map: { code: string; name: string; id: string; students: number; teachers: number; signups: number; sales: number }[];
  unknown: { students: number; teachers: number };
  signups: { label: string; students: number; teachers: number }[]; signupsBy: 'day' | 'month';
  funnel: { label: string; n: number }[];
  teachers: { label: string; n: number }[];
  sources: { key: string; label: string; n: number }[];
  learning: { lessons: number; quizzes: number; hours: number; certificates: number };
  devices: { phone: number; tablet: number; computer: number };
}

const ROLE_COLOUR: Record<string, string> = { STUDENT: '#FFFFFF', TEACHER: '#072061', SUBJECT_REVIEWER: '#0B1F55', COUNTRY_REP: '#1baf7a', ORG_ADMIN: '#eda100', ADMIN: '#9AA6C2' };
const n = (v: number) => v.toLocaleString('en-GB');

function Spark({ series, className }: { series: number[]; className?: string }) {
  const max = Math.max(...series, 1), min = Math.min(...series, 0), r = max - min || 1;
  const pts = series.map((v, i) => `${Math.round((i * 100) / Math.max(1, series.length - 1))},${Math.round(28 - ((v - min) / r) * 24)}`).join(' ');
  return <svg aria-hidden viewBox="0 0 100 30" preserveAspectRatio="none" className={className ?? 'h-[30px] w-[110px]'}><polyline points={pts} fill="none" stroke="#3F6FE8" strokeWidth={2} vectorEffect="non-scaling-stroke" /></svg>;
}
function Change({ v, pct }: { v: number | null; pct?: boolean }) {
  if (v == null || v === 0) return <span className="text-[11.5px] text-muted">—</span>;
  return <span className={clsx('inline-flex h-[22px] items-center rounded-md px-[7px] text-[11.5px] font-bold', v > 0 ? 'bg-[#E6F5EE] text-[#1F6B47]' : 'bg-[#FDECEC] text-[#A23434]')}>{v > 0 ? '+' : '−'}{Math.abs(v)}{pct ? '%' : ''}</span>;
}

export default function InsightsPage() {
  const [days, setDays] = useState('30');
  const [d, setD] = useState<Overview | null>(null);
  const [metric, setMetric] = useState<Metric>('students');
  const [sel, setSel] = useState<string | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => { setD(null); api.get('/reports/admin/insights', { params: { days } }).then(r => setD(r.data)).catch(() => notify.error('Could not load insights')); }, [days]);

  const byCode = useMemo(() => new Map((d?.map ?? []).map(c => [c.code, c])), [d]);
  const val = (code: string) => byCode.get(code)?.[metric] ?? 0;
  const fmt = (v: number) => (metric === 'sales' ? (v ? majorMoney(v, d?.base ?? 'XAF') : '—') : n(v));
  const metricName = { students: 'students', teachers: 'teachers', signups: 'new sign-ups', sales: 'sales' }[metric];
  const inAfrica = new Set(AFRICA.map(a => a[0]));
  const abroad = (d?.map ?? []).filter(c => !inAfrica.has(c.code) && (c.students || c.teachers || c.signups || c.sales));
  const allMax = Math.max(1, ...(d?.map ?? []).map(c => c[metric]));
  const ranked = [...(d?.map ?? [])].filter(c => c[metric] > 0).sort((a, b) => b[metric] - a[metric]).slice(0, 6);
  const picked = (sel && byCode.get(sel)) || ranked[0] || null;
  const pickedName = sel && !byCode.get(sel) ? AFRICA.find(a => a[0] === sel)?.[1] ?? sel : picked?.name;
  const period = days === '7' ? 'last 7 days' : days === '365' ? 'last 12 months' : 'last 30 days';
  const rolesShown = (d?.roles ?? []).filter(r => r.count > 0);
  const funnelTop = Math.max(1, d?.funnel[0]?.n ?? 1);
  const teacherTop = Math.max(1, d?.teachers[0]?.n ?? 1);
  const sourceTotal = Math.max(1, (d?.sources ?? []).reduce((s, x) => s + x.n, 0));
  const devTotal = d ? d.devices.phone + d.devices.tablet + d.devices.computer : 0;
  const sMax = Math.max(4, ...(d?.signups ?? []).map(s => s.students));
  const pts = (k: 'students' | 'teachers') => (d?.signups ?? []).map((s, i, a) => `${Math.round((i * 600) / Math.max(1, a.length - 1))},${Math.round(196 - (s[k] / sMax) * 186)}`).join(' ');
  const hv = hover ?? (d ? d.signups.length - 1 : 0);
  const funnelDrop = d ? d.funnel.slice(1).map((f, i) => ({ from: d.funnel[i], to: f, lost: d.funnel[i].n - f.n })).sort((a, b) => b.lost - a.lost)[0] : null;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Insights" subtitle="How CareerPath is doing: people, sign-ups, learning and money"
        actions={<select aria-label="Period" value={days} onChange={e => setDays(e.target.value)} className="h-9 rounded-md border border-line bg-white px-2.5 text-[13px] font-semibold text-navy">
          <option value="7">Last 7 days</option><option value="30">Last 30 days</option><option value="365">Last 12 months</option></select>} />
      <InsightsTabs />
      {!d ? (
        <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-6">{[220, 110, 480, 300].map((h, i) => <div key={i} className="animate-pulse rounded-xl border border-line bg-white" style={{ height: h }} />)}</div>
      ) : (
        <div className="flex flex-col gap-[18px] p-4 lg:px-7 lg:py-6">
          <div className="flex flex-wrap gap-[18px]">
            <section className="keep-light flex min-w-0 flex-[999_1_460px] flex-col gap-2.5 rounded-xl bg-[#3F6FE8] p-5 text-navy sm:px-[26px] sm:py-6">
              <p className="text-[12.5px] font-bold uppercase tracking-[0.08em]">People on CareerPath</p>
              <p className="text-[40px] font-extrabold leading-none tracking-[-0.03em] sm:text-[52px]"><span className="text-[#FFFFFF]">{n(d.total)}</span> users</p>
              <p className="text-sm text-[#0B1F55]">+{n(d.newUsers)} in the {period} · in {d.countries} {d.countries === 1 ? 'country' : 'countries'} · {d.paidPct}% of students have paid at least once</p>
              <div className="mt-1.5 flex h-3.5 gap-[2px]">{rolesShown.map(r => <span key={r.role} className="block h-3.5 rounded-[3px]" style={{ background: ROLE_COLOUR[r.role], flex: `${Math.max(r.count, d.total / 60)} 1 0` }} />)}</div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-[13px]">{rolesShown.map(r => <li key={r.role} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: ROLE_COLOUR[r.role] }} />{r.label} <strong className="text-[#FFFFFF]">{n(r.count)}</strong></li>)}</ul>
            </section>
            <section className="flex min-w-0 flex-[1_1_340px] flex-col gap-1 rounded-xl border border-line bg-white p-5">
              <p className="mb-1 text-xs font-semibold uppercase tracking-[0.06em] text-muted">Active people</p>
              {([['Today', d.active.today, d.active.todaySeries, 'last 14 days'], ['This week', d.active.week, d.active.weekSeries, 'last 8 weeks'], ['This month', d.active.month, d.active.monthSeries, 'last 6 months']] as [string, number, number[], string][]).map(([l, v, s, span]) => (
                <div key={l} className="flex items-center gap-3 border-t border-line py-2">
                  <div className="flex-1"><p className="text-[13px] text-ink2">{l}</p><p className="mt-0.5 text-[22px] font-extrabold text-navy">{n(v)} <span className="text-[12.5px] font-semibold text-muted">{d.total ? Math.round((v / d.total) * 100) : 0}% of users</span></p></div>
                  <div className="text-right"><Spark series={s} /><span className="text-[10.5px] text-muted">{span}</span></div>
                </div>
              ))}
            </section>
          </div>

          <dl className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-6">
            {([
              ['New students', n(d.kpis.newStudents), <Change key="a" v={d.kpis.newStudentsChange} pct />, period],
              ['New teachers', n(d.kpis.newTeachers), null, d.kpis.pending ? `${d.kpis.pending} waiting for approval` : 'none waiting'],
              ['Paying students', n(d.kpis.paying), null, `${d.paidPct}% of students`],
              ['Lessons finished', n(d.kpis.lessons), <Change key="b" v={d.kpis.lessonsChange} pct />, period],
              ['Live classes held', n(d.kpis.classesHeld), null, d.kpis.attendancePct != null ? `${d.kpis.attendancePct}% attendance` : 'no classes yet'],
              ['Mentor sessions', n(d.kpis.mentorHeld), null, d.kpis.mentorMissed ? `${d.kpis.mentorMissed} missed by mentors` : 'held'],
            ] as [string, string, React.ReactNode, string][]).map(([l, v, c, sub]) => (
              <div key={l} className="flex flex-col gap-1 rounded-[10px] border border-line bg-white px-3.5 pb-2.5 pt-3.5">
                <dt className="flex items-center justify-between gap-1.5 text-[12.5px] font-semibold text-ink2">{l}{c}</dt>
                <dd className="text-[22px] font-extrabold text-navy tabular-nums">{v}</dd>
                <dd className="text-[11.5px] text-muted">{sub}</dd>
              </div>
            ))}
          </dl>

          <section className="flex flex-col gap-3.5 rounded-xl border border-line bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div><h2 className="text-lg font-extrabold text-navy">Where our people are</h2><p className="mt-0.5 text-[12.5px] text-muted">Each square is a country, placed roughly where it is · tap one</p></div>
              <div role="tablist" aria-label="Show on the map" className="flex gap-0.5 overflow-x-auto rounded-lg border border-line p-[3px]">
                {([['students', 'Students'], ['teachers', 'Teachers'], ['signups', 'New sign-ups'], ['sales', 'Sales']] as [Metric, string][]).map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={metric === k} onClick={() => setMetric(k)} className={clsx('h-7 flex-shrink-0 rounded-md px-2.5 text-[12.5px] text-navy', metric === k ? 'bg-accent-soft font-bold' : 'font-medium')}>{l}</button>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap items-start gap-6">
              <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-3">
                <AfricaTiles value={val} label={code => `${fmt(val(code))} ${metricName}`} selected={sel ?? picked?.code ?? null} onSelect={setSel} />
                <div className="flex flex-wrap items-center justify-between gap-3.5">
                  <div className="flex items-center gap-2 text-xs text-muted">
                    <span>None</span><span className="h-3 w-[18px] rounded-sm border border-[#D3DBEA] bg-subtle" />
                    {RAMP.map(c => <span key={c} className="h-3 w-[18px] rounded-sm" style={{ background: c }} />)}<span>{fmt(allMax)}</span>
                  </div>
                  {abroad.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]"><span className="font-bold text-navy">Outside Africa</span>
                      {abroad.map(c => { const s = shade(c[metric], allMax); return <button key={c.code} type="button" onClick={() => setSel(c.code)} className={clsx('h-7 rounded-md px-2 text-xs font-bold', sel === c.code && 'ring-2 ring-navy')} style={{ background: s ?? '#F4F6FB', color: s && RAMP.indexOf(s) >= 3 ? '#FFFFFF' : '#072061' }}>{c.code} · {fmt(c[metric])}</button>; })}
                    </div>
                  )}
                </div>
                {(d.unknown.students > 0 || d.unknown.teachers > 0) && <p className="text-xs text-muted">Not counted on the map: {n(d.unknown.students)} students and {n(d.unknown.teachers)} teachers who haven’t set their country.</p>}
              </div>
              <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-3">
                <div className="flex flex-col gap-2 rounded-[10px] border-2 border-[#3F6FE8] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{sel ?? picked?.code ?? ''}</p>
                  <p className="text-xl font-extrabold text-navy">{pickedName ?? 'Pick a country'}</p>
                  {sel && !byCode.get(sel) ? <p className="text-[13px] text-ink2">No one from here yet, and it isn’t set up as a country we sell in.</p> : picked && <>
                    <dl className="grid grid-cols-2 gap-2">
                      {[['Students', n(picked.students)], ['Teachers', n(picked.teachers)], [`New, ${period}`, n(picked.signups)], ['Sales', picked.sales ? majorMoney(picked.sales, d.base) : '—']].map(([l, v]) => (
                        <div key={l} className="rounded-lg bg-subtle px-2.5 py-2"><dt className="text-[11.5px] text-muted">{l}</dt><dd className="mt-0.5 text-[17px] font-extrabold text-navy">{v}</dd></div>
                      ))}
                    </dl>
                    <Link href={`/admin/insights/countries?c=${picked.id}`} className="text-[13px] font-bold text-azure-strong hover:underline">Open {picked.name} in Countries</Link>
                  </>}
                </div>
                <div>
                  <p className="mb-1.5 text-[13px] font-bold text-navy">Top countries · {metricName}</p>
                  {!ranked.length && <p className="text-[13px] text-ink2">Nothing yet.</p>}
                  {ranked.map(r => (
                    <button key={r.code} type="button" onClick={() => setSel(r.code)} className="mb-1.5 flex w-full items-center gap-2 text-left text-[12.5px] text-navy">
                      <span className="w-[104px] truncate">{r.name}</span>
                      <span className="h-2.5 flex-1 overflow-hidden rounded-[3px] bg-accent-soft"><span className="block h-2.5 rounded-[3px] bg-[#3F6FE8]" style={{ width: `${Math.round((r[metric] / ranked[0][metric]) * 100)}%` }} /></span>
                      <strong className="w-16 text-right">{fmt(r[metric])}</strong>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>

          <div className="flex flex-wrap items-start gap-[18px]">
            <section className="flex min-w-0 flex-[999_1_560px] flex-col gap-2.5 rounded-xl border border-line bg-white p-4 sm:p-5">
              <div className="flex flex-wrap justify-between gap-2">
                <div><h2 className="text-base font-bold text-navy">Sign-ups by {d.signupsBy}</h2><p className="mt-0.5 text-[12.5px] text-muted">{period} · hover to see a {d.signupsBy}</p></div>
                <ul className="flex gap-3.5 text-[12.5px] text-ink2"><li className="flex items-center gap-1.5"><span className="h-[3px] w-3.5 rounded bg-[#2a78d6]" />Students</li><li className="flex items-center gap-1.5"><span className="h-[3px] w-3.5 rounded bg-[#eb6834]" />Teachers</li></ul>
              </div>
              <div className="relative" onMouseLeave={() => setHover(null)}>
                <svg role="img" aria-label={`Student and teacher sign-ups by ${d.signupsBy}`} viewBox="0 0 600 200" preserveAspectRatio="none" className="block h-[200px] w-full">
                  {[50, 100, 150].map(y => <line key={y} x1="0" y1={y} x2="600" y2={y} stroke="#EEF1F7" />)}
                  <line x1="0" y1="199" x2="600" y2="199" stroke="#E4E9F3" />
                  <path d={`M0,200 L${pts('students').split(' ').join(' L')} L600,200 Z`} fill="#2a78d6" fillOpacity={0.08} />
                  <polyline points={pts('students')} fill="none" stroke="#2a78d6" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  <polyline points={pts('teachers')} fill="none" stroke="#eb6834" strokeWidth={2} vectorEffect="non-scaling-stroke" />
                  <line x1={Math.round((hv * 600) / Math.max(1, d.signups.length - 1))} y1="0" x2={Math.round((hv * 600) / Math.max(1, d.signups.length - 1))} y2="200" stroke="#072061" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                </svg>
                <div className="absolute inset-0 flex">{d.signups.map((_, i) => <span key={i} className="flex-1" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />)}</div>
                <div className={clsx('pointer-events-none absolute top-1.5 rounded-lg border border-line bg-white px-3 py-2 shadow-[0_8px_24px_rgba(7,32,97,0.12)]', hv > d.signups.length / 2 ? 'left-2' : 'right-2')}>
                  <p className="mb-1 text-[12.5px] font-bold text-navy">{d.signups[hv]?.label}</p>
                  <p className="text-xs text-ink2">Students <strong className="text-navy">{d.signups[hv]?.students}</strong></p>
                  <p className="text-xs text-ink2">Teachers <strong className="text-navy">{d.signups[hv]?.teachers}</strong></p>
                </div>
              </div>
              <div className="flex justify-between text-[11.5px] text-muted"><span>{d.signups[0]?.label}</span><span>{d.signups[Math.floor(d.signups.length / 2)]?.label}</span><span>{d.signups[d.signups.length - 1]?.label}</span></div>
            </section>

            <section className="flex min-w-0 flex-[1_1_340px] flex-col gap-2.5 rounded-xl border border-line bg-white p-4 sm:p-5">
              <h2 className="text-base font-bold text-navy">The student journey</h2>
              <p className="-mt-1 text-[12.5px] text-muted">Of everyone who signed up in the {period}</p>
              {d.funnel.map(f => (
                <div key={f.label} className="flex flex-col gap-1">
                  <div className="flex justify-between text-[13px] text-navy"><span>{f.label}</span><span><strong>{n(f.n)}</strong> <span className="text-muted">{Math.round((f.n / funnelTop) * 100)}%</span></span></div>
                  <span className="block h-3 rounded-[3px] bg-accent-soft"><span className="block h-3 rounded-[3px] bg-[#3F6FE8]" style={{ width: `${Math.round((f.n / funnelTop) * 100)}%` }} /></span>
                </div>
              ))}
              {funnelDrop && funnelDrop.lost > 0 && <p className="mt-1 rounded-lg bg-[#FFF6E5] px-3 py-2.5 text-[12.5px] text-[#8A5A0B]">The biggest drop is between “{funnelDrop.from.label.toLowerCase()}” and “{funnelDrop.to.label.toLowerCase()}”: {n(funnelDrop.lost)} people.</p>}
            </section>
          </div>

          <div className="flex flex-wrap items-start gap-[18px]">
            <section className="flex min-w-0 flex-[1_1_340px] flex-col gap-2.5 rounded-xl border border-line bg-white p-4 sm:p-5">
              <h2 className="text-base font-bold text-navy">Teachers</h2>
              {d.teachers.map(t => (
                <div key={t.label} className="flex items-center gap-2.5 text-[13px] text-navy">
                  <span className="w-[120px]">{t.label}</span>
                  <span className="h-3 flex-1 rounded-[3px] bg-[#FFF0E8]"><span className="block h-3 rounded-[3px] bg-[#eb6834]" style={{ width: `${Math.round((t.n / teacherTop) * 100)}%` }} /></span>
                  <strong className="w-9 text-right">{n(t.n)}</strong>
                </div>
              ))}
              <p className="mt-0.5 text-[12.5px] text-muted">{d.kpis.pending ? <>{d.kpis.pending} application{d.kpis.pending === 1 ? ' is' : 's are'} waiting for a decision{d.kpis.oldestPendingDays != null ? ` · oldest ${d.kpis.oldestPendingDays} day${d.kpis.oldestPendingDays === 1 ? '' : 's'}` : ''} · <Link href="/admin/teachers" className="font-semibold text-azure-strong hover:underline">Review</Link></> : 'No applications waiting.'}</p>
            </section>
            <section className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 rounded-xl border border-line bg-white p-4 sm:p-5">
              <h2 className="text-base font-bold text-navy">How students found us</h2>
              <p className="-mt-1 text-[12.5px] text-muted">New students, {period}</p>
              <div className="flex h-3.5 gap-[2px]">{d.sources.filter(s => s.n).map((s, i) => <span key={s.key} className="block h-3.5 rounded-[3px]" style={{ background: KIND_COLOURS[i], flex: `${s.n} 1 0` }} />)}</div>
              {d.sources.map((s, i) => (
                <div key={s.key} className="flex items-center gap-2.5 border-t border-line py-1.5 text-[13px] text-navy">
                  <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: KIND_COLOURS[i] }} /><span className="flex-1">{s.label}</span><strong>{n(s.n)}</strong><span className="w-9 text-right text-xs text-muted">{Math.round((s.n / sourceTotal) * 100)}%</span>
                </div>
              ))}
            </section>
            <section className="flex min-w-0 flex-[1_1_260px] flex-col gap-2.5 rounded-xl border border-line bg-white p-4 sm:p-5">
              <h2 className="text-base font-bold text-navy">Learning</h2>
              <p className="-mt-1 text-[12.5px] text-muted">{period}</p>
              {[['Lessons finished', n(d.learning.lessons)], ['Quizzes taken', n(d.learning.quizzes)], ['Hours watched', n(d.learning.hours)], ['Certificates earned', n(d.learning.certificates)]].map(([l, v]) => (
                <div key={l} className="flex justify-between border-t border-line py-1.5 text-[13px]"><span className="text-ink2">{l}</span><strong className="text-navy">{v}</strong></div>
              ))}
              <div>
                <p className="mb-1 mt-1.5 text-[12.5px] text-muted">Used from, last 30 days</p>
                {devTotal ? <>
                  <div className="flex h-3 gap-[2px]">{(['phone', 'tablet', 'computer'] as const).filter(k => d.devices[k]).map((k, i) => <span key={k} className="block h-3 rounded-[3px]" style={{ background: ['#2a78d6', '#1baf7a', '#9AA6C2'][i], flex: `${d.devices[k]} 1 0` }} />)}</div>
                  <p className="mt-1 flex flex-wrap justify-between gap-2 text-xs text-ink2">{(['phone', 'tablet', 'computer'] as const).map(k => <span key={k}>{k === 'phone' ? 'Phones' : k === 'tablet' ? 'Tablets' : 'Computers'} {Math.round((d.devices[k] / devTotal) * 100)}%</span>)}</p>
                </> : <p className="text-xs text-ink2">Counting from today.</p>}
              </div>
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
