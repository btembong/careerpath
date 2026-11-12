'use client';
import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { RepTable, td } from '@/components/rep/RepTable';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Cohort {
  id: string; name: string; sitting: string | null; teacher: string; students: number; packages: number;
  perHour: number | null; share: number | null; taught: number; mins: number; missed: number; upcoming: number;
  earned: number; classPay: number; sharePay: number;
}
interface Data { perHour: number; share: number; currency: string; cohorts: Cohort[] }

const fcfa = (c: string) => (c === 'XAF' || c === 'XOF' ? 'FCFA' : c);
const amt = (minor: number, c: string) => `${fcfa(c)} ${minorToMajor(minor, c).toLocaleString('en-GB')}`;
const hours = (mins: number) => (mins >= 60 ? `${Math.floor(mins / 60)} h${mins % 60 ? ` ${mins % 60}` : ''}` : `${mins} min`);

/**
 * Commissions → Cohorts: what a cohort's teacher earns, a fee per hour of live class taught and a share of
 * every package sale that puts a student in the class. Defaults, or a cohort's own rates.
 */
export function CohortRates({ switcher }: { switcher: React.ReactNode }) {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Cohort | 'default' | null>(null);

  const load = useCallback(() => api.get('/admin/cohort-pay').then(r => setD(r.data)).catch(() => notify.error('Could not load cohorts')), []);
  useEffect(() => { load(); }, [load]);

  const c = d?.currency ?? 'XAF';
  const filters: Record<string, (x: Cohort) => boolean> = { all: () => true, active: x => x.taught + x.upcoming > 0, own: x => x.perHour != null || x.share != null };
  const rows = (d?.cohorts ?? []).filter(filters[tab]).filter(x => !q.trim() || `${x.name} ${x.teacher}`.toLowerCase().includes(q.trim().toLowerCase()));
  const sum = (f: (x: Cohort) => number) => (d?.cohorts ?? []).reduce((n, x) => n + f(x), 0);

  return (
    <>
      <RepTable title="Commissions" subtitle="What cohort teachers earn for live classes and for filling their class"
        actions={<div className="flex gap-2">{switcher}<Button size="sm" variant="secondary" onClick={() => setEditing('default')}>Change defaults</Button></div>}
        stats={[
          { l: 'Default fee', v: d ? amt(d.perHour, c) : '—', sub: 'per class hour taught' },
          { l: 'Default cohort share', v: d ? `${d.share}%` : '—', sub: 'of linked package sales' },
          { l: 'Classes taught', v: d ? String(sum(x => x.taught)) : '—', sub: d ? `${hours(sum(x => x.mins))} this month` : '' },
          { l: 'Paid to cohort teachers', v: d ? amt(sum(x => x.earned), c) : '—', sub: 'this month' },
        ]}
        tabs={[
          { key: 'all', label: 'All', count: d?.cohorts.length ?? 0 },
          { key: 'active', label: 'Teaching this month', count: d?.cohorts.filter(filters.active).length ?? 0 },
          { key: 'own', label: 'Own rates', count: d?.cohorts.filter(filters.own).length ?? 0 },
        ]}
        tab={tab} onTab={setTab} search={q} onSearch={setQ} searchLabel="Search cohorts or teachers"
        cols={['Cohort', 'Per class hour', 'Cohort share', 'Classes this month', 'Earned this month', '']}
        loading={!d} empty={d && !rows.length ? (q ? 'Nothing matches.' : 'No cohorts yet.') : null}
        note="A class is paid once its teacher was in it for 5 minutes or more, for the time they were there (up to the scheduled length plus 30 minutes), checked within the hour after it ends. The cohort share is paid when a package linked to the cohort is bought; the rest of the sale is split across the package’s courses.">
        {rows.map(x => (
          <tr key={x.id} className="hover:bg-subtle">
            <td className={td}><strong className="text-navy">{x.name}</strong><br /><span className="text-[12.5px] text-muted">{[x.teacher, `${x.students} student${x.students === 1 ? '' : 's'}`, x.packages ? `${x.packages} package${x.packages === 1 ? '' : 's'}` : 'no package linked'].join(' · ')}</span></td>
            <td className={clsx(td, 'whitespace-nowrap text-navy')}>{amt(x.perHour ?? d!.perHour, c)}<br /><span className="text-[12.5px] text-muted">{x.perHour != null ? 'own rate' : 'default'}</span></td>
            <td className={clsx(td, 'whitespace-nowrap text-navy')}>{x.share ?? d!.share}%<br /><span className="text-[12.5px] text-muted">{x.share != null ? 'own share' : 'default'}</span></td>
            <td className={clsx(td, 'text-navy')}>{x.taught ? `${x.taught} · ${hours(x.mins)}` : '—'}<br /><span className="text-[12.5px] text-muted">{[x.upcoming && `${x.upcoming} to come`, x.missed && `${x.missed} missed`].filter(Boolean).join(' · ') || ' '}</span></td>
            <td className={clsx(td, 'whitespace-nowrap')}><strong className="text-navy">{amt(x.earned, c)}</strong><br /><span className="text-[12.5px] text-muted">{amt(x.classPay, c)} classes · {amt(x.sharePay, c)} share</span></td>
            <td className={clsx(td, 'text-right')}><button onClick={() => setEditing(x)} className="whitespace-nowrap font-semibold text-azure-strong hover:underline">Change rates</button></td>
          </tr>
        ))}
      </RepTable>
      <RatesDialog target={editing} data={d} onClose={() => setEditing(null)} onSaved={next => { setD(next); setEditing(null); }} />
    </>
  );
}

