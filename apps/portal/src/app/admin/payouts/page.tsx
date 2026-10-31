'use client';
import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import { money } from '@/lib/money';
import api from '@/lib/api';

type Total = { currency: string; amount: number };
interface Account { label: string; bankName: string; accountNumber: string; bankCode: string | null; country: string; verified: boolean; verifiedAt: string | null; id: string }
interface Row {
  id: string; recipientId: string; name: string; email: string | null; role: string; country: string | null; what: string;
  amount: number; currency: string; periodStart: string; periodEnd: string; status: 'PENDING' | 'PAID'; paidAt: string | null; reference: string | null; paidTo: string | null;
  account: Account | null;
}
interface AccountRow { id: string; userId: string; name: string; email: string; role: string; country: string | null; bankName: string; accountNumber: string; bankCode: string | null; accountCountry: string; verified: boolean; verifiedAt: string | null; updatedAt: string }
interface Data {
  month: { start: string; end: string; label: string };
  ready: { people: number; totals: Total[] };
  unstated: { people: number; totals: Total[] };
  stats: { toPay: Total[]; toPayPeople: number; paidThisYear: Total[]; noAccount: number; unverified: number };
  rows: Row[]; accounts: AccountRow[];
}
type Tab = 'pay' | 'paid' | 'blocked' | 'accounts';

const ROLE: Record<string, string> = { TEACHER: 'Teacher', SUBJECT_REVIEWER: 'Reviewer', COUNTRY_REP: 'Country rep' };
const list = (xs: Total[]) => xs.map(x => money(x.amount, x.currency));
const joinAnd = (xs: string[]) => xs.length > 1 ? `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}` : xs[0] ?? '';
const short = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const ym = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const MONTHS = Array.from({ length: 12 }, (_, i) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); return { key: ym(d), label: d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) }; });

