'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import { KIND_COLOURS } from '@/components/wallet/WalletCharts';
import api from '@/lib/api';
import { PersonPhoto } from '@/components/ui/PersonPhoto';

interface Mentor { id: string; avatarUrl?: string | null; name: string | null; firstName: string | null; lastName: string | null; email: string; bio: string | null; teachingSubjects?: { id: string; name: string }[]; avgRating: number | null; reviewCount: number; openSlots: number; nextAt?: string | null; weekSlots?: number }
interface Slot { id: string; startsAt: string; endsAt: string; durationMins: number }
interface Booking {
  id: string; notes: string | null; status: string; cancelReason: string | null;
  slot: Slot & { teacher: { id: string; name?: string | null; firstName: string | null; lastName: string | null; email: string; avatarUrl?: string | null } };
  review: { rating: number; comment: string | null } | null;
}
interface Allowance { hasPackage: boolean; perMonth: number | null; used: number; left: number | null }

const DAY = 86_400_000;
const nameOf = (p: { name?: string | null; firstName: string | null; lastName: string | null; email: string }) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const time = (d: string | number) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayName = (d: string | number) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const when = (d: string) => `${dayName(d)}, ${time(d)}`;
const dayKey = (d: string | number) => new Date(d).toDateString();
const colourOf = (id: string) => KIND_COLOURS[[...id].reduce((n, c) => n + c.charCodeAt(0), 0) % KIND_COLOURS.length];

function inDays(d: string) {
  const a = new Date(); a.setHours(0, 0, 0, 0);
  const b = new Date(d); b.setHours(0, 0, 0, 0);
  const n = Math.round((+b - +a) / DAY);
  return n <= 0 ? 'Today' : n === 1 ? 'Tomorrow' : `In ${n} days`;
}

/** One session as a calendar file the phone can add */
function downloadIcs(b: Booking) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CareerPath Africa//Mentorship//EN', 'BEGIN:VEVENT', `UID:mentor-${b.id}@careerpathafrica`, `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(new Date(b.slot.startsAt))}`, `DTEND:${fmt(new Date(b.slot.endsAt))}`, `SUMMARY:Mentor session with ${nameOf(b.slot.teacher).replace(/[,;]/g, ' ')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'mentor-session.ics'; a.click(); URL.revokeObjectURL(a.href);
}

