'use client';
import { useState } from 'react';
import { clsx } from 'clsx';
import { money } from '@/lib/money';

/** Amounts on the wallet pages: francs read as FCFA, the way people say them */
export const walletMoney = (amount: number, currency: string) => money(amount, currency).replace(/^(XAF|XOF) /, 'FCFA ');

/**
 * Chart pieces for the wallet pages. Colours are a validated categorical palette, always in the same
 * order, and every coloured mark has a label beside it, so nothing relies on colour alone.
 */
export const KIND_COLOURS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300'];

/** Six (or more) values as a line with a soft area under it and the latest point marked */
export function Sparkline({ series, label, className }: { series: number[]; label: string; className?: string }) {
  const w = 200, h = 44;
  const max = Math.max(...series), min = Math.min(...series), r = max - min || 1;
  const pts = series.map((v, i) => [Math.round((i * w) / Math.max(1, series.length - 1)), Math.round(h - 4 - ((v - min) / r) * (h - 10))]);
  const line = pts.map(p => p.join(',')).join(' ');
  const last = pts[pts.length - 1] ?? [w, h];
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={clsx('block w-full', className ?? 'h-[44px]')}>
      <path d={`M0,${h} L${pts.map(p => p.join(',')).join(' L')} L${w},${h} Z`} className="fill-accent-soft" />
      <polyline points={line} fill="none" stroke="#3F6FE8" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r={3.5} fill="#3F6FE8" className="stroke-white dark:stroke-[#0F1A33]" strokeWidth={2} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** A number, its change, a line under it and its six-month trend */
export function KpiTile({ label, value, change, changeIsPct, sub, series, className }: {
  label: string; value: string; change: number | null; changeIsPct: boolean; sub?: string | null; series: number[]; className?: string;
}) {
  const up = (change ?? 0) >= 0;
  return (
    <div className={clsx('flex flex-col gap-1 rounded-xl border border-line bg-white px-3 pb-2.5 pt-3 sm:gap-1.5 sm:rounded-[10px] sm:px-4 sm:pb-3 sm:pt-4', className)}>
      <dt className="flex items-center justify-between gap-2 text-[11.5px] font-semibold text-ink2 sm:text-[12.5px]">
        {label}
        {change != null && change !== 0
          ? <span className={clsx('hidden h-[22px] items-center rounded-full px-[7px] text-[11.5px] font-bold sm:inline-flex', up ? 'bg-[#E6F5EE] text-[#1F6B47]' : 'bg-[#FDECEC] text-[#A23434]')}>
              {up ? '+' : '−'}{Math.abs(change)}{changeIsPct ? '%' : ''}
            </span>
          : <span className="hidden text-[11.5px] text-muted sm:inline">—</span>}
      </dt>
      <dd className="text-[18px] font-extrabold tracking-[-0.01em] text-navy tabular-nums sm:text-[24px]">{value}</dd>
      {sub && <dd className="hidden text-xs text-muted sm:block">{sub}</dd>}
      <dd className="mt-1"><Sparkline series={series} label={`${label} over the last 6 months`} className="h-[30px] sm:h-[44px]" /></dd>
    </div>
  );
}

/** Six months as stacked columns by kind; hovering (or tapping) a month shows its breakdown */
export function MonthStack({ months, kinds, byKindMonth, currency }: {
  months: string[]; kinds: { key: string; name: string }[]; byKindMonth: Record<string, number>[]; currency: string;
}) {
  const [hover, setHover] = useState(months.length - 1);
  const totals = byKindMonth.map(m => kinds.reduce((n, k) => n + (m[k.key] ?? 0), 0));
  const top = Math.max(1, ...totals);
  const label = (iso: string, style: 'short' | 'long') => new Date(iso).toLocaleDateString('en-GB', { month: style });
  const h = byKindMonth[hover] ?? {};
  return (
    <div className="relative flex gap-2.5">
      <div className="flex w-[52px] flex-shrink-0 flex-col justify-between pb-6 text-right text-[11px] text-muted tabular-nums">
        <span>{walletMoney(top, currency).replace(/^[A-Z]+\s/, '')}</span><span>{walletMoney(Math.round(top / 2), currency).replace(/^[A-Z]+\s/, '')}</span><span>0</span>
      </div>
      <div className="relative flex h-[230px] flex-1 items-end gap-[clamp(6px,2vw,18px)] pb-6 [background:linear-gradient(var(--color-line,#E4E9F3),var(--color-line,#E4E9F3))_0_0/100%_1px_no-repeat,linear-gradient(var(--color-line,#E4E9F3),var(--color-line,#E4E9F3))_0_calc(50%-12px)/100%_1px_no-repeat]">
        {byKindMonth.map((m, i) => (
          <button key={months[i]} type="button" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onClick={() => setHover(i)}
            aria-label={`${label(months[i], 'long')}: ${walletMoney(totals[i], currency)}`}
            className="relative flex h-full flex-1 flex-col items-center justify-end gap-[2px] outline-none">
            {kinds.map((k, ki) => ({ k, ki, v: m[k.key] ?? 0 })).filter(x => x.v > 0).reverse().map((x, j) => (
              <span key={x.k.key} className="block w-full max-w-[46px]"
                style={{ height: Math.max(2, Math.round((x.v / top) * 200)), background: KIND_COLOURS[x.ki], opacity: i === hover ? 1 : 0.55, borderRadius: j === 0 ? '4px 4px 0 0' : 0 }} />
            ))}
            {totals[i] === 0 && <span className="block h-[2px] w-full max-w-[46px] rounded bg-line" />}
            <span className={clsx('absolute -bottom-5 text-[11.5px]', i === hover ? 'font-bold text-navy' : 'text-muted')}>{label(months[i], 'short')}</span>
          </button>
        ))}
      </div>
      <div className={clsx('pointer-events-none absolute top-1 w-[220px] rounded-lg border border-line bg-white px-3 py-2.5 shadow-[0_8px_24px_rgba(7,32,97,0.12)]', hover > months.length / 2 ? 'left-[64px]' : 'right-1')}>
        <p className="mb-1.5 text-[12.5px] font-bold text-navy">{months[hover] ? new Date(months[hover]).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : ''}</p>
        {kinds.map((k, ki) => (
          <p key={k.key} className="flex items-center gap-1.5 text-xs text-ink2">
            <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px]" style={{ background: KIND_COLOURS[ki] }} />
            <span className="flex-1 truncate">{k.name}</span><strong className="text-navy tabular-nums">{walletMoney(h[k.key] ?? 0, currency)}</strong>
          </p>
        ))}
        <p className="mt-1.5 flex justify-between border-t border-line pt-1.5 text-[12.5px] font-bold text-navy"><span>Total</span><span className="tabular-nums">{walletMoney(totals[hover] ?? 0, currency)}</span></p>
      </div>
    </div>
  );
}

