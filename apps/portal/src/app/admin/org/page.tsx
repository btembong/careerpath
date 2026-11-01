'use client';
import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { RepTable, td } from '@/components/rep/RepTable';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, Drawer, DrawerContent, DrawerSection } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import { money } from '@/lib/money';
import api from '@/lib/api';

interface Org { id: string; organizationName: string; contactEmail: string; packageId: string; seatsPurchased: number; purchasedAt: string; seats: { claimedAt: string | null }[]; package: { id: string; name: string } | null }
interface Pkg { id: string; name: string; priceAmount: number; currency: string; isPublished?: boolean }

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const emailsIn = (text: string) => [...new Set(text.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)))];

export default function AdminOrgPage() {
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Org | null>(null);

  const load = useCallback(() => {
    api.get('/org/admin/org-enrollments').then(r => setOrgs(r.data ?? [])).catch(() => { setOrgs([]); notify.error('Could not load organisations'); });
  }, []);
  useEffect(() => { load(); api.get('/admin/packages').then(r => setPkgs(r.data ?? [])).catch(() => {}); }, [load]);

  const used = (o: Org) => o.seats.filter(s => s.claimedAt).length;
  const filters: Record<string, (o: Org) => boolean> = { all: () => true, free: o => used(o) < o.seats.length, full: o => o.seats.length > 0 && used(o) >= o.seats.length };
  const rows = (orgs ?? []).filter(filters[tab]).filter(o => !q.trim() || `${o.organizationName} ${o.contactEmail}`.toLowerCase().includes(q.trim().toLowerCase()));
  const seats = (orgs ?? []).reduce((n, o) => n + o.seats.length, 0), claimed = (orgs ?? []).reduce((n, o) => n + used(o), 0);
  const termStart = new Date(Date.now() - 120 * 86_400_000);
  const pkgOf = (id: string) => pkgs.find(p => p.id === id);

  return (
    <>
      <RepTable title="Organisations" subtitle="Schools and companies that buy seats for their students"
        actions={<Button size="sm" onClick={() => setAdding(true)}>Add organisation</Button>}
        stats={[
          { l: 'Organisations', v: orgs ? String(orgs.length) : '—', sub: orgs ? `${orgs.filter(o => new Date(o.purchasedAt) > termStart).length} added in the last 4 months` : '' },
          { l: 'Seats bought', v: orgs ? String(seats) : '—', sub: 'across all packages' },
          { l: 'Seats in use', v: orgs ? String(claimed) : '—', sub: seats ? `${Math.round((claimed / seats) * 100)}% claimed` : '' },
          { l: 'Invites waiting', v: orgs ? String(seats - claimed) : '—', sub: 'not claimed yet' },
        ]}
        tabs={[{ key: 'all', label: 'All', count: orgs?.length ?? 0 }, { key: 'free', label: 'Seats free', count: orgs?.filter(filters.free).length ?? 0 }, { key: 'full', label: 'Full', count: orgs?.filter(filters.full).length ?? 0 }]}
        tab={tab} onTab={setTab} search={q} onSearch={setQ} searchLabel="Search organisations"
        cols={['Organisation', 'Package', 'Seats', 'Bought', 'Status', '']}
        loading={!orgs} empty={orgs && !rows.length ? (orgs.length ? 'Nothing matches.' : 'No organisations yet.') : null}
        note="Each seat is an invite to one email. The student signs up with that email and opens the invitation link (on the Seats panel) to get the package.">
        {rows.map(o => {
          const p = pkgOf(o.packageId), u = used(o), free = o.seats.length - u;
          return (
            <tr key={o.id} className="cursor-pointer hover:bg-subtle" onClick={() => setOpen(o)}>
              <td className={td}><strong className="text-navy">{o.organizationName}</strong><br /><span className="text-[12.5px] text-muted">{o.contactEmail}</span></td>
              <td className={clsx(td, 'text-navy')}>{o.package?.name ?? 'Package removed'}{p && <><br /><span className="text-[12.5px] text-muted">{money(p.priceAmount, p.currency)} a seat</span></>}</td>
              <td className={clsx(td, 'w-44')}>
                <span className="block h-1.5 rounded-[3px] bg-subtle"><span className="block h-1.5 rounded-[3px] bg-azure" style={{ width: `${o.seats.length ? Math.round((u / o.seats.length) * 100) : 0}%` }} /></span>
                <span className="text-[12px] text-muted">{u} of {o.seats.length} used</span>
              </td>
              <td className={clsx(td, 'text-ink2')}>{date(o.purchasedAt)}</td>
              <td className={td}><span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-[12px] font-semibold', free ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>{free ? `${free} invite${free === 1 ? '' : 's'} waiting` : 'Full'}</span></td>
              <td className={clsx(td, 'text-right font-semibold text-azure-strong')}>{free ? 'Seats' : 'Add seats'}</td>
            </tr>
          );
        })}
      </RepTable>
      <NewOrg open={adding} pkgs={pkgs.filter(p => p.isPublished !== false)} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />
      <Seats org={open} onClose={() => setOpen(null)} onChanged={load} />
    </>
  );
}

