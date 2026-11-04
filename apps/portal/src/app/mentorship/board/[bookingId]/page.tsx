'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { BrandLogo } from '@/components/brand/BrandLogo';
import { BoardViewer } from '@/components/live/BoardViewer';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';

/** The whiteboard from a 1-on-1 mentoring session, as it was left */
export default function MentoringBoardPage() {
  const { bookingId } = useParams<{ bookingId: string }>();
  const { user } = useAuth();
  const [d, setD] = useState<{ elements: unknown[]; startsAt: string } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    api.get(`/mentorship/bookings/${bookingId}/board`).then(r => setD(r.data)).catch(e => setError(
      e?.response?.status === 403 ? 'This board belongs to someone else’s mentoring session.'
        : e?.response?.status === 404 ? 'We couldn’t find this session.'
        : e?.response?.data?.message ?? 'Could not open the board'));
  }, [bookingId]);
  const back = user?.role === 'TEACHER' ? '/teacher/mentorship' : '/student/mentorship';
  return (
    <div className="flex min-h-screen flex-col bg-surface">
      <header className="flex items-center gap-3 border-b border-line bg-white px-5 py-3">
        <BrandLogo size="sm" />
        <span className="flex-1" />
        <Link href={back} className="text-[13px] font-semibold text-azure-strong hover:underline">‹ Back to mentoring</Link>
      </header>
      <main className="mx-auto flex w-full max-w-[1100px] flex-col gap-3 p-4 sm:p-6">
        <h1 className="text-xl font-extrabold text-navy">The board from your session</h1>
        {d && <p className="-mt-1 text-[13px] text-muted">{new Date(d.startsAt).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })} · read only · “Save as image” in the menu downloads it</p>}
        {error ? <p className="rounded-lg border border-line bg-white px-4 py-6 text-sm text-ink2">{error}</p>
          : !d ? <div className="h-[520px] animate-pulse rounded-lg bg-subtle" />
          : <BoardViewer elements={d.elements} height={560} />}
      </main>
    </div>
  );
}
