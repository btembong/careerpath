'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import { money } from '@/lib/money';
import api from '@/lib/api';

interface Access { kind: 'package' | 'course' | 'free'; id: string; title: string; detail: string; examDate: string | null; expiresAt: string | null; pctUsed: number; daysLeft: number | null; ended: boolean; href: string }
interface Payment { id: string; kind: 'package' | 'course' | 'addon'; title: string; at: string; amount: number; currency: string; method: string; invoiceNo: string | null }
interface Data { access: Access[]; payments: Payment[]; paidThisYear: { currency: string; amount: number }[] }

const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();

function left(a: Access) {
  if (!a.expiresAt) return 'No end date';
  if (a.ended) return `Ended ${date(a.expiresAt)}`;
  const d = a.daysLeft ?? 0;
  const span = d <= 31 ? `${d} day${d === 1 ? '' : 's'} left` : `${Math.round(d / 30)} months left`;
  return `Ends ${date(a.expiresAt)} · ${span}${a.examDate && sameDay(a.examDate, a.expiresAt) ? ', the day of your exam' : ''}`;
}

export default function BillingPage() {
  const [d, setD] = useState<Data | null>(null);
  const [ref, setRef] = useState<{ totalReferrals: number; enrolled: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.get('/payments/me/billing').then(r => setD(r.data)).catch(e => notify.error(e?.response?.data?.message ?? 'Could not load your billing'));
    api.get('/referrals/stats').then(r => setRef(r.data)).catch(() => {});
  }, []);

  async function receipt(p: Payment) {
    setBusy(p.id);
    try {
      const r = await api.get(`/payments/me/receipts/${p.kind}/${p.id}`, { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.data);
      a.download = `receipt-${(p.invoiceNo ?? p.id.slice(0, 8)).replace(/[^\w-]/g, '')}.pdf`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch { notify.error('Could not download the receipt'); }
    finally { setBusy(null); }
  }

  const year = new Date().getFullYear();
  const paid = d?.paidThisYear.length ? d.paidThisYear.map(x => money(x.amount, x.currency)).join(' + ') : null;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Billing" subtitle="What you have access to, what you’ve paid, and your receipts" />
      <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
        <div className="flex min-w-0 flex-[999_1_540px] flex-col gap-4">
          <section className="flex flex-col gap-2.5">
            <h2 className="text-[16px] font-bold text-navy">Your access</h2>
            {!d ? [1, 2].map(i => <div key={i} className="h-[92px] animate-pulse rounded-lg border border-line bg-white" />) : d.access.length ? d.access.map(a => {
              // Ending within two weeks (or ended): offer to extend a paid package or course
              const warn = a.kind !== 'free' && a.expiresAt != null && (a.ended || (a.daysLeft ?? 99) <= 14);
              const extendHref = a.kind === 'package' ? a.href : `/courses/${a.id}`;
              return (
                <article key={a.kind + a.id} className={clsx('flex flex-wrap items-center gap-4 rounded-lg border bg-white px-[18px] py-4', warn ? 'border-azure' : 'border-line')}>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14.5px] font-bold text-navy">{a.title}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">{a.detail}</p>
                    <span className="mt-2 block h-1.5 rounded-[3px] bg-subtle"><span className="block h-1.5 rounded-[3px] bg-azure" style={{ width: `${a.ended ? 100 : a.pctUsed}%` }} /></span>
                    <p className="mt-1 text-[12px] text-muted">{left(a)}</p>
                  </div>
                  <Link href={warn ? extendHref : a.href}
                    className={clsx('inline-flex h-[34px] items-center rounded-md px-3.5 text-[13px] font-semibold', warn ? 'bg-azure-strong text-white' : 'border border-line text-navy hover:bg-subtle')}>
                    {warn ? (a.ended ? 'Renew access' : 'Extend access') : a.kind === 'package' ? 'Open package' : 'Open course'}
                  </Link>
                </article>
              );
            }) : (
              <div className="rounded-lg border border-line bg-white px-5 py-8 text-center text-[13.5px] text-ink2">
                Nothing yet. <Link href="/student/catalogue" className="font-semibold text-azure-strong hover:underline">Browse courses</Link> or <Link href="/packages" className="font-semibold text-azure-strong hover:underline">see packages</Link>.
              </div>
            )}
          </section>

          <section className="rounded-lg border border-line bg-white">
            <div className="flex flex-wrap justify-between gap-2 border-b border-line px-[18px] py-3.5">
              <h2 className="text-[16px] font-bold text-navy">Payments</h2>
              {paid && <span className="text-[13px] text-muted">{paid} paid in {year}</span>}
            </div>
            {!d ? <div className="m-4 h-32 animate-pulse rounded-md bg-subtle" /> : d.payments.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-[13.5px]">
                  <thead><tr>{['What', 'Date', 'Paid with', 'Amount', ''].map((c, i) => <th key={i} className="border-b border-line px-[18px] py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{c}</th>)}</tr></thead>
                  <tbody>
                    {d.payments.map(p => (
                      <tr key={p.kind + p.id}>
                        <td className="border-b border-line px-[18px] py-3"><strong className="text-navy">{p.title}</strong><br /><span className="text-[12.5px] text-muted">{p.amount ? p.invoiceNo ?? `CPA-${p.id.slice(0, 8).toUpperCase()}` : 'Free'}</span></td>
                        <td className="border-b border-line px-[18px] py-3 text-ink2">{date(p.at)}</td>
                        <td className="border-b border-line px-[18px] py-3 text-ink2">{p.amount ? p.method : '—'}</td>
                        <td className="border-b border-line px-[18px] py-3 font-bold text-navy">{money(p.amount, p.currency)}</td>
                        <td className="border-b border-line px-[18px] py-3 text-right">
                          <button onClick={() => receipt(p)} disabled={busy === p.id} className="font-semibold text-azure-strong hover:underline disabled:opacity-50">{busy === p.id ? 'Preparing…' : 'Receipt (PDF)'}</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="px-4 py-10 text-center text-[13px] text-ink2">No payments yet.</p>}
          </section>
        </div>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
          <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
            <h3 className="text-[15px] font-semibold text-navy">Refer a friend</h3>
            <p className="text-[13px] text-ink2">
              {ref && ref.totalReferrals > 0
                ? `${ref.totalReferrals} friend${ref.totalReferrals === 1 ? '' : 's'} joined with your link${ref.enrolled ? `, ${ref.enrolled} now learning` : ''}. Share it with classmates preparing for the same exam.`
                : 'Share your link with classmates preparing for the same exam and study together.'}
            </p>
            <Link href="/student/referrals" className="text-[13px] font-semibold text-azure-strong hover:underline">Get your link</Link>
          </section>
          <PaymentCheck onFound={() => api.get('/payments/me/billing').then(r => setD(r.data)).catch(() => {})} />
          <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
            <h3 className="text-[15px] font-semibold text-navy">A problem with a payment?</h3>
            <p className="text-[13px] text-ink2">Charged twice, or something else? Send us the receipt number and we’ll sort it within a day.</p>
            <Link href="/student/support" className="text-[13px] font-semibold text-azure-strong hover:underline">Contact billing support</Link>
          </section>
        </aside>
      </div>
    </div>
  );
}

interface CheckResult { checked: number; delivered: number; results: { title: string; amount: number; currency: string; at: string; status: string; delivered: boolean }[] }

/** "Paid but can't see your course?": ask the payment provider directly, and get access if it went through */
function PaymentCheck({ onFound }: { onFound: () => void }) {
  const [state, setState] = useState<'idle' | 'checking' | 'done'>('idle');
  const [res, setRes] = useState<CheckResult | null>(null);
  async function run() {
    setState('checking');
    try { const r = await api.post('/payments/me/check'); setRes(r.data); if (r.data.delivered) onFound(); }
    catch (e: any) { notify.error(e?.response?.status === 429 ? 'Please wait a minute before checking again' : 'Could not reach the payment provider'); }
    finally { setState('done'); }
  }
  const found = res?.results.filter(r => r.delivered) ?? [];
  return (
    <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-white p-4">
      <h3 className="text-[15px] font-semibold text-navy">{state === 'checking' ? 'Checking your payment…' : 'Paid but can’t see your course?'}</h3>
      {state === 'checking' && <span className="block h-1.5 overflow-hidden rounded-[3px] bg-subtle"><span className="block h-1.5 w-3/5 animate-pulse rounded-[3px] bg-azure" /></span>}
      {state !== 'done' && <p className="text-[13px] text-ink2">We ask the payment provider directly. If they say it went through, you get access right away.</p>}
      {state === 'done' && res && (found.length ? (
        <div className="rounded-lg bg-accent-soft px-3.5 py-3 text-[13.5px] text-navy">
          {found.map((f, i) => <p key={i}><strong>Found it — paid {money(f.amount, f.currency)} on {new Date(f.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.</strong> {f.title} is now yours.</p>)}
        </div>
      ) : (
        <p className="text-[13px] text-ink2">{res.checked ? 'The provider says your recent payments didn’t go through, so nothing was taken — or it will be returned within 3 working days.' : 'We couldn’t find a payment from you in the last 7 days.'} Still stuck? <Link href="/student/support" className="font-semibold text-azure-strong hover:underline">Tell us</Link>.</p>
      ))}
      {found.length > 0
        ? <Link href="/student/courses" className="inline-flex h-9 items-center self-start rounded-md bg-azure-strong px-3.5 text-[13.5px] font-semibold text-on-accent">Go to my courses</Link>
        : <button onClick={run} disabled={state === 'checking'} className="self-start text-[13px] font-semibold text-azure-strong hover:underline disabled:opacity-50">{state === 'done' ? 'Check again' : 'Check my payment'}</button>}
    </section>
  );
}
