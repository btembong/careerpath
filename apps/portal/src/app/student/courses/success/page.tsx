'use client';
import { useEffect, useState, Suspense as _Suspense } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Suspense = _Suspense as any;
import { useSearchParams } from 'next/navigation';
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
}

function CoursePurchaseSuccessPageInner() {
  const searchParams = useSearchParams();
  const courseId = searchParams.get('courseId');

  const [course, setCourse] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [recs, setRecs] = useState<Recommendation[]>([]);

  useEffect(() => {
    // Small delay for webhook to process
    const t = setTimeout(() => {
      const fetches: Promise<any>[] = [api.get('/auth/me').catch(() => {})];
      if (courseId) {
        fetches.push(
          api.get(`/platform-courses/${courseId}`)
            .then(r => setCourse(r.data))
            .catch(() => {}),
        );
      }
      Promise.allSettled(fetches).finally(() => setLoading(false));
    }, 1500);

    // Recommendations load independently
    api.get('/ai/recommendations').then(r => setRecs(r.data?.slice(0, 3) ?? [])).catch(() => {});

    return () => clearTimeout(t);
  }, [courseId]);

  if (loading) return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5">
        <div className="h-48 rounded-3xl animate-pulse" style={{ background: 'linear-gradient(135deg, #072061 0%, #1e4db7 100%)' }} />
        <SkeletonCard lines={2} />
        <SkeletonCard lines={3} />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-5">

        {/* Success banner */}
        <div className="rounded-3xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #072061 0%, #1e4db7 100%)' }}>
          <div className="relative p-8 text-center">
            <div className="pointer-events-none absolute -right-12 -top-12 h-48 w-48 rounded-full border-[24px] border-white/5" />
            <div className="pointer-events-none absolute -left-8 -bottom-8 h-32 w-32 rounded-full border-[16px] border-white/5" />

            <div className="relative z-10 flex justify-center mb-5">
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-azure/20 border-4 border-azure/30">
                <Icon name="check" size={36} className="text-azure" />
              </div>
            </div>

            <div className="relative z-10">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-2">PURCHASE CONFIRMED</p>
              <h1 className="text-2xl font-black text-white mb-2">Course unlocked!</h1>
              <p className="text-sm text-white/50 leading-relaxed">
                You now have lifetime access. Start learning whenever you&apos;re ready.
              </p>
            </div>
          </div>
        </div>

        {/* Course card */}
        {course && (
          <Card padding="md">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-azure/10 flex-shrink-0 overflow-hidden">
                {course.coverUrl
                  ? <img src={course.coverUrl} alt={course.title} className="h-full w-full object-cover" />
                  : <CourseCover variant="tile" size="md" course={{ title: course.title }} />
                }
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">COURSE UNLOCKED</p>
                <p className="text-sm font-bold text-navy truncate">{course.title}</p>
                {course.subject?.name && (
                  <p className="text-xs text-royal/40 mt-0.5">{course.subject.name}</p>
                )}
              </div>
            </div>
          </Card>
        )}

        {/* Package upsell */}
        <div className="rounded-2xl border border-azure/30 bg-azure/5 px-5 py-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-azure/10">
              <Icon name="packages" size={16} className="text-azure" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-navy">Want more? Upgrade to a package</p>
              <p className="text-xs text-royal/50 mt-0.5 leading-relaxed">
                Get live classes, mentorship, and the full course library bundled at a better price.
              </p>
              <Link href="/packages"
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-azure px-3 py-1.5 text-xs font-bold text-white hover:bg-royal transition">
                Browse packages <Icon name="arrowRight" size={11} />
              </Link>
            </div>
          </div>
        </div>

        {/* Recommended courses */}
        {recs.length > 0 && (
          <Card padding="md">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-base">✨</span>
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure">You might also like</p>
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

        <Link href={courseId ? `/student/learn/${courseId}` : '/student/courses'}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-azure py-4 text-sm font-bold text-white hover:bg-royal transition-all">
          Start learning <Icon name="arrowRight" size={15} />
        </Link>

        <Link href="/student/dashboard"
          className="flex w-full items-center justify-center py-2 text-sm text-royal/50 hover:text-navy transition">
          Go to my dashboard
        </Link>
      </div>
    </div>
  );
}

export default function CoursePurchaseSuccessPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-surface flex items-center justify-center p-6">
        <div className="w-full max-w-md space-y-5">
          <div className="h-48 rounded-3xl animate-pulse" style={{ background: 'linear-gradient(135deg, #072061 0%, #1e4db7 100%)' }} />
          <SkeletonCard lines={2} />
          <SkeletonCard lines={3} />
        </div>
      </div>
    }>
      <CoursePurchaseSuccessPageInner />
    </Suspense>
  );
}