function RatesDialog({ target, data, onClose, onSaved }: { target: Cohort | 'default' | null; data: Data | null; onClose: () => void; onSaved: (d: Data) => void }) {
  const [fee, setFee] = useState('');
  const [share, setShare] = useState('');
  const [saving, setSaving] = useState(false);
  const c = data?.currency ?? 'XAF';
  const isDefault = target === 'default';
  const cohort = isDefault ? null : (target as Cohort | null);
  useEffect(() => {
    if (!target || !data) return;
    const f = isDefault ? data.perHour : cohort?.perHour;
    const s = isDefault ? data.share : cohort?.share;
    setFee(f != null ? String(minorToMajor(f, c)) : '');
    setShare(s != null ? String(s) : '');
  }, [target, data, isDefault, cohort, c]);

  async function save(useDefaults = false) {
    setSaving(true);
    try {
      const n = (v: string) => (v.trim() === '' ? null : Number(v.replace(/[,\s%]/g, '')));
      const body = isDefault
        ? { perHour: n(fee) ?? data!.perHour, share: n(share) ?? data!.share }
        : { cohortId: cohort!.id, cohortPerHour: useDefaults ? null : n(fee), cohortShare: useDefaults ? null : n(share) };
      onSaved((await api.put('/admin/cohort-pay', body)).data);
      notify.success('Saved');
    } catch (e: any) { notify.error([].concat(e?.response?.data?.message ?? 'Could not save').join(', ')); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open={!!target} onOpenChange={o => !o && onClose()}>
      <DialogContent title={isDefault ? 'Default cohort rates' : `${cohort?.name ?? ''}`}
        description={isDefault ? 'What cohort teachers earn unless their cohort has its own rates.' : `Taught by ${cohort?.teacher ?? ''}. Leave a box empty to use the default (${data ? `${amt(data.perHour, c)} an hour, ${data.share}%` : ''}).`}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">{fcfa(c)} per class hour taught</span>
            <input inputMode="decimal" value={fee} onChange={e => setFee(e.target.value)} placeholder={isDefault ? 'e.g. 5000' : 'default'} className="input-base" autoFocus /></label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Cohort share of linked package sales (%)</span>
            <input inputMode="decimal" value={share} onChange={e => setShare(e.target.value)} placeholder={isDefault ? 'e.g. 20' : 'default'} className="input-base" /></label>
          <p className="text-[12.5px] text-muted">Classes and sales from now on use these. Classes already paid keep what they were paid.</p>
        </div>
        <DialogFooter>
          {!isDefault && (cohort?.perHour != null || cohort?.share != null) && <Button variant="secondary" size="sm" onClick={() => save(true)} loading={saving}>Use the defaults</Button>}
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => save()} loading={saving}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
