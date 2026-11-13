'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import { walletMoney } from '@/components/wallet/WalletCharts';
import api from '@/lib/api';

type Kind = 'package' | 'course' | 'extra' | 'free';
interface Access { kind: Kind; id: string; title: string; detail: string; examDate: string | null; startedAt: string; expiresAt: string | null; pctUsed: number; daysLeft: number | null; ended: boolean; href: string }
interface Payment { id: string; kind: 'package' | 'course' | 'addon'; title: string; at: string; amount: number; currency: string; method: string; invoiceNo: string | null }
interface Data { access: Access[]; payments: Payment[]; paidThisYear: { currency: string; amount: number }[] }

const COLOUR: Record<Kind, string> = { package: '#2a78d6', course: '#1baf7a', extra: '#eda100', free: '#9AA6C2' };
const NAME: Record<Kind, string> = { package: 'Package', course: 'Course', extra: 'Extra', free: 'Free' };
const DAY = 86_400_000;
const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const long = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const sameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString();
const payKind = (p: Payment): Kind => (p.kind === 'addon' ? 'extra' : !p.amount ? 'free' : p.kind);

export default function BillingPage() {
  const [d, setD] = useState<Data | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [ref, setRef] = useState<{ totalReferrals: number; enrolled: number } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [row, setRow] = useState(0);
  const [tab, setTab] = useState<'all' | 'package' | 'course' | 'extra'>('all');

  const load = () => api.get('/payments/me/billing').then(r => setD(r.data)).catch(e => notify.error(e?.response?.data?.message ?? 'Could not load your billing'));
  useEffect(() => {
    load();
    api.get('/referrals/stats').then(r => setRef(r.data)).catch(() => {});
    api.get('/portals/student/library').then(r => setProgress(Object.fromEntries((r.data?.courses ?? []).map((c: { id: string; pct: number }) => [c.id, c.pct])))).catch(() => {});
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
  async function yearReceipts() {
    setBusy('year');
    try {
      const r = await api.get(`/payments/me/receipts-year/${year}`, { responseType: 'blob' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(r.data); a.download = `careerpath-receipts-${year}.pdf`; a.click();
      URL.revokeObjectURL(a.href);
    } catch { notify.error('Could not prepare your receipts'); }
    finally { setBusy(null); }
  }
  const paidRows = (d?.payments ?? []).filter(p => p.amount > 0);
  const thisYear = paidRows.filter(p => new Date(p.at).getFullYear() === year);
  // The access that matters most: paid, still running, ending last
  const main = useMemo(() => (d?.access ?? []).filter(a => (a.kind === 'package' || a.kind === 'course') && !a.ended)
    .sort((a, b) => (b.expiresAt ? +new Date(b.expiresAt) : Infinity) - (a.expiresAt ? +new Date(a.expiresAt) : Infinity))[0] ?? null, [d]);
  const mainPayment = main ? paidRows.find(p => p.kind === main.kind && p.title.startsWith(main.title)) : undefined;
  const ending = (d?.access ?? []).filter(a => (a.kind === 'package' || a.kind === 'course') && a.expiresAt && (a.ended || (a.daysLeft ?? 99) <= 30) && a !== main);
  const extendHref = (a: Access) => (a.kind === 'package' ? a.href : `/courses/${a.id}`);
  const months = Array.from({ length: 12 }, (_, m) => thisYear.filter(p => new Date(p.at).getMonth() === m).reduce((n, p) => n + p.amount, 0));
  const monthMax = Math.max(1, ...months);
  const shown = (d?.payments ?? []).filter(p => tab === 'all' || payKind(p) === tab);
  const access = d?.access ?? [];
  const picked = access[Math.min(row, access.length - 1)];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Billing" subtitle="What you have, until when, what you’ve paid, and your receipts"
        actions={thisYear.length ? <button type="button" onClick={yearReceipts} disabled={busy === 'year'} className="hidden h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13px] font-semibold text-navy hover:bg-subtle disabled:opacity-60 sm:inline-flex">{busy === 'year' ? 'Preparing…' : `All ${year} receipts (PDF)`}</button> : undefined} />
      <div className="flex flex-col gap-[18px] p-4 lg:px-7 lg:py-6">
        <div className="flex flex-wrap gap-[18px]">
          {!d ? <div className="h-[230px] min-w-0 flex-[999_1_520px] animate-pulse rounded-xl bg-subtle" /> : main ? (
            <section className="keep-light relative flex min-w-0 flex-[999_1_520px] flex-col gap-3 overflow-hidden rounded-xl bg-[#3F6FE8] p-5 text-navy sm:px-[26px] sm:py-6">
              <svg aria-hidden viewBox="0 0 200 200" className="pointer-events-none absolute -right-10 -top-10 h-[260px] w-[260px] opacity-[0.18]"><circle cx="100" cy="100" r="80" fill="none" stroke="#FFFFFF" strokeWidth="22" /></svg>
              <div className="relative flex items-start justify-between gap-3">
                <p className="text-[12.5px] font-bold uppercase tracking-[0.08em]">Your main access</p>
                <span className="inline-flex h-[26px] items-center gap-1.5 rounded-md bg-[#FFFFFF] px-2.5 text-[12.5px] font-bold"><span className="h-[7px] w-[7px] rounded-full bg-[#1F8A5B]" />{main.daysLeft != null ? `Active · ${main.daysLeft} days left` : 'Active · no end date'}</span>
              </div>
              <p className="relative text-[30px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[40px]">{main.title}<br />{main.expiresAt ? <>until <span className="text-[#FFFFFF]">{long(main.expiresAt)}</span></> : <span className="text-[#FFFFFF]">no time limit</span>}</p>
              <p className="relative text-sm text-[#0B1F55]">{[main.detail, main.examDate && main.expiresAt && sameDay(main.examDate, main.expiresAt) ? 'ends the day of your exam' : null].filter(Boolean).join(' · ')}</p>
              {main.expiresAt && (
                <div className="relative max-w-[520px]">
                  <div className="h-2 overflow-hidden rounded bg-[rgba(255,255,255,0.35)]"><span className="block h-2 rounded bg-[#FFFFFF]" style={{ width: `${main.pctUsed}%` }} /></div>
                  <p className="mt-1.5 flex justify-between text-xs text-[#0B1F55]"><span>Bought {date(main.startedAt)}</span><span>{main.pctUsed}% of your access used</span></p>
                </div>
              )}
              <div className="relative flex flex-wrap gap-2">
                <Link href={main.href} className="inline-flex h-[34px] items-center rounded-md bg-[#072061] px-3.5 text-[13px] font-bold text-[#FFFFFF]">{main.kind === 'package' ? 'Open package' : 'Open course'}</Link>
                {mainPayment && <button type="button" onClick={() => receipt(mainPayment)} disabled={busy === mainPayment.id} className="inline-flex h-[34px] items-center rounded-md bg-[#FFFFFF] px-3.5 text-[13px] font-bold disabled:opacity-60">{busy === mainPayment.id ? 'Preparing…' : `Receipt ${mainPayment.invoiceNo ?? ''}`}</button>}
              </div>
            </section>
          ) : (
            <section className="flex min-w-0 flex-[999_1_520px] flex-col justify-center gap-2 rounded-xl border border-line bg-white p-6">
              <p className="text-lg font-extrabold text-navy">Nothing bought yet</p>
              <p className="text-[13.5px] text-ink2"><Link href="/student/catalogue" className="font-semibold text-azure-strong hover:underline">Browse courses</Link> or <Link href="/packages" className="font-semibold text-azure-strong hover:underline">see packages</Link>.</p>
            </section>
          )}

          <section className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 rounded-xl border border-line bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Paid in {year}</p>
            <p className="text-[30px] font-extrabold tracking-[-0.02em] text-navy">{d?.paidThisYear.length ? d.paidThisYear.map(x => walletMoney(x.amount, x.currency)).join(' + ') : walletMoney(0, 'XAF')}</p>
            <p className="text-[13px] text-ink2">{thisYear.length ? `${thisYear.length} payment${thisYear.length === 1 ? '' : 's'} · the last on ${new Date(thisYear[0].at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : 'No payments this year'}</p>
            <div role="img" aria-label={`Paid by month in ${year}`} className="mt-1.5 flex h-[84px] items-end gap-[5px] border-b border-line">
              {months.map((v, i) => <span key={i} className={clsx('flex-1 rounded-t-[3px]', v ? 'bg-[#3F6FE8]' : 'bg-line')} style={{ height: v ? Math.max(6, Math.round((v / monthMax) * 78)) : 3 }} />)}
            </div>
            {thisYear.length > 0 && <button type="button" onClick={yearReceipts} disabled={busy === 'year'} className="order-last mt-1 inline-flex h-9 items-center justify-center rounded-md border border-line text-[13px] font-semibold text-navy disabled:opacity-60 sm:hidden">{busy === 'year' ? 'Preparing…' : `All ${year} receipts (PDF)`}</button>}
            <div className="flex gap-[5px] text-[10.5px] text-muted">{'JFMAMJJASOND'.split('').map((l, i) => <span key={i} className={clsx('flex-1 text-center', months[i] && 'font-bold text-navy')}>{l}</span>)}</div>
          </section>
        </div>

        {ending.map(a => (
          <section key={a.kind + a.id} className="flex flex-wrap items-center gap-3.5 rounded-xl border border-[#3F6FE8] bg-accent-soft px-[18px] py-3.5">
            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-white text-azure-strong">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2" /></svg>
            </span>
            <div className="min-w-0 flex-[1_1_300px]">
              <p className="text-[14.5px] font-bold text-navy">{a.ended ? `${a.title} ended` : `${a.title} ends in ${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'}`}</p>
              <p className="mt-0.5 text-[13px] text-ink2">On {long(a.expiresAt!)}.{progress[a.id] ? ` You’re ${progress[a.id]}% through it.` : ''} {a.ended ? 'Renew to keep going where you left off.' : 'Extend now and keep your progress.'}</p>
            </div>
            <Link href={extendHref(a)} className="inline-flex h-9 items-center rounded-md bg-azure-strong px-4 text-[13.5px] font-bold text-on-accent">{a.ended ? 'Renew access' : 'Extend access'}</Link>
          </section>
        ))}

        {access.length > 0 && picked && (
          <section className="flex flex-col gap-3 rounded-xl border border-line bg-white p-4 sm:p-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2.5">
              <div><h2 className="text-base font-bold text-navy">Your access</h2><p className="mt-0.5 text-[12.5px] text-muted">Everything you have and when it ends · tap a row</p></div>
              <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12.5px] text-ink2">
                {(Object.keys(COLOUR) as Kind[]).filter(k => access.some(a => a.kind === k)).map(k => <li key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: COLOUR[k] }} />{NAME[k]}</li>)}
              </ul>
            </div>
            <Timeline access={access} row={row} onRow={setRow} />
            <div className="flex flex-wrap items-center gap-3.5 rounded-lg bg-subtle px-4 py-3.5">
              <span className="h-10 w-3 flex-shrink-0 rounded" style={{ background: COLOUR[picked.kind] }} />
              <div className="min-w-0 flex-[1_1_260px]">
                <p className="text-[14.5px] font-bold text-navy">{picked.title}</p>
                <p className="mt-0.5 text-[13px] text-ink2">{[`${picked.kind === 'free' ? 'Free since' : picked.kind === 'extra' ? 'Added' : 'Bought'} ${date(picked.startedAt)}`, picked.expiresAt ? `${picked.ended ? 'ended' : 'ends'} ${date(picked.expiresAt)}${picked.examDate && sameDay(picked.examDate, picked.expiresAt) ? ', the day of your exam' : ''}` : 'no end date', picked.detail, progress[picked.id] ? `you’re ${progress[picked.id]}% through it` : null].filter(Boolean).join(' · ')}</p>
              </div>
              <Link href={picked.ended || (picked.kind !== 'free' && picked.kind !== 'extra' && (picked.daysLeft ?? 99) <= 30) ? extendHref(picked) : picked.href}
                className="inline-flex h-[34px] items-center rounded-md bg-azure-strong px-3.5 text-[13px] font-bold text-on-accent">
                {picked.ended ? 'Renew access' : picked.kind !== 'free' && picked.kind !== 'extra' && (picked.daysLeft ?? 99) <= 30 ? 'Extend access' : picked.kind === 'package' ? 'Open package' : 'Open'}
              </Link>
            </div>
          </section>
        )}

        <div className="flex flex-wrap items-start gap-[18px]">
          <section className="min-w-0 flex-[999_1_560px] rounded-xl border border-line bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2.5 px-[18px] py-3.5">
              <h2 className="text-base font-bold text-navy">Payments</h2>
              <div role="tablist" aria-label="Show" className="flex gap-0.5 rounded-lg border border-line p-[3px]">
                {([['all', 'All'], ['package', 'Packages'], ['course', 'Courses'], ['extra', 'Extras']] as const).map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                    className={clsx('h-7 rounded-md px-2.5 text-[12.5px] text-navy', tab === k ? 'bg-accent-soft font-bold' : 'font-medium')}>{l}</button>
                ))}
              </div>
            </div>
            {!d ? <div className="m-4 h-32 animate-pulse rounded-md bg-subtle" /> : !shown.length ? <p className="border-t border-line px-4 py-10 text-center text-[13px] text-ink2">No payments here.</p> : shown.map(p => {
              const k = payKind(p);
              return (
                <div key={p.kind + p.id} className="flex flex-wrap items-center gap-3 border-t border-line px-[18px] py-3 text-[13.5px]">
                  <span className={clsx('flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-lg text-xs font-extrabold', k === 'extra' || k === 'free' ? 'text-navy' : 'text-[#FFFFFF]')} style={{ background: COLOUR[k] }}>{{ package: 'PK', course: 'CO', extra: '+', free: 'FR' }[k]}</span>
                  <div className="min-w-0 flex-[1_1_220px]">
                    <p className="font-bold text-navy">{p.title}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">{p.amount ? p.invoiceNo ?? `CPA-${p.id.slice(0, 8).toUpperCase()}` : 'Free'} · {date(p.at)}</p>
                  </div>
                  <span className="inline-flex h-6 items-center whitespace-nowrap rounded bg-subtle px-2 text-xs font-semibold text-ink2">{p.amount ? p.method : 'No payment'}</span>
                  <strong className="w-[110px] whitespace-nowrap text-right text-navy">{p.amount ? walletMoney(p.amount, p.currency) : 'Free'}</strong>
                  {p.amount ? (
                    <button type="button" onClick={() => receipt(p)} disabled={busy === p.id} className="inline-flex h-8 items-center gap-1.5 rounded-md border border-line px-3 text-[12.5px] font-bold text-azure-strong hover:bg-subtle disabled:opacity-50">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>{busy === p.id ? 'Preparing…' : 'Receipt'}
                    </button>
                  ) : <span className="w-[86px]" />}
                </div>
              );
            })}
            <p className="border-t border-line px-[18px] py-3 text-[12.5px] text-muted">Receipts are also emailed to you when you pay. Anyone can check one is genuine at <Link href="/verify" className="font-semibold text-azure-strong hover:underline">careerpathafrica.com/verify</Link>.</p>
          </section>

          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
            <PaymentCheck onFound={load} />
            <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-[18px]">
              <h3 className="text-[15px] font-bold text-navy">A problem with a payment?</h3>
              <p className="text-[13px] text-ink2">Charged twice, or the wrong amount? Send us the receipt number and we’ll sort it within a day.</p>
              <Link href="/student/support" className="text-[13px] font-bold text-azure-strong hover:underline">Contact billing support</Link>
            </section>
            <Link href="/student/referrals" className="flex items-center gap-3 rounded-xl border border-line bg-white px-[18px] py-4 hover:bg-subtle">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[15px] font-extrabold text-azure-strong">{ref?.totalReferrals ?? 0}</span>
              <span className="min-w-0"><span className="block text-sm font-bold text-navy">{ref?.totalReferrals ? `Friend${ref.totalReferrals === 1 ? '' : 's'} joined with your link` : 'Invite classmates'}</span><span className="mt-px block text-[12.5px] font-semibold text-azure-strong">Share your link</span></span>
            </Link>
          </aside>
        </div>
      </div>
    </div>
  );
}

