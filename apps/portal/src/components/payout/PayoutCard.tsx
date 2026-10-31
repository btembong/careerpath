'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

export interface Payout { bankName: string; accountNumber: string; bankCode: string | null; country: string; isVerified: boolean }

const MOMO = ['MTN Mobile Money', 'Telecel Cash', 'AirtelTigo Money', 'Orange Money', 'M-Pesa', 'Airtel Money', 'Wave'];
const input = 'h-[38px] rounded-md border border-line bg-white px-2.5 text-[13.5px] text-navy outline-none focus:border-azure disabled:bg-subtle disabled:text-ink2';
const card = 'flex flex-col gap-3 rounded-lg border border-line bg-white p-[18px]';

/** Mobile money or bank account for payouts (teachers, reviewers, country reps). `payout` undefined = still loading. */
export function PayoutCard({ payout, countries, onSaved, highlight = false }: { payout: Payout | null | undefined; countries: { id: string; name: string }[]; onSaved: (p: Payout) => void; highlight?: boolean }) {
  const isMomo = (n: string | undefined) => !!n && (MOMO.includes(n) || /money|momo|cash|pesa|wave/i.test(n));
  const [method, setMethod] = useState<'momo' | 'bank'>('momo');
  const [f, setF] = useState({ bankName: MOMO[0], accountNumber: '', bankCode: '', country: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!payout) return;
    setMethod(isMomo(payout.bankName) ? 'momo' : 'bank');
    setF({ bankName: payout.bankName, accountNumber: payout.accountNumber, bankCode: payout.bankCode ?? '', country: payout.country });
  }, [payout]); // eslint-disable-line react-hooks/exhaustive-deps

  function pick(m: 'momo' | 'bank') {
    setMethod(m);
    if (m === 'momo' && !isMomo(f.bankName)) setF({ ...f, bankName: MOMO[0] });
    if (m === 'bank' && isMomo(f.bankName)) setF({ ...f, bankName: '' });
  }

  async function save() {
    if (!f.bankName.trim() || !f.accountNumber.trim() || !f.country.trim()) { notify.error(method === 'momo' ? 'Choose the network, number and country' : 'Bank, account number and country are needed'); return; }
    setSaving(true);
    try {
      const r = await api.post('/payout-accounts/me', { bankName: f.bankName.trim(), accountNumber: f.accountNumber.trim(), bankCode: method === 'bank' ? f.bankCode.trim() || undefined : undefined, country: f.country.trim() });
      onSaved(r.data); notify.success('Payout account saved', { description: 'An admin will verify it before the next payout.' });
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); } finally { setSaving(false); }
  }

  return (
    <section className={clsx(card, highlight && 'border-azure')}>
      <div className="flex items-center justify-between">
        <h3 className="text-[15px] font-semibold text-navy">Payout account</h3>
        {payout && <span className={clsx('rounded px-2 py-0.5 text-xs font-semibold', payout.isVerified ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>{payout.isVerified ? 'Verified' : 'Awaiting check'}</span>}
      </div>
      <p className="text-[13px] text-ink2">Where your share of course sales is sent each month.</p>
      <div className="flex gap-1.5">
        {([['momo', 'Mobile money'], ['bank', 'Bank']] as const).map(([k, l]) => (
          <button key={k} onClick={() => pick(k)} className={clsx('rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold text-navy', method === k ? 'border border-azure bg-accent-soft' : 'border border-line hover:bg-subtle')}>{l}</button>
        ))}
      </div>
      {payout === undefined ? <div className="h-24 rounded bg-subtle animate-pulse" /> : <>
        {method === 'momo' ? (
          <select className={input} value={f.bankName} onChange={e => setF({ ...f, bankName: e.target.value })}>{MOMO.map(m => <option key={m}>{m}</option>)}</select>
        ) : (
          <input className={input} value={f.bankName} onChange={e => setF({ ...f, bankName: e.target.value })} placeholder="Bank name" />
        )}
        <input className={input} value={f.accountNumber} onChange={e => setF({ ...f, accountNumber: e.target.value })} placeholder={method === 'momo' ? 'Mobile money number' : 'Account number'} inputMode={method === 'momo' ? 'tel' : 'numeric'} />
        {method === 'bank' && <input className={input} value={f.bankCode} onChange={e => setF({ ...f, bankCode: e.target.value })} placeholder="Branch or sort code (optional)" />}
        <select className={input} value={f.country} onChange={e => setF({ ...f, country: e.target.value })}>
          <option value="">Country…</option>
          {countries.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
          {f.country && !countries.some(c => c.name === f.country) && <option value={f.country}>{f.country}</option>}
        </select>
        <Button onClick={save} loading={saving}>Save payout account</Button>
      </>}
    </section>
  );
}
