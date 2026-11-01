'use client';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';

export interface Stat { l: string; v: string; sub: string }

/** Header, stat tiles, a tabbed and searchable table, and a note — the layout of the rep's Packages and Teachers pages */
export function RepTable({ title, subtitle, actions, top, middle, stats, tabs, tab, onTab, search, onSearch, searchLabel, cols, loading, empty, note, children }: {
  title: string; subtitle: string; actions?: React.ReactNode;
  /** Above the stats (e.g. period pickers) and between the stats and the table (e.g. a chart) */
  top?: React.ReactNode; middle?: React.ReactNode; stats: Stat[];
  tabs: { key: string; label: string; count: number }[]; tab: string; onTab: (k: string) => void;
  search: string; onSearch: (v: string) => void; searchLabel: string;
  cols: string[]; loading: boolean; empty: string | null; note: string; children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-col">
      <Topbar title={title} subtitle={subtitle} actions={actions} />
      <div className="flex flex-col gap-[18px] p-4 lg:px-7 lg:py-6">
        {top}
        <dl className="grid gap-3.5 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
          {stats.map(x => (
            <div key={x.l} className="rounded-lg border border-line bg-white px-4 py-3.5">
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{x.l}</dt>
              <dd className="mt-1.5 text-[22px] font-extrabold text-navy">{x.v}</dd>
              <dd className="mt-0.5 text-[12.5px] text-muted">{x.sub}</dd>
            </div>
          ))}
        </dl>
        {middle}
        <section className="rounded-lg border border-line bg-white">
          <div className="flex flex-wrap items-center gap-1 border-b border-line px-4">
            {tabs.map(t => (
              <button key={t.key} onClick={() => onTab(t.key)} aria-pressed={tab === t.key}
                className={clsx('-mb-px h-[46px] border-b-2 px-2.5 text-[13.5px] text-navy', tab === t.key ? 'border-azure-strong font-semibold' : 'border-transparent font-medium')}>{t.label} {t.count}</button>
            ))}
            <span className="flex-1" />
            <input value={search} onChange={e => onSearch(e.target.value)} placeholder={searchLabel} aria-label={searchLabel}
              className="my-2 h-8 w-56 rounded-md border border-line px-2.5 text-[13px] text-navy outline-none focus:border-azure max-sm:w-full" />
          </div>
          {loading ? <div className="m-4 h-48 rounded-md bg-subtle animate-pulse" /> : empty ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink2">{empty}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
                <thead><tr>{cols.map((h, i) => <th key={i} className="border-b border-line px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{h}</th>)}</tr></thead>
                <tbody>{children}</tbody>
              </table>
            </div>
          )}
        </section>
        <p className="text-[12.5px] text-muted">{note}</p>
      </div>
    </div>
  );
}

export const td = 'border-b border-line px-4 py-3 align-top';