function csv(name: string, rows: (string | number)[][]) {
  const text = rows.map(r => r.map(c => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(',')).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name; a.click();
  URL.revokeObjectURL(a.href);
}

export default function AdminPayoutsPage() {
  const [month, setMonth] = useState(MONTHS[0].key);
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('pay');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [paying, setPaying] = useState<Row | null>(null);

  const load = useCallback(() => api.get('/payouts/admin/payouts/overview', { params: { month } }).then(r => setD(r.data)).catch(e => notify.error(e?.response?.data?.message ?? 'Could not load payouts')), [month]);
  useEffect(() => { load(); }, [load]);

  const pending = d?.rows.filter(r => r.status === 'PENDING') ?? [];
  const rows: Record<Exclude<Tab, 'accounts'>, Row[]> = {
    pay: pending.filter(r => r.account?.verified),
    paid: d?.rows.filter(r => r.status === 'PAID').sort((a, b) => +new Date(b.paidAt ?? 0) - +new Date(a.paidAt ?? 0)) ?? [],
    blocked: pending.filter(r => !r.account?.verified),
  };
  const match = (x: { name: string; email: string | null }) => !q.trim() || `${x.name} ${x.email ?? ''}`.toLowerCase().includes(q.trim().toLowerCase());
  const shown = tab === 'accounts' ? [] : rows[tab].filter(match);
  const accounts = (d?.accounts ?? []).filter(match);
  const monthName = d ? new Date(d.month.start).toLocaleDateString('en-GB', { month: 'long' }) : '';
  const blockedCount = rows.blocked.length;

  async function createStatements() {
    setBusy('create');
    try {
      const r = await api.post('/payouts/admin/payouts/month', { month });
      const n = Array.isArray(r.data) ? r.data.length : r.data?.created ?? r.data?.statements?.length ?? 0;
      notify.success(n ? `${n} statement${n === 1 ? '' : 's'} created` : 'Nothing new to put on a statement');
      setTab('pay'); await load();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not create statements'); }
    finally { setBusy(null); }
  }
  async function verify(accountId: string, name: string) {
    if (!confirm(`Have you checked ${name}’s payout account (name on the account matches, number is right)?`)) return;
    setBusy(accountId);
    try { await api.post(`/payout-accounts/admin/${accountId}/verify`); notify.success('Account verified'); await load(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not verify'); }
    finally { setBusy(null); }
  }
  async function remind(ids: string[]) {
    setBusy('remind:' + ids.join());
    try { const r = await api.post('/payouts/admin/payouts/remind', { recipientIds: ids }); notify.success(`Reminded ${r.data.reminded} ${r.data.reminded === 1 ? 'person' : 'people'}`); }
    catch { notify.error('Could not send the reminder'); }
    finally { setBusy(null); }
  }
  function download() {
    const xs = rows.pay;
    if (!xs.length) { notify.error('Nobody is ready to pay'); return; }
    csv(`payouts-${month}.csv`, [['Name', 'Email', 'Role', 'Bank or network', 'Account number', 'Bank code', 'Account country', 'Amount', 'Currency', 'Period'],
      ...xs.map(r => [r.name, r.email ?? '', ROLE[r.role] ?? r.role, r.account!.bankName, r.account!.accountNumber, r.account!.bankCode ?? '', r.account!.country, minorToMajor(r.amount, r.currency), r.currency, `${r.periodStart.slice(0, 10)} to ${r.periodEnd.slice(0, 10)}`])]);
  }

  // A month gets statements once it's over; until then its earnings are only "so far"
  const monthOver = !!d && new Date(d.month.end) <= new Date();
  const soFar = d && !monthOver && d.unstated.people ? ` ${joinAnd(list(d.unstated.totals))} earned so far in ${monthName} goes on statements on 1 ${new Date(d.month.end).toLocaleDateString('en-GB', { month: 'long' })}.` : '';
  const banner = !d ? null : monthOver && d.unstated.people > 0 ? {
    title: `${d.month.label}: ${d.unstated.people} ${d.unstated.people === 1 ? 'person' : 'people'} earned ${joinAnd(list(d.unstated.totals))} not on a statement yet`,
    sub: 'Create the statements when the month is over — each person sees theirs as being prepared.',
  } : rows.pay.length ? {
    title: `Ready to pay: ${rows.pay.length} ${rows.pay.length === 1 ? 'person' : 'people'}, ${joinAnd(list(d.ready.totals))}`,
    sub: (blockedCount ? `${blockedCount} more ${blockedCount === 1 ? 'hasn’t' : 'haven’t'} got a verified payout account yet — they stay owed until they have one.` : 'Everyone owed has a verified payout account.') + soFar,
  } : { title: 'Nothing to pay right now', sub: (blockedCount ? `${blockedCount} owed ${blockedCount === 1 ? 'person needs' : 'people need'} a verified payout account first.` : 'Statements appear here once they’re created.') + soFar };

  const badge = (blue: boolean) => clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-[12px] font-semibold', blue ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2');
  const td = 'border-b border-line px-4 py-3 align-top';

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Payouts" subtitle="What teachers, reviewers and reps are owed, and paying them" actions={
        <label className="flex h-9 items-center gap-1 rounded-md border border-line bg-white pl-3 text-[13.5px] text-navy">
          Period:
          <select value={month} onChange={e => setMonth(e.target.value)} aria-label="Period" className="h-full cursor-pointer rounded-md bg-transparent pr-2 font-semibold outline-none">
            {MONTHS.map(m => <option key={m.key} value={m.key}>{m.label}</option>)}
          </select>
        </label>
      } />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-[22px]">
        {banner ? (
          <section className="flex flex-wrap items-center gap-3.5 rounded-lg border border-azure bg-white px-[18px] py-4">
            <div className="min-w-0 flex-1"><p className="text-[16px] font-extrabold text-navy">{banner.title}</p><p className="mt-0.5 text-[13px] text-ink2">{banner.sub}</p></div>
            <button onClick={download} disabled={!rows.pay.length} className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-50">Download for bank / MoMo</button>
            {monthOver && d!.unstated.people > 0 && <Button size="sm" onClick={createStatements} loading={busy === 'create'}>Create {monthName} statements</Button>}
          </section>
        ) : <div className="h-[76px] animate-pulse rounded-lg border border-line bg-white" />}

        <dl className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
          {[
            { l: 'To pay', v: d ? list(d.stats.toPay)[0] ?? '—' : '—', sub: d ? [list(d.stats.toPay).slice(1).map(x => `+ ${x}`).join(' '), `${d.stats.toPayPeople} ${d.stats.toPayPeople === 1 ? 'person' : 'people'}`].filter(Boolean).join(' · ') : '' },
            { l: 'Paid this year', v: d ? list(d.stats.paidThisYear)[0] ?? '—' : '—', sub: d && d.stats.paidThisYear.length > 1 ? list(d.stats.paidThisYear).slice(1).map(x => `+ ${x}`).join(' ') : String(new Date().getFullYear()) },
            { l: 'No payout account', v: d ? String(d.stats.noAccount) : '—', sub: 'can’t be paid yet' },
            { l: 'Waiting to verify', v: d ? String(d.stats.unverified) : '—', sub: 'new or changed accounts' },
          ].map(s => (
            <div key={s.l} className="rounded-lg border border-line bg-white px-[15px] py-[13px]">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{s.l}</dt>
              <dd className="mt-[5px] text-[20px] font-extrabold text-navy">{s.v}</dd>
              <dd className="mt-0.5 text-[12px] text-muted">{s.sub}</dd>
            </div>
          ))}
        </dl>

        <section className="rounded-lg border border-line bg-white">
          <div className="flex flex-wrap items-center gap-1 border-b border-line px-4 text-[13.5px]">
            {([['pay', 'To pay', rows.pay.length], ['paid', 'Paid', rows.paid.length], ['blocked', 'Can’t pay yet', blockedCount], ['accounts', 'Payout accounts', null]] as const).map(([k, l, n]) => (
              <button key={k} onClick={() => setTab(k)} aria-pressed={tab === k}
                className={clsx('-mb-px border-b-2 px-2.5 py-[13px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent')}>{l}{n != null && ` ${n}`}</button>
            ))}
            <span className="flex-1" />
            {tab === 'blocked' && blockedCount > 0 && (
              <button onClick={() => remind([...new Set(rows.blocked.map(r => r.recipientId))])} disabled={busy?.startsWith('remind')} className="mr-2 text-[13px] font-semibold text-azure-strong hover:underline disabled:opacity-50">Remind all</button>
            )}
            <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search people" aria-label="Search people"
              className="my-2 h-8 w-56 rounded-md border border-line px-2.5 text-[13px] text-navy outline-none focus:border-azure max-sm:w-full" />
          </div>

          {!d ? <div className="m-4 h-48 animate-pulse rounded-md bg-subtle" /> : tab === 'accounts' ? (
            accounts.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px] border-collapse text-[13.5px]">
                  <thead><tr>{['Person', 'Account', 'Number', 'Status', ''].map((h, i) => <th key={i} className="border-b border-line px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{h}</th>)}</tr></thead>
                  <tbody>{accounts.map(a => (
                    <tr key={a.id} className="hover:bg-subtle">
                      <td className={td}><strong className="text-navy">{a.name}</strong><br /><span className="text-[12.5px] text-muted">{[ROLE[a.role] ?? a.role, a.country].filter(Boolean).join(' · ')}</span></td>
                      <td className={clsx(td, 'text-navy')}>{a.bankName}<br /><span className="text-[12.5px] text-muted">{[a.accountCountry, a.bankCode && `code ${a.bankCode}`].filter(Boolean).join(' · ')}</span></td>
                      <td className={clsx(td, 'font-mono text-[13px] text-navy')}>{a.accountNumber}</td>
                      <td className={td}><span className={badge(!a.verified)}>{a.verified ? `Verified${a.verifiedAt ? ` ${short(a.verifiedAt)}` : ''}` : a.verifiedAt ? 'Changed — verify' : 'New — verify'}</span></td>
                      <td className={clsx(td, 'text-right')}>{!a.verified && <button onClick={() => verify(a.id, a.name)} disabled={busy === a.id} className="font-semibold text-azure-strong hover:underline disabled:opacity-50">Verify account</button>}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ) : <p className="px-4 py-10 text-center text-[13px] text-ink2">{d.accounts.length ? 'Nobody matches.' : 'Nobody has added a payout account yet.'}</p>
          ) : shown.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] border-collapse text-[13.5px]">
                <thead><tr>{['Person', tab === 'paid' ? 'Paid' : 'Owed', 'Paid to', 'For', 'Status', ''].map((h, i) => <th key={i} className="border-b border-line px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{h}</th>)}</tr></thead>
                <tbody>{shown.map(r => (
                  <tr key={r.id} className="hover:bg-subtle">
                    <td className={td}><strong className="text-navy">{r.name}</strong><br /><span className="text-[12.5px] text-muted">{[ROLE[r.role] ?? r.role, r.country].filter(Boolean).join(' · ')}</span></td>
                    <td className={clsx(td, 'font-bold text-navy')}>{money(r.amount, r.currency)}</td>
                    <td className={td}>
                      {r.status === 'PAID' ? <span className="text-navy">{r.paidTo ?? '—'}</span>
                        : r.account?.verified ? <span className="text-navy">{r.account.label} ✓</span>
                        : <span className="inline-flex rounded border border-dashed border-azure px-2 py-0.5 text-[12.5px] font-semibold text-azure-strong">{r.account ? (r.account.verifiedAt ? 'Changed — verify' : 'New — verify') : 'No account'}</span>}
                    </td>
                    <td className={clsx(td, 'text-ink2')}>{r.what}<br /><span className="text-[12.5px] text-muted">{new Date(r.periodStart).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</span></td>
                    <td className={td}>
                      <span className={badge(r.status === 'PENDING' && !!r.account?.verified)}>{r.status === 'PAID' ? `Paid ${r.paidAt ? short(r.paidAt) : ''}` : r.account?.verified ? 'To pay' : 'Can’t pay yet'}</span>
                      {r.reference && <><br /><span className="text-[12px] text-muted">ref {r.reference}</span></>}
                    </td>
                    <td className={clsx(td, 'text-right')}>
                      {r.status === 'PAID' ? null
                        : r.account?.verified ? <button onClick={() => setPaying(r)} className="font-semibold text-azure-strong hover:underline">Mark paid</button>
                        : r.account ? <button onClick={() => verify(r.account!.id, r.name)} disabled={busy === r.account.id} className="font-semibold text-azure-strong hover:underline disabled:opacity-50">Verify account</button>
                        : <button onClick={() => remind([r.recipientId])} disabled={busy === 'remind:' + r.recipientId} className="font-semibold text-azure-strong hover:underline disabled:opacity-50">Remind</button>}
                    </td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          ) : (
            <p className="px-4 py-10 text-center text-[13px] text-ink2">
              {q.trim() ? 'Nobody matches.' : tab === 'pay' ? 'Nobody to pay right now.' : tab === 'paid' ? 'No payouts made yet.' : 'Everyone owed can be paid.'}
            </p>
          )}
        </section>
      </div>
      {paying && <MarkPaid row={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); load(); }} />}
    </div>
  );
}

function MarkPaid({ row, onClose, onDone }: { row: Row; onClose: () => void; onDone: () => void }) {
  const [paidOn, setPaidOn] = useState(new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const amount = money(row.amount, row.currency);

  async function save() {
    setSaving(true);
    try {
      await api.patch(`/payouts/admin/payouts/${row.id}/mark-paid`, { paidOn, reference: reference.trim() || undefined, note: note.trim() || undefined });
      notify.success(`${amount} marked as paid`, { description: `${row.name} has been told.` });
      onDone();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not mark it paid'); }
    finally { setSaving(false); }
  }

  return (
    <Dialog open onOpenChange={o => !o && onClose()}>
      <DialogContent title={`Mark as paid: ${row.name}`}
        description={`${new Date(row.periodStart).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} · ${amount} to ${row.account?.label}${row.account?.verifiedAt ? ` (verified ${short(row.account.verifiedAt)})` : ''}`}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Paid on</span>
            <input type="date" value={paidOn} max={new Date().toISOString().slice(0, 10)} onChange={e => setPaidOn(e.target.value)} className="input-base" /></label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Reference from MoMo or the bank</span>
            <input autoFocus value={reference} onChange={e => setReference(e.target.value)} placeholder="e.g. MP261101.1532.C04412" maxLength={120} className="input-base" /></label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Note (optional)</span>
            <input value={note} onChange={e => setNote(e.target.value)} maxLength={500} className="input-base" /></label>
          <p className="text-[12.5px] text-muted">They’ll be told with the reference, and the amount leaves their “owed” balance.</p>
        </div>
        <DialogFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} loading={saving} disabled={!paidOn}>Mark {amount} as paid</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
