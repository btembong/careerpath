'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';

/**
 * One checkout for single courses and packages. The server picks the payment gateway from the
 * price's currency, so only the methods that work for that currency are offered.
 */
const TRANZAK = new Set(['XAF', 'XOF', 'RWF', 'UGX', 'TZS', 'MZN']);
const PAYSTACK = new Set(['NGN', 'GHS', 'ZAR', 'KES', 'EGP']);
const STRIPE = new Set(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF']);
const DIAL: Record<string, string> = { XAF: '237', XOF: '225', RWF: '250', UGX: '256', TZS: '255', MZN: '258' };
const WAIT_SECS = 120;

type Method = 'prompt' | 'tranzak' | 'paystack' | 'stripe';
const METHODS: Record<Method, { t: string; d: string; via: string }> = {
  prompt: { t: 'MTN MoMo or Orange Money', d: 'A prompt is sent to your phone. No card needed.', via: 'Tranzak' },
  tranzak: { t: 'Mobile money on Tranzak’s page', d: 'Pay on Tranzak’s secure page, then come back here.', via: 'Tranzak' },
  paystack: { t: 'Card, bank transfer, USSD or mobile money', d: 'Any African bank card or account.', via: 'Paystack' },
  stripe: { t: 'International card', d: 'Visa, Mastercard or American Express.', via: 'Stripe' },
};

export interface CheckoutItem {
  kind: 'course' | 'package';
  id: string;
  title: string;
  meta: string;
  includes: string[];
  priceAmount: number;
  currency: string;
  /** When access would end if bought today; null = no time limit */
  accessUntil: Date | null;
}
interface Coupon { code: string; discountType: 'PERCENT' | 'FIXED'; discountValue: number }

const money = (minor: number, cur: string) => `${cur} ${minorToMajor(minor, cur).toLocaleString()}`;
const abbr = (t: string) => t.split(/[\s·—-]+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'C';
const label = 'text-[13px] font-semibold text-navy';

export function CheckoutView({ item, backHref, backLabel }: { item: CheckoutItem; backHref: string; backLabel: string }) {
  const router = useRouter();
  const cur = item.currency.toUpperCase();
  const methods: Method[] = TRANZAK.has(cur) ? ['prompt', 'tranzak'] : PAYSTACK.has(cur) ? ['paystack'] : STRIPE.has(cur) ? ['stripe'] : [];
  const [method, setMethod] = useState<Method | null>(methods[0] ?? null);
  const [phone, setPhone] = useState('');
  const [couponInput, setCouponInput] = useState('');
  const [coupon, setCoupon] = useState<Coupon | null>(null);
  const [couponErr, setCouponErr] = useState('');
  const [applying, setApplying] = useState(false);
  const [step, setStep] = useState<'choose' | 'waiting'>('choose');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [left, setLeft] = useState(WAIT_SECS);
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (poll.current) clearInterval(poll.current); if (tick.current) clearInterval(tick.current); };
  useEffect(() => stop, []);

  const discount = !coupon ? 0 : coupon.discountType === 'PERCENT' ? Math.round(item.priceAmount * coupon.discountValue / 100) : Math.min(item.priceAmount, coupon.discountValue);
  const total = Math.max(0, item.priceAmount - discount);
  const digits = phone.replace(/\D/g, '');
  const fullNumber = digits.startsWith(DIAL[cur] ?? '') ? digits : `${DIAL[cur] ?? ''}${digits}`;
  const phoneOk = method !== 'prompt' || fullNumber.length >= 11;
  const successHref = item.kind === 'course' ? `/student/courses/success?courseId=${item.id}` : '/packages/success';

  async function applyCoupon() {
    if (!couponInput.trim()) return;
    setApplying(true); setCouponErr('');
    try {
      const r = await api.get('/coupons/validate', { params: { code: couponInput.trim(), [item.kind === 'course' ? 'courseId' : 'packageId']: item.id } });
      setCoupon({ code: couponInput.trim().toUpperCase(), ...r.data });
    } catch (e: any) { setCouponErr(e?.response?.data?.message ?? 'That code isn’t valid or has expired'); }
    finally { setApplying(false); }
  }

  async function pay() {
    if (!method) return;
    setBusy(true); setError('');
    try {
      const body: Record<string, unknown> = {};
      if (coupon) body.couponCode = coupon.code;
      if (method === 'prompt') body.mobileWalletNumber = fullNumber;
      const { data } = item.kind === 'course'
        ? await api.post(`/payments/create-course-checkout/${item.id}`, body)
        : await api.post('/payments/create-checkout-session', { ...body, packageId: item.id });
      if (data.url) { window.location.href = data.url; return; }
      if (data.ussdPending || data.ussdPush) { wait(data.sessionId); return; }
      setError('The payment could not be started. Please try again.');
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'The payment could not be started. Please try again.');
    } finally { setBusy(false); }
  }

  function wait(sessionId: string) {
    stop();
    setStep('waiting'); setLeft(WAIT_SECS);
    tick.current = setInterval(() => setLeft(s => Math.max(0, s - 1)), 1000);
    let tries = 0;
    poll.current = setInterval(async () => {
      tries++;
      try {
        const { data } = await api.get('/payments/verify-purchase', { params: { sessionId } });
        if (data.completed) { stop(); router.push(successHref); return; }
      } catch {}
      if (tries >= WAIT_SECS / 5) {
        stop(); setStep('choose');
        setError('We didn’t get a confirmation in time. If money left your account, contact support with your phone number; otherwise try again.');
      }
    }, 5000);
  }

  const stepNo = step === 'waiting' ? 2 : 1;
  const payLabel = !method ? 'Payment not available' : method === 'prompt' ? `Send payment prompt · ${money(total, cur)}` : `Pay ${money(total, cur)} with ${METHODS[method].via}`;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref={backHref} backLabel={backLabel} title="Checkout" />

      <div className="flex flex-wrap items-start gap-6 p-4 lg:px-7 lg:py-6">
        <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4">
          <ol className="flex flex-wrap items-center gap-2 text-[13px]">
            {['Choose how to pay', 'Approve the payment', 'Start learning'].map((t, i) => (
              <li key={t} className={clsx('flex items-center gap-2', i < stepNo ? 'text-navy' : 'text-muted', i === stepNo - 1 && 'font-bold')}>
                <span className={clsx('inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-xs font-bold',
                  i < stepNo - 1 ? 'bg-azure-strong text-on-accent' : i === stepNo - 1 ? 'border border-azure-strong bg-white text-azure-strong' : 'border border-line bg-white text-muted')}>{i + 1}</span>
                {t}{i < 2 && <span className="text-line">——</span>}
              </li>
            ))}
          </ol>

          {step === 'choose' ? <>
            <section className="flex flex-col gap-3 rounded-lg border border-line bg-white p-5">
              <h2 className="text-base font-bold text-navy">How do you want to pay?</h2>
              {!methods.length && <p className="text-[13px] text-ink2">Online payment isn’t available for {cur} yet. Please contact support to pay another way.</p>}
              {methods.map(m => (
                <label key={m} className={clsx('flex cursor-pointer gap-3 rounded-lg border p-3.5', method === m ? 'border-azure bg-accent-soft' : 'border-line hover:bg-subtle')}>
                  <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} className="mt-1 accent-[var(--color-azure-strong)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold text-navy">{METHODS[m].t}</span>
                    <span className="mt-0.5 block text-[12.5px] text-ink2">{METHODS[m].d}</span>
                  </span>
                  <span className="text-xs font-semibold text-muted">{METHODS[m].via}</span>
                </label>
              ))}
              {method === 'prompt' && (
                <label className="flex max-w-[360px] flex-col gap-1.5"><span className={label}>Mobile money number</span>
                  <span className="flex h-10 items-center gap-2 rounded-md border border-line bg-white px-3 focus-within:border-azure">
                    {DIAL[cur] && <span className="text-sm text-muted">+{DIAL[cur]}</span>}
                    <input inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="680 657 567" className="min-w-0 flex-1 bg-transparent text-sm text-navy outline-none" />
                  </span>
                  <span className="text-xs text-muted">We’ll send a prompt to this phone. Approve it with your PIN.</span>
                </label>
              )}
              {method && method !== 'prompt' && (
                <p className="rounded-md bg-subtle px-3 py-2.5 text-[13px] text-ink2">You’ll go to {METHODS[method].via}’s secure page to pay, then come straight back here.</p>
              )}
            </section>

            <section className="flex flex-wrap items-end gap-2 rounded-lg border border-line bg-white px-5 py-4">
              {coupon ? (
                <div className="flex flex-1 flex-wrap items-center gap-2">
                  <p className="min-w-0 flex-1 text-[13.5px] text-ink2">
                    Coupon <strong className="tracking-[0.04em] text-navy">{coupon.code}</strong> · <span className="font-semibold text-azure-strong">
                      {coupon.discountType === 'PERCENT' ? `${coupon.discountValue}% off` : `${money(coupon.discountValue, cur)} off`} · saves {money(discount, cur)}</span>
                  </p>
                  <button type="button" onClick={() => { setCoupon(null); setCouponInput(''); }} className="text-[13px] font-semibold text-muted hover:text-navy">Remove</button>
                </div>
              ) : <>
                <label className="flex min-w-[200px] flex-1 flex-col gap-1.5"><span className={label}>Coupon code</span>
                  <input value={couponInput} onChange={e => setCouponInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyCoupon(); }} placeholder="Optional" className="input-base uppercase tracking-[0.04em]" />
                </label>
                <button type="button" disabled={!couponInput.trim() || applying} onClick={applyCoupon}
                  className="h-[38px] rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-50">{applying ? 'Checking…' : 'Apply'}</button>
                {couponErr && <p className="basis-full text-[12.5px] text-error">{couponErr}</p>}
              </>}
            </section>

            {error && <p className="rounded-md border border-error/30 bg-error/5 px-3.5 py-2.5 text-[13px] text-navy">{error}</p>}
            <button type="button" disabled={!method || !phoneOk || busy} onClick={pay}
              className="h-[46px] rounded-md bg-azure-strong text-[15px] font-bold text-on-accent disabled:opacity-60">{busy ? 'Starting payment…' : payLabel}</button>
            <p className="text-center text-[12.5px] text-muted">Secure payment · your receipt is emailed and saved in Billing</p>
          </> : (
            <section className="flex flex-col items-center gap-3 rounded-lg border border-azure bg-white px-6 py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-lg bg-accent-soft text-azure-strong">
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 3h10v18H7zM11 18h2" /></svg>
              </span>
              <p className="text-xl font-extrabold text-navy">Check your phone</p>
              <p className="max-w-[420px] text-sm text-ink2">We sent a payment prompt for <strong className="text-navy">{money(total, cur)}</strong> to +{fullNumber}. Approve it with your mobile money PIN.</p>
              <p className="mt-1.5 flex items-center gap-2 text-[13px] text-muted" aria-live="polite">
                <span className="h-2 w-2 animate-pulse rounded-full bg-azure-strong" /> Waiting for confirmation · {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <button type="button" disabled={busy} onClick={() => { stop(); pay(); }} className="h-9 rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-60">Send the prompt again</button>
                <button type="button" onClick={() => { stop(); setStep('choose'); }} className="h-9 rounded-md px-3.5 text-[13.5px] font-semibold text-muted hover:text-navy">Use another way to pay</button>
              </div>
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 rounded-lg border border-line bg-white p-5">
          <h2 className="text-[15px] font-semibold text-navy">Your order</h2>
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-accent-soft text-sm font-extrabold text-azure-strong">{abbr(item.title)}</span>
            <div className="min-w-0">
              <p className="text-[14.5px] font-semibold text-navy">{item.title}</p>
              <p className="mt-0.5 text-[12.5px] text-muted">{item.meta}</p>
            </div>
          </div>
          <ul className="flex flex-col gap-1.5 text-[13px] text-ink2">
            {item.includes.map(i => (
              <li key={i} className="flex gap-2"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 flex-shrink-0 text-azure-strong"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{i}</li>
            ))}
          </ul>
          <dl className="flex flex-col gap-2 border-t border-line pt-3 text-[13.5px]">
            <div className="flex justify-between"><dt className="text-ink2">Price</dt><dd className="text-navy">{money(item.priceAmount, cur)}</dd></div>
            {coupon && <div className="flex justify-between"><dt className="text-ink2">Coupon {coupon.code}</dt><dd className="font-semibold text-azure-strong">− {money(discount, cur)}</dd></div>}
            <div className="flex justify-between border-t border-line pt-2 text-base font-extrabold text-navy"><dt>Total</dt><dd>{money(total, cur)}</dd></div>
          </dl>
          <p className="rounded-md bg-subtle px-3 py-2.5 text-[12.5px] text-ink2">
            Access starts as soon as the payment is confirmed{item.accessUntil
              ? <> and runs until <strong className="text-navy">{item.accessUntil.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</>
              : <>, with no time limit.</>}
          </p>
        </aside>
      </div>
    </div>
  );
}

/** The same day n months later, clamped to the month's last day */
export function addMonths(d: Date, n: number) {
  const r = new Date(d); const day = r.getDate();
  r.setDate(1); r.setMonth(r.getMonth() + n);
  r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  return r;
}
