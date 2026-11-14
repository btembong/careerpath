'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { minorToMajor, majorToMinor } from '@cpa/shared';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { PageHero, heroBtn, heroBtnDark, heroBtnLine, asideLabel } from '@/components/hero/PageHero';
import { walletMoney } from '@/components/wallet/WalletCharts';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Status = 'AWAITING_APPROVAL' | 'SENDING' | 'PAID' | 'FAILED' | 'REJECTED';
interface WRow { id: string; amount: number; fee: number | null; currency: string; status: Status; method: string; paidTo: string; payeeName: string | null; reference: string; failureReason: string | null; requestedAt: string; sentAt: string | null; completedAt: string | null; approvals: number; approvalsNeeded: number }
interface Account {
  provider: string | null; label: string; last: string; country: string; holderName: string | null; nameCheck: string; confirmedByAdmin: boolean; automatic: boolean;
  hasPin: boolean; readyAt: string | null; lockedUntil: string | null; pinSetAt: string | null; lockedByUser: boolean;
  autoMode: 'weekly' | 'monthly' | 'threshold' | null; autoThreshold: number | null; nextAutoAt: string | null; since: string; changedAt: string | null;
}
interface Paid {
  currency: string | null; balance: number; clearing: number; available: number; sending: number; nextClearsAt: string | null; clearingByDay: { day: string; amount: number }[];
  minimum: number; dailyLeft: number | null; approvalAbove: number; paused: boolean; payeePaysFee: boolean;
  account: Account | null; withdrawals: WRow[];
}

export const STATUS: Record<Status, { label: string; cls: string }> = {
  PAID: { label: 'Received', cls: 'bg-[#E3F5EC] text-[#1A7F4B]' },
  SENDING: { label: 'On its way', cls: 'bg-accent-soft text-[#2F57C9]' },
  AWAITING_APPROVAL: { label: 'Waiting for approval', cls: 'bg-[#FFF3DC] text-[#8A5A0B]' },
  FAILED: { label: 'Back in balance', cls: 'bg-[#FDE8E8] text-[#A12A2A]' },
  REJECTED: { label: 'Refused', cls: 'bg-[#FDE8E8] text-[#A12A2A]' },
};
const short = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const when = (d: string) => new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const clock = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
const err = (e: any, f: string) => e?.response?.data?.message ?? f;
const PROVIDER_COLOUR: Record<string, string> = { MTN: 'bg-[#FFCB05] text-[#072061]', ORANGE: 'bg-[#FF7900] text-[#FFFFFF]' };
const operator = (a: { provider: string | null; label: string }) => (a.provider === 'MTN' ? 'MTN' : a.provider === 'ORANGE' ? 'Orange' : a.label);

function ProviderMark({ p, size = 36 }: { p: string | null; size?: number }) {
  return <span style={{ width: size, height: size }} className={clsx('flex flex-shrink-0 items-center justify-center rounded-lg text-[11px] font-extrabold', PROVIDER_COLOUR[p ?? ''] ?? 'bg-accent-soft text-[#2F57C9]')}>{p === 'ORANGE' ? 'OM' : p === 'MTN' ? 'MTN' : '₣'}</span>;
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
      <div className="flex flex-wrap gap-2">
        <input value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="6 digits"
          className="input-base w-36 text-center text-lg font-bold tracking-[0.3em]" aria-label="Code" />
        <Button size="sm" variant="secondary" loading={busy} onClick={send}>{sent ? 'Send again' : 'Send me a code'}</Button>
      </div>
      <span className="text-xs text-muted">{sent ? `Sent to ${sent}. It works once, for 10 minutes.` : 'We email you 6 digits to make sure it’s you.'}</span>
    </div>
  );
}

/** Four dots that fill as the PIN is typed; the real input sits on top, invisible */
function PinDots({ value, onChange, autoFocus }: { value: string; onChange: (v: string) => void; autoFocus?: boolean }) {
  return (
    <span className="relative inline-flex gap-2">
      {[0, 1, 2, 3].map(i => <span key={i} className={clsx('h-3.5 w-3.5 rounded-full', i < value.length ? 'bg-navy' : 'border-2 border-[#C9D3E8]')} />)}
      <input type="password" value={value} onChange={e => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))} inputMode="numeric" autoComplete="off" autoFocus={autoFocus} aria-label="PIN"
        className="absolute inset-[-10px] w-[calc(100%+20px)] cursor-text opacity-0" />
    </span>
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

/* ── First time: number → PIN → code, as three steps ─────────────────── */

