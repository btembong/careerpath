'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonListRow, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { Select } from '@/components/ui/Select';
import api from '@/lib/api';

type Tab = 'slots' | 'bookings';

interface Student { id: string; firstName?: string | null; lastName?: string | null; email?: string; }
interface SlotBooking { student?: Student; }
interface Slot {
  id: string; startsAt: string; endsAt?: string; durationMins: number;
  isBooked: boolean; booking?: SlotBooking;
}
interface Booking {
  id: string; status: string; notes?: string | null;
  slot?: { startsAt: string; endsAt?: string; durationMins: number };
  student?: Student;
  review?: { rating: number; comment?: string | null } | null;
}

function studentName(s?: Student): string {
  if (!s) return 'Student';
  if (s.firstName || s.lastName) return `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim();
  return s.email?.split('@')[0] ?? 'Student';
}

function MentorshipContent() {
  const router   = useRouter();
  const pathname = usePathname();
  const params   = useSearchParams();

  const [tab,          setTabState]  = useState<Tab>(() => (params.get('tab') as Tab) ?? 'slots');
  const [slots,        setSlots]     = useState<Slot[]>([]);
  const [bookings,     setBookings]  = useState<Booking[]>([]);
  const [loading,      setLoading]   = useState(true);
  const [adding,       setAdding]    = useState(false);
  const [deleting,     setDeleting]  = useState<string | null>(null);
  const [cancelling,   setCancelling]= useState<string | null>(null);
  const [showForm,     setShowForm]  = useState(false);
  const [form,         setForm]      = useState({ startsAt: '', durationMins: '30' });
  const [cancelTarget, setCancelTarget] = useState<Booking | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [videoIntroUrl, setVideoIntroUrl] = useState<string | null>(null);

  function setTab(t: Tab) {
    setTabState(t);
    const p = new URLSearchParams(params.toString());
    if (t === 'slots') p.delete('tab'); else p.set('tab', t);
    router.replace(`${pathname}${p.toString() ? `?${p.toString()}` : ''}`, { scroll: false });
  }

  useEffect(() => {
    Promise.all([
      api.get('/mentorship/mentors/slots/mine').then(r => setSlots(r.data ?? [])).catch(() => {}),
      api.get('/mentorship/teacher/bookings').then(r => setBookings(r.data ?? [])).catch(() => {}),
      api.get('/teachers/me/profile').then(r => setVideoIntroUrl(r.data?.videoIntroUrl ?? null)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  async function addSlot(e: React.FormEvent) {
    e.preventDefault();
    setAdding(true);
    try {
      await api.post('/mentorship/mentors/slots', {
        startsAt: new Date(form.startsAt).toISOString(),
        durationMins: parseInt(form.durationMins),
      });
      const r = await api.get('/mentorship/mentors/slots/mine');
      setSlots(r.data ?? []);
      setForm({ startsAt: '', durationMins: '30' });
      setShowForm(false);
      notify.success('Slot added');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to add slot');
    } finally { setAdding(false); }
  }

  async function deleteSlot(slotId: string) {
    setDeleting(slotId);
    try {
      await api.delete(`/mentorship/mentors/slots/${slotId}`);
      setSlots(s => s.filter(x => x.id !== slotId));
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to delete slot');
    } finally { setDeleting(null); }
  }

  async function cancelBooking() {
    if (!cancelTarget) return;
    setCancelling(cancelTarget.id);
    try {
      await api.patch(`/mentorship/bookings/${cancelTarget.id}/cancel`, { reason: cancelReason || undefined });
      setBookings(prev => prev.map(b => b.id === cancelTarget.id ? { ...b, status: 'CANCELLED' } : b));
      setCancelTarget(null);
      setCancelReason('');
      notify.success('Booking cancelled');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Cancel failed');
    } finally { setCancelling(null); }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-4 md:p-6 space-y-5 max-w-3xl w-full mx-auto">
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => (
            <div key={i} className="rounded-2xl border border-cloud bg-white p-4 flex flex-col items-center gap-2">
              <div className="h-8 w-10 rounded bg-cloud animate-pulse" />
              <div className="h-2 w-16 rounded bg-cloud animate-pulse" />
            </div>
          ))}
        </div>
        <div className="h-10 w-52 rounded-xl bg-cloud animate-pulse" />
        <div className="space-y-3">
          <div className="h-2.5 w-28 rounded bg-cloud animate-pulse" />
          <div className="rounded-2xl border border-cloud overflow-hidden">
            {[1,2,3].map(i => <SkeletonListRow key={i} />)}
          </div>
        </div>
      </div>
    </div>
  );

  const now = Date.now();
  const upcoming       = slots.filter(s => new Date(s.startsAt) >= new Date());
  const past           = slots.filter(s => new Date(s.startsAt) < new Date());
  const upcomingBookings = bookings.filter(b => b.slot?.startsAt && new Date(b.slot.startsAt) >= new Date() && b.status !== 'CANCELLED');
  const pastBookings     = bookings.filter(b => b.slot?.startsAt && new Date(b.slot.startsAt) < new Date());

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Mentorship" subtitle="Manage your availability and student sessions" />
      <div className="flex-1 p-4 md:p-6 space-y-5 max-w-3xl w-full mx-auto">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Open slots',        value: slots.filter(s => !s.isBooked && new Date(s.startsAt) >= new Date()).length, color: 'text-azure' },
            { label: 'Upcoming sessions', value: upcomingBookings.length,                                                      color: 'text-navy' },
            { label: 'Completed',         value: pastBookings.filter(b => b.status !== 'CANCELLED').length,                   color: 'text-royal' },
          ].map(s => (
            <Card key={s.label} className="flex flex-col items-center py-4 text-center">
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] font-semibold text-royal/50 mt-0.5">{s.label}</p>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <div className="flex gap-1 rounded-xl border border-cloud bg-surface p-1 w-fit">
          {([['slots', 'My Slots'], ['bookings', 'Student Bookings']] as [Tab, string][]).map(([t, label]) => (
            <button key={t} onClick={() => setTab(t)}
              className={`rounded-lg px-4 py-2 text-sm font-semibold transition-all ${tab === t ? 'bg-white text-navy shadow-sm border border-cloud' : 'text-royal/50 hover:text-navy'}`}>
              {label}
              {t === 'bookings' && upcomingBookings.length > 0 && (
                <span className="ml-2 rounded-full bg-azure px-1.5 py-0.5 text-[10px] font-bold text-white">{upcomingBookings.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* ── SLOTS TAB ── */}
        {tab === 'slots' && (
          <div className="space-y-4">
            {/* Video intro gate banner */}
            {videoIntroUrl === null && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl bg-amber-100">
                  <Icon name="live" size={16} className="text-amber-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-amber-800">Add an intro video to go live</p>
                  <p className="text-xs text-amber-600 mt-0.5 leading-relaxed">
                    Your availability slots are not visible to students yet. A 60–90 second intro video is required before students can discover and book you.
                  </p>
                  <Link href="/teacher/profile"
                    className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-white hover:bg-amber-600 transition">
                    <Icon name="live" size={12} /> Add intro video
                  </Link>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">AVAILABILITY</p>
                <h2 className="text-base font-bold text-navy">{upcoming.length} upcoming slot{upcoming.length !== 1 ? 's' : ''}</h2>
              </div>
              <Button size="sm" onClick={() => setShowForm(v => !v)}>
                <Icon name="add" size={14} /> Add slot
              </Button>
            </div>

            {/* Add slot form */}
            {showForm && (
              <Card className="p-4">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-3">NEW SLOT</p>
                <form onSubmit={addSlot} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-semibold text-navy">Date & time</label>
                    <input type="datetime-local" value={form.startsAt}
                      onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))} required
                      className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/15" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-navy">Duration</label>
                    <Select
                      value={form.durationMins}
                      onValueChange={v => setForm(f => ({ ...f, durationMins: v }))}
                      options={[
                        { value: '15', label: '15 min' },
                        { value: '30', label: '30 min' },
                        { value: '45', label: '45 min' },
                        { value: '60', label: '60 min' },
                      ]}
                    />
                  </div>
                  <div className="sm:col-span-3 flex gap-3">
                    <Button type="submit" loading={adding} size="sm">Add slot</Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
                  </div>
                </form>
              </Card>
            )}

            {/* Upcoming slots */}
            {upcoming.length === 0 && !showForm ? (
              <Card>
                <EmptyState icon="clock" title="No upcoming slots"
                  description="Add availability slots so students can book 1-on-1 sessions with you"
                  action={{ label: 'Add first slot', onClick: () => setShowForm(true) }} />
              </Card>
            ) : (
              <div className="space-y-2">
                {upcoming.map(slot => (
                  <Card key={slot.id} className="flex items-center gap-3 p-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-azure/10 flex-shrink-0">
                      <Icon name="calendar" size={15} className="text-azure" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-navy">
                        {new Date(slot.startsAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
                      </p>
                      <p className="text-[10px] text-royal/50">
                        {new Date(slot.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {slot.durationMins} min
                      </p>
                      {slot.booking?.student && (
                        <p className="text-[11px] text-azure font-semibold mt-0.5">
                          Booked by {studentName(slot.booking.student)}
                        </p>
                      )}
                    </div>
                    {slot.isBooked
                      ? <Badge variant="active">Booked</Badge>
                      : (
                        <button onClick={() => deleteSlot(slot.id)} disabled={deleting === slot.id}
                          className="text-royal/30 hover:text-azure transition disabled:opacity-40">
                          <Icon name="trash" size={15} />
                        </button>
                      )}
                  </Card>
                ))}
              </div>
            )}

            {/* Past slots */}
            {past.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">PAST SLOTS</p>
                <div className="space-y-2 opacity-60">
                  {past.slice(0, 5).map(slot => (
                    <Card key={slot.id} className="flex items-center gap-3 p-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cloud flex-shrink-0">
                        <Icon name="clock" size={14} className="text-royal/40" />
                      </div>
                      <div className="flex-1">
                        <p className="text-xs font-semibold text-navy">
                          {new Date(slot.startsAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="text-[10px] text-royal/50">{new Date(slot.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      </div>
                      <Badge variant="muted">{slot.isBooked ? 'Completed' : 'Unused'}</Badge>
                    </Card>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── BOOKINGS TAB ── */}
        {tab === 'bookings' && (
          <div className="space-y-4">
            {/* Upcoming */}
            <div className="space-y-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">UPCOMING</p>
              {upcomingBookings.length === 0 ? (
                <Card>
                  <EmptyState icon="calendar" title="No upcoming sessions"
                    description="Students will appear here once they book your slots" />
                </Card>
              ) : (
                upcomingBookings.map(b => {
                  const slotTime = b.slot?.startsAt ? new Date(b.slot.startsAt) : null;
                  const isLiveNow = slotTime && slotTime.getTime() <= now && b.slot?.endsAt && new Date(b.slot.endsAt).getTime() > now;
                  const canJoin   = isLiveNow || (slotTime && slotTime.getTime() - now < 15 * 60_000);
                  return (
                    <Card key={b.id} className="flex items-center gap-3 p-4">
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-azure text-sm font-bold text-white">
                        {studentName(b.student)[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy">{studentName(b.student)}</p>
                        {slotTime && (
                          <p className="text-[11px] text-royal/50">
                            {slotTime.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
                            {' · '}{slotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            {' · '}{b.slot?.durationMins ?? 30} min
                          </p>
                        )}
                        {b.notes && <p className="text-[11px] text-royal/40 mt-0.5 truncate">&ldquo;{b.notes}&rdquo;</p>}
                      </div>
                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        {canJoin && (
                          <button onClick={() => router.push(`/teacher/mentorship/session/${b.id}`)}
                            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold text-white transition
                              ${isLiveNow ? 'bg-azure animate-pulse' : 'bg-azure hover:bg-royal'}`}>
                            <Icon name="live" size={12} />
                            {isLiveNow ? 'Live' : 'Join'}
                          </button>
                        )}
                        <button onClick={() => setCancelTarget(b)}
                          className="text-[11px] text-royal/30 hover:text-azure transition underline underline-offset-2">
                          Cancel
                        </button>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>

            {/* Past bookings */}
            {pastBookings.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">PAST SESSIONS</p>
                <div className="space-y-2 opacity-70">
                  {pastBookings.map(b => {
                    const slotTime = b.slot?.startsAt ? new Date(b.slot.startsAt) : null;
                    return (
                      <Card key={b.id} className="flex items-center gap-3 p-3">
                        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-cloud text-sm font-bold text-royal/50">
                          {studentName(b.student)[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-navy">{studentName(b.student)}</p>
                          {slotTime && (
                            <p className="text-[10px] text-royal/40">
                              {slotTime.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {b.review && (
                            <span className="flex items-center gap-0.5 text-xs font-bold text-amber-500">
                              <Icon name="star" size={11} className="text-amber-400" /> {b.review.rating}
                            </span>
                          )}
                          <Badge variant={b.status === 'CANCELLED' ? 'muted' : 'active'}>
                            {b.status === 'CANCELLED' ? 'Cancelled' : 'Done'}
                          </Badge>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Cancel modal */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-navy/40 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
            <p className="text-base font-bold text-navy mb-1">Cancel session?</p>
            <p className="text-xs text-royal/50 mb-4">
              with {studentName(cancelTarget.student)} · {cancelTarget.slot?.startsAt && new Date(cancelTarget.slot.startsAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
            </p>
            <textarea value={cancelReason} onChange={e => setCancelReason(e.target.value)}
              placeholder="Reason for cancellation (optional)"
              rows={2}
              className="w-full rounded-xl border border-cloud bg-surface px-3 py-2 text-xs text-navy outline-none focus:border-azure resize-none placeholder:text-royal/30 mb-4" />
            <div className="flex gap-3">
              <button onClick={cancelBooking} disabled={cancelling === cancelTarget.id}
                className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 transition disabled:opacity-50">
                {cancelling === cancelTarget.id ? 'Cancelling…' : 'Yes, cancel'}
              </button>
              <Button variant="secondary" className="flex-1" onClick={() => { setCancelTarget(null); setCancelReason(''); }}>Keep it</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function TeacherMentorshipPage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const S = Suspense as any;
  return (
    <S fallback={
      <div className="flex flex-col min-h-full">
        <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6">
          <div className="h-8 w-48 rounded-xl bg-cloud animate-pulse" />
        </div>
      </div>
    }>
      <MentorshipContent />
    </S>
  );
}
