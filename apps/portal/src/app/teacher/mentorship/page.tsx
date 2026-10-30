'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Student { id: string; firstName: string | null; lastName: string | null; email: string }
interface Slot { id: string; startsAt: string; endsAt: string; durationMins: number; isBooked: boolean; booking: { id: string; notes: string | null; status: string; student: Student } | null }
interface Booking { id: string; notes: string | null; status: string; slot: { startsAt: string; endsAt: string; durationMins: number }; student: Student; review: { rating: number; comment: string | null } | null }

const DAY = 86_400_000;
const nameOf = (s: Student) => [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email.split('@')[0];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const time = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const when = (d: string) => {
  const days = Math.round((new Date(new Date(d).toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / DAY);
  return `${days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${time(d)}`;
};

export default function TeacherMentorshipPage() {
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [visible, setVisible] = useState<boolean | null>(null);
  const [weekOffset, setWeekOffset] = useState(0);
  const [adding, setAdding] = useState(false);
  const [cancelling, setCancelling] = useState<Booking | null>(null);

  async function load() {
    const [s, b, p] = await Promise.all([
      api.get('/mentorship/mentors/slots/mine').catch(() => ({ data: [] })),
      api.get('/mentorship/teacher/bookings').catch(() => ({ data: [] })),
      api.get('/teachers/me/profile').catch(() => ({ data: null })),
    ]);
    setSlots(s.data ?? []); setBookings(b.data ?? []);
    setVisible(p.data ? !!p.data.videoIntroUrl : null);
  }
  useEffect(() => { load(); }, []);

  async function removeSlot(id: string) {
    try { await api.delete(`/mentorship/mentors/slots/${id}`); notify.success('Time removed'); await load(); }
    catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not remove that time'); }
  }

  const now = Date.now();
  const upcoming = bookings.filter(b => b.status !== 'CANCELLED' && new Date(b.slot.endsAt).getTime() > now).sort((a, b) => +new Date(a.slot.startsAt) - +new Date(b.slot.startsAt));
  const next = upcoming[0];
  const nextOpen = next && new Date(next.slot.startsAt).getTime() - now < 10 * 60_000;
  const rated = bookings.filter(b => b.review);
  const avg = rated.length ? Math.round((rated.reduce((n, b) => n + b.review!.rating, 0) / rated.length) * 10) / 10 : null;

  const week = useMemo(() => {
    const today = new Date(new Date().toDateString());
    const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY + weekOffset * 7 * DAY);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday.getTime() + i * DAY);
      return { day, slots: (slots ?? []).filter(s => new Date(s.startsAt).toDateString() === day.toDateString()) };
    });
  }, [slots, weekOffset]);

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Mentorship" subtitle="Offer free times; students from your cohorts book them"
        actions={<Button size="sm" onClick={() => setAdding(true)}>Add times</Button>} />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        {visible === false && (
          <p className="rounded-lg border border-azure bg-accent-soft px-4 py-3 text-[13.5px] text-ink2">
            <strong className="text-navy">Students can’t see your times yet.</strong> Add a short intro video to your profile so they know who they’re booking.{' '}
            <Link href="/teacher/profile" className="font-semibold text-azure-strong hover:underline">Go to my profile</Link>
          </p>
        )}

        {next && (
          <section className="flex flex-wrap items-center gap-4 rounded-lg border border-azure bg-white px-5 py-[18px]">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[15px] font-extrabold text-azure-strong">{initials(nameOf(next.student))}</span>
            <div className="min-w-0 flex-[999_1_280px]">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Next session · {when(next.slot.startsAt)} · {next.slot.durationMins} min</p>
              <p className="mt-1 text-lg font-extrabold text-navy">{nameOf(next.student)}</p>
              {next.notes && <p className="mt-0.5 truncate text-[13.5px] text-ink2">“{next.notes}”</p>}
            </div>
            <Button variant="secondary" onClick={() => setCancelling(next)}>Cancel</Button>
            {nextOpen
              ? <Link href={`/teacher/mentorship/session/${next.id}`} className="inline-flex h-[38px] items-center rounded-md bg-azure-strong px-[18px] text-[13.5px] font-semibold text-on-accent">Join session</Link>
              : <span className="inline-flex h-[38px] items-center rounded-md border border-line bg-subtle px-3 text-[13px] font-semibold text-muted">Opens 10 min before</span>}
          </section>
        )}

        <div className="flex flex-wrap items-start gap-5">
          <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-3 rounded-lg border border-line bg-white p-[18px]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-base font-bold text-navy">Your free times</h2>
              <div className="flex items-center gap-2 text-[13px]">
                <button type="button" disabled={weekOffset === 0} onClick={() => setWeekOffset(w => w - 1)} className="font-semibold text-azure-strong disabled:text-muted">Previous week</button>
                <span className="text-muted">·</span>
                <button type="button" onClick={() => setWeekOffset(w => w + 1)} className="font-semibold text-azure-strong">Next week</button>
              </div>
            </div>
            {slots === null ? <div className="h-40 rounded-md bg-subtle animate-pulse" /> : (
              <div className="grid grid-cols-7 gap-1.5">
                {week.map(w => (
                  <div key={w.day.toISOString()} className="flex min-h-[130px] flex-col gap-1 rounded-md border border-line p-1.5 sm:p-2">
                    <p className="text-[11px] font-semibold uppercase text-muted">{w.day.toLocaleDateString('en-GB', { weekday: 'short' })} {w.day.getDate()}</p>
                    {w.slots.map(s => (
                      <span key={s.id} title={s.booking ? `Booked by ${nameOf(s.booking.student)}` : 'Free'}
                        className={clsx('group flex items-center justify-between gap-1 rounded px-1.5 py-1 text-[11.5px] font-semibold', s.isBooked ? 'bg-azure-strong text-on-accent' : 'border border-azure text-navy')}>
                        {time(s.startsAt)}
                        {!s.isBooked && <button type="button" aria-label="Remove this time" onClick={() => removeSlot(s.id)} className="hidden text-muted hover:text-error group-hover:inline">✕</button>}
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            )}
            <p className="text-[12.5px] text-muted">Blue = booked · outlined = free. Hover a free time to remove it.</p>
          </section>

          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 rounded-lg border border-line bg-white p-[18px]">
            <h3 className="text-[15px] font-semibold text-navy">Booked sessions</h3>
            {!upcoming.length && <p className="text-[13px] text-ink2">No bookings yet. Students see your free times on their Mentorship page.</p>}
            {upcoming.map(b => (
              <div key={b.id} className="rounded-md border border-line px-3 py-2.5">
                <p className="flex justify-between gap-2 text-[13.5px] font-semibold text-navy"><span className="truncate">{nameOf(b.student)}</span><span className="whitespace-nowrap font-medium text-muted">{when(b.slot.startsAt)}</span></p>
                {b.notes && <p className="mt-1 text-[12.5px] text-ink2">“{b.notes}”</p>}
              </div>
            ))}
            <p className="mt-1 text-[13px] text-navy">{avg != null ? <><strong>{avg} / 5</strong> <span className="text-muted">from {rated.length} student rating{rated.length === 1 ? '' : 's'}</span></> : <span className="text-muted">No ratings yet</span>}</p>
          </aside>
        </div>
      </div>

      <AddTimesDialog open={adding} onClose={() => setAdding(false)} onDone={load} />
      <Dialog open={!!cancelling} onOpenChange={o => { if (!o) setCancelling(null); }}>
        {cancelling && (
          <DialogContent title="Cancel this session?" description={`${when(cancelling.slot.startsAt)} with ${nameOf(cancelling.student)}. They’ll get an email and the session won’t count against their month.`}>
            <DialogFooter>
              <Button size="sm" variant="secondary" onClick={() => setCancelling(null)}>Keep it</Button>
              <Button size="sm" variant="danger" onClick={async () => {
                try { await api.patch(`/mentorship/bookings/${cancelling.id}/cancel`, { reason: 'Cancelled by the teacher' }); notify.success('Session cancelled'); setCancelling(null); await load(); }
                catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not cancel'); }
              }}>Cancel session</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

function AddTimesDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => Promise<void> }) {
  const [date, setDate] = useState('');
  const [times, setTimes] = useState('18:00, 18:30');
  const [mins, setMins] = useState('30');
  const [weeks, setWeeks] = useState('1');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setDate(new Date(Date.now() + DAY).toISOString().slice(0, 10)); setTimes('18:00, 18:30'); setMins('30'); setWeeks('1'); } }, [open]);
  const list = times.split(/[\s,]+/).map(t => t.trim()).filter(t => /^\d{1,2}:\d{2}$/.test(t));

  async function save() {
    setBusy(true);
    let created = 0, skipped = 0;
    try {
      for (const t of list) {
        const at = new Date(`${date}T${t.padStart(5, '0')}`);
        const r = await api.post('/mentorship/mentors/slots', { startsAt: at.toISOString(), durationMins: Number(mins), repeatWeeks: Number(weeks) }).catch(e => ({ data: { created: 0, skipped: Number(weeks) }, err: e }));
        created += r.data?.created ?? 0; skipped += r.data?.skipped ?? 0;
      }
      if (created) notify.success(`${created} free time${created === 1 ? '' : 's'} added`, skipped ? { description: `${skipped} skipped because you already had a time then` } : undefined);
      else notify.error('No times added', { description: 'They overlap times you already have, or are in the past.' });
      onClose(); await onDone();
    } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      {open && (
        <DialogContent title="Add free times" description="Students from your cohorts can book these one-to-one.">
          <div className="space-y-3">
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Day</span>
                <input type="date" value={date} onChange={e => setDate(e.target.value)} className="input-base" /></label>
              <label className="flex w-28 flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Length</span>
                <select value={mins} onChange={e => setMins(e.target.value)} className="input-base">{[20, 30, 45, 60].map(m => <option key={m} value={m}>{m} min</option>)}</select></label>
            </div>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Start times</span>
              <input value={times} onChange={e => setTimes(e.target.value)} placeholder="18:00, 18:30" className="input-base" />
              <span className="text-xs text-muted">Separate several times with commas.</span></label>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Repeat</span>
              <select value={weeks} onChange={e => setWeeks(e.target.value)} className="input-base">
                <option value="1">Just this day</option>
                {[2, 4, 6, 8, 12].map(w => <option key={w} value={w}>Every week for {w} weeks</option>)}
              </select></label>
          </div>
          <DialogFooter>
            <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={busy} disabled={!date || !list.length} onClick={save}>Add {list.length * Number(weeks)} time{list.length * Number(weeks) === 1 ? '' : 's'}</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
