'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Mentor { id: string; name: string | null; firstName: string | null; lastName: string | null; email: string; bio: string | null; teachingSubjects?: { id: string; name: string }[]; avgRating: number | null; reviewCount: number; openSlots: number }
interface Slot { id: string; startsAt: string; endsAt: string; durationMins: number }
interface Booking {
  id: string; notes: string | null; status: string; cancelReason: string | null;
  slot: Slot & { teacher: { id: string; firstName: string | null; lastName: string | null; email: string } };
  review: { rating: number; comment: string | null } | null;
}
interface Allowance { hasPackage: boolean; perMonth: number | null; used: number; left: number | null }

const nameOf = (p: { name?: string | null; firstName: string | null; lastName: string | null; email: string }) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const when = (d: string) => `${new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, ${new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;

export default function StudentMentorshipPage() {
  const [mentors, setMentors] = useState<Mentor[] | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allow, setAllow] = useState<Allowance | null>(null);
  const [mentorId, setMentorId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [moving, setMoving] = useState<Booking | null>(null);
  const [cancelling, setCancelling] = useState<Booking | null>(null);
  const [rating, setRating] = useState<Booking | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [m, b, a] = await Promise.all([
      api.get('/mentorship/mentors').catch(() => ({ data: [] })),
      api.get('/mentorship/bookings/mine').catch(() => ({ data: [] })),
      api.get('/mentorship/allowance').catch(() => ({ data: null })),
    ]);
    setMentors(m.data ?? []); setBookings(b.data ?? []); setAllow(a.data);
    if (!mentorId && m.data?.length) setMentorId(m.data[0].id);
  }
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    setSlots(null); setSlotId(null);
    if (mentorId) api.get(`/mentorship/mentors/${mentorId}/slots`).then(r => setSlots(r.data ?? [])).catch(() => setSlots([]));
  }, [mentorId]);

  const now = Date.now();
  const upcoming = useMemo(() => bookings.filter(b => b.status !== 'CANCELLED' && new Date(b.slot.endsAt).getTime() > now).sort((a, b) => +new Date(a.slot.startsAt) - +new Date(b.slot.startsAt)), [bookings, now]);
  const past = bookings.filter(b => !upcoming.includes(b));
  const next = upcoming[0];
  const nextOpen = next && new Date(next.slot.startsAt).getTime() - now < 10 * 60_000;
  const slot = slots?.find(s => s.id === slotId);
  const outOfSessions = allow?.left === 0 && !moving;

  async function book() {
    if (!slotId) return;
    setBusy(true);
    try {
      await api.post('/mentorship/bookings', { slotId, notes: notes.trim() || (moving?.notes ?? undefined) });
      if (moving) await api.patch(`/mentorship/bookings/${moving.id}/cancel`, { reason: 'Rescheduled by the student' }).catch(() => {});
      notify.success(moving ? 'Session moved' : 'Session booked', { description: `${when(slot!.startsAt)}. We’ve emailed you the details.` });
      setMoving(null); setNotes(''); setSlotId(null);
      await load();
      if (mentorId) api.get(`/mentorship/mentors/${mentorId}/slots`).then(r => setSlots(r.data ?? [])).catch(() => {});
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not book that time'); }
    finally { setBusy(false); }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Mentorship" subtitle="One-to-one time with a teacher, included in your package" />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        {next && (
          <section className="flex flex-wrap items-center gap-4 rounded-lg border border-azure bg-white px-5 py-[18px]">
            <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-[15px] font-extrabold text-azure-strong">{initials(nameOf(next.slot.teacher))}</span>
            <div className="min-w-0 flex-[999_1_280px]">
              <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Next session · {when(next.slot.startsAt)} · {next.slot.durationMins} min</p>
              <p className="mt-1 text-lg font-extrabold text-navy">{nameOf(next.slot.teacher)}</p>
              {next.notes && <p className="mt-0.5 truncate text-[13.5px] text-ink2">You wrote: “{next.notes}”</p>}
            </div>
            <Button variant="secondary" onClick={() => { setMoving(next); setMentorId(next.slot.teacher.id); }}>Reschedule</Button>
            <Button variant="ghost" onClick={() => setCancelling(next)}>Cancel</Button>
            {nextOpen
              ? <Link href={`/student/mentorship/session/${next.id}`} className="inline-flex h-[38px] items-center rounded-md bg-azure-strong px-[18px] text-[13.5px] font-semibold text-on-accent">Join session</Link>
              : <span className="inline-flex h-[38px] items-center rounded-md border border-line bg-subtle px-3 text-[13px] font-semibold text-muted">Opens 10 min before</span>}
          </section>
        )}

        <div className="flex flex-wrap items-start gap-5">
          <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-3 rounded-lg border border-line bg-white p-[18px]">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold text-navy">{moving ? `Move your session on ${when(moving.slot.startsAt)}` : 'Book a session'}</h2>
              {allow?.perMonth != null && <span className="text-[12.5px] text-muted">{allow.left} of {allow.perMonth} session{allow.perMonth === 1 ? '' : 's'} left this month · from your package</span>}
            </div>
            {allow && !allow.hasPackage ? (
              <div className="rounded-md bg-subtle px-3.5 py-3 text-[13px] text-ink2">Mentorship comes with packages. <Link href="/packages" className="font-semibold text-azure-strong hover:underline">See packages</Link></div>
            ) : outOfSessions ? (
              <p className="rounded-md bg-subtle px-3.5 py-3 text-[13px] text-ink2">You’ve used this month’s sessions. You can book again from the 1st.</p>
            ) : mentors === null ? <div className="h-40 rounded-md bg-subtle animate-pulse" /> : !mentors.length ? (
              <p className="text-[13px] text-ink2">No mentor has free times right now. Check again in a day or two.</p>
            ) : <>
              <div className="flex flex-wrap gap-2">
                {mentors.map(m => {
                  const n = nameOf(m);
                  return (
                    <button key={m.id} type="button" onClick={() => setMentorId(m.id)}
                      className={clsx('flex items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left', mentorId === m.id ? 'border-azure bg-accent-soft' : 'border-line hover:bg-subtle')}>
                      <span className="flex h-9 w-9 items-center justify-center rounded-md bg-accent-soft text-xs font-extrabold text-azure-strong">{initials(n)}</span>
                      <span>
                        <span className="block text-[13.5px] font-semibold text-navy">{n}</span>
                        <span className="block text-xs text-muted">{[m.teachingSubjects?.map(s => s.name).slice(0, 2).join(', '), m.avgRating ? `${m.avgRating} ★ (${m.reviewCount})` : 'New mentor'].filter(Boolean).join(' · ')}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[13px] font-semibold text-navy">Free times</p>
              {slots === null ? <div className="h-20 rounded-md bg-subtle animate-pulse" /> : !slots.length ? <p className="text-[13px] text-ink2">No free times with this mentor yet.</p> : (
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]">
                  {slots.slice(0, 24).map(s => (
                    <button key={s.id} type="button" onClick={() => setSlotId(s.id)}
                      className={clsx('h-9 rounded-md border text-[13px] font-semibold', slotId === s.id ? 'border-azure bg-accent-soft text-navy' : 'border-line text-ink2 hover:bg-subtle')}>
                      {when(s.startsAt)}
                    </button>
                  ))}
                </div>
              )}
              {!moving && (
                <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">What do you want to talk about?</span>
                  <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} placeholder="For example: my mock result in Paper 2 and how to plan the last weeks"
                    className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" />
                </label>
              )}
              <div className="flex gap-2">
                <Button loading={busy} disabled={!slotId} onClick={book}>{slot ? `${moving ? 'Move to' : 'Book'} ${when(slot.startsAt)}` : 'Choose a time'}</Button>
                {moving && <Button variant="ghost" onClick={() => setMoving(null)}>Keep my session</Button>}
              </div>
            </>}
          </section>

          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 rounded-lg border border-line bg-white p-[18px]">
            <h3 className="text-[15px] font-semibold text-navy">Sessions</h3>
            {upcoming.slice(1).map(b => (
              <div key={b.id} className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5">
                <div className="min-w-0 flex-1"><p className="truncate text-[13.5px] font-semibold text-navy">{nameOf(b.slot.teacher)}</p><p className="mt-0.5 text-xs text-muted">{when(b.slot.startsAt)} · coming up</p></div>
                <button type="button" onClick={() => setCancelling(b)} className="text-[12.5px] font-semibold text-muted hover:text-navy">Cancel</button>
              </div>
            ))}
            {!past.length && upcoming.length <= 1 && <p className="text-[13px] text-ink2">Your past sessions will appear here.</p>}
            {past.map(b => {
              const cancelled = b.status === 'CANCELLED';
              return (
                <div key={b.id} className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-navy">{nameOf(b.slot.teacher)}</p>
                    <p className="mt-0.5 truncate text-xs text-muted">{when(b.slot.startsAt)} · {cancelled ? (b.cancelReason ?? 'cancelled') : `${b.slot.durationMins} min`}</p>
                  </div>
                  {!cancelled && <Link href={`/mentorship/board/${b.id}`} className="text-[12.5px] font-semibold text-azure-strong hover:underline">Board</Link>}
                  {cancelled ? <span className="text-[12.5px] text-muted">Cancelled</span>
                    : b.review ? <span className="text-[12.5px] font-semibold text-navy">{'★'.repeat(b.review.rating)}</span>
                    : <button type="button" onClick={() => setRating(b)} className="text-[12.5px] font-semibold text-azure-strong hover:underline">Rate it</button>}
                </div>
              );
            })}
          </aside>
        </div>
      </div>

      <CancelDialog booking={cancelling} onClose={() => setCancelling(null)} onDone={load} />
      <RateDialog booking={rating} onClose={() => setRating(null)} onDone={load} />
    </div>
  );
}

function CancelDialog({ booking, onClose, onDone }: { booking: Booking | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setReason(''); }, [booking]);
  return (
    <Dialog open={!!booking} onOpenChange={o => { if (!o) onClose(); }}>
      {booking && (
        <DialogContent title="Cancel this session?" description={`${when(booking.slot.startsAt)} with ${nameOf(booking.slot.teacher)}. The time goes back to the mentor’s free times.`}>
          <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Reason (optional)</span>
            <input value={reason} onChange={e => setReason(e.target.value)} className="input-base" /></label>
          <DialogFooter>
            <Button size="sm" variant="secondary" onClick={onClose}>Keep it</Button>
            <Button size="sm" variant="danger" loading={busy} onClick={async () => {
              setBusy(true);
              try { await api.patch(`/mentorship/bookings/${booking.id}/cancel`, { reason: reason.trim() || undefined }); notify.success('Session cancelled'); onClose(); await onDone(); }
              catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not cancel'); }
              finally { setBusy(false); }
            }}>Cancel session</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function RateDialog({ booking, onClose, onDone }: { booking: Booking | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setStars(0); setComment(''); }, [booking]);
  return (
    <Dialog open={!!booking} onOpenChange={o => { if (!o) onClose(); }}>
      {booking && (
        <DialogContent title={`How was your session with ${nameOf(booking.slot.teacher)}?`} description="Your rating helps other students choose a mentor.">
          <div className="flex gap-1.5" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map(n => (
              <button key={n} type="button" role="radio" aria-checked={stars === n} onClick={() => setStars(n)}
                className={clsx('h-10 w-10 rounded-md border text-lg', n <= stars ? 'border-azure bg-accent-soft text-azure-strong' : 'border-line text-muted')}>★</button>
            ))}
          </div>
          <label className="mt-3 flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Comment (optional)</span>
            <textarea rows={2} value={comment} onChange={e => setComment(e.target.value)} className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" /></label>
          <DialogFooter>
            <Button size="sm" variant="secondary" onClick={onClose}>Later</Button>
            <Button size="sm" loading={busy} disabled={!stars} onClick={async () => {
              setBusy(true);
              try { await api.post(`/mentorship/bookings/${booking.id}/review`, { rating: stars, comment: comment.trim() || undefined }); notify.success('Thanks for rating'); onClose(); await onDone(); }
              catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not save your rating'); }
              finally { setBusy(false); }
            }}>Send rating</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
