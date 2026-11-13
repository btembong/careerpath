'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { RepTable, td } from '@/components/rep/RepTable';
import { InsightsTabs } from '@/components/insights/InsightsTabs';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import { money } from '@/lib/money';
import api from '@/lib/api';

interface Data {
  month: { start: string; label: string }; base: string; rates: { currency: string; toUsd: number }[]; unconverted: { currency: string; amount: number }[];
  stats: { revenue: number; revenueChange: number | null; sales: number; packageSales: number; courseSales: number; newStudents: number; newStudentsChange: number | null; paidOut: number };
  days: { date: string; amount: number }[];
  courses: { id: string; title: string; tag: string; teacher: string | null; revenue: number; sales: number; students: number; completion: number }[];
  teachers: { id: string; name: string; email: string; courses: number; revenue: number; earned: number }[];
  countries: { id: string; name: string; currency: string; sales: number; revenue: number; newStudents: number }[];
  purchases: { id: string; at: string; kind: string; title: string; studentEmail: string; amount: number; currency: string; inBase: number | null; gateway: string | null; invoiceNo: string | null }[];
}
type Tab = 'courses' | 'teachers' | 'countries' | 'purchases';

const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const MONTHS = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return { key: ym(d), label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }; });
const BASES = ['GHS', 'XAF', 'NGN', 'XOF', 'KES', 'USD'];
const fmt = (n: number, c: string) => `${c} ${n.toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
const change = (p: number | null, what: string) => (p == null ? what : `${p >= 0 ? '+' : '−'}${Math.abs(p)}% on ${what}`);

function csv(name: string, rows: (string | number)[][]) {
  const text = rows.map(r => r.map(c => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export default function AdminReportsPage() {
  const [month, setMonth] = useState(MONTHS[0].key);
  const [base, setBase] = useState('GHS');
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('courses');
  const [q, setQ] = useState('');
  const [rates, setRates] = useState(false);

  const load = useCallback(() => { setD(null); api.get('/reports/admin/reports/overview', { params: { month, base } }).then(r => setD(r.data)).catch(() => notify.error('Could not load the report')); }, [month, base]);
  useEffect(() => { load(); }, [load]);

  const prev = new Date(`${month}-01T00:00:00`); prev.setMonth(prev.getMonth() - 1);
  const prevName = prev.toLocaleDateString('en-GB', { month: 'long' });
  const s = d?.stats;
  const max = Math.max(1, ...(d?.days ?? []).map(x => x.amount));
  const match = (t: string) => !q.trim() || t.toLowerCase().includes(q.trim().toLowerCase());

  function download() {
    if (!d) return;
    const B = d.base;
    if (tab === 'courses') csv(`courses-${month}.csv`, [['Course', 'Tags', 'Teacher', `Revenue (${B})`, 'Sales', 'Students', 'Completion %'], ...d.courses.map(c => [c.title, c.tag, c.teacher ?? '', c.revenue, c.sales, c.students, c.completion])]);
    if (tab === 'teachers') csv(`teachers-${month}.csv`, [['Teacher', 'Email', 'Courses sold', `Course revenue (${B})`, `Earned (${B})`], ...d.teachers.map(t => [t.name, t.email, t.courses, t.revenue, t.earned])]);
    if (tab === 'countries') csv(`countries-${month}.csv`, [['Country', 'Currency', 'Sales', `Revenue (${B})`, 'New students'], ...d.countries.map(c => [c.name, c.currency, c.sales, c.revenue, c.newStudents])]);
    if (tab === 'purchases') csv(`purchases-${month}.csv`, [['Date', 'Type', 'What', 'Student', 'Amount', 'Currency', `In ${B}`, 'Paid with', 'Receipt'], ...d.purchases.map(p => [p.at.slice(0, 10), p.kind, p.title, p.studentEmail, minorToMajor(p.amount, p.currency), p.currency, p.inBase ?? '', p.gateway ?? '', p.invoiceNo ?? ''])]);
  }

  const cols: Record<Tab, string[]> = {
    courses: ['Course', 'Teacher', 'Revenue', 'Students', 'Completion', ''],
    teachers: ['Teacher', 'Courses sold', 'Course revenue', 'Earned', '', ''],
    countries: ['Country', 'Currency', 'Sales', 'Revenue', 'New students', ''],
    purchases: ['What', 'Student', 'Amount', 'Date', 'Paid with', ''],
  };
  const rows = {
    courses: (d?.courses ?? []).filter(c => match(`${c.title} ${c.teacher ?? ''}`)),
    teachers: (d?.teachers ?? []).filter(t => match(`${t.name} ${t.email}`)),
    countries: (d?.countries ?? []).filter(c => match(c.name)),
    purchases: (d?.purchases ?? []).filter(p => match(`${p.title} ${p.studentEmail}`)),
  };

  return (
    <>
      <RepTable title="Insights" subtitle="A month of sales: courses, teachers and countries" underBar={<InsightsTabs />}
        actions={<button onClick={download} disabled={!d} className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-50">Download CSV</button>}
        top={<>
        <div className="flex flex-wrap items-center gap-2 text-[13.5px]">
          <label className="flex h-9 items-center gap-1 rounded-md border border-line bg-white pl-3 text-navy">Period:
            <select value={month} onChange={e => setMonth(e.target.value)} className="h-full cursor-pointer bg-transparent pr-2 font-semibold outline-none">{MONTHS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}</select></label>
          <label className="flex h-9 items-center gap-1 rounded-md border border-line bg-white pl-3 text-navy">Show money in:
            <select value={base} onChange={e => setBase(e.target.value)} className="h-full cursor-pointer bg-transparent pr-2 font-semibold outline-none">{BASES.map(b => <option key={b}>{b}</option>)}</select></label>
          <span className="text-[12.5px] text-muted">
            {d?.rates.length ? `Rates: ${d.rates.filter(r => r.currency !== base).slice(0, 4).map(r => { const b = d.rates.find(x => x.currency === base)?.toUsd ?? (base === 'USD' ? 1 : null); return b ? `1 ${base} = ${(b / r.toUsd).toLocaleString('en-GB', { maximumFractionDigits: 2 })} ${r.currency}` : null; }).filter(Boolean).join(' · ')}` : 'No exchange rates yet'}
            {' · '}<button onClick={() => setRates(true)} className="font-semibold text-azure-strong hover:underline">Edit rates</button>
          </span>
        </div>
        </>}
        middle={<>
        {!!d?.unconverted.length && <p className="rounded-md border border-dashed border-azure px-3 py-2 text-[13px] text-ink2">Not counted in the totals because there’s no rate yet: {d.unconverted.map(u => money(u.amount, u.currency)).join(', ')}. <button onClick={() => setRates(true)} className="font-semibold text-azure-strong hover:underline">Add rates</button></p>}
        <section className="rounded-lg border border-line bg-white p-[18px]">
          <div className="flex items-baseline justify-between"><h2 className="text-[16px] font-bold text-navy">Sales by day</h2><span className="text-[12.5px] text-muted">{base} · {d?.month.label ?? ''}</span></div>
          <div className="mt-3.5 flex h-[120px] items-end gap-1">
            {(d?.days ?? Array.from({ length: 30 }, () => null)).map((x, i, all) => (
              <span key={i} title={x ? `${new Date(x.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}: ${fmt(x.amount, base)}` : undefined}
                className={clsx('flex-1 rounded-t-[2px]', !x ? 'animate-pulse bg-subtle' : i === all.length - 1 ? 'bg-azure-strong' : 'bg-azure')}
                style={{ height: x ? Math.max(2, Math.round((x.amount / max) * 100)) : 30 }} />
            ))}
          </div>
        </section>
        </>}
        stats={[
          { l: 'Revenue', v: s && d ? fmt(s.revenue, d.base) : '—', sub: s ? change(s.revenueChange, prevName) : '' },
          { l: 'Sales', v: s ? String(s.sales) : '—', sub: s ? `${s.packageSales} packages · ${s.courseSales} courses` : '' },
          { l: 'New students', v: s ? String(s.newStudents) : '—', sub: s ? change(s.newStudentsChange, prevName) : '' },
          { l: 'Paid out', v: s && d ? fmt(s.paidOut, d.base) : '—', sub: 'teachers, reviewers, reps' },
        ]}
        tabs={[{ key: 'courses', label: 'Courses', count: d?.courses.length ?? 0 }, { key: 'teachers', label: 'Teachers', count: d?.teachers.length ?? 0 }, { key: 'countries', label: 'Countries', count: d?.countries.length ?? 0 }, { key: 'purchases', label: 'Purchases', count: d?.purchases.length ?? 0 }]}
        tab={tab} onTab={k => setTab(k as Tab)} search={q} onSearch={setQ} searchLabel="Search"
        cols={cols[tab]} loading={!d} empty={d && !rows[tab].length ? (q ? 'Nothing matches.' : `No sales in ${d.month.label}.`) : null}
        note={`Money in other currencies is shown in ${base} using the rates above; the purchases CSV keeps the original amounts too.`}>
        {tab === 'courses' && rows.courses.map(c => (
          <tr key={c.id} className="hover:bg-subtle">
            <td className={td}><strong className="text-navy">{c.title}</strong>{c.tag && <><br /><span className="text-[12.5px] text-muted">{c.tag}</span></>}</td>
            <td className={clsx(td, 'text-ink2')}>{c.teacher ?? 'no teacher yet'}</td>
            <td className={clsx(td, 'font-bold text-navy')}>{fmt(c.revenue, d!.base)}<br /><span className="text-[12.5px] font-normal text-muted">{c.sales} sale{c.sales === 1 ? '' : 's'}</span></td>
            <td className={clsx(td, 'text-ink2')}>{c.students}</td>
            <td className={clsx(td, 'text-ink2')}>{c.completion}%</td>
            <td className={clsx(td, 'text-right')}><Link href={`/admin/courses/${c.id}`} className="font-semibold text-azure-strong hover:underline">Open</Link></td>
          </tr>
        ))}
        {tab === 'teachers' && rows.teachers.map(t => (
          <tr key={t.id} className="hover:bg-subtle">
            <td className={td}><strong className="text-navy">{t.name}</strong><br /><span className="text-[12.5px] text-muted">{t.email}</span></td>
            <td className={clsx(td, 'text-ink2')}>{t.courses}</td>
            <td className={clsx(td, 'font-bold text-navy')}>{fmt(t.revenue, d!.base)}</td>
            <td className={clsx(td, 'text-ink2')}>{fmt(t.earned, d!.base)}</td>
            <td className={td} />
            <td className={clsx(td, 'text-right')}><Link href={`/admin/users?open=${t.id}`} className="font-semibold text-azure-strong hover:underline">Open</Link></td>
          </tr>
        ))}
        {tab === 'countries' && rows.countries.map(c => (
          <tr key={c.id} className="hover:bg-subtle">
            <td className={td}><strong className="text-navy">{c.name}</strong></td>
            <td className={clsx(td, 'text-ink2')}>{c.currency}</td>
            <td className={clsx(td, 'text-ink2')}>{c.sales}</td>
            <td className={clsx(td, 'font-bold text-navy')}>{fmt(c.revenue, d!.base)}</td>
            <td className={clsx(td, 'text-ink2')}>{c.newStudents}</td>
            <td className={td} />
          </tr>
        ))}
        {tab === 'purchases' && rows.purchases.map(p => (
          <tr key={p.id} className="hover:bg-subtle">
            <td className={td}><strong className="text-navy">{p.title}</strong><br /><span className="text-[12.5px] text-muted">{p.kind === 'package' ? 'Package' : 'Single course'}{p.invoiceNo ? ` · ${p.invoiceNo}` : ''}</span></td>
            <td className={clsx(td, 'text-ink2')}>{p.studentEmail}</td>
            <td className={clsx(td, 'font-bold text-navy')}>{money(p.amount, p.currency)}{p.currency !== d!.base && <><br /><span className="text-[12.5px] font-normal text-muted">{p.inBase != null ? fmt(p.inBase, d!.base) : 'no rate'}</span></>}</td>
            <td className={clsx(td, 'text-ink2')}>{new Date(p.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</td>
            <td className={clsx(td, 'text-ink2')}>{p.gateway ?? '—'}</td>
            <td className={td} />
          </tr>
        ))}
      </RepTable>

      <Rates open={rates} known={d?.rates ?? []} onClose={() => setRates(false)} onDone={() => { setRates(false); load(); }} />
    </>
  );
}

function Rates({ open, known, onClose, onDone }: { open: boolean; known: { currency: string; toUsd: number }[]; onClose: () => void; onDone: () => void }) {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const list = [...new Set([...BASES.filter(b => b !== 'USD'), ...known.map(k => k.currency)])];
  useEffect(() => { if (open) setVals(Object.fromEntries(list.map(c => [c, known.find(k => k.currency === c) ? String(+(1 / known.find(k => k.currency === c)!.toUsd).toFixed(4)) : '']))); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  async function save() {
    setSaving(true);
    try {
      for (const [currency, v] of Object.entries(vals)) {
        const perUsd = Number(v);
        if (!v || !Number.isFinite(perUsd) || perUsd <= 0) continue;
        await api.post('/reports/admin/reports/exchange-rates', { currency, toUsdRate: 1 / perUsd });
      }
      notify.success('Rates saved'); onDone();
    } catch (e: any) { notify.error([].concat(e?.response?.data?.message ?? 'Could not save the rates').join(', ')); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent title="Exchange rates" description="How much of each currency one US dollar buys. Used to add up sales across countries.">
        <div className="grid grid-cols-2 gap-3">
          {list.map(c => (
            <label key={c} className="flex items-center gap-2 text-[13.5px] text-navy"><span className="w-28 shrink-0">1 USD =</span>
              <input inputMode="decimal" value={vals[c] ?? ''} onChange={e => setVals(v => ({ ...v, [c]: e.target.value }))} placeholder="—" className="input-base h-9 min-w-0 flex-1" /><span className="w-10">{c}</span></label>
          ))}
        </div>
        <DialogFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} loading={saving}>Save rates</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
