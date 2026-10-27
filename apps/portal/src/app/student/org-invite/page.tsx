'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Spinner } from '@/components/ui/Spinner';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

interface InviteDetails {
  id: string;
  org: { name: string; logoUrl: string | null };
  package: { name: string; description: string | null };
  expiresAt: string | null;
  claimed: boolean;
}

function OrgInvitePageInner() {
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token');

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Missing invite token.');
      setLoading(false);
      return;
    }
    api.get(`/org-enrollments/invite?token=${token}`)
      .then(r => setInvite(r.data))
      .catch(err => setError(err.response?.data?.message ?? 'Invalid or expired invite link.'))
      .finally(() => setLoading(false));
  }, [token]);

  async function handleClaim() {
    if (!invite) return;
    setClaiming(true);
    setError(null);
    try {
      await api.post(`/org-enrollments/${invite.id}/claim`, { token });
      setClaimed(true);
    } catch (err: any) {
      setError(err.response?.data?.message ?? 'Could not claim seat. Please try again.');
    } finally {
      setClaiming(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface gap-4">
        <Spinner size="lg" className="text-azure" />
        <p className="text-sm text-royal/50">Loading your invitation…</p>
      </div>
    );
  }

  if (claimed) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6">
        <div className="w-full max-w-sm text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-azure mx-auto mb-4">
            <Icon name="check" size={28} className="text-white" />
          </div>
          <h2 className="text-xl font-black text-navy">You're in!</h2>
          <p className="mt-2 text-sm text-royal/60">
            Your seat has been claimed. You now have access to <strong>{invite?.package.name}</strong>.
          </p>
          <Button className="mt-6" onClick={() => router.push('/student/dashboard')}>
            Go to dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6">
        <div className="w-full max-w-sm text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cloud mx-auto mb-4">
            <Icon name="close" size={28} className="text-red-400" />
          </div>
          <h2 className="text-lg font-bold text-navy">Invite unavailable</h2>
          <p className="mt-2 text-sm text-royal/60">{error ?? 'This invite link is no longer valid.'}</p>
          <Link href="/student/dashboard"
            className="mt-6 inline-flex items-center gap-2 rounded-xl border border-cloud bg-white px-5 py-3 text-sm font-semibold text-navy hover:bg-cloud transition">
            <Icon name="arrowLeft" size={14} /> Back to dashboard
          </Link>
        </div>
      </div>
    );
  }

  const expired = invite.expiresAt && new Date(invite.expiresAt) < new Date();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface px-6 py-12">
      <div className="w-full max-w-md">

        {/* Org header */}
        <div className="mb-6 text-center">
          {invite.org.logoUrl ? (
            <img src={invite.org.logoUrl} alt={invite.org.name}
              className="h-16 w-16 rounded-2xl object-contain mx-auto mb-3 border border-cloud" />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-navy mx-auto mb-3">
              <span className="text-2xl font-black text-white">{invite.org.name[0]}</span>
            </div>
          )}
          <p className="text-xs font-bold uppercase tracking-widest text-royal/40 mb-1">Organisation invite</p>
          <h1 className="text-xl font-black text-navy">{invite.org.name}</h1>
          <p className="text-sm text-royal/50 mt-1">has invited you to join</p>
        </div>

        {/* Package card */}
        <div className="rounded-2xl border border-cloud bg-white p-6 mb-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-azure/10">
              <Icon name="packages" size={22} className="text-azure" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-0.5">Package included</p>
              <h2 className="text-base font-bold text-navy">{invite.package.name}</h2>
              {invite.package.description && (
                <p className="text-xs text-royal/50 mt-1 leading-relaxed">{invite.package.description}</p>
              )}
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-azure/5 border border-azure/15 px-4 py-3">
            <Icon name="shield" size={14} className="text-azure flex-shrink-0" />
            <p className="text-xs text-navy">This seat is fully covered by {invite.org.name} — no payment required.</p>
          </div>

          {invite.expiresAt && (
            <p className={`mt-3 text-[11px] text-center ${expired ? 'text-red-500' : 'text-royal/40'}`}>
              {expired
                ? 'This invite has expired.'
                : `Expires ${new Date(invite.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`}
            </p>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">
            {error}
          </div>
        )}

        <Button fullWidth size="lg" onClick={handleClaim} loading={claiming} disabled={!!expired || invite.claimed}>
          {invite.claimed ? 'Seat already claimed' : 'Accept & claim seat'}
        </Button>

        <p className="mt-4 text-center text-xs text-royal/40">
          By accepting, you agree to CareerPath Africa's terms of service.
        </p>

        <div className="mt-4 text-center">
          <Link href="/student/dashboard"
            className="text-xs text-royal/40 hover:text-azure transition">
            Decline — go to dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}

export default function OrgInvitePage() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const S = Suspense as any;
  return (
    <S>
      <OrgInvitePageInner />
    </S>
  );
}
