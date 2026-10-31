'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';

interface ActivePackage { id: string; name: string; expiresAt: string | null; }

interface Lesson {
  id: string;
  title: string;
  type: string;
  durationSecs: number | null;
  isFree?: boolean;
  locked?: boolean;
  passMark?: number | null;
  maxAttempts?: number | null;
  chapters?: { startSec: number; title: string }[] | null;
  progress: { completed: boolean; watchedSecs?: number; positionSecs?: number } | null;
}
interface Module { id: string; title: string; sortOrder: number; lessons: Lesson[]; }
interface CourseDetail {
  id: string;
  title: string;
  description: string | null;
  source: 'NATIVE' | 'WORDPRESS';
  wpCourseUrl: string | null;
  /** Content copied from Tutor: plays in the portal's player like a native course */
  contentImportedAt?: string | null;
  programme: { name: string; shortName: string | null } | null;
  subject: { name: string } | null;
  level: { name: string } | null;
  teacher: { firstName?: string | null; lastName?: string | null; name?: string | null; email: string };
}
interface ProgressData {
  courseId: string;
  hasAccess?: boolean;
  totalLessons: number;
  completedLessons: number;
  percentComplete: number;
  modules: Module[];
}

/* ─── Small helpers ───────────────────────────────────────────────────────── */

