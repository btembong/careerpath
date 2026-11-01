'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { RepTable, td } from '@/components/rep/RepTable';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Person = { id: string; firstName: string | null; lastName: string | null; email: string };
interface Booking {
  id: string; status: 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | string; notes: string | null; bookedAt: string; cancelReason: string | null; cancelledAt: string | null;
  slot: { startsAt: string; endsAt: string; durationMins: number; teacher: Person };
  student: Person; review: { rating: number; comment: string | null } | null;
}

const name = (p: Person) => [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function AdminMentorshipPage() {
  const [all, setAll] = useState<Booking[] | null>(null);
  const [tab, setTab] = useState('upcoming');
  const [q, setQ] = useState('');
  const [cancelling, setCancelling] = useState<Booking | null>(null);

  const load = () => api.get('/mentorship/admin/bookings').then(r => setAll(r.data ?? [])).catch(() => { setAll([]); notify.error('Could not load sessions'); });
  useEffect(() => { load(); }, []);

  const now = Date.now();
  const filters: Record<string, (b: Booking) => boolean> = {
    upcoming: b => b.status === 'CONFIRMED' && +new Date(b.slot.endsAt) > now,
    past: b => b.status === 'COMPLETED' || (b.status === 'CONFIRMED' && +new Date(b.slot.endsAt) <= now),
    cancelled: b => b.status === 'CANCELLED',
  };
  const rows = (all ?? []).filter(filters[tab])
    .filter(b => !q.trim() || `${name(b.student)} ${b.student.email} ${name(b.slot.teacher)}`.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (tab === 'upcoming' ? 1 : -1) * (+new Date(a.slot.startsAt) - +new Date(b.slot.startsAt)));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const thisMonth = (all ?? []).filter(b => new Date(b.slot.startsAt) >= monthStart);
  const week = now + 7 * 86_400_000;
  const reviews = (all ?? []).filter(b => b.review);
  const avg = reviews.length ? reviews.reduce((n, b) => n + b.review!.rating, 0) / reviews.length : null;

  return (
    <>
      <RepTable title="Mentorship" subtitle="One-to-one sessions between students and teachers"
        stats={[
          { l: 'This month', v: all ? String(thisMonth.filter(b => b.status !== 'CANCELLED' && +new Date(b.slot.endsAt) <= now).length) : '—', sub: 'sessions held' },
          { l: 'Coming up', v: all ? String((all ?? []).filter(b => filters.upcoming(b) && +new Date(b.slot.startsAt) <= week).length) : '—', sub: 'in the next 7 days' },
          { l: 'Cancelled', v: all ? String(thisMonth.filter(b => b.status === 'CANCELLED').length) : '—', sub: 'this month' },
          { l: 'Rating', v: avg != null ? avg.toFixed(1) : '—', sub: reviews.length ? `from ${reviews.length} review${reviews.length === 1 ? '' : 's'}` : 'no reviews yet' },
        ]}
        tabs={[{ key: 'upcoming', label: 'Coming up', count: all?.filter(filters.upcoming).length ?? 0 }, { key: 'past', label: 'Past', count: all?.filter(filters.past).length ?? 0 }, { key: 'cancelled', label: 'Cancelled', count: all?.filter(filters.cancelled).length ?? 0 }]}
        tab={tab} onTab={setTab} search={q} onSearch={setQ} searchLabel="Search student or teacher"
        cols={['Student', 'Teacher', 'When', 'Length', 'Status', '']}
        loading={!all} empty={all && !rows.length ? (q ? 'Nobody matches.' : tab === 'upcoming' ? 'No sessions booked.' : tab === 'past' ? 'No sessions yet.' : 'Nothing cancelled.') : null}
        note="Cancelling tells both of them and frees the teacher’s slot. Students rate a session after it ends.">
        {rows.map(b => (
          <tr key={b.id} className="hover:bg-subtle">
            <td className={td}><strong className="text-navy">{name(b.student)}</strong><br /><span className="text-[12.5px] text-muted">{b.notes ? `“${b.notes.slice(0, 60)}${b.notes.length > 60 ? '…' : ''}”` : b.student.email}</span></td>
            <td className={clsx(td, 'text-navy')}>{name(b.slot.teacher)}<br /><span className="text-[12.5px] text-muted">{b.slot.teacher.email}</span></td>
            <td className={clsx(td, 'text-ink2')}>{when(b.slot.startsAt)}</td>
            <td className={clsx(td, 'text-ink2')}>{b.slot.durationMins} min</td>
            <td className={td}>
              <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-[12px] font-semibold', filters.upcoming(b) ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>
                {b.status === 'CANCELLED' ? 'Cancelled' : filters.upcoming(b) ? 'Confirmed' : b.review ? `Held · ★ ${b.review.rating}` : 'Held'}
              </span>
              {b.status === 'CANCELLED' && b.cancelReason && <><br /><span className="text-[12px] text-muted">{b.cancelReason}</span></>}
            </td>
            <td className={clsx(td, 'text-right')}>{filters.upcoming(b) && +new Date(b.slot.startsAt) > now && <button onClick={() => setCancelling(b)} className="font-semibold text-azure-strong hover:underline">Cancel</button>}</td>
          </tr>
        ))}
      </RepTable>
      <CancelDialog booking={cancelling} onClose={() => setCancelling(null)} onDone={() => { setCancelling(null); load(); }} />
    </>
  );
}

function CancelDialog({ booking, onClose, onDone }: { booking: Booking | null; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => setReason(''), [booking]);
  async function cancel() {
    if (!booking) return;
    setSaving(true);
    try { await api.patch(`/mentorship/admin/bookings/${booking.id}/cancel`, { reason: reason.trim() || undefined }); notify.success('Session cancelled', { description: 'Both of them have been told.' }); onDone(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not cancel it'); }
    finally { setSaving(false); }
  }
  return (
    <Dialog open={!!booking} onOpenChange={o => !o && onClose()}>
      <DialogContent title="Cancel this session?" description={booking ? `${name(booking.student)} with ${name(booking.slot.teacher)} · ${when(booking.slot.startsAt)}` : ''}>
        <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Reason (they’ll see it)</span>
          <input value={reason} onChange={e => setReason(e.target.value)} maxLength={500} placeholder="e.g. The teacher is unwell" className="input-base" /></label>
        <DialogFooter><Button variant="secondary" size="sm" onClick={onClose}>Keep it</Button><Button size="sm" onClick={cancel} loading={saving}>Cancel session</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
