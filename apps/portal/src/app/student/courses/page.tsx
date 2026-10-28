'use client';
import { Suspense as _Suspense, useEffect, useState, useMemo } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Suspense = _Suspense as any;
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

interface Course {
  id: string;
  title: string;
  description?: string;
  source: string;
  wpCourseUrl?: string;
  coverUrl?: string;
  progress?: number;
  packageName?: string;
  packageId?: string;
  packageExpiresAt?: string | null;
  isIndividual?: boolean;
  _count?: { modules: number };
  teacher?: { firstName?: string | null; lastName?: string | null; email: string };
}

type Tab = 'packages' | 'individual' | 'free';
type SortOption = 'default' | 'progress-desc' | 'progress-asc' | 'az' | 'za';

// Suspense wrapper required for useSearchParams in Next.js App Router
export default function StudentCoursesPage() {
  return (
    <Suspense>
      <CoursesContent />
    </Suspense>
  );
}

function CoursesContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  const [data,          setData]          = useState<any>(null);
  const [progressMap,   setProgressMap]   = useState<Record<string, number>>({});
  const [nextLessonMap, setNextLessonMap] = useState<Record<string, { id: string; title: string } | null>>({});
  const [loading,       setLoading]       = useState(true);
  const [search,        setSearch]        = useState('');
  const [sort,          setSort]          = useState<SortOption>('default');

  // Tab persisted in ?tab= URL param
  const urlTab = searchParams.get('tab') as Tab;
  const [tab, setTabState] = useState<Tab>(
    ['packages', 'individual', 'free'].includes(urlTab) ? urlTab : 'packages'
  );

  function setTab(t: Tab) {
    setTabState(t);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', t);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    api.get('/portals/student/courses')
      .then(async r => {
        setData(r.data);
        const pkgCourses: string[] = (r.data?.packages ?? []).flatMap((p: any) =>
          (p.courses ?? []).filter((c: any) => c.source !== 'WORDPRESS').map((c: any) => c.id)
        );
        const indCourses: string[] = (r.data?.individualCourses ?? [])
          .filter((c: any) => c.source !== 'WORDPRESS')
          .map((c: any) => c.id);
        const allIds = [...new Set([...pkgCourses, ...indCourses])];
        if (allIds.length > 0) {
          const results = await Promise.allSettled(
            allIds.map(id =>
              api.get(`/platform-courses/${id}/progress`).then(pr => {
                const allLessons = (pr.data?.modules ?? []).flatMap((m: any) => m.lessons);
                const next = allLessons.find((l: any) => !l.progress?.completed) ?? null;
                return {
                  id,
                  pct: pr.data?.percentComplete ?? 0,
                  nextLesson: next ? { id: next.id, title: next.title } : null,
                };
              })
            )
          );
          const map:  Record<string, number> = {};
          const nlMap: Record<string, { id: string; title: string } | null> = {};
          results.forEach(r => {
            if (r.status === 'fulfilled') {
              map[r.value.id]   = r.value.pct;
              nlMap[r.value.id] = r.value.nextLesson;
            }
          });
          setProgressMap(map);
          setNextLessonMap(nlMap);
        }
        // Auto-select tab if only one type of courses exists
        if (!(r.data?.packages?.length > 0) && r.data?.individualCourses?.length > 0) {
          setTab('individual');
        } else if (!(r.data?.packages?.length > 0) && !(r.data?.individualCourses?.length > 0) && r.data?.wpCourses?.length > 0) {
          setTab('free');
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const packageCourses: (Course & { progress: number })[] = useMemo(() => {
    if (!data) return [];
    return (data.packages ?? []).flatMap((pkg: any) =>
      (pkg.courses ?? []).map((c: any) => ({
        ...c,
        packageName:      pkg.name,
        packageId:        pkg.id,
        packageExpiresAt: pkg.expiresAt ?? null,
        progress:         progressMap[c.id] ?? 0,
      }))
    );
  }, [data, progressMap]);

  const individualCourses: (Course & { progress: number })[] = useMemo(() => {
    if (!data) return [];
    return (data.individualCourses ?? []).map((c: any) => ({
      ...c,
      isIndividual: true,
      progress: progressMap[c.id] ?? 0,
    }));
  }, [data, progressMap]);

  const wpCourses: Course[] = useMemo(() => data?.wpCourses ?? [], [data]);

  const packages: any[] = data?.packages ?? [];

  function sortCourses<T extends Course & { progress: number }>(list: T[]): T[] {
    switch (sort) {
      case 'progress-desc': return [...list].sort((a, b) => b.progress - a.progress);
      case 'progress-asc':  return [...list].sort((a, b) => a.progress - b.progress);
      case 'az': return [...list].sort((a, b) => a.title.localeCompare(b.title));
      case 'za': return [...list].sort((a, b) => b.title.localeCompare(a.title));
      default: return list;
    }
  }

  function filterCourses(list: Course[]) {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(c =>
      (c.title ?? '').toLowerCase().includes(q) ||
      ((c as any).packageName ?? '').toLowerCase().includes(q)
    );
  }

  const filteredPackageCourses    = sortCourses(filterCourses(packageCourses) as (Course & { progress: number })[]);
  const filteredIndividualCourses = sortCourses(filterCourses(individualCourses) as (Course & { progress: number })[]);
  const filteredWpCourses         = filterCourses(wpCourses);

  const hasCourses   = packageCourses.length > 0 || individualCourses.length > 0 || wpCourses.length > 0;
  const tabCount     = (packageCourses.length > 0 ? 1 : 0) + (individualCourses.length > 0 ? 1 : 0) + (wpCourses.length > 0 ? 1 : 0);
  const hasBoth      = tabCount > 1;
  const totalCourses = packageCourses.length + individualCourses.length + wpCourses.length;

  const nativeCourses  = [...packageCourses, ...individualCourses];
  const avgProgress    = nativeCourses.length > 0
    ? Math.round(nativeCourses.reduce((s, c) => s + c.progress, 0) / nativeCourses.length)
    : 0;
  const completedCount = nativeCourses.filter(c => c.progress === 100).length;

  // Search result count for active tab
  const activeFiltered = tab === 'packages' ? filteredPackageCourses.length
    : tab === 'individual' ? filteredIndividualCourses.length
    : filteredWpCourses.length;
  const activeTotal = tab === 'packages' ? packageCourses.length
    : tab === 'individual' ? individualCourses.length
    : wpCourses.length;

  // ── Skeleton loading ──
  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-surface">
        <div className="bg-white border-b border-cloud">
          <div className="max-w-5xl mx-auto px-5 sm:px-8 py-7">
            <div className="h-3 w-20 rounded-full bg-cloud animate-pulse mb-2" />
            <div className="h-7 w-40 rounded-full bg-cloud animate-pulse mb-4" />
            <div className="flex gap-4">
              <div className="h-4 w-28 rounded-full bg-cloud animate-pulse" />
              <div className="h-4 w-20 rounded-full bg-cloud animate-pulse" />
              <div className="h-4 w-32 rounded-full bg-cloud animate-pulse" />
            </div>
          </div>
        </div>
        <div className="flex-1 max-w-5xl mx-auto w-full px-5 sm:px-8 py-7">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="rounded-2xl border border-cloud bg-white overflow-hidden animate-pulse">
                <div className="h-40 bg-cloud" />
                <div className="p-4 space-y-3">
                  <div className="h-3 w-20 rounded-full bg-cloud" />
                  <div className="h-4 w-3/4 rounded-full bg-cloud" />
                  <div className="h-3 w-1/3 rounded-full bg-cloud" />
                  <div className="h-3 w-1/2 rounded-full bg-cloud" />
                  <div className="mt-1 h-1.5 w-full rounded-full bg-cloud" />
                  <div className="h-9 rounded-xl bg-cloud" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const TABS: { key: Tab; label: string; count: number; icon: string }[] = [
    ...(packageCourses.length    > 0 ? [{ key: 'packages'   as Tab, label: 'Packages',  count: packageCourses.length,    icon: 'packages' }] : []),
    ...(individualCourses.length > 0 ? [{ key: 'individual' as Tab, label: 'Purchased', count: individualCourses.length, icon: 'shield'   }] : []),
    ...(wpCourses.length         > 0 ? [{ key: 'free'       as Tab, label: 'Free',      count: wpCourses.length,         icon: 'courses'  }] : []),
  ];

  return (
    <div className="flex flex-col min-h-full bg-surface">

      {/* ── Hero header ── */}
      <div className="bg-white border-b border-cloud">
        <div className="max-w-5xl mx-auto px-5 sm:px-8 py-7">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">

            {/* Left: title + stats */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-1">My Learning</p>
              <h1 className="text-2xl font-black text-[#0f172a] leading-tight">My Courses</h1>

              {hasCourses && (
                <div className="mt-3 flex items-center gap-5 flex-wrap">
                  <div className="flex items-center gap-1.5 text-xs text-azure/80 font-medium">
                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-azure/10">
                      <Icon name="courses" size={11} className="text-azure" />
                    </span>
                    {totalCourses} course{totalCourses !== 1 ? 's' : ''}
                  </div>
                  {completedCount > 0 && (
                    <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-medium">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-50">
                        <Icon name="check" size={11} className="text-emerald-500" />
                      </span>
                      {completedCount} completed
                    </div>
                  )}
                  {nativeCourses.length > 0 && (
                    <div className="flex items-center gap-2 text-xs text-azure/60">
                      <div className="h-1.5 w-24 rounded-full bg-azure/10 overflow-hidden">
                        <div className="h-full rounded-full bg-azure transition-all" style={{ width: `${avgProgress}%` }} />
                      </div>
                      <span className="font-semibold text-azure">{avgProgress}% avg</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right: sort + search */}
            {hasCourses && (
              <div className="flex items-center gap-2 flex-wrap">
                {/* Sort select */}
                <div className="relative">
                  <Icon name="sort" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-azure/40 pointer-events-none" />
                  <select
                    value={sort}
                    onChange={e => setSort(e.target.value as SortOption)}
                    className="appearance-none rounded-xl border border-cloud bg-surface pl-9 pr-8 py-2.5 text-sm text-[#0f172a] outline-none focus:border-azure focus:ring-2 focus:ring-azure/10 transition cursor-pointer"
                  >
                    <option value="default">Default</option>
                    <option value="progress-desc">Progress ↓</option>
                    <option value="progress-asc">Progress ↑</option>
                    <option value="az">A → Z</option>
                    <option value="za">Z → A</option>
                  </select>
                  <Icon name="chevronDown" size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-azure/40 pointer-events-none" />
                </div>

                {/* Search */}
                <div className="relative w-full sm:w-56">
                  <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-azure/40 pointer-events-none" />
                  <input
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Search courses…"
                    className="w-full rounded-xl border border-cloud bg-surface pl-9 pr-8 py-2.5 text-sm text-[#0f172a] placeholder:text-azure/30 outline-none focus:border-azure focus:ring-2 focus:ring-azure/10 transition"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-cloud hover:bg-azure/20 transition"
                    >
                      <Icon name="close" size={10} className="text-royal/60" />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Search result count — scoped to active tab */}
          {search.trim() && hasCourses && (
            <p className="mt-2 text-xs text-azure/50">
              {activeFiltered} of {activeTotal} course{activeTotal !== 1 ? 's' : ''} match &ldquo;{search}&rdquo;
            </p>
          )}

          {/* Tab bar */}
          {hasBoth && (
            <div className="mt-6 flex items-center gap-1 border-b border-cloud -mb-px">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setTab(t.key)}
                  className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
                    tab === t.key
                      ? 'text-azure border-b-2 border-azure -mb-px pb-[9px]'
                      : 'text-azure/50 hover:text-azure'
                  }`}>
                  <Icon name={t.icon as any} size={14} />
                  {t.label}
                  <span className={`inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                    tab === t.key ? 'bg-azure text-white' : 'bg-azure/10 text-azure/60'
                  }`}>
                    {t.count}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-5 sm:px-8 py-7 pb-28 lg:pb-10 space-y-8">

        {!hasCourses ? (
          <div className="rounded-2xl border border-cloud bg-white p-8">
            <EmptyState
              icon="courses"
              title="No courses yet"
              description="Enroll in a package to start learning, or buy an individual course from the catalogue."
              action={{ label: 'Browse packages', href: '/packages' }}
              secondaryAction={{ label: 'Browse courses', href: '/student/catalogue' }}
            />
          </div>
        ) : (
          <>
            {/* PACKAGES TAB */}
            {(tab === 'packages' || !hasBoth) && packageCourses.length > 0 && (
              <div className="space-y-8">
                {filteredPackageCourses.length === 0 ? (
                  <p className="text-sm text-azure/40 text-center py-12">No courses match your search.</p>
                ) : (
                  packages.map((pkg: any) => {
                    const pkgCourses = filteredPackageCourses.filter(c => c.packageId === pkg.id);
                    if (pkgCourses.length === 0) return null;
                    return (
                      <div key={pkg.id}>
                        {/* Package label */}
                        <div className="flex items-center gap-3 mb-4">
                          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-azure/10 flex-shrink-0">
                            <Icon name="packages" size={14} className="text-azure" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="text-sm font-bold text-[#0f172a]">{pkg.name}</p>
                              <span className="rounded-md bg-azure/10 px-2 py-0.5 text-[10px] font-bold text-azure">
                                {pkgCourses.length} course{pkgCourses.length !== 1 ? 's' : ''}
                              </span>
                            </div>
                            {pkg.expiresAt && (
                              <p className="text-[11px] text-azure/50 mt-0.5">
                                Access until {new Date(pkg.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                          {pkgCourses.map((course, idx) => (
                            <CourseCard key={course.id ?? idx} course={course} nextLesson={nextLessonMap[course.id] ?? null} />
                          ))}
                        </div>
                      </div>
                    );
                  })
                )}

                {!hasBoth && (
                  <div className="flex items-center gap-4 rounded-2xl bg-[#EEF3FF] border border-azure/20 px-5 py-4">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-azure/20 flex-shrink-0">
                      <Icon name="courses" size={16} className="text-azure" />
                    </div>
                    <p className="text-sm text-azure/70 flex-1">
                      Buy individual courses with lifetime access — no package required.
                    </p>
                    <Link href="/student/catalogue" className="flex-shrink-0 text-sm font-bold text-azure hover:text-royal transition flex items-center gap-1">
                      Browse <Icon name="arrowRight" size={13} />
                    </Link>
                  </div>
                )}
              </div>
            )}

            {/* FREE COURSES TAB */}
            {(tab === 'free' || !hasBoth) && wpCourses.length > 0 && (
              <div className="space-y-5">
                <div className="flex items-center gap-4 rounded-2xl bg-[#EEF3FF] border border-azure/20 px-5 py-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-azure/20 flex-shrink-0">
                    <Icon name="courses" size={16} className="text-azure" />
                  </div>
                  <p className="text-sm text-azure/70 flex-1">
                    <span className="font-bold text-[#0f172a]">Free access</span> — these courses are included in your account.
                  </p>
                  <Link href="/student/catalogue" className="flex-shrink-0 text-sm font-bold text-azure hover:text-royal transition flex items-center gap-1">
                    More <Icon name="arrowRight" size={13} />
                  </Link>
                </div>

                {filteredWpCourses.length === 0 ? (
                  <p className="text-sm text-azure/40 text-center py-12">No courses match your search.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredWpCourses.map((course, idx) => (
                      <CourseCard key={course.id ?? idx} course={course as any} nextLesson={null} />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* INDIVIDUAL TAB */}
            {(tab === 'individual' || !hasBoth) && individualCourses.length > 0 && (
              <div className="space-y-5">
                <div className="flex items-center gap-4 rounded-2xl bg-[#EEF3FF] border border-azure/20 px-5 py-4">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-azure/20 flex-shrink-0">
                    <Icon name="shield" size={16} className="text-azure" />
                  </div>
                  <p className="text-sm text-azure/70 flex-1">
                    <span className="font-bold text-[#0f172a]">Lifetime access</span> — purchased directly, they never expire.
                  </p>
                  <Link href="/student/catalogue" className="flex-shrink-0 text-sm font-bold text-azure hover:text-royal transition flex items-center gap-1">
                    Buy more <Icon name="arrowRight" size={13} />
                  </Link>
                </div>

                {filteredIndividualCourses.length === 0 ? (
                  <p className="text-sm text-azure/40 text-center py-12">No courses match your search.</p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                    {filteredIndividualCourses.map((course, idx) => (
                      <CourseCard key={course.id ?? idx} course={course} nextLesson={nextLessonMap[course.id] ?? null} showLifetimeBadge />
                    ))}
                  </div>
                )}

                <div className="flex items-start gap-4 rounded-2xl bg-[#EEF3FF] border border-azure/20 px-5 py-5">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-azure/10 flex-shrink-0">
                    <Icon name="packages" size={18} className="text-azure" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold text-[#0f172a]">Get live classes &amp; mentorship too</p>
                    <p className="text-xs text-azure/50 mt-1 leading-relaxed">
                      Individual courses don&apos;t include live sessions. A package gives you everything in one place.
                    </p>
                    <Link href="/packages" className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-azure px-4 py-2 text-xs font-bold text-white hover:bg-royal transition">
                      View packages <Icon name="arrowRight" size={13} />
                    </Link>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function CourseCard({ course, showLifetimeBadge, nextLesson }: {
  course: Course & { progress: number };
  showLifetimeBadge?: boolean;
  nextLesson: { id: string; title: string } | null;
}) {
  const title      = course.title ?? 'Course';
  const progress   = course.progress ?? 0;
  const isComplete = progress === 100;
  const isStarted  = progress > 0 && progress < 100;
  const isWP       = course.source === 'WORDPRESS';

  // Per-card expiry: warn if access expires within 7 days
  const isExpiringSoon = (() => {
    const exp = course.packageExpiresAt;
    if (!exp) return false;
    const msLeft = new Date(exp).getTime() - Date.now();
    return msLeft > 0 && msLeft < 7 * 24 * 60 * 60 * 1000;
  })();

  const teacherName = course.teacher
    ? [course.teacher.firstName, course.teacher.lastName].filter(Boolean).join(' ') || course.teacher.email
    : null;

  return (
    <Link
      href={`/student/learn/${course.id}`}
      className="group flex flex-col rounded-2xl border border-cloud bg-white overflow-hidden hover:border-azure/40 hover:shadow-lg hover:shadow-azure/8 transition-all duration-200"
    >
      {/* Cover / thumbnail */}
      <div className="relative h-40 w-full flex-shrink-0 overflow-hidden">
        {course.coverUrl ? (
          <img src={course.coverUrl} alt={title} className="h-full w-full object-cover group-hover:scale-105 transition-transform duration-300" />
        ) : (
          <div className="h-full w-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #5889FA18 0%, #5889FA08 100%)' }}>
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-azure/15">
              <Icon name="courses" size={24} className="text-azure" />
            </div>
          </div>
        )}

        {/* Status badge — top right */}
        <div className="absolute top-3 right-3">
          {isComplete ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
              <Icon name="check" size={9} /> Done
            </span>
          ) : isStarted ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-azure px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
              In progress
            </span>
          ) : isWP ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-white/90 backdrop-blur px-2.5 py-1 text-[10px] font-bold text-azure border border-azure/20 shadow-sm">
              Free
            </span>
          ) : null}
        </div>

        {/* Lifetime badge — top left */}
        {showLifetimeBadge && (
          <div className="absolute top-3 left-3">
            <span className="inline-flex items-center gap-1 rounded-md bg-white/90 backdrop-blur px-2.5 py-1 text-[10px] font-bold text-azure border border-azure/20 shadow-sm">
              <Icon name="shield" size={9} /> Lifetime
            </span>
          </div>
        )}

        {/* Expiry warning badge — bottom left, only when within 7 days */}
        {isExpiringSoon && (
          <div className="absolute bottom-3 left-3">
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-500 px-2.5 py-1 text-[10px] font-bold text-white shadow-sm">
              <Icon name="clock" size={9} /> Expires soon
            </span>
          </div>
        )}
      </div>

      {/* Card body */}
      <div className="flex flex-col flex-1 gap-3 p-4">

        {/* Package pill */}
        {course.packageName && (
          <span className="self-start rounded-md bg-azure/8 px-2.5 py-0.5 text-[10px] font-bold text-azure truncate max-w-full">
            {course.packageName}
          </span>
        )}

        {/* Title + meta */}
        <div className="flex-1">
          <h3 className="text-sm font-bold text-[#0f172a] leading-snug line-clamp-2 group-hover:text-azure transition-colors">
            {title}
          </h3>
          <div className="mt-1.5 flex items-center gap-3 flex-wrap">
            {course._count?.modules != null && (
              <p className="text-[11px] text-azure/50">
                {course._count.modules} module{course._count.modules !== 1 ? 's' : ''}
              </p>
            )}
            {teacherName && (
              <p className="text-[11px] text-azure/40 flex items-center gap-0.5 truncate min-w-0">
                <Icon name="mentorship" size={9} className="flex-shrink-0" />
                {teacherName}
              </p>
            )}
          </div>
        </div>

        {/* Next lesson hint — in-progress native courses only */}
        {isStarted && nextLesson && !isWP && (
          <p className="text-[11px] text-azure/50 truncate flex items-center gap-1">
            <Icon name="play" size={9} className="text-azure/40 flex-shrink-0" />
            Next: {nextLesson.title}
          </p>
        )}

        {/* Progress bar (native) or External label (WP) */}
        {!isWP ? (
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] text-azure/50">
                {isComplete ? 'Completed' : isStarted ? 'In progress' : 'Not started'}
              </span>
              <span className={`text-[11px] font-bold tabular-nums ${isComplete ? 'text-emerald-500' : 'text-azure'}`}>
                {progress}%
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full overflow-hidden" style={{ background: '#5889FA18' }}>
              <div
                className={`h-full rounded-full transition-all duration-500 ${isComplete ? 'bg-emerald-400' : 'bg-azure'}`}
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        ) : (
          /* WP courses have no progress tracking — show platform label instead of empty gap */
          <div className="flex items-center gap-1.5 text-[11px] text-azure/40">
            <Icon name="live" size={10} className="flex-shrink-0 text-azure/30" />
            External platform — opens in portal
          </div>
        )}

        {/* CTA */}
        <div className={`flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-bold transition-colors ${
          isComplete
            ? 'bg-emerald-50 text-emerald-600 group-hover:bg-emerald-500 group-hover:text-white'
            : 'bg-azure/10 text-azure group-hover:bg-azure group-hover:text-white'
        }`}>
          <Icon name={isComplete ? 'check' : 'play'} size={13} />
          {isComplete ? 'Review' : isStarted ? 'Continue' : 'Start learning'}
        </div>
      </div>
    </Link>
  );
}
