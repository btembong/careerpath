'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { Card } from '@/components/ui/Card';
import { SkeletonCard } from '@/components/ui/Skeleton';
import api from '@/lib/api';
import { CourseCover } from '@/components/courses/CourseCover';

interface Recommendation {
  courseId: string;
  title: string;
  subjectName: string | null;
  tip: string;
  coverUrl: string | null;
  priceAmount: number | null;
  priceCurrency: string | null;
  isSoldIndividually: boolean;
}

export default function PaymentSuccessPage() {
  const [me, setMe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [cohort, setCohort] = useState<{ id: string; name: string; teacher: { name: string | null; email: string } | null } | null>(null);

  useEffect(() => {
    // Poll /auth/me until activePackages or purchasedCourseIds appear (webhook may lag)
    let attempts = 0;
    const MAX = 12; // up to 24 seconds
    function poll() {
      api.get('/auth/me')
        .then(r => {
          const data = r.data;
          const hasAccess = (data?.activePackages?.length ?? 0) > 0 || (data?.purchasedCourseIds?.length ?? 0) > 0;
          if (hasAccess || attempts >= MAX) {
            setMe(data);
            setLoading(false);
            // Load student cohorts to show assignment info
            api.get('/portals/student/cohorts')
              .then(cr => {
                const cohorts: any[] = cr.data ?? [];
                if (cohorts.length > 0) setCohort(cohorts[cohorts.length - 1]);
              })
              .catch(() => {});
          } else {
            attempts++;
            setTimeout(poll, 2000);
          }
        })
        .catch(() => { setLoading(false); });
    }
    poll();
    // Recommendations load independently (non-blocking)
    api.get('/ai/recommendations').then(r => setRecs(r.data?.slice(0, 3) ?? [])).catch(() => {});
  }, []);

  if (loading) return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5">
        <div className="h-48 rounded-3xl animate-pulse" style={{ background: 'linear-gradient(135deg, #072061 0%, #1e4db7 100%)' }} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} />
      </div>
    </div>
  );

  const activePackages = me?.activePackages ?? [];
  const latest = activePackages[activePackages.length - 1];

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5">

        {/* Success banner */}
        <div className="rounded-3xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #072061 0%, #1e4db7 100%)' }}>
          <div className="relative p-8 text-center">
            {/* Decorative rings */}
            <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full border-[24px] border-white/5" />
            <div className="pointer-events-none absolute -left-8 -bottom-8 h-32 w-32 rounded-full border-[16px] border-white/5" />

            {/* Check icon */}
            <div className="relative z-10 flex justify-center mb-5">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-azure/20 border-4 border-azure/30">
                <Icon name="check" size={36} className="text-azure" />
              </div>
            </div>

            <div className="relative z-10">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-2">ENROLLMENT CONFIRMED</p>
              <h1 className="text-2xl font-black text-white mb-2">You&apos;re enrolled!</h1>
              <p className="text-sm text-white/50 leading-relaxed">
                Your payment was successful. You now have access to your learning materials.
              </p>
            </div>
          </div>
        </div>

        {/* Active package */}
        {latest && (
          <Card padding="md">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-azure/10 flex-shrink-0">
                <Icon name="packages" size={22} className="text-azure" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">PACKAGE UNLOCKED</p>
                <p className="text-sm font-bold text-navy truncate">{latest.name}</p>
                {latest.expiresAt && (
                  <p className="text-xs text-royal/40 mt-0.5">
                    Access until {new Date(latest.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Cohort assignment */}
        {cohort && (
          <Card padding="md">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-azure/10 flex-shrink-0">
                <Icon name="mentorship" size={22} className="text-azure" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">YOUR COHORT</p>
                <p className="text-sm font-bold text-navy truncate">{cohort.name}</p>
                {cohort.teacher && (
                  <p className="text-xs text-royal/50 mt-0.5">
                    Instructor: {cohort.teacher.name ?? cohort.teacher.email}
                  </p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* What's next */}
        <Card padding="md">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-4">WHAT&apos;S NEXT</p>
          <div className="space-y-3">
            {[
              { icon: 'courses' as const,      label: 'Start learning',        sub: 'Access your course library',    href: '/student/courses' },
              { icon: 'live' as const,         label: 'Join a live class',     sub: cohort ? `Your cohort: ${cohort.name}` : 'See upcoming sessions', href: '/student/live' },
              { icon: 'mentorship' as const,   label: 'Connect with mentor',   sub: 'Book a 1-on-1 session',          href: '/student/mentorship' },
              { icon: 'certificates' as const, label: 'Track progress',        sub: 'Earn certificates',              href: '/student/certificates' },
            ].map(item => (
              <Link key={item.href} href={item.href}
                className="flex items-center gap-3 rounded-xl border border-cloud p-3 hover:border-azure/40 hover:bg-azure/[0.02] transition-all group">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-cloud text-azure flex-shrink-0 group-hover:bg-azure/10 transition-colors">
                  <Icon name={item.icon} size={16} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-navy">{item.label}</p>
                  <p className="text-xs text-royal/50">{item.sub}</p>
                </div>
                <Icon name="chevronRight" size={14} className="text-royal/30 group-hover:text-azure transition-colors" />
              </Link>
            ))}
          </div>
        </Card>

        {/* Recommended courses */}
        {recs.length > 0 && (
          <Card padding="md">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-base">✨</span>
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Recommended for you</p>
            </div>
            <div className="space-y-3">
              {recs.map(rec => (
                <Link key={rec.courseId} href={`/student/learn/${rec.courseId}`}
                  className="flex items-start gap-3 rounded-xl border border-cloud p-3 hover:border-azure/40 hover:bg-azure/[0.02] transition-all group">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-cloud overflow-hidden">
                    {rec.coverUrl
                      ? <img src={rec.coverUrl} alt={rec.title} className="h-full w-full object-cover" />
                      : <CourseCover variant="tile" size="sm" course={{ title: rec.title }} />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-navy truncate">{rec.title}</p>
                    {rec.subjectName && (
                      <p className="text-[10px] text-royal/50">{rec.subjectName}</p>
                    )}
                    <p className="text-[10px] text-azure/70 mt-0.5 line-clamp-1">{rec.tip}</p>
                  </div>
                  <Icon name="arrowRight" size={13} className="text-royal/30 group-hover:text-azure transition flex-shrink-0 mt-0.5" />
                </Link>
              ))}
            </div>
          </Card>
        )}

        <Link href="/student/dashboard"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-azure py-4 text-sm font-bold text-white hover:bg-royal transition-all">
          Go to my dashboard <Icon name="arrowRight" size={15} />
        </Link>
      </div>
    </div>
  );
}
