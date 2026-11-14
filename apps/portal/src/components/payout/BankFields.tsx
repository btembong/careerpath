'use client';
import { useState } from 'react';
import { clsx } from 'clsx';
import { CM_BANKS, bankById, ribKey } from '@/lib/banks';
import { BankLogo } from '@/components/payout/ProviderLogo';

export interface BankValue { bankId: string; holderName: string; bank: string; branch: string; account: string; key: string }
export const emptyBank: BankValue = { bankId: '', holderName: '', bank: '', branch: '', account: '', key: '' };
export const ribOf = (v: BankValue) => `${v.bank}${v.branch}${v.account}${v.key}`;
/** Ready to save: a bank chosen, a name, and 23 digits whose key checks out */
export const bankReady = (v: BankValue) => !!v.bankId && v.holderName.trim().length >= 3 && ribKey(v.bank, v.branch, v.account) === v.key && (!bankById(v.bankId)?.code || v.bank === bankById(v.bankId)!.code);

/** Choose the bank (logos for the main ones), the holder's name, and the RIB in its four parts, checked as it's typed */
export function BankFields({ v, onChange }: { v: BankValue; onChange: (v: BankValue) => void }) {
  const [more, setMore] = useState(!!v.bankId && !bankById(v.bankId)?.main);
  const set = (p: Partial<BankValue>) => onChange({ ...v, ...p });
  const pick = (id: string) => { const b = bankById(id); set({ bankId: id, ...(b?.code ? { bank: b.code } : {}) }); };
  const digits = (s: string, n: number) => s.replace(/\D/g, '').slice(0, n);
  const expected = ribKey(v.bank, v.branch, v.account);
  const chosen = bankById(v.bankId);
  const wrongBank = !!chosen?.code && v.bank.length === 5 && v.bank !== chosen.code;
  const keyState = v.key.length < 2 || !expected ? null : expected === v.key ? 'ok' : 'bad';

  // Pasting the whole RIB into any part fills all four
  const paste = (e: React.ClipboardEvent) => {
    const all = e.clipboardData.getData('text').replace(/\D/g, '');
    if (all.length === 23) { e.preventDefault(); set({ bank: all.slice(0, 5), branch: all.slice(5, 10), account: all.slice(10, 21), key: all.slice(21) }); }
  };
  const part = 'input-base text-center font-bold tabular-nums tracking-[0.08em]';

  return (
    <div className="flex flex-col gap-4">
      <div>
        <span className="text-[13px] font-semibold text-navy">Your bank</span>
        <div role="radiogroup" aria-label="Bank" className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
          {CM_BANKS.filter(b => b.main).map(b => (
            <button key={b.id} type="button" role="radio" aria-checked={v.bankId === b.id} onClick={() => { pick(b.id); setMore(false); }} title={b.name}
              className={clsx('flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center text-[11.5px] font-semibold leading-tight', v.bankId === b.id ? 'border-[#3F6FE8] bg-accent-soft text-navy' : 'border-line text-ink2 hover:bg-subtle')}>
              <BankLogo bank={b} size={36} />
              <span className="line-clamp-2">{b.tile ?? b.name.replace(/ (Cameroun|Cameroon)$/, '')}</span>
            </button>
          ))}
        </div>
        <div className="mt-2 flex items-center gap-2">
          {!more ? <button type="button" onClick={() => setMore(true)} className="text-[13px] font-semibold text-[#2F57C9]">Another bank in Cameroon</button>
            : <select value={chosen && !chosen.main ? v.bankId : ''} onChange={e => pick(e.target.value)} className="input-base h-9 w-auto" aria-label="Other banks">
                <option value="">Choose your bank…</option>
                {CM_BANKS.filter(b => !b.main).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>}
        </div>
      </div>

      <label className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-navy">Account holder</span>
        <input value={v.holderName} onChange={e => set({ holderName: e.target.value })} placeholder="Your name exactly as the bank has it" className="input-base" autoComplete="name" />
        <span className="text-xs text-muted">The bank checks this name when the money arrives. It should be yours.</span>
      </label>

      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-semibold text-navy">Account number (RIB, 23 digits)</span>
        <div className="grid grid-cols-[5fr_5fr_11fr_2.6fr] gap-1.5" onPaste={paste}>
          <input value={v.bank} onChange={e => set({ bank: digits(e.target.value, 5) })} inputMode="numeric" placeholder="10005" aria-label="Bank code (5 digits)" className={clsx(part, wrongBank && 'border-[#A12A2A]')} />
          <input value={v.branch} onChange={e => set({ branch: digits(e.target.value, 5) })} inputMode="numeric" placeholder="00022" aria-label="Branch code (5 digits)" className={part} />
          <input value={v.account} onChange={e => set({ account: digits(e.target.value, 11) })} inputMode="numeric" placeholder="04494961051" aria-label="Account number (11 digits)" className={part} />
          <input value={v.key} onChange={e => set({ key: digits(e.target.value, 2) })} inputMode="numeric" placeholder="78" aria-label="RIB key (2 digits)" className={clsx(part, keyState === 'bad' && 'border-[#A12A2A]', keyState === 'ok' && 'border-[#1A7F4B]')} />
        </div>
        <div className="grid grid-cols-[5fr_5fr_11fr_2.6fr] gap-1.5 text-center text-[11px] text-muted"><span>Bank code</span><span>Branch</span><span>Account number</span><span>Key</span></div>
        <span className={clsx('text-xs', keyState === 'bad' || wrongBank ? 'text-[#A12A2A]' : keyState === 'ok' ? 'text-[#1A7F4B]' : 'text-muted')}>
          {wrongBank ? `A ${chosen!.name} RIB starts with ${chosen!.code}.`
            : keyState === 'ok' ? '✓ The number checks out.'
            : keyState === 'bad' ? 'The key doesn’t match these digits: check them against your RIB.'
            : 'Copy it from your RIB (Relevé d’Identité Bancaire), or paste all 23 digits into any box.'}
        </span>
      </div>
    </div>
  );
}
