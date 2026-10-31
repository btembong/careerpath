'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import { money } from '@/lib/money';
import api from '@/lib/api';

type Range = 'month' | 'last' | 'year';
interface Tx { id: string; at: string; type: 'CREDIT' | 'DEBIT'; amount: number; currency: string; title: string; detail: string }
interface PayoutRow { id: string; periodStart: string; periodEnd: string; amount: number; currency: string; status: string; paidAt: string | null; reference: string | null; paidTo: string | null }
interface Data {
  currency: string; range: string; owed: number; nextPayout: string;
  account: { label: string; verified: boolean } | null;
  stats: { earned: number; earnedBefore: number; changePct: number | null; count: number; paidAllTime: number; share: { label: string; value: string } | null };
  months: { month: string; amount: number }[];
  breakdown: { name: string; amount: number; detail: string }[];
  activity: Tx[]; payouts: PayoutRow[];
}

const RANGES: [Range, string][] = [['month', 'This month'], ['last', 'Last month'], ['year', 'This year']];
const day = (iso: string) => {
  const d = new Date(iso), today = new Date();
  const diff = Math.floor((+new Date(today.toDateString()) - +new Date(d.toDateString())) / 86_400_000);
  return diff === 0 ? 'today' : diff === 1 ? 'yesterday' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const monthName = (iso: string, style: 'short' | 'long' = 'long') => new Date(iso).toLocaleDateString('en-GB', { month: style });
const compact = (amount: number, currency: string) => {
  const v = minorToMajor(amount, currency);
  return v >= 1000 ? `${(v / 1000).toFixed(v >= 10_000 ? 0 : 1).replace(/\.0$/, '')}k` : String(Math.round(v));
};

function csv(name: string, rows: (string | number)[][]) {
  const text = rows.map(r => r.map(c => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name; a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Earnings for teachers, reviewers and country reps: what's owed and when it's paid, the period's
 * numbers, six months of earnings, where the money came from, and the activity and payout history.
 */
export function Earnings({ subtitle, countLabel, countSub, shareSub, breakdownTitle, how, accountHref }: {
  subtitle: string; countLabel: string; countSub: (d: Data) => string; shareSub: string;
  breakdownTitle: (range: Range) => string; how: (d: Data) => string; accountHref: string;
}) {
  const [range, setRange] = useState<Range>('month');
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<'activity' | 'payouts'>('activity');

  useEffect(() => {
    api.get('/wallets/me/earnings', { params: { range } }).then(r => setD(r.data)).catch(e => notify.error(e?.response?.data?.message ?? 'Could not load your earnings'));
  }, [range]);

  const c = d?.currency ?? 'GHS';
  const before = range === 'month' ? 'on last month' : range === 'last' ? 'on the month before' : 'on the same time before';
  const change = d?.stats.changePct;
  const max = Math.max(1, ...(d?.months ?? []).map(m => m.amount));
  const topBreakdown = Math.max(1, ...(d?.breakdown ?? []).map(b => b.amount));
  const rangeLabel = RANGES.find(r => r[0] === range)![1].toLowerCase();

  function download() {
    if (!d) return;
    if (tab === 'activity') csv(`earnings-${range}.csv`, [['Date', 'What', 'Detail', 'Amount', 'Currency'], ...d.activity.map(t => [t.at.slice(0, 10), t.title, t.detail, (t.type === 'DEBIT' ? -1 : 1) * minorToMajor(t.amount, t.currency), t.currency])]);
    else csv('payouts.csv', [['Period', 'Status', 'Paid on', 'Paid to', 'Reference', 'Amount', 'Currency'], ...d.payouts.map(p => [`${p.periodStart.slice(0, 10)} to ${p.periodEnd.slice(0, 10)}`, p.status, p.paidAt?.slice(0, 10) ?? '', p.paidTo ?? '', p.reference ?? '', minorToMajor(p.amount, p.currency), p.currency])]);
  }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Earnings" subtitle={subtitle} actions={
        <span role="group" aria-label="Period" className="flex gap-1 rounded-lg border border-line bg-white p-1 text-[13px]">
          {RANGES.map(([k, l]) => (
            <button key={k} onClick={() => setRange(k)} aria-pressed={range === k}
              className={clsx('rounded-md px-3 py-1.5 text-navy', range === k ? 'bg-accent-soft font-semibold' : 'hover:bg-subtle')}>{l}</button>
          ))}
        </span>
      } />
      <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
        <div className="flex min-w-0 flex-[999_1_540px] flex-col gap-4">
          <section className="flex flex-wrap items-center gap-[18px] rounded-lg border border-azure bg-white px-5 py-[18px]">
            <div className="min-w-0 flex-1">
              <p className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted">Owed to you</p>
              <p className="mt-1 text-[30px] font-extrabold text-navy">{d ? money(d.owed, c) : '—'}</p>
              <p className="mt-0.5 text-[13.5px] text-ink2">
                {!d ? ' ' : d.account
                  ? <>Paid on the 1st of each month to {d.account.label}{!d.account.verified && ' (waiting for us to check it)'} · next payout <strong className="text-navy">{new Date(d.nextPayout).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</strong></>
                  : <>Add a payout account so we can pay you on the 1st of each month.</>}
              </p>
            </div>
            <Link href={accountHref} className={clsx('inline-flex h-[38px] items-center rounded-md px-3.5 text-[13.5px] font-semibold', d && !d.account ? 'bg-azure-strong text-white' : 'border border-line text-navy hover:bg-subtle')}>
              {d && !d.account ? 'Add payout account' : 'Payout account'}
            </Link>
          </section>

          <dl className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            {[
              { l: `Earned ${rangeLabel}`, v: d ? money(d.stats.earned, c) : '—', sub: change == null ? rangeLabel : `${change >= 0 ? '+' : '−'}${Math.abs(change)}% ${before}` },
              { l: countLabel, v: d ? String(d.stats.count) : '—', sub: d ? countSub(d) : '' },
              { l: 'Paid to you', v: d ? money(d.stats.paidAllTime, c) : '—', sub: 'all time' },
              { l: d?.stats.share?.label ?? 'Your share', v: d?.stats.share?.value ?? '—', sub: shareSub },
            ].map(s => (
              <div key={s.l} className="rounded-lg border border-line bg-white px-[15px] py-[13px]">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{s.l}</dt>
                <dd className="mt-[5px] text-[20px] font-extrabold text-navy">{s.v}</dd>
                <dd className="mt-0.5 text-[12px] text-muted">{s.sub}</dd>
              </div>
            ))}
          </dl>

          <section className="rounded-lg border border-line bg-white p-[18px]">
            <div className="flex items-baseline justify-between"><h2 className="text-[16px] font-bold text-navy">Earned by month</h2><span className="text-[12.5px] text-muted">{c} · last 6 months</span></div>
            <div className="mt-3.5 flex h-[140px] items-end gap-3.5">
              {(d?.months ?? Array.from({ length: 6 }, () => null)).map((m, i) => (
                <div key={i} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
                  <span className="text-[11px] text-muted">{m ? compact(m.amount, c) : ''}</span>
                  <span className={clsx('w-full rounded-t-[3px]', i === 5 ? 'bg-azure-strong' : 'bg-azure', !m && 'animate-pulse bg-subtle')}
                    style={{ height: m ? Math.max(2, Math.round((m.amount / max) * 100)) : 40 }} title={m ? money(m.amount, c) : undefined} />
                  <span className="text-[11px] text-muted">{m ? monthName(m.month, 'short') : ''}</span>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-lg border border-line bg-white">
            <div className="flex items-center gap-1 border-b border-line px-4 text-[13.5px]">
              {(['activity', 'payouts'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} aria-pressed={tab === t}
                  className={clsx('-mb-px border-b-2 px-2.5 py-[13px] capitalize text-navy', tab === t ? 'border-azure-strong font-semibold' : 'border-transparent')}>{t}</button>
              ))}
              <span className="flex-1" />
              <button onClick={download} disabled={!d} className="text-[13px] font-semibold text-azure-strong hover:underline disabled:opacity-50">Download CSV</button>
            </div>
            {!d ? <div className="m-4 h-40 animate-pulse rounded-md bg-subtle" /> : tab === 'activity' ? (
              d.activity.length ? d.activity.map((t, i) => (
                <div key={t.id} className={clsx('flex items-center gap-3 px-[18px] py-[11px] text-[13.5px]', i && 'border-t border-line')}>
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold text-navy">{t.title}</p>{t.detail && <p className="mt-px truncate text-[12.5px] text-muted">{t.detail}</p>}</div>
                  <span className="shrink-0 text-[12.5px] text-muted">{day(t.at)}</span>
                  <strong className={clsx('w-[110px] shrink-0 text-right', t.type === 'DEBIT' ? 'text-muted' : 'text-navy')}>{t.type === 'DEBIT' ? '−' : '+'} {money(t.amount, t.currency)}</strong>
                </div>
              )) : <p className="px-4 py-10 text-center text-[13px] text-ink2">Nothing yet. Earnings show here as soon as something sells.</p>
            ) : (
              d.payouts.length ? d.payouts.map((p, i) => (
                <div key={p.id} className={clsx('flex items-center gap-3 px-[18px] py-[11px] text-[13.5px]', i && 'border-t border-line')}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-navy">Payout · {monthName(p.periodStart)}</p>
                    <p className="mt-px truncate text-[12.5px] text-muted">{p.status === 'PAID' ? [p.paidTo, p.reference && `ref ${p.reference}`].filter(Boolean).join(' · ') || 'Paid' : 'Being prepared'}</p>
                  </div>
                  <span className="shrink-0 text-[12.5px] text-muted">{p.paidAt ? day(p.paidAt) : 'pending'}</span>
                  <strong className={clsx('w-[110px] shrink-0 text-right', p.status === 'PAID' ? 'text-muted' : 'text-navy')}>{money(p.amount, p.currency)}</strong>
                </div>
              )) : <p className="px-4 py-10 text-center text-[13px] text-ink2">No payouts yet. Your first one is made on the 1st after you earn.</p>
            )}
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
          <section className="flex flex-col gap-[9px] rounded-lg border border-line bg-white p-4">
            <h3 className="text-[15px] font-semibold text-navy">{breakdownTitle(range)}</h3>
            {!d ? <div className="h-24 animate-pulse rounded-md bg-subtle" /> : d.breakdown.filter(b => b.amount > 0).length ? d.breakdown.filter(b => b.amount > 0).map(b => (
              <div key={b.name} className="flex flex-col gap-1 text-[13px]">
                <p className="flex justify-between gap-2 text-navy"><span className="min-w-0">{b.name}</span><strong className="shrink-0">{money(b.amount, c)}</strong></p>
                <span className="h-1.5 rounded-[3px] bg-subtle"><span className="block h-1.5 rounded-[3px] bg-azure" style={{ width: `${Math.round((b.amount / topBreakdown) * 100)}%` }} /></span>
                <span className="text-[12px] text-muted">{b.detail}</span>
              </div>
            )) : <p className="text-[13px] text-ink2">Nothing earned {rangeLabel}.</p>}
          </section>
          <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
            <h3 className="text-[15px] font-semibold text-navy">How you earn</h3>
            <p className="text-[13px] text-ink2">{d ? how(d) : ' '}</p>
          </section>
        </aside>
      </div>
    </div>
  );
}

export type EarningsData = Data;
