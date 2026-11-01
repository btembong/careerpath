'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';

/**
 * A school or company bought seats for this student's email: claim them all. Students arrive here
 * from the link their organisation shares, after signing up with the invited email.
 */
export default function OrgInvitePage() {
  const { user } = useAuth();
  const [claimed, setClaimed] = useState<{ organisation: string; packageName: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.post('/org/org-enrollments/claim-mine')
      .then(r => setClaimed(r.data.claimed ?? []))
      .catch(e => setError(e?.response?.data?.message ?? 'Could not check your invitations'));
  }, []);

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Your school’s invitation" subtitle="Seats bought for you by a school or company" />
      <div className="p-4 lg:px-7 lg:py-6">
        <section className="mx-auto flex max-w-xl flex-col gap-3 rounded-lg border border-line bg-white p-6 text-center">
          {error ? <>
            <p className="text-[16px] font-bold text-navy">Something went wrong</p>
            <p className="text-[13.5px] text-ink2">{error}</p>
          </> : !claimed ? <>
            <p className="text-[16px] font-bold text-navy">Checking your invitations…</p>
            <div className="mx-auto h-1.5 w-40 animate-pulse rounded bg-subtle" />
          </> : claimed.length ? <>
            <p className="text-[18px] font-extrabold text-navy">You’re in</p>
            {claimed.map((c, i) => <p key={i} className="text-[13.5px] text-ink2"><strong className="text-navy">{c.organisation}</strong> gave you <strong className="text-navy">{c.packageName}</strong>.</p>)}
            <Link href="/student/courses" className="mx-auto mt-2 inline-flex h-10 items-center rounded-md bg-azure-strong px-4 text-[13.5px] font-semibold text-on-accent">Go to my courses</Link>
          </> : <>
            <p className="text-[16px] font-bold text-navy">No seats waiting for {user?.email ?? 'your email'}</p>
            <p className="text-[13.5px] text-ink2">Your school invites a specific email address. If they used a different one, ask them to invite this email, or sign in with the one they used.</p>
            <Link href="/student/dashboard" className="mx-auto mt-1 text-[13.5px] font-semibold text-azure-strong hover:underline">Back to your dashboard</Link>
          </>}
        </section>
      </div>
    </div>
  );
}
