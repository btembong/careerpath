'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import { KIND_COLOURS, KpiTile, MonthStack, SplitBar, walletMoney } from '@/components/wallet/WalletCharts';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Range = 'month' | 'last' | 'year';
interface Tx { id: string; at: string; type: 'CREDIT' | 'DEBIT'; amount: number; currency: string; title: string; detail: string; kind: string }
interface PayoutRow { id: string; periodStart: string; periodEnd: string; amount: number; currency: string; status: string; paidAt: string | null; reference: string | null; paidTo: string | null }
interface Kpi { label: string; value: number; money: boolean; unit: string | null; sub: string | null; series: number[]; change: number | null; changeIsPct: boolean }
interface Data {
  currency: string; range: string; owed: number; nextPayout: string; minimum: number;
  account: { label: string; verified: boolean } | null;
  stats: { earned: number; earnedBefore: number; changePct: number | null; count: number; paidAllTime: number; share: { label: string; value: string } | null };
  kinds: { key: string; name: string }[]; byKindMonth: Record<string, number>[];
  split: { key: string; name: string; how: string; amount: number }[];
  kpis: Kpi[];
  months: { month: string; amount: number }[];
  activity: Tx[]; payouts: PayoutRow[];
}

const RANGES: [Range, string][] = [['month', 'This month'], ['last', 'Last month'], ['year', 'Last 6 months']];
const day = (iso: string) => {
  const d = new Date(iso), today = new Date();
  const diff = Math.floor((+new Date(today.toDateString()) - +new Date(d.toDateString())) / 86_400_000);
  return diff === 0 ? 'today' : diff === 1 ? 'yesterday' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const longDay = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const fcfa = (c: string) => (c === 'XAF' || c === 'XOF' ? 'FCFA' : c);
const amountOnly = (amount: number, c: string) => minorToMajor(amount, c).toLocaleString('en-GB', { maximumFractionDigits: 0 });

function csv(name: string, rows: (string | number)[][]) {
  const text = rows.map(r => r.map(c => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name; a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * The wallet for teachers, reviewers and country reps: what's owed and when it's paid, the period's
 * numbers with their six-month trends, earnings by kind each month, where the money came from,
 * the activity and the payout history.
 */
export function Earnings({ subtitle, accountHref }: { subtitle: string; accountHref: string }) {
  const [range, setRange] = useState<Range>('month');
  const [d, setD] = useState<Data | null>(null);
  // Phones show the activity as its own screen, like the app
  const [phoneView, setPhoneView] = useState<'main' | 'activity'>('main');
  const [kindFilter, setKindFilter] = useState('all');

  useEffect(() => {
    api.get('/wallets/me/earnings', { params: { range } }).then(r => setD(r.data)).catch(e => notify.error(e?.response?.data?.message ?? 'Could not load your wallet'));
  }, [range]);

  const c = d?.currency ?? 'XAF';
  const next = d ? new Date(d.nextPayout) : null;
  const now = new Date();
  const daysLeft = next ? Math.max(0, Math.ceil((+next - +now) / 86_400_000)) : null;
  const monthDays = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const below = !!d && d.minimum > 0 && d.owed > 0 && d.owed < d.minimum;
  const lastPaid = d?.payouts.find(p => p.status === 'PAID');
  const colourOf = (kind: string) => { const i = d?.kinds.findIndex(k => k.key === kind) ?? -1; return i >= 0 ? KIND_COLOURS[i] : '#637090'; };

  function download() {
    if (!d) return;
    csv(`wallet-${range}.csv`, [['Date', 'What', 'Detail', 'Amount', 'Currency'], ...d.activity.map(t => [t.at.slice(0, 10), t.title, t.detail, (t.type === 'DEBIT' ? -1 : 1) * minorToMajor(t.amount, t.currency), t.currency])]);
  }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Wallet" subtitle={subtitle} actions={
        <span role="group" aria-label="Period" className="hidden gap-0.5 rounded-lg border border-line bg-white p-[3px] text-[12.5px] sm:flex">
          {RANGES.map(([k, l]) => (
            <button key={k} onClick={() => setRange(k)} aria-pressed={range === k}
              className={clsx('h-7 rounded-md px-2.5 text-navy', range === k ? 'bg-accent-soft font-bold' : 'hover:bg-subtle')}>{l}</button>
          ))}
        </span>
      } />

      <div className={clsx("flex flex-col gap-3 p-3.5 sm:gap-[18px] sm:p-4 lg:px-7 lg:py-6", phoneView === "activity" && "hidden sm:flex")}>
        {/* Phones: the title and the period as one chip */}
        <div className="flex items-center justify-between gap-3 sm:hidden">
          <p className="text-[13px] font-semibold text-ink2">Your earnings</p>
          <select value={range} onChange={e => setRange(e.target.value as Range)} aria-label="Period" className="h-[30px] rounded-full border border-line bg-white px-3 text-[12.5px] font-semibold text-navy">
            {RANGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </div>
        {/* What's owed, and the next payout */}
        <div className="flex flex-wrap gap-[18px]">
          <section className="keep-light relative flex min-w-0 flex-[999_1_520px] flex-col gap-2 overflow-hidden rounded-2xl bg-[#3F6FE8] p-[18px] text-navy sm:gap-3.5 sm:rounded-xl sm:px-[26px] sm:py-6">
            {d && d.months.length > 1 && (() => {
              const s = d.months.map(m => m.amount), max = Math.max(...s), min = Math.min(...s), r = max - min || 1;
              return <svg aria-hidden viewBox="0 0 600 160" preserveAspectRatio="none" className="absolute bottom-0 right-0 h-[120px] w-[70%] opacity-35"><path fill="#FFFFFF" d={`M0,160 ${s.map((v, i) => `L${Math.round((i * 600) / (s.length - 1))},${Math.round(150 - ((v - min) / r) * 110)}`).join(' ')} L600,160 Z`} /></svg>;
            })()}
            <div className="relative flex items-start justify-between gap-3">
              <p className="text-[11.5px] font-bold uppercase tracking-[0.08em] sm:text-[12.5px]">Owed to you</p>
              {d && (d.account
                ? <span className="hidden h-[26px] items-center gap-1.5 rounded-full sm:inline-flex bg-[#FFFFFF] px-2.5 text-[12.5px] font-bold"><span className={clsx('h-[7px] w-[7px] rounded-full', d.account.verified ? 'bg-[#1F8A5B]' : 'bg-[#D99A2B]')} />{d.account.verified ? 'Payout account verified' : 'Payout account being checked'}</span>
                : <Link href={accountHref} className="inline-flex h-[26px] items-center rounded-full bg-[#FFFFFF] px-2.5 text-[12.5px] font-bold">Add a payout account</Link>)}
            </div>
            <p className="relative text-[36px] font-extrabold leading-none tracking-[-0.03em] tabular-nums sm:text-[clamp(36px,6vw,48px)]">
              <span className="mr-1 align-[10px] text-base font-bold sm:mr-1.5 sm:align-[14px] sm:text-[22px]">{fcfa(c)}</span><span className="text-[#FFFFFF]">{d ? amountOnly(d.owed, c) : '—'}</span>
            </p>
            <p className="relative text-[13px] text-navy/85 sm:hidden">
              {!d ? ' ' : below ? `Below the ${fcfa(c)} ${amountOnly(d.minimum, c)} minimum · rolls over` : d.owed > 0 ? `Paid ${next!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}${d.account ? ` to ${d.account.label}` : ''} · in ${daysLeft} day${daysLeft === 1 ? '' : 's'}` : 'Nothing owed right now'}
            </p>
            {d?.kpis[0]?.change != null && range !== 'year' && <span className="relative inline-flex h-[26px] items-center self-start rounded-full bg-[#FFFFFF] px-2.5 text-xs font-bold sm:hidden">{d.kpis[0].change >= 0 ? '+' : '−'}{Math.abs(d.kpis[0].change)}% on {new Date(now.getFullYear(), now.getMonth() - (range === 'last' ? 2 : 1), 1).toLocaleDateString('en-GB', { month: 'long' })}</span>}
            <p className="relative hidden text-sm text-navy/85 sm:block">
              {!d ? ' ' : below ? `Below the ${fcfa(c)} ${amountOnly(d.minimum, c)} minimum, so it rolls over to the next payout.`
                : d.owed > 0 ? `Earned since your last payout. It’s all paid on ${next!.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.`
                : 'Nothing owed right now. Earnings show here as soon as something sells.'}
            </p>
            <div className="relative hidden flex-wrap gap-2 sm:flex">
              <a href="#payouts" className="inline-flex h-[34px] items-center rounded-md bg-navy px-3.5 text-[13px] font-bold text-[#FFFFFF]">See payouts</a>
              <Link href={accountHref} className="inline-flex h-[34px] items-center rounded-md bg-[#FFFFFF] px-3.5 text-[13px] font-bold text-navy">Payout account</Link>
            </div>
          </section>

          <section className="hidden min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-xl border border-line bg-white p-5 sm:flex">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Next payout</p>
            <div className="flex items-baseline gap-2">
              <p className="text-[34px] font-extrabold tracking-[-0.02em] text-navy">{next ? next.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '—'}</p>
              {daysLeft != null && <span className="text-[13.5px] text-ink2">in {daysLeft} day{daysLeft === 1 ? '' : 's'}</span>}
            </div>
            <div>
              <div className="h-2 overflow-hidden rounded bg-accent-soft"><span className="block h-2 rounded bg-[#3F6FE8]" style={{ width: `${Math.round((now.getDate() / monthDays) * 100)}%` }} /></div>
              <p className="mt-1.5 text-xs text-muted">{now.getDate()} of {monthDays} days of {now.toLocaleDateString('en-GB', { month: 'long' })} earned so far</p>
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[13px]">
              <dt className="text-ink2">To</dt><dd className="text-right font-semibold text-navy">{d?.account?.label ?? 'No payout account yet'}</dd>
              <dt className="text-ink2">Last payout</dt><dd className="text-right font-semibold text-navy">{lastPaid ? `${walletMoney(lastPaid.amount, lastPaid.currency)} · ${lastPaid.paidAt ? longDay(lastPaid.paidAt) : ''}` : 'None yet'}</dd>
              {!!d?.minimum && <><dt className="text-ink2">Minimum payout</dt><dd className="text-right font-semibold text-navy">{walletMoney(d.minimum, c)}</dd></>}
            </dl>
          </section>
        </div>

        {/* KPIs with their six-month trend: a swipeable row on phones */}
        <dl className="-mx-3.5 flex snap-x gap-2.5 overflow-x-auto px-3.5 pb-1 sm:gap-3.5 sm:mx-0 sm:grid sm:overflow-visible sm:px-0 sm:pb-0 sm:[grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]">
          {(d?.kpis ?? Array.from({ length: 4 }, () => null)).map((k, i) => k ? (
            <KpiTile key={k.label} className="min-w-[150px] snap-start sm:min-w-0"
              label={k.label === 'Earned' ? `Earned ${d!.range}` : k.label}
              value={k.money ? walletMoney(k.value, c) : `${k.value.toLocaleString('en-GB')}${k.unit ? ` ${k.unit}` : ''}`}
              change={k.change} changeIsPct={k.changeIsPct} sub={k.sub} series={k.series} />
          ) : <div key={i} className="h-[120px] min-w-[150px] animate-pulse rounded-[10px] border border-line bg-white sm:min-w-0" />)}
        </dl>

        <div className="flex flex-wrap items-start gap-3 sm:gap-[18px]">
          <section className="hidden min-w-0 flex-[999_1_560px] flex-col gap-3.5 rounded-xl border border-line bg-white p-5 sm:flex">
            <div className="flex flex-wrap items-baseline justify-between gap-2.5">
              <div><h2 className="text-base font-bold text-navy">Earned by month</h2><p className="mt-0.5 text-[12.5px] text-muted">{fcfa(c)} · last 6 months · hover or tap a month</p></div>
              <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12.5px] text-ink2">
                {d?.kinds.map((k, i) => <li key={k.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: KIND_COLOURS[i] }} />{k.name}</li>)}
              </ul>
            </div>
            {d ? <MonthStack months={d.months.map(m => m.month)} kinds={d.kinds} byKindMonth={d.byKindMonth} currency={c} /> : <div className="h-[230px] animate-pulse rounded-md bg-subtle" />}
          </section>

          <section className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-xl border border-line bg-white p-3.5 sm:p-5">
            <div><h2 className="text-sm font-bold text-navy sm:text-base">Where it came from</h2>
              <p className="mt-0.5 text-[12.5px] text-muted">{d ? `${d.range[0].toUpperCase()}${d.range.slice(1)} · ${walletMoney(d.stats.earned, c)}` : ' '}</p></div>
            {d ? <SplitBar currency={c} items={d.split.map((s, i) => ({ name: s.name, amount: s.amount, how: s.how, colour: KIND_COLOURS[i] }))} /> : <div className="h-32 animate-pulse rounded-md bg-subtle" />}
          </section>
        </div>

        <div className="flex flex-wrap items-start gap-[18px]">
          <section className="min-w-0 flex-[999_1_560px] rounded-xl border border-line bg-white">
            <div className="flex items-center justify-between px-[18px] py-3.5">
              <h2 className="text-base font-bold text-navy">Activity</h2>
              <button onClick={download} disabled={!d} className="text-[13px] font-semibold text-azure-strong hover:underline disabled:opacity-50">Download CSV</button>
            </div>
            {!d ? <div className="m-4 h-40 animate-pulse rounded-md bg-subtle" /> : d.activity.length ? d.activity.map((t, i) => (
              <div key={t.id} className={clsx("items-center gap-3 border-t border-line px-[18px] py-[11px] text-[13.5px]", i < 4 ? "flex" : "hidden sm:flex")}>
                <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-lg text-xs font-extrabold text-[#FFFFFF]" style={{ background: t.kind === 'payout' ? '#637090' : colourOf(t.kind) }}>
                  {t.kind === 'payout' ? '↗' : t.kind === 'credit' ? '+' : (d.kinds.find(k => k.key === t.kind)?.name ?? t.title).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                </span>
                <div className="min-w-0 flex-1"><p className="truncate font-semibold text-navy">{t.title}</p>{t.detail && <p className="mt-px truncate text-[12.5px] text-muted">{t.detail}</p>}</div>
                <span className="hidden shrink-0 text-[12.5px] text-muted sm:inline">{day(t.at)}</span>
                <strong className={clsx('shrink-0 text-right tabular-nums sm:w-[120px]', t.type === 'DEBIT' ? 'text-muted' : 'text-navy')}>{t.type === 'DEBIT' ? '−' : '+'} {walletMoney(t.amount, t.currency)}</strong>
              </div>
            )) : <p className="border-t border-line px-4 py-10 text-center text-[13px] text-ink2">Nothing yet. Earnings show here as soon as something sells.</p>}
            {d && d.activity.length > 4 && <button onClick={() => { setPhoneView('activity'); window.scrollTo(0, 0); }} className="flex w-full items-center justify-center border-t border-line py-3 text-[13.5px] font-semibold text-azure-strong sm:hidden">See all activity</button>}
          </section>

          <section id="payouts" className="hidden min-w-0 flex-[1_1_300px] flex-col rounded-xl sm:flex border border-line bg-white px-5 py-[18px]">
            <h2 className="mb-2.5 text-base font-bold text-navy">Payouts</h2>
            {d && d.owed > 0 && (
              <div className="flex gap-3 pb-3.5">
                <div className="flex flex-col items-center"><span className="mt-[3px] h-3 w-3 rounded-full border-2 border-[#3F6FE8] bg-white" /><span className="mt-1 w-[2px] flex-1 bg-line" /></div>
                <div className="min-w-0 flex-1">
                  <p className="flex justify-between gap-2 text-[13.5px] text-navy"><strong>{now.toLocaleDateString('en-GB', { month: 'long' })}</strong><strong className="tabular-nums">{walletMoney(d.owed, c)}</strong></p>
                  <p className="mt-0.5 text-xs text-muted">{below ? 'Below the minimum · rolls over' : `Scheduled · ${next!.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}</p>
                </div>
              </div>
            )}
            {d?.payouts.map(p => (
              <div key={p.id} className="flex gap-3 pb-3.5">
                <div className="flex flex-col items-center"><span className={clsx('mt-[3px] h-3 w-3 rounded-full', p.status === 'PAID' ? 'bg-[#1F8A5B]' : 'border-2 border-[#D99A2B] bg-white')} /><span className="mt-1 w-[2px] flex-1 bg-line" /></div>
                <div className="min-w-0 flex-1">
                  <p className="flex justify-between gap-2 text-[13.5px] text-navy"><strong>{new Date(+new Date(p.periodEnd) - 86_400_000).toLocaleDateString('en-GB', { month: 'long' })}</strong><strong className="tabular-nums">{walletMoney(p.amount, p.currency)}</strong></p>
                  <p className="mt-0.5 truncate text-xs text-muted">{p.status === 'PAID' ? ['Paid', p.paidAt && longDay(p.paidAt), p.reference && `ref ${p.reference}`].filter(Boolean).join(' · ') : 'Being prepared'}</p>
                </div>
              </div>
            ))}
            {d && !d.payouts.length && d.owed <= 0 && <p className="text-[13px] text-ink2">No payouts yet. The first is made on the 1st after you earn.</p>}
          </section>
        </div>
      </div>

      {/* Phones: activity as its own screen, filtered by kind and grouped by week */}
      {phoneView === 'activity' && d && (() => {
        const SHORT: Record<string, string> = { sale: 'Sales', class: 'Classes', cohort: 'Cohort', mentor: 'Mentoring', credit: 'Added', review: 'Reviews', commission: 'Commission', bonus: 'Bonus' };
        const chips: [string, string][] = [['all', 'All'], ...d.kinds.filter(k => d.activity.some(t => t.kind === k.key)).map(k => [k.key, SHORT[k.key] ?? k.name] as [string, string]), ...(d.activity.some(t => t.kind === 'payout') ? [['payout', 'Payouts'] as [string, string]] : [])];
        const monday = (x: Date) => { const m = new Date(x.getFullYear(), x.getMonth(), x.getDate()); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return +m; };
        const week = (iso: string) => { const w = (monday(now) - monday(new Date(iso))) / (7 * 86_400_000); return w <= 0 ? 'This week' : w === 1 ? 'Last week' : 'Earlier'; };
        const list = d.activity.filter(t => kindFilter === 'all' || t.kind === kindFilter);
        const groups = ['This week', 'Last week', 'Earlier'].map(g => [g, list.filter(t => week(t.at) === g)] as const).filter(([, xs]) => xs.length);
        return (
          <div className="flex flex-col gap-3 p-3.5 sm:hidden">
            <div className="flex items-center gap-2.5">
              <button onClick={() => setPhoneView('main')} aria-label="Back to wallet" className="flex h-[34px] w-[34px] items-center justify-center rounded-[10px] border border-line bg-white text-ink2">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden><path d="M15 6l-6 6 6 6" /></svg>
              </button>
              <h1 className="text-[20px] font-extrabold text-navy">Activity</h1>
            </div>
            <div className="-mx-3.5 flex gap-1.5 overflow-x-auto px-3.5">
              {chips.map(([k, l]) => (
                <button key={k} onClick={() => setKindFilter(k)} aria-pressed={kindFilter === k}
                  className={clsx('h-8 flex-shrink-0 rounded-full border px-3 text-[12.5px] font-semibold', kindFilter === k ? 'border-[#3F6FE8] bg-[#3F6FE8] text-[#FFFFFF]' : 'border-line bg-white text-navy')}>{l}</button>
              ))}
            </div>
            {groups.length ? groups.map(([g, xs]) => (
              <section key={g} className="rounded-xl border border-line bg-white">
                <p className="px-3.5 pb-1 pt-2.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">{g}</p>
                {xs.map(t => (
                  <div key={t.id} className="flex items-center gap-2.5 border-t border-[#EEF1F7] px-3.5 py-2.5">
                    <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[9px] text-[11px] font-extrabold text-[#FFFFFF]" style={{ background: t.kind === 'payout' ? '#637090' : colourOf(t.kind) }}>
                      {t.kind === 'payout' ? '↗' : t.kind === 'credit' ? '+' : (d.kinds.find(k => k.key === t.kind)?.name ?? t.title).split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-semibold text-navy">{t.title}</p><p className="mt-px truncate text-xs text-muted">{[day(t.at), t.detail].filter(Boolean).join(' · ')}</p></div>
                    <strong className={clsx('whitespace-nowrap text-[13.5px] tabular-nums', t.type === 'DEBIT' ? 'text-muted' : 'text-navy')}>{t.type === 'DEBIT' ? '−' : '+'} {amountOnly(t.amount, t.currency)}</strong>
                  </div>
                ))}
              </section>
            )) : <p className="rounded-xl border border-line bg-white px-4 py-8 text-center text-[13px] text-ink2">Nothing here yet.</p>}
            {lastPaid && (
              <section className="flex items-center gap-3 rounded-xl border border-line bg-white px-3.5 py-3">
                <span className="h-3 w-3 flex-shrink-0 rounded-full bg-[#1F8A5B]" />
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-bold text-navy">{new Date(+new Date(lastPaid.periodEnd) - 86_400_000).toLocaleDateString('en-GB', { month: 'long' })} payout · {walletMoney(lastPaid.amount, lastPaid.currency)}</p>
                  <p className="mt-px truncate text-xs text-muted">{['Paid', lastPaid.paidAt && longDay(lastPaid.paidAt), lastPaid.paidTo].filter(Boolean).join(' · ')}</p>
                </div>
              </section>
            )}
          </div>
        );
      })()}
    </div>
  );
}

export type EarningsData = Data;
