'use client';
import { Suspense as _Suspense, useEffect, useState, useMemo } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Suspense = _Suspense as any;
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

interface Programme {
  id: string; name: string; shortName: string | null; type: string;
  country: { name: string; code: string } | null;
}
interface Course {
  id: string; title: string; description: string | null; status: string;
  priceAmount: number | null; priceCurrency: string | null; isSoldIndividually: boolean;
  programme: { id: string; name: string; shortName: string | null } | null;
  subject:   { name: string } | null;
  level:     { id: string; name: string } | null;
  teacher:   { email: string; name: string | null } | null;
  _count:    { modules: number; enrollments: number };
  createdAt: string;
}
interface Package {
  id: string; name: string; description: string | null;
  priceAmount: number; currency: string;
  courseIds: string[]; validityDays: number | null;
  categoryTags: string[];
  cohort?: { id: string; name: string } | null;
}
interface ActivePackage { id: string; }
interface CoursePurchase { courseId: string; }

type SortOption = 'default' | 'newest' | 'enrolled' | 'az';

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Shared price formatter — treats amount as minor units (cents/kobo/pesewas)
// Consistent with /packages and /packages/[id] pages
function fmtPrice(amount: number | null, currency: string | null): string | null {
  if (!amount || !currency) return null;
  return `${currency} ${(amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function StudentCataloguePage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col min-h-full">
        <SkeletonTopbar />
        <div className="flex-1 px-4 sm:px-6 py-6 max-w-6xl mx-auto w-full">
          <div className="h-10 w-full max-w-sm rounded-xl bg-cloud animate-pulse" />
        </div>
      </div>
    }>
      <CatalogueContent />
    </Suspense>
  );
}

function CatalogueContent() {
  const searchParams = useSearchParams();
  const router       = useRouter();
  const pathname     = usePathname();

  const [programmes,     setProgrammes]     = useState<Programme[]>([]);
  const [courses,        setCourses]        = useState<Course[]>([]);
  const [packages,       setPackages]       = useState<Package[]>([]);
  const [enrolledPkgIds, setEnrolledPkgIds] = useState<Set<string>>(new Set());
  const [enrolled,       setEnrolled]       = useState<Set<string>>(new Set());
  const [loading,        setLoading]        = useState(true);
  const [search,         setSearch]         = useState('');
  const [sort,           setSort]           = useState<SortOption>('default');
  const [view,           setView]           = useState<'grid' | 'list'>('grid');
  const [interestIds,    setInterestIds]    = useState<string[]>([]);
  const [levelId,        setLevelId]        = useState<string | null>(null);
  const [progressMap,    setProgressMap]    = useState<Record<string, number>>({});

  // Tab persisted in ?tab= URL param
  const urlTab = searchParams.get('tab') ?? '';
  const [activeTab, setActiveTabState] = useState<string>(urlTab || 'all');

  function setActiveTab(t: string) {
    setActiveTabState(t);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', t);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  }

  useEffect(() => {
    api.get('/auth/me')
      .then(mr => {
        const me = mr.data;
        const interests: string[] = me?.programmeInterestIds ?? [];
        const country: string | null = me?.countryId ?? null;
        const lvl: string | null = me?.levelId ?? null;
        setInterestIds(interests);
        setLevelId(lvl);

        const programmeUrl = country
          ? `/catalogue/programmes?countryId=${encodeURIComponent(country)}`
          : '/catalogue/programmes';

        return Promise.all([
          api.get(programmeUrl).catch(() => ({ data: [] })),
          api.get('/platform-courses').catch(() => ({ data: [] })),
          api.get('/packages').catch(() => ({ data: [] })),
          api.get('/portals/student/course-purchases').catch(() => ({ data: [] })),
        ]).then(([pr, cr, pkgr, cpr]) => {
          setProgrammes(pr.data ?? []);
          const publishedCourses: Course[] = (cr.data ?? []).filter((c: Course) => c.status === 'PUBLISHED');
          setCourses(publishedCourses);
          setPackages(pkgr.data ?? []);

          const activePkgIds = new Set<string>((me?.activePackages ?? []).map((p: ActivePackage) => p.id));
          setEnrolledPkgIds(activePkgIds);

          const ids = new Set<string>();
          (pkgr.data as Package[] ?? []).forEach((pkg) => {
            if (activePkgIds.has(pkg.id)) (pkg.courseIds ?? []).forEach((cid) => ids.add(cid));
          });
          (cpr.data as CoursePurchase[] ?? []).forEach((p) => ids.add(p.courseId));
          setEnrolled(ids);

          // Fetch progress for enrolled courses (non-blocking)
          Array.from(ids).slice(0, 20).forEach((courseId: string) => {
            api.get(`/platform-courses/${courseId}/progress`)
              .then(pr => setProgressMap(m => ({ ...m, [courseId]: pr.data?.percentComplete ?? 0 })))
              .catch(() => {});
          });

          // Auto-set tab to 'my' only if URL didn't specify a tab
          if (!urlTab && interests.length > 0) setActiveTab('my');
        });
      })
      .catch(() => {
        Promise.all([
          api.get('/catalogue/programmes').catch(() => ({ data: [] })),
          api.get('/platform-courses').catch(() => ({ data: [] })),
          api.get('/packages').catch(() => ({ data: [] })),
        ]).then(([pr, cr, pkgr]) => {
          setProgrammes(pr.data ?? []);
          setCourses((cr.data ?? []).filter((c: Course) => c.status === 'PUBLISHED'));
          setPackages(pkgr.data ?? []);
        });
      })
      .finally(() => setLoading(false));
  }, []);

  const tabs = useMemo(() => {
    const allTab   = { id: 'all', label: 'All courses',    isInterest: false };
    const progTabs = programmes.map(p => ({
      id:         p.id,
      label:      p.shortName ?? p.name,
      isInterest: interestIds.includes(p.id),
    }));
    if (interestIds.length > 0) {
      return [{ id: 'my', label: 'My Programmes', isInterest: true }, allTab, ...progTabs];
    }
    return [allTab, ...progTabs];
  }, [programmes, interestIds]);

  // Derive level name from courses to show in the filter indicator
  const levelName = useMemo(
    () => courses.find(c => c.level?.id === levelId)?.level?.name ?? null,
    [courses, levelId]
  );

  const nowMs = Date.now();

  const filtered = useMemo(() => {
    let list = courses;

    if (activeTab === 'my') {
      list = list.filter(c => c.programme && interestIds.includes(c.programme.id));
    } else if (activeTab !== 'all') {
      list = list.filter(c => c.programme?.id === activeTab);
    }

    // Auto level pre-filter (only when levelId is set AND there are enough matches)
    if (levelId) {
      const withLevel = list.filter(c => c.level?.id === levelId);
      if (withLevel.length > 0) list = withLevel;
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(c =>
        c.title.toLowerCase().includes(q) ||
        (c.description ?? '').toLowerCase().includes(q) ||
        (c.subject?.name ?? '').toLowerCase().includes(q)
      );
      // Boost interest-matching courses to the top
      if (interestIds.length > 0) {
        list = [...list].sort((a, b) => {
          const ai = a.programme && interestIds.includes(a.programme.id) ? 0 : 1;
          const bi = b.programme && interestIds.includes(b.programme.id) ? 0 : 1;
          return ai - bi;
        });
      }
    }

    // Apply sort
    switch (sort) {
      case 'newest':   list = [...list].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
      case 'enrolled': list = [...list].sort((a, b) => b._count.enrollments - a._count.enrollments); break;
      case 'az':       list = [...list].sort((a, b) => a.title.localeCompare(b.title)); break;
    }

    return list;
  }, [courses, activeTab, search, interestIds, levelId, sort]);

  // In-progress enrolled courses — no cap, strip is horizontally scrollable
  const continueLearning = useMemo(() => {
    return courses
      .filter(c => enrolled.has(c.id) && progressMap[c.id] !== undefined)
      .map(c => ({ ...c, progress: progressMap[c.id] ?? 0 }))
      .filter(c => c.progress > 0 && c.progress < 100)
      .sort((a, b) => b.progress - a.progress);
  }, [courses, enrolled, progressMap]);

  // courseId → packages that contain it
  const courseToPackages = useMemo(() => {
    const map = new Map<string, Package[]>();
    packages.forEach(pkg => {
      (pkg.courseIds ?? []).forEach((cid: string) => {
        if (!map.has(cid)) map.set(cid, []);
        map.get(cid)!.push(pkg);
      });
    });
    return map;
  }, [packages]);

  // Packages sorted: most relevant to student's interests first
  const sortedPackages = useMemo(() => {
    if (interestIds.length === 0) return packages;
    const interestCourseIds = new Set(
      courses.filter(c => c.programme && interestIds.includes(c.programme.id)).map(c => c.id)
    );
    return [...packages].sort((a, b) => {
      const aScore = (a.courseIds ?? []).filter((id: string) => interestCourseIds.has(id)).length;
      const bScore = (b.courseIds ?? []).filter((id: string) => interestCourseIds.has(id)).length;
      return bScore - aScore;
    });
  }, [packages, courses, interestIds]);

  // ── Loading skeleton ──────────────────────────────────────────────────────────
  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 px-4 sm:px-6 py-6 space-y-6 max-w-6xl w-full mx-auto">
        <div className="space-y-3">
          <div className="h-2.5 w-36 rounded bg-cloud animate-pulse" />
          <div className="flex gap-4 overflow-hidden">
            {[1,2,3].map(i => (
              <div key={i} className="w-[220px] h-40 flex-shrink-0 rounded-2xl border border-cloud bg-white animate-pulse" />
            ))}
          </div>
        </div>
        <div className="space-y-4">
          <div className="h-2.5 w-36 rounded bg-cloud animate-pulse" />
          <div className="flex gap-3">
            <div className="h-10 flex-1 max-w-sm rounded-xl bg-cloud animate-pulse" />
            <div className="h-10 w-20 rounded-xl bg-cloud animate-pulse" />
          </div>
          <div className="h-10 w-64 rounded-xl bg-cloud animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} lines={3} />)}
          </div>
        </div>
      </div>
    </div>
  );

  const isTabFiltered = activeTab !== 'all' && activeTab !== 'my';

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Course Catalogue" subtitle="Browse programmes and individual courses" />

      <div className="flex-1 px-4 sm:px-6 py-6 space-y-6 max-w-6xl w-full mx-auto">

        {/* ── Continue Learning strip — no cap, all in-progress courses shown ── */}
        {continueLearning.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Continue Learning</p>
              <Link href="/student/courses" className="text-xs font-semibold text-azure hover:text-royal transition flex items-center gap-1">
                My library <Icon name="arrowRight" size={12} />
              </Link>
            </div>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 sm:-mx-6 px-4 sm:px-6 no-scrollbar snap-x snap-mandatory">
              {continueLearning.map(course => (
                <Link key={course.id} href={`/student/learn/${course.id}`}
                  className="snap-start flex-shrink-0 w-[220px] sm:w-[240px] rounded-2xl border border-azure/40 bg-azure/[0.03] shadow-card hover:shadow-card-md hover:border-azure/60 transition-all p-4 flex flex-col gap-3 overflow-hidden">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {course.programme && (
                      <Badge variant="active">{course.programme.shortName ?? course.programme.name}</Badge>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-navy line-clamp-2 leading-snug flex-1">{course.title}</p>
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <p className="text-[10px] text-royal/40">Progress</p>
                      <p className="text-[10px] font-bold text-azure">{course.progress}%</p>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-cloud overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-azure to-royal transition-all"
                        style={{ width: `${course.progress}%` }} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-azure">
                    <span className="text-[11px] font-bold">Continue</span>
                    <Icon name="arrowRight" size={11} />
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Packages strip — price uses fmtPrice (÷100) ── */}
        {sortedPackages.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between px-1">
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Learning Packages</p>
              <Link href="/packages" className="text-xs font-semibold text-azure hover:text-royal transition flex items-center gap-1">
                See all <Icon name="arrowRight" size={12} />
              </Link>
            </div>

            <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 sm:-mx-6 px-4 sm:px-6 no-scrollbar snap-x snap-mandatory">
              {sortedPackages.map(pkg => {
                const isEnrolled = enrolledPkgIds.has(pkg.id);
                const priceStr   = fmtPrice(pkg.priceAmount, pkg.currency);
                return (
                  <div key={pkg.id} className={`snap-start flex-shrink-0 w-[220px] sm:w-[240px] rounded-2xl border bg-white shadow-card hover:shadow-card-md transition-all flex flex-col overflow-hidden ${isEnrolled ? 'border-azure/30' : 'border-cloud hover:border-azure/20'}`}>
                    <div className={`h-1 flex-shrink-0 ${isEnrolled ? 'bg-azure' : 'bg-cloud'}`} />
                    <div className="flex-1 p-4 flex flex-col gap-3">
                      {pkg.categoryTags?.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {pkg.categoryTags.slice(0, 2).map(tag => (
                            <Badge key={tag} variant="active">{tag}</Badge>
                          ))}
                        </div>
                      )}
                      <div>
                        <p className="text-sm font-semibold text-navy leading-snug line-clamp-2">{pkg.name}</p>
                        <p className="text-xs text-royal/50 mt-1">
                          {pkg.courseIds?.length ?? 0} courses
                          {pkg.validityDays ? ` · ${pkg.validityDays} days` : ''}
                        </p>
                        {pkg.cohort && (
                          <p className="flex items-center gap-1 text-xs text-azure font-medium mt-1">
                            <Icon name="mentorship" size={11} className="flex-shrink-0" />
                            Cohort included
                          </p>
                        )}
                      </div>
                      {/* Price always visible — was hidden when enrolled */}
                      {priceStr && (
                        <p className={`font-bold text-navy ${isEnrolled ? 'text-sm' : 'text-base'}`}>{priceStr}</p>
                      )}
                      <div className="mt-auto">
                        {isEnrolled ? (
                          <Link href="/student/courses" className="btn-primary w-full text-xs py-2 flex items-center justify-center gap-1">
                            <Icon name="play" size={12} /> My courses
                          </Link>
                        ) : (
                          <Link href={`/packages/${pkg.id}`} className="btn-primary w-full text-xs py-2 justify-center">
                            View package
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Individual courses ── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Individual Courses</p>
            {interestIds.length > 0 && (
              <Link href="/student/preferences"
                className="text-xs font-semibold text-azure hover:text-royal transition flex items-center gap-1">
                <Icon name="user" size={12} /> Edit interests
              </Link>
            )}
          </div>

          {/* Search + sort + view toggle */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px] max-w-sm">
              <Icon name="search" size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-royal/40 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search courses, subjects…"
                className="w-full rounded-xl border border-cloud bg-white py-2.5 pl-10 pr-4 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/15 placeholder:text-royal/40 transition"
              />
            </div>

            {/* Sort */}
            <select
              value={sort}
              onChange={e => setSort(e.target.value as SortOption)}
              className="rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/10 transition cursor-pointer flex-shrink-0"
            >
              <option value="default">Sort: Default</option>
              <option value="newest">Newest first</option>
              <option value="enrolled">Most enrolled</option>
              <option value="az">A → Z</option>
            </select>

            {/* Grid / list toggle */}
            <div className="flex rounded-xl border border-cloud bg-white overflow-hidden flex-shrink-0">
              {(['grid', 'list'] as const).map(v => (
                <button key={v} onClick={() => setView(v)}
                  className={`px-3 py-2.5 transition ${view === v ? 'bg-azure text-white' : 'text-royal/40 hover:text-navy'}`}>
                  <Icon name={v === 'grid' ? 'grid' : 'list'} size={14} />
                </button>
              ))}
            </div>
          </div>

          {/* Programme tabs — selection updates ?tab= URL */}
          {tabs.length > 1 && (
            <div className="flex items-center gap-1 rounded-xl border border-cloud bg-white p-1 w-fit max-w-full overflow-x-auto no-scrollbar">
              {tabs.map(tab => (
                <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                  className={`relative flex-shrink-0 rounded-lg px-4 py-1.5 text-sm font-semibold transition whitespace-nowrap ${
                    activeTab === tab.id ? 'bg-azure text-white shadow-sm' : 'text-royal/60 hover:text-navy'
                  }`}>
                  {tab.label}
                  {tab.isInterest && tab.id !== 'my' && activeTab !== tab.id && (
                    <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-azure" />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Level filter indicator — now shows on ALL tabs including "all", and names the level */}
          {levelId && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-royal/40 font-semibold uppercase tracking-wider">
                Level filter: {levelName ?? 'active'}
              </span>
              <button onClick={() => setLevelId(null)}
                className="text-[10px] font-semibold text-azure hover:text-royal transition">
                Clear
              </button>
            </div>
          )}

          {/* Count + clear search */}
          <div className="flex items-center justify-between">
            <p className="text-xs text-royal/50">
              {filtered.length} course{filtered.length !== 1 ? 's' : ''}
              {search && <span className="text-royal/30"> for &ldquo;{search}&rdquo;</span>}
            </p>
            {search && (
              <button onClick={() => setSearch('')}
                className="text-xs font-semibold text-azure hover:text-royal transition">
                Clear
              </button>
            )}
          </div>

          {/* Empty state — with clear filter button when a tab or search is active */}
          {filtered.length === 0 && (
            <Card>
              <EmptyState
                icon="search"
                title="No courses found"
                description="Try a different search or programme filter"
              />
              {(search || isTabFiltered || levelId) && (
                <div className="mt-4 flex justify-center">
                  <button
                    onClick={() => { setSearch(''); setLevelId(null); if (isTabFiltered) setActiveTab('all'); }}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-cloud bg-surface px-4 py-2 text-sm font-medium text-azure hover:border-azure hover:bg-azure hover:text-white transition"
                  >
                    Clear all filters
                  </button>
                </div>
              )}
            </Card>
          )}

          {/* Grid view */}
          {filtered.length > 0 && view === 'grid' && (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(course => {
                const hasAccess = enrolled.has(course.id);
                const progress  = progressMap[course.id] ?? 0;
                const priceStr  = fmtPrice(course.priceAmount, course.priceCurrency);
                // Teacher: show name only — if no name, use username part of email (not full email)
                const teacherDisplay = course.teacher
                  ? course.teacher.name ?? course.teacher.email.split('@')[0]
                  : null;
                const teacherInitial = teacherDisplay ? teacherDisplay[0].toUpperCase() : null;
                // New badge: any course under 30 days old, regardless of interest match
                const isNew = new Date(course.createdAt).getTime() > nowMs - THIRTY_DAYS_MS;

                // For non-enrolled: link to first package containing the course (not /student/courses/[id])
                const firstPkg = courseToPackages.get(course.id)?.[0];
                const unenrolledHref = course.isSoldIndividually
                  ? `/student/courses/${course.id}`
                  : firstPkg ? `/packages/${firstPkg.id}` : '/packages';

                return (
                  <Card key={course.id} hover padding="none"
                    className={`flex flex-col overflow-hidden transition-all ${hasAccess ? 'border-azure/40 bg-azure/[0.03] shadow-card' : ''}`}>
                    <div className="flex-1 p-5 flex flex-col gap-3">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {course.programme && (
                          <Badge variant="active">{course.programme.shortName ?? course.programme.name}</Badge>
                        )}
                        {course.subject && <Badge>{course.subject.name}</Badge>}
                        {/* New badge: all courses under 30 days, not just interest-matched */}
                        {isNew && !hasAccess && (
                          <span className="ml-auto flex items-center gap-1 rounded-full bg-azure/10 border border-azure/20 px-2 py-0.5 text-[10px] font-bold text-azure flex-shrink-0">
                            New
                          </span>
                        )}
                        {hasAccess && (
                          progress > 0 && progress < 100 ? (
                            <span className="ml-auto flex items-center gap-1 rounded-full bg-amber-50 border border-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 flex-shrink-0">
                              In progress
                            </span>
                          ) : progress === 100 ? (
                            <span className="ml-auto flex items-center gap-1 rounded-full bg-green-50 border border-green-100 px-2 py-0.5 text-xs font-medium text-green-700 flex-shrink-0">
                              <Icon name="check" size={11} /> Done
                            </span>
                          ) : (
                            <span className="ml-auto flex items-center gap-1 rounded-full bg-green-50 border border-green-100 px-2 py-0.5 text-xs font-medium text-green-700 flex-shrink-0">
                              <Icon name="check" size={11} /> Enrolled
                            </span>
                          )
                        )}
                      </div>

                      {/* Title link — unenrolled uses safe href (no /student/courses/[id] for package-only) */}
                      <Link
                        href={hasAccess ? `/student/learn/${course.id}` : unenrolledHref}
                        className="text-sm font-semibold text-navy leading-snug line-clamp-2 flex-1 hover:text-azure transition">
                        {course.title}
                      </Link>

                      {course.description && (
                        <p className="text-xs text-royal/50 line-clamp-2 leading-relaxed">{course.description}</p>
                      )}

                      {/* Teacher: name only (no email shown on public catalogue) */}
                      {teacherDisplay && (
                        <div className="flex items-center gap-2">
                          <div className="flex h-5 w-5 items-center justify-center rounded-full bg-azure text-[9px] font-bold text-white flex-shrink-0">
                            {teacherInitial}
                          </div>
                          <p className="text-xs text-royal/50 truncate">{teacherDisplay}</p>
                        </div>
                      )}

                      <div className="flex items-center gap-3 text-xs text-royal/40">
                        <span>{course._count.modules} modules</span>
                        <span>·</span>
                        <span>{course._count.enrollments.toLocaleString()} enrolled</span>
                      </div>

                      {hasAccess && progress > 0 && (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <p className="text-[10px] text-royal/40">Progress</p>
                            <p className="text-[10px] font-bold text-azure">{progress}%</p>
                          </div>
                          <div className="h-1.5 w-full rounded-full bg-cloud overflow-hidden">
                            <div className="h-full rounded-full bg-gradient-to-r from-azure to-royal transition-all"
                              style={{ width: `${progress}%` }} />
                          </div>
                        </div>
                      )}

                      <div className="pt-1 border-t border-cloud mt-auto">
                        {hasAccess ? (
                          <Link href={`/student/learn/${course.id}`} className="btn-primary w-full justify-center">
                            <Icon name="play" size={13} />
                            {progress > 0 && progress < 100 ? 'Continue' : progress === 100 ? 'Review' : 'Start'}
                          </Link>
                        ) : priceStr && course.isSoldIndividually ? (
                          // Individually sold — consistent URL between grid and list
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-base font-bold text-navy">{priceStr}</p>
                              <p className="text-xs text-royal/40">one-time</p>
                            </div>
                            <Link href={`/student/courses/${course.id}`} className="btn-primary text-xs px-4 py-2">
                              Buy
                            </Link>
                          </div>
                        ) : (
                          // Package-only — clean "Get via package" label with count, no truncated package name
                          <PackageCtaButton courseId={course.id} courseToPackages={courseToPackages} />
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* List view */}
          {filtered.length > 0 && view === 'list' && (
            <Card padding="none" className="divide-y divide-cloud">
              {filtered.map(course => {
                const hasAccess = enrolled.has(course.id);
                const progress  = progressMap[course.id] ?? 0;
                const priceStr  = fmtPrice(course.priceAmount, course.priceCurrency);
                // New badge: all courses under 30 days
                const isNew = new Date(course.createdAt).getTime() > nowMs - THIRTY_DAYS_MS;
                // Teacher: name only (no email)
                const teacherDisplay = course.teacher
                  ? course.teacher.name ?? course.teacher.email.split('@')[0]
                  : null;

                const firstPkg = courseToPackages.get(course.id)?.[0];
                // Consistent buy/title URL with grid view
                const unenrolledHref = course.isSoldIndividually
                  ? `/student/courses/${course.id}`
                  : firstPkg ? `/packages/${firstPkg.id}` : '/packages';

                return (
                  <div key={course.id} className="flex items-center gap-4 px-5 py-4 hover:bg-surface transition">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {course.programme && (
                          <Badge variant="active">{course.programme.shortName ?? course.programme.name}</Badge>
                        )}
                        {course.subject && <span className="text-xs text-royal/50">{course.subject.name}</span>}
                        {course.level && <span className="text-xs text-royal/40">· {course.level.name}</span>}
                        {isNew && !hasAccess && (
                          <span className="rounded-full bg-azure/10 px-1.5 py-0.5 text-[10px] font-bold text-azure">New</span>
                        )}
                      </div>
                      {/* Title link — same unenrolledHref logic as grid */}
                      <Link
                        href={hasAccess ? `/student/learn/${course.id}` : unenrolledHref}
                        className="text-sm font-medium text-navy truncate hover:text-azure transition block"
                      >
                        {course.title}
                      </Link>
                      {teacherDisplay && (
                        <p className="text-xs text-royal/40 mt-0.5">
                          {teacherDisplay}
                          <span className="mx-1.5 text-royal/20">·</span>
                          {course._count.modules} modules
                        </p>
                      )}
                      {hasAccess && progress > 0 && (
                        <div className="flex items-center gap-2 mt-1.5">
                          <div className="h-1 flex-1 rounded-full bg-cloud overflow-hidden max-w-[100px]">
                            <div className="h-full rounded-full bg-azure transition-all"
                              style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-[10px] font-bold text-azure">{progress}%</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-3 flex-shrink-0">
                      {hasAccess ? (
                        <>
                          <span className="hidden sm:flex items-center gap-1 text-xs font-medium text-green-600">
                            <Icon name="check" size={12} />
                            {progress > 0 && progress < 100 ? 'In progress' : progress === 100 ? 'Done' : 'Enrolled'}
                          </span>
                          <Link href={`/student/learn/${course.id}`} className="btn-primary text-xs px-3.5 py-2">
                            {progress > 0 ? 'Continue' : 'Start'}
                          </Link>
                        </>
                      ) : priceStr && course.isSoldIndividually ? (
                        // Consistent URL with grid view (was /checkout in list, missing in grid)
                        <>
                          <span className="hidden sm:block text-sm font-bold text-navy">{priceStr}</span>
                          <Link href={`/student/courses/${course.id}`} className="btn-primary text-xs px-3.5 py-2">
                            Buy
                          </Link>
                        </>
                      ) : (
                        // Package-only — clean label consistent with grid
                        <PackageCtaButton courseId={course.id} courseToPackages={courseToPackages} compact />
                      )}
                    </div>
                  </div>
                );
              })}
            </Card>
          )}

          {/* Unenrolled CTA */}
          {enrolled.size === 0 && filtered.length > 0 && (
            <Card className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="text-sm font-semibold text-navy">Ready to start learning?</p>
                <p className="text-xs text-royal/50 mt-0.5">Choose a package to unlock access to all courses.</p>
              </div>
              <Link href="/packages" className="flex-shrink-0 btn-primary text-sm px-5 py-2.5 flex items-center gap-2">
                Browse packages <Icon name="arrowRight" size={13} />
              </Link>
            </Card>
          )}
        </div>

      </div>
    </div>
  );
}

// ── PackageCtaButton ──────────────────────────────────────────────────────────
// Replaces the old pattern that truncated long package names inside a small button.
// Now shows a clean "Get via package" label + count badge.
function PackageCtaButton({
  courseId,
  courseToPackages,
  compact = false,
}: {
  courseId: string;
  courseToPackages: Map<string, Package[]>;
  compact?: boolean;
}) {
  const pkgs  = courseToPackages.get(courseId) ?? [];
  const count = pkgs.length;
  const href  = pkgs[0] ? `/packages/${pkgs[0].id}` : '/packages';

  return (
    <Link href={href}
      className={`btn-secondary justify-center gap-2 ${compact ? 'text-xs px-3.5 py-2' : 'w-full'}`}>
      <Icon name="packages" size={12} className="flex-shrink-0" />
      Get via package
      {count > 0 && (
        <span className="flex-shrink-0 rounded-full bg-cloud px-1.5 py-0.5 text-[10px] font-bold text-royal/50">
          {count}
        </span>
      )}
    </Link>
  );
}
