'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { PageHero, heroBtnDark, heroBtnLine, asideLabel } from '@/components/hero/PageHero';
import { PersonPhoto } from '@/components/ui/PersonPhoto';
import { walletMoney } from '@/components/wallet/WalletCharts';
import { STATUS } from '@/components/payout/GetPaid';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Status = keyof typeof STATUS;
interface Rules { autoLimit: number; twoApproversAbove: number; dailyMax: number; clearingDays: number; coolingHours: number; lowFloat: number; payeePaysFee: boolean; paused: boolean }
interface Overview {
  tranzak: { ok: true; payout: { currency: string; total: number; available: number }; collection: { currency: string; total: number; available: number } } | { ok: false; error: string };
  owed: Record<string, number>; rules: Rules; unlocked: boolean; cover: { perDay: number; days: number | null; topUpForTwoWeeks: number | null; basedOnHistory: boolean };
  awaiting: { count: number; amount: number }; today: { count: number; amount: number; failed: number }; accountsToCheck: number;
}
interface Row {
  id: string; amount: number; fee: number | null; currency: string; status: Status; method: string; paidTo: string; reference: string; ourRef: string; transferId: string | null;
  failureReason: string | null; requestedAt: string; completedAt: string | null; approvals: number; approvalsNeeded: number; approvedBy: string[]; flags: string[]; payeeName: string | null;
  user: { id: string; name: string; email: string; role: string; avatarUrl: string | null; since: string };
  account: { nameCheck: string | null; holderName: string | null; isVerified: boolean; changedAt: string | null; createdAt: string; country: string } | null;
  earned90d: { source: string; amount: number }[] | null; months: number[] | null; usual: number | null; risk: 'low' | 'medium' | 'high' | null;
}
interface Month { month: string; people: number; api: number; hand: number; fees: number; failed: number; returned: number; total: number; currency: string }
interface Acc { id: string; user: { id: string; name: string; email: string; role: string }; label: string; last: string; country: string; holderName: string | null; nameCheck: string; automatic: boolean; updatedAt: string }

type Tab = 'approvals' | 'transfers' | 'history' | 'accounts' | 'rules';
const ROLE: Record<string, string> = { TEACHER: 'Teacher', SUBJECT_REVIEWER: 'Subject reviewer', COUNTRY_REP: 'Country rep' };
const SOURCE: Record<string, string> = { COURSE_SALE: 'course sales', COHORT_SHARE: 'cohort share', COUNTRY_BONUS: 'country bonus', REVIEW_COMMISSION: 'review commission', LIVE_CLASS: 'live classes', MENTOR_SESSION: 'mentorship', MANUAL_CREDIT: 'added by admin', ADJUSTMENT: 'adjustments' };
const tag = 'inline-flex h-6 items-center rounded-md px-2 text-[11.5px] font-bold whitespace-nowrap';
const time = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const err = (e: any, f: string) => e?.response?.data?.message ?? f;
const ageDays = (d: string) => Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000);
const monthName = (m: string) => new Date(`${m}-01T12:00:00`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });

/** Ask for the admin's code once; it covers 15 minutes of approvals, payments, top-ups and rule changes */
function useAdminCode(unlocked: boolean) {
  const [ask, setAsk] = useState<null | ((code: string) => Promise<void>)>(null);
  const [ok, setOk] = useState(unlocked);
  useEffect(() => setOk(unlocked), [unlocked]);
  const run = (fn: (code: string) => Promise<void>) => { if (ok) fn('').catch(() => {}); else setAsk(() => fn); };
  const dialog = ask && <CodeDialog onClose={() => setAsk(null)} onCode={async code => { await ask(code); setOk(true); setAsk(null); setTimeout(() => setOk(false), 14 * 60_000); }} />;
  return { run, dialog };
}

