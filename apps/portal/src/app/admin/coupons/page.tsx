'use client';
import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { majorToMinor } from '@cpa/shared';
import { RepTable, td } from '@/components/rep/RepTable';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import { money } from '@/lib/money';
import api from '@/lib/api';

type Total = { currency: string; amount: number };
interface Coupon {
  id: string; code: string; percentOff: number | null; amountOff: number | null; packageId: string | null; maxRedemptions: number | null; redeemedCount: number;
  expiresAt: string | null; isActive: boolean; createdAt: string; package: { id: string; name: string; currency: string } | null;
  state: 'active' | 'ended' | 'used up' | 'off'; given: Total[]; lastUsed: string | null;
}
interface Data { rows: Coupon[]; stats: { active: number; endingThisMonth: number; usedThisMonth: number; givenThisMonth: Total[]; shareOfSales: number } }
interface Pkg { id: string; name: string; currency: string; priceAmount: number }

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const off = (c: Coupon) => c.percentOff ? `${c.percentOff}% off` : c.amountOff ? `${money(c.amountOff, c.package?.currency ?? 'GHS')} off` : '—';

export default function AdminCouponsPage() {
  const [d, setD] = useState<Data | null>(null);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [tab, setTab] = useState('active');
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Coupon | null>(null);

  const load = useCallback(() => api.get('/admin/coupons').then(r => setD(r.data)).catch(() => notify.error('Could not load coupons')), []);
  useEffect(() => { load(); api.get('/admin/packages').then(r => setPkgs(r.data ?? [])).catch(() => {}); }, [load]);

  const filters: Record<string, (c: Coupon) => boolean> = { active: c => c.state === 'active', ended: c => c.state === 'ended' || c.state === 'used up', off: c => c.state === 'off' };
  const rows = (d?.rows ?? []).filter(filters[tab]).filter(c => !q.trim() || c.code.toLowerCase().includes(q.trim().toLowerCase()));
  const s = d?.stats;

  async function toggle(c: Coupon) {
    try { await api.patch(`/admin/coupons/${c.id}`, { isActive: !c.isActive }); notify.success(c.isActive ? `${c.code} turned off` : `${c.code} turned on`); load(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not change it'); }
  }

  return (
    <>
      <RepTable title="Coupons" subtitle="Discount codes for packages"
        actions={<Button size="sm" onClick={() => setAdding(true)}>New coupon</Button>}
        stats={[
          { l: 'Active codes', v: s ? String(s.active) : '—', sub: s?.endingThisMonth ? `${s.endingThisMonth} end this month` : 'none ending this month' },
          { l: 'Used this month', v: s ? String(s.usedThisMonth) : '—', sub: 'times' },
          { l: 'Discount given', v: s ? (s.givenThisMonth[0] ? money(s.givenThisMonth[0].amount, s.givenThisMonth[0].currency) : '—') : '—', sub: s && s.givenThisMonth.length > 1 ? s.givenThisMonth.slice(1).map(x => `+ ${money(x.amount, x.currency)}`).join(' ') : 'this month' },
          { l: 'Sales with a code', v: s ? `${s.shareOfSales}%` : '—', sub: 'of sales this month' },
        ]}
        tabs={[{ key: 'active', label: 'Active', count: d?.rows.filter(filters.active).length ?? 0 }, { key: 'ended', label: 'Ended', count: d?.rows.filter(filters.ended).length ?? 0 }, { key: 'off', label: 'Turned off', count: d?.rows.filter(filters.off).length ?? 0 }]}
        tab={tab} onTab={setTab} search={q} onSearch={setQ} searchLabel="Search codes"
        cols={['Code', 'Discount', 'Used', 'Ends', 'Status', '']}
        loading={!d} empty={d && !rows.length ? (q ? 'Nothing matches.' : tab === 'active' ? 'No active codes.' : 'Nothing here.') : null}
        note="A code applies at checkout. Turning one off stops new uses; past purchases keep their discount.">
        {rows.map(c => (
          <tr key={c.id} className="hover:bg-subtle">
            <td className={td}><strong className="font-mono text-navy">{c.code}</strong><br /><span className="text-[12.5px] text-muted">created {date(c.createdAt)}</span></td>
            <td className={clsx(td, 'text-navy')}>{off(c)}<br /><span className="text-[12.5px] text-muted">{c.package?.name ?? 'any package'}</span></td>
            <td className={clsx(td, 'text-navy')}>{c.redeemedCount}{c.maxRedemptions != null ? ` of ${c.maxRedemptions}` : ''}<br /><span className="text-[12.5px] text-muted">{c.given.length ? `${c.given.map(x => money(x.amount, x.currency)).join(' + ')} given` : 'not used yet'}</span></td>
            <td className={clsx(td, 'text-ink2')}>{c.expiresAt ? date(c.expiresAt) : 'no end'}</td>
            <td className={td}><span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-[12px] font-semibold capitalize', c.state === 'active' ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>{c.state === 'off' ? 'Turned off' : c.state}</span></td>
            <td className={clsx(td, 'whitespace-nowrap text-right')}>
              <button onClick={() => setEditing(c)} className="mr-3 font-semibold text-azure-strong hover:underline">Edit</button>
              <button onClick={() => toggle(c)} className="font-semibold text-muted hover:text-navy hover:underline">{c.isActive ? 'Turn off' : 'Turn on'}</button>
            </td>
          </tr>
        ))}
      </RepTable>
      <NewCoupon open={adding} pkgs={pkgs} onClose={() => setAdding(false)} onDone={() => { setAdding(false); load(); }} />
      <EditCoupon coupon={editing} onClose={() => setEditing(null)} onDone={() => { setEditing(null); load(); }} />
    </>
  );
}

function NewCoupon({ open, pkgs, onClose, onDone }: { open: boolean; pkgs: Pkg[]; onClose: () => void; onDone: () => void }) {
  const [code, setCode] = useState(''), [kind, setKind] = useState<'percent' | 'amount'>('percent'), [value, setValue] = useState('');
  const [pkg, setPkg] = useState(''), [max, setMax] = useState(''), [ends, setEnds] = useState('');
  const [saving, setSaving] = useState(false);
  const p = pkgs.find(x => x.id === pkg);
  const currency = p?.currency ?? 'GHS';
  async function save() {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0 || (kind === 'percent' && v > 100)) { notify.error(kind === 'percent' ? 'Choose 1 to 100%' : 'Choose an amount'); return; }
    if (kind === 'amount' && !pkg) { notify.error('A fixed amount off needs a package, so we know the currency'); return; }
    setSaving(true);
    try {
      await api.post('/admin/coupons', {
        code: code.trim(), ...(kind === 'percent' ? { percentOff: Math.round(v) } : { amountOff: majorToMinor(v, currency) }),
        ...(pkg ? { packageId: pkg } : {}), ...(max ? { maxRedemptions: Number(max) } : {}), ...(ends ? { expiresAt: new Date(`${ends}T23:59:59`).toISOString() } : {}),
      });
      notify.success(`${code.trim().toUpperCase()} created`);
      setCode(''); setValue(''); setPkg(''); setMax(''); setEnds(''); onDone();
    } catch (e: any) { notify.error([].concat(e?.response?.data?.message ?? 'Could not create it').join(', ')); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent title="New coupon" description="Students type the code at checkout.">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Code</span><input value={code} onChange={e => setCode(e.target.value.replace(/\s/g, ''))} maxLength={30} placeholder="e.g. WASSCE20" className="input-base font-mono uppercase" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Discount</span>
              <select value={kind} onChange={e => setKind(e.target.value as 'percent' | 'amount')} className="input-base"><option value="percent">Percentage off</option><option value="amount">Amount off</option></select></label>
            <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">{kind === 'percent' ? '%' : `Amount (${currency})`}</span><input inputMode="decimal" value={value} onChange={e => setValue(e.target.value)} placeholder={kind === 'percent' ? '20' : '100'} className="input-base" /></label>
          </div>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Package</span>
            <select value={pkg} onChange={e => setPkg(e.target.value)} className="input-base"><option value="">Any package</option>{pkgs.map(x => <option key={x.id} value={x.id}>{x.name} · {money(x.priceAmount, x.currency)}</option>)}</select></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Times it can be used</span><input inputMode="numeric" value={max} onChange={e => setMax(e.target.value.replace(/\D/g, ''))} placeholder="no limit" className="input-base" /></label>
            <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Last day</span><input type="date" value={ends} onChange={e => setEnds(e.target.value)} className="input-base" /></label>
          </div>
        </div>
        <DialogFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} loading={saving} disabled={!code.trim() || !value}>Create coupon</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditCoupon({ coupon, onClose, onDone }: { coupon: Coupon | null; onClose: () => void; onDone: () => void }) {
  const [max, setMax] = useState(''), [ends, setEnds] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setMax(coupon?.maxRedemptions != null ? String(coupon.maxRedemptions) : ''); setEnds(coupon?.expiresAt ? coupon.expiresAt.slice(0, 10) : ''); }, [coupon]);
  async function save() {
    if (!coupon) return;
    setSaving(true);
    try {
      await api.patch(`/admin/coupons/${coupon.id}`, { maxRedemptions: max ? Number(max) : null, expiresAt: ends ? new Date(`${ends}T23:59:59`).toISOString() : null });
      notify.success(`${coupon.code} saved`); onDone();
    } catch (e: any) { notify.error([].concat(e?.response?.data?.message ?? 'Could not save').join(', ')); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open={!!coupon} onOpenChange={o => !o && onClose()}>
      <DialogContent title={`Edit ${coupon?.code ?? ''}`} description={coupon ? `${off(coupon)} · ${coupon.package?.name ?? 'any package'} · used ${coupon.redeemedCount} times. The discount itself can’t change once codes are out.` : ''}>
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Times it can be used</span><input inputMode="numeric" value={max} onChange={e => setMax(e.target.value.replace(/\D/g, ''))} placeholder="no limit" className="input-base" /></label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Last day</span><input type="date" value={ends} onChange={e => setEnds(e.target.value)} className="input-base" /></label>
        </div>
        <DialogFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} loading={saving}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
