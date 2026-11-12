'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { CheckoutView, CheckoutItem } from '@/components/checkout/CheckoutView';
import api from '@/lib/api';

interface Details {
  id: string; name: string; priceAmount: number; currency: string; validityDays: number | null; mentorship: string | null;
  courses: { title: string; lessons: number }[];
  cohort: { teacher: string | null; name: string } | null;
  mine: { active: boolean; expiresAt: string | null } | null;
}

const DAY = 86_400_000;
const term = (days: number | null) => {
  if (!days) return 'no time limit';
  const m = Math.round(days / 30.44);
  return m >= 1 && Math.abs(m * 30.44 - days) <= 3 ? `${m} month${m === 1 ? '' : 's'}` : `${days} days`;
};

export default function PackageCheckoutPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [item, setItem] = useState<CheckoutItem | null>(null);
  const [owned, setOwned] = useState<Details | null>(null);
  // ?add=live,mentorship: extras only, for a student who already has it
  const addLater = (useSearchParams().get('add') ?? '').split(',').filter((k): k is 'live' | 'mentorship' => k === 'live' || k === 'mentorship');

  useEffect(() => {
    api.get(`/packages/${id}/details`).then(r => {
      const d: Details = r.data;
      // Renewing is allowed in the last 30 days of access
      const daysLeft = d.mine?.expiresAt ? (new Date(d.mine.expiresAt).getTime() - Date.now()) / DAY : null;
      const has = !!d.mine?.active;
      if (has && !addLater.length && (daysLeft == null || daysLeft > 30)) { setOwned(d); return; }
      const lessons = d.courses.reduce((n, c) => n + c.lessons, 0);
      setItem({
        kind: 'package', id: d.id, title: d.name,
        meta: [`${d.courses.length} course${d.courses.length === 1 ? '' : 's'}`, d.cohort ? 'live classes' : null, term(d.validityDays)].filter(Boolean).join(' · '),
        includes: [
          `${d.courses.length} course${d.courses.length === 1 ? '' : 's'}${lessons ? ` · ${lessons} lessons` : ''} with practice and quizzes`,
          d.cohort ? `Live classes${d.cohort.teacher ? ` with ${d.cohort.teacher}` : ''}` : null,
          d.mentorship,
          'Certificates for each course',
        ].filter(Boolean) as string[],
        priceAmount: d.priceAmount, currency: d.currency,
        accessUntil: d.validityDays ? new Date(Date.now() + d.validityDays * DAY) : null,
        ...(has && addLater.length ? { addLater } : {}),
      });
    }).catch(() => router.replace('/packages'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, router]);

  if (owned) return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref={`/packages/${id}`} backLabel="Package" title="Checkout" />
      <div className="m-4 rounded-lg border border-line bg-white p-10 text-center lg:m-7">
        <p className="text-sm font-semibold text-navy">You already have {owned.name}</p>
        <p className="mt-1 text-[13px] text-ink2">{owned.mine?.expiresAt ? `Your access runs until ${new Date(owned.mine.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}. You can renew in the last 30 days.` : 'Your access has no time limit.'}</p>
        <Link href="/student/courses" className="mt-4 inline-flex h-9 items-center rounded-md bg-azure-strong px-4 text-[13.5px] font-semibold text-on-accent">Go to my courses</Link>
      </div>
    </div>
  );
  if (!item) return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref={`/packages/${id}`} backLabel="Package" title="Checkout" />
      <div className="flex flex-wrap gap-6 p-4 lg:px-7 lg:py-6">
        <div className="h-96 min-w-0 flex-[999_1_520px] rounded-lg border border-line bg-white animate-pulse" />
        <div className="h-80 min-w-0 flex-[1_1_320px] rounded-lg border border-line bg-white animate-pulse" />
      </div>
    </div>
  );
  return <CheckoutView item={item} backHref={`/packages/${id}`} backLabel={item.title} />;
}
