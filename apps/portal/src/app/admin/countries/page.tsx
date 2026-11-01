'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { majorToMinor, minorToMajor } from '@cpa/shared';
import { RepTable, td } from '@/components/rep/RepTable';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, Drawer, DrawerContent, DrawerSection } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import { money } from '@/lib/money';
import api from '@/lib/api';

interface Country {
  id: string; code: string; name: string; currency: string; repCommissionPercent: number | null; perStudentBonus: number | null;
  educationSystem: { id: string; name: string } | null; rep: { id: string; email: string; name: string } | null;
  students: number; revenueThisMonth: { currency: string; amount: number }[];
}

const terms = (c: Country) => [c.repCommissionPercent != null ? `${c.repCommissionPercent}%` : null, c.perStudentBonus ? `${money(c.perStudentBonus, c.currency)} a student` : null].filter(Boolean).join(' + ') || '—';

export default function AdminCountriesPage() {
  const [rows, setRows] = useState<Country[] | null>(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<Country | null>(null);
  const [adding, setAdding] = useState(false);

  const load = useCallback(() => api.get('/countries/admin/countries').then(r => setRows(r.data ?? [])).catch(() => { setRows([]); notify.error('Could not load countries'); }), []);
  useEffect(() => { load(); }, [load]);

  const filters: Record<string, (c: Country) => boolean> = { all: () => true, rep: c => !!c.rep, norep: c => !c.rep };
  const shown = (rows ?? []).filter(filters[tab]).filter(c => !q.trim() || `${c.name} ${c.code} ${c.currency}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => b.students - a.students || a.name.localeCompare(b.name));
  const students = (rows ?? []).reduce((n, c) => n + c.students, 0);
  const top = [...(rows ?? [])].sort((a, b) => b.students - a.students).slice(0, 2).filter(c => c.students);
  const revenue = Object.entries((rows ?? []).flatMap(c => c.revenueThisMonth).reduce((m, x) => ({ ...m, [x.currency]: (m[x.currency] ?? 0) + x.amount }), {} as Record<string, number>)).sort((a, b) => b[1] - a[1]);

  return (
    <>
      <RepTable title="Countries" subtitle="Where we sell, in which currency, and who represents us"
        actions={<Button size="sm" onClick={() => setAdding(true)}>Add country</Button>}
        stats={[
          { l: 'Countries', v: rows ? String(rows.length) : '—', sub: 'we sell in' },
          { l: 'With a rep', v: rows ? String(rows.filter(c => c.rep).length) : '—', sub: rows ? `${rows.filter(c => !c.rep).length} without` : '' },
          { l: 'Students', v: rows ? students.toLocaleString('en-GB') : '—', sub: students ? top.map(c => `${c.name} ${Math.round((c.students / students) * 100)}%`).join(', ') : '' },
          { l: 'Revenue this month', v: revenue[0] ? money(revenue[0][1], revenue[0][0]) : '—', sub: revenue.slice(1, 3).map(([c, a]) => `+ ${money(a, c)}`).join(' · ') || 'all countries' },
        ]}
        tabs={[{ key: 'all', label: 'All', count: rows?.length ?? 0 }, { key: 'rep', label: 'With a rep', count: rows?.filter(filters.rep).length ?? 0 }, { key: 'norep', label: 'No rep', count: rows?.filter(filters.norep).length ?? 0 }]}
        tab={tab} onTab={setTab} search={q} onSearch={setQ} searchLabel="Search countries"
        cols={['Country', 'Education system', 'Rep', 'Rep terms', 'Students', 'This month', '']}
        loading={!rows} empty={rows && !shown.length ? 'Nothing matches.' : null}
        note="Reps earn their commission on sales to students in their country, plus the per-student bonus each month. Education systems are set in Taxonomy.">
        {shown.map(c => (
          <tr key={c.id} className="cursor-pointer hover:bg-subtle" onClick={() => setOpen(c)}>
            <td className={td}><strong className="text-navy">{c.name}</strong><br /><span className="text-[12.5px] text-muted">{c.code} · {c.currency}</span></td>
            <td className={clsx(td, 'text-ink2')}>{c.educationSystem?.name ?? '—'}</td>
            <td className={td}>{c.rep ? <span className="text-navy">{c.rep.name}</span> : <span className="inline-flex rounded border border-dashed border-azure px-2 py-0.5 text-[12.5px] font-semibold text-azure-strong">Assign a rep</span>}</td>
            <td className={clsx(td, 'text-ink2')}>{terms(c)}</td>
            <td className={clsx(td, 'text-ink2')}>{c.students.toLocaleString('en-GB')}</td>
            <td className={clsx(td, 'text-ink2')}>{c.revenueThisMonth.length ? c.revenueThisMonth.map(x => money(x.amount, x.currency)).join(' + ') : '—'}</td>
            <td className={clsx(td, 'text-right font-semibold text-azure-strong')}>Edit</td>
          </tr>
        ))}
      </RepTable>
      <Edit country={open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load(); }} />
      <AddCountry open={adding} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />
    </>
  );
}

function Edit({ country, onClose, onSaved }: { country: Country | null; onClose: () => void; onSaved: () => void }) {
  const [pct, setPct] = useState(''), [bonus, setBonus] = useState('');
  const [rep, setRep] = useState<{ id: string; email: string } | null>(null);
  const [find, setFind] = useState(''), [hits, setHits] = useState<{ id: string; email: string; role: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!country) return;
    setPct(country.repCommissionPercent != null ? String(country.repCommissionPercent) : '');
    setBonus(country.perStudentBonus ? String(minorToMajor(country.perStudentBonus, country.currency)) : '');
    setRep(null); setFind(''); setHits([]);
  }, [country]);
  function search(v: string) {
    setFind(v); setRep(null);
    if (timer.current) clearTimeout(timer.current);
    if (v.trim().length < 2) { setHits([]); return; }
    timer.current = setTimeout(() => api.get('/portals/admin/users/search', { params: { email: v.trim() } }).then(r => setHits(r.data ?? [])).catch(() => setHits([])), 250);
  }
  async function save() {
    if (!country) return;
    const p = pct.trim() === '' ? undefined : Number(pct), b = bonus.trim() === '' ? undefined : Number(bonus);
    if ((p !== undefined && (!Number.isFinite(p) || p < 0 || p > 100)) || (b !== undefined && (!Number.isFinite(b) || b < 0))) { notify.error('Check the commission and bonus'); return; }
    if (rep && country.rep && rep.id !== country.rep.id && !confirm(`${rep.email} will replace ${country.rep.name} as rep for ${country.name}.`)) return;
    setSaving(true);
    try {
      await api.patch(`/countries/admin/countries/${country.id}`, {
        ...(p !== undefined ? { repCommissionPercent: p } : {}), ...(b !== undefined ? { perStudentBonus: majorToMinor(b, country.currency) } : {}),
        ...(rep ? { repId: rep.id } : {}),
      });
      notify.success(`${country.name} saved`); onSaved();
    } catch (e: any) { notify.error([].concat(e?.response?.data?.message ?? 'Could not save').join(', ')); }
    finally { setSaving(false); }
  }
  return (
    <Drawer open={!!country} onOpenChange={o => !o && onClose()}>
      <DrawerContent title={country?.name ?? 'Country'} description={country ? `${country.code} · ${country.currency} · ${country.students} students` : ' '}
        footer={<><Button size="sm" onClick={save} loading={saving}>Save</Button><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button></>}>
        {country && <>
          <DrawerSection title="Rep">
            <p className="mb-2 text-[13px] text-ink2">{country.rep ? <>Now: <strong className="text-navy">{country.rep.name}</strong> ({country.rep.email})</> : 'No rep yet.'}</p>
            <input value={rep?.email ?? find} onChange={e => search(e.target.value)} placeholder={country.rep ? 'Search to replace them' : 'Search by email'} className="input-base w-full" />
            {!rep && hits.length > 0 && (
              <div className="mt-1 max-h-48 overflow-y-auto rounded-md border border-line">
                {hits.map(h => <button key={h.id} onClick={() => { setRep(h); setHits([]); }} className="flex w-full justify-between gap-2 px-3 py-2 text-left text-[13px] text-navy hover:bg-subtle"><span className="truncate">{h.email}</span><span className="text-muted">{h.role.toLowerCase().replace('_', ' ')}</span></button>)}
              </div>
            )}
            <p className="mt-1.5 text-[12.5px] text-muted">They become a country rep for {country.name}, paid in {country.currency}, and get an email.</p>
          </DrawerSection>
          <DrawerSection title="Rep terms">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Commission on sales (%)</span><input inputMode="decimal" value={pct} onChange={e => setPct(e.target.value)} placeholder="e.g. 10" className="input-base" /></label>
              <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Bonus a student ({country.currency})</span><input inputMode="decimal" value={bonus} onChange={e => setBonus(e.target.value)} placeholder="e.g. 20" className="input-base" /></label>
            </div>
            <p className="mt-1.5 text-[12.5px] text-muted">The bonus is paid each month for every student in {country.name} with an active package. Changes apply from the next sale and the next month.</p>
          </DrawerSection>
          <DrawerSection title="Education system">
            <p className="text-[13px] text-ink2">{country.educationSystem?.name ?? 'Not set'} · <Link href="/admin/courses/taxonomy" className="font-semibold text-azure-strong hover:underline">Change in Taxonomy</Link></p>
          </DrawerSection>
        </>}
      </DrawerContent>
    </Drawer>
  );
}

function AddCountry({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(''), [code, setCode] = useState(''), [currency, setCurrency] = useState('');
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      await api.post('/countries/admin/countries', { name: name.trim(), code: code.trim().toUpperCase(), currency: currency.trim().toUpperCase() });
      notify.success(`${name.trim()} added`); setName(''); setCode(''); setCurrency(''); onDone();
    } catch (e: any) { notify.error([].concat(e?.response?.data?.message ?? 'Could not add it').join(', ')); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent title="Add country" description="Students there see prices in its currency.">
        <div className="grid grid-cols-[1fr_90px_100px] gap-3">
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Name</span><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Nigeria" className="input-base" /></label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Code</span><input value={code} onChange={e => setCode(e.target.value)} maxLength={2} placeholder="NG" className="input-base uppercase" /></label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Currency</span><input value={currency} onChange={e => setCurrency(e.target.value)} maxLength={4} placeholder="NGN" className="input-base uppercase" /></label>
        </div>
        <DialogFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} loading={saving} disabled={!name.trim() || code.trim().length !== 2 || currency.trim().length < 3}>Add country</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
