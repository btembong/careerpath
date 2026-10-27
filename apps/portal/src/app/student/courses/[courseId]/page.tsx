'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { notify } from '@/lib/notify';
import Link from 'next/link';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Icon } from '@/components/ui/Icon';
import { SkeletonCard, SkeletonListRow } from '@/components/ui/Skeleton';
import api from '@/lib/api';

interface Lesson  { id: string; title: string; type: string; durationSecs: number | null; }
interface Module  { id: string; title: string; sortOrder: number; lessons: Lesson[]; }
interface Course {
  id: string; title: string; description: string | null;
  source: 'NATIVE' | 'WORDPRESS'; wpCourseUrl: string | null;
  priceAmount: number | null; priceCurrency: string | null; isSoldIndividually: boolean;
  programme: { name: string; shortName: string | null } | null;
  subject:   { name: string } | null;
  level:     { name: string } | null;
  teacher:   { email: string; name: string | null } | null;
  _count:    { modules: number; enrollments: number };
}

function fmtDuration(secs: number): string {
  const m = Math.round(secs / 60);
  return m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${m % 60}m`;
}

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();

  const [course,    setCourse]    = useState<Course | null>(null);
  const [modules,   setModules]   = useState<Module[]>([]);
  const [hasAccess,    setHasAccess]    = useState(false);
  const [enrollingFree, setEnrollingFree] = useState(false);
  const [expanded,  setExpanded]  = useState<Set<string>>(new Set());
  const [loading,   setLoading]   = useState(true);
  const [backHref,  setBackHref]  = useState('/student/catalogue');
  const [backLabel, setBackLabel] = useState('Catalogue');

  // Determine back-nav destination from referrer
  useEffect(() => {
    const ref = typeof document !== 'undefined' ? document.referrer : '';
    if (ref.includes('/student/courses') && !ref.includes(`/student/courses/${courseId}`)) {
      setBackHref('/student/courses'); setBackLabel('My Library');
    } else if (ref.includes('/packages/')) {
      const m = ref.match(/\/packages\/([^/?#]+)/);
      if (m) { setBackHref(`/packages/${m[1]}`); setBackLabel('Package'); }
    } else if (ref.includes('/student/catalogue')) {
      setBackHref('/student/catalogue'); setBackLabel('Catalogue');
    }
  }, [courseId]);

  useEffect(() => {
    async function load() {
      try {
        const [courseRes, meRes, pkgsRes, cpRes] = await Promise.all([
          api.get(`/platform-courses/${courseId}`),
          api.get('/auth/me').catch(() => ({ data: null })),
          api.get('/packages').catch(() => ({ data: [] })),
          api.get('/portals/student/course-purchases').catch(() => ({ data: [] })),
        ]);

        const c: Course = courseRes.data;
        setCourse(c);

        const activePackages: { id: string }[] = meRes.data?.activePackages ?? [];
        const activePkgIds = new Set(activePackages.map(p => p.id));
        const allPkgs: { id: string; courseIds: string[] }[] = pkgsRes.data ?? [];
        const pkgAccess    = allPkgs.some(p => activePkgIds.has(p.id) && p.courseIds?.includes(courseId));
        const directAccess = (cpRes.data ?? []).some((cp: any) => cp.courseId === courseId);
        const access       = pkgAccess || directAccess;
        setHasAccess(access);

        if (access && c.source !== 'WORDPRESS') {
          api.get(`/platform-courses/${courseId}/progress`)
            .then(r => setModules(r.data?.modules ?? []))
            .catch(() => {});
        }
      } catch {
        router.push('/student/catalogue');
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [courseId, router]);

  function toggleModule(id: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  // ── Skeleton ──────────────────────────────────────────────────
  if (loading || !course) return (
    <div className="flex flex-col min-h-full">
      <div className="flex h-14 items-center border-b border-cloud bg-white px-5 gap-3 animate-pulse">
        <div className="h-6 w-24 rounded-xl bg-cloud" />
        <div className="w-px h-4 bg-cloud mx-1" />
        <div className="h-3 w-48 rounded bg-cloud" />
      </div>
      <div className="max-w-5xl mx-auto px-5 sm:px-8 py-8 w-full">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
          <div className="lg:col-span-2 space-y-4 animate-pulse">
            <div className="flex gap-2">
              <div className="h-5 w-20 rounded-md bg-cloud" />
              <div className="h-5 w-16 rounded-md bg-cloud" />
            </div>
            <div className="h-9 w-2/3 rounded-lg bg-cloud" />
            <div className="h-4 w-full max-w-xl rounded bg-cloud" />
            <div className="flex gap-4 pt-1">
              {[80,64,72,96].map(w => (
                <div key={w} className="h-3 rounded bg-cloud" style={{ width: w }} />
              ))}
            </div>
            <div className="pt-6 space-y-3">
              {[1,2,3,4,5].map(i => <SkeletonListRow key={i} wide />)}
            </div>
          </div>
          <div className="hidden lg:block">
            <SkeletonCard lines={6} />
          </div>
        </div>
      </div>
    </div>
  );

  const price        = course.priceAmount ? Number(course.priceAmount) : null;
  const totalLessons = modules.reduce((n, m) => n + m.lessons.length, 0);
  const totalSecs    = modules.reduce((n, m) => n + m.lessons.reduce((s, l) => s + (l.durationSecs ?? 0), 0), 0);

  const moduleCount = course._count?.modules ?? modules.length;
  const features = [
    `${moduleCount} self-paced module${moduleCount !== 1 ? 's' : ''}`,
    totalLessons > 0
      ? `${totalLessons} lesson${totalLessons !== 1 ? 's' : ''}${totalSecs > 0 ? ` · ${fmtDuration(totalSecs)} total` : ''}`
      : null,
    price ? 'One-time payment · Lifetime access' : 'Lifetime access',
    'Certificate on completion',
    'Graded quizzes and assignments',
    course.teacher
      ? `Taught by ${course.teacher.name ?? course.teacher.email.split('@')[0]}`
      : 'Expert-led instruction',
  ].filter(Boolean) as string[];

  const outcomes = [
    course.programme
      ? `Master ${course.programme.shortName ?? course.programme.name} core concepts`
      : 'Master core concepts through structured modules',
    'Test your knowledge with graded quizzes',
    'Earn a verifiable certificate upon completion',
    'Learn at your own pace, on any device',
  ];

  // WordPress course — redirect to the learn page (which handles countdown + WP enrollment)
  if (course.source === 'WORDPRESS') {
    return (
      <div className="flex flex-col min-h-full bg-surface">
        <header className="flex h-14 items-center border-b border-cloud bg-white px-5 gap-3 sticky top-0 z-20">
          <Link href={backHref}
            className="inline-flex items-center gap-1.5 text-sm text-royal/60 hover:text-navy transition">
            <Icon name="arrowLeft" size={14} /> {backLabel}
          </Link>
          <div className="h-4 w-px bg-cloud mx-1" />
          <span className="text-sm text-royal/40 truncate">{course.title}</span>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-azure/10 mb-5">
            <Icon name="courses" size={28} className="text-azure" />
          </div>
          <div className="flex items-center gap-2 mb-3">
            {course.programme && (
              <Badge variant="active">{course.programme.shortName ?? course.programme.name}</Badge>
            )}
            <Badge variant="muted">Free access</Badge>
          </div>
          <h1 className="text-2xl font-black text-navy leading-snug mb-3">{course.title}</h1>
          {course.description && (
            <p className="text-sm text-royal/60 leading-relaxed mb-6">{course.description}</p>
          )}
          <div className="flex items-center gap-3 text-xs text-royal/40 mb-8">
            <span className="flex items-center gap-1.5">
              <Icon name="graduate" size={13} /> {(course._count?.enrollments ?? 0).toLocaleString()} enrolled
            </span>
            {course.teacher && (
              <>
                <span>·</span>
                <span>{course.teacher.name ?? course.teacher.email.split('@')[0]}</span>
              </>
            )}
          </div>
          <Link href={`/student/learn/${courseId}`}
            className="inline-flex items-center gap-2 rounded-xl bg-azure px-7 py-3 text-sm font-bold text-white hover:bg-royal transition">
            <Icon name="play" size={14} /> Start this course
          </Link>
          <p className="mt-3 text-xs text-royal/40">
            Hosted on the CareerPath Africa learning platform
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full bg-surface">

      {/* ── Sticky nav ── */}
      <header className="flex h-14 items-center border-b border-cloud bg-white px-5 gap-3 sticky top-0 z-20">
        <Link href="/student/catalogue"
          className="inline-flex items-center gap-1.5 text-sm text-royal/60 hover:text-navy transition">
          <Icon name="arrowLeft" size={14} /> Catalogue
        </Link>
        <div className="h-4 w-px bg-cloud mx-1" />
        <span className="text-sm text-royal/40 truncate">{course.title}</span>
      </header>

      {/* ── Single grid — hero + body left, sidebar right ── */}
      <div className="flex-1 max-w-5xl mx-auto w-full px-5 sm:px-8 pb-36 lg:pb-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-10 items-start">

          {/* ══════════════════════════════════════
              LEFT COL — hero + all content
          ══════════════════════════════════════ */}
          <div className="lg:col-span-2">

            {/* ── Hero ── */}
            <div className="py-8 sm:py-10 border-b border-cloud">
              <div className="flex items-center gap-2 flex-wrap mb-3">
                {course.programme && (
                  <Badge variant="active">{course.programme.shortName ?? course.programme.name}</Badge>
                )}
                {course.subject && <Badge variant="default">{course.subject.name}</Badge>}
                {course.level   && <Badge variant="default">{course.level.name}</Badge>}
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold text-navy leading-snug">
                {course.title}
              </h1>

              {course.description && (
                <p className="mt-2 text-sm text-royal/50 max-w-2xl leading-relaxed">
                  {course.description}
                </p>
              )}

              <div className="flex flex-wrap items-center gap-5 mt-4 text-sm text-royal/50">
                <span className="flex items-center gap-1.5">
                  <Icon name="courses" size={14} className="text-royal/40" />
                  {moduleCount} modules
                </span>
                {totalLessons > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Icon name="play" size={14} className="text-royal/40" />
                    {totalLessons} lessons
                  </span>
                )}
                {totalSecs > 0 && (
                  <span className="flex items-center gap-1.5">
                    <Icon name="clock" size={14} className="text-royal/40" />
                    {fmtDuration(totalSecs)} total
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Icon name="graduate" size={14} className="text-royal/40" />
                  {(course._count?.enrollments ?? 0).toLocaleString()} enrolled
                </span>
                {hasAccess && (
                  <span className="flex items-center gap-1.5 text-green-600 font-medium">
                    <Icon name="check" size={14} /> Enrolled
                  </span>
                )}
              </div>

              {course.teacher && (
                <div className="flex items-center gap-3 mt-5">
                  <div className="w-9 h-9 rounded-full bg-azure/10 flex items-center justify-center text-sm font-bold text-azure flex-shrink-0">
                    {(course.teacher.name ?? course.teacher.email)[0].toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-navy">
                      {course.teacher.name ?? course.teacher.email.split('@')[0]}
                    </p>
                    {course.teacher.name && (
                      <p className="text-xs text-royal/40">{course.teacher.email}</p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* ── Body ── */}
            <div className="py-8 space-y-10">

              {/* What you'll learn */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-4">
                  What you&apos;ll learn
                </p>
                <Card>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {outcomes.map(o => (
                      <li key={o} className="flex items-start gap-3 text-sm text-royal/60">
                        <Icon name="check" size={15} className="text-azure flex-shrink-0 mt-0.5" />
                        {o}
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>

              {/* Course outline */}
              <section>
                <div className="flex items-center justify-between mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-azure">
                    Course outline
                  </p>
                  {totalLessons > 0 && (
                    <span className="text-xs text-royal/40">
                      {totalLessons} lessons · {fmtDuration(totalSecs)}
                    </span>
                  )}
                </div>

                {modules.length > 0 ? (
                  <Card padding="none" className="overflow-hidden divide-y divide-cloud">
                    {modules.map(mod => {
                      const open    = expanded.has(mod.id);
                      const modSecs = mod.lessons.reduce((s, l) => s + (l.durationSecs ?? 0), 0);
                      return (
                        <div key={mod.id}>
                          <button
                            onClick={() => toggleModule(mod.id)}
                            className="w-full flex items-center gap-4 px-5 py-4 hover:bg-surface transition text-left"
                          >
                            <Icon
                              name="chevronDown"
                              size={14}
                              className={`text-royal/40 flex-shrink-0 transition-transform ${open ? 'rotate-0' : '-rotate-90'}`}
                            />
                            <span className="flex-1 text-sm font-semibold text-navy">{mod.title}</span>
                            <span className="text-xs text-royal/40 flex-shrink-0">
                              {mod.lessons.length} lesson{mod.lessons.length !== 1 ? 's' : ''}
                              {modSecs > 0 && ` · ${fmtDuration(modSecs)}`}
                            </span>
                          </button>

                          {open && mod.lessons.length > 0 && (
                            <div className="divide-y divide-cloud bg-surface/60">
                              {mod.lessons.map(lesson => (
                                <div key={lesson.id} className="flex items-center gap-3 px-5 py-3 pl-[52px]">
                                  <Icon
                                    name={lesson.type === 'VIDEO' ? 'play' : 'courses'}
                                    size={13}
                                    className="text-royal/30 flex-shrink-0"
                                  />
                                  <span className="flex-1 text-sm text-royal/60 truncate">{lesson.title}</span>
                                  {lesson.durationSecs && (
                                    <span className="text-xs text-royal/40 flex-shrink-0">
                                      {fmtDuration(lesson.durationSecs)}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </Card>
                ) : (
                  <Card>
                    <p className="text-sm text-royal/50 mb-4">
                      This course has{' '}
                      <span className="font-semibold text-navy">{moduleCount} modules</span>.
                      Enroll to unlock the full outline.
                    </p>
                    <div className="space-y-2.5">
                      {Array.from({ length: Math.min(moduleCount, 5) }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 opacity-40 select-none">
                          <div className="w-4 h-4 rounded bg-cloud flex-shrink-0" />
                          <div className={`h-3 rounded bg-cloud ${[' w-2/3',' w-1/2',' w-3/5',' w-2/5',' w-1/3'][i] ?? ' w-1/2'}`} />
                        </div>
                      ))}
                      {moduleCount > 5 && (
                        <p className="text-xs text-royal/30 pl-7">
                          + {moduleCount - 5} more modules
                        </p>
                      )}
                    </div>
                  </Card>
                )}
              </section>

              {/* Everything included */}
              <section>
                <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-4">
                  Everything included
                </p>
                <Card>
                  <ul className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {features.map(f => (
                      <li key={f} className="flex items-center gap-3 text-sm text-royal/60">
                        <Icon name="check" size={14} className="text-azure flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>

              {/* Instructor */}
              {course.teacher && (
                <section>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-4">
                    Your instructor
                  </p>
                  <Card className="flex items-center gap-4 p-5">
                    <div className="w-14 h-14 rounded-full bg-azure/10 flex items-center justify-center text-lg font-bold text-azure flex-shrink-0">
                      {(course.teacher.name ?? course.teacher.email)[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-navy">
                        {course.teacher.name ?? course.teacher.email.split('@')[0]}
                      </p>
                      <p className="text-xs text-royal/40 mt-0.5">{course.teacher.email}</p>
                    </div>
                  </Card>
                </section>
              )}

              {/* Package upsell */}
              {!hasAccess && price && (
                <Card className="flex items-start gap-4 p-5">
                  <div className="w-10 h-10 rounded-xl bg-azure/10 flex items-center justify-center flex-shrink-0">
                    <Icon name="packages" size={18} className="text-azure" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy">Want more for less?</p>
                    <p className="text-xs text-royal/50 mt-1 leading-relaxed">
                      Our packages bundle this course with others, live sessions and mentorship — often at a lower total price.
                    </p>
                  </div>
                  <Link href="/packages" className="btn-secondary text-xs px-3 py-1.5 flex-shrink-0 whitespace-nowrap">
                    View packages
                  </Link>
                </Card>
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
                  {hasAccess ? (
                    <div className="flex items-center gap-2.5 rounded-xl bg-green-50 border border-green-100 px-3.5 py-3">
                      <Icon name="check" size={14} className="text-green-500 flex-shrink-0" />
                      <p className="text-xs font-semibold text-green-700">You&apos;re enrolled</p>
                    </div>
                  ) : price ? (
                    <>
                      <p className="text-3xl font-bold text-navy leading-none">
                        {course.priceCurrency} {price.toLocaleString()}
                      </p>
                      <p className="text-xs text-royal/40 mt-1">One-time · Lifetime access</p>
                    </>
                  ) : (
                    <>
                      <p className="text-sm font-semibold text-navy">Available via package</p>
                      <p className="text-xs text-royal/40 mt-1">Not sold individually</p>
                    </>
                  )}
                </div>

                {/* CTA */}
                <div className="px-6 py-5 space-y-2.5">
                  {hasAccess ? (
                    <Link href={`/student/learn/${courseId}`} className="btn-primary w-full justify-center py-3">
                      <Icon name="play" size={14} /> Continue learning
                    </Link>
                  ) : course.isSoldIndividually && !price ? (
                    <button
                      disabled={enrollingFree}
                      onClick={async () => {
                        setEnrollingFree(true);
                        try {
                          await api.post(`/payments/enroll-free/${courseId}`);
                          setHasAccess(true);
                          notify.success('Enrolled! You now have access.');
                        } catch (e: any) {
                          notify.error(e.response?.data?.message ?? 'Enrollment failed.');
                        } finally { setEnrollingFree(false); }
                      }}
                      className="btn-primary w-full justify-center py-3 disabled:opacity-70">
                      {enrollingFree ? 'Enrolling…' : 'Enroll free'}
                    </button>
                  ) : course.isSoldIndividually && price ? (
                    <>
                      <Link href={`/student/courses/${courseId}/checkout`} className="btn-primary w-full justify-center py-3">
                        Buy this course
                      </Link>
                      <Link href="/packages" className="btn-secondary w-full justify-center">
                        Or enroll via package
                      </Link>
                    </>
                  ) : (
                    <Link href="/packages" className="btn-primary w-full justify-center py-3">
                      Get via package
                    </Link>
                  )}
                  {!hasAccess && (
                    <p className="text-center text-xs text-royal/40">
                      {course.isSoldIndividually
                        ? 'Instant access after payment'
                        : 'Part of our learning packages'}
                    </p>
                  )}
                </div>

                {/* Feature list */}
                <div className="px-6 pb-5 border-t border-cloud pt-4 space-y-2.5">
                  {features.slice(0, 5).map(f => (
                    <div key={f} className="flex items-center gap-2 text-xs text-royal/50">
                      <Icon name="check" size={12} className="text-azure flex-shrink-0" /> {f}
                    </div>
                  ))}
                </div>

                {!hasAccess && (
                  <div className="px-6 pb-5 border-t border-cloud pt-4 text-center">
                    <p className="flex items-center justify-center gap-1.5 text-xs text-royal/40">
                      <Icon name="shield" size={12} /> 256-bit SSL · Secure payment
                    </p>
                  </div>
                )}
              </Card>

            </div>
          </div>

        </div>
      </div>

      {/* ── Mobile sticky CTA ── sits above bottom nav (z-50) */}
      <div className="lg:hidden fixed bottom-16 inset-x-0 bg-white border-t border-cloud px-5 py-4 z-40 shadow-lg">
        <div className="flex items-center justify-between gap-4 max-w-lg mx-auto">
          {hasAccess ? (
            <Link href={`/student/learn/${courseId}`} className="btn-primary w-full justify-center gap-2">
              <Icon name="play" size={14} /> Continue learning
            </Link>
          ) : price ? (
            <>
              <div>
                <p className="text-base font-bold text-navy">
                  {course.priceCurrency} {price.toLocaleString()}
                </p>
                <p className="text-xs text-royal/40">One-time · Lifetime access</p>
              </div>
              {course.isSoldIndividually ? (
                <Link href={`/student/courses/${courseId}/checkout`} className="btn-primary flex-shrink-0 text-sm px-4 py-2.5">
                  Buy now
                </Link>
              ) : (
                <Link href="/packages" className="btn-primary flex-shrink-0 text-sm px-4 py-2.5">
                  Get via package
                </Link>
              )}
            </>
          ) : (
            <Link href="/packages" className="btn-primary w-full justify-center">
              Get via package
            </Link>
          )}
        </div>
      </div>

    </div>
  );
}
