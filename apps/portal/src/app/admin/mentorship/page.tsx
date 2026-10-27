'use client';
import { useEffect, useState } from 'react';
import { notify } from '@/lib/notify';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTopbar, SkeletonTable } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

type StatusFilter = 'all' | 'CONFIRMED' | 'CANCELLED' | 'COMPLETED';

function displayName(u: any) {
  if (!u) return '—';
  if (u.firstName || u.lastName) return `${u.firstName ?? ''} ${u.lastName ?? ''}`.trim();
  return u.email ?? '—';
}

export default function AdminMentorshipPage() {
  const [bookings, setBookings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  useEffect(() => {
    api.get('/mentorship/admin/bookings')
      .then(r => setBookings(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function cancelBooking() {
    if (!cancelId) return;
    setCancelling(cancelId);
    try {
      await api.patch(`/mentorship/admin/bookings/${cancelId}/cancel`, {
        reason: cancelReason.trim() || undefined,
      });
      setBookings(prev => prev.map(b => b.id === cancelId ? { ...b, status: 'CANCELLED' } : b));
      notify.success('Booking cancelled');
      setCancelId(null); setCancelReason('');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to cancel');
    } finally { setCancelling(null); }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-5 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-cloud animate-pulse" />)}
        </div>
        <SkeletonTable />
      </div>
    </div>
  );

  const counts = {
    all: bookings.length,
    CONFIRMED: bookings.filter(b => b.status === 'CONFIRMED').length,
    CANCELLED: bookings.filter(b => b.status === 'CANCELLED').length,
    COMPLETED: bookings.filter(b => {
      const endTime = b.slot?.endsAt ? new Date(b.slot.endsAt) : null;
      return b.status === 'CONFIRMED' && endTime && endTime < new Date();
    }).length,
  };

  const filtered = filter === 'all' ? bookings
    : filter === 'COMPLETED'
      ? bookings.filter(b => {
          const endTime = b.slot?.endsAt ? new Date(b.slot.endsAt) : null;
          return b.status === 'CONFIRMED' && endTime && endTime < new Date();
        })
      : bookings.filter(b => b.status === filter);

  return (
    <>
    <div className="flex flex-col min-h-full">
      <Topbar title="Mentorship" subtitle="All 1-on-1 session bookings" />
      <div className="flex-1 p-4 md:p-6 space-y-5 max-w-5xl w-full mx-auto">

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3">
          {([
            { key: 'all',       label: 'Total',     color: 'text-navy'    },
            { key: 'CONFIRMED', label: 'Upcoming',  color: 'text-azure'   },
            { key: 'COMPLETED', label: 'Completed', color: 'text-royal'   },
            { key: 'CANCELLED', label: 'Cancelled', color: 'text-royal/40'},
          ] as { key: StatusFilter; label: string; color: string }[]).map(s => (
            <button key={s.key} onClick={() => setFilter(s.key)} className="text-left w-full">
              <Card
                className={`flex flex-col items-center py-4 text-center cursor-pointer transition
                  ${filter === s.key ? 'ring-2 ring-azure border-azure/30' : ''}`}>
                <p className={`text-2xl font-black ${s.color}`}>{counts[s.key]}</p>
                <p className="text-[10px] font-semibold text-royal/50 mt-0.5">{s.label}</p>
              </Card>
            </button>
          ))}
        </div>

        {/* Bookings list */}
        {filtered.length === 0 ? (
          <EmptyState icon="mentorship" title="No bookings" description={`No ${filter === 'all' ? '' : filter.toLowerCase()} mentorship sessions`} />
        ) : (
          <div className="space-y-3">
            {filtered.map(b => {
              const slotTime = b.slot?.startsAt ? new Date(b.slot.startsAt) : null;
              const endTime = b.slot?.endsAt ? new Date(b.slot.endsAt) : null;
              const isPast = endTime && endTime < new Date();

              return (
                <Card key={b.id} className="p-4">
                  <div className="flex items-center gap-4">
                    {/* Student */}
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-azure text-sm font-bold text-white">
                      {(b.student?.firstName?.[0] ?? b.student?.email?.[0] ?? '?').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-navy">{displayName(b.student)}</p>
                        <Icon name="arrowRight" size={11} className="text-royal/30" />
                        <p className="text-sm font-semibold text-royal">{displayName(b.slot?.teacher)}</p>
                      </div>
                      {slotTime && (
                        <p className="text-xs text-royal/50 mt-0.5">
                          {slotTime.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                          {' · '}{slotTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {' · '}{b.slot?.durationMins ?? 30} min
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {b.review && (
                        <span className="text-amber-400 text-xs font-bold">★ {b.review.rating}</span>
                      )}
                      <Badge variant={
                        b.status === 'CANCELLED' ? 'muted'
                        : isPast ? 'default'
                        : 'active'
                      } className="capitalize text-[10px]">
                        {b.status === 'CANCELLED' ? 'Cancelled'
                        : isPast ? 'Completed'
                        : 'Upcoming'}
                      </Badge>
                      {b.status === 'CONFIRMED' && !isPast && (
                        <button
                          onClick={() => { setCancelId(b.id); setCancelReason(''); }}
                          className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[10px] font-semibold text-red-500 hover:bg-red-100 transition">
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>

    {/* Cancel confirm modal */}
    {cancelId && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-navy/40 backdrop-blur-sm" onClick={() => setCancelId(null)} />
        <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <p className="text-sm font-bold text-navy mb-1">Cancel booking?</p>
          <p className="text-xs text-royal/50 mb-4">Both the student and teacher will be notified.</p>
          <textarea
            value={cancelReason}
            onChange={e => setCancelReason(e.target.value)}
            placeholder="Reason for cancellation (optional)"
            rows={2}
            className="w-full rounded-xl border border-cloud bg-surface px-3 py-2.5 text-sm text-navy outline-none focus:border-azure resize-none placeholder:text-royal/40 mb-4"
          />
          <div className="flex gap-2">
            <button onClick={cancelBooking} disabled={!!cancelling}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition disabled:opacity-50">
              {cancelling ? 'Cancelling…' : 'Confirm cancel'}
            </button>
            <button onClick={() => setCancelId(null)}
              className="rounded-xl border border-cloud px-4 py-2.5 text-sm font-semibold text-navy hover:bg-cloud transition">
              Keep booking
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