function clock(secs: number | null | undefined) {
  if (!secs) return '—';
  return `${Math.floor(secs / 60)}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
}
function minutes(secs: number | null | undefined) {
  if (!secs) return '—';
  return `${Math.max(1, Math.round(secs / 60))} min`;
}

type LessonState = 'done' | 'doing' | 'todo' | 'locked';
function lessonState(l: Lesson): LessonState {
  if (l.locked) return 'locked';
  if (l.progress?.completed) return 'done';
  if ((l.progress?.watchedSecs ?? 0) > 0 || (l.progress?.positionSecs ?? 0) > 0) return 'doing';
  return 'todo';
}
const STATE_LABEL: Record<LessonState, string> = { done: 'Completed', doing: 'In progress', todo: 'Not started', locked: 'Locked' };

const P = {
  play:  'M8 5v14l11-7z',
  text:  'M6 3h9l4 4v14H6zM14 3v5h5M9 13h6M9 17h6',
  quiz:  'M4 4h16v16H4zM8 12l3 3 5-6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  dot:   'M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  ring:  'M12 19a7 7 0 1 0 0-14 7 7 0 0 0 0 14z',
  lock:  'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  book:  'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3M9 7h6',
  badge: 'M12 15a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM8.5 14l-1.5 7 5-3 5 3-1.5-7',
  grid:  'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  layers:'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  user:  'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  mail:  'M3 6h18v12H3zM3 7l9 6 9-6',
  back:  'M19 12H5M11 6l-6 6 6 6',
  alert: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v5M12 16.5v.01',
};

function Glyph({ d, size = 18, fill = 'none', className, strokeWidth = 1.6 }: { d: string; size?: number; fill?: string; className?: string; strokeWidth?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke="currentColor" strokeWidth={strokeWidth}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <path d={d} />
    </svg>
  );
}

const label = 'text-[11px] font-semibold uppercase tracking-[0.06em] text-muted';
const btn = 'inline-flex h-[34px] items-center justify-center gap-2 rounded-md px-3.5 text-[13px] font-semibold transition-colors';
const btnPrimary = `${btn} border border-azure-strong bg-azure-strong text-on-accent hover:brightness-95`;
const btnSecondary = `${btn} border border-line bg-white text-navy hover:bg-subtle`;
const btnDisabled = `${btn} cursor-not-allowed border border-line bg-subtle text-muted`;

/* ─── Page ────────────────────────────────────────────────────────────────── */

export default function StudentCourseLandingPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [course,          setCourse]          = useState<CourseDetail | null>(null);
  const [progress,        setProgress]        = useState<ProgressData | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [accessDenied,    setAccessDenied]    = useState(false);
  const [expiringPackage, setExpiringPackage] = useState<ActivePackage | null>(null);
  const [isDirectPurchase, setIsDirectPurchase] = useState(false);
  const [moduleIdx,       setModuleIdx]       = useState<number | null>(null);
  const [sideTab,         setSideTab]         = useState<'info' | 'teacher'>('info');
  const [mainTab,         setMainTab]         = useState<'lessons' | 'about'>('lessons');

  useEffect(() => {
    async function load() {
      try {
        const [meRes, pkgsRes, cpRes, courseRes] = await Promise.all([
          api.get('/auth/me').catch(() => ({ data: null })),
          api.get('/packages').catch(() => ({ data: [] })),
          api.get('/portals/student/course-purchases').catch(() => ({ data: [] })),
          api.get(`/platform-courses/${courseId}`).catch(() => ({ data: null })),
        ]);

        const courseData: CourseDetail | null = courseRes.data;

        if (courseData?.source === 'WORDPRESS' && !courseData.contentImportedAt) {
          await api.post(`/platform-courses/${courseId}/enroll`).catch(() => {});
          setCourse(courseData);
          setProgress({ courseId, totalLessons: 0, completedLessons: 0, percentComplete: 0, modules: [] });
          return;
        }

        const activePackages: ActivePackage[] = meRes.data?.activePackages ?? [];
        const activePkgIds = new Set(activePackages.map(p => p.id));
        const allPkgs: any[] = pkgsRes.data ?? [];
        const coursePurchases: any[] = cpRes.data ?? [];

        const hasPackageAccess = allPkgs.some(
          p => activePkgIds.has(p.id) && Array.isArray(p.courseIds) && p.courseIds.includes(courseId)
        );
        const directPurchase = coursePurchases.find((cp: any) => cp.courseId === courseId);
        if (!hasPackageAccess && directPurchase) setIsDirectPurchase(true);

        const now = Date.now();
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        if (directPurchase?.expiresAt) {
          const msLeft = new Date(directPurchase.expiresAt).getTime() - now;
          if (msLeft > 0 && msLeft < sevenDays) {
            setExpiringPackage({ id: directPurchase.id, name: 'Your course access', expiresAt: directPurchase.expiresAt });
          }
        } else {
          const pkgWithCourse = allPkgs.find(
            p => activePkgIds.has(p.id) && Array.isArray(p.courseIds) && p.courseIds.includes(courseId)
          );
          const activePkg = activePackages.find(p => p.id === pkgWithCourse?.id);
          if (activePkg?.expiresAt) {
            const msLeft = new Date(activePkg.expiresAt).getTime() - now;
            if (msLeft > 0 && msLeft < sevenDays) setExpiringPackage(activePkg);
          }
        }

        // Website courses are free to join; once imported they play here
        if (courseData?.source === 'WORDPRESS') await api.post(`/platform-courses/${courseId}/enroll`).catch(() => {});

        // The server decides access (package, purchase, school seat or enrolment) — the same check that guards the lessons
        const pr = await api.get(`/platform-courses/${courseId}/progress`);
        const hasFreeLesson = (pr.data.modules as Module[]).some(m => m.lessons.some(l => l.isFree));
        if (!pr.data.hasAccess && !hasFreeLesson) { setAccessDenied(true); return; }
        if (pr.data.hasAccess) await api.post(`/platform-courses/${courseId}/enroll`).catch(() => {});
        setCourse(courseData ?? courseRes.data);
        setProgress(pr.data);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [courseId]);

  const allLessons = useMemo(() => progress?.modules.flatMap(m => m.lessons) ?? [], [progress]);
  const resumeLesson = allLessons.find(l => !l.locked && !l.progress?.completed) ?? allLessons[0];
  // Open on the module the student is working in
  const defaultModule = Math.max(0, progress?.modules.findIndex(m => m.lessons.some(l => l.id === resumeLesson?.id)) ?? 0);
  const activeModule = moduleIdx ?? defaultModule;

  if (loading) return (
    <div className="flex min-h-full flex-col bg-white">
      <Topbar />
      <div className="h-[69px] border-b border-line" />
      <div className="flex flex-1 flex-wrap">
        <div className="w-[320px] border-r border-line p-6 space-y-4">
          <div className="mx-auto h-16 w-16 rounded-lg bg-subtle animate-pulse" />
          <div className="h-5 rounded bg-subtle animate-pulse" />
          <div className="h-24 rounded bg-subtle animate-pulse" />
        </div>
        <div className="flex-1 p-6 grid gap-4 sm:grid-cols-2 content-start">
          {[0, 1, 2, 3].map(i => <div key={i} className="h-56 rounded-lg border border-line bg-subtle animate-pulse" />)}
        </div>
      </div>
    </div>
  );

  // ── Access denied ──
  if (accessDenied) {
    return (
      <div className="flex min-h-full flex-col bg-white">
        <Topbar />
        <div className="flex flex-1 flex-col items-center justify-center p-6 text-center">
          <span className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-accent-soft text-azure-strong">
            <Glyph d={P.lock} size={26} />
          </span>
          <h1 className="mb-2 text-xl font-bold text-navy">You don&apos;t have access to this course yet</h1>
          <p className="mb-6 max-w-sm text-sm leading-relaxed text-ink2">
            Buy the course, or a package that includes it, to open its lessons.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Link href="/student/catalogue" className={btnPrimary}>Buy this course</Link>
            <Link href="/packages" className={btnSecondary}>Browse packages</Link>
          </div>
          <Link href="/student/courses" className="mt-5 text-[13px] font-medium text-muted hover:text-navy transition-colors">
            Back to My Courses
          </Link>
        </div>
      </div>
    );
  }

  if (!course || !progress) return null;

  // ── Course hosted on the website ──
  if (course.source === 'WORDPRESS' && !course.contentImportedAt) {
    return (
      <div className="flex flex-col" style={{ height: '100dvh' }}>
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-line bg-white px-5 py-3">
          <Link href="/student/courses" aria-label="Back to My Courses"
            className="flex h-[34px] w-[34px] items-center justify-center rounded-md border border-line text-ink2 hover:bg-subtle transition-colors">
            <Glyph d={P.back} size={16} />
          </Link>
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <Link href="/student/courses" className="font-semibold text-navy">My Courses</Link>
            <span aria-hidden className="text-muted">›</span>
            <span className="truncate text-ink2">{course.title}</span>
          </nav>
          {course.wpCourseUrl && (
            <a href={course.wpCourseUrl} target="_blank" rel="noopener noreferrer" className={btnSecondary}>Open in new tab</a>
          )}
        </div>
        {course.wpCourseUrl && (
          <div className="flex flex-shrink-0 items-center gap-3 border-b border-line bg-subtle px-5 py-2.5">
            <Glyph d={P.alert} size={16} className="text-azure-strong" />
            <p className="flex-1 text-[13px] text-ink2">This course is hosted on our website. If it doesn&apos;t load, sign in there first.</p>
            <a href={course.wpCourseUrl} target="_blank" rel="noopener noreferrer" className={btnPrimary}>Sign in</a>
          </div>
        )}
        {course.wpCourseUrl ? (
          <iframe src={course.wpCourseUrl} className="w-full flex-1 border-0 bg-white"
            allow="fullscreen; autoplay; clipboard-write" title={course.title} />
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
            <p className="text-sm font-semibold text-navy">This course has no link yet</p>
            <p className="max-w-xs text-[13px] text-ink2">Please contact support so we can fix it.</p>
            <Link href="/student/courses" className={btnSecondary}>Back to My Courses</Link>
          </div>
        )}
      </div>
    );
  }

  const modules = progress.modules;
  const current = modules[activeModule] ?? modules[0];
  const pct = progress.percentComplete;
  const courseStatus = pct >= 100 ? 'Completed' : pct > 0 || allLessons.some(l => lessonState(l) === 'doing') ? 'In progress' : 'Not started';

  const totalSecs = allLessons.reduce((s, l) => s + (l.durationSecs ?? 0), 0);
  const totalLength = totalSecs
    ? totalSecs >= 3600 ? `${Math.floor(totalSecs / 3600)} h ${Math.round((totalSecs % 3600) / 60)} min` : `${Math.round(totalSecs / 60)} min`
    : '—';
  const teacherName = course.teacher
    ? course.teacher.name || [course.teacher.firstName, course.teacher.lastName].filter(Boolean).join(' ') || course.teacher.email
    : '—';
  const programme = course.programme ? (course.programme.shortName ?? course.programme.name) : null;
  const subtitleParts = [`${modules.length} module${modules.length === 1 ? '' : 's'}`, `${progress.totalLessons} lesson${progress.totalLessons === 1 ? '' : 's'}`];
  const resumeHref = resumeLesson ? `/student/learn/${courseId}/lesson/${resumeLesson.id}` : undefined;

  const facts = [
    { label: 'Programme', value: [programme, course.level?.name].filter(Boolean).join(' · ') || '—', d: P.layers },
    { label: 'Subject', value: course.subject?.name ?? '—', d: P.book },
    { label: 'Total length', value: totalLength, d: P.clock },
    { label: 'Certificate', value: pct >= 100 ? 'Earned — view in Certificates' : 'Earned when all lessons are complete', d: P.badge },
  ];

  const moduleDone = current ? current.lessons.filter(l => l.progress?.completed).length : 0;
  const moduleSummary = current
    ? `${current.lessons.length} lesson${current.lessons.length === 1 ? '' : 's'} · ${moduleDone} completed`
    : '';

  return (
    <div className="flex min-h-full flex-col bg-white">
      <Topbar />

      {/* Page header */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-[17px] lg:px-7">
        <Link href="/student/courses" aria-label="Back to My Courses"
          className="flex h-[38px] w-[38px] items-center justify-center rounded-md border border-line bg-white text-ink2 hover:bg-subtle transition-colors">
          <Glyph d={P.back} size={18} strokeWidth={1.7} />
        </Link>
        <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-2 text-[15px]">
          <Link href="/student/courses" className="font-semibold text-navy hover:text-azure-strong transition-colors">My Courses</Link>
          <span aria-hidden className="text-muted">›</span>
          <span className="truncate text-ink2">{course.title}</span>
        </nav>
        <span className="text-[13px] text-muted">Status:</span>
        <span className="inline-flex h-6 items-center rounded bg-accent-soft px-2 text-xs font-semibold text-navy">{courseStatus}</span>
      </div>

      <div className="flex flex-1 flex-wrap">

        {/* ── Course panel ── */}
        <aside className="flex w-full flex-col border-b border-line md:w-[320px] md:flex-shrink-0 md:border-b-0 md:border-r">
          <div className="flex flex-col items-center gap-3 px-6 pt-7 pb-[22px] text-center">
            <span className="flex h-16 w-16 items-center justify-center rounded-lg bg-accent-soft text-azure-strong">
              <Glyph d={P.book} size={28} strokeWidth={1.5} />
            </span>
            <div>
              <h1 className="text-[19px] font-bold tracking-[-0.01em] text-navy">{course.title}</h1>
              <p className="mt-1 text-[13px] text-muted">{subtitleParts.join(' · ')}</p>
            </div>
            <div className="mt-1 flex gap-[18px]">
              {[
                { label: pct > 0 ? 'Continue' : 'Start', d: P.play, href: resumeHref, primary: true },
                { label: 'Certificates', d: P.badge, href: '/student/certificates' },
                { label: 'All courses', d: P.grid, href: '/student/courses' },
              ].map(a => (
                <Link key={a.label} href={a.href ?? '#'} className="flex flex-col items-center gap-1.5 text-[12.5px] text-ink2 hover:text-navy transition-colors">
                  <span className={clsx('flex h-[42px] w-[42px] items-center justify-center rounded-md border',
                    a.primary ? 'border-transparent bg-accent-soft text-azure-strong' : 'border-line bg-white text-ink2')}>
                    <Glyph d={a.d} size={18} fill={a.primary ? 'currentColor' : 'none'} />
                  </span>
                  {a.label}
                </Link>
              ))}
            </div>
            {resumeLesson && pct < 100 && (
              <p className="mt-1 flex items-center gap-1.5 text-[12.5px] text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-azure" />
                Next: <strong className="font-semibold text-navy">{resumeLesson.title}</strong>
              </p>
            )}
          </div>

          <div role="tablist" aria-label="Course details" className="grid grid-cols-2 border-y border-line">
            {([['info', 'Course info'], ['teacher', 'Teacher']] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={sideTab === k} onClick={() => setSideTab(k)}
                className={clsx('h-11 border-b-2 text-[13.5px] transition-colors -mb-px',
                  sideTab === k ? 'border-azure font-semibold text-navy' : 'border-transparent font-medium text-muted hover:text-navy')}>
                {l}
              </button>
            ))}
          </div>

          {sideTab === 'info' ? (
            <div className="flex flex-col gap-[22px] px-6 pt-[22px] pb-7">
              <div className="flex flex-col gap-2.5">
                <div className="flex items-baseline justify-between">
                  <p className={label}>Progress</p>
                  <span className="rounded bg-accent-soft px-1.5 py-0.5 text-xs font-bold text-navy">{pct}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-[3px] bg-subtle" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                  <div className="h-1.5 bg-azure transition-[width] duration-500" style={{ width: `${pct}%` }} />
                </div>
                <p className="text-[13px] text-ink2">{progress.completedLessons} of {progress.totalLessons} lessons complete</p>
              </div>

              <div className="h-px bg-line" />

              <dl className="grid gap-3.5">
                {facts.map(f => (
                  <div key={f.label} className="flex items-center gap-3">
                    <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-md bg-subtle text-ink2">
                      <Glyph d={f.d} size={16} />
                    </span>
                    <div className="min-w-0">
                      <dt className="text-xs text-muted">{f.label}</dt>
                      <dd className="mt-px text-[13.5px] font-semibold text-navy">{f.value}</dd>
                    </div>
                  </div>
                ))}
              </dl>

              {progress.hasAccess === false && (
                <div className="flex flex-col gap-2.5 rounded-md border border-line bg-subtle p-3">
                  <p className="text-[13px] text-ink2">
                    You can watch the free preview lessons. Buy the course to unlock the rest.
                  </p>
                  <Link href="/student/catalogue" className={clsx(btnPrimary, 'self-start')}>Buy this course</Link>
                </div>
              )}
              {expiringPackage && (
                <div className="flex gap-2.5 rounded-md border border-line bg-subtle p-3">
                  <Glyph d={P.clock} size={16} className="mt-0.5 flex-shrink-0 text-azure-strong" />
                  <p className="text-[13px] text-ink2">
                    {expiringPackage.name} ends on{' '}
                    <strong className="font-semibold text-navy">
                      {new Date(expiringPackage.expiresAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}
                    </strong>.{' '}
                    <Link href="/packages" className="font-semibold text-azure-strong hover:underline">Renew</Link>
                  </p>
                </div>
              )}
              {isDirectPurchase && (
                <div className="flex gap-2.5 rounded-md border border-line p-3">
                  <Glyph d={P.layers} size={16} className="mt-0.5 flex-shrink-0 text-azure-strong" />
                  <p className="text-[13px] text-ink2">
                    A package adds live classes and mentorship to this course.{' '}
                    <Link href="/packages" className="font-semibold text-azure-strong hover:underline">See packages</Link>
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3.5 px-6 pt-[22px] pb-7">
              {[{ label: 'Teacher', value: teacherName, d: P.user }, { label: 'Email', value: course.teacher?.email ?? '—', d: P.mail }].map(f => (
                <div key={f.label} className="flex items-center gap-3">
                  <span className="flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-md bg-subtle text-ink2">
                    <Glyph d={f.d} size={16} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs text-muted">{f.label}</p>
                    <p className="mt-px truncate text-[13.5px] font-semibold text-navy">{f.value}</p>
                  </div>
                </div>
              ))}
              <Link href="/student/messages" className={clsx(btnSecondary, 'mt-1 self-start')}>Message the teacher</Link>
            </div>
          )}
        </aside>

        {/* ── Lessons ── */}
        <section aria-label="Course content" className="flex min-w-0 flex-1 flex-col">
          <div role="tablist" aria-label="Course sections" className="flex gap-1 overflow-x-auto border-b border-line px-4 lg:px-6">
            {([['lessons', 'Lessons', progress.totalLessons], ['about', 'About', null]] as const).map(([k, l, n]) => (
              <button key={k} type="button" role="tab" aria-selected={mainTab === k} onClick={() => setMainTab(k)}
                className={clsx('-mb-px inline-flex h-12 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-[13.5px] transition-colors',
                  mainTab === k ? 'border-azure font-semibold text-navy' : 'border-transparent font-medium text-muted hover:text-navy')}>
                {l}
                {n !== null && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-accent-soft px-1.5 text-[11.5px] font-bold text-navy">{n}</span>
                )}
              </button>
            ))}
          </div>

          {mainTab === 'about' ? (
            <div className="max-w-2xl space-y-4 px-4 py-6 lg:px-6">
              <h2 className="text-[17px] font-bold text-navy">About this course</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink2">
                {course.description || 'The teacher has not added a description yet.'}
              </p>
            </div>
          ) : !modules.length ? (
            <div className="px-6 py-12 text-center text-sm text-muted">The teacher hasn&apos;t added any lessons yet.</div>
          ) : (
            <div className="flex flex-col gap-5 px-4 pt-5 pb-8 lg:px-6">
              <div role="tablist" aria-label="Modules" className="flex flex-wrap gap-1 rounded-lg border border-line bg-subtle p-1">
                {modules.map((m, i) => (
                  <button key={m.id} type="button" role="tab" aria-selected={i === activeModule} onClick={() => setModuleIdx(i)}
                    className={clsx('h-8 rounded-md px-3 text-[13px] transition-colors',
                      i === activeModule ? 'bg-accent-soft font-semibold text-navy' : 'font-medium text-ink2 hover:text-navy')}>
                    {m.title}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-[17px] font-bold text-navy">{current?.title}</h2>
                <p className="text-[13px] text-muted">{moduleSummary}</p>
              </div>

              <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(290px,1fr))]">
                {current?.lessons.map(l => <LessonCard key={l.id} lesson={l} courseId={courseId} />)}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ─── Lesson card ─────────────────────────────────────────────────────────── */

function LessonCard({ lesson, courseId }: { lesson: Lesson; courseId: string }) {
  const st = lessonState(lesson);
  const href = `/student/learn/${courseId}/lesson/${lesson.id}`;
  const kind = lesson.type === 'VIDEO' ? 'video' : lesson.type === 'QUIZ' ? 'quiz' : 'text';

  const meta = kind === 'video' ? `Video · ${clock(lesson.durationSecs)}`
    : kind === 'quiz' ? 'Quiz'
    : `Reading · ${minutes(lesson.durationSecs)}`;
  const cells = kind === 'video'
    ? [['Length', clock(lesson.durationSecs)], ['Chapters', lesson.chapters?.length ? String(lesson.chapters.length) : '—']]
    : kind === 'quiz'
    ? [['Pass mark', lesson.passMark ? `${lesson.passMark}%` : '—'], ['Attempts', lesson.maxAttempts ? String(lesson.maxAttempts) : 'Unlimited']]
    : [['Length', minutes(lesson.durationSecs)], ['Preview', lesson.isFree ? 'Free' : '—']];
  const covers = lesson.chapters?.length ? lesson.chapters.map(c => c.title).join(', ') : null;

  const primaryLabel = st === 'locked' ? 'Locked'
    : st === 'done' ? (kind === 'video' ? 'Rewatch' : kind === 'quiz' ? 'Review answers' : 'Review')
    : st === 'doing' ? 'Continue'
    : kind === 'text' ? 'Read' : 'Start';

  const statusTone = st === 'done' ? 'text-azure-strong' : st === 'doing' ? 'text-azure' : 'text-muted';
  const statusIcon = st === 'done' ? P.check : st === 'doing' ? P.dot : st === 'locked' ? P.lock : P.ring;

  return (
    <article className="flex flex-col gap-3.5 rounded-lg border border-line bg-white p-4">
      <div className="flex items-center gap-3">
        <span className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-md bg-subtle text-ink2">
          <Glyph d={kind === 'video' ? P.play : kind === 'quiz' ? P.quiz : P.text} size={18} />
        </span>
        <div className="min-w-0">
          <h3 className="text-[14.5px] font-semibold leading-snug text-navy">{lesson.title}</h3>
          <p className="mt-0.5 text-[12.5px] text-muted">{meta}</p>
        </div>
      </div>

      <dl className="grid grid-cols-3 gap-2">
        <div>
          <dt className={label}>Status</dt>
          <dd className={clsx('mt-[5px] flex items-center gap-1.5 text-[13px] font-semibold', statusTone)}>
            <Glyph d={statusIcon} size={14} strokeWidth={2} fill={st === 'doing' ? 'currentColor' : 'none'} />
            {STATE_LABEL[st]}
          </dd>
        </div>
        {cells.map(([l, v]) => (
          <div key={l}>
            <dt className={label}>{l}</dt>
            <dd className="mt-[5px] text-[13px] font-semibold text-navy">{v}</dd>
          </div>
        ))}
      </dl>

      {covers && (
        <>
          <div className="h-px bg-line" />
          <div>
            <p className={label}>Covers</p>
            <p className="mt-[5px] text-[13px] leading-normal text-ink2">{covers}</p>
          </div>
        </>
      )}

      <div className="mt-auto flex flex-wrap gap-2">
        {st === 'locked' ? (
          <span className={btnDisabled} aria-disabled="true">Locked</span>
        ) : (
          <Link href={href} className={btnPrimary}>{primaryLabel}</Link>
        )}
        {st !== 'locked' && kind !== 'quiz' && (
          <Link href={href} className={btnSecondary}>Practice</Link>
        )}
      </div>
    </article>
  );
}
