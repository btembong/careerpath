'use client';
import { useState } from 'react';
import { clsx } from 'clsx';
import { BANKS_BY_COUNTRY, KE_MOBILE, ZA_BANKS, bankById, type Bank } from '@/lib/banks';
import { BankLogo } from '@/components/payout/ProviderLogo';

/** How someone outside Cameroon is paid: a bank, Kenya's M-Pesa or Airtel Money, or (anywhere else) mobile money or a bank by name */
export interface AbroadValue { provider: string; bankId: string; number: string; holderName: string; accountType: '' | 'cheque' | 'savings'; bankName: string; swift: string }
export const emptyAbroad = (country: string): AbroadValue => ({ provider: country === 'KE' ? 'MPESA' : country in BANKS_BY_COUNTRY ? 'BANK' : 'MOMO', bankId: '', number: '', holderName: '', accountType: '', bankName: '', swift: '' });

const digits = (s: string) => s.replace(/\D/g, '');
/** Kenyan mobile: 07xx / 01xx, or 254 / +254 in front */
const keMobileOk = (s: string) => /^(?:254|0)?[17]\d{8}$/.test(digits(s));

/** Ready to save, by country */
export function abroadReady(country: string, v: AbroadValue): boolean {
  if (v.holderName.trim().length < 3) return false;
  if (country === 'KE' && (v.provider === 'MPESA' || v.provider === 'AIRTEL')) return keMobileOk(v.number);
  if (country in BANKS_BY_COUNTRY) {
    if (!v.bankId) return false;
    if (country === 'NG') return /^\d{10}$/.test(digits(v.number));
    if (country === 'ZA') return /^\d{7,12}$/.test(digits(v.number)) && !!v.accountType;
    return /^\d{6,20}$/.test(digits(v.number));
  }
  return v.bankName.trim().length >= 2 && /^[A-Z0-9]{6,34}$/i.test(v.number.replace(/[\s-]/g, '')) && (!v.swift.trim() || /^[A-Z0-9]{8}([A-Z0-9]{3})?$/i.test(v.swift.replace(/\s/g, '')));
}

/** What the API takes */
export const abroadPayload = (v: AbroadValue) => ({ provider: v.provider, bankId: v.bankId || undefined, number: v.number, holderName: v.holderName, accountType: v.accountType || undefined, bankName: v.bankName || undefined, swift: v.swift || undefined });

const tile = (on: boolean) => clsx('flex items-center gap-2 rounded-lg border p-2 text-left text-[12.5px] font-semibold leading-tight', on ? 'border-[#3F6FE8] bg-accent-soft text-navy' : 'border-line text-ink2 hover:bg-subtle');
/** As the Cameroon bank picker: the logo on top, the name under it */
const logoTile = (on: boolean) => clsx('flex flex-col items-center gap-1.5 rounded-lg border p-2 text-center text-[11.5px] font-semibold leading-tight', on ? 'border-[#3F6FE8] bg-accent-soft text-navy' : 'border-line text-ink2 hover:bg-subtle');
const label = 'text-[13px] font-semibold text-navy';