/** Each thing the student has as a bar from start to end across the months, with today and the exam marked */
function Timeline({ access, row, onRow }: { access: Access[]; row: number; onRow: (i: number) => void }) {
  const now = Date.now();
  const exam = access.find(a => a.examDate)?.examDate ?? null;
  const starts = access.map(a => +new Date(a.startedAt));
  const ends = access.map(a => (a.expiresAt ? +new Date(a.expiresAt) : 0));
  const first = new Date(Math.min(now, ...starts)); first.setDate(1); first.setHours(0, 0, 0, 0);
  const last = new Date(Math.max(now + 60 * DAY, exam ? +new Date(exam) : 0, ...ends)); last.setMonth(last.getMonth() + 1, 1);
  const span = +last - +first;
  const at = (t: number) => Math.max(0, Math.min(100, ((t - +first) / span) * 100));
  const ticks: Date[] = [];
  const step = Math.ceil(((last.getFullYear() - first.getFullYear()) * 12 + last.getMonth() - first.getMonth()) / 10);
  for (const m = new Date(first); m < last; m.setMonth(m.getMonth() + step)) ticks.push(new Date(m));
  const left = (t: number) => `calc(150px + (100% - 150px) * ${(at(t) / 100).toFixed(4)})`;

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div className="relative h-[18px] pl-[150px] text-[11px] text-muted">
          {ticks.map(t => <span key={+t} className={clsx('absolute border-l border-[#EEF1F7] pl-1', t.getMonth() < step && 'font-bold text-navy')} style={{ left: left(+t) }}>{t.toLocaleDateString('en-GB', { month: 'short' })}{t.getMonth() < step ? ` ${t.getFullYear()}` : ''}</span>)}
        </div>
        <div className="relative pb-5">
          <span aria-hidden className="absolute bottom-5 top-0 z-[1] w-0.5 bg-navy" style={{ left: left(now) }} />
          <span className="absolute -top-[18px] z-[1] -translate-x-1/2 text-[11px] font-bold text-navy" style={{ left: left(now) }}>Today</span>
          {exam && <>
            <span aria-hidden className="absolute bottom-5 top-0 z-[1] border-l-2 border-dashed border-azure-strong" style={{ left: left(+new Date(exam)) }} />
            <span className="absolute bottom-0 z-[1] -translate-x-1/2 whitespace-nowrap text-[11px] font-bold text-azure-strong" style={{ left: left(+new Date(exam)) }}>Exam · {new Date(exam).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
          </>}
          {access.map((a, i) => {
            const s = +new Date(a.startedAt), e = a.expiresAt ? +new Date(a.expiresAt) : +last;
            const label = a.ended ? 'Ended' : a.expiresAt ? `${a.daysLeft} day${a.daysLeft === 1 ? '' : 's'} left` : 'No end date';
            return (
              <button key={a.kind + a.id} type="button" onClick={() => onRow(i)} aria-pressed={row === i}
                className={clsx('flex w-full items-center gap-3 border-t border-[#EEF1F7] py-2 text-left', row === i ? 'bg-subtle' : 'hover:bg-subtle')}>
                <span className="w-[138px] flex-shrink-0 pl-1"><span className="block truncate text-[13px] font-bold text-navy">{a.title}</span><span className="block text-[11.5px] text-muted">{NAME[a.kind]}</span></span>
                <span className="relative h-[22px] flex-1">
                  <span className={clsx('absolute top-0 flex h-[22px] items-center overflow-hidden whitespace-nowrap rounded px-2 text-[11.5px] font-bold', a.kind === 'extra' || a.kind === 'free' ? 'text-navy' : 'text-[#FFFFFF]', row === i ? 'opacity-100' : 'opacity-75')}
                    style={{ left: `${at(s)}%`, width: `${Math.max(2, at(e) - at(s))}%`, background: a.kind === 'free' ? 'linear-gradient(90deg, #9AA6C2 70%, rgba(154,166,194,0))' : COLOUR[a.kind] }}>{label}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

interface CheckResult { checked: number; delivered: number; results: { title: string; amount: number; currency: string; at: string; status: string; delivered: boolean }[] }

/** "Paid but can't see it?": ask the payment provider directly, and get access if it went through */
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
    <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-white p-[18px]">
      <h3 className="text-[15px] font-bold text-navy">{state === 'checking' ? 'Checking your payment…' : 'Paid but can’t see it?'}</h3>
      {state === 'checking' && <span className="block h-1.5 overflow-hidden rounded-[3px] bg-subtle"><span className="block h-1.5 w-3/5 animate-pulse rounded-[3px] bg-azure" /></span>}
      {state !== 'done' && <p className="text-[13px] text-ink2">We ask the payment provider directly. If your payment went through, you get access straight away.</p>}
      {state === 'done' && res && (found.length ? (
        <div className="rounded-lg bg-accent-soft px-3.5 py-3 text-[13.5px] text-navy">
          {found.map((f, i) => <p key={i}><strong>Found it — paid {walletMoney(f.amount, f.currency)} on {new Date(f.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}.</strong> {f.title} is now yours.</p>)}
        </div>
      ) : (
        <p className="text-[13px] text-ink2">{res.checked ? 'The provider says your recent payments didn’t go through, so nothing was taken — or it will be returned within 3 working days.' : 'We couldn’t find a payment from you in the last 7 days.'} Still stuck? <Link href="/student/support" className="font-semibold text-azure-strong hover:underline">Tell us</Link>.</p>
      ))}
      {found.length > 0
        ? <Link href="/student/courses" className="inline-flex h-9 items-center self-start rounded-md bg-azure-strong px-3.5 text-[13.5px] font-semibold text-on-accent">Go to my courses</Link>
        : <button onClick={run} disabled={state === 'checking'} className="inline-flex h-[34px] items-center self-start rounded-md border border-[#3F6FE8] px-3.5 text-[13px] font-bold text-azure-strong disabled:opacity-50">{state === 'done' ? 'Check again' : 'Check my payment'}</button>}
    </section>
  );
}
