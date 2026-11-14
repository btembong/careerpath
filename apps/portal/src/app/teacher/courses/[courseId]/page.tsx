'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import api from '@/lib/api';

interface Attachment { id: string; name: string; url: string; }
interface Lesson {
  id: string; title: string; type: string; durationSecs: number | null;
  isFree: boolean; attachments: Attachment[];
}
interface Module { id: string; title: string; sortOrder: number; lessons: Lesson[]; }
interface PackageItem { id: string; name: string; currency: string; priceAmount: number; courseIds?: string[]; }

interface CourseDetail {
  id: string; title: string; description: string | null; status: string;
  source: 'NATIVE' | 'WORDPRESS'; wpCourseUrl: string | null;
  /** Content copied from Tutor: the course is built on the portal from then on */
  contentImportedAt?: string | null;
  programme: { name: string; shortName: string | null; type: string } | null;
  subject:   { name: string } | null;
  level:     { name: string } | null;
  teacher:   { id: string; email: string };
  modules:   Module[];
  _count:    { modules: number; enrollments: number };
}

const STATUS_BADGE: Record<string, 'active' | 'muted' | 'default'> = {
  PUBLISHED: 'active', PENDING_REVIEW: 'muted', DRAFT: 'default', ARCHIVED: 'default',
};
const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: 'Published', PENDING_REVIEW: 'Under Review', DRAFT: 'Draft', ARCHIVED: 'Archived',
};

