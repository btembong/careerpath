'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { spring } from '@/lib/motion';
import type { IconName } from '@/lib/icons';
import api from '@/lib/api';

type ReviewStatus = 'APPROVED' | 'REJECTED';

interface Lesson { id: string; title: string; type: string; durationSecs: number | null; isFree: boolean; }
interface Module { id: string; title: string; sortOrder: number; lessons: Lesson[]; }
interface CourseDetail {
  id: string; title: string; description: string | null; status: string;
  source: 'NATIVE' | 'WORDPRESS'; wpCourseUrl: string | null;
  programme: { name: string; shortName: string | null } | null;
  subject:   { name: string } | null;
  level:     { name: string } | null;
  teacher:   { id: string; email: string };
  modules:   Module[];
  _count?:   { modules: number; enrollments: number };
}

export default function ReviewerCourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();

  const [course,   setCourse]   = useState<CourseDetail | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [deciding, setDeciding] = useState(false);
  const [decision, setDecision] = useState<ReviewStatus>('APPROVED');
  const [notes,    setNotes]    = useState('');

  useEffect(() => {
    api.get(`/platform-courses/${courseId}`)
      .then(r => {
        setCourse(r.data);
        if (r.data.modules?.length > 0) {
          setExpanded(new Set([r.data.modules[0].id]));
        }
      })
      .catch(() => notify.error('Failed to load course'))
      .finally(() => setLoading(false));
  }, [courseId]);

  async function submitReview() {
    if (decision === 'REJECTED' && !notes.trim()) {
      notify.error('Please add review notes when rejecting a course');
      return;
    }
    setDeciding(true);
    try {
      await api.patch(`/reviewer/courses/${courseId}/review`, {
        status: decision,
        notes: notes.trim() || undefined,
      });
      notify.success(decision === 'APPROVED' ? 'Course approved' : 'Course rejected');
      router.push('/reviewer/dashboard');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to submit review');
    } finally { setDeciding(false); }
  }

  if (loading || !course) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-6 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-4">
            <div className="rounded-2xl border border-cloud bg-white h-48 animate-pulse" />
            <div className="space-y-2">
              {[1,2,3].map(i => <div key={i} className="rounded-xl border border-cloud bg-white h-12 animate-pulse" />)}
            </div>
          </div>
          <div className="rounded-2xl border border-cloud bg-white h-64 animate-pulse" />
        </div>
      </div>
    </div>
  );

  const totalLessons = course.modules.reduce((n, m) => n + m.lessons.length, 0);
  const totalSecs    = course.modules.flatMap(m => m.lessons).reduce((n, l) => n + (l.durationSecs ?? 0), 0);
  const fmtDur = (s: number) => s < 60 ? `${s}s` : `${Math.round(s / 60)}m`;
  const typeIcon = (t: string) => t === 'VIDEO' ? 'play' : t === 'TEXT' ? 'file' : 'assignments';

  return (
    <div className="flex flex-col min-h-full bg-surface">

      {/* Top bar */}
      <div className="border-b border-cloud bg-white px-6 py-4 flex items-center gap-4">
        <Link href="/reviewer/dashboard"
          className="inline-flex items-center gap-1.5 text-sm text-royal hover:text-azure transition">
          <Icon name="arrowLeft" size={14} /> Back to queue
        </Link>
        <div className="h-4 w-px bg-cloud" />
        <p className="text-sm font-bold text-navy truncate flex-1">{course.title}</p>
        <Badge variant="default">Pending Review</Badge>
      </div>

      <div className="flex-1 max-w-5xl w-full mx-auto px-6 py-6 space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* LEFT — course details */}
          <div className="lg:col-span-2 space-y-5">

            {/* Header card */}
            <Card padding="none" className="overflow-hidden">
              <div className="bg-navy px-5 py-5">
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
                  {course.source === 'WORDPRESS' && (
                    <span className="rounded-md bg-orange-400/20 px-2 py-0.5 text-[10px] font-bold text-orange-300 uppercase">WP</span>
                  )}
                </div>
                <h1 className="text-xl font-black text-white leading-snug">{course.title}</h1>
                {course.description && (
                  <p className="text-sm text-white/50 mt-2 max-w-2xl leading-relaxed">{course.description}</p>
                )}
                <p className="text-[11px] text-white/30 mt-3">
                  <Icon name="mentorship" size={10} className="inline mr-1" />
                  Submitted by {course.teacher.email.split('@')[0]}
                </p>
              </div>

              {/* Stats strip */}
              <div className="grid grid-cols-3 divide-x divide-cloud bg-white">
                {[
                  { label: 'Modules',  value: course.modules.length,     icon: 'notebook' as const },
                  { label: 'Lessons',  value: totalLessons,              icon: 'play'     as const },
                  { label: 'Duration', value: totalSecs > 0 ? fmtDur(totalSecs) : '—', icon: 'clock' as const },
                ].map(s => (
                  <div key={s.label} className="flex items-center gap-3 px-5 py-4">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-cloud text-azure flex-shrink-0">
                      <Icon name={s.icon} size={14} />
                    </span>
                    <div>
                      <p className="text-base font-black text-navy leading-none">{s.value}</p>
                      <p className="text-[10px] text-royal/50 mt-0.5 uppercase tracking-widest">{s.label}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Card>

            {/* WP preview link */}
            {course.source === 'WORDPRESS' && course.wpCourseUrl && (
              <a href={course.wpCourseUrl} target="_blank" rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-cloud bg-white px-4 py-2.5 text-sm font-semibold text-navy hover:bg-cloud transition">
                <Icon name="arrowRight" size={14} className="text-azure" /> Preview course on WordPress
              </a>
            )}

            {/* Curriculum */}
            <div className="space-y-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure">
                Curriculum — {course.modules.length} module{course.modules.length !== 1 ? 's' : ''} · {totalLessons} lesson{totalLessons !== 1 ? 's' : ''}
              </p>

              {course.modules.length === 0 ? (
                <Card padding="lg">
                  <div className="flex flex-col items-center py-8 text-center">
                    <Icon name="notebook" size={24} className="text-royal/20 mb-2" />
                    <p className="text-sm font-semibold text-navy">No modules yet</p>
                    <p className="text-xs text-royal/50 mt-1">This course has no content to review</p>
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
                          <Icon name="chevronDown" size={13} className={`text-royal/30 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                        <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={spring.smooth}
                            className="overflow-hidden"
                          >
                          <div className="border-t border-cloud divide-y divide-cloud/60">
                            {mod.lessons.map(lesson => (
                              <div key={lesson.id} className="flex items-center gap-3 px-4 py-3">
                                <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-cloud bg-surface">
                                  <Icon name={typeIcon(lesson.type) as IconName} size={9} className="text-azure" />
                                </div>
                                <span className="flex-1 text-xs font-medium text-navy">{lesson.title}</span>
                                {lesson.isFree && (
                                  <span className="rounded bg-green-100 px-1.5 py-0.5 text-[9px] font-bold text-green-600">FREE</span>
                                )}
                                {lesson.durationSecs && (
                                  <span className="text-[10px] text-royal/30">{fmtDur(lesson.durationSecs)}</span>
                                )}
                                <span className="text-[10px] text-royal/30 uppercase">{lesson.type}</span>
                              </div>
                            ))}
                            {mod.lessons.length === 0 && (
                              <div className="px-4 py-3 text-xs text-royal/30 italic">No lessons in this module</div>
                            )}
                          </div>
                          </motion.div>
                        )}
                        </AnimatePresence>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* RIGHT — review panel */}
          <div>
            <div className="sticky top-6 space-y-4">
              <Card padding="md">
                <p className="text-[10px] font-bold uppercase tracking-widest text-royal/50 mb-4">Your Decision</p>

                {/* Approve / Reject toggle */}
                <div className="flex gap-3 mb-4">
                  {(['APPROVED', 'REJECTED'] as ReviewStatus[]).map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setDecision(s)}
                      className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${
                        decision === s
                          ? s === 'APPROVED'
                            ? 'border-azure bg-azure text-white'
                            : 'border-red-400 bg-red-50 text-red-600'
                          : 'border-cloud text-royal/50 hover:bg-cloud'
                      }`}
                    >
                      {s === 'APPROVED' ? (
                        <span className="flex items-center justify-center gap-1.5">
                          <Icon name="check" size={14} /> Approve
                        </span>
                      ) : (
                        <span className="flex items-center justify-center gap-1.5">
                          <Icon name="close" size={14} /> Reject
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* Notes */}
                <div className="space-y-1 mb-4">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">
                    Review notes{decision === 'REJECTED' && <span className="text-red-400"> (required)</span>}
                  </label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={4}
                    placeholder="Add feedback for the teacher…"
                    className="w-full rounded-xl border border-cloud bg-white px-4 py-3 text-sm text-navy outline-none resize-none focus:border-azure focus:ring-2 focus:ring-azure/15 placeholder:text-royal/40"
                  />
                </div>

                <Button
                  fullWidth
                  loading={deciding}
                  onClick={submitReview}
                  variant={decision === 'REJECTED' ? 'secondary' : 'primary'}
                >
                  <Icon name={decision === 'APPROVED' ? 'check' : 'close'} size={13} />
                  Submit {decision === 'APPROVED' ? 'approval' : 'rejection'}
                </Button>
              </Card>

              {/* Guidelines */}
              <Card padding="md">
                <p className="text-[10px] font-bold uppercase tracking-widest text-royal/50 mb-3">Review guidelines</p>
                <ul className="space-y-2">
                  {[
                    'Verify course title and description are accurate',
                    'Check all modules have meaningful content',
                    'Ensure lesson titles are clear and descriptive',
                    'Confirm no plagiarised or inappropriate material',
                    'Approve only if content meets quality standards',
                  ].map(guideline => (
                    <li key={guideline} className="flex items-start gap-2 text-xs text-royal/60">
                      <Icon name="check" size={11} className="text-azure flex-shrink-0 mt-0.5" />
                      {guideline}
                    </li>
                  ))}
                </ul>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
