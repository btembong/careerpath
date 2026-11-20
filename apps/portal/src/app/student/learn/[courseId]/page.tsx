'use client';
import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Icon } from '@/components/ui/Icon';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';
import { cardTitle } from '@/components/public/course/BigCourseCard';
import { ReadMore } from '@/components/public/course/CourseParts';

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
  teacher: { firstName?: string | null; lastName?: string | null; name?: string | null; email: string; avatarUrl?: string | null };
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
  const [filter,          setFilter]          = useState<'all' | 'todo' | 'done' | 'quiz'>('all');
  // The package this course comes from, for the side and the blue card
  const [fromPackage,     setFromPackage]     = useState<ActivePackage | null>(null);

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
          if (activePkg) setFromPackage({ id: activePkg.id, name: pkgWithCourse?.name ?? activePkg.name, expiresAt: activePkg.expiresAt });
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
  const pct = progress.percentComplete;
  const { title: short, form } = cardTitle(course.title);
  const teacherName = course.teacher
    ? course.teacher.name || [course.teacher.firstName, course.teacher.lastName].filter(Boolean).join(' ') || null
    : null;
  const teacherPhoto = course.teacher?.avatarUrl && !/gravatar/.test(course.teacher.avatarUrl) ? course.teacher.avatarUrl : null;
  const programme = course.programme ? (course.programme.shortName ?? course.programme.name) : null;
  const resumeHref = resumeLesson ? `/student/learn/${courseId}/lesson/${resumeLesson.id}` : undefined;
  const quizzes = allLessons.filter(l => l.type === 'QUIZ');
  const quizzesDone = quizzes.filter(l => l.progress?.completed).length;
  const readings = allLessons.filter(l => l.type !== 'QUIZ');
  const readingsDone = readings.filter(l => l.progress?.completed).length;
  const left = [readings.length - readingsDone ? `${readings.length - readingsDone} lesson${readings.length - readingsDone === 1 ? '' : 's'}` : null, quizzes.length - quizzesDone ? `${quizzes.length - quizzesDone} quiz${quizzes.length - quizzesDone === 1 ? '' : 'zes'}` : null].filter(Boolean).join(' and ');
  const show = (l: Lesson) => filter === 'all' || (filter === 'quiz' ? l.type === 'QUIZ' : filter === 'done' ? !!l.progress?.completed : !l.progress?.completed);
  const counts = { all: allLessons.length, todo: allLessons.filter(l => !l.progress?.completed).length, done: progress.completedLessons, quiz: quizzes.length };

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/student/courses" backLabel="My courses" title={short} />

      <div className="flex flex-col gap-6 p-4 lg:px-7 lg:py-6">
        {/* Where they are in the course */}
        <section className="keep-light relative grid items-center gap-6 overflow-hidden rounded-[22px] bg-[linear-gradient(120deg,#2F57C9_0%,#3F6FE8_45%,#6B8BFF_100%)] p-6 text-[#FFFFFF] sm:p-8 md:grid-cols-[minmax(0,1fr)_auto]">
          <div className="min-w-0">
            <div className="flex flex-wrap gap-1.5">
              {[programme, course.subject?.name, form, fromPackage?.name.replace(/\s+Package$/i, '')].filter(Boolean).map(t => <span key={t} className="inline-flex h-7 items-center rounded-md bg-[rgba(255,255,255,0.22)] px-2.5 text-[13px] font-bold">{fromPackage && t === fromPackage.name.replace(/\s+Package$/i, '') ? `In ${t}` : t}</span>)}
            </div>
            <h1 className="mt-3.5 text-[28px] font-extrabold leading-[1.06] tracking-[-0.03em] text-[#FFFFFF] sm:text-[36px]">{short}</h1>
            <p className="mt-1 text-[14px] font-bold text-[#DCE6FF]">{[course.subject?.name, form, teacherName ? `with ${teacherName}` : null].filter(Boolean).join(' · ')}</p>
            <div className="mt-5 flex flex-wrap items-center gap-3.5">
              {resumeHref && <Link href={resumeHref} className="inline-flex h-11 items-center gap-1.5 rounded-lg bg-[#FFFFFF] px-4 text-[14.5px] font-extrabold text-[#2F57C9]">{pct >= 100 ? 'Review' : pct > 0 ? 'Continue' : 'Start'}{resumeLesson && pct < 100 ? `: ${resumeLesson.title}` : ''}<Icon name="arrowRight" size={15} /></Link>}
              <span className="text-[13.5px] text-[#EEF3FF]">{progress.completedLessons} of {progress.totalLessons} done{left ? ` · ${left} left` : ' · all done'}</span>
            </div>
          </div>
          <span className="hidden h-[110px] w-[110px] items-center justify-center rounded-full md:flex" style={{ background: `conic-gradient(#FFFFFF ${pct * 3.6}deg, rgba(255,255,255,0.22) 0)` }}>
            <span className="flex h-[94px] w-[94px] flex-col items-center justify-center rounded-full bg-[#2F57C9] leading-none"><b className="text-[24px]">{pct}%</b><span className="mt-1 text-[11px] text-[#DCE6FF]">done</span></span>
          </span>
        </section>

        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="flex-1 text-[22px] font-extrabold tracking-[-0.02em] text-navy">Lessons</h2>
              <div role="tablist" aria-label="Show" className="flex gap-1 overflow-x-auto rounded-[10px] border border-line bg-white p-1">
                {([['all', 'All'], ['todo', 'To do'], ['done', 'Done'], ['quiz', 'Quizzes']] as const).map(([k, l]) => (
                  <button key={k} type="button" role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}
                    className={clsx('h-8 whitespace-nowrap rounded-md px-3 text-[13px] transition-colors', filter === k ? 'bg-accent-soft font-bold text-navy' : 'font-medium text-ink2 hover:text-navy')}>
                    {l} <span className="font-medium text-muted">{counts[k]}</span>
                  </button>
                ))}
              </div>
            </div>

            {!modules.length ? (
              <div className="rounded-2xl border border-line bg-white px-6 py-12 text-center text-sm text-muted">The teacher hasn’t added any lessons yet.</div>
            ) : modules.map((m, mi) => {
              const rows = m.lessons.filter(show);
              if (!rows.length) return null;
              const done = m.lessons.filter(l => l.progress?.completed).length;
              return (
                <section key={m.id} className="overflow-hidden rounded-2xl border border-line bg-white">
                  <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-1 border-b border-line px-4 py-3">
                    <h3 className="text-[16px] font-extrabold text-navy">{m.title}</h3>
                    <span className="text-[12.5px] text-muted">{modules.length > 1 ? `Module ${mi + 1} · ` : ''}{done} of {m.lessons.length} done</span>
                  </div>
                  {rows.map(l => <LessonRow key={l.id} lesson={l} courseId={courseId} next={l.id === resumeLesson?.id && pct < 100} />)}
                </section>
              );
            })}

            {course.description && (
              <section className="rounded-2xl border border-line bg-white p-5">
                <h2 className="mb-2 text-[17px] font-extrabold text-navy">About this course</h2>
                <ReadMore text={course.description} />
              </section>
            )}
          </div>

          <aside className="flex flex-col gap-3 rounded-2xl border border-line bg-white p-4 lg:sticky lg:top-4">
            <div className="grid grid-cols-3 gap-2 text-center">
              {([[`${readingsDone}/${readings.length}`, 'lessons'], [`${quizzesDone}/${quizzes.length}`, 'quizzes'], [`${pct}%`, 'done']] as [string, string][]).map(([n, l]) => (
                <span key={l} className="rounded-[10px] bg-subtle p-2 text-[12px] text-muted"><b className="block text-[18px] text-navy">{n}</b>{l}</span>
              ))}
            </div>
            <div className="flex items-start gap-2.5 rounded-[10px] border border-dashed border-line p-3 text-[13px] text-ink2">
              <Icon name="certificates" size={16} className="mt-0.5 flex-shrink-0 text-azure-strong" />
              <span>{pct >= 100 ? <><b className="text-navy">Certificate earned.</b> <Link href="/student/certificates" className="font-bold text-azure-strong hover:underline">See it</Link></> : <><b className="block text-navy">Certificate</b>When all {progress.totalLessons} lessons{quizzes.length ? ' and quizzes' : ''} are done</>}</span>
            </div>
            <Link href="/student/tests" className="flex h-11 items-center justify-center gap-2 rounded-lg border border-line text-[14px] font-extrabold text-navy hover:bg-subtle"><Icon name="grade" size={16} />Practise in the Test Centre</Link>
            <Link href="/student/flashcards" className="flex h-11 items-center justify-center gap-2 rounded-lg border border-line text-[14px] font-extrabold text-navy hover:bg-subtle"><Icon name="docLine" size={16} />My notes and flashcards</Link>

            <div className="flex items-center gap-3 border-t border-line pt-3">
              <span className="flex h-12 w-12 flex-shrink-0 -rotate-[4deg] items-center justify-center overflow-hidden rounded-xl bg-accent-soft text-[15px] font-extrabold text-azure-strong">
                {teacherPhoto ? <img src={teacherPhoto} alt="" className="h-full w-full object-cover" /> : (teacherName ?? 'C').slice(0, 1)}
              </span>
              <span className="min-w-0 text-[13px]">
                <b className="block truncate text-[14px] text-navy">{teacherName ?? 'CareerPath Africa'}</b>
                <span className="block text-muted">{teacherName ? 'Your teacher' : 'No teacher yet'}</span>
                <Link href={teacherName ? '/student/messages' : '/student/support'} className="font-bold text-azure-strong hover:underline">{teacherName ? 'Ask a question' : 'Ask CareerPath'}</Link>
              </span>
            </div>

            {fromPackage && (
              <Link href={`/packages/${fromPackage.id}`} className="flex items-start gap-2 border-t border-line pt-3 text-[12.5px] text-ink2 hover:text-navy">
                <Icon name="packages" size={15} className="mt-0.5 flex-shrink-0 text-azure-strong" />
                <span>From <b className="text-navy">{fromPackage.name}</b>{fromPackage.expiresAt ? `, yours until ${new Date(fromPackage.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}</span>
              </Link>
            )}
            {expiringPackage && (
              <p className="flex gap-2 rounded-[10px] bg-subtle p-3 text-[13px] text-ink2">
                <Icon name="clock" size={15} className="mt-0.5 flex-shrink-0 text-azure-strong" />
                <span>{expiringPackage.name} ends on <b className="text-navy">{new Date(expiringPackage.expiresAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</b>. <Link href="/packages" className="font-bold text-azure-strong hover:underline">Renew</Link></span>
              </p>
            )}
            {progress.hasAccess === false && (
              <div className="flex flex-col gap-2 rounded-[10px] bg-accent-soft p-3 text-[13px] text-ink2">
                You can open the free preview lessons. Get the course to unlock the rest.
                <Link href={`/student/courses/${courseId}`} className="inline-flex h-9 w-fit items-center rounded-lg bg-azure-strong px-3 text-[13px] font-extrabold text-on-accent">Get the course</Link>
              </div>
            )}
            {isDirectPurchase && (
              <p className="text-[12.5px] text-ink2">A package can add live classes or a mentor to this course. <Link href="/packages" className="font-bold text-azure-strong hover:underline">See packages</Link></p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

/* ─── A lesson in the list ────────────────────────────────────────────────── */

function LessonRow({ lesson, courseId, next }: { lesson: Lesson; courseId: string; next: boolean }) {
  const st = lessonState(lesson);
  const href = `/student/learn/${courseId}/lesson/${lesson.id}`;
  const kind = lesson.type === 'VIDEO' ? 'video' : lesson.type === 'QUIZ' ? 'quiz' : 'text';
  const meta = kind === 'video' ? `Video${lesson.durationSecs ? ` · ${clock(lesson.durationSecs)}` : ''}`
    : kind === 'quiz' ? ['Quiz', lesson.passMark ? `pass mark ${lesson.passMark}%` : null, lesson.maxAttempts ? `${lesson.maxAttempts} tries` : null].filter(Boolean).join(' · ')
    : `Reading${lesson.durationSecs ? ` · ${minutes(lesson.durationSecs)}` : ''}${lesson.isFree ? ' · free preview' : ''}`;
  const action = st === 'locked' ? 'Locked'
    : st === 'done' ? (kind === 'quiz' ? 'Review answers' : 'Review')
    : st === 'doing' || next ? 'Continue'
    : kind === 'text' ? 'Read' : kind === 'video' ? 'Watch' : 'Start';
  const row = (
    <>
      <span className={clsx('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full',
        st === 'done' ? 'bg-[rgba(46,170,95,0.15)] text-[#2EAA5F]' : next ? 'bg-azure-strong text-on-accent' : st === 'locked' ? 'text-muted' : 'text-muted')}>
        {st === 'done' ? <Icon name="check" size={15} /> : next ? <Icon name="play" size={13} /> : st === 'locked' ? <Icon name="lock" size={14} /> : <span className="h-3.5 w-3.5 rounded-full border-[1.5px] border-current" />}
      </span>
      <span className="min-w-0 flex-1">
        <b className={clsx('block truncate text-[14px]', st === 'done' ? 'font-semibold text-ink2' : 'text-navy')}>{lesson.title}</b>
        <span className="block truncate text-[12px] text-muted">{meta}</span>
      </span>
      <span className={clsx('inline-flex h-8 flex-shrink-0 items-center rounded-lg px-3 text-[12.5px] font-extrabold',
        next ? 'bg-azure-strong text-on-accent' : st === 'locked' ? 'text-muted' : 'border border-line text-azure-strong')}>{action}</span>
    </>
  );
  const cls = clsx('flex items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0', next && 'bg-accent-soft');
  return st === 'locked' ? <div className={cls} aria-disabled="true">{row}</div> : <Link href={href} className={clsx(cls, 'hover:bg-subtle')}>{row}</Link>;
}
