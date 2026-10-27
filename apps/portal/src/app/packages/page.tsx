'use client';
import { useEffect, useState, useMemo, Suspense as _Suspense } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Suspense = _Suspense as any;
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import api from '@/lib/api';

interface Package {
  id: string; name: string; description: string | null;
  priceAmount: number; currency: string;
  courseIds: string[]; validityDays: number | null;
  categoryTags: string[];
  cohort?: { id: string; name: string } | null;
}
interface ActivePackage { id: string; expiresAt: string | null; }

type SortOption = 'default' | 'price-asc' | 'price-desc' | 'courses-desc' | 'az';

// Shared price formatter — treats priceAmount as minor units (cents/kobo/pesewas)
function fmtPrice(amount: number, currency: string) {
  return `${currency} ${(amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function PackagesPageInner() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  const [packages,  setPackages]  = useState<Package[]>([]);
  const [enrolled,  setEnrolled]  = useState<ActivePackage[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');
  const [sort,      setSort]      = useState<SortOption>('default');
  const [activeTag, setActiveTag] = useState(() => searchParams.get('tag') ?? 'ALL');

  useEffect(() => {
    setActiveTag(searchParams.get('tag') ?? 'ALL');
  }, [searchParams]);

  useEffect(() => {
    Promise.all([
      api.get('/packages').then(r => setPackages(r.data ?? [])).catch(() => {}),
      api.get('/auth/me').then(r => setEnrolled(r.data?.activePackages ?? [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  // Update tag in state + URL together
  function selectTag(tag: string) {
    setActiveTag(tag);
    const params = new URLSearchParams(searchParams.toString());
    if (tag === 'ALL') params.delete('tag');
    else params.set('tag', tag);
    router.replace(`${pathname}${params.toString() ? `?${params.toString()}` : ''}`, { scroll: false });
  }

  const allTags = useMemo(() => {
    const set = new Set<string>();
    packages.forEach(p => p.categoryTags?.forEach(t => set.add(t)));
    return Array.from(set).slice(0, 8);
  }, [packages]);

  const filtered = useMemo(() => {
    let list = packages;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        p.categoryTags?.some(t => t.toLowerCase().includes(q))
      );
    }
    if (activeTag !== 'ALL') list = list.filter(p => p.categoryTags?.includes(activeTag));

    // Apply sort
    switch (sort) {
      case 'price-asc':    list = [...list].sort((a, b) => a.priceAmount - b.priceAmount); break;
      case 'price-desc':   list = [...list].sort((a, b) => b.priceAmount - a.priceAmount); break;
      case 'courses-desc': list = [...list].sort((a, b) => (b.courseIds?.length ?? 0) - (a.courseIds?.length ?? 0)); break;
      case 'az':           list = [...list].sort((a, b) => a.name.localeCompare(b.name)); break;
    }

    return list;
  }, [packages, search, activeTag, sort]);

  function enrolledInfo(pkgId: string) {
    return enrolled.find(e => e.id === pkgId) ?? null;
  }

  function expiringWithin7Days(enrollment: ActivePackage | null) {
    if (!enrollment?.expiresAt) return false;
    const msLeft = new Date(enrollment.expiresAt).getTime() - Date.now();
    return msLeft > 0 && msLeft < 7 * 24 * 60 * 60 * 1000;
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 max-w-6xl w-full mx-auto px-5 sm:px-8 py-8 space-y-6">
        <div className="h-10 w-full max-w-sm rounded-xl bg-cloud animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} lines={3} />)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Learning Packages" subtitle="Unlock courses, live sessions, and mentorship" />

      {/* Individual courses cross-link — fixed href */}
      <div className="bg-white border-b border-cloud px-5 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4 flex-wrap">
          <p className="text-sm text-royal/60">
            <span className="font-medium text-navy">Not ready for a full package?</span>
            {' '}Buy individual courses with lifetime access.
          </p>
          <Link href="/student/catalogue"
            className="flex-shrink-0 inline-flex items-center gap-1.5 text-sm font-medium text-azure hover:text-royal transition">
            Browse individual courses <Icon name="arrowRight" size={14} />
          </Link>
        </div>
      </div>

      <div className="flex-1 max-w-6xl w-full mx-auto px-5 sm:px-8 py-8 space-y-6">

        {/* Search + sort + tag filters */}
        <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
          <div className="relative max-w-sm w-full">
            <Icon name="search" size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-royal/40 pointer-events-none" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search packages…"
              className="input-base pl-10 py-2.5"
            />
          </div>

          {/* Sort */}
          <select
            value={sort}
            onChange={e => setSort(e.target.value as SortOption)}
            className="rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/10 transition cursor-pointer"
          >
            <option value="default">Sort: Default</option>
            <option value="price-asc">Price: Low → High</option>
            <option value="price-desc">Price: High → Low</option>
            <option value="courses-desc">Most courses first</option>
            <option value="az">A → Z</option>
          </select>

          {/* Tag filter pills — each click updates URL */}
          {allTags.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              {(['ALL', ...allTags]).map(tag => (
                <button key={tag} onClick={() => selectTag(tag)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition border ${
                    activeTag === tag
                      ? 'bg-azure text-white border-azure'
                      : 'bg-white border-cloud text-royal/60 hover:border-azure/40'
                  }`}>
                  {tag === 'ALL' ? 'All' : tag}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Count */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-royal/50">
            {filtered.length} package{filtered.length !== 1 ? 's' : ''}
            {activeTag !== 'ALL' && <span className="text-royal/30"> in &ldquo;{activeTag}&rdquo;</span>}
          </p>
          {enrolled.length > 0 && (
            <span className="flex items-center gap-1.5 text-sm font-medium text-green-600">
              <Icon name="check" size={14} /> {enrolled.length} enrolled
            </span>
          )}
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <Card>
            <EmptyState
              icon="packages"
              title="No packages found"
              description={search || activeTag !== 'ALL' ? 'Try a different search or filter' : 'No packages are available yet'}
            />
            {/* Clear filter action when a tag or search is active */}
            {(search || activeTag !== 'ALL') && (
              <div className="mt-4 flex justify-center">
                <button
                  onClick={() => { setSearch(''); selectTag('ALL'); }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-cloud bg-surface px-4 py-2 text-sm font-medium text-azure hover:border-azure hover:bg-azure hover:text-white transition"
                >
                  Clear filter
                </button>
              </div>
            )}
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map(pkg => {
              const enrollment  = enrolledInfo(pkg.id);
              const expiringSoon = expiringWithin7Days(enrollment);

              return (
                <Card key={pkg.id} hover padding="none" className="flex flex-col overflow-hidden">
                  {/* Top accent bar: azure when enrolled, cloud otherwise */}
                  <div className={`h-1 w-full flex-shrink-0 ${enrollment ? 'bg-azure' : 'bg-cloud'}`} />

                  <div className="flex-1 p-5 flex flex-col gap-4">

                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        {pkg.categoryTags?.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-2">
                            {pkg.categoryTags.slice(0, 3).map(tag => (
                              <Badge key={tag} variant="active">{tag}</Badge>
                            ))}
                          </div>
                        )}
                        <h3 className="text-base font-semibold text-navy leading-snug">{pkg.name}</h3>
                      </div>

                      {/* Price is always visible — enrolled badge appears below it */}
                      <div className="flex-shrink-0 flex flex-col items-end gap-1.5">
                        <p className={`font-bold text-navy leading-none ${enrollment ? 'text-base' : 'text-xl'}`}>
                          {fmtPrice(pkg.priceAmount, pkg.currency)}
                        </p>
                        {enrollment && (
                          <span className="flex items-center gap-1 rounded-full bg-green-50 border border-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                            <Icon name="check" size={11} /> Enrolled
                          </span>
                        )}
                      </div>
                    </div>

                    {pkg.description && (
                      <p className="text-sm text-royal/50 leading-relaxed line-clamp-2">{pkg.description}</p>
                    )}

                    <div className="flex items-center gap-4 text-sm text-royal/50 flex-wrap">
                      <span className="flex items-center gap-1.5">
                        <Icon name="courses" size={14} className="text-royal/40" />
                        {pkg.courseIds?.length ?? 0} courses
                      </span>
                      {pkg.validityDays && (
                        // Fixed: was "live" icon which is semantically wrong for duration
                        <span className="flex items-center gap-1.5">
                          <Icon name="clock" size={14} className="text-royal/40" />
                          {pkg.validityDays} days
                        </span>
                      )}
                    </div>

                    {/* Cohort — with explanation so students understand what it means */}
                    {pkg.cohort && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 rounded-lg bg-azure/5 border border-azure/20 px-2.5 py-1.5">
                          <Icon name="mentorship" size={12} className="text-azure flex-shrink-0" />
                          <span className="text-xs text-azure font-medium truncate">Cohort: {pkg.cohort.name}</span>
                        </div>
                        <p className="text-[11px] text-royal/40 px-0.5">
                          You&apos;ll join a fixed group — live sessions and mentorship are shared with cohort members.
                        </p>
                      </div>
                    )}

                    {/* Expiry — amber warning if within 7 days, normal text otherwise */}
                    {enrollment?.expiresAt && (
                      <div className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs ${
                        expiringSoon
                          ? 'bg-amber-50 border border-amber-200 text-amber-700'
                          : 'text-royal/40'
                      }`}>
                        {expiringSoon && <Icon name="clock" size={11} className="flex-shrink-0 text-amber-500" />}
                        {expiringSoon ? 'Expires ' : 'Access until '}
                        {new Date(enrollment.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                        {expiringSoon && (
                          <Link href={`/packages/${pkg.id}/checkout`} onClick={e => e.stopPropagation()}
                            className="ml-auto font-semibold underline hover:text-amber-800 transition flex-shrink-0">
                            Renew
                          </Link>
                        )}
                      </div>
                    )}

                    <div className="mt-auto pt-1 flex gap-2">
                      {enrollment ? (
                        <>
                          <Link href="/student/courses" className="flex-1 btn-primary justify-center text-xs py-2.5">
                            <Icon name="play" size={13} /> My courses
                          </Link>
                          <Link href={`/packages/${pkg.id}`} className="btn-secondary text-xs px-4 py-2.5">
                            Details
                          </Link>
                        </>
                      ) : (
                        <>
                          <Link href={`/packages/${pkg.id}/checkout`} className="flex-1 btn-primary justify-center text-xs py-2.5">
                            Enroll now
                          </Link>
                          <Link href={`/packages/${pkg.id}`} className="btn-secondary text-xs px-4 py-2.5">
                            Details
                          </Link>
                        </>
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
  );
}

export default function PackagesPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-full">
        <div className="flex-1 max-w-6xl w-full mx-auto px-5 sm:px-8 py-8">
          <div className="h-10 w-full max-w-sm rounded-xl bg-cloud animate-pulse" />
        </div>
      </div>
    }>
      <PackagesPageInner />
    </Suspense>
  );
}
