'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState, useRef, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { SkeletonTopbar, SkeletonCard, SkeletonListRow } from '@/components/ui/Skeleton';
import { Card, IconBox } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { VideoEmbed } from '@/components/ui/VideoEmbed';
import api from '@/lib/api';

type Tab = 'browse' | 'bookings';
type BookingStatus = 'CONFIRMED' | 'CANCELLED' | 'COMPLETED' | 'NO_SHOW';

interface Teacher {
  id: string; email: string;
  name: string | null; firstName: string | null; lastName: string | null;
}
interface Mentor {
  id: string; email: string;
  name: string | null; firstName: string | null; lastName: string | null;
  bio: string | null;
  avgRating: number | null;
  reviewCount: number;
  openSlots: number;
  videoIntroUrl: string | null;
  teachingSubjects?: { id: string; name: string }[];
}
interface Slot {
  id: string; startsAt: string; endsAt?: string; durationMins: number;
}
interface Booking {
  id: string;
  status: BookingStatus;
  notes?: string | null;
  slot?: Slot & { teacher?: Teacher };
  review?: { rating: number; comment: string | null } | null;
}

function StarRating({ value, onChange }: { value: number; onChange?: (v: number) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" onClick={() => onChange?.(n)}
          className={`text-2xl transition leading-none ${n <= value ? 'text-amber-400' : 'text-cloud'} ${onChange ? 'hover:text-amber-300 cursor-pointer' : 'cursor-default'}`}>
          ★
        </button>
      ))}
    </div>
  );
}

function initials(t: Partial<Teacher>): string {
  if (t.firstName || t.lastName) return `${t.firstName?.[0] ?? ''}${t.lastName?.[0] ?? ''}`.toUpperCase();
  return t.email?.[0]?.toUpperCase() ?? '?';
}

