'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Spinner } from '@/components/ui/Spinner';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

export default function TeacherMentorshipSessionPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const [roomUrl, setRoomUrl] = useState<string | null>(null);
  const [sessionInfo, setSessionInfo] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get<{ token: string; roomUrl: string; startsAt: string; endsAt: string; durationMins: number; isOwner: boolean }>(
      `/mentorship/bookings/${bookingId}/token`
    )
      .then(res => {
        setSessionInfo(res.data);
        setRoomUrl(`${res.data.roomUrl}?t=${res.data.token}`);
      })
      .catch(err => setError(err.response?.data?.message ?? 'Unable to join session. The session may not be active yet.'))
      .finally(() => setLoading(false));
  }, [bookingId]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-navy gap-4">
        <Spinner size="lg" className="text-azure" />
        <p className="text-sm text-white/50">Setting up your 1-on-1 session…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6">
        <div className="w-full max-w-sm text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cloud mx-auto mb-4">
            <Icon name="mentorship" size={28} className="text-azure" />
          </div>
          <h2 className="text-lg font-bold text-navy">Cannot join session</h2>
          <p className="mt-2 text-sm text-royal/60">{error}</p>
          <Link href="/teacher/mentorship"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-cloud bg-white px-5 py-3 text-sm font-semibold text-navy hover:bg-cloud transition">
            <Icon name="arrowLeft" size={14} /> Back to Mentorship
          </Link>
        </div>
      </div>
    );
  }

  const startsAt = sessionInfo?.startsAt ? new Date(sessionInfo.startsAt) : null;

  return (
    <div className="h-screen w-screen flex flex-col bg-navy">
      {/* Minimal top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-white/10">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-azure">
            <span className="text-xs font-black text-white">C</span>
          </div>
          <span className="text-sm font-semibold text-white">1-on-1 Mentorship</span>
          {startsAt && (
            <span className="text-xs text-white/40">
              · {startsAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · {sessionInfo.durationMins} min
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-azure animate-pulse" />
          <span className="text-xs text-white/50">Live</span>
        </div>
      </div>
      {/* Daily.co Prebuilt UI */}
      <iframe
        src={roomUrl!}
        allow="camera; microphone; fullscreen; speaker; display-capture"
        className="flex-1 w-full border-0"
        title="Mentorship session"
      />
    </div>
  );
}
