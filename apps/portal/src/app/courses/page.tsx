'use client';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Cookies from 'js-cookie';
import { Icon } from '@/components/ui/Icon';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { SkeletonCard } from '@/components/ui/Skeleton';
import api from '@/lib/api';
import { CourseCover } from '@/components/courses/CourseCover';

interface Course {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  source: 'NATIVE' | 'WORDPRESS';
  priceAmount: number | null;
  priceCurrency: string | null;
  isSoldIndividually: boolean;
  programme: { id: string; name: string; shortName: string | null } | null;
  subject:   { id: string; name: string } | null;
  level:     { id: string; name: string } | null;
  teacher:   { id: string; email: string; name: string | null };
  _count:    { modules: number; enrollments: number };
}
interface Package {
  id: string; name: string;
  courseIds: string[];
}

export default function PublicCoursesPage() {
  const [courses,    setCourses]    = useState<Course[]>([]);
  const [packages,   setPackages]   = useState<Package[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [search,     setSearch]     = useState('');
  const [filter,     setFilter]     = useState<'ALL' | 'BUYABLE'>('BUYABLE');
  const [activeProg, setActiveProg] = useState<string>('ALL');

  // Coming from a programme on the home page: open on it
  useEffect(() => {
    const p = new URLSearchParams(window.location.search).get('programme');
    if (p) { setActiveProg(p); setFilter('ALL'); }
  }, []);

  const isLoggedIn = !!Cookies.get('cpa_token');

  useEffect(() => {
    Promise.all([
      api.get('/catalogue/courses').then(r => setCourses(r.data ?? [])).catch(() => {}),
      api.get('/packages').then(r => setPackages(r.data ?? [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  // Map courseId → all packages that contain it
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

  // Extract unique programmes from courses
  const programmes = useMemo(() => {
    const map = new Map<string, { id: string; name: string; shortName: string | null }>();
    courses.forEach(c => {
      if (c.programme && !map.has(c.programme.id)) map.set(c.programme.id, c.programme);
    });
    return Array.from(map.values());
  }, [courses]);

  const visible = courses.filter(c => {
    const matchSearch = !search || c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.programme?.name.toLowerCase().includes(search.toLowerCase()) ||
      c.subject?.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'BUYABLE' ? (c.isSoldIndividually || c.source === 'WORDPRESS') : true;
    const matchProg   = activeProg === 'ALL' || c.programme?.id === activeProg;
    return matchSearch && matchFilter && matchProg;
  });

  function buyHref(courseId: string) {
    if (isLoggedIn) return `/student/courses/${courseId}`;
    return `/login?next=${encodeURIComponent(`/student/courses/${courseId}`)}`;
  }

  if (loading) return (
    <div className="min-h-screen bg-surface">
      <div className="max-w-6xl mx-auto px-4 py-10">
        <div className="h-8 w-48 bg-cloud rounded animate-pulse mb-6" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {[0,1,2,3,4,5].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <div className="bg-navy px-6 py-10 text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-2">Individual Courses</p>
        <h1 className="text-3xl font-black text-white mb-3">Buy a single course</h1>
        <p className="text-sm text-white/50 max-w-md mx-auto">
          Pay once, learn at your own pace. Lifetime access to the course, quizzes, and certificate.
        </p>
        <div className="mt-6 flex justify-center gap-3 flex-wrap">
          {!isLoggedIn && (
            <Link href={`/register?next=${encodeURIComponent('/student/catalogue')}`}
              className="inline-flex items-center gap-2 rounded-xl bg-azure px-5 py-2.5 text-sm font-bold text-white hover:bg-royal transition">
              Create account
            </Link>
          )}
        </div>
      </div>

      {/* Package cross-link callout */}
      <div className="bg-azure/5 border-b border-azure/20 px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-azure/10">
              <Icon name="packages" size={14} className="text-azure" />
            </div>
            <p className="text-xs text-navy">
              <span className="font-semibold">Want live classes, mentorship &amp; more?</span>
              {' '}Our packages bundle multiple courses at a better price.
            </p>
          </div>
          <Link href="/packages"
            className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-lg border border-azure px-3 py-1.5 text-xs font-bold text-azure hover:bg-azure hover:text-white transition">
            Browse packages <Icon name="arrowRight" size={11} />
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="sticky top-0 z-10 bg-white border-b border-cloud px-4 py-3">
        <div className="max-w-5xl mx-auto flex items-center gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Icon name="search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-royal/30" />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search courses…"
              className="w-full rounded-lg border border-cloud bg-surface pl-9 pr-3 py-2 text-xs text-navy placeholder:text-royal/30 focus:outline-none focus:border-azure transition"
            />
          </div>
          <div className="flex gap-1.5">
            {([['BUYABLE', 'Individually accessible'], ['ALL', 'Browse all']] as const).map(([f, label]) => (
              <button key={f}
                onClick={() => setFilter(f)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  filter === f ? 'bg-azure text-white' : 'bg-cloud text-royal hover:bg-azure/10'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-royal/40 font-semibold ml-auto hidden sm:block">
            {visible.length} course{visible.length !== 1 ? 's' : ''}
          </p>
        </div>

        {/* Programme filter chips */}
        {programmes.length > 1 && (
          <div className="max-w-5xl mx-auto flex items-center gap-2 flex-wrap pt-2 pb-1 px-4">
            {[{ id: 'ALL', shortName: null, name: 'All programmes' }, ...programmes].map(p => (
              <button key={p.id} onClick={() => setActiveProg(p.id)}
                className={`rounded-full px-3 py-1 text-xs font-semibold transition border ${
                  activeProg === p.id
                    ? 'bg-azure text-white border-azure'
                    : 'bg-white border-cloud text-royal/60 hover:border-azure/40'
                }`}>
                {p.shortName ?? p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Course grid */}
      <div className="max-w-5xl mx-auto px-4 py-8">
        {visible.length === 0 ? (
          <div className="text-center py-20">
            <Icon name="courses" size={56} className="text-royal/15 mx-auto mb-4" />
            <p className="text-sm font-semibold text-navy">No courses found</p>
            <p className="text-xs text-royal/40 mt-1">Try adjusting your search or filter</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {visible.map(course => (
              <Card key={course.id} padding="none" className="overflow-hidden flex flex-col">
                {/* Cover / colour band */}
                <CourseCover course={course} />

                <div className="flex flex-col flex-1 p-4">
                  {/* Tags */}
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    {course.programme && (
                      <span className="rounded-md bg-azure/10 px-2 py-0.5 text-[10px] font-bold text-azure uppercase tracking-wider">
                        {course.programme.shortName ?? course.programme.name}
                      </span>
                    )}
                    {course.subject && (
                      <span className="rounded-md bg-cloud px-2 py-0.5 text-[10px] font-semibold text-royal">
                        {course.subject.name}
                      </span>
                    )}
                    {course.source === 'WORDPRESS' && (
                      <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-500">WP</span>
                    )}
                  </div>

                  {/* Title */}
                  <Link href={isLoggedIn ? `/student/courses/${course.id}` : `/login?next=${encodeURIComponent(`/student/courses/${course.id}`)}`}
                    className="text-sm font-bold text-navy leading-snug flex-1 mb-2 hover:text-azure transition block">
                    {course.title}
                  </Link>

                  {/* Description */}
                  {course.description && (
                    <p className="text-[11px] text-royal/50 line-clamp-2 mb-3">{course.description}</p>
                  )}

                  {/* Meta */}
                  <div className="flex items-center gap-3 text-[10px] text-royal/40 mb-4">
                    <span className="flex items-center gap-1">
                      <Icon name="notebook" size={10} /> {course._count.modules} module{course._count.modules !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1">
                      <Icon name="graduate" size={10} /> {course._count.enrollments} enrolled
                    </span>
                  </div>

                  {/* CTA */}
                  {course.source === 'WORDPRESS' ? (
                    <div className="flex items-center justify-between gap-2 mt-auto">
                      <Badge variant="active">Free access</Badge>
                      <Link
                        href={isLoggedIn
                          ? `/student/learn/${course.id}`
                          : `/login?next=${encodeURIComponent(`/student/learn/${course.id}`)}`}
                        className="flex items-center gap-1 text-xs font-semibold text-azure hover:text-royal transition">
                        Start learning <Icon name="arrowRight" size={11} />
                      </Link>
                    </div>
                  ) : course.isSoldIndividually && course.priceAmount ? (
                    <div className="flex items-center justify-between gap-2 mt-auto">
                      <div>
                        <p className="text-lg font-black text-navy leading-none">
                          {course.priceCurrency} {course.priceAmount.toLocaleString()}
                        </p>
                        <p className="text-[10px] text-royal/40">one-time</p>
                      </div>
                      <Link href={buyHref(course.id)}
                        className="flex-shrink-0 rounded-xl bg-azure px-4 py-2 text-xs font-bold text-white hover:bg-royal transition">
                        {isLoggedIn ? 'View course' : 'Sign in to buy'}
                      </Link>
                    </div>
                  ) : (() => {
                    const pkgs = courseToPackages.get(course.id) ?? [];
                    const first = pkgs[0];
                    const extra = pkgs.length - 1;
                    return (
                      <div className="flex items-center justify-between gap-2 mt-auto">
                        <Badge variant="muted">In packages</Badge>
                        <Link href={first ? `/packages/${first.id}` : '/packages'}
                          className="flex items-center gap-1 text-xs font-semibold text-azure hover:text-royal transition max-w-[130px]">
                          <Icon name="packages" size={11} className="flex-shrink-0" />
                          <span className="truncate">{first ? first.name : 'View packages'}</span>
                          {extra > 0 && <span className="flex-shrink-0 text-royal/40">+{extra}</span>}
                        </Link>
                      </div>
                    );
                  })()}
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Bottom CTA */}
        <div className="mt-12 rounded-2xl bg-navy px-8 py-8 text-center">
          <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-2">Unlock more</p>
          <h2 className="text-xl font-black text-white mb-2">Get more with a package</h2>
          <p className="text-sm text-white/50 max-w-sm mx-auto mb-5">
            Packages include live instructor sessions, 1-on-1 mentorship, and access to the full course library — all at a better price.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link href="/packages"
              className="inline-flex items-center gap-2 rounded-xl bg-azure px-6 py-3 text-sm font-bold text-white hover:bg-royal transition">
              <Icon name="packages" size={14} /> View packages
            </Link>
            {!isLoggedIn && (
              <Link href={`/register?next=${encodeURIComponent('/student/catalogue')}`}
                className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-6 py-3 text-sm font-semibold text-white/70 hover:bg-white/10 transition">
                Create free account
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