function CodeDialog({ onClose, onCode }: { onClose: () => void; onCode: (code: string) => Promise<void> }) {
  const [code, setCode] = useState(''), [sent, setSent] = useState<string | null>(null), [busy, setBusy] = useState(false);
  async function send() { try { const r = await api.post('/admin/settlements/code'); setSent(r.data.to); } catch (e) { notify.error(err(e, 'Could not send a code')); } }
  useEffect(() => { send(); }, []);
  async function go() { setBusy(true); try { await onCode(code); } catch { /* the action shows its own error */ } finally { setBusy(false); } }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="sm" title="Confirm it’s you" description={sent ? `We emailed a code to ${sent}. It covers payouts for the next 15 minutes.` : 'Sending a code to your email…'}>
        <input value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoFocus autoComplete="one-time-code" placeholder="6 digits" className="input-base w-40 text-center text-lg font-bold tracking-[0.3em]" />
        <button type="button" onClick={send} className="mt-2 block text-[13px] font-semibold text-azure-strong">Send again</button>
        <DialogFooter>
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={busy} disabled={code.length !== 6} onClick={go}>Continue</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminSettlementsPage() {
  const [o, setO] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>('approvals');
  const [rows, setRows] = useState<Row[] | null>(null);
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [history, setHistory] = useState<Month[] | null>(null);
  const [accounts, setAccounts] = useState<Acc[] | null>(null);
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [paying, setPaying] = useState<Row | null>(null);
  const [topUp, setTopUp] = useState<false | string>(false);
  const code = useAdminCode(!!o?.unlocked);

  const loadO = useCallback(() => api.get('/admin/settlements').then(r => setO(r.data)).catch(e => notify.error(err(e, 'Could not load settlements'))), []);
  const loadRows = useCallback(() => {
    const s = tab === 'approvals' ? 'awaiting_approval' : status;
    api.get('/admin/settlements/withdrawals', { params: { status: s, q: tab === 'transfers' ? q || undefined : undefined } }).then(r => setRows(r.data)).catch(() => setRows([]));
  }, [tab, status, q]);
  useEffect(() => { loadO(); }, [loadO]);
  useEffect(() => {
    if (tab === 'approvals' || tab === 'transfers') { setRows(null); const t = setTimeout(loadRows, tab === 'transfers' ? 250 : 0); return () => clearTimeout(t); }
    if (tab === 'history') api.get('/admin/settlements/history').then(r => setHistory(r.data)).catch(() => setHistory([]));
    if (tab === 'accounts') api.get('/admin/settlements/accounts').then(r => setAccounts(r.data)).catch(() => setAccounts([]));
  }, [tab, loadRows]);
  const reload = () => { loadO(); loadRows(); };

  const approve = (r: Row) => code.run(async c => {
    try { const x = await api.post(`/admin/settlements/withdrawals/${r.id}/approve`, { code: c }); notify.success(x.data.status === 'AWAITING_APPROVAL' ? 'Approved. A second admin has to approve it too.' : x.data.status === 'PAID' ? 'Approved and received' : 'Approved and sent'); reload(); }
    catch (e) { notify.error(err(e, 'Could not approve')); throw e; }
  });
  const refresh = async (r: Row) => { const x = await api.post(`/admin/settlements/withdrawals/${r.id}/refresh`).catch(() => null); notify.info(x ? STATUS[x.data.status as Status].label : 'Couldn’t reach Tranzak'); reload(); };
  async function confirmAccount(a: Acc) {
    try { await api.post(`/payout-accounts/admin/${a.id}/verify`); notify.success('Account confirmed'); setAccounts(l => l?.filter(x => x.id !== a.id) ?? null); loadO(); }
    catch (e) { notify.error(err(e, 'Could not confirm')); }
  }

  const tz = o?.tranzak, xaf = o?.owed.XAF ?? 0;
  const short = tz && tz.ok ? xaf - tz.payout.available : 0;
  const TABS: [Tab, string, number | undefined][] = [['approvals', 'Approvals', o?.awaiting.count], ['transfers', 'Transfers', undefined], ['history', 'History', undefined], ['accounts', 'Accounts to check', o?.accountsToCheck], ['rules', 'Rules', undefined]];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Settlements" subtitle="Earners withdraw themselves; big or unusual amounts wait for you" actions={<Link href="/admin/payouts" className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle">Monthly statements</Link>} />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        {!o ? <div className="h-64 animate-pulse rounded-[14px] bg-[#3F6FE8]/30" /> : (
          <PageHero
            kicker={`Settlements · ${o.rules.paused ? 'withdrawals paused' : 'withdrawals open'}${tz?.ok ? ' · Tranzak connected' : ''}${o.awaiting.count ? ` · ${o.awaiting.count} waiting for you` : ''}`}
            l1={!tz?.ok ? <><span className="text-[#FFFFFF]">Tranzak</span><br />isn’t answering.</>
              : o.cover.days == null || !xaf ? <><span className="text-[#FFFFFF]">Everyone</span><br />is paid up.</>
              : <><span className="text-[#FFFFFF]">{o.cover.days} day{o.cover.days === 1 ? '' : 's'}</span><br />of payouts covered.</>}
            sub={<>
              {tz?.ok && xaf ? `Earners ${o.cover.basedOnHistory ? 'take out' : 'could take out'} about ${walletMoney(o.cover.perDay, 'XAF')} a day. The payout account holds ${walletMoney(tz.payout.available, 'XAF')}${o.cover.days != null && o.cover.days < 14 ? `, so it runs dry ${o.cover.days <= 0 ? 'today' : `in ${o.cover.days} day${o.cover.days === 1 ? '' : 's'}`} unless you top up` : ''}. Collections hold ${walletMoney(tz.collection.available, 'XAF')}. ` : ''}
              {!tz?.ok && tz ? `${tz.error}. ` : ''}
              {o.today.count ? `${o.today.count} paid today, ${walletMoney(o.today.amount, 'XAF')}${o.today.failed ? `; ${o.today.failed} returned by the operator` : ''}.` : ''}
            </>}
            chips={[
              ...(o.awaiting.count ? [{ t: `${o.awaiting.count} to approve · ${walletMoney(o.awaiting.amount, 'XAF')}`, strong: true }] : []),
              { t: `Owed to earners ${walletMoney(xaf, 'XAF')}` },
            ]}
            actions={<>
              {o.awaiting.count > 0 && tab !== 'approvals' && <button type="button" onClick={() => setTab('approvals')} className={heroBtnDark}>Review approvals</button>}
              {tz?.ok && !!o.cover.topUpForTwoWeeks && <button type="button" onClick={() => setTopUp(String(o.cover.topUpForTwoWeeks))} className={o.awaiting.count && tab !== 'approvals' ? heroBtnLine : heroBtnDark}>Top up {walletMoney(o.cover.topUpForTwoWeeks, 'XAF')} to cover 2 weeks</button>}
              <button type="button" disabled={!tz?.ok} onClick={() => setTopUp('')} className={clsx(heroBtnLine, 'disabled:opacity-60')}>{o.cover.topUpForTwoWeeks ? 'Choose amount' : 'Top up from collections'}</button>
            </>}
            aside={tz?.ok ? (() => {
              const parts: [string, number, string][] = [['Collections (students paid)', tz.collection.available, '#3F6FE8'], ['Payout account', tz.payout.available, '#072061'], ['Owed to earners', xaf, '#BFD0FA']];
              const total = Math.max(1, parts.reduce((n, p) => n + p[1], 0));
              return <>
                <p className={asideLabel}>Where the money is</p>
                <div className="flex h-4 gap-0.5 overflow-hidden rounded" role="img" aria-label={parts.map(p => `${p[0]} ${walletMoney(p[1], 'XAF')}`).join(', ')}>
                  {parts.map(p => p[1] > 0 && <span key={p[0]} style={{ flex: p[1] / total, background: p[2] }} />)}
                </div>
                <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 text-[13.5px]">
                  {parts.map(p => <div key={p[0]} className="contents"><dt className="flex items-center gap-2 text-ink2"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: p[2] }} />{p[0]}</dt><dd className="text-right font-bold">{walletMoney(p[1], 'XAF')}</dd></div>)}
                </dl>
                {short > 0 && <p className="rounded-lg bg-[#FFF3DC] px-3 py-2 text-xs text-[#8A5A0B]">The payout account is {walletMoney(short, 'XAF')} short of what’s owed.</p>}
              </>;
            })() : <>
              <p className={asideLabel}>Tranzak</p>
              <p className="text-[13px] text-ink2">{tz && !tz.ok ? tz.error : 'Checking…'}</p>
              <p className="text-xs text-muted">Payouts need the disbursement scope on the API key and “API Payout” turned on in the Tranzak business portal.</p>
            </>}
          />
        )}

        <div role="tablist" aria-label="Settlements" className="flex gap-1 overflow-x-auto border-b border-line">
          {TABS.map(([k, l, n]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={clsx('-mb-px h-[46px] whitespace-nowrap border-b-2 px-3 text-[13.5px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent font-medium')}>
              {l}{n ? <span className="ml-1 font-medium text-muted">{n}</span> : null}
            </button>
          ))}
        </div>

        {(tab === 'approvals' || tab === 'transfers') && <>
          {tab === 'transfers' && (
            <div className="flex flex-wrap gap-2">
              <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search name, email or reference" className="input-base h-9 w-72 max-w-full" />
              <select value={status} onChange={e => setStatus(e.target.value)} className="input-base h-9 w-auto">
                <option value="all">All statuses</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k.toLowerCase()}>{v.label}</option>)}
              </select>
            </div>
          )}
          {tab === 'approvals' && <ReviewDesk rows={rows} twoAbove={o?.rules.twoApproversAbove ?? 0} onApprove={approve} onPay={setPaying} onRefuse={setRejecting} />}
          {tab === 'transfers' && <section className="overflow-x-auto rounded-xl border border-line bg-white">
            {!rows ? <div className="m-4 h-32 animate-pulse rounded-md bg-subtle" />
              : !rows.length ? <p className="px-4 py-10 text-center text-[13px] text-ink2">No withdrawals yet.</p>
              : <table className="w-full min-w-[860px] text-[13.5px]">
                  <thead><tr className="text-left text-[11.5px] uppercase tracking-[0.06em] text-muted">
                    <th className="px-4 py-2.5 font-semibold">Who</th><th className="px-3 py-2.5 font-semibold">Amount</th><th className="px-3 py-2.5 font-semibold">To</th>
                    <th className="px-3 py-2.5 font-semibold">Reference</th><th className="px-3 py-2.5 font-semibold">Status</th><th />
                  </tr></thead>
                  <tbody>
                    {rows.map(r => (
                      <tr key={r.id} className="border-t border-line align-top">
                        <td className="px-4 py-3"><div className="flex items-center gap-2.5"><PersonPhoto src={r.user.avatarUrl} name={r.user.name} id={r.user.id} size={32} />
                          <span className="min-w-0"><b className="block text-navy">{r.user.name}</b><span className="text-xs text-muted">{ROLE[r.user.role] ?? r.user.role} · {r.account?.country ?? '—'} · {time(r.requestedAt)}</span></span></div></td>
                        <td className="px-3 py-3"><b className="text-navy">{walletMoney(r.amount, r.currency)}</b>{r.fee ? <span className="block text-xs text-muted">fee {walletMoney(r.fee, r.currency)}</span> : null}</td>
                        <td className="px-3 py-3">{r.paidTo}{r.payeeName && <span className="block text-xs text-muted">{r.payeeName}</span>}</td>
                        <td className="px-3 py-3 text-xs text-muted">{r.transferId ?? '—'}<span className="block">{r.ourRef}</span></td>
                        <td className="px-3 py-3"><span className={clsx(tag, STATUS[r.status].cls)}>{STATUS[r.status].label}</span>{r.failureReason && (r.status === 'FAILED' || r.status === 'REJECTED') && <span className="mt-1 block max-w-[220px] text-xs text-muted">{r.failureReason}</span>}</td>
                        <td className="px-4 py-3 text-right">{r.status === 'SENDING' && <Button size="sm" variant="secondary" onClick={() => refresh(r)}>Check now</Button>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>}
          </section>}
          {tab === 'approvals' && <p className="text-xs text-muted">Approving asks for your code once every 15 minutes. You can’t approve money paid to yourself, and over {o ? walletMoney(o.rules.twoApproversAbove, 'XAF') : '…'} two different admins must approve. Refusing puts the money back in their balance with your reason. If Tranzak couldn’t send one, you can pay it by MoMo yourself and use Mark paid with the reference.</p>}
        </>}

        {tab === 'history' && (
          <section className="overflow-x-auto rounded-xl border border-line bg-white">
            {!history ? <div className="m-4 h-32 animate-pulse rounded-md bg-subtle" /> : !history.length ? <p className="px-4 py-10 text-center text-[13px] text-ink2">Nothing paid out in the last 12 months.</p> : (
              <table className="w-full min-w-[640px] text-[13.5px]">
                <thead><tr className="text-left text-[11.5px] uppercase tracking-[0.06em] text-muted">{['Month', 'People', 'Paid out', 'By API', 'By hand', 'Fees', 'Returned'].map(h => <th key={h} className="px-4 py-2.5 font-semibold">{h}</th>)}</tr></thead>
                <tbody>{history.map(m => (
                  <tr key={m.month} className="border-t border-line">
                    <td className="px-4 py-3 font-bold text-navy">{monthName(m.month)}</td><td className="px-4 py-3">{m.people}</td>
                    <td className="px-4 py-3 font-bold text-navy">{walletMoney(m.total, m.currency)}</td><td className="px-4 py-3">{m.api ? walletMoney(m.api, m.currency) : '—'}</td>
                    <td className="px-4 py-3">{m.hand ? walletMoney(m.hand, m.currency) : '—'}</td><td className="px-4 py-3">{m.fees ? walletMoney(m.fees, m.currency) : '—'}</td>
                    <td className="px-4 py-3">{m.failed ? `${m.failed} · ${walletMoney(m.returned, m.currency)}` : '—'}</td>
                  </tr>
                ))}</tbody>
              </table>
            )}
          </section>
        )}

        {tab === 'accounts' && (
          <section className="rounded-xl border border-line bg-white">
            {!accounts ? <div className="m-4 h-32 animate-pulse rounded-md bg-subtle" /> : !accounts.length ? <p className="px-4 py-10 text-center text-[13px] text-ink2">Every payout account is confirmed.</p> : accounts.map(a => (
              <div key={a.id} className="flex flex-wrap items-center gap-3 border-t border-line px-[18px] py-3 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-navy">{a.user.name} <span className="font-medium text-muted">· {ROLE[a.user.role] ?? a.user.role}</span></p>
                  <p className="mt-0.5 text-[12.5px] text-muted">{a.label} ·· {a.last} · {a.country}{a.holderName ? ` · registered to ${a.holderName}` : ''}</p>
                </div>
                <span className={clsx(tag, a.nameCheck === 'mismatch' ? 'bg-[#FDE8E8] text-[#A12A2A]' : 'bg-[#FFF3DC] text-[#8A5A0B]')}>{a.nameCheck === 'mismatch' ? 'Name doesn’t match' : a.automatic ? 'Name not checked' : 'Outside Cameroon: paid by hand'}</span>
                <Button size="sm" variant="secondary" onClick={() => confirmAccount(a)}>Confirm</Button>
              </div>
            ))}
          </section>
        )}

        {tab === 'rules' && o && <RulesForm rules={o.rules} run={code.run} onSaved={r => setO({ ...o, rules: r })} />}
      </div>

      {code.dialog}
      {rejecting && <ReasonDialog title={`Refuse ${walletMoney(rejecting.amount, rejecting.currency)} to ${rejecting.user.name}?`} label="Why (they’ll see this)" cta="Refuse and return the money"
        onClose={() => setRejecting(null)} onSubmit={async reason => { await api.post(`/admin/settlements/withdrawals/${rejecting.id}/reject`, { reason }); notify.success('Refused. The money is back in their balance.'); setRejecting(null); reload(); }} />}
      {paying && <ReasonDialog title={`Paid ${walletMoney(paying.amount, paying.currency)} to ${paying.user.name}?`} label={`Reference of the payment to ${paying.paidTo}`} cta="Mark paid"
        onClose={() => setPaying(null)} onSubmit={reference => new Promise<void>((res, rej) => code.run(async c => { try { await api.post(`/admin/settlements/withdrawals/${paying.id}/paid`, { reference, code: c }); notify.success('Marked paid'); setPaying(null); reload(); res(); } catch (e) { rej(e); throw e; } }))} />}
      {topUp !== false && <ReasonDialog title="Top up the payout account" label="Amount in FCFA, from the collection account" cta="Top up" numeric initial={topUp || undefined}
        onClose={() => setTopUp(false)} onSubmit={amount => new Promise<void>((res, rej) => code.run(async c => { try { await api.post('/admin/settlements/topup', { amount: Number(amount), code: c }); notify.success('Topped up'); setTopUp(false); loadO(); res(); } catch (e) { rej(e); throw e; } }))} />}
    </div>
  );
}

function ReasonDialog({ title, label, cta, numeric, initial, onClose, onSubmit }: { title: string; label: string; cta: string; numeric?: boolean; initial?: string; onClose: () => void; onSubmit: (v: string) => Promise<void> }) {
  const [v, setV] = useState(initial ?? ''), [busy, setBusy] = useState(false);
  async function go() { setBusy(true); try { await onSubmit(v.trim()); } catch (e) { notify.error(err(e, 'That didn’t work')); } finally { setBusy(false); } }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent size="sm" title={title}>
        <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">{label}</span>
          <input value={v} onChange={e => setV(numeric ? e.target.value.replace(/\D/g, '') : e.target.value)} inputMode={numeric ? 'numeric' : undefined} autoFocus className="input-base" /></label>
        <DialogFooter>
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={busy} disabled={!v.trim()} onClick={go}>{cta}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RulesForm({ rules, run, onSaved }: { rules: Rules; run: (fn: (code: string) => Promise<void>) => void; onSaved: (r: Rules) => void }) {
  const [r, setR] = useState(rules);
  const num = (k: keyof Rules, label: string, unit: string) => (
    <label key={k} className="flex items-center justify-between gap-3 border-t border-line py-3 first:border-t-0">
      <span className="text-[13.5px] text-ink2">{label}</span>
      <span className="flex items-center gap-2"><input value={String(r[k])} onChange={e => setR({ ...r, [k]: Number(e.target.value.replace(/\D/g, '')) || 0 })} inputMode="numeric" className="input-base h-9 w-32 text-right font-bold" /><span className="w-14 text-xs text-muted">{unit}</span></span>
    </label>
  );
  const save = () => run(async code => {
    try { const x = await api.patch('/admin/settlements/rules', { ...r, code }); notify.success('Rules saved'); onSaved(x.data); }
    catch (e) { notify.error(err(e, 'Could not save')); throw e; }
  });
  // The three bands on one line, scaled so the 2-admin band is as wide as the 1-admin one
  const top = Math.max(r.twoApproversAbove * 1.6, 1);
  const band = (from: number, to: number) => `${Math.max(8, ((to - from) / top) * 100)}%`;
  return (
    <section className="flex max-w-2xl flex-col rounded-xl border border-line bg-white px-[18px] py-2">
      <div className="flex flex-col gap-1.5 py-3">
        <p className="text-[13.5px] font-bold text-navy">What happens at each amount</p>
        <div className="flex h-9 gap-0.5 overflow-hidden rounded-md text-[12px] font-bold">
          <span className="flex items-center justify-center bg-[#E3F5EC] text-[#1A7F4B]" style={{ width: band(0, r.autoLimit) }}>Sends by itself</span>
          <span className="flex items-center justify-center bg-[#FFF3DC] text-[#8A5A0B]" style={{ width: band(r.autoLimit, r.twoApproversAbove) }}>1 admin</span>
          <span className="flex flex-1 items-center justify-center bg-[#FDE8E8] text-[#A12A2A]">2 admins</span>
        </div>
        <div className="relative h-4 text-[11.5px] text-muted">
          <span className="absolute left-0">0</span>
          <span className="absolute -translate-x-1/2" style={{ left: band(0, r.autoLimit) }}>{walletMoney(r.autoLimit, 'XAF')}</span>
          <span className="absolute -translate-x-1/2" style={{ left: `calc(${band(0, r.autoLimit)} + ${band(r.autoLimit, r.twoApproversAbove)})` }}>{walletMoney(r.twoApproversAbove, 'XAF')}</span>
        </div>
        <p className="text-xs text-muted">Numbers outside Cameroon, or not MTN or Orange, always go to an admin to pay by hand.</p>
      </div>
      {num('autoLimit', 'Sends without approval up to', 'FCFA')}
      {num('twoApproversAbove', 'Two admins needed over', 'FCFA')}
      {num('dailyMax', 'Most per person per day', 'FCFA')}
      {num('clearingDays', 'Money clears after a sale', 'days')}
      {num('coolingHours', 'Wait after a payout account changes', 'hours')}
      {num('lowFloat', 'Warn when spare in the payout account is below', 'FCFA')}
      <label className="flex items-center justify-between gap-3 border-t border-line py-3"><span className="text-[13.5px] text-ink2">The operator’s fee is paid by</span>
        <select value={r.payeePaysFee ? 'earner' : 'us'} onChange={e => setR({ ...r, payeePaysFee: e.target.value === 'earner' })} className="input-base h-9 w-40"><option value="earner">The earner</option><option value="us">CareerPath</option></select></label>
      <label className="flex items-center justify-between gap-3 border-t border-line py-3"><span className="text-[13.5px] text-ink2"><b className="text-navy">Pause all withdrawals</b><span className="block text-xs text-muted">Balances stay; no one can withdraw until you turn it back on.</span></span>
        <input type="checkbox" checked={r.paused} onChange={e => setR({ ...r, paused: e.target.checked })} className="h-5 w-5" /></label>
      <p className="border-t border-line py-3 text-xs text-muted">The smallest withdrawal is set in Monthly statements (minimum payout). Saving asks for your code.</p>
      <div className="pb-3"><Button size="sm" onClick={save}>Save rules</Button></div>
    </section>
  );
}

const RISK: Record<string, [string, string]> = { low: ['Low risk', 'bg-[#E3F5EC] text-[#1A7F4B]'], medium: ['Medium', 'bg-[#FFF3DC] text-[#8A5A0B]'], high: ['High risk', 'bg-[#FDE8E8] text-[#A12A2A]'] };
const ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

/** Approvals as a review desk: the queue on the left, one decision on the right, with keyboard shortcuts */
function ReviewDesk({ rows, twoAbove, onApprove, onPay, onRefuse }: { rows: Row[] | null; twoAbove: number; onApprove: (r: Row) => void; onPay: (r: Row) => void; onRefuse: (r: Row) => void }) {
  const [filter, setFilter] = useState<'all' | 'high' | 'hand'>('all');
  const [sel, setSel] = useState<string | null>(null);
  const list = (rows ?? []).filter(r => filter === 'all' || (filter === 'high' ? r.risk === 'high' : r.method === 'manual'))
    .sort((a, b) => ORDER[a.risk ?? 'low'] - ORDER[b.risk ?? 'low'] || b.amount - a.amount);
  const r = list.find(x => x.id === sel) ?? list[0] ?? null;
  const i = r ? list.indexOf(r) : -1;
  const primary = (x: Row) => (x.method === 'manual' ? onPay(x) : onApprove(x));
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!r || e.metaKey || e.ctrlKey || (e.target as HTMLElement)?.closest('input,textarea,select,[role=dialog]')) return;
      if (e.key === 'j') setSel(list[Math.min(list.length - 1, i + 1)]?.id ?? null);
      else if (e.key === 'k') setSel(list[Math.max(0, i - 1)]?.id ?? null);
      else if (e.key === 'a') primary(r);
      else if (e.key === 'r') onRefuse(r);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  });
  if (!rows) return <div className="h-64 animate-pulse rounded-xl border border-line bg-white" />;
  if (!rows.length) return <p className="rounded-xl border border-line bg-white px-4 py-10 text-center text-[13px] text-ink2">Nothing waiting. Withdrawals under the limit go out on their own.</p>;

  const a = r?.account, changedDays = a?.changedAt ? ageDays(a.changedAt) : null;
  const months = a ? Math.max(1, Math.round(ageDays(a.createdAt) / 30)) : 0;
  const checks: [string, string, 'good' | 'warn' | 'bad'][] = r ? [
    ['Name', a?.nameCheck === 'match' ? `Matches ${r.paidTo.split(' ')[0]}` : a?.isVerified ? 'Confirmed by an admin' : a?.nameCheck === 'mismatch' ? `Registered to ${r.payeeName ?? 'someone else'}` : 'Not checked', a?.nameCheck === 'match' || a?.isVerified ? 'good' : a?.nameCheck === 'mismatch' ? 'bad' : 'warn'],
    ['Account', changedDays != null ? `Number changed ${changedDays === 0 ? 'today' : `${changedDays} day${changedDays === 1 ? '' : 's'} ago`}` : a ? `${months} month${months === 1 ? '' : 's'}, unchanged` : '—', changedDays != null && changedDays < 7 ? 'bad' : 'good'],
    ['Size', r.usual ? `${(r.amount / r.usual).toFixed(1)}× their usual` : 'First withdrawal', !r.usual || r.amount > 2 * r.usual ? 'warn' : 'good'],
    ['Sending', r.flags.includes('send-failed') ? 'Tranzak couldn’t send it' : r.method === 'manual' ? 'Pay by hand' : 'Through Tranzak', r.flags.includes('send-failed') ? 'bad' : r.method === 'manual' ? 'warn' : 'good'],
  ] : [];
  const tone = { good: 'bg-[#E3F5EC] text-[#1A7F4B]', warn: 'bg-[#FFF3DC] text-[#8A5A0B]', bad: 'bg-[#FDE8E8] text-[#A12A2A]' };
  const monthsMax = Math.max(1, ...(r?.months ?? [0]));
  const monthLabel = (k: number) => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 5 + k); return d.toLocaleDateString('en-GB', { month: 'short' }); };
  const FILTERS: ['all' | 'high' | 'hand', string][] = [['all', `All ${rows.length}`], ['high', `High risk ${rows.filter(x => x.risk === 'high').length}`], ['hand', `By hand ${rows.filter(x => x.method === 'manual').length}`]];

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[340px_minmax(0,1fr)]">
      <section className="flex flex-col overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex flex-wrap gap-1.5 border-b border-line p-3">
          {FILTERS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setFilter(k)} className={clsx('inline-flex h-8 items-center rounded-md border px-2.5 text-[12.5px] font-semibold', filter === k ? 'border-[#3F6FE8] bg-accent-soft text-navy' : 'border-line text-ink2')}>{l}</button>
          ))}
        </div>
        {list.map(x => (
          <button key={x.id} type="button" onClick={() => setSel(x.id)} className={clsx('flex items-center justify-between gap-3 border-t border-line px-3.5 py-3 text-left', x.id === r?.id ? 'border-l-[3px] border-l-[#3F6FE8] bg-subtle' : 'hover:bg-subtle')}>
            <span className="min-w-0"><b className="block truncate text-[13.5px] text-navy">{x.user.name}</b><span className="block truncate text-xs text-muted">{ROLE[x.user.role] ?? x.user.role} · {x.paidTo}</span></span>
            <span className="flex flex-shrink-0 flex-col items-end gap-1"><b className="text-[13.5px] text-navy">{walletMoney(x.amount, x.currency)}</b><span className={clsx(tag, x.method === 'manual' ? 'bg-accent-soft text-[#2F57C9]' : RISK[x.risk ?? 'low'][1])}>{x.method === 'manual' ? 'By hand' : RISK[x.risk ?? 'low'][0]}</span></span>
          </button>
        ))}
        {!list.length && <p className="px-4 py-6 text-center text-[13px] text-ink2">None here.</p>}
      </section>

      {r && <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-5">
        <div className="flex flex-wrap items-center gap-3">
          <PersonPhoto src={r.user.avatarUrl} name={r.user.name} id={r.user.id} size={48} />
          <span className="min-w-0 flex-1"><b className="block text-lg text-navy">{r.user.name}</b><span className="text-[13px] text-muted">{ROLE[r.user.role] ?? r.user.role} · {r.account?.country ?? '—'} · on CareerPath since {new Date(r.user.since).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span></span>
          <span className="text-right"><b className="block text-[26px] font-extrabold tracking-[-0.02em] text-navy">{walletMoney(r.amount, r.currency)}</b><span className="text-[13px] text-muted">to {r.paidTo}{r.payeeName ? ` · ${r.payeeName}` : ''}</span></span>
        </div>
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
          {checks.map(([l, v, t]) => <div key={l} className={clsx('rounded-lg px-3 py-2.5', tone[t])}><p className="text-[11.5px] font-semibold opacity-80">{l}</p><p className="text-[13px] font-bold">{v}</p></div>)}
        </div>
        {r.months && <div>
          <p className="text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">Earned · last 6 months</p>
          <div className="mt-2 flex h-20 items-end gap-2" role="img" aria-label={`Earned each month: ${r.months.map((m, k) => `${monthLabel(k)} ${walletMoney(m, r.currency)}`).join(', ')}`}>
            {r.months.map((m, k) => <div key={k} className="flex h-full flex-1 flex-col items-center justify-end gap-1" title={`${monthLabel(k)}: ${walletMoney(m, r.currency)}`}><span className={clsx('w-full rounded-t', k === 5 ? 'bg-[#3F6FE8]' : 'bg-[#BFD0FA]')} style={{ height: `${Math.max(3, Math.round((m / monthsMax) * 64))}px` }} /><span className="text-[10.5px] text-muted">{monthLabel(k)}</span></div>)}
          </div>
          {!!r.earned90d?.length && <p className="mt-1.5 text-xs text-ink2">Last 90 days: {r.earned90d.slice(0, 3).map(e => `${walletMoney(e.amount, r.currency)} ${SOURCE[e.source] ?? e.source.toLowerCase()}`).join(' · ')}</p>}
        </div>}
        {(r.approvalsNeeded > 1 || r.failureReason) && <div className="flex flex-col gap-1.5 rounded-lg bg-subtle px-3.5 py-2.5 text-[13px]">
          {r.approvalsNeeded > 1 && <p><span className={clsx(tag, 'bg-accent-soft text-[#2F57C9]')}>{r.approvals} of {r.approvalsNeeded} approvals</span> <span className="text-ink2">Over {walletMoney(twoAbove, 'XAF')} needs two different admins.{r.approvedBy.length ? ` Approved by ${r.approvedBy.join(', ')}.` : ''}</span></p>}
          {r.failureReason && <p className="text-[#A12A2A]">{r.failureReason}</p>}
        </div>}
        <div className="flex flex-wrap items-center gap-2">
          {r.method === 'manual' ? <Button onClick={() => onPay(r)}>Mark paid</Button> : <Button onClick={() => onApprove(r)}>{r.flags.includes('send-failed') ? 'Send again' : 'Approve and send'}</Button>}
          {r.method !== 'manual' && r.flags.includes('send-failed') && <Button variant="secondary" onClick={() => onPay(r)}>Mark paid</Button>}
          <Button variant="secondary" onClick={() => onRefuse(r)}>Refuse…</Button>
          <span className="ml-auto hidden items-center gap-2 text-xs text-muted sm:flex">
            {[['A', r.method === 'manual' ? 'paid' : 'approve'], ['R', 'refuse'], ['J K', 'next']].map(([k, l]) => <span key={k} className="inline-flex items-center gap-1"><kbd className="rounded border border-line bg-subtle px-1.5 text-[11px] font-bold text-ink2">{k}</kbd>{l}</span>)}
          </span>
        </div>
      </section>}
    </div>
  );
}