function Setup({ onClose, onSaved, start }: { onClose: () => void; onSaved: (p: Paid) => void; start?: Account | null }) {
  const [step, setStep] = useState(0);
  const [provider, setProvider] = useState(start?.provider ?? 'MTN');
  const [number, setNumber] = useState('');
  const [other, setOther] = useState(''), [country, setCountry] = useState('');
  const [pin, setPin] = useState(''), [pin2, setPin2] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const mobile = provider === 'MTN' || provider === 'ORANGE';
  const change = !!start;

  async function save() {
    if (pin && pin !== pin2) { notify.error('The two PINs don’t match'); setStep(1); return; }
    setBusy(true);
    try {
      const r = await api.post('/me/get-paid/account', { provider: provider === 'OTHER' ? '' : provider, number, country: mobile ? 'CM' : country, bankName: provider === 'OTHER' ? other : undefined, ...(pin ? { pin } : {}), code });
      const acc = (r.data as Paid).account;
      notify.success(change ? 'Payout account changed' : 'You’re set up', { description: acc?.nameCheck === 'match' ? `Registered to ${acc.holderName}` : acc?.automatic ? 'Our team will confirm the name on the number before the first payment.' : 'Withdrawals to it are paid by hand by our team.' });
      onSaved(r.data);
    } catch (e) { notify.error(err(e, 'Could not save')); } finally { setBusy(false); }
  }

  const steps = change ? ['Your number', 'New PIN (optional)', 'Confirm'] : ['Your number', 'Choose a PIN', 'Confirm'];
  const ok = [!!number.trim() && (provider !== 'OTHER' || (!!other.trim() && !!country.trim())), change ? (!pin || (pin.length === 4 && pin2.length === 4)) : pin.length === 4 && pin2.length === 4, code.length === 6];
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title={change ? 'Change your payout number' : 'Set up how you get paid'} description="Three short steps. MTN and Orange numbers in Cameroon are paid automatically.">
        <ol className="mb-4 grid grid-cols-3 gap-2">
          {steps.map((t, i) => (
            <li key={t} className={clsx('flex items-center gap-2 rounded-lg px-2.5 py-2 text-[12.5px] font-semibold', i < step ? 'bg-[#E3F5EC] text-[#1A7F4B]' : i === step ? 'border-2 border-[#3F6FE8] text-navy' : 'bg-subtle text-muted')}>
              <span>{i < step ? '✓' : i + 1}</span><span className="truncate">{t}</span>
            </li>
          ))}
        </ol>
        {step === 0 && <div className="flex flex-col gap-4">
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
            <input value={number} onChange={e => setNumber(e.target.value)} inputMode="tel" autoFocus placeholder={mobile ? '6 70 00 00 00' : ''} className="input-base" />
            {mobile && <span className="text-xs text-muted">We check the name on it with {provider === 'MTN' ? 'MTN' : 'Orange'}. It should be yours.</span>}
            {change && <span className="text-xs text-muted">For your safety, withdrawals to a new number open 48 hours after the change.</span>}
          </label>
        </div>}
        {step === 1 && <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-4"><PinField value={pin} onChange={setPin} label={change ? 'New PIN (leave empty to keep yours)' : 'Choose 4 digits'} autoFocus /><PinField value={pin2} onChange={setPin2} label="Again" /></div>
          <p className="text-xs text-muted">You’ll type it each time you withdraw. Not 1234 or your birthday. It’s stored scrambled: no one at CareerPath can see it.</p>
        </div>}
        {step === 2 && <CodeField value={code} onChange={setCode} purpose="account" />}
        <DialogFooter>
          {step ? <Button size="sm" variant="secondary" onClick={() => setStep(step - 1)}>Back</Button> : <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>}
          {step < 2 ? <Button size="sm" disabled={!ok[step]} onClick={() => { if (step === 1 && pin && pin !== pin2) { notify.error('The two PINs don’t match'); return; } setStep(step + 1); }}>Continue</Button>
            : <Button size="sm" loading={busy} disabled={!ok[2]} onClick={save}>{change ? 'Save' : 'Finish'}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PinDialog({ onClose }: { onClose: () => void }) {
  const [pin, setPin] = useState(''), [pin2, setPin2] = useState(''), [code, setCode] = useState(''), [busy, setBusy] = useState(false);
  async function save() {
    if (pin !== pin2) { notify.error('The two PINs don’t match'); return; }
    setBusy(true);
    try { await api.post('/me/get-paid/pin', { pin, code }); notify.success('PIN saved'); onClose(); } catch (e) { notify.error(err(e, 'Could not save')); } finally { setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title="Your withdrawal PIN" description="You’ll type it each time you withdraw.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4"><PinField value={pin} onChange={setPin} label="New PIN" autoFocus /><PinField value={pin2} onChange={setPin2} label="Again" /></div>
          <CodeField value={code} onChange={setCode} purpose="account" />
        </div>
        <DialogFooter><Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button><Button size="sm" loading={busy} disabled={pin.length !== 4 || pin2.length !== 4 || code.length !== 6} onClick={save}>Save PIN</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── The receipt: each step with its time ─────────────────────────────── */

export function Tracker({ w, operatorName }: { w: WRow; operatorName: string }) {
  const done = w.status === 'PAID', back = w.status === 'FAILED' || w.status === 'REJECTED';
  const steps: { t: string; at: string | null; note?: string; state: 'done' | 'now' | 'todo' | 'bad' }[] = [
    { t: 'You asked', at: w.requestedAt, note: `${walletMoney(w.amount, w.currency)} left your balance`, state: 'done' },
  ];
  if (w.approvalsNeeded > 0 || w.method === 'manual') steps.push({
    t: w.method === 'manual' ? 'Our team pays it by hand' : 'An admin checks it', at: null,
    note: w.status === 'AWAITING_APPROVAL' ? (w.method === 'manual' ? 'Usually within 2 working days' : 'Usually the same day') : undefined,
    state: w.status === 'AWAITING_APPROVAL' ? 'now' : w.status === 'REJECTED' ? 'bad' : 'done',
  });
  if (w.method !== 'manual') steps.push({ t: `Sent to ${operatorName}`, at: w.sentAt, note: w.sentAt ? `Reference ${w.reference}` : undefined, state: w.sentAt ? (w.status === 'FAILED' ? 'bad' : 'done') : 'todo' });
  steps.push(back
    ? { t: 'Back in your balance', at: w.completedAt, note: w.failureReason ?? undefined, state: 'bad' }
    : { t: done ? 'Received' : w.status === 'SENDING' ? 'Arriving…' : 'Received', at: done ? w.completedAt : null, note: done ? [w.fee ? `${operatorName}’s fee ${walletMoney(w.fee, w.currency)}` : null, w.method === 'manual' ? `Reference ${w.reference}` : null].filter(Boolean).join(' · ') || undefined : undefined, state: done ? 'done' : w.status === 'SENDING' ? 'now' : 'todo' });
  const colour = { done: 'bg-[#1A7F4B]', now: 'border-2 border-[#3F6FE8] bg-white', todo: 'border-2 border-[#C9D3E8] bg-white', bad: 'bg-[#A12A2A]' };
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => (
        <li key={s.t} className="flex gap-3">
          <span className="flex flex-col items-center">
            <span className={clsx('mt-1 h-3 w-3 rounded-full', colour[s.state])} />
            {i < steps.length - 1 && <span className={clsx('w-0.5 flex-1', s.state === 'done' ? 'bg-[#1A7F4B]' : 'bg-line')} style={{ minHeight: 28 }} />}
          </span>
          <span className="pb-3 text-[13.5px]">
            <b className={clsx(s.state === 'now' ? 'text-[#2F57C9]' : s.state === 'todo' ? 'text-muted' : s.state === 'bad' ? 'text-[#A12A2A]' : 'text-navy')}>{s.t}</b>{s.at && <span className="text-muted"> · {clock(s.at)}</span>}
            {s.note && <span className="block text-xs text-muted">{s.note}</span>}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ReceiptDialog({ w, account, onClose }: { w: WRow; account: Account; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="sm" title={walletMoney(w.amount, w.currency)} description={`to ${w.paidTo}${w.payeeName ? ` · ${w.payeeName}` : ''} · ${short(w.requestedAt)}`}>
        <Tracker w={w} operatorName={operator(account)} />
        <DialogFooter>
          <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(w.reference).then(() => notify.success('Reference copied')).catch(() => {}); }}>Copy reference</Button>
          <Button size="sm" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Withdraw: one sheet, then the tracker ────────────────────────────── */

function WithdrawSheet({ d, onClose, onDone }: { d: Paid; onClose: () => void; onDone: () => void }) {
  const c = d.currency ?? 'XAF', a = d.account!;
  const cap = d.dailyLeft != null ? Math.min(d.available, d.dailyLeft) : d.available;
  const [major, setMajor] = useState(Math.floor(minorToMajor(cap, c)));
  const [useCode, setUseCode] = useState(!a.hasPin || !!a.lockedUntil);
  const [pin, setPin] = useState(''), [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<WRow | null>(null);
  const minor = (() => { const n = Math.floor(majorToMinor(major || 0, c)); return ['XAF', 'XOF'].includes(c) ? Math.floor(n / 10) * 10 : n; })();
  const fee = a.automatic && d.payeePaysFee ? Math.ceil(minor * 0.013) : 0;
  const lands = Math.max(0, minor - fee);
  const tooSmall = minor < d.minimum, tooBig = minor > cap;
  const needsApproval = !a.automatic || minor > d.approvalAbove;
  const presets = [10_000, 25_000, 50_000, 100_000].filter(v => majorToMinor(v, c) < cap).slice(-3);
  const ready = !tooSmall && !tooBig && (useCode ? code.length === 6 : pin.length === 4);

  async function send() {
    setBusy(true);
    try { const r = await api.post('/me/get-paid/withdraw', { amount: minor, ...(useCode ? { code } : { pin }) }); setRes(r.data); onDone(); }
    catch (e) { notify.error(err(e, 'Could not send it')); setPin(''); } finally { setBusy(false); }
  }
  useEffect(() => {
    if (res?.status !== 'SENDING') return;
    let n = 0;
    const t = setInterval(async () => {
      n++;
      const r = await api.get('/me/get-paid').catch(() => null);
      const w = (r?.data as Paid | undefined)?.withdrawals.find(x => x.id === res.id);
      if (w && (w.status !== 'SENDING' || w.sentAt !== res.sentAt)) { setRes(w); if (w.status !== 'SENDING') onDone(); }
      if (n > 20) clearInterval(t);
    }, 4000);
    return () => clearInterval(t);
  }, [res, onDone]);

  if (res) return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="sm" title={walletMoney(res.amount, res.currency)} description={`to ${res.paidTo}${a.holderName ? ` · ${a.holderName}` : ''}`}>
        <Tracker w={res} operatorName={operator(a)} />
        <DialogFooter>
          <Button size="sm" variant="secondary" onClick={() => { navigator.clipboard?.writeText(res.reference).then(() => notify.success('Reference copied')).catch(() => {}); }}>Copy reference</Button>
          <Button size="sm" onClick={onClose}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title="Withdraw" description={`Up to ${walletMoney(cap, c)} now${d.dailyLeft != null && d.dailyLeft < d.available ? ' (today’s limit)' : ''}.`}>
        <div className="flex flex-col gap-3.5">
          <label className="flex items-baseline gap-2">
            <span className="text-lg font-bold text-muted">{['XAF', 'XOF'].includes(c) ? 'FCFA' : c}</span>
            <input value={major ? major.toLocaleString('en-GB') : ''} onChange={e => setMajor(Number(e.target.value.replace(/\D/g, '')) || 0)} inputMode="numeric" aria-label="Amount"
              className="w-full bg-transparent text-[40px] font-extrabold tracking-[-0.02em] text-navy outline-none" />
          </label>
          <input type="range" min={0} max={Math.floor(minorToMajor(cap, c))} step={['XAF', 'XOF'].includes(c) ? 500 : 1} value={Math.min(major, Math.floor(minorToMajor(cap, c)))} onChange={e => setMajor(Number(e.target.value))} aria-label="Amount" className="w-full accent-[#3F6FE8]" />
          <div className="flex flex-wrap gap-1.5">
            {presets.map(v => <button key={v} type="button" onClick={() => setMajor(v)} className={clsx('inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-bold', major === v ? 'border-[#3F6FE8] bg-accent-soft text-navy' : 'border-line text-[#2F57C9]')}>{v.toLocaleString('en-GB')}</button>)}
            <button type="button" onClick={() => setMajor(Math.floor(minorToMajor(cap, c)))} className={clsx('inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-bold', minor === cap ? 'border-[#3F6FE8] bg-accent-soft text-navy' : 'border-line text-[#2F57C9]')}>All</button>
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-line p-3">
            <ProviderMark p={a.provider} />
            <span className="min-w-0 flex-1 text-[13.5px]"><b className="block text-navy">{a.label} ·· {a.last}</b><span className="text-xs text-muted">{[a.holderName, a.automatic ? 'arrives in about a minute' : 'paid by hand by our team'].filter(Boolean).join(' · ')}</span></span>
          </div>
          <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[13.5px]">
            {fee > 0 && <><dt className="text-ink2">{operator(a)}’s fee (about)</dt><dd className="text-right">{walletMoney(fee, c)}</dd></>}
            <dt className="font-bold text-navy">{a.automatic ? 'Lands on your phone' : 'You receive'}</dt><dd className="text-right font-bold text-navy">{walletMoney(lands, c)}</dd>
          </dl>
          {tooSmall && minor > 0 && <p className="text-[13px] text-[#A12A2A]">The smallest withdrawal is {walletMoney(d.minimum, c)}.</p>}
          {tooBig && <p className="text-[13px] text-[#A12A2A]">That’s more than the {walletMoney(cap, c)} you can withdraw now.</p>}
          {!tooSmall && !tooBig && needsApproval && <p className="rounded-lg bg-[#FFF3DC] px-3 py-2 text-[13px] text-[#8A5A0B]">{a.automatic ? `Over ${walletMoney(d.approvalAbove, c)}, an admin checks it first, usually the same day.` : 'Our team pays it by hand, usually within 2 working days.'}</p>}
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-subtle px-3.5 py-3">
            {!useCode ? <>
              <span className="text-[13px] font-bold text-navy">PIN</span>
              <PinDots value={pin} onChange={setPin} autoFocus />
              <button type="button" onClick={() => setUseCode(true)} className="ml-auto text-[12.5px] font-semibold text-[#2F57C9]">Forgot? Use a code</button>
            </> : <div className="w-full">
              <CodeField value={code} onChange={setCode} purpose="withdraw" label="Code instead of your PIN" />
              {a.hasPin && !a.lockedUntil && <button type="button" onClick={() => setUseCode(false)} className="mt-1 text-[12.5px] font-semibold text-[#2F57C9]">Use my PIN</button>}
            </div>}
          </div>
        </div>
        <DialogFooter>
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={busy} disabled={!ready} onClick={send}>Send {walletMoney(lands, c)} to {operator(a)} ·· {a.last}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Automatic payouts and the safety card ────────────────────────────── */

function AutoCard({ d, onSaved }: { d: Paid; onSaved: (p: Paid) => void }) {
  const a = d.account!, c = d.currency ?? 'XAF';
  const [mode, setMode] = useState<Account['autoMode']>(a.autoMode);
  const [threshold, setThreshold] = useState(String(a.autoThreshold ? minorToMajor(a.autoThreshold, c) : 50_000));
  const [code, setCode] = useState(''), [busy, setBusy] = useState(false);
  const changed = mode !== a.autoMode || (mode === 'threshold' && majorToMinor(Number(threshold) || 0, c) !== a.autoThreshold);
  async function save() {
    setBusy(true);
    try { const r = await api.post('/me/get-paid/auto', { mode, threshold: mode === 'threshold' ? majorToMinor(Number(threshold) || 0, c) : undefined, code }); onSaved(r.data); setCode(''); notify.success(mode ? 'Automatic payouts on' : 'Automatic payouts off'); }
    catch (e) { notify.error(err(e, 'Could not save')); } finally { setBusy(false); }
  }
  const OPTS: [Account['autoMode'], string][] = [[null, 'Off'], ['weekly', 'Every Friday'], ['monthly', '1st of the month'], ['threshold', 'When it reaches…']];
  return (
    <section id="automatic" className="flex flex-col gap-3 rounded-xl border border-line bg-white p-[18px]">
      <div><h2 className="text-base font-bold text-navy">Get paid without asking</h2><p className="mt-0.5 text-[13px] text-ink2">Everything that’s yours is sent to {a.label} ·· {a.last} at 09:00. You get a receipt each time.</p></div>
      <div className="flex flex-wrap gap-1.5">
        {OPTS.map(([k, l]) => <button key={l} type="button" onClick={() => setMode(k)} className={clsx('inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-semibold', mode === k ? 'border-[#3F6FE8] bg-accent-soft text-navy' : 'border-line text-ink2')}>{l}</button>)}
      </div>
      {mode === 'threshold' && <label className="flex items-center gap-2 text-[13px] text-ink2">Send it when it reaches <input value={threshold} onChange={e => setThreshold(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="input-base h-9 w-28 text-right font-bold" /> FCFA</label>}
      {!changed && a.autoMode && a.nextAutoAt && <p className="flex justify-between border-t border-line pt-2.5 text-[13px]"><span className="text-ink2">{a.autoMode === 'threshold' ? 'Next check' : 'Next automatic payment'}</span><b className="text-navy">{when(a.nextAutoAt)}</b></p>}
      {changed && <>
        {mode && <CodeField value={code} onChange={setCode} purpose="account" label="Confirm with a code" />}
        <Button size="sm" className="self-start" loading={busy} disabled={!!mode && code.length !== 6} onClick={save}>{mode ? 'Turn on' : 'Turn off'}</Button>
      </>}
    </section>
  );
}

function SafetyCard({ d, onSaved, onPin, onChangeNumber }: { d: Paid; onSaved: (p: Paid) => void; onPin: () => void; onChangeNumber: () => void }) {
  const a = d.account!;
  const [unlocking, setUnlocking] = useState(false), [code, setCode] = useState(''), [busy, setBusy] = useState(false);
  const last = d.withdrawals.find(w => w.status === 'PAID');
  async function lock(locked: boolean) {
    setBusy(true);
    try { const r = await api.post('/me/get-paid/lock', { locked, code }); onSaved(r.data); setUnlocking(false); setCode(''); notify.success(locked ? 'Withdrawals locked' : 'Withdrawals unlocked'); }
    catch (e) { notify.error(err(e, 'Could not change it')); } finally { setBusy(false); }
  }
  const tag = 'inline-flex h-6 items-center rounded-md px-2 text-[11.5px] font-bold whitespace-nowrap';
  return (
    <section className="flex flex-col rounded-xl border border-line bg-white p-[18px]">
      <h2 className="mb-1 text-base font-bold text-navy">Safety</h2>
      <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-[13.5px]"><span className="text-ink2">Withdrawal PIN</span>
        <button type="button" onClick={onPin} className={clsx(tag, a.hasPin ? 'bg-[#E3F5EC] text-[#1A7F4B]' : 'bg-[#FFF3DC] text-[#8A5A0B]')}>{a.hasPin ? `Set${a.pinSetAt ? ` · ${short(a.pinSetAt)}` : ''} · change` : 'Not set · set it'}</button></div>
      <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-[13.5px]"><span className="text-ink2">Payout number</span>
        <button type="button" onClick={onChangeNumber} className={clsx(tag, a.nameCheck === 'match' || a.confirmedByAdmin ? 'bg-[#E3F5EC] text-[#1A7F4B]' : 'bg-[#FFF3DC] text-[#8A5A0B]')}>{a.nameCheck === 'match' ? `Yours, checked by ${operator(a)}` : a.confirmedByAdmin ? 'Confirmed by our team' : 'Being checked'}</button></div>
      <div className="flex items-center justify-between gap-3 border-b border-line py-2.5 text-[13.5px]"><span className="text-ink2">Last withdrawal</span><span className="text-navy">{last ? `${walletMoney(last.amount, last.currency)} · ${short(last.requestedAt)}` : 'None yet'}</span></div>
      <div className="flex items-start justify-between gap-3 py-2.5">
        <span className="text-[13.5px]"><b className="text-navy">Lock withdrawals</b><span className="block text-xs text-muted">Lost your phone? No one can withdraw until you unlock with a code.</span></span>
        <button type="button" role="switch" aria-checked={a.lockedByUser} disabled={busy} onClick={() => (a.lockedByUser ? setUnlocking(true) : lock(true))}
          className={clsx('relative h-6 w-11 flex-shrink-0 rounded-full transition-colors', a.lockedByUser ? 'bg-[#A12A2A]' : 'bg-[#C9D3E8]')}>
          <span className={clsx('absolute top-1 h-4 w-4 rounded-full bg-white transition-all', a.lockedByUser ? 'left-6' : 'left-1')} />
        </button>
      </div>
      {unlocking && <div className="flex flex-col gap-2 border-t border-line pt-3">
        <CodeField value={code} onChange={setCode} purpose="account" label="Unlock with a code" />
        <div className="flex gap-2"><Button size="sm" loading={busy} disabled={code.length !== 6} onClick={() => lock(false)}>Unlock</Button><Button size="sm" variant="secondary" onClick={() => setUnlocking(false)}>Cancel</Button></div>
      </div>}
    </section>
  );
}

function History({ d, onOpen }: { d: Paid; onOpen: (w: WRow) => void }) {
  const months = useMemo(() => {
    const m = new Map<string, WRow[]>();
    d.withdrawals.forEach(w => { const k = new Date(w.requestedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); m.set(k, [...(m.get(k) ?? []), w]); });
    return [...m.entries()];
  }, [d.withdrawals]);
  const year = new Date().getFullYear();
  const yearTotal = d.withdrawals.filter(w => w.status === 'PAID' && new Date(w.requestedAt).getFullYear() === year).reduce((n, w) => n + w.amount, 0);
  return (
    <section className="flex flex-col rounded-xl border border-line bg-white p-[18px]">
      <h2 className="mb-1 text-base font-bold text-navy">Withdrawals</h2>
      {!months.length ? <p className="py-3 text-[13px] text-ink2">None yet. Your first withdrawal shows here, with its receipt.</p> : months.map(([m, rows]) => {
        // Money that left or is leaving: received, on its way or waiting (not what came back)
        const paid = rows.filter(w => w.status !== 'FAILED' && w.status !== 'REJECTED');
        return (
          <div key={m}>
            <p className="flex justify-between border-b border-line py-2 text-[13.5px]"><b className="text-navy">{m.split(' ')[0]}</b><b className="text-navy">{walletMoney(paid.reduce((n, w) => n + w.amount, 0), d.currency ?? 'XAF')} · {paid.length}</b></p>
            {rows.map(w => (
              <button key={w.id} type="button" onClick={() => onOpen(w)} className="flex w-full items-center justify-between gap-2 border-b border-line py-2 text-left text-[13px] hover:bg-subtle">
                <span className="min-w-0 truncate text-ink2">{short(w.requestedAt)} · {walletMoney(w.amount, w.currency)}{w.method === 'manual' && w.status === 'PAID' ? ' · by our team' : ''}</span>
                <span className={clsx('inline-flex h-6 flex-shrink-0 items-center rounded-md px-2 text-[11.5px] font-bold', STATUS[w.status].cls)}>{STATUS[w.status].label}{w.status === 'AWAITING_APPROVAL' && w.approvalsNeeded > 1 ? ` · ${w.approvals}/${w.approvalsNeeded}` : ''}</span>
              </button>
            ))}
          </div>
        );
      })}
      {yearTotal > 0 && <p className="pt-2.5 text-xs text-muted">Withdrawn in {year}: <b className="text-navy">{walletMoney(yearTotal, d.currency ?? 'XAF')}</b></p>}
    </section>
  );
}

/**
 * The top of the earnings page for teachers, subject reviewers and country reps: what's theirs to take
 * and what becomes theirs day by day, a one-sheet withdraw with its own tracker, automatic payouts,
 * the safety card and the withdrawals by month.
 */
export function GetPaid() {
  const [d, setD] = useState<Paid | null>(null);
  const [dialog, setDialog] = useState<'withdraw' | 'setup' | 'change' | 'pin' | null>(null);
  const [receipt, setReceipt] = useState<WRow | null>(null);
  const load = useCallback(() => api.get('/me/get-paid').then(r => setD(r.data)).catch(e => notify.error(err(e, 'Could not load your balance'))), []);
  useEffect(() => { load(); }, [load]);
  if (!d) return <div className="h-64 animate-pulse rounded-[14px] bg-[#3F6FE8]/30" />;
  const c = d.currency ?? 'XAF', a = d.account;
  const canWithdraw = !!a && !a.readyAt && !a.lockedByUser && !d.paused && d.available >= Math.max(1, d.minimum);
  const strip = d.clearingByDay.slice(0, 7);
  const maxBar = Math.max(1, d.available, ...strip.map(x => x.amount));
  const AUTO = { weekly: 'every Friday', monthly: 'on the 1st', threshold: 'at a threshold' } as const;

  return (
    <>
      {!a ? (
        <PageHero kicker={`Get paid${d.balance > 0 ? ` · ${walletMoney(d.balance, c)} in your balance` : ''}`} l1="Set up how" l2="you get paid."
          sub="Add your MTN Mobile Money or Orange Money number and a 4-digit PIN. Then take your money whenever you like: it reaches your phone in about a minute. Elsewhere, our team pays you by hand."
          actions={<button type="button" onClick={() => setDialog('setup')} className={heroBtn}>Set it up</button>}
          aside={<>
            <p className={asideLabel}>Three short steps</p>
            {[['Your number', 'We check the name with MTN or Orange'], ['Choose a PIN', '4 digits, for every withdrawal'], ['Confirm with a code', 'We email you 6 digits']].map(([t, s], i) => (
              <div key={t} className="flex items-start gap-3">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[13px] font-extrabold text-[#2F57C9]">{i + 1}</span>
                <span><span className="block text-[13.5px] font-bold">{t}</span><span className="block text-xs text-muted">{s}</span></span>
              </div>
            ))}
          </>} />
      ) : (
        <PageHero
          kicker={`Get paid · ${a.label} ·· ${a.last}${a.holderName && a.nameCheck === 'match' ? ` · ${a.holderName} ✓` : ''}${a.autoMode ? ` · automatic ${AUTO[a.autoMode]}` : ''}`}
          l1={<><span className="text-[#FFFFFF]">{walletMoney(d.available, c)}</span><br />is yours to take.</>}
          sub={d.paused ? 'Withdrawals are paused for a short while. Your balance is safe.'
            : a.lockedByUser ? 'You locked withdrawals. Unlock them in Safety, below, with a code from your email.'
            : a.readyAt ? `Your payout number changed recently, so withdrawals to it open ${when(a.readyAt)}. If you didn’t change it, tell us straight away.`
            : <>{a.automatic ? `On your phone in about a minute.` : 'Our team pays it by hand, usually within 2 working days.'}{d.clearing ? ` Another ${walletMoney(d.clearing, c)} is on the way: it becomes yours over the next ${strip.filter(x => x.amount).length ? Math.max(1, strip.reduce((n, x, i) => (x.amount ? i + 1 : n), 0)) : 7} days, as each sale clears.` : ''}{d.available < d.minimum && d.available > 0 ? ` The smallest withdrawal is ${walletMoney(d.minimum, c)}.` : ''}</>}
          chips={[
            ...(d.sending ? [{ t: `${walletMoney(d.sending, c)} on its way`, strong: true }] : []),
            ...(!a.hasPin ? [{ t: 'Set your PIN', strong: true }] : []),
            ...(d.withdrawals.find(w => w.status === 'PAID') ? [{ t: `Last paid ${short(d.withdrawals.find(w => w.status === 'PAID')!.requestedAt)} · ${walletMoney(d.withdrawals.find(w => w.status === 'PAID')!.amount, c)}` }] : []),
          ]}
          actions={<>
            <button type="button" disabled={!canWithdraw} onClick={() => setDialog('withdraw')} className={clsx(heroBtnDark, 'disabled:opacity-60')}>Withdraw</button>
            <a href="#automatic" className={heroBtnLine}>{a.autoMode ? `Automatic: ${AUTO[a.autoMode]}` : 'Send it to me automatically'}</a>
          </>}
          aside={<>
            <p className={asideLabel}>Becoming yours this week</p>
            <div className="grid h-[96px] grid-cols-7 items-end gap-1.5" role="img" aria-label={`${walletMoney(d.available, c)} yours now, ${walletMoney(d.clearing, c)} clearing over the coming days`}>
              {strip.map((x, i) => {
                const amount = i === 0 ? d.available + x.amount : x.amount;
                return (
                  <div key={x.day} className="flex h-full flex-col items-center justify-end gap-1" title={`${i === 0 ? 'Today' : new Date(x.day).toLocaleDateString('en-GB', { weekday: 'long' })}: ${walletMoney(amount, c)}`}>
                    <span className={clsx('block w-full rounded', i === 0 ? 'bg-[#3F6FE8]' : amount ? 'bg-[#BFD0FA]' : 'bg-accent-soft')} style={{ height: `${Math.max(4, Math.round((amount / maxBar) * 70))}px` }} />
                    <span className="text-[10.5px] text-muted">{i === 0 ? 'Today' : new Date(x.day).toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                  </div>
                );
              })}
            </div>
            <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 border-t border-line pt-2.5 text-[13.5px]">
              <dt className="text-ink2">Yours now</dt><dd className="text-right font-bold">{walletMoney(d.available, c)}</dd>
              <dt className="text-ink2">Clearing</dt><dd className="text-right font-bold">{walletMoney(d.clearing, c)}</dd>
            </dl>
          </>}
        />
      )}

      {a && (
        <div className="grid items-start gap-4 [grid-template-columns:repeat(auto-fit,minmax(300px,1fr))]">
          <AutoCard d={d} onSaved={setD} />
          <SafetyCard d={d} onSaved={setD} onPin={() => setDialog('pin')} onChangeNumber={() => setDialog('change')} />
          <History d={d} onOpen={setReceipt} />
        </div>
      )}

      {dialog === 'withdraw' && <WithdrawSheet d={d} onClose={() => setDialog(null)} onDone={load} />}
      {(dialog === 'setup' || dialog === 'change') && <Setup start={dialog === 'change' ? a : null} onClose={() => setDialog(null)} onSaved={p => { setD(p); setDialog(null); }} />}
      {dialog === 'pin' && <PinDialog onClose={() => { setDialog(null); load(); }} />}
      {receipt && a && <ReceiptDialog w={receipt} account={a} onClose={() => setReceipt(null)} />}
    </>
  );
}
