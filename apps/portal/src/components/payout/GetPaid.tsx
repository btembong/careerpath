'use client';
import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { minorToMajor, majorToMinor } from '@cpa/shared';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { PageHero, heroBtn, heroBtnDark, heroBtnLine, asideLabel } from '@/components/hero/PageHero';
import { walletMoney } from '@/components/wallet/WalletCharts';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Status = 'AWAITING_APPROVAL' | 'SENDING' | 'PAID' | 'FAILED' | 'REJECTED';
interface WRow { id: string; amount: number; fee: number | null; currency: string; status: Status; method: string; paidTo: string; reference: string; failureReason: string | null; requestedAt: string; completedAt: string | null; approvals: number; approvalsNeeded: number }
interface Account { provider: string | null; label: string; last: string; country: string; holderName: string | null; nameCheck: string; confirmedByAdmin: boolean; automatic: boolean; hasPin: boolean; readyAt: string | null; lockedUntil: string | null }
interface Paid {
  currency: string | null; balance: number; clearing: number; available: number; sending: number; nextClearsAt: string | null;
  minimum: number; dailyLeft: number | null; approvalAbove: number; paused: boolean; payeePaysFee: boolean;
  account: Account | null; withdrawals: WRow[]; statements: { id: string; amount: number; currency: string; paidAt: string | null; paidTo: string | null; reference: string | null }[];
}

export const STATUS: Record<Status, { label: string; cls: string }> = {
  PAID: { label: 'Received', cls: 'bg-[#E3F5EC] text-[#1A7F4B]' },
  SENDING: { label: 'On its way', cls: 'bg-accent-soft text-[#2F57C9]' },
  AWAITING_APPROVAL: { label: 'Waiting for approval', cls: 'bg-[#FFF3DC] text-[#8A5A0B]' },
  FAILED: { label: 'Returned', cls: 'bg-[#FDE8E8] text-[#A12A2A]' },
  REJECTED: { label: 'Refused', cls: 'bg-[#FDE8E8] text-[#A12A2A]' },
};
const short = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const when = (d: string) => new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const err = (e: any, f: string) => e?.response?.data?.message ?? f;
const PROVIDER_COLOUR: Record<string, string> = { MTN: 'bg-[#FFCB05] text-[#072061]', ORANGE: 'bg-[#FF7900] text-[#FFFFFF]' };

function ProviderMark({ p }: { p: string | null }) {
  return <span className={clsx('flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold', PROVIDER_COLOUR[p ?? ''] ?? 'bg-accent-soft text-[#2F57C9]')}>{p === 'ORANGE' ? 'OM' : p === 'MTN' ? 'MTN' : '₣'}</span>;
}

function CodeField({ value, onChange, purpose, label = 'Code from your email' }: { value: string; onChange: (v: string) => void; purpose: 'account' | 'withdraw'; label?: string }) {
  const [sent, setSent] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function send() {
    setBusy(true);
    try { const r = await api.post('/me/get-paid/code', { purpose }); setSent(r.data.to); notify.success(`Code sent to ${r.data.to}`); }
    catch (e) { notify.error(err(e, 'Could not send a code')); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-navy">{label}</span>
      <div className="flex gap-2">
        <input value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 digits"
          className="input-base w-36 text-center text-lg font-bold tracking-[0.3em]" aria-label="Code" />
        <Button size="sm" variant="secondary" loading={busy} onClick={send}>{sent ? 'Send again' : 'Send me a code'}</Button>
      </div>
      <span className="text-xs text-muted">{sent ? `Sent to ${sent}. It works once, for 10 minutes.` : 'We email you a 6-digit code to make sure it’s you.'}</span>
    </div>
  );
}

function PinField({ value, onChange, label, autoFocus }: { value: string; onChange: (v: string) => void; label: string; autoFocus?: boolean }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-semibold text-navy">{label}</span>
      <input type="password" value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="off" autoFocus={autoFocus} placeholder="••••"
        className="input-base w-32 text-center text-xl font-bold tracking-[0.5em]" />
    </label>
  );
}