function NewOrg({ open, pkgs, onClose, onDone }: { open: boolean; pkgs: Pkg[]; onClose: () => void; onDone: () => void }) {
  const [name, setName] = useState(''), [contact, setContact] = useState(''), [pkg, setPkg] = useState(''), [emails, setEmails] = useState('');
  const [saving, setSaving] = useState(false);
  const list = emailsIn(emails);
  async function save() {
    setSaving(true);
    try {
      await api.post('/org/admin/org-enrollments', { organizationName: name.trim(), contactEmail: contact.trim(), packageId: pkg, inviteEmails: list });
      notify.success(`${name.trim()} added with ${list.length} seat${list.length === 1 ? '' : 's'}`);
      setName(''); setContact(''); setPkg(''); setEmails(''); onDone();
    } catch (e: any) { notify.error([].concat(e?.response?.data?.message ?? 'Could not add it').join(', ')); }
    finally { setSaving(false); }
  }
  const p = pkgs.find(x => x.id === pkg);
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent title="Add organisation" description="A school or company paying for seats. Each email gets one seat.">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Name</span><input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Achimota School" className="input-base" /></label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Contact email</span><input type="email" value={contact} onChange={e => setContact(e.target.value)} placeholder="head of department or bursar" className="input-base" /></label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Package</span>
            <select value={pkg} onChange={e => setPkg(e.target.value)} className="input-base"><option value="">Choose a package</option>{pkgs.map(x => <option key={x.id} value={x.id}>{x.name} · {money(x.priceAmount, x.currency)}</option>)}</select></label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Student emails</span>
            <textarea value={emails} onChange={e => setEmails(e.target.value)} rows={5} placeholder="Paste emails, one per line or separated by commas" className="input-base min-h-[110px] py-2" /></label>
          <p className="text-[12.5px] text-muted">{list.length} seat{list.length === 1 ? '' : 's'}{p ? ` · ${money(p.priceAmount * list.length, p.currency)} at the list price` : ''}</p>
        </div>
        <DialogFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} loading={saving} disabled={!name.trim() || !contact.trim() || !pkg || !list.length}>Add organisation</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Seats({ org, onClose, onChanged }: { org: Org | null; onClose: () => void; onChanged: () => void }) {
  const [seats, setSeats] = useState<{ id: string; inviteEmail: string; claimedAt: string | null }[] | null>(null);
  const [more, setMore] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback((id: string) => api.get(`/org/admin/org-enrollments/${id}`).then(r => setSeats(r.data.seats ?? [])).catch(() => notify.error('Could not load seats')), []);
  useEffect(() => { setSeats(null); setMore(''); if (org) load(org.id); }, [org, load]);
  const link = typeof window !== 'undefined' ? `${window.location.origin}/student/org-invite` : '/student/org-invite';
  async function add() {
    if (!org) return;
    setSaving(true);
    try {
      const r = await api.post(`/org/admin/org-enrollments/${org.id}/seats`, { emails: emailsIn(more) });
      notify.success(r.data.added ? `${r.data.added} seat${r.data.added === 1 ? '' : 's'} added` : 'Those emails already have seats');
      setMore(''); load(org.id); onChanged();
    } catch { notify.error('Could not add seats'); }
    finally { setSaving(false); }
  }
  return (
    <Drawer open={!!org} onOpenChange={o => !o && onClose()}>
      <DrawerContent title={org?.organizationName ?? 'Seats'} description={org ? `${org.package?.name ?? ''} · contact ${org.contactEmail}` : ' '}>
        <DrawerSection title="Invitation link">
          <div className="flex gap-2">
            <input readOnly value={link} onFocus={e => e.currentTarget.select()} aria-label="Invitation link" className="input-base h-9 flex-1 bg-subtle" />
            <button onClick={() => navigator.clipboard.writeText(link).then(() => notify.success('Link copied')).catch(() => {})} className="inline-flex h-9 items-center rounded-md border border-line px-3 text-[13px] font-semibold text-navy hover:bg-subtle">Copy</button>
          </div>
          <p className="mt-1.5 text-[12.5px] text-muted">Send it to the organisation. Each student signs up with their invited email, then opens the link.</p>
        </DrawerSection>
        <DrawerSection title="Seats" count={seats?.length}>
          {!seats ? <div className="h-24 animate-pulse rounded bg-subtle" /> : <div className="flex flex-col gap-1.5">{seats.map(s => (
            <p key={s.id} className="flex justify-between gap-3 text-[13px] text-navy"><span className="min-w-0 truncate">{s.inviteEmail}</span><span className={clsx('shrink-0', s.claimedAt ? 'text-muted' : 'text-azure-strong')}>{s.claimedAt ? `joined ${date(s.claimedAt)}` : 'invite waiting'}</span></p>
          ))}</div>}
        </DrawerSection>
        <DrawerSection title="Add seats">
          <textarea value={more} onChange={e => setMore(e.target.value)} rows={3} placeholder="More emails" className="input-base min-h-[80px] w-full py-2" />
          <div className="mt-2 flex items-center justify-between"><span className="text-[12.5px] text-muted">{emailsIn(more).length} new</span><Button size="sm" onClick={add} loading={saving} disabled={!emailsIn(more).length}>Add seats</Button></div>
        </DrawerSection>
      </DrawerContent>
    </Drawer>
  );
}