export default function StudentMentorshipPage() {
  const [mentors, setMentors] = useState<Mentor[] | null>(null);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [allow, setAllow] = useState<Allowance | null>(null);
  const [mentorId, setMentorId] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [day, setDay] = useState<string | null>(null);
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
    setSlots(null); setSlotId(null); setDay(null);
    if (mentorId) api.get(`/mentorship/mentors/${mentorId}/slots`).then(r => setSlots(r.data ?? [])).catch(() => setSlots([]));
  }, [mentorId]);

  const now = Date.now();
  const upcoming = useMemo(() => bookings.filter(b => b.status === 'CONFIRMED' && new Date(b.slot.endsAt).getTime() > now).sort((a, b) => +new Date(a.slot.startsAt) - +new Date(b.slot.startsAt)), [bookings, now]);
  const past = bookings.filter(b => !upcoming.includes(b)).sort((a, b) => +new Date(b.slot.startsAt) - +new Date(a.slot.startsAt));
  const held = bookings.filter(b => b.status === 'COMPLETED');
  const heldMins = held.reduce((n, b) => n + b.slot.durationMins, 0);
  const next = upcoming[0];
  const nextMentor = next ? mentors?.find(m => m.id === next.slot.teacher.id) : undefined;
  const opensAt = next ? new Date(next.slot.startsAt).getTime() - 10 * 60_000 : 0;
  const nextOpen = next && now >= opensAt;
  const outOfSessions = allow?.left === 0 && !moving;

  // Free times for the chosen mentor, grouped by day for the next two weeks
  const days = useMemo(() => Array.from({ length: 14 }, (_, i) => {
    const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + i);
    return { key: d.toDateString(), date: d, slots: (slots ?? []).filter(s => dayKey(s.startsAt) === d.toDateString()) };
  }), [slots]);
  const pickedDay = days.find(d => d.key === day) ?? days.find(d => d.slots.length) ?? days[0];
  const slot = slots?.find(s => s.id === slotId);
  const mentor = mentors?.find(m => m.id === mentorId);
  const monthName = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toLocaleDateString('en-GB', { month: 'long' });

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

  const per = allow?.perMonth ?? 0, left = allow?.left ?? 0;
  const ring = per ? left / per : 0;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Mentorship" subtitle="30 minutes one-to-one with a teacher you choose, included with your package" />
      <div className="flex flex-col gap-[18px] p-4 lg:px-7 lg:py-6">
        <div className="flex flex-wrap gap-[18px]">
          {next ? (
            <section className="keep-light relative flex min-w-0 flex-[999_1_520px] flex-col gap-3.5 overflow-hidden rounded-xl bg-[#3F6FE8] p-5 text-navy sm:px-[26px] sm:py-6">
              <div className="flex items-start justify-between gap-3">
                <p className="text-[12.5px] font-bold uppercase tracking-[0.08em]">Your next session</p>
                <span className="inline-flex h-[26px] items-center rounded-md bg-[#FFFFFF] px-2.5 text-[12.5px] font-bold">{inDays(next.slot.startsAt)}</span>
              </div>
              <p className="text-[34px] font-extrabold leading-none tracking-[-0.03em] sm:text-[44px]">{dayName(next.slot.startsAt)}, <span className="text-[#FFFFFF]">{time(next.slot.startsAt)}</span></p>
              <div className="flex items-center gap-3">
                <PersonPhoto src={next.slot.teacher.avatarUrl ?? nextMentor?.avatarUrl} name={nameOf(next.slot.teacher)} id={next.slot.teacher.id} size={48} className="ring-2 ring-[#FFFFFF]" />
                <div className="min-w-0">
                  <p className="text-base font-bold">{nameOf(next.slot.teacher)}</p>
                  <p className="mt-px text-[13px] text-[#0B1F55]">{[nextMentor?.teachingSubjects?.map(s => s.name).slice(0, 2).join(', '), nextMentor?.avgRating ? `${nextMentor.avgRating} ★ from ${nextMentor.reviewCount} student${nextMentor.reviewCount === 1 ? '' : 's'}` : null, `${next.slot.durationMins} min`].filter(Boolean).join(' · ')}</p>
                </div>
              </div>
              {next.notes && <p className="rounded-lg bg-[rgba(255,255,255,0.28)] px-3 py-2.5 text-[13.5px] text-[#0B1F55]">You wrote: “{next.notes}”</p>}
              <div className="flex flex-wrap gap-2">
                {nextOpen
                  ? <Link href={`/student/mentorship/session/${next.id}`} className="inline-flex h-9 items-center rounded-md bg-[#072061] px-3.5 text-[13px] font-bold text-[#FFFFFF]">Join session</Link>
                  : <span className="inline-flex h-9 items-center rounded-md bg-[rgba(7,32,97,0.25)] px-3.5 text-[13px] font-bold text-[#FFFFFF]">Join opens at {time(opensAt)}</span>}
                <button type="button" onClick={() => { setMoving(next); setMentorId(next.slot.teacher.id); }} className="inline-flex h-9 items-center rounded-md bg-[#FFFFFF] px-3.5 text-[13px] font-bold">Reschedule</button>
                <button type="button" onClick={() => downloadIcs(next)} className="inline-flex h-9 items-center rounded-md bg-[#FFFFFF] px-3.5 text-[13px] font-bold">Add to my calendar</button>
                <button type="button" onClick={() => setCancelling(next)} className="inline-flex h-9 items-center px-2.5 text-[13px] font-bold">Cancel</button>
              </div>
            </section>
          ) : (
            <section className="keep-light flex min-w-0 flex-[999_1_520px] flex-col justify-center gap-2 rounded-xl bg-[#3F6FE8] p-6 text-navy">
              <p className="text-[12.5px] font-bold uppercase tracking-[0.08em]">Mentorship</p>
              <p className="text-[30px] font-extrabold leading-tight tracking-[-0.02em]">Talk it through <span className="text-[#FFFFFF]">one-to-one</span></p>
              <p className="max-w-[520px] text-sm text-[#0B1F55]">30 minutes with a teacher you choose: a hard topic, a mock result, or how to plan your last weeks.</p>
            </section>
          )}

          <section className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5 rounded-xl border border-line bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Sessions this month</p>
            {allow && !allow.hasPackage ? (
              <>
                <p className="text-[13.5px] text-ink2">Mentorship comes with packages, or as an extra on a course.</p>
                <Link href="/packages" className="inline-flex h-9 items-center self-start rounded-md bg-azure-strong px-3.5 text-[13px] font-bold text-on-accent">See packages</Link>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <svg role="img" aria-label={`${left} of ${per} sessions left this month`} viewBox="0 0 120 120" className="h-28 w-28 flex-shrink-0">
                  <circle cx="60" cy="60" r="48" fill="none" stroke="var(--color-accent-soft, #EAF0FF)" strokeWidth="14" />
                  {ring > 0 && <circle cx="60" cy="60" r="48" fill="none" stroke="#3F6FE8" strokeWidth="14" strokeDasharray={`${(ring * 301.6).toFixed(1)} 301.6`} transform="rotate(-90 60 60)" strokeLinecap="round" />}
                  <text x="60" y="58" textAnchor="middle" fontSize="30" fontWeight="800" fill="currentColor" className="text-navy">{left}</text>
                  <text x="60" y="78" textAnchor="middle" fontSize="12" fill="currentColor" className="text-muted">of {per} left</text>
                </svg>
                <div className="flex min-w-0 flex-col gap-1 text-[13px] text-ink2">
                  <p><strong className="text-navy">{upcoming.length} booked</strong>{next ? ` · ${dayName(next.slot.startsAt)}` : ''}</p>
                  <p>{per} more on <strong className="text-navy">1 {monthName}</strong></p>
                  <p>Included with your access</p>
                </div>
              </div>
            )}
            <dl className="grid grid-cols-2 gap-2.5">
              <div className="rounded-lg bg-subtle px-3 py-2.5"><dt className="text-xs text-muted">Held so far</dt><dd className="mt-0.5 text-xl font-extrabold text-navy">{held.length} <span className="text-[12.5px] font-semibold text-muted">· {heldMins >= 60 ? `${Math.floor(heldMins / 60)} h${heldMins % 60 ? ` ${heldMins % 60}` : ''}` : `${heldMins} min`}</span></dd></div>
              <div className="rounded-lg bg-subtle px-3 py-2.5"><dt className="text-xs text-muted">Coming up</dt><dd className="mt-0.5 text-xl font-extrabold text-navy">{upcoming.length}</dd></div>
            </dl>
          </section>
        </div>

        <section className="flex flex-col gap-4 rounded-xl border border-line bg-white p-4 sm:p-[22px]">
          <div className="flex flex-wrap items-baseline justify-between gap-2.5">
            <h2 className="text-lg font-extrabold text-navy">{moving ? `Move your session on ${when(moving.slot.startsAt)}` : 'Book a session'}</h2>
            <ol className="flex gap-3.5 text-[13px]">
              {[['1', 'Mentor', !!mentorId], ['2', 'Day', !!pickedDay?.slots.length], ['3', 'Time', !!slotId]].map(([n, l, on]) => (
                <li key={n as string} className={clsx('flex items-center gap-1.5', on ? 'font-bold text-navy' : 'text-muted')}>
                  <span className={clsx('flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-extrabold', on ? 'bg-[#3F6FE8] text-[#FFFFFF]' : 'border border-line text-muted')}>{n}</span>{l}
                </li>
              ))}
            </ol>
          </div>

          {allow && !allow.hasPackage ? (
            <p className="rounded-lg bg-subtle px-3.5 py-3 text-[13px] text-ink2">Mentorship comes with packages. <Link href="/packages" className="font-semibold text-azure-strong hover:underline">See packages</Link></p>
          ) : outOfSessions ? (
            <p className="rounded-lg bg-subtle px-3.5 py-3 text-[13px] text-ink2">You’ve used this month’s sessions. You can book again from 1 {monthName}.</p>
          ) : mentors === null ? <div className="h-40 animate-pulse rounded-lg bg-subtle" /> : !mentors.length ? (
            <p className="text-[13px] text-ink2">No mentor has free times right now. Check again in a day or two.</p>
          ) : <>
            <div>
              <p className="mb-2 text-[13px] font-bold text-navy">1 · Choose a mentor</p>
              <div className="flex gap-2.5 overflow-x-auto pb-1 sm:grid sm:[grid-template-columns:repeat(auto-fill,minmax(230px,1fr))]">
                {mentors.map(m => {
                  const n = nameOf(m), on = mentorId === m.id;
                  return (
                    <button key={m.id} type="button" onClick={() => setMentorId(m.id)} aria-pressed={on}
                      className={clsx('flex min-w-[230px] items-center gap-3 rounded-lg border-2 p-3 text-left sm:min-w-0', on ? 'border-[#3F6FE8] bg-accent-soft' : 'border-line bg-white hover:bg-subtle')}>
                      <PersonPhoto src={m.avatarUrl} name={n} id={m.id} size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-navy">{n}</span>
                        <span className="block truncate text-xs text-muted">{m.teachingSubjects?.map(s => s.name).slice(0, 2).join(', ') || 'Mentor'}</span>
                        <span className="mt-1 flex gap-2 text-xs"><strong className="text-navy">{m.avgRating ? `${m.avgRating} ★ (${m.reviewCount})` : 'New mentor'}</strong>{m.nextAt && <span className="font-semibold text-azure-strong">Next: {new Date(m.nextAt).toLocaleDateString('en-GB', { weekday: 'short' })} {time(m.nextAt)}</span>}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <p className="mb-2 text-[13px] font-bold text-navy">2 · Pick a day <span className="font-medium text-muted">· dots are free times</span></p>
              {slots === null ? <div className="h-[76px] animate-pulse rounded-lg bg-subtle" /> : (
                <div className="flex gap-2 overflow-x-auto pb-0.5">
                  {days.map(d => {
                    const on = d.key === pickedDay.key, has = d.slots.length > 0;
                    return (
                      <button key={d.key} type="button" disabled={!has} aria-pressed={on} onClick={() => { setDay(d.key); setSlotId(null); }}
                        className={clsx('flex h-[76px] w-16 flex-shrink-0 flex-col items-center justify-center gap-[3px] rounded-lg',
                          on && has ? 'bg-[#3F6FE8] text-[#FFFFFF]' : has ? 'border border-line bg-white text-navy hover:bg-subtle' : 'border border-dashed border-line bg-subtle text-muted')}>
                        <span className="text-[11.5px] font-semibold">{d.date.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                        <span className="text-xl font-extrabold">{d.date.getDate()}</span>
                        <span className="flex h-1.5 gap-[3px]">{Array.from({ length: Math.min(3, d.slots.length) }, (_, i) => <span key={i} className={clsx('h-1.5 w-1.5 rounded-full', on ? 'bg-[#FFFFFF]' : 'bg-[#3F6FE8]')} />)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <p className="mb-2 text-[13px] font-bold text-navy">3 · Pick a time <span className="font-medium text-muted">· {pickedDay.date.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, your time</span></p>
              <div className="flex flex-wrap gap-2">
                {pickedDay.slots.length ? pickedDay.slots.map(s => (
                  <button key={s.id} type="button" onClick={() => setSlotId(s.id)} aria-pressed={slotId === s.id}
                    className={clsx('h-10 min-w-[96px] rounded-md px-3.5 text-sm font-bold', slotId === s.id ? 'border-2 border-[#3F6FE8] bg-accent-soft text-navy' : 'border border-line bg-white text-ink2 hover:bg-subtle')}>{time(s.startsAt)}</button>
                )) : <span className="inline-flex h-10 items-center rounded-md border border-dashed border-line bg-subtle px-3.5 text-[13px] text-muted">{slots?.length ? 'Pick a day with free times' : 'No free times with this mentor yet'}</span>}
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3.5 rounded-lg bg-subtle p-4">
              {!moving && (
                <label className="flex min-w-0 flex-[1_1_340px] flex-col gap-1.5"><span className="text-[13px] font-bold text-navy">What do you want to talk about?</span>
                  <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} maxLength={500} placeholder="For example: my mock result in Paper 2 and how to plan the last weeks"
                    className="w-full resize-none rounded-md border border-line bg-white px-3 py-2 text-[13.5px] text-navy outline-none focus:border-azure" />
                </label>
              )}
              <div className="flex flex-[0_1_300px] flex-col gap-1.5">
                <p className="text-[13px] text-ink2">{slot && mentor ? `${when(slot.startsAt)} with ${nameOf(mentor)}${!moving && left === 1 ? ' · uses your last session this month' : ''}` : 'Choose a time'}</p>
                <div className="flex gap-2">
                  <Button className="h-[42px] flex-1" loading={busy} disabled={!slotId} onClick={book}>{slot ? `${moving ? 'Move to' : 'Book'} ${new Date(slot.startsAt).toLocaleDateString('en-GB', { weekday: 'short' })} ${time(slot.startsAt)}` : 'Choose a time'}</Button>
                  {moving && <Button variant="ghost" className="h-[42px]" onClick={() => setMoving(null)}>Keep it</Button>}
                </div>
              </div>
            </div>
          </>}
        </section>

        <div className="flex flex-wrap items-start gap-[18px]">
          <section className="min-w-0 flex-[999_1_560px] rounded-xl border border-line bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 px-[18px] py-3.5">
              <h2 className="text-base font-bold text-navy">Your sessions</h2>
              <span className="text-[12.5px] text-muted">{[`${held.length} held`, bookings.filter(b => b.status === 'MISSED').length ? `${bookings.filter(b => b.status === 'MISSED').length} missed by the mentor` : null, bookings.filter(b => b.status === 'CANCELLED').length ? `${bookings.filter(b => b.status === 'CANCELLED').length} cancelled` : null].filter(Boolean).join(' · ')}</span>
            </div>
            {[...upcoming.slice(1), ...past].length === 0 && <p className="border-t border-line px-[18px] py-8 text-center text-[13px] text-ink2">Your sessions will appear here.</p>}
            {[...upcoming.slice(1), ...past].map(b => {
              const d = new Date(b.slot.startsAt);
              const st = b.status === 'CANCELLED' ? 'off' : b.status === 'MISSED' ? 'miss' : b.status === 'COMPLETED' ? 'ok' : new Date(b.slot.endsAt).getTime() > now ? 'next' : 'wait';
              return (
                <div key={b.id} className="flex flex-wrap items-center gap-3 border-t border-line px-[18px] py-3 text-[13.5px]">
                  <span className="w-10 flex-shrink-0 text-center"><span className="block text-[11px] font-semibold text-muted">{d.toLocaleDateString('en-GB', { month: 'short' })}</span><span className="block text-lg font-extrabold text-navy">{d.getDate()}</span></span>
                  <div className="min-w-0 flex-[1_1_200px]">
                    <p className="font-bold text-navy">{nameOf(b.slot.teacher)}</p>
                    <p className="mt-0.5 truncate text-[12.5px] text-muted">{st === 'off' ? (b.cancelReason ?? 'Cancelled') : st === 'miss' ? 'The mentor didn’t join · not counted' : [b.notes, `${time(b.slot.startsAt)} · ${b.slot.durationMins} min`].filter(Boolean).join(' · ')}</p>
                  </div>
                  <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-bold',
                    st === 'ok' ? 'bg-[#E6F5EE] text-[#1F6B47]' : st === 'miss' ? 'bg-[#FFF6E5] text-[#8A5A0B]' : st === 'next' ? 'bg-accent-soft text-navy' : 'bg-subtle text-muted')}>
                    {st === 'ok' ? `Held${b.review ? ` · ${'★'.repeat(b.review.rating)}` : ''}` : st === 'miss' ? 'Missed' : st === 'off' ? 'Cancelled' : st === 'next' ? 'Coming up' : 'Checking'}
                  </span>
                  <span className="flex w-[130px] justify-end gap-3 text-[13px] font-bold">
                    {st === 'next' && <button type="button" onClick={() => setCancelling(b)} className="text-muted hover:text-navy">Cancel</button>}
                    {(st === 'ok' || st === 'wait') && <Link href={`/mentorship/board/${b.id}`} className="text-azure-strong hover:underline">Board</Link>}
                    {st === 'ok' && !b.review && <button type="button" onClick={() => setRating(b)} className="text-azure-strong hover:underline">Rate it</button>}
                    {st === 'miss' && <button type="button" onClick={() => { setMentorId(b.slot.teacher.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="text-azure-strong hover:underline">Book again</button>}
                  </span>
                </div>
              );
            })}
          </section>
          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 rounded-xl border border-line bg-white px-5 py-[18px]">
            <h3 className="text-[15px] font-bold text-navy">Get the most from 30 minutes</h3>
            <ol className="flex list-decimal flex-col gap-1.5 pl-[18px] text-[13px] text-ink2">
              <li>Bring one question or one past paper, not five.</li>
              <li>Open the shared board and write the question before you join.</li>
              <li>After, the board is saved under the session so you can look again.</li>
            </ol>
            <p className="mt-1.5 border-t border-line pt-2.5 text-[12.5px] text-muted">If your mentor doesn’t join, the session doesn’t count and you can book again.</p>
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
