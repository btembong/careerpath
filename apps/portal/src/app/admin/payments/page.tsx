'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { majorToMinor, minorToMajor } from '@cpa/shared';
import { RepTable, td } from '@/components/rep/RepTable';
import { Button } from '@/components/ui/Button';
import { Drawer, DrawerContent, DrawerSection } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import { money } from '@/lib/money';
import api from '@/lib/api';

type Total = { currency: string; amount: number };
interface Row {
  id: string; kind: string; title: string; amount: number; currency: string; gateway: string; sessionId: string | null; status: string; failureReason: string | null;
  createdAt: string; paidAt: string | null; checkedAt: string | null; purchaseId: string | null; receipt: string | null; student: { id: string; name: string; email: string };
}
interface Data {
  rows: Row[]; total: number; page: number; pages: number;
  counts: { all: number; paid: number; waiting: number; failed: number; refunded: number };
  stats: { paidThisMonth: Total[]; paidCount: number; successRate: number | null; refunded: Total[]; refundCount: number; waitingOverHour: number };
}

const GW: Record<string, string> = { paystack: 'Paystack', tranzak: 'Tranzak', stripe: 'Stripe' };
const when = (iso: string) => { const d = new Date(iso); return d.toDateString() === new Date().toDateString() ? `today ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };
const STATUS: Record<string, string> = { PAID: 'Paid', PENDING: 'Waiting', FAILED: 'Failed', ABANDONED: 'Not finished', REFUNDED: 'Refunded' };

function csv(name: string, rows: (string | number)[][]) {
  const text = rows.map(r => r.map(c => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' })); a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

export default function AdminPaymentsPage() {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(() => {
    const params: Record<string, string> = { page: String(page) };
    if (tab !== 'all') params.status = tab;
    if (q.trim()) params.search = q.trim();
    return api.get('/admin/payments', { params }).then(r => setD(r.data)).catch(() => notify.error('Could not load payments'));
  }, [tab, q, page]);
  useEffect(() => { if (timer.current) clearTimeout(timer.current); timer.current = setTimeout(load, q ? 250 : 0); }, [load, q]);

  async function checkAll() {
    setChecking(true);
    try {
      const r = await api.post('/admin/payments/check-all');
      notify.success(r.data.recovered ? `${r.data.recovered} paid payment${r.data.recovered === 1 ? '' : 's'} found — access given` : 'Nothing was paid without access', { description: `${r.data.checked} checked with the gateways${r.data.closed ? `, ${r.data.closed} marked not finished or failed` : ''}.` });
      load();
    } catch { notify.error('Could not reach the gateways'); }
    finally { setChecking(false); }
  }

  const s = d?.stats;
  const banner = s && s.waitingOverHour > 0;
  return (
    <>
      <RepTable title="Payments" subtitle="Every payment students start: paid, waiting, failed and refunded"
        actions={<button onClick={() => d && csv('payments.csv', [['Date', 'Student', 'Email', 'For', 'Amount', 'Currency', 'Gateway', 'Reference', 'Receipt', 'Status'], ...d.rows.map(r => [r.createdAt.slice(0, 16).replace('T', ' '), r.student.name, r.student.email, r.title, minorToMajor(r.amount, r.currency), r.currency, r.gateway, r.sessionId ?? '', r.receipt ?? '', STATUS[r.status] ?? r.status])])} disabled={!d} className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-50">Download CSV</button>}
        top={banner ? (
          <section className="flex flex-wrap items-center gap-3.5 rounded-lg border border-azure bg-white px-[18px] py-4">
            <div className="min-w-0 flex-1">
              <p className="text-[16px] font-extrabold text-navy">{s!.waitingOverHour} payment{s!.waitingOverHour === 1 ? ' has' : 's have'} been waiting over an hour</p>
              <p className="mt-0.5 text-[13px] text-ink2">Some may be paid with the confirmation lost on the way. Check them with the gateways and give access in one go.</p>
            </div>
            <Button size="sm" onClick={checkAll} loading={checking}>Check and give access</Button>
          </section>
        ) : null}
        stats={[
          { l: 'Paid this month', v: s?.paidThisMonth[0] ? money(s.paidThisMonth[0].amount, s.paidThisMonth[0].currency) : s ? '—' : '—', sub: s ? [s.paidThisMonth.slice(1).map(x => `+ ${money(x.amount, x.currency)}`).join(' '), `${s.paidCount} payments`].filter(Boolean).join(' · ') : '' },
          { l: 'Success rate', v: s?.successRate != null ? `${s.successRate}%` : '—', sub: 'of payments started this month' },
          { l: 'Waiting', v: d ? String(d.counts.waiting) : '—', sub: s?.waitingOverHour ? `${s.waitingOverHour} over an hour` : 'checked every 15 minutes' },
          { l: 'Refunded', v: s?.refunded[0] ? money(s.refunded[0].amount, s.refunded[0].currency) : '—', sub: s ? `${s.refundCount} this month` : '' },
        ]}
        tabs={[{ key: 'all', label: 'All', count: d?.counts.all ?? 0 }, { key: 'paid', label: 'Paid', count: d?.counts.paid ?? 0 }, { key: 'waiting', label: 'Waiting', count: d?.counts.waiting ?? 0 }, { key: 'failed', label: 'Failed or not finished', count: d?.counts.failed ?? 0 }, { key: 'refunded', label: 'Refunded', count: d?.counts.refunded ?? 0 }]}
        tab={tab} onTab={k => { setTab(k); setPage(1); }} search={q} onSearch={v => { setQ(v); setPage(1); }} searchLabel="Email, item or reference"
        cols={['Student', 'For', 'Amount', 'Paid with', 'Status', '']}
        loading={!d} empty={d && !d.rows.length ? (q ? 'Nothing matches.' : 'No payments yet. Every checkout students start shows here.') : null}
        note="Waiting payments are checked with the gateway every 15 minutes; paid ones get access automatically. Students can also check from their Billing page.">
        {d?.rows.map(r => (
          <tr key={r.id} className="cursor-pointer hover:bg-subtle" onClick={() => setOpen(r.id)}>
            <td className={td}><strong className="text-navy">{r.student.name}</strong><br /><span className="text-[12.5px] text-muted">{r.student.email}</span></td>
            <td className={clsx(td, 'text-ink2')}>{r.title}<br /><span className="text-[12.5px] text-muted">{r.receipt ?? (r.sessionId ? `ref ${r.sessionId.length > 18 ? r.sessionId.slice(0, 16) + '…' : r.sessionId}` : '—')}</span></td>
            <td className={clsx(td, 'font-bold text-navy')}>{money(r.amount, r.currency)}</td>
            <td className={clsx(td, 'text-ink2')}>{GW[r.gateway] ?? r.gateway}<br /><span className="text-[12.5px] text-muted">{when(r.createdAt)}</span></td>
            <td className={td}>
              <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-[12px] font-semibold', r.status === 'PAID' ? 'bg-accent-soft text-navy' : r.status === 'PENDING' ? 'border border-dashed border-azure text-azure-strong' : 'border border-line bg-subtle text-ink2')}>{STATUS[r.status] ?? r.status}</span>
              {r.failureReason && r.status !== 'PAID' && <><br /><span className="text-[12px] text-muted">{r.failureReason}</span></>}
            </td>
            <td className={clsx(td, 'text-right font-semibold text-azure-strong')}>Open</td>
          </tr>
        ))}
      </RepTable>
      {d && d.pages > 1 && (
        <div className="-mt-3 flex items-center justify-center gap-3 px-4 pb-6 text-[13px] text-ink2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-md border border-line bg-white px-3 py-1.5 font-semibold text-navy disabled:opacity-40">Previous</button>
          <span>Page {d.page} of {d.pages}</span>
          <button disabled={page >= d.pages} onClick={() => setPage(p => p + 1)} className="rounded-md border border-line bg-white px-3 py-1.5 font-semibold text-navy disabled:opacity-40">Next</button>
        </div>
      )}
      <PaymentDrawer id={open} onClose={() => setOpen(null)} onChanged={load} />
    </>
  );
}

interface Detail {
  id: string; kind: string; title: string; amount: number; currency: string; gateway: string; sessionId: string | null; status: string; failureReason: string | null;
  createdAt: string; paidAt: string | null; checkedAt: string | null; student: { id: string; name: string; email: string; phone: string | null };
  purchase: { id: string; receipt: string | null; expiresAt: string | null; refundedAt: string | null; active: boolean } | null;
  refunds: { amount: number; currency: string; reason: string; endedAccess: boolean; clawedBack: number; at: string }[];
  refundable: number; sameDayPayments: { id: string; createdAt: string; amount: number; currency: string }[];
}

function PaymentDrawer({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [busy, setBusy] = useState(false);
  const [refunding, setRefunding] = useState(false);
  const [amount, setAmount] = useState(''), [reason, setReason] = useState(''), [endAccess, setEndAccess] = useState(false);
  const load = useCallback((x: string) => api.get(`/admin/payments/${x}`).then(r => setD(r.data)).catch(() => notify.error('Could not open this payment')), []);
  useEffect(() => { setD(null); setRefunding(false); if (id) load(id); }, [id, load]);
  useEffect(() => { if (d) { setAmount(String(minorToMajor(d.refundable, d.currency))); setReason(d.sameDayPayments.length ? 'Charged twice' : ''); setEndAccess(!d.sameDayPayments.length); } }, [d?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function check() {
    if (!d) return;
    setBusy(true);
    try {
      const r = await api.post(`/admin/payments/${d.id}/check`);
      notify.success(r.data.status === 'PAID' ? (r.data.changed ? 'Paid — access given' : 'Already paid') : r.data.status === 'PENDING' ? 'Still waiting' : `Not paid: ${STATUS[r.data.status]?.toLowerCase() ?? r.data.status}`, r.data.reason ? { description: r.data.reason } : undefined);
      load(d.id); onChanged();
    } catch { notify.error('Could not reach the gateway'); }
    finally { setBusy(false); }
  }
  async function refund() {
    if (!d) return;
    if (!confirm(`Record a refund of ${d.currency} ${amount} to ${d.student.name}? Send the money back in ${GW[d.gateway] ?? d.gateway} first.`)) return;
    setBusy(true);
    try {
      const r = await api.post(`/admin/payments/${d.id}/refund`, { amount: majorToMinor(Number(amount), d.currency), reason: reason.trim(), endAccess });
      notify.success('Refund recorded', { description: r.data.clawedBack ? `${money(r.data.clawedBack, d.currency)} of commission taken back.` : undefined });
      setRefunding(false); load(d.id); onChanged();
    } catch (e: any) { notify.error([].concat(e?.response?.data?.message ?? 'Could not record it').join(', ')); }
    finally { setBusy(false); }
  }

  const timeline = d ? [
    { a: when(d.createdAt), b: `Started checkout with ${GW[d.gateway] ?? d.gateway}${d.sessionId ? ` (ref ${d.sessionId})` : ''}` },
    ...(d.paidAt ? [{ a: when(d.paidAt), b: `Paid${d.purchase?.receipt ? `, receipt ${d.purchase.receipt}` : ''}` }] : []),
    ...d.sameDayPayments.map(x => ({ a: when(x.createdAt), b: `Same student paid for this again: ${money(x.amount, x.currency)}` })),
    ...(d.status !== 'PAID' && d.failureReason ? [{ a: d.checkedAt ? when(d.checkedAt) : '—', b: d.failureReason }] : []),
    ...(d.checkedAt && d.status === 'PENDING' ? [{ a: when(d.checkedAt), b: `Checked with ${GW[d.gateway] ?? d.gateway}: still waiting` }] : []),
    ...d.refunds.map(r => ({ a: when(r.at), b: `Refunded ${money(r.amount, r.currency)} — ${r.reason}${r.endedAccess ? ', access ended' : ''}${r.clawedBack ? `, ${money(r.clawedBack, r.currency)} commission taken back` : ''}` })),
  ] : [];

  return (
    <Drawer open={!!id} onOpenChange={o => !o && onClose()}>
      <DrawerContent title={d ? `${d.student.name} · ${money(d.amount, d.currency)}` : 'Payment'} description={d ? `${d.title} · ${GW[d.gateway] ?? d.gateway}${d.purchase?.receipt ? ` · receipt ${d.purchase.receipt}` : ''}` : ' '}
        footer={d && <>
          {d.status !== 'PAID' && d.status !== 'REFUNDED' && <Button size="sm" onClick={check} loading={busy}>Check with {GW[d.gateway] ?? d.gateway}</Button>}
          {d.purchase && d.refundable > 0 && !refunding && <Button size="sm" variant="secondary" onClick={() => setRefunding(true)}>Record a refund</Button>}
          {refunding && <><Button size="sm" onClick={refund} loading={busy} disabled={!Number(amount) || !reason.trim()}>Record refund</Button><Button size="sm" variant="secondary" onClick={() => setRefunding(false)}>Cancel</Button></>}
          <Link href={`/admin/users?open=${d.student.id}`} className="ml-auto self-center text-[13px] font-semibold text-azure-strong hover:underline">Open student</Link>
        </>}>
        {!d ? <div className="h-64 animate-pulse rounded bg-subtle" /> : <>
          <DrawerSection title="What happened">
            <div className="flex flex-col gap-1.5">{timeline.map((t, i) => <p key={i} className="flex gap-2.5 text-[13px] text-navy"><span className="w-[92px] shrink-0 text-muted">{t.a}</span><span>{t.b}</span></p>)}</div>
          </DrawerSection>
          {d.purchase && <p className="text-[13px] text-ink2">Access: {d.purchase.active ? (d.purchase.expiresAt ? `until ${new Date(d.purchase.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'no end date') : 'ended'}</p>}
          {refunding && (
            <DrawerSection title="Record a refund">
              <div className="flex flex-col gap-3">
                <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Amount refunded ({d.currency})</span><input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} className="input-base" /><span className="text-[12px] text-muted">Up to {money(d.refundable, d.currency)}</span></label>
                <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Reason</span><input value={reason} onChange={e => setReason(e.target.value)} maxLength={300} placeholder="e.g. Charged twice" className="input-base" /></label>
                <label className="flex items-center gap-2 text-[13px] text-navy"><input type="checkbox" checked={endAccess} onChange={e => setEndAccess(e.target.checked)} className="h-4 w-4 accent-[#3F6FE8]" /> End their access to {d.title}</label>
                {d.sameDayPayments.length > 0 && !endAccess && <p className="text-[12.5px] text-muted">They keep access through their other payment.</p>}
                <p className="text-[12.5px] text-muted">Send the money back in {GW[d.gateway] ?? d.gateway} first; this records it{endAccess ? ', ends access' : ''} and takes back commission that hasn’t been paid out.</p>
              </div>
            </DrawerSection>
          )}
        </>}
      </DrawerContent>
    </Drawer>
  );
}
