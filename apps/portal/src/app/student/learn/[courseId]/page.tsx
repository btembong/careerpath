'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Icon } from '@/components/ui/Icon';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import api from '@/lib/api';

interface ActivePackage { id: string; name: string; expiresAt: string | null; }

interface Lesson {
  id: string;
  title: string;
  type: string;
  durationSecs: number | null;
  isFree?: boolean;
  progress: { completed: boolean } | null;
}
interface Module { id: string; title: string; sortOrder: number; lessons: Lesson[]; }
interface CourseDetail {
  id: string;
  title: string;
  description: string | null;
  source: 'NATIVE' | 'WORDPRESS';
  wpCourseUrl: string | null;
  programme: { name: string; shortName: string | null } | null;
  subject: { name: string } | null;
  level: { name: string } | null;
  teacher: { firstName?: string | null; lastName?: string | null; email: string };
}
interface ProgressData {
  courseId: string;
  totalLessons: number;
  completedLessons: number;
  percentComplete: number;
  modules: Module[];
}

export default function StudentCourseLandingPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [course,          setCourse]          = useState<CourseDetail | null>(null);
  const [progress,        setProgress]        = useState<ProgressData | null>(null);
  const [loading,         setLoading]         = useState(true);
  const [expanded,        setExpanded]        = useState<Set<string>>(new Set());
  const [accessDenied,    setAccessDenied]    = useState(false);
  const [expiringPackage, setExpiringPackage] = useState<ActivePackage | null>(null);
  const [isDirectPurchase, setIsDirectPurchase] = useState(false);

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

        if (courseData?.source === 'WORDPRESS') {
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
        if (!hasPackageAccess && !directPurchase) { setAccessDenied(true); return; }
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

        await api.post(`/platform-courses/${courseId}/enroll`).catch(() => {});
        const pr = await api.get(`/platform-courses/${courseId}/progress`);
        setCourse(courseData ?? courseRes.data);
        setProgress(pr.data);
        setExpanded(new Set((pr.data.modules as Module[]).map(m => m.id)));
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [courseId]);

  if (loading) return (
    <div className="flex flex-col min-h-full bg-surface">
      <SkeletonTopbar />
      <div className="flex-1 p-4 md:p-6 max-w-5xl mx-auto w-full space-y-5">
        <div className="h-40 rounded-2xl bg-navy/60 animate-pulse" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[0,1,2,3].map(i => <div key={i} className="h-16 rounded-xl bg-cloud animate-pulse" />)}
        </div>
        <div className="space-y-2">
          {[0,1,2].map(i => <div key={i} className="h-12 rounded-xl bg-cloud animate-pulse" />)}
        </div>
      </div>
    </div>
  );

  // ── Access denied ──
  if (accessDenied) {
    return (
      <div className="flex min-h-full flex-col items-center justify-center bg-surface p-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-cloud mb-4">
          <Icon name="packages" size={28} className="text-azure" />
        </div>
        <h1 className="text-xl font-black text-navy mb-2">Access required</h1>
        <p className="text-sm text-royal/60 mb-6 max-w-sm leading-relaxed">
          You need either an active package containing this course or a direct purchase to access it.
        </p>
        <div className="flex flex-col sm:flex-row items-center gap-3">
          {/* Fixed: was /courses which could 404 */}
          <Link href="/student/catalogue"
            className="inline-flex items-center gap-2 rounded-xl bg-azure px-5 py-2.5 text-sm font-bold text-white hover:bg-royal transition">
            <Icon name="packages" size={14} /> Buy this course
          </Link>
          <Link href="/packages"
            className="inline-flex items-center gap-2 rounded-xl border border-azure px-5 py-2.5 text-sm font-semibold text-azure hover:bg-azure hover:text-white transition">
            Browse packages
          </Link>
        </div>
        <Link href="/student/courses" className="mt-4 text-xs text-royal/40 hover:text-navy transition">
          ← Back to my courses
        </Link>
      </div>
    );
  }

  if (!course || !progress) return null;

  // ── WordPress embed ──
  if (course.source === 'WORDPRESS') {
    return (
      <div className="flex flex-col" style={{ height: '100dvh' }}>
        <div className="flex items-center justify-between gap-3 bg-white border-b border-cloud px-5 py-3 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Link href="/student/courses"
              className="flex-shrink-0 flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-azure/60 hover:text-azure hover:bg-azure/8 transition">
              <Icon name="arrowLeft" size={12} /> My Courses
            </Link>
            <div className="h-4 w-px bg-cloud flex-shrink-0" />
            <div className="flex items-center gap-2 min-w-0">
              {course.programme && (
                <span className="rounded-full bg-azure/10 px-2.5 py-0.5 text-[10px] font-bold text-azure uppercase tracking-widest flex-shrink-0">
                  {course.programme.shortName ?? course.programme.name}
                </span>
              )}
              <p className="text-xs font-semibold text-[#0f172a] truncate">{course.title}</p>
            </div>
          </div>
          {course.wpCourseUrl && (
            <a href={course.wpCourseUrl} target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 flex items-center gap-1.5 rounded-lg border border-azure/20 bg-azure/5 px-3 py-1.5 text-[11px] font-semibold text-azure hover:bg-azure hover:text-white hover:border-azure transition">
              <Icon name="live" size={11} /> Open in new tab
            </a>
          )}
        </div>

        {course.wpCourseUrl && (
          <div className="flex items-center gap-3 bg-[#EEF3FF] border-b border-azure/20 px-5 py-2.5 flex-shrink-0">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-azure/20 flex-shrink-0">
              <Icon name="clock" size={11} className="text-azure" />
            </div>
            <p className="text-xs text-azure/70 flex-1 leading-relaxed">
              Hosted on an external platform. If it doesn&apos;t load, sign in there first.
            </p>
            <a href={course.wpCourseUrl} target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 flex items-center gap-1.5 rounded-lg bg-azure px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-royal transition whitespace-nowrap">
              Sign in <Icon name="arrowRight" size={10} />
            </a>
          </div>
        )}

        {course.wpCourseUrl ? (
          <iframe
            src={course.wpCourseUrl}
            className="flex-1 w-full border-0 bg-white"
            allow="fullscreen; autoplay; clipboard-write"
            title={course.title}
          />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-4 text-center p-6">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-azure/10">
              <Icon name="courses" size={28} className="text-azure" />
            </div>
            <p className="text-sm font-bold text-[#0f172a]">Course link unavailable</p>
            <p className="text-xs text-azure/50 max-w-xs leading-relaxed">
              This course has no external URL configured. Contact your admin to fix this.
            </p>
            <Link href="/student/courses"
              className="inline-flex items-center gap-1.5 rounded-xl bg-azure/10 border border-azure/20 px-4 py-2 text-xs font-semibold text-azure hover:bg-azure hover:text-white transition">
              <Icon name="arrowLeft" size={12} /> Back to my courses
            </Link>
          </div>
        )}
      </div>
    );
  }

  const allLessons   = progress.modules.flatMap(m => m.lessons);
  const resumeLesson = allLessons.find(l => !l.progress?.completed) ?? allLessons[0];

  // Total duration across all lessons
  const totalSecs  = allLessons.reduce((s, l) => s + (l.durationSecs ?? 0), 0);
  const totalHours = Math.floor(totalSecs / 3600);
  const totalMins  = Math.round((totalSecs % 3600) / 60);
  const durationLabel = totalSecs > 0
    ? totalHours > 0 ? `${totalHours}h ${totalMins}m` : `${totalMins}m`
    : null;

  // Teacher display name: prefer firstName + lastName, fall back to email
  const teacherDisplay = course.teacher
    ? [course.teacher.firstName, course.teacher.lastName].filter(Boolean).join(' ') || course.teacher.email
    : '';

  function fmtDuration(secs: number | null) {
    if (!secs) return '';
    return `${Math.floor(secs / 60)}m`;
  }

  const typeIcon  = (type: string) => type === 'VIDEO' ? 'play' : type === 'TEXT' ? 'file' : 'assignments';
  const typeLabel = (type: string) => type === 'VIDEO' ? 'Video' : type === 'TEXT' ? 'Text' : 'Quiz';

  return (
    <div className="flex flex-col min-h-full bg-surface">

      {/* ── Hero ── */}
      <div className="bg-navy px-6 pt-6 pb-10">
        <Link href="/student/courses"
          className="inline-flex items-center gap-1.5 text-white/40 hover:text-white text-xs font-semibold mb-5 transition">
          <Icon name="arrowLeft" size={12} /> My Courses
        </Link>

        <div className="flex items-start justify-between gap-6 flex-wrap">
          <div className="min-w-0 flex-1">
            {/* Tags */}
            <div className="flex items-center gap-2 flex-wrap mb-3">
              {course.programme && (
                <span className="rounded-md bg-azure/20 px-2.5 py-0.5 text-[10px] font-bold text-azure uppercase tracking-widest">
                  {course.programme.shortName ?? course.programme.name}
                </span>
              )}
              {course.subject && (
                <span className="rounded-md bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-white/60">
                  {course.subject.name}
                </span>
              )}
              {course.level && (
                <span className="rounded-md bg-white/10 px-2.5 py-0.5 text-[10px] font-semibold text-white/60">
                  {course.level.name}
                </span>
              )}
            </div>

            <h1 className="text-2xl font-black text-white leading-snug">{course.title}</h1>
            {course.description && (
              <p className="text-sm text-white/50 mt-2 max-w-2xl line-clamp-2">{course.description}</p>
            )}

            {/* Instructor — full name with email fallback */}
            {teacherDisplay && (
              <p className="text-[11px] text-white/30 mt-3 flex items-center gap-1">
                <Icon name="mentorship" size={10} className="inline flex-shrink-0" />
                Instructor: {teacherDisplay}
              </p>
            )}
          </div>

          {/* Progress ring */}
          <div className="flex flex-col items-center gap-2 flex-shrink-0">
            <ProgressRing pct={progress.percentComplete} />
            <p className="text-[10px] text-white/40 text-center">
              {progress.completedLessons} / {progress.totalLessons} lessons
            </p>
          </div>
        </div>

        {/* Expiry warning */}
        {expiringPackage && (
          <div className="mt-5 flex items-center gap-3 rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-2.5">
            <Icon name="clock" size={13} className="text-amber-300 flex-shrink-0" />
            <p className="text-xs text-amber-200">
              Your package <span className="font-semibold">{expiringPackage.name}</span> expires on{' '}
              {new Date(expiringPackage.expiresAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}.{' '}
              <Link href="/packages" className="font-semibold underline hover:opacity-80 transition">Renew now</Link>
            </p>
          </div>
        )}

        {/* Resume / start CTA */}
        {resumeLesson && (
          <div className="mt-6 flex items-center gap-3 flex-wrap">
            {/* Fixed: rounded-xl instead of rounded-md for consistency */}
            <Link href={`/student/learn/${courseId}/lesson/${resumeLesson.id}`}
              className="inline-flex items-center gap-2 rounded-xl bg-azure px-6 py-2.5 text-sm font-bold text-white hover:bg-royal transition">
              <Icon name="play" size={14} />
              {progress.percentComplete > 0 ? 'Resume learning' : 'Start learning'}
            </Link>
            {progress.percentComplete > 0 && progress.percentComplete < 100 && (
              <p className="text-xs text-white/30">Next: {resumeLesson.title}</p>
            )}
            {progress.percentComplete === 100 && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-azure">
                <Icon name="check" size={13} /> Course complete!
              </span>
            )}
          </div>
        )}

        {/* Certificate CTA — shown when course is 100% complete */}
        {progress.percentComplete === 100 && (
          <div className="mt-4">
            <Link href="/student/certificates"
              className="inline-flex items-center gap-2 rounded-xl border border-azure/40 bg-azure/15 px-5 py-2 text-sm font-semibold text-azure hover:bg-azure hover:text-white transition">
              <Icon name="check" size={13} /> View your certificate
            </Link>
          </div>
        )}
      </div>

      {/* Package upsell banner (direct-purchase students only) */}
      {isDirectPurchase && (
        <div className="bg-gradient-to-r from-azure/10 to-royal/10 border-y border-azure/20 px-6 py-4">
          <div className="max-w-3xl mx-auto flex items-center gap-4 flex-wrap">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-azure/20">
              <Icon name="packages" size={18} className="text-azure" />
            </div>
            <div className="flex-1 min-w-[200px]">
              <p className="text-sm font-bold text-navy">Unlock live classes &amp; mentorship</p>
              <p className="text-xs text-royal/60 mt-0.5">
                Upgrade to a package for real-time instruction, 1-on-1 mentorship, and the full course library.
              </p>
            </div>
            <Link href="/packages"
              className="flex-shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-azure px-4 py-2 text-xs font-bold text-white hover:bg-royal transition">
              View packages <Icon name="arrowRight" size={11} />
            </Link>
          </div>
        </div>
      )}

      {/* ── Curriculum ── */}
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-azure">
            Curriculum &mdash; {progress.modules.length} module{progress.modules.length !== 1 ? 's' : ''} &middot; {progress.totalLessons} lesson{progress.totalLessons !== 1 ? 's' : ''}
            {durationLabel && <> &middot; {durationLabel}</>}
          </p>
          <button
            onClick={() => {
              const allIds = new Set(progress.modules.map(m => m.id));
              setExpanded(prev => prev.size === allIds.size ? new Set() : allIds);
            }}
            className="text-[10px] font-semibold text-royal/40 hover:text-azure transition">
            {expanded.size > 0 ? 'Collapse all' : 'Expand all'}
          </button>
        </div>

        {progress.modules.map((mod, idx) => {
          const done   = mod.lessons.filter(l => l.progress?.completed).length;
          const isOpen = expanded.has(mod.id);
          const modPct = mod.lessons.length > 0 ? Math.round((done / mod.lessons.length) * 100) : 0;
          return (
            <div key={mod.id} className="rounded-md border border-cloud bg-white overflow-hidden">
              <button
                onClick={() => setExpanded(s => { const n = new Set(s); n.has(mod.id) ? n.delete(mod.id) : n.add(mod.id); return n; })}
                className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface transition">
                <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-cloud text-[10px] font-black text-navy">
                  {idx + 1}
                </span>
                <span className="flex-1 text-sm font-semibold text-navy">{mod.title}</span>
                <span className="text-[10px] text-royal/40 font-semibold flex-shrink-0">{done}/{mod.lessons.length}</span>
                <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={13} className="text-royal/30 flex-shrink-0" />
              </button>

              {/* Module progress bar — always visible under the header */}
              <div className="h-0.5 w-full" style={{ background: '#5889FA10' }}>
                <div
                  className="h-full bg-azure transition-all duration-500"
                  style={{ width: `${modPct}%` }}
                />
              </div>

              {isOpen && (
                <div className="border-t border-cloud divide-y divide-cloud/60">
                  {mod.lessons.map(lesson => {
                    const completed = lesson.progress?.completed;
                    return (
                      <Link key={lesson.id}
                        href={`/student/learn/${courseId}/lesson/${lesson.id}`}
                        className="flex min-w-0 items-center gap-3 px-4 py-3 hover:bg-azure/5 transition group">
                        {/* Completion circle with lesson type icon */}
                        <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border transition ${
                          completed ? 'border-azure bg-azure' : 'border-cloud group-hover:border-azure'
                        }`}>
                          {completed
                            ? <Icon name="check" size={10} className="text-white" />
                            : <Icon name={typeIcon(lesson.type)} size={9} className="text-royal/40 group-hover:text-azure transition" />
                          }
                        </div>

                        {/* Title — min-w-0 ensures truncation works in flex context */}
                        <span className={`flex-1 min-w-0 text-xs font-medium overflow-hidden text-ellipsis whitespace-nowrap ${completed ? 'text-azure' : 'text-navy'}`}>
                          {lesson.title}
                        </span>

                        {/* Lesson type label */}
                        <span className="flex-shrink-0 text-[10px] text-royal/30 font-medium hidden sm:block">
                          {typeLabel(lesson.type)}
                        </span>

                        {/* Free preview badge */}
                        {lesson.isFree && !completed && (
                          <span className="flex-shrink-0 inline-flex items-center rounded-full bg-azure/10 px-1.5 py-0.5 text-[9px] font-bold text-azure border border-azure/20">
                            Free
                          </span>
                        )}

                        {/* Duration */}
                        {lesson.durationSecs && (
                          <span className="text-[10px] text-royal/30 flex-shrink-0">{fmtDuration(lesson.durationSecs)}</span>
                        )}

                        <Icon name="chevronRight" size={11} className="text-royal/20 group-hover:text-azure transition flex-shrink-0" />
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}


function ProgressRing({ pct }: { pct: number }) {
  const r    = 30;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={76} height={76} viewBox="0 0 76 76">
      <circle cx={38} cy={38} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={7} />
      <circle cx={38} cy={38} r={r} fill="none" stroke="#5889FA" strokeWidth={7}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 38 38)" />
      <text x={38} y={38} textAnchor="middle" dominantBaseline="central"
        fill="white" fontSize={13} fontWeight={800}>
        {pct}%
      </text>
    </svg>
  );
}
