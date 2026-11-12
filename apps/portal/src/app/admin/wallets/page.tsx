'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { KIND_COLOURS, KpiTile, SplitBar, walletMoney } from '@/components/wallet/WalletCharts';
import { AddCreditDialog } from '@/components/admin/AddCreditDialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Status = 'ready' | 'missing' | 'low' | 'nothing';
interface Earner { walletId: string; userId: string; name: string; email: string; role: string; owed: number; currency: string; series: number[]; status: Status; lastPayout: { amount: number; currency: string; at: string | null } | null }
interface Overview {
  currency: string; minimum: number; owed: number; owedPeople: number;
  owedByRole: { role: string; label: string; amount: number }[]; otherCurrencies: { currency: string; amount: number }[];
  nextRun: string; run: { ready: number; missing: number; low: number };
  months: string[]; kpis: { earned: number[]; paid: number[]; sold: number[]; kept: (number | null)[] };
  earners: Earner[]; byKind: { name: string; amount: number }[];
  manualCredits: { amount: number; currency: string; reason: string | null; at: string; to: string; by: string | null }[];
}

const ROLE: Record<string, string> = { TEACHER: 'Teacher', SUBJECT_REVIEWER: 'Reviewer', COUNTRY_REP: 'Country rep' };
const FILTERS: [string, string][] = [['all', 'All'], ['TEACHER', 'Teachers'], ['SUBJECT_REVIEWER', 'Reviewers'], ['COUNTRY_REP', 'Reps']];
const STATUS: Record<Status, [string, string]> = {
  ready: ['Ready', 'bg-[#E6F5EE] text-[#1F6B47]'], missing: ['Missing details', 'bg-[#FDECEC] text-[#A23434]'],
  low: ['Below minimum', 'bg-[#FFF6E5] text-[#8A5A0B]'], nothing: ['Nothing owed', 'bg-subtle text-muted'],
};
const SOURCE: Record<string, string> = {
  COURSE_SALE: 'Course sale', COUNTRY_BONUS: 'Rep commission or bonus', REVIEW_COMMISSION: 'Review share', PAYOUT: 'Payout', ADJUSTMENT: 'Adjustment',
  MANUAL_CREDIT: 'Added by admin', MENTOR_SESSION: 'Mentorship session', LIVE_CLASS: 'Live class taught', COHORT_SHARE: 'Cohort share',
};
const fcfa = (c: string) => (c === 'XAF' || c === 'XOF' ? 'FCFA' : c);
const initials = (n: string) => n.replace(/^(Dr|Mr|Mrs|Ms|Prof)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const change = (s: number[]) => { const a = s[s.length - 1], b = s[s.length - 2]; return b ? Math.round(((a - b) / b) * 100) : null; };

function Trend({ series, label }: { series: number[]; label: string }) {
  const max = Math.max(...series), min = Math.min(...series), r = max - min || 1;
  const pts = series.map((v, i) => `${Math.round((i * 120) / Math.max(1, series.length - 1))},${Math.round(26 - ((v - min) / r) * 22)}`).join(' ');
  return <svg role="img" aria-label={label} viewBox="0 0 120 30" preserveAspectRatio="none" className="block h-[30px] w-[120px]"><polyline points={pts} fill="none" stroke="#3F6FE8" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></svg>;
}

export default function AdminWalletsPage() {
  const [d, setD] = useState<Overview | null>(null);
  const [filter, setFilter] = useState('all');
  const [q, setQ] = useState('');
  const [crediting, setCrediting] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<any>(null);

  const load = () => api.get('/wallets/admin/overview').then(r => setD(r.data)).catch(e => notify.error(e?.response?.data?.message ?? 'Could not load wallets'));
  useEffect(() => { load(); }, []);

  async function toggle(e: Earner) {
    if (open === e.walletId) { setOpen(null); setDetail(null); return; }
    setOpen(e.walletId); setDetail(null);
    try { setDetail((await api.get(`/wallets/admin/wallets/${e.walletId}`)).data); } catch { setDetail({ transactions: [] }); }
  }

  const c = d?.currency ?? 'XAF';
  const next = d ? new Date(d.nextRun) : null;
  const daysLeft = next ? Math.max(0, Math.ceil((+next - Date.now()) / 86_400_000)) : null;
  const owedSeries = d ? d.kpis.earned.map((_, i) => d.kpis.earned.slice(0, i + 1).reduce((a, b) => a + b, 0) - d.kpis.paid.slice(0, i + 1).reduce((a, b) => a + b, 0)) : [];
  const rows = (d?.earners ?? []).filter(e => (filter === 'all' || e.role === filter) && (!q.trim() || `${e.name} ${e.email}`.toLowerCase().includes(q.trim().toLowerCase())));
  const topOwed = Math.max(1, ...(d?.earners ?? []).map(e => e.owed));
  const kept = d?.kpis.kept ?? [];
  // Only meaningful when sales cover what was earned
  const keptNow = kept[kept.length - 1] != null && (kept[kept.length - 1] as number) >= 0 ? kept[kept.length - 1] : null;
  const keptChange = keptNow != null && kept[kept.length - 2] != null ? keptNow - (kept[kept.length - 2] as number) : null;

  function download() {
    if (!d) return;
    const text = [['Name', 'Email', 'Role', 'Owed', 'Currency', 'Status'], ...d.earners.map(e => [e.name, e.email, ROLE[e.role] ?? e.role, minorToMajor(e.owed, e.currency), e.currency, STATUS[e.status][0]])]
      .map(r => r.map(x => /[",\n]/.test(String(x)) ? `"${String(x).replace(/"/g, '""')}"` : x).join(',')).join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = 'wallets.csv'; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Wallets" subtitle="What every teacher, reviewer and rep is owed, and the next payout run" actions={<>
        <Button size="sm" variant="secondary" onClick={download} disabled={!d}>Download CSV</Button>
        <Button size="sm" onClick={() => setCrediting(true)}>Add credit</Button>
      </>} />
      <AddCreditDialog open={crediting} onClose={() => setCrediting(false)} onDone={() => { load(); setOpen(null); setDetail(null); }} />

      <div className="flex flex-col gap-[18px] p-4 lg:px-7 lg:py-6">
        <div className="flex flex-wrap gap-[18px]">
          <section className="keep-light relative flex min-w-0 flex-[999_1_520px] flex-col gap-3 overflow-hidden rounded-xl bg-[#3F6FE8] px-[26px] py-6 text-navy">
            {owedSeries.length > 1 && (() => {
              const s = owedSeries, max = Math.max(...s), min = Math.min(...s), r = max - min || 1;
              return <svg aria-hidden viewBox="0 0 600 160" preserveAspectRatio="none" className="absolute bottom-0 right-0 h-[120px] w-[70%] opacity-35"><path fill="#FFFFFF" d={`M0,160 ${s.map((v, i) => `L${Math.round((i * 600) / (s.length - 1))},${Math.round(150 - ((v - min) / r) * 110)}`).join(' ')} L600,160 Z`} /></svg>;
            })()}
            <p className="relative text-[12.5px] font-bold uppercase tracking-[0.08em]">Owed to earners</p>
            <p className="relative text-[clamp(36px,6vw,48px)] font-extrabold leading-none tracking-[-0.03em] tabular-nums">
              <span className="mr-1.5 align-[14px] text-[22px] font-bold">{fcfa(c)}</span><span className="text-[#FFFFFF]">{d ? minorToMajor(d.owed, c).toLocaleString('en-GB') : '—'}</span>
            </p>
            <p className="relative text-sm text-navy/85">
              {d ? `Across ${d.owedPeople} ${d.owedPeople === 1 ? 'person' : 'people'} · paid in the next run on ${next!.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : ' '}
              {d?.otherCurrencies.length ? ` · plus ${d.otherCurrencies.map(o => walletMoney(o.amount, o.currency)).join(', ')}` : ''}
            </p>
            <div className="relative flex flex-wrap gap-2">
              {d?.owedByRole.map(r => <span key={r.role} className="inline-flex h-[30px] items-center rounded-full bg-[#FFFFFF] px-3 text-[12.5px] font-semibold tabular-nums">{r.label} · {walletMoney(r.amount, c)}</span>)}
            </div>
          </section>

          <section className="flex min-w-0 flex-[1_1_320px] flex-col gap-3 rounded-xl border border-azure bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Next payout run</p>
            <div className="flex items-baseline gap-2">
              <p className="text-[34px] font-extrabold tracking-[-0.02em] text-navy">{next ? next.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</p>
              {daysLeft != null && <span className="text-[13.5px] text-ink2">in {daysLeft} day{daysLeft === 1 ? '' : 's'}</span>}
            </div>
            <ul className="flex flex-col gap-2 text-[13px]">
              <li className="flex justify-between"><span className="text-ink2">Ready to pay</span><strong className="text-navy">{d?.run.ready ?? '—'} {d?.run.ready === 1 ? 'person' : 'people'}</strong></li>
              <li className="flex justify-between"><span className="text-ink2">Missing payout details</span><strong className={d?.run.missing ? 'text-[#A23434]' : 'text-navy'}>{d?.run.missing ?? '—'} {d?.run.missing === 1 ? 'person' : 'people'}</strong></li>
              <li className="flex justify-between"><span className="text-ink2">Below the minimum{d?.minimum ? ` (${fcfa(c)} ${minorToMajor(d.minimum, c).toLocaleString('en-GB')})` : ''}</span><strong className="text-navy">{d?.run.low ?? '—'} {d?.run.low === 1 ? 'person' : 'people'}</strong></li>
            </ul>
            <Link href="/admin/payouts" className="inline-flex h-10 items-center justify-center rounded-md bg-azure-strong text-[13.5px] font-bold text-on-accent">Prepare statements</Link>
          </section>
        </div>

        <dl className="-mx-4 flex snap-x gap-3.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:pb-0 sm:[grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {d ? <>
            <KpiTile className="min-w-[200px] snap-start sm:min-w-0" label="Earned this month" value={walletMoney(d.kpis.earned[5], c)} change={change(d.kpis.earned)} changeIsPct sub={`by ${d.earners.filter(e => e.series[5] > 0).length} people`} series={d.kpis.earned} />
            <KpiTile className="min-w-[200px] snap-start sm:min-w-0" label="Paid out this month" value={walletMoney(d.kpis.paid[5], c)} change={change(d.kpis.paid)} changeIsPct sub="to payout accounts" series={d.kpis.paid} />
            <KpiTile className="min-w-[200px] snap-start sm:min-w-0" label="Sales this month" value={walletMoney(d.kpis.sold[5], c)} change={change(d.kpis.sold)} changeIsPct sub="courses and packages" series={d.kpis.sold} />
            <KpiTile className="min-w-[200px] snap-start sm:min-w-0" label="CareerPath kept" value={keptNow != null ? `${keptNow}%` : '—'} change={keptChange} changeIsPct={false} sub="of sales, after earnings" series={kept.map(k => (k != null && k >= 0 ? k : 0))} />
          </> : Array.from({ length: 4 }, (_, i) => <div key={i} className="h-[150px] min-w-[200px] animate-pulse rounded-[10px] border border-line bg-white sm:min-w-0" />)}
        </dl>

        <div className="flex flex-wrap items-start gap-[18px]">
          <section className="min-w-0 flex-[999_1_640px] rounded-xl border border-line bg-white">
            <div className="flex flex-wrap items-center gap-2.5 px-[18px] py-3.5">
              <h2 className="flex-1 text-base font-bold text-navy">Earners</h2>
              <span role="group" aria-label="Who" className="flex gap-0.5 rounded-lg border border-line p-[3px] text-[12.5px]">
                {FILTERS.map(([k, l]) => <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k} className={clsx('h-7 rounded-md px-2.5 text-navy', filter === k ? 'bg-accent-soft font-bold' : 'hover:bg-subtle')}>{l}</button>)}
              </span>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search people" aria-label="Search people" className="input-base h-[34px] w-full sm:w-[200px]" />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
                <thead><tr className="bg-subtle text-left text-[11.5px] uppercase tracking-[0.05em] text-muted">
                  <th className="px-[18px] py-2.5 font-semibold">Person</th><th className="whitespace-nowrap px-3 py-2.5 font-semibold">Owed now</th><th className="px-3 py-2.5 font-semibold">Last 6 months</th><th className="px-3 py-2.5 font-semibold">Last payout</th><th className="whitespace-nowrap px-[18px] py-2.5 text-right font-semibold">Payout details</th>
                </tr></thead>
                <tbody>
                  {!d ? <tr><td colSpan={5}><div className="m-4 h-32 animate-pulse rounded-md bg-subtle" /></td></tr>
                    : rows.length === 0 ? <tr><td colSpan={5} className="px-4 py-10 text-center text-[13px] text-ink2">{d.earners.length ? 'No one matches.' : 'No one has a wallet yet. Wallets open with a person’s first earning.'}</td></tr>
                    : rows.flatMap(e => [
                      <tr key={e.walletId} onClick={() => toggle(e)} className={clsx('cursor-pointer border-t border-line hover:bg-subtle', open === e.walletId && 'bg-subtle')}>
                        <td className="px-[18px] py-[11px]"><div className="flex items-center gap-2.5">
                          <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-extrabold text-azure-strong">{initials(e.name)}</span>
                          <div className="min-w-0" title={e.email}><p className="truncate font-semibold text-navy">{e.name}</p><p className="truncate text-xs text-muted">{ROLE[e.role] ?? e.role}</p></div>
                        </div></td>
                        <td className="w-[200px] px-3 py-[11px]"><p className="whitespace-nowrap font-bold text-navy tabular-nums">{walletMoney(e.owed, e.currency)}</p>
                          <span className="mt-[5px] block h-1.5 rounded-[3px] bg-subtle"><span className="block h-1.5 rounded-[3px] bg-[#3F6FE8]" style={{ width: `${Math.max(e.owed > 0 ? 2 : 0, Math.round((e.owed / topOwed) * 100))}%` }} /></span></td>
                        <td className="w-[140px] px-3 py-[11px]"><Trend series={e.series} label={`${e.name}: earnings over 6 months`} /></td>
                        <td className="whitespace-nowrap px-3 py-[11px] text-ink2 tabular-nums">{e.lastPayout ? `${walletMoney(e.lastPayout.amount, e.lastPayout.currency)}${e.lastPayout.at ? ` · ${new Date(e.lastPayout.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}` : '—'}</td>
                        <td className="px-[18px] py-[11px] text-right"><span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded-full px-[9px] text-xs font-bold', STATUS[e.status][1])}>{STATUS[e.status][0]}</span></td>
                      </tr>,
                      open === e.walletId && (
                        <tr key={`${e.walletId}-d`} className="bg-subtle"><td colSpan={5} className="px-[18px] pb-3">
                          {!detail ? <div className="h-16 animate-pulse rounded-md bg-white" /> : detail.transactions?.length ? (
                            <div className="max-h-72 overflow-y-auto rounded-md border border-line bg-white">
                              {detail.transactions.slice(0, 50).map((t: any) => (
                                <div key={t.id} className="flex items-center gap-3 border-b border-line px-3 py-2 text-[13px] last:border-b-0">
                                  <span className="w-[150px] flex-shrink-0 font-semibold text-navy">{SOURCE[t.source] ?? t.source}</span>
                                  <span className="min-w-0 flex-1 truncate text-ink2">{t.description ?? ''}</span>
                                  <span className="flex-shrink-0 text-xs text-muted">{new Date(t.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                  <strong className={clsx('w-[120px] flex-shrink-0 text-right tabular-nums', t.type === 'DEBIT' ? 'text-muted' : 'text-navy')}>{t.type === 'DEBIT' ? '−' : '+'} {walletMoney(t.amount, t.currency)}</strong>
                                </div>
                              ))}
                            </div>
                          ) : <p className="py-3 text-[13px] text-ink2">No transactions yet.</p>}
                        </td></tr>
                      ),
                    ])}
                </tbody>
              </table>
            </div>
          </section>

          <section className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-xl border border-line bg-white p-5">
            <div><h2 className="text-base font-bold text-navy">Earned this month, by kind</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">{d ? `${new Date().toLocaleDateString('en-GB', { month: 'long' })} so far · ${walletMoney(d.kpis.earned[5], c)}` : ' '}</p></div>
            {d ? <SplitBar compact currency={c} items={d.byKind.map((k, i) => ({ name: k.name, amount: k.amount, colour: KIND_COLOURS[i % KIND_COLOURS.length] }))} /> : <div className="h-32 animate-pulse rounded-md bg-subtle" />}
            <div className="mt-1 rounded-lg bg-subtle p-3">
              <p className="text-[13px] font-bold text-navy">Recent manual credits</p>
              {d?.manualCredits.length ? d.manualCredits.map((m, i) => (
                <p key={i} className="mt-1 text-[12.5px] text-ink2">{walletMoney(m.amount, m.currency)} to {m.to} · {m.reason}{m.by ? ` · by ${m.by}` : ''}, {new Date(m.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</p>
              )) : <p className="mt-1 text-[12.5px] text-ink2">None yet. Use Add credit for work the rules don’t cover.</p>}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
