'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import { money } from '@/lib/money';
import api from '@/lib/api';

type Buy = { id: string; purchasedAt: string; expiresAt: string | null; amountPaid: number | null; currency: string | null; invoiceNo: string | null };
interface Ticket {
  id: string; category: string; subject: string; message: string; status: string; adminNote: string | null; createdAt: string; updatedAt: string;
  student: {
    id: string; email: string; name: string | null; firstName: string | null; lastName: string | null; phone: string | null; country: { name: string } | null;
    purchases: (Buy & { package: { name: string } })[]; coursePurchases: (Buy & { course: { title: string } })[];
  };
}
type Tab = 'open' | 'answered' | 'closed';

const TAB_OF: Record<string, Tab> = { OPEN: 'open', IN_PROGRESS: 'open', RESOLVED: 'answered', CLOSED: 'closed' };
const who = (s: Ticket['student']) => s.name || [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email;
const short = (iso: string) => { const d = new Date(iso); return d.toDateString() === new Date().toDateString() ? 'today' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }); };

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [tab, setTab] = useState<Tab>('open');
  const [sel, setSel] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () => api.get('/support/admin/tickets').then(r => setTickets(r.data ?? [])).catch(() => { setTickets([]); notify.error('Could not load support requests'); });
  useEffect(() => { load(); }, []);

  const list = useMemo(() => (tickets ?? []).filter(t => TAB_OF[t.status] === tab), [tickets, tab]);
  const t = (tickets ?? []).find(x => x.id === sel) ?? list[0] ?? null;
  useEffect(() => { setReply(t?.adminNote ?? ''); }, [t?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function update(status: string, note?: string) {
    if (!t) return;
    setSaving(true);
    try {
      await api.patch(`/support/admin/tickets/${t.id}`, { status, ...(note !== undefined ? { adminNote: note } : {}) });
      notify.success(status === 'RESOLVED' ? 'Reply sent' : status === 'CLOSED' ? 'Closed' : 'Saved');
      setSel(t.id); load();
    } catch { notify.error('Could not save it'); }
    finally { setSaving(false); }
  }

  const buys = t ? [...t.student.purchases.map(p => ({ ...p, title: p.package.name })), ...t.student.coursePurchases.map(c => ({ ...c, title: c.course.title }))].sort((a, b) => +new Date(b.purchasedAt) - +new Date(a.purchasedAt)) : [];
  const count = (k: Tab) => (tickets ?? []).filter(x => TAB_OF[x.status] === k).length;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Support" subtitle="Questions from students about payments, access and courses" />
      <div className="p-4 lg:px-7 lg:py-[22px]">
        <div className="flex min-h-[640px] flex-wrap overflow-hidden rounded-lg border border-line bg-white">
          <section className="w-full shrink-0 border-line md:w-[360px] md:border-r">
            <div className="flex gap-1 border-b border-line px-3 text-[13.5px]">
              {(['open', 'answered', 'closed'] as Tab[]).map(k => (
                <button key={k} onClick={() => { setTab(k); setSel(null); }} aria-pressed={tab === k}
                  className={clsx('-mb-px border-b-2 px-2 py-[13px] capitalize text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent')}>{k} {count(k)}</button>
              ))}
            </div>
            {!tickets ? <div className="m-3 h-40 animate-pulse rounded bg-subtle" /> : list.length ? list.map(x => (
              <button key={x.id} onClick={() => setSel(x.id)} className={clsx('block w-full border-b border-line px-3.5 py-3 text-left', t?.id === x.id ? 'bg-accent-soft' : 'hover:bg-subtle')}>
                <span className="flex gap-2"><span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-navy">{x.subject}</span><span className="shrink-0 text-[12px] text-muted">{short(x.createdAt)}</span></span>
                <span className="mt-0.5 block truncate text-[12.5px] text-muted">{who(x.student)} · {x.category}</span>
              </button>
            )) : <p className="px-4 py-10 text-center text-[13px] text-ink2">{tab === 'open' ? 'Nothing waiting. ' : 'Nothing here.'}</p>}
          </section>

          <section className="flex min-w-0 flex-1 flex-col gap-3 px-[22px] py-[18px]">
            {!t ? <p className="m-auto text-[13px] text-ink2">Choose a request.</p> : <>
              <div className="flex items-baseline gap-2.5">
                <p className="min-w-0 flex-1 text-[18px] font-extrabold text-navy">{t.subject}</p>
                <span className={clsx('inline-flex h-6 shrink-0 items-center rounded px-2 text-[12px] font-semibold', TAB_OF[t.status] === 'open' ? 'border border-dashed border-azure text-azure-strong' : TAB_OF[t.status] === 'answered' ? 'bg-accent-soft text-navy' : 'border border-line text-ink2')}>
                  {t.status === 'IN_PROGRESS' ? 'Being looked at' : TAB_OF[t.status] === 'open' ? 'Open' : TAB_OF[t.status] === 'answered' ? 'Answered' : 'Closed'}
                </span>
              </div>
              <p className="-mt-1.5 text-[13px] text-muted">{who(t.student)} · {t.student.email}{t.student.phone ? ` · ${t.student.phone}` : ''} · {t.category} · {new Date(t.createdAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
              <p className="whitespace-pre-wrap rounded-lg bg-subtle px-3.5 py-3 text-[13.5px] text-ink2">{t.message}</p>
              <div className="flex flex-wrap gap-2 text-[12.5px] text-navy">
                {t.student.country && <span className="rounded-md border border-line px-2.5 py-1.5">{t.student.country.name}</span>}
                {buys.length ? buys.slice(0, 4).map(b => (
                  <span key={b.id} className="rounded-md border border-line px-2.5 py-1.5">{b.title} · {b.amountPaid ? money(b.amountPaid, b.currency ?? 'GHS') : 'free'} · {short(b.purchasedAt)}{b.invoiceNo ? ` · ${b.invoiceNo}` : ''}{b.expiresAt ? ` · ${+new Date(b.expiresAt) > Date.now() ? 'until' : 'ended'} ${short(b.expiresAt)}` : ''}</span>
                )) : <span className="rounded-md border border-line px-2.5 py-1.5 text-muted">No purchases</span>}
                <Link href={`/admin/users?open=${t.student.id}`} className="rounded-md px-2.5 py-1.5 font-semibold text-azure-strong hover:underline">Open in Users</Link>
              </div>
              <label className="mt-auto flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">{t.adminNote ? 'Your reply (editing sends it again)' : 'Reply'}</span>
                <textarea value={reply} onChange={e => setReply(e.target.value)} rows={5} placeholder="They see this on their Support page and get a notification." className="input-base min-h-[120px] py-2" /></label>
              <div className="flex flex-wrap justify-end gap-2">
                {TAB_OF[t.status] !== 'closed' && <Button size="sm" variant="secondary" onClick={() => update('CLOSED')} loading={saving}>Close{reply.trim() ? '' : ' without reply'}</Button>}
                {t.status === 'OPEN' && <Button size="sm" variant="secondary" onClick={() => update('IN_PROGRESS')} loading={saving}>Mark as being looked at</Button>}
                <Button size="sm" onClick={() => update('RESOLVED', reply.trim())} loading={saving} disabled={!reply.trim() || reply.trim() === t.adminNote}>Send reply</Button>
              </div>
            </>}
          </section>
        </div>
      </div>
    </div>
  );
}
