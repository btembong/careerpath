'use client';
import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { RepTable, td } from '@/components/rep/RepTable';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Mentor { id: string; name: string; email: string; listed: boolean; rate: number | null; held: number; cancelled: number; missed: number; upcoming: number; earned: number }
interface Data { per30: number; currency: string; mentors: Mentor[] }

const fcfa = (c: string) => (c === 'XAF' || c === 'XOF' ? 'FCFA' : c);
const amt = (minor: number, c: string) => `${fcfa(c)} ${minorToMajor(minor, c).toLocaleString('en-GB')}`;

/**
 * Commissions → Mentors: what mentors earn per session (a default per 30 minutes, or their own rate), and
 * how each did this month. Sessions are paid automatically once the mentor was in the room.
 */
export function MentorRates({ switcher }: { switcher: React.ReactNode }) {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState<Mentor | 'default' | null>(null);

  const load = useCallback(() => api.get('/admin/mentor-pay').then(r => setD(r.data)).catch(() => notify.error('Could not load mentors')), []);
  useEffect(() => { load(); }, [load]);

  const c = d?.currency ?? 'XAF';
  const filters: Record<string, (m: Mentor) => boolean> = { all: () => true, custom: m => m.rate != null, active: m => m.held + m.upcoming > 0 };
  const rows = (d?.mentors ?? []).filter(filters[tab]).filter(m => !q.trim() || `${m.name} ${m.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  const sum = (f: (m: Mentor) => number) => (d?.mentors ?? []).reduce((n, m) => n + f(m), 0);

  return (
    <>
      <RepTable title="Commissions" subtitle="What mentors earn for each 1-to-1 session that takes place"
        actions={<div className="flex gap-2">{switcher}<Button size="sm" variant="secondary" onClick={() => setEditing('default')}>Default fee</Button></div>}
        stats={[
          { l: 'Default fee', v: d ? amt(d.per30, c) : '—', sub: 'per 30 minutes of session' },
          { l: 'Mentors', v: d ? String(d.mentors.length) : '—', sub: d ? `${d.mentors.filter(m => m.listed).length} listed for students` : '' },
          { l: 'Sessions held', v: d ? String(sum(m => m.held)) : '—', sub: 'this month' },
          { l: 'Paid to mentors', v: d ? amt(sum(m => m.earned), c) : '—', sub: 'this month' },
        ]}
        tabs={[
          { key: 'all', label: 'All', count: d?.mentors.length ?? 0 },
          { key: 'active', label: 'Booked this month', count: d?.mentors.filter(filters.active).length ?? 0 },
          { key: 'custom', label: 'Own rate', count: d?.mentors.filter(filters.custom).length ?? 0 },
        ]}
        tab={tab} onTab={setTab} search={q} onSearch={setQ} searchLabel="Search mentors"
        cols={['Mentor', 'Rate', 'Held', 'Not paid', 'Earned this month', '']}
        loading={!d} empty={d && !rows.length ? (q ? 'Nothing matches.' : 'No mentors yet. Teachers with an intro video can be booked.') : null}
        note="A session is paid once the mentor was in the room for 5 minutes or more, checked within the hour after it ends. Cancelled sessions, and sessions the mentor missed, aren’t paid. A 60-minute session pays twice the 30-minute fee.">
        {rows.map(m => (
          <tr key={m.id} className="hover:bg-subtle">
            <td className={td}><strong className="text-navy">{m.name}</strong><br /><span className="text-[12.5px] text-muted">{m.listed ? 'Listed for students' : 'No intro video yet, so not listed'}</span></td>
            <td className={clsx(td, 'whitespace-nowrap text-navy')}>{amt(m.rate ?? d!.per30, c)} <span className="text-[12.5px] text-muted">/ 30 min</span><br /><span className="text-[12.5px] text-muted">{m.rate != null ? 'own rate' : 'default'}</span></td>
            <td className={clsx(td, 'text-navy')}>{m.held}{m.upcoming ? <><br /><span className="text-[12.5px] text-muted">{m.upcoming} to come</span></> : null}</td>
            <td className={clsx(td, 'text-ink2')}>{m.cancelled + m.missed === 0 ? '—' : [m.cancelled && `${m.cancelled} cancelled`, m.missed && `${m.missed} missed`].filter(Boolean).join(' · ')}</td>
            <td className={clsx(td, 'whitespace-nowrap font-bold text-navy')}>{amt(m.earned, c)}</td>
            <td className={clsx(td, 'text-right')}><button onClick={() => setEditing(m)} className="font-semibold text-azure-strong hover:underline">Change rate</button></td>
          </tr>
        ))}
      </RepTable>
      <RateDialog target={editing} data={d} onClose={() => setEditing(null)} onSaved={next => { setD(next); setEditing(null); }} />
    </>
  );
}

function RateDialog({ target, data, onClose, onSaved }: { target: Mentor | 'default' | null; data: Data | null; onClose: () => void; onSaved: (d: Data) => void }) {
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const c = data?.currency ?? 'XAF';
  const isDefault = target === 'default';
  useEffect(() => {
    if (!target || !data) return;
    const minor = isDefault ? data.per30 : (target as Mentor).rate;
    setValue(minor != null ? String(minorToMajor(minor, c)) : '');
  }, [target, data, isDefault, c]);

  async function save(rate: number | null) {
    setSaving(true);
    try {
      const body = isDefault ? { per30: rate } : { mentorId: (target as Mentor).id, rate };
      onSaved((await api.put('/admin/mentor-pay', body)).data);
      notify.success('Saved');
    } catch (e: any) { notify.error([].concat(e?.response?.data?.message ?? 'Could not save').join(', ')); }
    finally { setSaving(false); }
  }
  const n = Number(value.replace(/[,\s]/g, ''));
  return (
    <Dialog open={!!target} onOpenChange={o => !o && onClose()}>
      <DialogContent title={isDefault ? 'Default mentor fee' : `${(target as Mentor | null)?.name ?? ''}’s rate`}
        description={isDefault ? 'What mentors without their own rate earn per 30 minutes of a session that takes place.' : `Leave it on the default (${data ? amt(data.per30, c) : ''} per 30 minutes), or set a rate for this mentor.`}>
        <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">{fcfa(c)} per 30 minutes</span>
          <input inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} placeholder="e.g. 2000" className="input-base" autoFocus /></label>
        <p className="mt-2 text-[12.5px] text-muted">Applies to sessions settled from now on. A 60-minute session pays twice this.</p>
        <DialogFooter>
          {!isDefault && (target as Mentor | null)?.rate != null && <Button variant="secondary" size="sm" onClick={() => save(null)} loading={saving}>Use the default</Button>}
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={() => save(n)} loading={saving} disabled={!(n >= 0) || value.trim() === ''}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