export default function TeacherCourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [course,   setCourse]   = useState<CourseDetail | null>(null);
  const [packages, setPackages] = useState<{ id: string; name: string; currency: string; priceAmount: number }[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    Promise.all([
      api.get(`/platform-courses/${courseId}`),
      api.get('/packages').catch(() => ({ data: [] })),
    ]).then(([cr, pkgRes]) => {
        setCourse(cr.data);
        if (cr.data.modules?.length > 0) {
          setExpanded(new Set([cr.data.modules[0].id]));
        }
        const allPkgs = pkgRes.data ?? [];
        setPackages((allPkgs as PackageItem[]).filter((p) => Array.isArray(p.courseIds) && p.courseIds.includes(courseId)));
      })
      .catch(() => notify.error('Failed to load course'))
      .finally(() => setLoading(false));
  }, [courseId]);

  async function submitForReview() {
    if (!course) return;
    setSubmitting(true);
    try {
      await api.post(`/platform-courses/${courseId}/submit`);
      notify.success('Submitted for review');
      const r = await api.get(`/platform-courses/${courseId}`);
      setCourse(r.data);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to submit');
    } finally { setSubmitting(false); }
  }

  if (loading || !course) return (
    <div className="flex flex-col min-h-full bg-surface">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-5 max-w-5xl w-full mx-auto">
        <div className="rounded-2xl overflow-hidden">
          <div className="h-32 bg-navy/80 animate-pulse" />
          <div className="grid grid-cols-4 divide-x divide-cloud bg-white">
            {[0,1,2,3].map(i => <div key={i} className="h-16 animate-pulse bg-cloud/40" />)}
          </div>
        </div>
        <div className="space-y-2">
          {[0,1,2].map(i => <div key={i} className="h-12 rounded-xl bg-cloud animate-pulse" />)}
        </div>
      </div>
    </div>
  );

  // Built on the portal, or a WordPress course whose content has been imported
  const editable = course.source === 'NATIVE' || !!course.contentImportedAt;
  const totalLessons = course.modules.reduce((n, m) => n + m.lessons.length, 0);
  const totalMins = course.modules
    .flatMap(m => m.lessons)
    .reduce((n, l) => n + (l.durationSecs ?? 0), 0);
  const fmtDuration = (secs: number) => secs < 60 ? `${secs}s` : `${Math.round(secs / 60)}m`;
  const typeIcon = (t: string) => t === 'VIDEO' ? 'play' : t === 'TEXT' ? 'file' : 'assignments';

  return (
    <div className="flex flex-col min-h-full bg-surface">
      <Topbar
        title={course.title}
        subtitle={course.programme?.shortName ?? course.programme?.name ?? 'Course overview'}
        backHref="/teacher/courses"
        backLabel="My Courses"
      />

      <div className="flex-1 p-6 space-y-5 max-w-5xl w-full mx-auto">

        {/* Header card */}
        <Card padding="none" className="overflow-hidden">
          <div className="bg-navy px-6 py-5">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div className="min-w-0">
                {/* Tags */}
                <div className="flex items-center gap-2 flex-wrap mb-3">
                  <Badge variant={STATUS_BADGE[course.status]}>{STATUS_LABEL[course.status]}</Badge>
                  {course.source === 'WORDPRESS' && (
                    <span className="rounded-md bg-orange-400/20 px-2 py-0.5 text-[10px] font-bold text-orange-300 uppercase">WP</span>
                  )}
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
                <h1 className="text-xl font-black text-white leading-snug">{course.title}</h1>
                {course.description && (
                  <p className="mt-2 max-w-2xl whitespace-pre-line text-sm text-white/50 line-clamp-4">{course.description}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                {editable && (
                  <>
                    {course.status === 'DRAFT' && (
                      <Button size="sm" variant="secondary" loading={submitting} onClick={submitForReview}>
                        Submit for review
                      </Button>
                    )}
                    <Link href={`/teacher/courses/${courseId}/discussion`}>
                      <Button size="sm" variant="secondary">
                        <Icon name="community" size={13} /> Discussion
                      </Button>
                    </Link>
                    <Link href={`/teacher/quiz-builder/${courseId}`}>
                      <Button size="sm" variant="secondary">
                        <Icon name="notebook" size={13} /> Quiz builder
                      </Button>
                    </Link>
                    <Link href={`/teacher/courses/${courseId}/builder`}>
                      <Button size="sm">
                        <Icon name="edit" size={13} /> Open builder
                      </Button>
                    </Link>
                  </>
                )}
                {course.source === 'WORDPRESS' && !course.contentImportedAt && course.wpCourseUrl && (
                  <a href={course.wpCourseUrl} target="_blank" rel="noreferrer">
                    <Button size="sm">
                      <Icon name="live" size={13} /> Open in WP
                    </Button>
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Stat strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-cloud bg-white">
            {[
              { label: 'Modules',  value: course._count.modules,     icon: 'notebook'  },
              { label: 'Lessons',  value: totalLessons,              icon: 'play'      },
              { label: 'Students', value: course._count.enrollments,  icon: 'graduate'  },
              { label: 'Duration', value: totalMins > 0 ? fmtDuration(totalMins) : '—', icon: 'clock' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-3 px-5 py-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-cloud text-azure flex-shrink-0">
                  <Icon name={s.icon as any} size={16} />
                </span>
                <div>
                  <p className="text-base font-black text-navy leading-none">{s.value}</p>
                  <p className="text-[10px] text-royal/50 mt-0.5 uppercase tracking-widest">{s.label}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Status-specific callout */}
        {course.status === 'PENDING_REVIEW' && (
          <div className="flex items-center gap-3 rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
            <Icon name="clock" size={16} className="text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-700">
              <span className="font-semibold">Under review.</span> An admin is reviewing your course content. You will be notified once it's approved or if changes are needed.
            </p>
          </div>
        )}
        {course.status === 'PUBLISHED' && (
          <div className="flex items-center gap-3 rounded-md border border-green-200 bg-green-50 px-4 py-3">
            <Icon name="check" size={16} className="text-green-500 flex-shrink-0" />
            <p className="text-sm text-green-700">
              <span className="font-semibold">Live.</span> This course is published and available to enrolled students.
            </p>
          </div>
        )}

        {/* Package membership */}
        {packages.length > 0 && (
          <Card padding="md">
            <div className="flex items-center gap-3 mb-3">
              <Icon name="packages" size={15} className="text-azure" />
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure">
                Included in {packages.length} package{packages.length !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {packages.map(pkg => (
                <span key={pkg.id}
                  className="flex items-center gap-2 rounded-lg border border-cloud bg-surface px-3 py-2 text-xs">
                  <span className="font-semibold text-navy">{pkg.name}</span>
                  <span className="text-royal/40">{pkg.currency} {Number(pkg.priceAmount).toLocaleString()}</span>
                </span>
              ))}
            </div>
          </Card>
        )}

        {/* Curriculum */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure">
              Curriculum — {course.modules.length} module{course.modules.length !== 1 ? 's' : ''} · {totalLessons} lesson{totalLessons !== 1 ? 's' : ''}
            </p>
            {editable && (
              <Link href={`/teacher/courses/${courseId}/builder`}
                className="text-[10px] font-semibold text-azure hover:text-royal transition">
                Edit in builder →
              </Link>
            )}
          </div>

          {course.modules.length === 0 ? (
            <Card padding="lg">
              <div className="flex flex-col items-center py-8 text-center">
                <Icon name="notebook" size={28} className="text-royal/20 mb-2" />
                <p className="text-sm font-semibold text-navy">No modules yet</p>
                {editable && (
                  <p className="text-xs text-royal/50 mt-1">
                    <Link href={`/teacher/courses/${courseId}/builder`} className="text-azure hover:underline">
                      Open the builder
                    </Link>{' '}
                    to add your first module and lessons.
                  </p>
                )}
              </div>
            </Card>
          ) : (
            <div className="space-y-2">
              {course.modules.map((mod, idx) => {
                const isOpen = expanded.has(mod.id);
                return (
                  <div key={mod.id} className="rounded-md border border-cloud bg-white overflow-hidden">
                    <button
                      onClick={() => setExpanded(s => { const n = new Set(s); n.has(mod.id) ? n.delete(mod.id) : n.add(mod.id); return n; })}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface transition">
                      <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-md bg-cloud text-[10px] font-black text-navy">
                        {idx + 1}
                      </span>
                      <span className="flex-1 text-sm font-semibold text-navy">{mod.title}</span>
                      <span className="text-[10px] text-royal/40 flex-shrink-0">{mod.lessons.length} lesson{mod.lessons.length !== 1 ? 's' : ''}</span>
                      <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={13} className="text-royal/30 flex-shrink-0" />
                    </button>

                    {isOpen && (
                      <div className="border-t border-cloud divide-y divide-cloud/60">
                        {mod.lessons.map(lesson => (
                          <div key={lesson.id} className="flex items-center gap-3 px-4 py-3">
                            <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-cloud bg-surface">
                              <Icon name={typeIcon(lesson.type) as any} size={9} className="text-azure" />
                            </div>
                            <span className="flex-1 text-xs font-medium text-navy">{lesson.title}</span>
                            {lesson.isFree && (
                              <span className="rounded bg-green-100 px-1.5 py-0.5 text-[9px] font-bold text-green-600">FREE</span>
                            )}
                            {lesson.durationSecs && (
                              <span className="text-[10px] text-royal/30">{fmtDuration(lesson.durationSecs)}</span>
                            )}
                            <span className="text-[10px] text-royal/30 uppercase">{lesson.type}</span>
                          </div>
                        ))}
                        {mod.lessons.length === 0 && (
                          <div className="px-4 py-3 text-xs text-royal/30 italic">No lessons in this module</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick nav back */}
        <div className="pt-2">
          <Link href="/teacher/courses"
            className="text-xs text-royal/40 hover:text-navy transition">
            ← Back to my courses
          </Link>
        </div>
      </div>
    </div>
  );
}
