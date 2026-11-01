'use client';
import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { majorToMinor } from '@cpa/shared';
import { RepTable, td } from '@/components/rep/RepTable';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, Drawer, DrawerContent, DrawerSection } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import { money } from '@/lib/money';
import api from '@/lib/api';

interface OrgPkg { enrollmentId: string; packageId: string; name: string; seats: number; invited: number; joined: number; pricePerSeat: number | null; currency: string | null; purchasedAt: string }
interface Org { id: string; name: string; contactEmail: string; joinCode: string; joinEnabled: boolean; emailDomain: string | null; createdAt: string; country: string | null; admins: { id: string; name: string; email: string }[]; packages: OrgPkg[] }
interface Pkg { id: string; name: string; priceAmount: number; currency: string; isPublished?: boolean }

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const total = (o: Org, k: 'seats' | 'invited' | 'joined') => o.packages.reduce((n, p) => n + p[k], 0);

export default function AdminOrgPage() {
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [countries, setCountries] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<Org | null>(null);

  const load = useCallback(() => api.get('/org/admin/organisations').then(r => { setOrgs(r.data); setOpen(o => o && r.data.find((x: Org) => x.id === o.id) || null); }).catch(() => { setOrgs([]); notify.error('Could not load organisations'); }), []);
  useEffect(() => {
    load();
    api.get('/admin/packages').then(r => setPkgs((r.data ?? []).filter((p: Pkg) => p.isPublished !== false))).catch(() => {});
    api.get('/countries/admin/countries').then(r => setCountries(r.data ?? [])).catch(() => {});
  }, [load]);

  const free = (o: Org) => total(o, 'seats') - total(o, 'invited') - total(o, 'joined');
  const filters: Record<string, (o: Org) => boolean> = { all: () => true, free: o => free(o) > 0, full: o => o.packages.length > 0 && free(o) <= 0 };
  const rows = (orgs ?? []).filter(filters[tab]).filter(o => !q.trim() || `${o.name} ${o.contactEmail} ${o.admins.map(a => a.email).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()));
  const sum = (k: 'seats' | 'invited' | 'joined') => (orgs ?? []).reduce((n, o) => n + total(o, k), 0);
  const termStart = Date.now() - 120 * 86_400_000;

  return (
    <>
      <RepTable title="Organisations" subtitle="Schools and companies that buy seats for their students"
        actions={<Button size="sm" onClick={() => setAdding(true)}>Add organisation</Button>}
        stats={[
          { l: 'Organisations', v: orgs ? String(orgs.length) : '—', sub: orgs ? `${orgs.filter(o => +new Date(o.createdAt) > termStart).length} added in the last 4 months` : '' },
          { l: 'Seats bought', v: orgs ? String(sum('seats')) : '—', sub: 'across all packages' },
          { l: 'Seats in use', v: orgs ? String(sum('joined')) : '—', sub: sum('seats') ? `${Math.round((sum('joined') / sum('seats')) * 100)}% joined` : '' },
          { l: 'Invites waiting', v: orgs ? String(sum('invited')) : '—', sub: 'not accepted yet' },
        ]}
        tabs={[{ key: 'all', label: 'All', count: orgs?.length ?? 0 }, { key: 'free', label: 'Seats free', count: orgs?.filter(filters.free).length ?? 0 }, { key: 'full', label: 'Full', count: orgs?.filter(filters.full).length ?? 0 }]}
        tab={tab} onTab={setTab} search={q} onSearch={setQ} searchLabel="Search organisations"
        cols={['Organisation', 'Packages', 'Seats', 'School admin', 'Status', '']}
        loading={!orgs} empty={orgs && !rows.length ? (orgs.length ? 'Nothing matches.' : 'No organisations yet.') : null}
        note="Each school’s admin invites their own students by email or with a join link, and sees their progress in the school portal. Seats are invoiced outside the portal and recorded here.">
        {rows.map(o => {
          const s = total(o, 'seats'), j = total(o, 'joined'), i = total(o, 'invited'), f = free(o);
          return (
            <tr key={o.id} className="cursor-pointer hover:bg-subtle" onClick={() => setOpen(o)}>
              <td className={td}><strong className="text-navy">{o.name}</strong><br /><span className="text-[12.5px] text-muted">{[o.country, `since ${date(o.createdAt)}`].filter(Boolean).join(' · ')}</span></td>
              <td className={clsx(td, 'text-navy')}>{o.packages.map(p => p.name).join(', ') || '—'}{o.packages[0]?.pricePerSeat != null && <><br /><span className="text-[12.5px] text-muted">{money(o.packages[0].pricePerSeat, o.packages[0].currency ?? 'GHS')} a seat</span></>}</td>
              <td className={clsx(td, 'w-44')}>
                <span className="block h-1.5 rounded-[3px] bg-subtle"><span className="block h-1.5 rounded-[3px] bg-azure" style={{ width: `${s ? Math.round(((j + i) / s) * 100) : 0}%` }} /></span>
                <span className="text-[12px] text-muted">{j} joined · {i} invited · {s} bought</span>
              </td>
              <td className={clsx(td, 'text-ink2')}>{o.admins[0] ? <>{o.admins[0].name}<br /><span className="text-[12.5px] text-muted">{o.admins[0].email}</span></> : <span className="text-muted">no admin</span>}</td>
              <td className={td}><span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-[12px] font-semibold', f > 0 ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>{f > 0 ? `${f} seat${f === 1 ? '' : 's'} free` : 'Full'}</span></td>
              <td className={clsx(td, 'text-right font-semibold text-azure-strong')}>{f > 0 ? 'Open' : 'Add seats'}</td>
            </tr>
          );
        })}
      </RepTable>
      <NewSchool open={adding} pkgs={pkgs} countries={countries} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />
      <OrgDrawer org={open} pkgs={pkgs} onClose={() => setOpen(null)} onChanged={load} />
    </>
  );
}

function NewSchool({ open, pkgs, countries, onClose, onDone }: { open: boolean; pkgs: Pkg[]; countries: { id: string; name: string }[]; onClose: () => void; onDone: () => void }) {
  const blank = { name: '', countryId: '', adminName: '', adminEmail: '', packageId: '', seats: '', price: '', domain: '' };
  const [f, setF] = useState(blank);
  const [saving, setSaving] = useState(false);
  const p = pkgs.find(x => x.id === f.packageId);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF(v => ({ ...v, [k]: e.target.value }));
  async function save() {
    setSaving(true);
    try {
      const r = await api.post('/org/admin/organisations', {
        name: f.name.trim(), countryId: f.countryId || null, contactEmail: f.adminEmail.trim(), adminName: f.adminName.trim(), adminEmail: f.adminEmail.trim(),
        packageId: f.packageId, seats: Number(f.seats), pricePerSeat: f.price && p ? majorToMinor(Number(f.price), p.currency) : null, emailDomain: f.domain.trim() || null,
      });
      notify.success(`${f.name.trim()} is set up`, { description: `${f.adminEmail.trim()} has been emailed a link to sign in. Join code ${r.data.joinCode}.` });
      setF(blank); onDone();
    } catch (e: any) { notify.error([].concat(e?.response?.data?.message ?? 'Could not set it up').join(', ')); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent title="New organisation" description="The school admin gets an email to sign in to their school portal (with a code — no password). Seats are invoiced outside the portal and recorded here.">
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-[1fr_160px] gap-3">
            <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">School name</span><input value={f.name} onChange={set('name')} placeholder="e.g. Achimota School" className="input-base" /></label>
            <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Country</span><select value={f.countryId} onChange={set('countryId')} className="input-base"><option value="">—</option>{countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">School admin’s name</span><input value={f.adminName} onChange={set('adminName')} placeholder="Mrs Esi Ofori" className="input-base" /></label>
            <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Their email</span><input type="email" value={f.adminEmail} onChange={set('adminEmail')} placeholder="head.maths@school.edu.gh" className="input-base" /></label>
          </div>
          <div className="grid grid-cols-[1fr_100px_130px] gap-3">
            <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Package</span><select value={f.packageId} onChange={set('packageId')} className="input-base"><option value="">Choose</option>{pkgs.map(x => <option key={x.id} value={x.id}>{x.name} · {money(x.priceAmount, x.currency)}</option>)}</select></label>
            <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Seats</span><input inputMode="numeric" value={f.seats} onChange={e => setF(v => ({ ...v, seats: e.target.value.replace(/\D/g, '') }))} placeholder="120" className="input-base" /></label>
            <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Price a seat{p ? ` (${p.currency})` : ''}</span><input inputMode="decimal" value={f.price} onChange={set('price')} placeholder="agreed price" className="input-base" /></label>
          </div>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Join link limited to emails ending in (optional)</span>
            <div className="flex items-center gap-2"><span className="text-muted">@</span><input value={f.domain} onChange={e => setF(v => ({ ...v, domain: e.target.value.replace(/^@/, '') }))} placeholder="achimota.edu.gh" className="input-base flex-1" /></div></label>
          {p && f.seats && <p className="text-[12.5px] text-muted">{f.seats} seats{f.price ? ` · ${money(majorToMinor(Number(f.price) * Number(f.seats), p.currency), p.currency)} to invoice` : ` · list price ${money(p.priceAmount * Number(f.seats), p.currency)}`}</p>}
        </div>
        <DialogFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} loading={saving} disabled={!f.name.trim() || !f.adminEmail.trim() || !f.packageId || !Number(f.seats)}>Create and invite the school admin</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function OrgDrawer({ org, pkgs, onClose, onChanged }: { org: Org | null; pkgs: Pkg[]; onClose: () => void; onChanged: () => void }) {
  const [pkg, setPkg] = useState(''), [seats, setSeats] = useState(''), [price, setPrice] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setPkg(org?.packages[0]?.packageId ?? ''); setSeats(''); setPrice(''); }, [org?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = pkgs.find(x => x.id === pkg);
  const link = org && typeof window !== 'undefined' ? `${window.location.origin}/join/school/${org.joinCode}` : '';
  async function add() {
    if (!org) return;
    setSaving(true);
    try {
      await api.post(`/org/admin/organisations/${org.id}/packages`, { packageId: pkg, seats: Number(seats), pricePerSeat: price && p ? majorToMinor(Number(price), p.currency) : null });
      notify.success(`${seats} seats added`); setSeats(''); setPrice(''); onChanged();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not add seats'); }
    finally { setSaving(false); }
  }
  return (
    <Drawer open={!!org} onOpenChange={o => !o && onClose()}>
      <DrawerContent title={org?.name ?? 'Organisation'} description={org ? [org.country, `contact ${org.contactEmail}`].filter(Boolean).join(' · ') : ' '}>
        {org && <>
          <DrawerSection title="Packages" count={org.packages.length}>
            <div className="flex flex-col gap-2">{org.packages.map(x => (
              <div key={x.enrollmentId} className="text-[13px] text-navy">
                <p className="flex justify-between gap-3"><strong className="min-w-0 truncate">{x.name}</strong><span className="shrink-0 text-muted">{x.joined} joined · {x.invited} invited · {x.seats} bought</span></p>
                <p className="text-[12px] text-muted">since {date(x.purchasedAt)}{x.pricePerSeat != null ? ` · ${money(x.pricePerSeat, x.currency ?? 'GHS')} a seat` : ''}</p>
              </div>
            ))}</div>
          </DrawerSection>
          <DrawerSection title="Add seats or a package">
            <div className="grid grid-cols-[1fr_80px_110px] gap-2">
              <select value={pkg} onChange={e => setPkg(e.target.value)} aria-label="Package" className="input-base h-9">{pkgs.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>
              <input inputMode="numeric" value={seats} onChange={e => setSeats(e.target.value.replace(/\D/g, ''))} placeholder="Seats" aria-label="Seats" className="input-base h-9" />
              <input inputMode="decimal" value={price} onChange={e => setPrice(e.target.value)} placeholder={`Price${p ? ` ${p.currency}` : ''}`} aria-label="Price a seat" className="input-base h-9" />
            </div>
            <div className="mt-2 flex justify-end"><Button size="sm" onClick={add} loading={saving} disabled={!pkg || !Number(seats)}>Add seats</Button></div>
          </DrawerSection>
          <DrawerSection title="School admin">
            {org.admins.length ? org.admins.map(a => <p key={a.id} className="text-[13px] text-navy">{a.name} · <span className="text-muted">{a.email}</span></p>) : <p className="text-[13px] text-ink2">None yet.</p>}
            <p className="mt-1 text-[12.5px] text-muted">They sign in with a code sent to their email.</p>
          </DrawerSection>
          <DrawerSection title="Join link">
            <p className="break-all text-[13px] text-navy">{link}</p>
            <p className="mt-1 text-[12.5px] text-muted">{org.joinEnabled ? 'On' : 'Off'}{org.emailDomain ? ` · only @${org.emailDomain}` : ' · any email'}. The school admin can turn it off or make a new one.</p>
          </DrawerSection>
        </>}
      </DrawerContent>
    </Drawer>
  );
}