/** Where earnings are paid, and the PIN. Saving needs a code from email. */
function AccountDialog({ d, mode, onClose, onSaved }: { d: Paid; mode: 'account' | 'pin'; onClose: () => void; onSaved: (p: Paid | null) => void }) {
  const a = d.account;
  const [provider, setProvider] = useState(a?.provider ?? 'MTN');
  const [number, setNumber] = useState('');
  const [other, setOther] = useState(a && !a.provider ? a.label : '');
  const [country, setCountry] = useState(a?.country ?? 'CM');
  const [pin, setPin] = useState(''), [pin2, setPin2] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const needPin = mode === 'pin' || !a?.hasPin;
  const mobile = provider === 'MTN' || provider === 'ORANGE';

  async function save() {
    if ((needPin || pin) && pin !== pin2) { notify.error('The two PINs don’t match'); return; }
    setBusy(true);
    try {
      if (mode === 'pin') { await api.post('/me/get-paid/pin', { pin, code }); notify.success('PIN saved'); onSaved(null); }
      else {
        const r = await api.post('/me/get-paid/account', { provider: provider === 'OTHER' ? '' : provider, number, country: mobile ? 'CM' : country, bankName: provider === 'OTHER' ? other : undefined, ...(pin ? { pin } : {}), code });
        const acc = (r.data as Paid).account;
        notify.success('Payout account saved', { description: acc?.nameCheck === 'match' ? `Registered to ${acc.holderName}` : acc?.automatic ? 'An admin will confirm the name on the number before the first payment.' : 'Withdrawals to it are paid by hand by our team.' });
        onSaved(r.data);
      }
    } catch (e) { notify.error(err(e, 'Could not save')); } finally { setBusy(false); }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title={mode === 'pin' ? 'Change your withdrawal PIN' : a ? 'Change your payout account' : 'Where should we send your money?'}
        description={mode === 'pin' ? 'You’ll use it each time you withdraw.' : 'MTN and Orange numbers in Cameroon are paid automatically, in about a minute.'}>
        <div className="flex flex-col gap-4">
          {mode === 'account' && <>
            <div role="radiogroup" aria-label="Where" className="flex flex-wrap gap-2">
              {[['MTN', 'MTN Mobile Money'], ['ORANGE', 'Orange Money'], ['OTHER', 'Another country or bank']].map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={provider === k} onClick={() => setProvider(k)}
                  className={clsx('inline-flex h-9 items-center rounded-md border px-3 text-[13px] font-semibold', provider === k ? 'border-[#3F6FE8] bg-accent-soft text-navy' : 'border-line text-ink2')}>{l}</button>
              ))}
            </div>
            {provider === 'OTHER' && (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Mobile money or bank</span><input value={other} onChange={e => setOther(e.target.value)} placeholder="e.g. MTN MoMo Ghana" className="input-base" /></label>
                <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Country</span><input value={country} onChange={e => setCountry(e.target.value)} placeholder="e.g. Ghana" className="input-base" /></label>
              </div>
            )}
            <label className="flex flex-col gap-1.5">
              <span className="text-[13px] font-semibold text-navy">{mobile ? 'Mobile number' : 'Phone or account number'}</span>
              <input value={number} onChange={e => setNumber(e.target.value)} inputMode="tel" placeholder={mobile ? '6 70 00 00 00' : ''} className="input-base" />
              {mobile && <span className="text-xs text-muted">We check the name on the number with {provider === 'MTN' ? 'MTN' : 'Orange'}. It should be yours.</span>}
            </label>
          </>}
          {(needPin || mode === 'account') && (
            <div className="flex flex-wrap gap-4">
              <PinField value={pin} onChange={setPin} label={needPin ? 'Choose a 4-digit PIN' : 'New PIN (optional)'} autoFocus={mode === 'pin'} />
              <PinField value={pin2} onChange={setPin2} label="Again" />
            </div>
          )}
          {(needPin || pin) && <p className="-mt-2 text-xs text-muted">Not 1234 or your birthday. It’s stored scrambled; no one at CareerPath can see it.</p>}
          <CodeField value={code} onChange={setCode} purpose="account" />
        </div>
        <DialogFooter>
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={busy} disabled={code.length !== 6 || (needPin && pin.length !== 4) || (mode === 'account' && !number.trim())} onClick={save}>{mode === 'pin' ? 'Save PIN' : 'Save payout account'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Amount → PIN or code → sent (or waiting for approval) */
function WithdrawDialog({ d, onClose, onDone }: { d: Paid; onClose: () => void; onDone: () => void }) {
  const c = d.currency ?? 'XAF', a = d.account!;
  const [step, setStep] = useState<'amount' | 'auth' | 'done'>('amount');
  const [amount, setAmount] = useState(String(minorToMajor(d.available, c)));
  const [useCode, setUseCode] = useState(!a.hasPin || !!a.lockedUntil);
  const [pin, setPin] = useState(''), [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<WRow | null>(null);
  const minor = (() => { const n = Math.floor(majorToMinor(Number(amount) || 0, c)); return ['XAF', 'XOF'].includes(c) ? Math.floor(n / 10) * 10 : n; })();
  const fee = a.automatic && d.payeePaysFee ? Math.ceil(minor * 0.013) : 0;
  const tooSmall = minor < d.minimum, tooBig = minor > d.available || (d.dailyLeft != null && minor > d.dailyLeft);
  const needsApproval = !a.automatic || minor > d.approvalAbove;

  async function send() {
    setBusy(true);
    try { const r = await api.post('/me/get-paid/withdraw', { amount: minor, ...(useCode ? { code } : { pin }) }); setRes(r.data); setStep('done'); onDone(); }
    catch (e) { notify.error(err(e, 'Could not send it')); } finally { setBusy(false); }
  }
  // While it's on its way, check every few seconds for the operator's answer
  useEffect(() => {
    if (res?.status !== 'SENDING') return;
    let n = 0;
    const t = setInterval(async () => {
      n++;
      const r = await api.get('/me/get-paid').catch(() => null);
      const w = (r?.data as Paid | undefined)?.withdrawals.find(x => x.id === res.id);
      if (w && w.status !== 'SENDING') { setRes(w); onDone(); }
      if (n > 20) clearInterval(t);
    }, 4000);
    return () => clearInterval(t);
  }, [res, onDone]);

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title={step === 'done' ? (res?.status === 'PAID' ? 'Sent' : res?.status === 'AWAITING_APPROVAL' ? 'Waiting for approval' : res?.status === 'SENDING' ? 'On its way' : 'Not sent') : 'Withdraw'}
        description={step === 'amount' ? `You can withdraw up to ${walletMoney(d.available, c)} now.` : step === 'auth' ? `${walletMoney(minor, c)} to ${a.label} ·· ${a.last}` : undefined}>
        {step === 'amount' && <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold text-navy">Amount ({['XAF', 'XOF'].includes(c) ? 'FCFA' : c})</span>
            <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} inputMode="decimal" autoFocus className="input-base text-2xl font-extrabold" />
          </label>
          <div className="flex gap-2">
            {[[0.25, '25%'], [0.5, '50%'], [1, 'All']].map(([f, l]) => (
              <button key={l} type="button" onClick={() => setAmount(String(Math.floor(minorToMajor(Math.floor(d.available * (f as number)), c))))} className="inline-flex h-8 items-center rounded-md border border-line px-3 text-[13px] font-bold text-[#2F57C9]">{l}</button>
            ))}
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 rounded-lg bg-subtle px-3.5 py-3 text-[13.5px]">
            {fee > 0 && <><dt className="text-ink2">Operator’s fee (about)</dt><dd className="text-right">{walletMoney(fee, c)}</dd></>}
            <dt className="text-ink2">You receive (about)</dt><dd className="text-right font-bold text-navy">{walletMoney(Math.max(0, minor - fee), c)}</dd>
          </dl>
          <div className="flex items-center gap-3 rounded-lg border border-line p-3">
            <ProviderMark p={a.provider} />
            <span className="min-w-0 text-[13.5px]"><b className="block text-navy">{a.label} ·· {a.last}</b><span className="text-xs text-muted">{a.holderName ? `Registered to ${a.holderName}` : a.automatic ? 'Paid automatically' : 'Paid by hand by our team'}</span></span>
          </div>
          {tooSmall && minor > 0 && <p className="text-[13px] text-[#A12A2A]">The smallest withdrawal is {walletMoney(d.minimum, c)}.</p>}
          {tooBig && <p className="text-[13px] text-[#A12A2A]">{minor > d.available ? `That’s more than the ${walletMoney(d.available, c)} you can withdraw now.` : `You can withdraw ${walletMoney(d.dailyLeft ?? 0, c)} more today.`}</p>}
          {!tooSmall && !tooBig && needsApproval && <p className="rounded-lg bg-[#FFF3DC] px-3 py-2.5 text-[13px] text-[#8A5A0B]">{a.automatic ? `Over ${walletMoney(d.approvalAbove, c)}, an admin approves it first, usually the same day.` : 'Our team pays it by hand, usually within 2 working days, and adds the reference.'}</p>}
        </div>}

        {step === 'auth' && <div className="flex flex-col gap-4">
          {!useCode ? <>
            <PinField value={pin} onChange={setPin} label="Your withdrawal PIN" autoFocus />
            <button type="button" onClick={() => setUseCode(true)} className="self-start text-[13px] font-semibold text-[#2F57C9]">Forgot your PIN? Use a code instead</button>
          </> : <>
            <CodeField value={code} onChange={setCode} purpose="withdraw" />
            {a.hasPin && !a.lockedUntil && <button type="button" onClick={() => setUseCode(false)} className="self-start text-[13px] font-semibold text-[#2F57C9]">Use my PIN</button>}
          </>}
        </div>}

        {step === 'done' && res && <div className="flex flex-col items-center gap-2 py-2 text-center">
          <span className={clsx('flex h-14 w-14 items-center justify-center rounded-full text-2xl font-extrabold', res.status === 'PAID' ? 'bg-[#E3F5EC] text-[#1A7F4B]' : res.status === 'FAILED' ? 'bg-[#FDE8E8] text-[#A12A2A]' : 'bg-accent-soft text-[#2F57C9]')}>{res.status === 'PAID' ? '✓' : res.status === 'FAILED' ? '!' : '…'}</span>
          <p className="text-2xl font-extrabold text-navy">{walletMoney(res.amount, res.currency)}</p>
          <p className="text-[13.5px] text-ink2">
            {res.status === 'PAID' ? `Sent to ${res.paidTo}.` : res.status === 'SENDING' ? `On its way to ${res.paidTo}. Usually under a minute.` : res.status === 'AWAITING_APPROVAL' ? (res.method === 'manual' ? 'Our team pays it by hand and adds the reference. We’ll tell you when it’s done.' : 'An admin checks it first, usually the same day. Then it sends on its own.') : `It wasn’t sent, so it’s back in your balance. ${res.failureReason ?? ''}`}
          </p>
          <p className="text-xs text-muted">Reference {res.reference}</p>
        </div>}

        <DialogFooter>
          {step === 'amount' && <><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!minor || tooSmall || tooBig} onClick={() => setStep('auth')}>Next</Button></>}
          {step === 'auth' && <><Button size="sm" variant="secondary" onClick={() => setStep('amount')}>Back</Button><Button size="sm" loading={busy} disabled={useCode ? code.length !== 6 : pin.length !== 4} onClick={send}>Send {walletMoney(minor, c)}</Button></>}
          {step === 'done' && <Button size="sm" onClick={onClose}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The top of the earnings page for teachers, subject reviewers and country reps: what's ready to
 * withdraw, the Withdraw button, the payout account and PIN, and every withdrawal.
 */
export function GetPaid() {
  const [d, setD] = useState<Paid | null>(null);
  const [dialog, setDialog] = useState<'withdraw' | 'account' | 'pin' | null>(null);
  const load = useCallback(() => api.get('/me/get-paid').then(r => setD(r.data)).catch(e => notify.error(err(e, 'Could not load your balance'))), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="h-64 animate-pulse rounded-[14px] bg-[#3F6FE8]/30" />;
  const c = d.currency ?? 'XAF', a = d.account;
  const canWithdraw = !!a && !a.readyAt && !d.paused && d.available >= Math.max(1, d.minimum);

  return (
    <>
      {!a ? (
        <PageHero kicker={`Get paid${d.balance > 0 ? ` · ${walletMoney(d.balance, c)} in your balance` : ''}`} l1="Set up how" l2="you get paid."
          sub="Add your MTN Mobile Money or Orange Money number and a 4-digit PIN. Then withdraw whenever you like: it reaches your phone in about a minute. Elsewhere, our team pays you by hand."
          actions={<button type="button" onClick={() => setDialog('account')} className={heroBtn}>Add payout account</button>}
          aside={<>
            <p className={asideLabel}>How it works</p>
            {[['Add your number', 'We check the name with MTN or Orange'], ['Choose a PIN', 'You’ll use it each time you withdraw'], ['Withdraw when you like', 'From FCFA 5,000, straight to your phone']].map(([t, s], i) => (
              <div key={t} className="flex items-start gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[13px] font-extrabold text-[#2F57C9]">{i + 1}</span>
                <span><span className="block text-[13.5px] font-bold">{t}</span><span className="block text-xs text-muted">{s}</span></span>
              </div>
            ))}
          </>} />
      ) : (
        <PageHero
          kicker={`Get paid · ${a.label} ·· ${a.last}${a.nameCheck === 'match' ? ' · name checked' : ''}`}
          l1={<><span className="text-[#FFFFFF]">{walletMoney(d.available, c)}</span><br />ready to withdraw.</>}
          sub={d.paused ? 'Withdrawals are paused for a short while. Your balance is safe.'
            : a.readyAt ? `Your payout account changed recently, so withdrawals to it open ${when(a.readyAt)}. If you didn’t change it, tell us straight away.`
            : <>{a.automatic ? `It reaches your ${a.label} in about a minute.` : 'Our team pays it by hand, usually within 2 working days.'}{d.clearing ? ` ${walletMoney(d.clearing, c)} more is still clearing${d.nextClearsAt ? ` and starts becoming yours on ${short(d.nextClearsAt)}` : ''}.` : ''}{d.available < d.minimum && d.available > 0 ? ` The smallest withdrawal is ${walletMoney(d.minimum, c)}.` : ''}</>}
          chips={[
            ...(d.clearing ? [{ t: `${walletMoney(d.clearing, c)} clearing` }] : []),
            ...(d.sending ? [{ t: `${walletMoney(d.sending, c)} being sent`, strong: true }] : []),
            ...(!a.hasPin ? [{ t: 'Set your PIN', strong: true }] : []),
          ]}
          actions={<>
            <button type="button" disabled={!canWithdraw} onClick={() => setDialog('withdraw')} className={clsx(heroBtnDark, 'disabled:opacity-60')}>Withdraw</button>
            <button type="button" onClick={() => setDialog('account')} className={heroBtnLine}>Payout account</button>
            <button type="button" onClick={() => setDialog('pin')} className={heroBtnLine}>{a.hasPin ? 'Change PIN' : 'Set PIN'}</button>
          </>}
          aside={<>
            <p className={asideLabel}>Your balance</p>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-[13.5px]">
              <dt className="text-ink2">Ready to withdraw</dt><dd className="text-right font-bold">{walletMoney(d.available, c)}</dd>
              <dt className="text-ink2">Clearing (after a sale)</dt><dd className="text-right font-bold">{walletMoney(d.clearing, c)}</dd>
              <dt className="text-ink2">Being sent</dt><dd className="text-right font-bold">{walletMoney(d.sending, c)}</dd>
            </dl>
            <div className="flex items-center gap-2.5 border-t border-line pt-2.5">
              <ProviderMark p={a.provider} />
              <span className="min-w-0 text-xs text-muted"><b className="block text-[13px] text-navy">{a.label} ·· {a.last}</b>
                {a.nameCheck === 'match' ? `✓ ${a.holderName}` : a.confirmedByAdmin ? '✓ Confirmed by our team' : a.nameCheck === 'mismatch' ? `Registered to ${a.holderName}: our team will confirm it` : 'Name not checked yet'}</span>
            </div>
          </>}
        />
      )}

      {d.withdrawals.length > 0 && (
        <section className="rounded-xl border border-line bg-white">
          <h2 className="border-b border-line px-[18px] py-3.5 text-base font-bold text-navy">Withdrawals</h2>
          {d.withdrawals.slice(0, 8).map(w => (
            <div key={w.id} className="flex flex-wrap items-center gap-3 border-t border-line px-[18px] py-3 first-of-type:border-t-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-navy">{walletMoney(w.amount, w.currency)} <span className="font-medium text-muted">· {w.paidTo}</span></p>
                <p className="mt-0.5 truncate text-[12.5px] text-muted">{short(w.requestedAt)}{w.fee ? ` · fee ${walletMoney(w.fee, w.currency)}` : ''} · ref {w.reference}{w.failureReason && (w.status === 'FAILED' || w.status === 'REJECTED') ? ` · ${w.failureReason}` : ''}</p>
              </div>
              <span className={clsx('inline-flex h-6 items-center rounded-md px-2 text-[11.5px] font-bold', STATUS[w.status].cls)}>{STATUS[w.status].label}{w.status === 'AWAITING_APPROVAL' && w.approvalsNeeded > 1 ? ` · ${w.approvals}/${w.approvalsNeeded}` : ''}</span>
            </div>
          ))}
        </section>
      )}

      {dialog === 'withdraw' && <WithdrawDialog d={d} onClose={() => setDialog(null)} onDone={load} />}
      {(dialog === 'account' || dialog === 'pin') && <AccountDialog d={d} mode={dialog === 'pin' && a ? 'pin' : 'account'} onClose={() => setDialog(null)} onSaved={p => { if (p) setD(p); else load(); setDialog(null); }} />}
    </>
  );
}
