'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SkeletonCard } from '@/components/ui/Skeleton';
import { minorToMajor } from '@cpa/shared';
import api from '@/lib/api';

const TRANZAK_CURRENCIES  = new Set(['XAF', 'XOF', 'RWF', 'UGX', 'TZS', 'MZN']);
const PAYSTACK_CURRENCIES = new Set(['NGN', 'GHS', 'ZAR', 'KES', 'EGP']);
const STRIPE_CURRENCIES   = new Set(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF']);

type Gateway      = 'paystack' | 'tranzak' | 'stripe';
type TranzakMode  = 'ussd' | 'web';
type Processing   = 'idle' | 'loading' | 'redirecting' | 'ussd_pending' | 'failed';

interface Course {
  id: string; title: string; description: string | null;
  priceAmount: number; priceCurrency: string; isSoldIndividually: boolean;
  programme: { name: string; shortName: string | null } | null;
  subject:   { name: string } | null;
  level:     { name: string } | null;
  teacher:   { email: string; name: string | null; firstName?: string | null; lastName?: string | null } | null;
  _count:    { modules: number; enrollments: number };
}
interface AppliedCoupon { code: string; discountType: 'PERCENT' | 'FIXED'; discountValue: number; }

function Spinner({ className = '' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

export default function CourseCheckoutPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();

  const [course,     setCourse]     = useState<Course | null>(null);
  const [loading,    setLoading]    = useState(true);

  // coupon
  const [couponInput, setCouponInput] = useState('');
  const [applying,    setApplying]    = useState(false);
  const [coupon,      setCoupon]      = useState<AppliedCoupon | null>(null);
  const [couponErr,   setCouponErr]   = useState('');

  // payment
  const [gateway,    setGateway]    = useState<Gateway>('paystack');
  const [tzMode,     setTzMode]     = useState<TranzakMode>('ussd');
  const [phone,      setPhone]      = useState('');
  const [processing, setProcessing] = useState<Processing>('idle');
  const [errorMsg,   setErrorMsg]   = useState('');

  useEffect(() => {
    api.get(`/platform-courses/${courseId}`)
      .then(r => {
        const c: Course = r.data;
        if (!c || !c.isSoldIndividually) { router.push(`/student/courses/${courseId}`); return; }
        setCourse(c);
        const cur = c.priceCurrency?.toUpperCase() ?? '';
        if (TRANZAK_CURRENCIES.has(cur)) setGateway('tranzak');
        else if (STRIPE_CURRENCIES.has(cur)) setGateway('stripe');
        else setGateway('paystack');
      })
      .catch(() => router.push('/student/catalogue'))
      .finally(() => setLoading(false));
  }, [courseId, router]);

  function calcDiscount(c: Course, coupon: AppliedCoupon | null): number {
    if (!coupon) return 0;
    // Prices and fixed coupon amounts are both in minor units, as the server charges them
    if (coupon.discountType === 'PERCENT') return Math.round(c.priceAmount * coupon.discountValue / 100);
    return Math.min(c.priceAmount, coupon.discountValue);
  }

  async function applyCode() {
    if (!couponInput.trim() || !course) return;
    setApplying(true); setCouponErr('');
    try {
      const r = await api.get(`/coupons/validate?code=${encodeURIComponent(couponInput.trim())}&courseId=${course.id}`);
      setCoupon({ code: couponInput.trim().toUpperCase(), ...r.data });
      setCouponInput('');
    } catch (e: any) {
      setCouponErr(e?.response?.data?.message ?? 'Invalid or expired coupon code');
    } finally {
      setApplying(false);
    }
  }

  async function handlePay() {
    if (!course) return;
    setProcessing('loading'); setErrorMsg('');
    try {
      const body: Record<string, any> = {};
      if (coupon) body.couponCode = coupon.code;
      if (gateway === 'tranzak') {
        body.mobileWalletNumber = phone.replace(/\D/g, '');
      }

      const { data } = await api.post(`/payments/create-course-checkout/${courseId}`, body);

      if (data.url) {
        setProcessing('redirecting');
        window.location.href = data.url;
      } else if (data.ussdPending) {
        setProcessing('ussd_pending');
        pollTranzak(data.sessionId);
      }
    } catch (e: any) {
      setProcessing('failed');
      setErrorMsg(e?.response?.data?.message ?? 'Payment could not be initiated. Please try again.');
    }
  }

  function pollTranzak(sessionId: string) {
    let attempts = 0;
    const iv = setInterval(async () => {
      attempts++;
      try {
        const { data } = await api.get(`/payments/verify-purchase?sessionId=${sessionId}`);
        if (data.completed) { clearInterval(iv); router.push(`/student/courses/success?courseId=${courseId}`); }
      } catch {}
      if (attempts >= 24) {
        clearInterval(iv);
        setProcessing('failed');
        setErrorMsg('Payment timed out. If you approved the prompt, please contact support.');
      }
    }, 5000);
  }

  // ── Skeleton ──────────────────────────────────────────────────
  if (loading || !course) return (
    <div className="flex flex-col min-h-full">
      <div className="flex h-14 items-center border-b border-cloud bg-white px-5 gap-3 animate-pulse">
        <div className="h-6 w-24 rounded-xl bg-cloud" />
        <div className="w-px h-4 bg-cloud mx-1" />
        <div className="h-3 w-48 rounded bg-cloud" />
      </div>
      <div className="max-w-5xl mx-auto w-full px-5 sm:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 space-y-4">
            <SkeletonCard lines={5} />
            <SkeletonCard lines={2} />
            <SkeletonCard lines={3} />
          </div>
          <div className="lg:col-span-2">
            <SkeletonCard lines={8} />
          </div>
        </div>
      </div>
    </div>
  );

  // ── USSD pending screen ────────────────────────────────────────
  if (processing === 'ussd_pending') return (
    <div className="flex flex-col min-h-full items-center justify-center px-5 py-20 gap-6 text-center">
      <div className="w-20 h-20 rounded-3xl bg-azure/10 flex items-center justify-center">
        <Icon name="phone" size={36} className="text-azure" />
      </div>
      <div className="max-w-sm">
        <h2 className="text-xl font-bold text-navy">Check your phone</h2>
        <p className="text-sm text-royal/50 mt-2 leading-relaxed">
          A payment prompt has been sent to{' '}
          <strong className="text-navy">{phone}</strong>.
          Approve it on your phone to complete your purchase.
        </p>
      </div>
      <div className="flex items-center gap-2 text-sm text-royal/40">
        <Spinner className="w-4 h-4 text-azure" /> Waiting for confirmation…
      </div>
      <button
        onClick={() => { setProcessing('idle'); setErrorMsg(''); }}
        className="text-sm text-royal/40 hover:text-navy underline underline-offset-4 transition"
      >
        Cancel and try again
      </button>
    </div>
  );

  // The teacher's name — never their email
  const teacherName = course.teacher ? course.teacher.name || [course.teacher.firstName, course.teacher.lastName].filter(Boolean).join(' ') || null : null;
  const cur         = course.priceCurrency?.toUpperCase() ?? '';
  const isTranzak   = TRANZAK_CURRENCIES.has(cur);
  const isStripe    = STRIPE_CURRENCIES.has(cur);
  const showTabs    = isTranzak;
  const discount    = calcDiscount(course, coupon);
  const finalPrice  = Math.max(0, course.priceAmount - discount);
  const phoneOk     = phone.replace(/\D/g, '').length >= 9;
  const canPay      = processing === 'idle' || processing === 'failed';
  const busy        = processing === 'loading' || processing === 'redirecting';
  const needsPhone  = gateway === 'tranzak' && tzMode === 'ussd';

  function fmtPrice(val: number) {
    return `${course!.priceCurrency} ${minorToMajor(val, course!.priceCurrency).toLocaleString('en-US')}`;
  }

  return (
    <div className="flex flex-col min-h-full bg-surface">

      {/* ── Header nav ── */}
      <header className="flex h-14 items-center border-b border-cloud bg-white px-5 gap-3 sticky top-0 z-20">
        <Link
          href={`/student/courses/${courseId}`}
          className="inline-flex items-center gap-1.5 text-sm text-royal/60 hover:text-navy transition"
        >
          <Icon name="arrowLeft" size={14} /> Back
        </Link>
        <div className="h-4 w-px bg-cloud mx-1" />
        <span className="text-sm text-royal/40 truncate">Checkout — {course.title}</span>
      </header>

      {/* ── Single grid — mirrors course detail layout ── */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-5 sm:px-8 pb-28 lg:pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-x-10 items-start">

          {/* ══════════════════════════════════════
              LEFT — Order summary  (3 / 5)
          ══════════════════════════════════════ */}
          <div className="lg:col-span-3">

            {/* Course summary hero */}
            <div className="py-8 sm:py-10 border-b border-cloud space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Order summary</p>
              <h2 className="text-xl font-bold text-navy leading-snug">{course.title}</h2>
              {course.description && (
                <p className="text-sm text-royal/50 leading-relaxed max-w-lg line-clamp-2">
                  {course.description}
                </p>
              )}
              <div className="flex flex-wrap items-center gap-3 pt-1 text-xs text-royal/50">
                {course.programme && (
                  <Badge variant="active">{course.programme.shortName ?? course.programme.name}</Badge>
                )}
                {course.subject && <Badge variant="default">{course.subject.name}</Badge>}
                <span className="flex items-center gap-1.5">
                  <Icon name="courses" size={13} className="text-royal/40" />
                  {course._count.modules} modules
                </span>
                <span className="flex items-center gap-1.5">
                  <Icon name="clock" size={13} className="text-royal/40" />
                  Lifetime access
                </span>
              </div>
              {teacherName && (
                <div className="flex items-center gap-2.5 pt-1">
                  <div className="w-7 h-7 rounded-full bg-azure/10 flex items-center justify-center text-xs font-bold text-azure flex-shrink-0">
                    {teacherName[0].toUpperCase()}
                  </div>
                  <span className="text-xs text-royal/50">
                    {teacherName}
                  </span>
                </div>
              )}
            </div>

            {/* Body sections */}
            <div className="py-8 space-y-6">

              {/* Coupon */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-3">Coupon code</p>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Icon name="tag" size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-royal/30 pointer-events-none" />
                    <input
                      value={couponInput}
                      onChange={e => { setCouponInput(e.target.value.toUpperCase()); setCouponErr(''); }}
                      onKeyDown={e => e.key === 'Enter' && applyCode()}
                      placeholder="Enter code"
                      disabled={!!coupon}
                      className="input-base pl-10 py-2.5 font-mono text-sm uppercase tracking-widest disabled:opacity-50"
                    />
                  </div>
                  {coupon ? (
                    <button
                      onClick={() => setCoupon(null)}
                      className="btn-secondary text-xs px-4 flex-shrink-0 flex items-center gap-1.5"
                    >
                      <Icon name="close" size={13} /> Remove
                    </button>
                  ) : (
                    <button
                      onClick={applyCode}
                      disabled={!couponInput.trim() || applying}
                      className="btn-primary text-xs px-4 flex-shrink-0 disabled:opacity-50"
                    >
                      {applying ? <Spinner className="w-4 h-4" /> : 'Apply'}
                    </button>
                  )}
                </div>
                {couponErr && (
                  <p className="text-xs text-red-500 mt-2 flex items-center gap-1.5">
                    <Icon name="close" size={12} /> {couponErr}
                  </p>
                )}
                {coupon && (
                  <p className="text-xs text-green-600 mt-2 flex items-center gap-1.5">
                    <Icon name="check" size={12} />
                    <strong>{coupon.code}</strong> —{' '}
                    {coupon.discountType === 'PERCENT'
                      ? `${coupon.discountValue}% off`
                      : `${fmtPrice(coupon.discountValue)} off`}
                  </p>
                )}
              </section>

              {/* Price breakdown */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-3">Price breakdown</p>
                <Card className="p-5">
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between text-royal/60">
                      <span>Course price</span>
                      <span>{fmtPrice(course.priceAmount)}</span>
                    </div>
                    {discount > 0 && (
                      <div className="flex justify-between text-green-600 font-medium">
                        <span>Discount ({coupon?.code})</span>
                        <span>−{fmtPrice(discount)}</span>
                      </div>
                    )}
                    <div className="border-t border-cloud pt-3 flex justify-between font-bold text-navy text-base">
                      <span>Total due today</span>
                      <span>{fmtPrice(finalPrice)}</span>
                    </div>
                  </div>
                </Card>
              </section>

            </div>
          </div>

          {/* ══════════════════════════════════════
              RIGHT — Payment  (2 / 5)
          ══════════════════════════════════════ */}
          <div className="lg:col-span-2">
            <div className="sticky top-20 pt-8 space-y-4">

              <Card className="overflow-hidden">

                {/* Price header */}
                <div className="px-6 pt-6 pb-5 border-b border-cloud">
                  <p className="text-3xl font-bold text-navy leading-none">{fmtPrice(finalPrice)}</p>
                  {discount > 0 && (
                    <p className="text-xs text-green-600 mt-1">You save {fmtPrice(discount)}</p>
                  )}
                  <p className="text-xs text-royal/40 mt-1">One-time · Lifetime access</p>
                </div>

                {/* Payment method */}
                <div className="px-6 py-5 space-y-4 border-b border-cloud">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Payment method</p>

                  {/* Gateway tabs — for Tranzak currencies */}
                  {showTabs && (
                    <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-surface border border-cloud">
                      {(['tranzak', 'paystack'] as Gateway[]).map(g => (
                        <button
                          key={g}
                          onClick={() => setGateway(g)}
                          className={`rounded-lg py-3 text-sm font-medium transition flex flex-col items-center gap-1.5 ${
                            gateway === g
                              ? 'bg-white shadow-sm text-navy border border-cloud'
                              : 'text-royal/40 hover:text-royal/60'
                          }`}
                        >
                          <Icon
                            name={g === 'paystack' ? 'card' : 'phone'}
                            size={20}
                            className={gateway === g ? 'text-azure' : 'text-royal/30'}
                          />
                          <span>{g === 'paystack' ? 'Paystack' : 'Tranzak'}</span>
                          <span className="text-[10px] font-normal text-royal/40">
                            {g === 'paystack' ? 'Card · Bank · USSD' : 'MoMo · Orange'}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Stripe description */}
                  {gateway === 'stripe' && (
                    <div className="rounded-xl bg-surface border border-cloud p-4 space-y-1.5">
                      <p className="text-xs font-semibold text-navy flex items-center gap-2">
                        <Icon name="card" size={14} className="text-azure" />
                        Credit / Debit Card
                      </p>
                      <p className="text-xs text-royal/50 leading-relaxed">
                        Pay securely with Visa, Mastercard, or American Express.
                        You&apos;ll be redirected to Stripe&apos;s secure checkout.
                      </p>
                    </div>
                  )}

                  {/* Paystack */}
                  {gateway === 'paystack' && (
                    <div className="rounded-xl bg-surface border border-cloud p-4 space-y-1.5">
                      <p className="text-xs font-semibold text-navy flex items-center gap-2">
                        <Icon name="card" size={14} className="text-azure" />
                        Card · Bank Transfer · USSD
                      </p>
                      <p className="text-xs text-royal/50 leading-relaxed">
                        Pay with any debit/credit card, bank transfer, or USSD across all major African banks.
                        You&apos;ll be redirected to Paystack&apos;s secure checkout.
                      </p>
                    </div>
                  )}

                  {/* Tranzak */}
                  {gateway === 'tranzak' && (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-1.5">
                        {(['ussd', 'web'] as TranzakMode[]).map(m => (
                          <button
                            key={m}
                            onClick={() => setTzMode(m)}
                            className={`rounded-lg py-2 text-xs font-medium transition border ${
                              tzMode === m
                                ? 'bg-azure/10 border-azure/30 text-azure'
                                : 'bg-surface border-cloud text-royal/40 hover:text-royal/60'
                            }`}
                          >
                            {m === 'ussd' ? '📲 USSD push' : '🌐 Web redirect'}
                          </button>
                        ))}
                      </div>

                      <div className="rounded-xl bg-surface border border-cloud p-4 space-y-1.5">
                        <p className="text-xs font-semibold text-navy flex items-center gap-2">
                          <Icon name="phone" size={14} className="text-azure" />
                          {tzMode === 'ussd' ? 'MTN MoMo · Orange Money — USSD' : 'MTN MoMo · Orange Money — Web'}
                        </p>
                        <p className="text-xs text-royal/50 leading-relaxed">
                          {tzMode === 'ussd'
                            ? 'Enter your mobile wallet number. A USSD prompt will be pushed directly to your phone — no redirect needed.'
                            : 'You\'ll be redirected to Tranzak\'s web payment page to complete the transaction.'}
                        </p>
                      </div>

                      {tzMode === 'ussd' && (
                        <div>
                          <label className="block text-xs font-medium text-navy mb-1.5">
                            Mobile wallet number
                          </label>
                          <div className="relative">
                            <Icon name="phone" size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-royal/30 pointer-events-none" />
                            <input
                              value={phone}
                              onChange={e => setPhone(e.target.value)}
                              placeholder="e.g. 237 680 657 567"
                              className="input-base pl-10 py-2.5 font-mono text-sm"
                            />
                          </div>
                          <p className="text-[11px] text-royal/40 mt-1.5">
                            Include country code — e.g. 237 for Cameroon
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* CTA */}
                <div className="px-6 py-5 space-y-3">
                  {processing === 'failed' && errorMsg && (
                    <div className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-100 px-4 py-3">
                      <Icon name="close" size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-red-600 leading-relaxed">{errorMsg}</p>
                    </div>
                  )}

                  <button
                    onClick={handlePay}
                    disabled={!canPay || busy || (needsPhone && !phoneOk)}
                    className="btn-primary w-full justify-center py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {busy ? (
                      <>
                        <Spinner className="w-4 h-4" />
                        {processing === 'redirecting' ? 'Redirecting…' : 'Processing…'}
                      </>
                    ) : needsPhone ? (
                      <><Icon name="phone" size={15} /> Send to my phone <Icon name="arrowRight" size={14} /></>
                    ) : (
                      <><Icon name="shield" size={15} /> Pay {fmtPrice(finalPrice)} <Icon name="arrowRight" size={14} /></>
                    )}
                  </button>

                  <div className="text-center space-y-1">
                    <p className="flex items-center justify-center gap-1.5 text-xs text-royal/40">
                      <Icon name="shield" size={12} /> 256-bit SSL · Secure payment
                    </p>
                    <p className="text-[11px] text-royal/30">
                      Powered by {gateway === 'tranzak' ? 'Tranzak' : gateway === 'stripe' ? 'Stripe' : 'Paystack'}
                    </p>
                  </div>
                </div>
              </Card>

              {/* What you get */}
              <Card className="p-5">
                <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-3">What you get</p>
                <ul className="space-y-2.5">
                  {[
                    `${course._count.modules} self-paced modules`,
                    'Lifetime access to all content',
                    'Certificate on completion',
                    'Graded quizzes and assignments',
                    'Expert-led instruction',
                  ].map(f => (
                    <li key={f} className="flex items-center gap-2.5 text-xs text-royal/60">
                      <Icon name="check" size={12} className="text-azure flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
              </Card>

            </div>
          </div>

        </div>
      </div>

      {/* ── Mobile sticky footer ── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white border-t border-cloud px-5 py-4 z-20 shadow-lg">
        <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
          <div>
            <p className="text-base font-bold text-navy">{fmtPrice(finalPrice)}</p>
            {discount > 0 && (
              <p className="text-xs text-green-600">−{fmtPrice(discount)} saved</p>
            )}
          </div>
          <button
            onClick={handlePay}
            disabled={!canPay || busy || (needsPhone && !phoneOk)}
            className="btn-primary flex-shrink-0 text-sm px-5 py-2.5 disabled:opacity-50"
          >
            {busy
              ? <Spinner className="w-4 h-4" />
              : <><span>Pay now</span><Icon name="arrowRight" size={14} /></>
            }
          </button>
        </div>
      </div>

    </div>
  );
}
