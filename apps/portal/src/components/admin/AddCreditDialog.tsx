'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Payee { id: string; email: string; role: string; name: string | null; walletCurrency: string | null }
const ROLE: Record<string, string> = { TEACHER: 'Teacher', SUBJECT_REVIEWER: 'Reviewer', COUNTRY_REP: 'Country rep' };
const CURRENCIES = ['XAF', 'XOF', 'GHS', 'NGN', 'KES', 'USD'];
const label = (c: string) => (c === 'XAF' ? 'FCFA (XAF)' : c === 'XOF' ? 'FCFA (XOF)' : c);

/** Pay someone by hand for work the rules don't cover: it goes into their wallet and their next payout. */
export function AddCreditDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<Payee[]>([]);
  const [who, setWho] = useState<Payee | null>(null);
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('XAF');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!open) { setQ(''); setWho(null); setAmount(''); setReason(''); setCurrency('XAF'); } }, [open]);
  useEffect(() => {
    if (!open || who) return;
    const t = setTimeout(() => { api.get('/wallets/admin/payees', { params: { q } }).then(r => setPeople(r.data ?? [])).catch(() => setPeople([])); }, 250);
    return () => clearTimeout(t);
  }, [q, open, who]);

  function choose(p: Payee) { setWho(p); if (p.walletCurrency) setCurrency(p.walletCurrency); }

  async function save() {
    if (!who) return;
    setSaving(true);
    try {
      const r = await api.post('/wallets/admin/credit', { userId: who.id, amount: Number(amount.replace(/[,\s]/g, '')), currency, reason: reason.trim() });
      notify.success(`Added to ${r.data?.to ?? 'their'} wallet`);
      onDone(); onClose();
    } catch (e: any) { notify.error([].concat(e?.response?.data?.message ?? 'Could not add the credit').join(', ')); }
    finally { setSaving(false); }
  }

  const amountOk = Number(amount.replace(/[,\s]/g, '')) > 0;
  const shown = amountOk ? `${currency === 'XAF' || currency === 'XOF' ? 'FCFA' : currency} ${Number(amount.replace(/[,\s]/g, '')).toLocaleString('en-GB')}` : '';

  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent title="Add a credit" description="For work the rules don’t cover: marking, a bonus, a correction. It goes into their wallet and is paid with their next payout.">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-[13px] font-semibold text-navy">Who</span>
            {who ? (
              <div className="flex items-center justify-between gap-3 rounded-md border border-azure bg-accent-soft px-3 py-2">
                <span className="min-w-0 text-[13.5px]"><strong className="text-navy">{who.name ?? who.email}</strong> <span className="text-muted">· {ROLE[who.role] ?? who.role}</span></span>
                <button type="button" onClick={() => setWho(null)} className="text-[13px] font-semibold text-azure-strong hover:underline">Change</button>
              </div>
            ) : <>
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or email" className="input-base" autoFocus />
              <div className="max-h-48 overflow-y-auto rounded-md border border-line">
                {people.length === 0
                  ? <p className="px-3 py-2.5 text-[13px] text-muted">No teachers, reviewers or country reps match.</p>
                  : people.map(p => (
                    <button key={p.id} type="button" onClick={() => choose(p)} className="flex w-full items-center justify-between gap-3 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-subtle">
                      <span className="min-w-0"><span className="block truncate text-[13.5px] font-semibold text-navy">{p.name ?? p.email}</span><span className="block truncate text-xs text-muted">{p.email}</span></span>
                      <span className="flex-shrink-0 text-xs text-muted">{ROLE[p.role] ?? p.role}</span>
                    </button>
                  ))}
              </div>
            </>}
          </div>
          <div className="flex gap-3">
            <label className="flex flex-[2] flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Amount</span>
              <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 15000" className="input-base" /></label>
            <label className="flex flex-1 flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Currency</span>
              <select value={currency} onChange={e => setCurrency(e.target.value)} disabled={!!who?.walletCurrency} className={clsx('input-base', who?.walletCurrency && 'opacity-70')}>
                {CURRENCIES.map(c => <option key={c} value={c}>{label(c)}</option>)}
              </select></label>
          </div>
          {who?.walletCurrency && <p className="-mt-1 text-xs text-muted">Their wallet is in {label(who.walletCurrency)}, so the credit is too.</p>}
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Reason they’ll see</span>
            <input value={reason} onChange={e => setReason(e.target.value)} maxLength={200} placeholder="e.g. Marking the November mock exam" className="input-base" /></label>
          <p className="text-[12.5px] text-muted">Recorded with your name and the date. They get a notification.</p>
        </div>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" onClick={save} loading={saving} disabled={!who || !amountOk || reason.trim().length < 3}>{shown ? `Add ${shown}` : 'Add credit'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
