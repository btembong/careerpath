'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import api from '@/lib/api';
import { BrandLogo } from '@/components/brand/BrandLogo';

/** "Watch recording" lands here: we ask for a fresh, short-lived link from Daily and open it. */
export default function RecordingPage() {
  const { classId } = useParams<{ classId: string }>();
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<{ url: string }>(`/live/classes/${classId}/recording`)
      .then(r => window.location.replace(r.data.url))
      .catch(e => setError(e?.response?.data?.message ?? 'Could not open the recording. Try again in a minute.'));
  }, [classId]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 bg-surface px-4 text-center">
      <BrandLogo />
      {error ? (
        <>
          <p className="max-w-[420px] text-[15px] text-navy">{error}</p>
          <Link href="/student/live" className="inline-flex h-10 items-center rounded-md bg-[#3F6FE8] px-4 text-sm font-semibold text-white">Back to live classes</Link>
        </>
      ) : (
        <p className="text-[15px] text-ink2">Opening the recording…</p>
      )}
    </div>
  );
}
