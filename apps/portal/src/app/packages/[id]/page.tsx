'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { SkeletonCard, SkeletonListRow } from '@/components/ui/Skeleton';
import api from '@/lib/api';

interface Course {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  status: string;
  programme: { name: string; shortName: string | null } | null;
  subject:   { name: string } | null;
  teacher:   { name: string | null; email: string } | null;
  _count:    { modules: number; enrollments: number };
}
interface Package {
  id: string; name: string; description: string | null;
  priceAmount: number; currency: string;
  courseIds: string[]; validityDays: number | null;
  categoryTags: string[];
  cohort?: { id: string; name: string } | null;
}
interface ActivePackage { id: string; expiresAt: string | null; }

// Shared price formatter — treats priceAmount as minor units (cents/kobo/pesewas)
// Matches the same helper in /packages/page.tsx
function fmtPrice(amount: number, currency: string) {
  return `${currency} ${(amount / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

const BAND_COLORS = [
  'bg-azure/10 text-azure',
  'bg-purple-100 text-purple-500',
  'bg-emerald-100 text-emerald-500',
  'bg-amber-100 text-amber-500',
  'bg-rose-100 text-rose-500',
  'bg-cyan-100 text-cyan-500',
];
function bandColor(idx: number) { return BAND_COLORS[idx % BAND_COLORS.length]; }

// Scroll-to helper
function scrollTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

export default function PackageDetailPage() {
  const { id }  = useParams<{ id: string }>();
  const router  = useRouter();

  const [pkg,            setPkg]            = useState<Package | null>(null);
  const [courses,        setCourses]        = useState<Course[]>([]);
  const [coursesLoading, setCoursesLoading] = useState(false);
  const [enrolled,       setEnrolled]       = useState<ActivePackage | null>(null);
  const [loading,        setLoading]        = useState(true);
  const [expandedId,     setExpandedId]     = useState<string | null>(null);
  const [showAll,        setShowAll]        = useState(false);

  useEffect(() => {
    Promise.all([
      api.get('/packages').then(r => {
        const found = (r.data ?? []).find((p: Package) => p.id === id);
        if (!found) { router.push('/packages'); return; }
        setPkg(found);
        if (found.courseIds?.length > 0) {
          setCoursesLoading(true);
          api.get('/catalogue/courses').then(cr => {
            const ids = new Set(found.courseIds);
            setCourses((cr.data ?? []).filter((c: Course) => ids.has(c.id)));
          }).catch(() => {}).finally(() => setCoursesLoading(false));
        }
      }).catch(() => router.push('/packages')),
      api.get('/auth/me').then(r => {
        const active: ActivePackage[] = r.data?.activePackages ?? [];
        setEnrolled(active.find(a => a.id === id) ?? null);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, [id, router]);

  // ── Skeleton ──────────────────────────────────────────────────
  if (loading || !pkg) return (
    <div className="flex flex-col min-h-full">
      <div className="flex h-14 items-center border-b border-cloud bg-white px-5 gap-3 animate-pulse">
        <div className="h-6 w-28 rounded-xl bg-cloud" />
        <div className="w-px h-4 bg-cloud mx-1" />
        <div className="h-3 w-40 rounded bg-cloud" />
      </div>
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-4 animate-pulse">
            <div className="h-3 w-20 rounded bg-cloud" />
            <div className="h-9 w-80 rounded-xl bg-cloud" />
            <div className="h-4 w-full max-w-lg rounded bg-cloud" />
            <div className="h-4 w-64 rounded bg-cloud" />
            <div className="flex gap-3 pt-2">
              <div className="h-5 w-24 rounded-full bg-cloud" />
              <div className="h-5 w-24 rounded-full bg-cloud" />
            </div>
            <div className="pt-6 space-y-3">
              {[1,2,3,4,5].map(i => <SkeletonListRow key={i} wide />)}
            </div>
          </div>
          <div className="hidden lg:block pt-0">
            <SkeletonCard lines={7} />
          </div>
        </div>
      </div>
    </div>
  );

  // ── Derived data ──────────────────────────────────────────────
  const byProg: Record<string, Course[]> = {};
  courses.forEach(c => {
    const key = c.programme?.shortName ?? c.programme?.name ?? 'General';
    if (!byProg[key]) byProg[key] = [];
    byProg[key].push(c);
  });
  const multiProg = Object.keys(byProg).length > 1;

  // Teachers — show name only, not email (privacy)
  const teachers = Array.from(
    new Map(courses.filter(c => c.teacher).map(c => [c.teacher!.email, c.teacher!])).values()
  ).slice(0, 5);

  const totalEnrolled = courses.reduce((s, c) => s + (c._count?.enrollments ?? 0), 0);

  // Separate published vs coming-soon for the accurate count display
  const publishedCourses  = courses.filter(c => c.status === 'PUBLISHED');
  const comingSoonCount   = (pkg.courseIds?.length ?? 0) - publishedCourses.length;

  const features = [
    `${pkg.courseIds?.length ?? 0} courses included`,
    pkg.validityDays ? `${pkg.validityDays} days full access` : 'Lifetime access',
    'Certificate on completion',
    'Expert-led content',
    'Quizzes and graded assignments',
    ...(pkg.cohort ? [`Cohort: ${pkg.cohort.name}`] : ['Live session access']),
  ];

  const hasInstructors = teachers.length > 0;

  // showAll logic fix:
  // - When multiProg (grouped view): always show all courses — slice would cause
  //   some programmes to appear empty. No "show more/less" in grouped mode.
  // - When single programme: limit to first 6, with toggle button.
  const PREVIEW_COUNT = 6;
  const singleProgCourses = !multiProg ? courses : [];
  const visibleSingleProg = !multiProg && !showAll
    ? singleProgCourses.slice(0, PREVIEW_COUNT)
    : singleProgCourses;

  const isExpiringSoon = enrolled?.expiresAt
    ? (new Date(enrolled.expiresAt).getTime() - Date.now()) < 7 * 24 * 60 * 60 * 1000
    : false;

  return (
    <div className="flex flex-col min-h-full bg-surface">

      {/* ── Sticky nav header ── */}
      <header className="flex h-14 items-center border-b border-cloud bg-white px-5 gap-3 sticky top-0 z-20">
        <Link href="/packages"
          className="inline-flex items-center gap-1.5 text-sm text-royal/60 hover:text-navy transition">
          <Icon name="arrowLeft" size={14} /> All packages
        </Link>
        <div className="h-4 w-px bg-cloud mx-1" />
        <span className="text-sm text-royal/40 truncate">{pkg.name}</span>
      </header>

      <div className="flex-1 max-w-5xl mx-auto w-full px-5 sm:px-8 pb-36 lg:pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 items-start">

          {/* ══════════════════════════════════════
              LEFT COL — hero + all content
          ══════════════════════════════════════ */}
          <div className="lg:col-span-2">

            {/* ── Hero ── */}
            <div className="py-8 sm:py-10 border-b border-cloud">
              {pkg.categoryTags?.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  {pkg.categoryTags.map(tag => (
                    <Badge key={tag} variant="active">{tag}</Badge>
                  ))}
                </div>
              )}

              <h1 className="text-2xl sm:text-3xl font-bold text-navy leading-snug">
                {pkg.name}
              </h1>

              {pkg.description && (
                <p className="mt-2 text-sm text-royal/50 max-w-2xl leading-relaxed">
                  {pkg.description}
                </p>
              )}

              {/* Stats */}
              <div className="flex flex-wrap items-center gap-5 mt-4 text-sm text-royal/50">
                <span className="flex items-center gap-1.5">
                  <Icon name="courses" size={14} className="text-royal/40" />
                  {pkg.courseIds?.length ?? 0} courses
                </span>
                <span className="flex items-center gap-1.5">
                  <Icon name="clock" size={14} className="text-royal/40" />
                  {pkg.validityDays ? `${pkg.validityDays} days access` : 'Lifetime access'}
                </span>
                {pkg.cohort && (
                  <span className="flex items-center gap-1.5 text-azure font-medium">
                    <Icon name="mentorship" size={14} className="text-azure" />
                    Cohort: {pkg.cohort.name}
                  </span>
                )}
                {totalEnrolled > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Icon name="graduate" size={14} className="text-royal/40" />
                    {totalEnrolled.toLocaleString()} enrolled
                  </span>
                )}
                {enrolled && (
                  <span className="flex items-center gap-1.5 text-green-600 font-medium">
                    <Icon name="check" size={14} /> You have access
                  </span>
                )}
              </div>
            </div>

            {/* ── Quick scroll nav — jump to sections ── */}
            <nav className="flex items-center gap-1 py-3 border-b border-cloud overflow-x-auto -mx-1 px-1">
              <button onClick={() => scrollTo('section-learn')}
                className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium text-royal/60 hover:text-navy hover:bg-cloud transition">
                What you&apos;ll learn
              </button>
              <button onClick={() => scrollTo('section-content')}
                className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium text-royal/60 hover:text-navy hover:bg-cloud transition">
                Course content
              </button>
              {pkg.categoryTags?.length > 0 && (
                <button onClick={() => scrollTo('section-topics')}
                  className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium text-royal/60 hover:text-navy hover:bg-cloud transition">
                  Topics covered
                </button>
              )}
              {hasInstructors && (
                <button onClick={() => scrollTo('section-instructors')}
                  className="flex-shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium text-royal/60 hover:text-navy hover:bg-cloud transition">
                  Instructor{teachers.length > 1 ? 's' : ''}
                </button>
              )}
            </nav>

            {/* ── Body content ── */}
            <div className="py-8 space-y-10">

              {/* What you'll learn */}
              <section id="section-learn">
                <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-4">
                  What you&apos;ll learn
                </p>
                <Card>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {features.map(f => (
                      <li key={f} className="flex items-start gap-3 text-sm text-royal/60">
                        <Icon name="check" size={15} className="text-azure flex-shrink-0 mt-0.5" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>

              {/* Course content */}
              <section id="section-content">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-azure">
                      Course content
                    </p>
                    {/* Accurate count: published available + coming soon separate */}
                    <p className="text-sm text-royal/50 mt-0.5">
                      {publishedCourses.length} course{publishedCourses.length !== 1 ? 's' : ''} available
                      {comingSoonCount > 0 && (
                        <span className="text-amber-500 font-medium"> · {comingSoonCount} coming soon</span>
                      )}
                    </p>
                  </div>
                  {courses.length > 0 && (
                    <span className="text-xs text-royal/40">
                      {courses.reduce((s, c) => s + c._count.modules, 0)} total modules
                    </span>
                  )}
                </div>

                {coursesLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => <SkeletonListRow key={i} wide />)}
                  </div>
                ) : courses.length === 0 && pkg.courseIds?.length > 0 ? (
                  <Card className="px-5 py-8 text-center">
                    <Icon name="courses" size={28} className="text-royal/20 mx-auto mb-2" />
                    <p className="text-sm text-royal/40">Course details unavailable</p>
                  </Card>
                ) : courses.length === 0 ? (
                  <Card className="px-5 py-8 text-center">
                    <p className="text-sm text-royal/40">No courses added yet.</p>
                  </Card>
                ) : (
                  <>
                    <Card padding="none" className="overflow-hidden divide-y divide-cloud">
                      {multiProg ? (
                        // Grouped by programme — always show all (no slice in grouped mode
                        // to avoid empty sections when the first 6 all belong to one programme)
                        Object.entries(byProg).map(([prog, progCourses]) => (
                          <div key={prog}>
                            <div className="px-5 py-2.5 bg-surface border-b border-cloud">
                              <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40">{prog}</p>
                            </div>
                            {progCourses.map((course, idx) => {
                              const isExpanded = expandedId === course.id;
                              const globalIdx  = courses.indexOf(course);
                              return <CourseRow
                                key={course.id}
                                course={course}
                                isExpanded={isExpanded}
                                colorIdx={globalIdx >= 0 ? globalIdx : idx}
                                onToggle={() => setExpandedId(isExpanded ? null : course.id)}
                              />;
                            })}
                          </div>
                        ))
                      ) : (
                        // Single programme — apply show-more limit
                        visibleSingleProg.map((course, idx) => {
                          const isExpanded = expandedId === course.id;
                          return <CourseRow
                            key={course.id}
                            course={course}
                            isExpanded={isExpanded}
                            colorIdx={idx}
                            onToggle={() => setExpandedId(isExpanded ? null : course.id)}
                          />;
                        })
                      )}
                    </Card>

                    {!multiProg && courses.length > PREVIEW_COUNT && (
                      <button
                        onClick={() => setShowAll(v => !v)}
                        className="mt-3 flex items-center gap-1.5 text-sm font-medium text-azure hover:text-royal transition"
                      >
                        <Icon
                          name="chevronDown"
                          size={14}
                          className={showAll ? 'rotate-180 transition-transform' : 'transition-transform'}
                        />
                        {showAll ? 'Show less' : `Show all ${courses.length} courses`}
                      </button>
                    )}
                  </>
                )}
              </section>

              {/* Topics covered — renamed from "Who this is for" which misused tags as audience sentences */}
              {pkg.categoryTags?.length > 0 && (
                <section id="section-topics">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-4">
                    Topics covered
                  </p>
                  <Card>
                    <div className="flex flex-wrap gap-2">
                      {pkg.categoryTags.map(tag => (
                        <Link key={tag} href={`/packages?tag=${encodeURIComponent(tag)}`}>
                          <Badge variant="active" className="cursor-pointer hover:border-azure transition">
                            {tag}
                          </Badge>
                        </Link>
                      ))}
                    </div>
                  </Card>
                </section>
              )}

              {/* Instructors — name only, email removed (privacy on public sales page) */}
              {hasInstructors && (
                <section id="section-instructors">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-4">
                    Your instructor{teachers.length > 1 ? 's' : ''}
                  </p>
                  <div className="space-y-3">
                    {teachers.map(t => (
                      <Card key={t.email} className="flex items-center gap-4 p-4">
                        <div className="w-12 h-12 rounded-full bg-azure/10 flex items-center justify-center text-sm font-bold text-azure flex-shrink-0">
                          {(t.name ?? t.email)[0].toUpperCase()}
                        </div>
                        <div>
                          {/* Email removed — only show display name (privacy) */}
                          <p className="text-sm font-semibold text-navy">
                            {t.name ?? t.email.split('@')[0]}
                          </p>
                          <p className="text-xs text-royal/40">Instructor</p>
                        </div>
                      </Card>
                    ))}
                  </div>
                </section>
              )}

            </div>
          </div>

          {/* ══════════════════════════════════════
              RIGHT COL — sticky sidebar
          ══════════════════════════════════════ */}
          <div className="hidden lg:block">
            <div className="sticky top-20 pt-8 space-y-4">

              <Card className="overflow-hidden">
                {/* Price header */}
                <div className="px-6 pt-6 pb-5 border-b border-cloud">
                  <p className="text-3xl font-bold text-navy leading-none">
                    {fmtPrice(pkg.priceAmount, pkg.currency)}
                  </p>
                  <p className="text-xs text-royal/40 mt-1">
                    {pkg.validityDays ? `${pkg.validityDays} days full access` : 'Lifetime access'}
                  </p>
                </div>

                {/* CTA */}
                <div className="px-6 py-5 space-y-3">
                  {enrolled ? (
                    <>
                      <div className={`flex items-center gap-2.5 rounded-xl px-3.5 py-3 ${
                        isExpiringSoon
                          ? 'bg-amber-50 border border-amber-200'
                          : 'bg-green-50 border border-green-100'
                      }`}>
                        <Icon name={isExpiringSoon ? 'clock' : 'check'} size={14}
                          className={`flex-shrink-0 ${isExpiringSoon ? 'text-amber-500' : 'text-green-500'}`} />
                        <div>
                          <p className={`text-xs font-semibold ${isExpiringSoon ? 'text-amber-700' : 'text-green-700'}`}>
                            {isExpiringSoon ? 'Access expiring soon' : 'You have active access'}
                          </p>
                          {enrolled.expiresAt && (
                            <p className={`text-xs mt-0.5 ${isExpiringSoon ? 'text-amber-600' : 'text-green-600'}`}>
                              Until {new Date(enrolled.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                            </p>
                          )}
                        </div>
                      </div>
                      <Link href="/student/courses" className="btn-primary w-full justify-center">
                        <Icon name="play" size={14} /> Go to my courses
                      </Link>
                      {isExpiringSoon && (
                        <Link href={`/packages/${pkg.id}/checkout`} className="btn-secondary w-full justify-center text-amber-600 border-amber-200 hover:bg-amber-50">
                          Renew access
                        </Link>
                      )}
                    </>
                  ) : (
                    <>
                      <Link href={`/packages/${pkg.id}/checkout`} className="btn-primary w-full justify-center py-3">
                        Enroll now
                      </Link>
                      <p className="text-center text-xs text-royal/40">
                        Instant access after payment
                      </p>
                    </>
                  )}
                </div>

                {/* Feature list */}
                <div className="px-6 pb-5 space-y-2.5 border-t border-cloud pt-4">
                  {features.map(f => (
                    <div key={f} className="flex items-center gap-2 text-xs text-royal/50">
                      <Icon name="check" size={12} className="text-azure flex-shrink-0" /> {f}
                    </div>
                  ))}
                </div>

                {/* Trust footer */}
                <div className="px-6 pb-5 text-center space-y-1 border-t border-cloud pt-4">
                  <p className="flex items-center justify-center gap-1.5 text-xs text-royal/40">
                    <Icon name="shield" size={12} /> 256-bit SSL · Secure payment
                  </p>
                </div>
              </Card>

              {/* Removed duplicate "Categories" card — tags already shown in hero badges */}

            </div>
          </div>

        </div>
      </div>

      {/* ── Mobile sticky CTA — with enrolled state and expiry info ── */}
      <div className="lg:hidden fixed bottom-16 inset-x-0 bg-white border-t border-cloud px-5 py-4 z-40 shadow-lg">
        <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
          <div className="min-w-0">
            <p className="text-base font-bold text-navy">{fmtPrice(pkg.priceAmount, pkg.currency)}</p>
            {enrolled ? (
              <p className={`text-xs mt-0.5 ${isExpiringSoon ? 'text-amber-600 font-medium' : 'text-green-600'}`}>
                {isExpiringSoon ? 'Expires ' : 'Access until '}
                {enrolled.expiresAt
                  ? new Date(enrolled.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
                  : 'Active'}
              </p>
            ) : (
              <p className="text-xs text-royal/40">
                {pkg.validityDays ? `${pkg.validityDays} days access` : 'Lifetime access'}
              </p>
            )}
          </div>
          {enrolled ? (
            <Link href="/student/courses" className="btn-primary flex-shrink-0 text-sm px-4 py-2.5">
              <Icon name="play" size={13} /> My courses
            </Link>
          ) : (
            <Link href={`/packages/${pkg.id}/checkout`} className="btn-primary flex-shrink-0 text-sm px-4 py-2.5">
              Enroll now
            </Link>
          )}
        </div>
      </div>

    </div>
  );
}


// ── Extracted CourseRow component to reduce duplication between grouped/flat render ──
function CourseRow({ course, isExpanded, colorIdx, onToggle }: {
  course: Course;
  isExpanded: boolean;
  colorIdx: number;
  onToggle: () => void;
}) {
  return (
    <div>
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-4 px-5 py-4 hover:bg-surface transition text-left"
      >
        <div className={`flex-shrink-0 w-10 h-10 rounded-xl overflow-hidden flex items-center justify-center ${bandColor(colorIdx)}`}>
          {course.coverUrl
            ? <img src={course.coverUrl} alt="" className="w-full h-full object-cover" />
            : <Icon name="courses" size={18} />
          }
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-navy leading-snug">{course.title}</p>
          <div className="flex flex-wrap items-center gap-2 mt-1">
            {course.subject && (
              <span className="rounded-md bg-cloud px-1.5 py-0.5 text-[10px] font-medium text-royal/60">
                {course.subject.name}
              </span>
            )}
            <span className="text-xs text-royal/40">
              {course._count.modules} module{course._count.modules !== 1 ? 's' : ''}
            </span>
            {course._count.enrollments > 0 && (
              <span className="text-xs text-royal/40">
                · {course._count.enrollments.toLocaleString()} enrolled
              </span>
            )}
            {course.status !== 'PUBLISHED' && (
              <span className="rounded-md bg-amber-50 border border-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                Coming soon
              </span>
            )}
          </div>
        </div>

        <Icon
          name="chevronDown"
          size={14}
          className={`flex-shrink-0 text-royal/30 mt-1 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
        />
      </button>

      {isExpanded && (
        <div className="px-5 pb-5 pl-[76px] bg-surface border-t border-cloud">
          {course.description ? (
            <p className="text-xs text-royal/50 leading-relaxed mt-3">{course.description}</p>
          ) : (
            <p className="text-xs text-royal/30 mt-3">No description available.</p>
          )}
          {/* Teacher name shown without email */}
          {course.teacher?.name && (
            <p className="text-xs text-royal/40 mt-2 flex items-center gap-1.5">
              <Icon name="mentorship" size={11} />
              {course.teacher.name}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