function displayName(t: Partial<Teacher>): string {
  if (t.firstName || t.lastName) return `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim();
  return t.email ? t.email.split('@')[0] : 'Teacher';
}

function fmtTime(d: string) {
  const date = new Date(d);
  const time = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const tz = new Intl.DateTimeFormat(undefined, { timeZoneName: 'short' })
    .formatToParts(date)
    .find(p => p.type === 'timeZoneName')?.value ?? '';
  return tz ? `${time} ${tz}` : time;
}

function fmtSlotDate(d: string) {
  const date = new Date(d);
  const weekday = date.toLocaleDateString('en-GB', { weekday: 'short' });
  const day     = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  const time    = fmtTime(d);
  return `${weekday} · ${day} · ${time}`;
}

function isToday(d: string) {
  const t = new Date(d);
  const n = new Date();
  return t.getFullYear() === n.getFullYear() && t.getMonth() === n.getMonth() && t.getDate() === n.getDate();
}

const BOOKING_STATUS: Record<BookingStatus, { label: string; variant: 'active' | 'muted' | 'default' }> = {
  CONFIRMED: { label: 'Confirmed', variant: 'active' },
  CANCELLED: { label: 'Cancelled', variant: 'muted' },
  COMPLETED: { label: 'Completed', variant: 'muted' },
  NO_SHOW:   { label: 'No show',   variant: 'muted' },
};

function MentorshipContent() {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();
  const slotsRef = useRef<HTMLDivElement>(null);

  const [tab,              setTabState]         = useState<Tab>(() => (params.get('tab') as Tab) ?? 'browse');
  const [mentors,          setMentors]          = useState<Mentor[]>([]);
  const [slots,            setSlots]            = useState<Slot[]>([]);
  const [bookings,         setBookings]         = useState<Booking[]>([]);
  const [loading,          setLoading]          = useState(true);
  const [slotsLoading,     setSlotsLoading]     = useState(false);
  const [bookingSlot,      setBookingSlot]      = useState<string | null>(null);
  const [selectedMentor,   setSelectedMentor]   = useState<Mentor | null>(null);
  const [pendingSlot,      setPendingSlot]      = useState<Slot | null>(null);
  const [bookingNote,      setBookingNote]      = useState('');
  const [cancelTarget,     setCancelTarget]     = useState<Booking | null>(null);
  const [cancelReason,     setCancelReason]     = useState('');
  const [cancelling,       setCancelling]       = useState(false);
  const [reviewTarget,     setReviewTarget]     = useState<Booking | null>(null);
  const [reviewRating,     setReviewRating]     = useState(5);
  const [reviewComment,    setReviewComment]    = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);

  function setTab(t: Tab) {
    setTabState(t);
    const p = new URLSearchParams(params.toString());
    if (t === 'browse') p.delete('tab'); else p.set('tab', t);
    router.replace(`${pathname}${p.toString() ? `?${p.toString()}` : ''}`, { scroll: false });
  }

  useEffect(() => {
    Promise.all([
      api.get('/mentorship/mentors').then(r => setMentors(r.data ?? [])).catch(() => {}),
      api.get('/mentorship/bookings/mine').then(r => setBookings(r.data ?? [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  async function loadSlots(mentor: Mentor) {
    setSelectedMentor(mentor);
    setSlotsLoading(true);
    try {
      const r = await api.get(`/mentorship/mentors/${mentor.id}/slots`);
      setSlots(r.data ?? []);
    } catch {
      setSlots([]);
    } finally {
      setSlotsLoading(false);
    }
    setTimeout(() => slotsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  }

  async function confirmBooking() {
    if (!pendingSlot) return;
    setBookingSlot(pendingSlot.id);
    try {
      await api.post('/mentorship/bookings', { slotId: pendingSlot.id, notes: bookingNote.trim() || undefined });
      const r = await api.get('/mentorship/bookings/mine');
      setBookings(r.data ?? []);
      setSlots(prev => prev.filter(s => s.id !== pendingSlot.id));
      setPendingSlot(null);
      setBookingNote('');
      setTab('bookings');
      notify.success('Session booked!');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Booking failed');
    } finally {
      setBookingSlot(null);
    }
  }

  async function cancelBooking() {
    if (!cancelTarget) return;
    setCancelling(true);
    try {
      await api.patch(`/mentorship/bookings/${cancelTarget.id}/cancel`, { reason: cancelReason || undefined });
      setBookings(prev => prev.map(b => b.id === cancelTarget.id ? { ...b, status: 'CANCELLED' } : b));
      setCancelTarget(null);
      setCancelReason('');
      notify.success('Booking cancelled');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  }

  async function submitReview() {
    if (!reviewTarget || reviewRating < 1) return;
    setSubmittingReview(true);
    try {
      await api.post(`/mentorship/bookings/${reviewTarget.id}/review`, {
        rating: reviewRating,
        comment: reviewComment || undefined,
      });
      setBookings(prev => prev.map(b =>
        b.id === reviewTarget.id ? { ...b, review: { rating: reviewRating, comment: reviewComment } } : b
      ));
      setReviewTarget(null);
      setReviewRating(5);
      setReviewComment('');
      notify.success('Review submitted!');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Review failed');
    } finally {
      setSubmittingReview(false);
    }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-5 space-y-5">
        <div className="h-10 w-52 rounded-xl bg-cloud animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="space-y-2">
            <div className="h-2.5 w-36 rounded bg-cloud animate-pulse" />
            {[1,2,3].map(i => <SkeletonCard key={i} lines={2} />)}
          </div>
          <div className="space-y-2">
            <div className="h-2.5 w-28 rounded bg-cloud animate-pulse" />
            <div className="rounded-2xl border border-cloud bg-white shadow-card overflow-hidden">
              {[1,2,3,4].map(i => <SkeletonListRow key={i} />)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  const now = Date.now();

  // Sort bookings: upcoming confirmed first, then by slot time descending
  const sortedBookings = [...bookings].sort((a, b) => {
    const aTime = a.slot?.startsAt ? new Date(a.slot.startsAt).getTime() : 0;
    const bTime = b.slot?.startsAt ? new Date(b.slot.startsAt).getTime() : 0;
    const aUpcoming = a.status === 'CONFIRMED' && aTime > now;
    const bUpcoming = b.status === 'CONFIRMED' && bTime > now;
    if (aUpcoming !== bUpcoming) return aUpcoming ? -1 : 1;
    return aUpcoming ? aTime - bTime : bTime - aTime; // upcoming: soonest first; past: newest first
  });

  const upcomingBookings = sortedBookings.filter(b => b.status === 'CONFIRMED' && (b.slot?.startsAt ? new Date(b.slot.startsAt).getTime() > now : false));
  const pastBookings     = sortedBookings.filter(b => !upcomingBookings.includes(b));

  // Badge: only upcoming CONFIRMED sessions
  const upcomingCount = upcomingBookings.length;

  // Mentors with slots: show mentors with 0 open slots after those with slots
  const mentorsWithSlots    = mentors.filter(m => m.openSlots > 0);
  const mentorsWithoutSlots = mentors.filter(m => m.openSlots <= 0);

  function renderBookingCard(b: Booking) {
    const status   = b.status as BookingStatus;
    const sl       = BOOKING_STATUS[status] ?? BOOKING_STATUS.CANCELLED;
    const slotTime = b.slot?.startsAt ? new Date(b.slot.startsAt) : null;
    const endTime  = b.slot?.endsAt   ? new Date(b.slot.endsAt)   : null;
    const isUpcoming = slotTime && slotTime.getTime() > now;
    const isLiveNow  = slotTime && endTime && slotTime.getTime() <= now && endTime.getTime() > now;
    const isPast     = endTime && endTime.getTime() < now;
    const today      = slotTime && isToday(slotTime.toISOString());
    const canCancel  = status === 'CONFIRMED' && isUpcoming;
    const canJoin    = status === 'CONFIRMED' && (isLiveNow || (isUpcoming && slotTime!.getTime() - now < 15 * 60_000));
    const canReview  = isPast && status !== 'CANCELLED' && !b.review;

    return (
      <Card key={b.id} padding="none" className="overflow-hidden">
        {isLiveNow && <div className="h-1 w-full bg-red-400" />}
        {today && !isLiveNow && <div className="h-1 w-full bg-azure" />}
        <div className="p-4 flex items-start gap-4">
          <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${
            status === 'CANCELLED' ? 'bg-royal/30' : 'bg-azure'
          }`}>
            {initials(b.slot?.teacher ?? {})}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-0.5">
              <p className="text-sm font-semibold text-navy">{displayName(b.slot?.teacher ?? {})}</p>
              {isLiveNow && status === 'CONFIRMED' ? (
                <span className="flex items-center gap-1 rounded-full bg-red-50 border border-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500" />
                  </span>
                  Live now
                </span>
              ) : (
                <Badge variant={sl.variant}>{sl.label}</Badge>
              )}
              {today && !isLiveNow && status === 'CONFIRMED' && (
                <span className="rounded-full bg-azure/10 border border-azure/20 px-2 py-0.5 text-[10px] font-semibold text-azure">
                  Today
                </span>
              )}
            </div>
            {slotTime && (
              <p className="text-xs text-royal/50">
                {slotTime.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                {' · '}{fmtTime(slotTime.toISOString())}
                {' · '}{b.slot?.durationMins ?? 30} min
              </p>
            )}
            {b.review && (
              <div className="flex items-center gap-2 mt-1.5">
                <StarRating value={b.review.rating} />
                {b.review.comment && (
                  <p className="text-xs text-royal/50 truncate max-w-[200px]">{b.review.comment}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 items-end flex-shrink-0">
            {canJoin && (
              <button
                onClick={() => router.push(`/student/mentorship/session/${b.id}`)}
                className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold text-white transition ${
                  isLiveNow ? 'bg-red-500 hover:bg-red-600' : 'bg-azure hover:bg-royal'
                }`}>
                <Icon name="play" size={11} />
                {isLiveNow ? 'Join now' : 'Join'}
              </button>
            )}
            {canReview && (
              <button onClick={() => setReviewTarget(b)}
                className="inline-flex items-center gap-1 rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700 hover:bg-amber-100 transition">
                <Icon name="star" size={11} className="text-amber-500" /> Review
              </button>
            )}
            {canCancel && (
              <button onClick={() => setCancelTarget(b)}
                className="text-xs text-royal/40 hover:text-red-500 transition underline underline-offset-2">
                Cancel
              </button>
            )}
          </div>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Mentorship" subtitle="Book one-on-one sessions with your teachers" />

      <div className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-5 space-y-5">

        {/* Tabs */}
        <div className="flex items-center gap-1 rounded-xl border border-cloud bg-white p-1 w-fit">
          {([['browse', 'Browse Mentors'], ['bookings', 'My Sessions']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
                tab === t ? 'bg-azure text-white shadow-sm' : 'text-royal/60 hover:text-navy'
              }`}>
              {label}
              {t === 'bookings' && upcomingCount > 0 && (
                <Badge variant={tab === t ? 'active' : 'default'}>{upcomingCount}</Badge>
              )}
            </button>
          ))}
        </div>

        {/* ── BROWSE ── */}
        {tab === 'browse' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

            {/* Mentor list */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 px-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Available Mentors</p>
                {mentorsWithSlots.length > 0 && <Badge>{mentorsWithSlots.length}</Badge>}
              </div>

              {mentors.length === 0 ? (
                <Card>
                  <EmptyState
                    icon="user"
                    title="No mentors available"
                    description="No teachers have open slots right now. Check back soon."
                  />
                </Card>
              ) : (
                <div className="space-y-2">
                  {[...mentorsWithSlots, ...mentorsWithoutSlots].map((m: Mentor) => {
                    const hasSlots = m.openSlots > 0;
                    return (
                      <button key={m.id}
                        onClick={() => hasSlots ? loadSlots(m) : undefined}
                        disabled={!hasSlots}
                        className={`w-full text-left rounded-2xl border bg-white transition-all ${
                          !hasSlots
                            ? 'border-cloud opacity-50 cursor-default'
                            : selectedMentor?.id === m.id
                              ? 'border-azure ring-2 ring-azure/20 shadow-card hover:shadow-card-md'
                              : 'border-cloud shadow-card hover:border-azure/30 hover:shadow-card-md'
                        }`}>
                        <div className="p-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-azure text-sm font-bold text-white">
                              {initials(m)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-navy truncate">{displayName(m)}</p>
                              <p className="text-xs text-royal/50 truncate">
                                {m.teachingSubjects?.map((s) => s.name).join(', ') || 'Mentor'}
                              </p>
                              <div className="flex items-center gap-3 mt-1 flex-wrap">
                                {m.avgRating ? (
                                  <span className="flex items-center gap-0.5 text-xs font-semibold text-amber-500">
                                    <Icon name="star" size={12} className="text-amber-400" />
                                    {m.avgRating}
                                    <span className="font-normal text-royal/40 ml-0.5">({m.reviewCount})</span>
                                  </span>
                                ) : (
                                  <span className="text-xs text-royal/40">No reviews yet</span>
                                )}
                                {hasSlots ? (
                                  <span className="text-xs font-medium text-azure">
                                    {m.openSlots} slot{m.openSlots !== 1 ? 's' : ''} open
                                  </span>
                                ) : (
                                  <span className="text-xs text-royal/40">No open slots</span>
                                )}
                                {m.videoIntroUrl && (
                                  <span className="flex items-center gap-1 text-xs text-royal/40">
                                    <Icon name="play" size={11} /> Intro video
                                  </span>
                                )}
                              </div>
                            </div>
                            {hasSlots && <Icon name="chevronRight" size={14} className="text-royal/30 flex-shrink-0" />}
                          </div>
                          {m.bio && (
                            <p className="text-xs text-royal/50 mt-2.5 line-clamp-2 leading-relaxed">{m.bio}</p>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Slots panel */}
            <div className="space-y-3" ref={slotsRef}>
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure px-1">
                {selectedMentor ? `${displayName(selectedMentor)}'s Slots` : 'Available Slots'}
              </p>

              {!selectedMentor ? (
                <Card>
                  <EmptyState
                    icon="live"
                    title="Select a mentor"
                    description="Select a mentor to see their available slots"
                  />
                </Card>
              ) : slotsLoading ? (
                <Card padding="none" className="divide-y divide-cloud">
                  {[1,2,3].map(i => <SkeletonListRow key={i} />)}
                </Card>
              ) : (
                <>
                  {/* Video intro */}
                  {selectedMentor.videoIntroUrl && (
                    <Card padding="none" className="overflow-hidden">
                      <VideoEmbed url={selectedMentor.videoIntroUrl} title={`Intro video · ${displayName(selectedMentor)}`} />
                      <div className="px-4 py-2.5 bg-surface border-t border-cloud">
                        <p className="text-xs text-royal/40">Intro video · {displayName(selectedMentor)}</p>
                      </div>
                    </Card>
                  )}

                  {/* Slots */}
                  {slots.length === 0 ? (
                    <Card>
                      <EmptyState
                        icon="live"
                        title="No slots available"
                        description="This mentor hasn't opened any slots yet. You'll be notified when new sessions are added."
                        action={{
                          label: 'Notify me',
                          onClick: () => notify.success(`We'll let you know when ${displayName(selectedMentor)} opens new slots.`),
                        }}
                      />
                    </Card>
                  ) : (
                    <Card padding="none" className="divide-y divide-cloud">
                      {slots.map((slot: Slot) => (
                        <div key={slot.id} className="flex items-center gap-4 px-4 py-3.5">
                          <div className="flex-shrink-0 text-center min-w-[40px]">
                            <p className="text-base font-bold text-navy leading-none">
                              {new Date(slot.startsAt).getDate()}
                            </p>
                            <p className="text-[10px] font-medium text-royal/50 uppercase mt-0.5">
                              {new Date(slot.startsAt).toLocaleDateString('en-GB', { month: 'short' })}
                            </p>
                          </div>
                          <div className="w-px h-8 bg-cloud flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-navy">
                              {new Date(slot.startsAt).toLocaleDateString('en-GB', { weekday: 'short' })} · {fmtTime(slot.startsAt)}
                            </p>
                            <p className="text-xs text-royal/50">{slot.durationMins} min session</p>
                          </div>
                          <button
                            disabled={bookingSlot === slot.id}
                            onClick={() => setPendingSlot(slot)}
                            className="flex-shrink-0 btn-primary text-xs px-4 py-2 disabled:opacity-50">
                            {bookingSlot === slot.id ? 'Booking…' : 'Book'}
                          </button>
                        </div>
                      ))}
                    </Card>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* ── BOOKINGS ── */}
        {tab === 'bookings' && (
          <div className="space-y-5">
            {bookings.length === 0 ? (
              <Card>
                <EmptyState
                  icon="live"
                  title="No sessions yet"
                  description="Book a session with one of your mentors to get started."
                  action={{ label: 'Browse mentors', onClick: () => setTab('browse') }}
                />
              </Card>
            ) : (
              <>
                {/* Upcoming */}
                {upcomingBookings.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Upcoming</p>
                      <Badge variant="active">{upcomingBookings.length}</Badge>
                    </div>
                    {upcomingBookings.map(renderBookingCard)}
                  </div>
                )}

                {/* Past */}
                {pastBookings.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 px-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-azure">
                        {upcomingBookings.length > 0 ? 'Past Sessions' : 'All Sessions'}
                      </p>
                      <Badge>{pastBookings.length}</Badge>
                    </div>
                    {pastBookings.map(renderBookingCard)}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── BOOKING CONFIRMATION MODAL ── */}
      {pendingSlot && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-navy/20 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-cloud bg-white shadow-card-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-cloud flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-navy">Confirm booking</p>
                <p className="text-xs text-royal/50 mt-0.5">with {displayName(selectedMentor ?? {})}</p>
              </div>
              <button onClick={() => { setPendingSlot(null); setBookingNote(''); }}
                className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-cloud transition text-royal/40">
                <Icon name="close" size={14} />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="rounded-xl bg-surface border border-cloud px-4 py-3 space-y-0.5">
                <p className="text-sm font-semibold text-navy">
                  {fmtSlotDate(pendingSlot.startsAt)}
                </p>
                <p className="text-xs text-royal/50">{pendingSlot.durationMins} min session</p>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-navy block">
                  What do you want to discuss?
                  <span className="font-normal text-royal/40 ml-1">(optional)</span>
                </label>
                <textarea
                  value={bookingNote}
                  onChange={e => setBookingNote(e.target.value)}
                  placeholder="e.g. Help with ACCA F3 Chapter 4 — I'm struggling with consolidation..."
                  rows={3}
                  className="input-base resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  disabled={!!bookingSlot}
                  onClick={confirmBooking}
                  className="flex-1 btn-primary py-2.5 disabled:opacity-50">
                  {bookingSlot ? 'Confirming…' : 'Confirm booking'}
                </button>
                <button
                  onClick={() => { setPendingSlot(null); setBookingNote(''); }}
                  className="btn-secondary px-4 py-2.5">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── CANCEL MODAL ── */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-navy/20 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-cloud bg-white shadow-card-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-cloud">
              <p className="text-sm font-semibold text-navy">Cancel session?</p>
              {cancelTarget.slot?.startsAt && (
                <p className="text-xs text-royal/50 mt-0.5">
                  {new Date(cancelTarget.slot.startsAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>
            <div className="p-5 space-y-4">
              <textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="Reason for cancellation (optional)"
                rows={2}
                className="input-base resize-none"
              />
              <div className="flex gap-3">
                <button onClick={cancelBooking} disabled={cancelling}
                  className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-semibold text-white hover:bg-red-600 disabled:opacity-50 transition">
                  {cancelling ? 'Cancelling…' : 'Yes, cancel'}
                </button>
                <button onClick={() => { setCancelTarget(null); setCancelReason(''); }}
                  className="flex-1 btn-secondary py-2.5">
                  Keep it
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── REVIEW MODAL ── */}
      {reviewTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-navy/20 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-2xl border border-cloud bg-white shadow-card-lg overflow-hidden">
            <div className="px-5 py-4 border-b border-cloud">
              <p className="text-sm font-semibold text-navy">Review your session</p>
              <p className="text-xs text-royal/50 mt-0.5">with {displayName(reviewTarget.slot?.teacher ?? {})}</p>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex justify-center">
                <StarRating value={reviewRating} onChange={setReviewRating} />
              </div>
              <textarea
                value={reviewComment}
                onChange={e => setReviewComment(e.target.value)}
                placeholder="Share your experience (optional)"
                rows={3}
                className="input-base resize-none"
              />
              <div className="flex gap-3">
                <button disabled={submittingReview} onClick={submitReview}
                  className="flex-1 btn-primary py-2.5 disabled:opacity-50">
                  {submittingReview ? 'Submitting…' : 'Submit review'}
                </button>
                <button onClick={() => { setReviewTarget(null); setReviewRating(5); setReviewComment(''); }}
                  className="flex-1 btn-secondary py-2.5">
                  Skip
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StudentMentorshipPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const S = Suspense as any;
  return (
    <S fallback={
      <div className="flex flex-col min-h-full">
        <div className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-5">
          <div className="h-10 w-52 rounded-xl bg-cloud animate-pulse" />
        </div>
      </div>
    }>
      <MentorshipContent />
    </S>
  );
}