/** Parts of a whole as one bar, then a labelled list */
export function SplitBar({ items, currency, compact }: { items: { name: string; amount: number; how?: string; colour: string }[]; currency: string; compact?: boolean }) {
  const shown = items.filter(i => i.amount > 0);
  const total = shown.reduce((n, i) => n + i.amount, 0);
  if (!total) return <p className="text-[13px] text-ink2">Nothing earned in this period yet.</p>;
  return (
    <div className="flex flex-col">
      <div className="flex h-3.5 gap-[2px]">
        {shown.map(i => <span key={i.name} className="block h-3.5 rounded-[3px]" style={{ background: i.colour, flex: `${i.amount} 1 0` }} />)}
      </div>
      {shown.map(i => (
        <div key={i.name} className={clsx('flex items-center gap-2.5 border-t border-line text-[13.5px]', compact ? 'mt-2 pt-2' : 'mt-2.5 py-2')}>
          <span className="h-2.5 w-2.5 flex-shrink-0 rounded-[3px]" style={{ background: i.colour }} />
          <div className="min-w-0 flex-1"><p className="truncate font-semibold text-navy">{i.name}</p>{i.how && !compact && <p className="mt-px truncate text-xs text-muted">{i.how}</p>}</div>
          <div className="text-right"><p className="font-bold text-navy tabular-nums">{walletMoney(i.amount, currency)}</p>{!compact && <p className="mt-px text-xs text-muted">{Math.round((i.amount / total) * 100)}%</p>}</div>
        </div>
      ))}
    </div>
  );
}
