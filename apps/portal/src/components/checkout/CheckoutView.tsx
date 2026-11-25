'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';
import { Icon, type IconName } from '@/components/ui/Icon';
import { PayWindow } from './PayWindow';

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
  tranzak: { t: 'Card or mobile money with Tranzak', d: 'Tranzak’s secure page opens in a window here.', via: 'Tranzak' },
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
  /** Extras only, for a student who already has it: what to tick first (the price isn't charged again) */
  addLater?: AddOn[];
  /** The order card's banner: how many courses (or lessons), a cover, the teachers' photos */
  banner?: { count: number; unit: string; coverUrl?: string | null; faces: string[] };
}
interface Coupon { code: string; discountType: 'PERCENT' | 'FIXED'; discountValue: number }
/** Extras the course or package offers at checkout (priced by the server) */
interface Offers {
  live: { price: number; cohortName: string; teacher: string | null; next: string[] } | null;
  mentorship: { price: number; perMonth: number; sessions: number | null } | null;
  /** For a student who has it: extras already bought, and when access ends */
  owned?: boolean; bought?: AddOn[]; accessUntil?: string | null;
}
type AddOn = 'live' | 'mentorship';

const money = (minor: number, cur: string) => `${cur} ${minorToMajor(minor, cur).toLocaleString()}`;
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
  const [offers, setOffers] = useState<Offers | null>(null);
  const later = !!item.addLater;
  const [chosen, setChosen] = useState<Set<AddOn>>(new Set(item.addLater ?? []));
  const [left, setLeft] = useState(WAIT_SECS);
  const [couponOpen, setCouponOpen] = useState(false);
  const [payWin, setPayWin] = useState<{ url: string; sessionId: string } | null>(null);
  const [notice, setNotice] = useState('');
  const poll = useRef<ReturnType<typeof setInterval> | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = () => { if (poll.current) clearInterval(poll.current); if (tick.current) clearInterval(tick.current); };
  useEffect(() => stop, []);
  useEffect(() => { api.get(`/payments/add-ons/${item.kind}/${item.id}`).then(r => setOffers(r.data)).catch(() => setOffers(null)); }, [item.kind, item.id]);

  // Extras already bought aren't offered again
  const offered = (k: AddOn) => !!offers?.[k] && !(later && offers?.bought?.includes(k));
  const base = later ? 0 : item.priceAmount;
  const discount = !coupon ? 0 : coupon.discountType === 'PERCENT' ? Math.round(item.priceAmount * coupon.discountValue / 100) : Math.min(item.priceAmount, coupon.discountValue);
  // Coupons discount the course or package only; extras are added after
  const addOnLines = (['live', 'mentorship'] as AddOn[]).filter(k => chosen.has(k) && offered(k)).map(k => ({ k, price: offers![k]!.price }));
  const total = Math.max(0, base - discount) + addOnLines.reduce((n, l) => n + l.price, 0);
  const toggle = (k: AddOn) => setChosen(c => { const n = new Set(c); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const digits = phone.replace(/\D/g, '');
  const fullNumber = digits.startsWith(DIAL[cur] ?? '') ? digits : `${DIAL[cur] ?? ''}${digits}`;
  const phoneOk = method !== 'prompt' || fullNumber.length >= 11;
  const backToItem = item.kind === 'course' ? `/student/courses/${item.id}` : `/packages/${item.id}`;
  const successHref = later ? `${backToItem}?added=1` : item.kind === 'course' ? `/student/courses/success?courseId=${item.id}` : '/packages/success';
  const accessUntil = later ? (offers?.accessUntil ? new Date(offers.accessUntil) : null) : item.accessUntil;

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
      if (addOnLines.length) body.addOns = addOnLines.map(l => l.k);
      if (method === 'prompt') body.mobileWalletNumber = fullNumber;
      const { data } = later
        ? await api.post(`/payments/create-addon-checkout/${item.kind}/${item.id}`, body)
        : item.kind === 'course'
        ? await api.post(`/payments/create-course-checkout/${item.id}`, body)
        : await api.post('/payments/create-checkout-session', { ...body, packageId: item.id });
      // Tranzak's page opens in a window here; the others go to their own page and come back
      if (data.url && data.gateway === 'tranzak' && data.sessionId) { setNotice(''); setPayWin({ url: data.url, sessionId: data.sessionId }); return; }
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
  const payLabel = !method ? 'Payment not available' : method === 'prompt' ? `Send the prompt · ${money(total, cur)}` : `Pay ${money(total, cur)} with ${METHODS[method].via}`;
  const canPay = !!method && phoneOk && !busy && !(later && !addOnLines.length);
  const payButton = (cls: string) => (
    <button type="button" disabled={!canPay} onClick={pay} className={clsx('rounded-lg bg-azure-strong font-extrabold text-on-accent disabled:opacity-60', cls)}>{busy ? 'Starting payment…' : payLabel}</button>
  );
  const b = item.banner;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref={backHref} backLabel={backLabel} title={later ? `Add to your ${item.kind}` : 'Checkout'} />

      <div className="grid items-start gap-6 p-4 pb-28 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-7 lg:py-6">
        <div className="flex min-w-0 flex-col gap-4">
          <ol className="flex flex-wrap items-center gap-2.5 text-[13px]">
            {['Choose how to pay', method === 'prompt' ? 'Approve on your phone' : 'Approve the payment', 'Start learning'].map((t, i) => (
              <li key={t} className={clsx('flex items-center gap-2', i < stepNo ? 'text-navy' : 'text-muted', i === stepNo - 1 && 'font-extrabold')}>
                <span className={clsx('inline-flex h-[22px] w-[22px] items-center justify-center rounded-full text-xs font-bold',
                  i < stepNo ? 'bg-azure-strong text-on-accent' : 'border border-line bg-white text-muted')}>{i < stepNo - 1 ? '✓' : i + 1}</span>
                {t}{i < 2 && <span aria-hidden className="h-px w-8 bg-line" />}
              </li>
            ))}
          </ol>

          {step === 'choose' ? <>
            <section className="flex flex-col gap-2.5">
              <h2 className="text-[19px] font-extrabold text-navy">How do you want to pay?</h2>
              {!methods.length && <p className="rounded-xl border border-line bg-white p-4 text-[13px] text-ink2">Online payment isn’t available for {cur} yet. Please contact support to pay another way.</p>}
              {methods.map(m => (
                <div key={m} className="flex flex-col gap-2">
                  <label className={clsx('flex cursor-pointer items-center gap-3.5 rounded-xl border bg-white p-3.5 transition', method === m ? 'border-2 border-azure-strong bg-accent-soft' : 'border-line hover:bg-subtle')}>
                    <input type="radio" name="method" checked={method === m} onChange={() => setMethod(m)} className="sr-only" />
                    <MethodMark m={m} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-bold text-navy">{METHODS[m].t}</span>
                      <span className="mt-0.5 block text-[12.5px] text-ink2">{METHODS[m].d}</span>
                    </span>
                    <span aria-hidden className={clsx('h-[18px] w-[18px] flex-shrink-0 rounded-full', method === m ? 'border-[5px] border-azure-strong' : 'border-[1.5px] border-muted')} />
                  </label>
                  {/* The number goes right under mobile money */}
                  {m === 'prompt' && method === 'prompt' && (
                    <label className="ml-3.5 flex max-w-[420px] flex-col gap-1.5 border-l-2 border-azure-strong py-1 pl-4">
                      <span className={label}>Mobile money number</span>
                      <span className="flex h-11 items-center gap-2 rounded-lg border border-line bg-white px-3 focus-within:border-azure-strong">
                        <Icon name="phone" size={16} className="text-muted" />
                        {DIAL[cur] && <span className="text-sm text-muted">+{DIAL[cur]}</span>}
                        <input inputMode="tel" autoComplete="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="680 657 567" className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-navy outline-none" />
                      </span>
                      <span className="text-xs text-muted">We’ll send the prompt here. Approve it with your PIN.</span>
                    </label>
                  )}
                </div>
              ))}
              {method === 'tranzak' && (
                <p className="rounded-lg bg-subtle px-3.5 py-2.5 text-[13px] text-ink2">Tranzak’s secure page opens in a window over this one. You don’t leave CareerPath.</p>
              )}
              {method && method !== 'prompt' && method !== 'tranzak' && (
                <p className="rounded-lg bg-subtle px-3.5 py-2.5 text-[13px] text-ink2">You’ll go to {METHODS[method].via}’s secure page to pay, then come straight back here.</p>
              )}
            </section>

            {later && offers && !offered('live') && !offered('mentorship') && (
              <section className="rounded-xl border border-line bg-white p-5 text-[13.5px] text-ink2">You already have everything this {item.kind} offers.</section>
            )}
            {offers && (offered('live') || offered('mentorship')) && (
              <section className="flex flex-col gap-2.5">
                <h2 className="text-[19px] font-extrabold text-navy">{later ? `Add to your ${item.kind}` : 'Add to it'} <span className="text-[13px] font-semibold text-muted">{later ? 'added to the access you already have' : 'optional · only what this ' + item.kind + ' offers'}</span></h2>
                {offered('live') && offers.live && (
                  <Extra on={chosen.has('live')} onToggle={() => toggle('live')} icon="live" price={`+ ${money(offers.live.price, cur)}`}
                    title={`Live classes · ${offers.live.cohortName}`}
                    body={`${offers.live.teacher ? `With ${offers.live.teacher}, recorded` : 'Recorded'} so you can watch again.${offers.live.next[0] ? ` Next class ${new Date(offers.live.next[0]).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${new Date(offers.live.next[0]).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.` : ''}`} />
                )}
                {offered('mentorship') && offers.mentorship && (
                  <Extra on={chosen.has('mentorship')} onToggle={() => toggle('mentorship')} icon="mentorship" price={`+ ${money(offers.mentorship.price, cur)}`}
                    title={`${offers.mentorship.perMonth === 1 ? 'One mentor session' : `${offers.mentorship.perMonth} mentor sessions`} a month`}
                    body={`30 minutes one-to-one with a mentor you choose${offers.mentorship.sessions ? `, ${offers.mentorship.sessions} sessions over your access` : ''}.`} />
                )}
              </section>
            )}

            {!later && (coupon ? (
              <p className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-white px-4 py-3 text-[13.5px] text-ink2">
                <Icon name="tag" size={15} className="text-azure-strong" />
                <span className="min-w-0 flex-1">Coupon <strong className="tracking-[0.04em] text-navy">{coupon.code}</strong> · <span className="font-semibold text-azure-strong">{coupon.discountType === 'PERCENT' ? `${coupon.discountValue}% off` : `${money(coupon.discountValue, cur)} off`} · saves {money(discount, cur)}</span>{offers?.live || offers?.mentorship ? <span className="text-muted"> · not on extras</span> : null}</span>
                <button type="button" onClick={() => { setCoupon(null); setCouponInput(''); }} className="text-[13px] font-semibold text-muted hover:text-navy">Remove</button>
              </p>
            ) : couponOpen ? (
              <div className="flex flex-wrap items-start gap-2">
                <input autoFocus value={couponInput} onChange={e => setCouponInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') applyCoupon(); }} placeholder="Coupon code" aria-label="Coupon code" className="input-base max-w-[260px] uppercase tracking-[0.04em]" />
                <button type="button" disabled={!couponInput.trim() || applying} onClick={applyCoupon} className="h-[38px] rounded-lg border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-50">{applying ? 'Checking…' : 'Apply'}</button>
                {couponErr && <p className="basis-full text-[12.5px] text-error">{couponErr}</p>}
              </div>
            ) : (
              <button type="button" onClick={() => setCouponOpen(true)} className="inline-flex w-fit items-center gap-1.5 text-[13.5px] font-bold text-azure-strong hover:underline"><Icon name="tag" size={15} />Have a coupon?</button>
            ))}

            {notice && <p className="rounded-lg border border-line bg-white px-3.5 py-2.5 text-[13px] text-navy">{notice}</p>}
            {error && <p className="rounded-lg border border-error/30 bg-error/5 px-3.5 py-2.5 text-[13px] text-navy">{error}</p>}
          </> : (
            <section className="flex flex-col items-center gap-3 rounded-xl border-2 border-azure-strong bg-white px-6 py-10 text-center">
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-accent-soft text-azure-strong"><Icon name="phone" size={26} /></span>
              <p className="text-xl font-extrabold text-navy">Check your phone</p>
              <p className="max-w-[420px] text-sm text-ink2">We sent a payment prompt for <strong className="text-navy">{money(total, cur)}</strong> to +{fullNumber}. Approve it with your mobile money PIN.</p>
              <p className="mt-1.5 flex items-center gap-2 text-[13px] text-muted" aria-live="polite">
                <span className="h-2 w-2 animate-pulse rounded-full bg-azure-strong" /> Waiting for confirmation · {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')} left
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <button type="button" disabled={busy} onClick={() => { stop(); pay(); }} className="h-9 rounded-lg border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-60">Send the prompt again</button>
                <button type="button" onClick={() => { stop(); setStep('choose'); }} className="h-9 rounded-lg px-3.5 text-[13.5px] font-semibold text-muted hover:text-navy">Use another way to pay</button>
              </div>
            </section>
          )}
        </div>

        {/* The order, in the package's look: the count and the teachers on blue, what's in it, each line with its price */}
        <aside className="overflow-hidden rounded-2xl border border-line bg-white lg:sticky lg:top-4">
          <div className="keep-light relative h-[120px] overflow-hidden bg-[linear-gradient(125deg,#072061_0%,#1B3A94_55%,#2F57C9_100%)]">
            <span aria-hidden className="absolute -right-10 -top-8 h-[220px] w-[200px] -skew-x-[14deg] rounded-[40px_0_0_140px] bg-[linear-gradient(200deg,#8EA8FF,#3F6FE8_60%,#2F57C9)]" />
            {b?.coverUrl && <span className="absolute left-4 top-6 h-[78px] w-[78px] -rotate-[8deg] overflow-hidden rounded-xl bg-[#FFFFFF] shadow-[0_12px_24px_rgba(0,0,0,0.35)]"><img src={b.coverUrl} alt="" className="h-full w-full object-cover" /></span>}
            <span className={clsx('absolute top-4 flex h-[84px] w-[96px] -rotate-[4deg] flex-col items-center justify-center rounded-xl bg-[#FFFFFF] text-[#2F57C9] shadow-[0_12px_24px_rgba(0,0,0,0.35)]', b?.coverUrl ? 'left-[66px]' : 'left-4')}>
              <b className="text-[30px] leading-none">{b?.count ?? 1}</b><span className="mt-1 text-[9.5px] font-extrabold tracking-[0.07em] text-[#637090]">{(b?.unit ?? item.kind).toUpperCase()}{(b?.count ?? 1) === 1 ? '' : 'S'}</span>
            </span>
            {!!b?.faces.length && (
              <span className="absolute right-4 top-7 flex">
                {b.faces.slice(0, 3).map((f, i) => <span key={f + i} className={clsx('h-[58px] w-[58px] overflow-hidden rounded-[15px] bg-[#FFFDF8] shadow-[0_10px_22px_rgba(0,0,0,0.45)]', i ? '-ml-3 rotate-[5deg]' : '-rotate-[5deg]')}><img src={f} alt="" className="h-full w-full object-cover" /></span>)}
              </span>
            )}
          </div>
          <div className="flex flex-col gap-3 p-4">
            <div><p className="text-[16px] font-extrabold leading-snug text-navy">{item.title}</p><p className="mt-0.5 text-[12.5px] text-muted">{item.meta}</p></div>
            <ul className="flex flex-col gap-1.5 text-[13px] text-ink2">
              {item.includes.map(i => <li key={i} className="flex gap-2"><Icon name="check" size={15} className="mt-0.5 flex-shrink-0 text-[#2EAA5F]" />{i}</li>)}
            </ul>
            <dl className="flex flex-col gap-2 border-t border-line pt-3 text-[13.5px]">
              {!later && <div className="flex justify-between"><dt className="text-ink2">{item.kind === 'course' ? 'Course' : 'Package'}</dt><dd className="font-semibold text-navy">{money(item.priceAmount, cur)}</dd></div>}
              {later && <div className="flex justify-between"><dt className="text-ink2">{item.kind === 'course' ? 'Course' : 'Package'}</dt><dd className="text-muted">Already yours</dd></div>}
              {coupon && <div className="flex justify-between"><dt className="text-ink2">Coupon {coupon.code}</dt><dd className="font-semibold text-azure-strong">− {money(discount, cur)}</dd></div>}
              {addOnLines.map(l => <div key={l.k} className="flex justify-between"><dt className="text-ink2">{l.k === 'live' ? 'Live classes' : 'Mentoring'}</dt><dd className="font-semibold text-navy">{money(l.price, cur)}</dd></div>)}
              <div className="flex justify-between border-t border-line pt-2 text-[18px] font-extrabold text-navy"><dt>Total</dt><dd>{money(total, cur)}</dd></div>
            </dl>
            {step === 'choose' && payButton('hidden h-12 w-full text-[15px] lg:block')}
            <p className="flex gap-2 text-[12.5px] leading-relaxed text-ink2">
              <Icon name="shield" size={15} className="mt-0.5 flex-shrink-0 text-muted" />
              <span>{chosen.has('live') && offers?.live ? <>You join {offers.live.cohortName} straight after paying. </> : null}{chosen.has('mentorship') && offers?.mentorship ? <>You can book your first mentor session straight away. </> : null}{later ? 'Extras start as soon as the payment is confirmed and last as long as your access' : 'Access starts as soon as the payment is confirmed'}{accessUntil
                ? <>{later ? ', until' : ' and runs until'} <strong className="text-navy">{accessUntil.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</strong>.</>
                : <>, with no time limit.</>} Receipt by email and in Billing.</span>
            </p>
          </div>
        </aside>
      </div>

      {payWin && (
        <PayWindow url={payWin.url} sessionId={payWin.sessionId} amount={money(total, cur)} title={item.title} successHref={successHref}
          onClose={why => { setPayWin(null); setNotice(why === 'cancelled' ? 'Payment cancelled on Tranzak. Pick a way to pay to try again.' : 'Payment window closed and no payment reached us. Pick a way to pay to try again.'); }} />
      )}

      {/* Phones: the total and the button stay in reach */}
      {step === 'choose' && (
        <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-line bg-white px-4 py-3 lg:hidden" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
          <span className="min-w-0"><span className="block text-[11.5px] text-muted">Total</span><b className="block text-[18px] leading-tight text-navy">{money(total, cur)}</b></span>
          {payButton('h-11 flex-1 px-3 text-[14px]')}
        </div>
      )}
    </div>
  );
}

/** The mark for a way to pay: MTN and Orange for mobile money, a card for the rest */
function MethodMark({ m }: { m: Method }) {
  if (m === 'prompt') return (
    <span aria-hidden className="keep-light flex flex-shrink-0 gap-1">
      <span className="flex h-[30px] w-[40px] items-center justify-center rounded-md bg-[#FFCC00] text-[10.5px] font-black text-[#000000]">MTN</span>
      <span className="flex h-[30px] w-[40px] items-center justify-center rounded-md bg-[#FF7900] text-[10.5px] font-black text-[#FFFFFF]">OM</span>
    </span>
  );
  return <span aria-hidden className="flex h-[30px] w-[84px] flex-shrink-0 items-center justify-center rounded-md bg-subtle text-muted"><Icon name={m === 'tranzak' ? 'shield' : 'card'} size={17} /></span>;
}

/** An extra at checkout: a switch with its price */
function Extra({ on, onToggle, icon, title, body, price }: { on: boolean; onToggle: () => void; icon: IconName; title: string; body: string; price: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={onToggle}
      className={clsx('flex items-center gap-3.5 rounded-xl border bg-white p-3.5 text-left transition', on ? 'border-azure-strong bg-accent-soft' : 'border-line hover:bg-subtle')}>
      <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-azure-strong"><Icon name={icon} size={17} /></span>
      <span className="min-w-0 flex-1"><span className="block text-[14.5px] font-bold text-navy">{title}</span><span className="mt-0.5 block text-[12.5px] text-ink2">{body}</span></span>
      <span className="whitespace-nowrap text-[14px] font-extrabold text-navy">{price}</span>
      <span aria-hidden className={clsx('relative h-[22px] w-[38px] flex-shrink-0 rounded-full transition', on ? 'bg-azure-strong' : 'bg-line')}>
        <span className={clsx('absolute top-[3px] h-4 w-4 rounded-full bg-[#FFFFFF] shadow transition-all', on ? 'left-[19px]' : 'left-[3px]')} />
      </span>
    </button>
  );
}

/** The same day n months later, clamped to the month's last day */
export function addMonths(d: Date, n: number) {
  const r = new Date(d); const day = r.getDate();
  r.setDate(1); r.setMonth(r.getMonth() + n);
  r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  return r;
}