/** The main banks as logo tiles, the rest in a list */
function BankPicker({ banks, value, onPick, more: moreLabel }: { banks: Bank[]; value: string; onPick: (id: string) => void; more: string }) {
  const chosen = bankById(value);
  const [more, setMore] = useState(!!chosen && !chosen.main);
  return (
    <div>
      <span className={label}>Your bank</span>
      <div role="radiogroup" aria-label="Bank" className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {banks.filter(b => b.main).map(b => (
          <button key={b.id} type="button" role="radio" aria-checked={value === b.id} onClick={() => { onPick(b.id); setMore(false); }} title={b.name} className={logoTile(value === b.id)}>
            <BankLogo bank={b} size={36} /><span className="line-clamp-2">{b.name}</span>
          </button>
        ))}
      </div>
      {banks.some(b => !b.main) && <div className="mt-2">
        {!more ? <button type="button" onClick={() => setMore(true)} className="text-[13px] font-semibold text-[#2F57C9]">{moreLabel}</button>
          : <select value={chosen && !chosen.main ? value : ''} onChange={e => onPick(e.target.value)} className="input-base h-9 w-auto max-w-full" aria-label="Other banks">
              <option value="">Choose your bank…</option>
              {banks.filter(b => !b.main).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>}
      </div>}
    </div>
  );
}

/** The details step for Nigeria, Kenya, South Africa and anywhere else outside Cameroon */
export function AbroadFields({ country, v, onChange }: { country: string; v: AbroadValue; onChange: (v: AbroadValue) => void }) {
  const set = (p: Partial<AbroadValue>) => onChange({ ...v, ...p });
  const holder = (
    <label className="flex flex-col gap-1.5">
      <span className={label}>{v.provider === 'MPESA' ? 'Name on the M-Pesa account' : 'Name on the account'}</span>
      <input value={v.holderName} onChange={e => set({ holderName: e.target.value })} placeholder="Your name exactly as it’s registered" className="input-base" autoComplete="name" />
      <span className="text-xs text-muted">We pay only to an account in your name.</span>
    </label>
  );

  if (country === 'NG') {
    const n = digits(v.number);
    return (
      <div className="flex flex-col gap-4">
        <BankPicker banks={BANKS_BY_COUNTRY.NG} value={v.bankId} onPick={id => set({ bankId: id })} more="Another bank: FCMB, Stanbic IBTC, Wema, Sterling…" />
        <label className="flex flex-col gap-1.5">
          <span className={label}>Account number (NUBAN)</span>
          <input value={v.number} onChange={e => set({ number: digits(e.target.value).slice(0, 10) })} inputMode="numeric" placeholder="0123456789" className={clsx('input-base tabular-nums tracking-[0.06em]', n.length === 10 && 'border-azure')} />
          <span className={clsx('text-xs', n.length === 10 ? 'text-azure-strong' : 'text-muted')}>{n.length === 10 ? '✓ 10 digits' : 'The 10-digit number in your bank app or on a statement.'}</span>
        </label>
        {holder}
      </div>
    );
  }

  if (country === 'KE') {
    const mobile = v.provider === 'MPESA' || v.provider === 'AIRTEL';
    return (
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="How" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {[...KE_MOBILE, { id: 'BANK', name: 'Bank account', short: 'BANK', colour: '#2F57C9' } as Bank].map(b => (
            <button key={b.id} type="button" role="radio" aria-checked={v.provider === b.id} onClick={() => set({ provider: b.id, bankId: '', number: '' })} className={logoTile(v.provider === b.id)}>
              <BankLogo bank={b} size={36} />{b.name}
            </button>
          ))}
        </div>
        {mobile ? (
          <label className="flex flex-col gap-1.5">
            <span className={label}>{v.provider === 'MPESA' ? 'M-Pesa number' : 'Airtel Money number'}</span>
            <input value={v.number} onChange={e => set({ number: e.target.value })} inputMode="tel" placeholder="0712 345 678" className={clsx('input-base', keMobileOk(v.number) && 'border-azure')} />
            <span className={clsx('text-xs', keMobileOk(v.number) ? 'text-azure-strong' : 'text-muted')}>{keMobileOk(v.number) ? '✓ A Kenyan mobile number' : 'Starts 07 or 01. The number registered in your name.'}</span>
          </label>
        ) : <>
          <BankPicker banks={BANKS_BY_COUNTRY.KE} value={v.bankId} onPick={id => set({ bankId: id })} more="Another bank in Kenya" />
          <label className="flex flex-col gap-1.5">
            <span className={label}>Account number</span>
            <input value={v.number} onChange={e => set({ number: digits(e.target.value).slice(0, 20) })} inputMode="numeric" className="input-base tabular-nums" />
          </label>
        </>}
        {holder}
      </div>
    );
  }

  if (country === 'ZA') {
    const bank = ZA_BANKS.find(b => b.id === v.bankId);
    return (
      <div className="flex flex-col gap-4">
        <BankPicker banks={ZA_BANKS} value={v.bankId} onPick={id => set({ bankId: id })} more="Another bank in South Africa" />
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className={label}>Account type</span>
            <select value={v.accountType} onChange={e => set({ accountType: e.target.value as AbroadValue['accountType'] })} className="input-base">
              <option value="">Choose…</option><option value="cheque">Cheque (current)</option><option value="savings">Savings</option>
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className={label}>Branch code</span>
            <input value={bank?.branch ?? ''} readOnly placeholder="Fills in from the bank" className={clsx('input-base tabular-nums', bank && 'border-azure')} />
          </label>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Account number</span>
          <input value={v.number} onChange={e => set({ number: digits(e.target.value).slice(0, 12) })} inputMode="numeric" className="input-base tabular-nums" />
        </label>
        {holder}
      </div>
    );
  }

  // Anywhere else: mobile money or a bank, by name
  const bankAbroad = v.provider === 'BANK';
  return (
    <div className="flex flex-col gap-4">
      <div role="radiogroup" aria-label="How" className="grid grid-cols-2 gap-2">
        {[['MOMO', 'Mobile money'], ['BANK', 'Bank account']].map(([k, l]) => (
          <button key={k} type="button" role="radio" aria-checked={v.provider === k} onClick={() => set({ provider: k, number: '', swift: '' })} className={tile(v.provider === k)}>{l}</button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className={label}>{bankAbroad ? 'Bank' : 'Provider'}</span>
          <input value={v.bankName} onChange={e => set({ bankName: e.target.value })} placeholder={bankAbroad ? 'e.g. GCB Bank' : 'e.g. MTN MoMo'} className="input-base" />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={label}>{bankAbroad ? 'Account number or IBAN' : 'Mobile number'}</span>
          <input value={v.number} onChange={e => set({ number: e.target.value })} inputMode={bankAbroad ? 'text' : 'tel'} placeholder={bankAbroad ? '' : 'With the country code'} className="input-base tabular-nums" />
        </label>
      </div>
      {bankAbroad && (
        <label className="flex flex-col gap-1.5">
          <span className={label}>SWIFT code <span className="font-normal text-muted">(if your bank gave you one)</span></span>
          <input value={v.swift} onChange={e => set({ swift: e.target.value.toUpperCase() })} placeholder="8 or 11 letters and digits" className="input-base uppercase tracking-[0.06em]" />
        </label>
      )}
      {holder}
    </div>
  );
}
