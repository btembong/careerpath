'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { spring } from '@/lib/motion';
import api from '@/lib/api';

type ReviewStatus = 'APPROVED' | 'REJECTED';

interface QueueItem {
  id: string;
  courseId?: string;
  title?: string;
  courseTitle?: string;
  wpCourseId?: string | number;
  description?: string | null;
  courseUrl?: string | null;
  category?: string | null;
  status?: string;
  teacher?: { email: string } | string | null;
}

function teacherDisplay(teacher: QueueItem['teacher']): string {
  if (!teacher) return '';
  if (typeof teacher === 'string') return teacher.includes('@') ? teacher.split('@')[0] : teacher;
  return teacher.email?.split('@')[0] ?? '';
}

export default function ReviewerDashboard() {
  const [queue,    setQueue]    = useState<QueueItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [forms,    setForms]    = useState<Record<string, { status: ReviewStatus; notes: string }>>({});

  useEffect(() => {
    api.get('/reviewer/queue')
      .then(r => setQueue(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  function getForm(id: string) {
    return forms[id] ?? { status: 'APPROVED' as ReviewStatus, notes: '' };
  }

  function setForm(id: string, field: string, value: string) {
    setForms(f => ({ ...f, [id]: { ...getForm(id), [field]: value } }));
  }

  async function submitReview(courseId: string) {
    const form = getForm(courseId);
    setDeciding(courseId);
    try {
      await api.patch(`/reviewer/courses/${courseId}/review`, {
        status: form.status,
        notes: form.notes || undefined,
      });
      notify.success(form.status === 'APPROVED' ? 'Course approved' : 'Course rejected');
      setQueue(q => q.filter(c => c.courseId !== courseId && c.id !== courseId));
      setExpanded(null);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to submit review');
    } finally {
      setDeciding(null);
    }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="rounded-2xl border border-cloud bg-white h-24 animate-pulse" />)}
        </div>
        <div className="space-y-3">
          {[1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    </div>
  );

  const pending  = queue.filter(c => !c.status || c.status === 'PENDING');
  const reviewed = queue.filter(c => c.status && c.status !== 'PENDING');

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Course Reviews" subtitle="Review and approve or reject course submissions" />

      <div className="flex-1 p-6 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
          {[
            { label: 'Pending review', value: pending.length,  icon: 'courses'     as const, sub: 'in queue'   },
            { label: 'Reviewed',       value: reviewed.length, icon: 'check'       as const, sub: 'this cycle' },
            { label: 'Total assigned', value: queue.length,    icon: 'assignments' as const, sub: 'all time'   },
          ].map((stat, i) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, ...spring.smooth }}>
              <Card padding="md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">{stat.label}</p>
                    <p className="mt-1 text-2xl font-bold text-navy">{stat.value}</p>
                    <p className="text-xs text-royal/40 mt-0.5">{stat.sub}</p>
                  </div>
                  <IconBox><Icon name={stat.icon} size={16} /></IconBox>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Review queue */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">PENDING REVIEW</p>

          {pending.length === 0 ? (
            <Card padding="lg">
              <EmptyState icon="check" title="All caught up!" description="No courses pending your review" />
            </Card>
          ) : (
            <div className="space-y-3">
              {pending.map(course => {
                const id = course.courseId ?? course.id;
                const isExpanded = expanded === id;
                const form = getForm(id);
                return (
                  <Card key={id} padding="none" className="overflow-hidden">
                    {/* Header row */}
                    <button
                      onClick={() => setExpanded(isExpanded ? null : id)}
                      className="flex items-center gap-4 px-4 py-4 w-full text-left hover:bg-cloud/30 transition"
                    >
                      <IconBox className="h-10 w-10 rounded-xl flex-shrink-0">
                        <Icon name="courses" size={18} />
                      </IconBox>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy truncate">
                          {course.title ?? course.courseTitle ?? `Course #${course.wpCourseId ?? id}`}
                        </p>
                        {course.teacher && (
                          <p className="text-xs text-royal/50 truncate">by {teacherDisplay(course.teacher)}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        {course.category && (
                          <span className="hidden sm:block text-xs text-royal/40">{course.category}</span>
                        )}
                        <Link
                          href={`/reviewer/courses/${id}`}
                          onClick={e => e.stopPropagation()}
                          className="hidden sm:inline-flex items-center gap-1 rounded-lg border border-cloud bg-white px-2.5 py-1 text-[10px] font-semibold text-royal hover:bg-cloud transition"
                        >
                          Full review <Icon name="chevronRight" size={10} />
                        </Link>
                        <Badge variant="default">Pending</Badge>
                        <Icon name="chevronDown" size={14} className={`text-royal/40 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {/* Expanded review form */}
                    <AnimatePresence initial={false}>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={spring.smooth}
                        className="overflow-hidden"
                      >
                      <div className="border-t border-cloud px-4 pb-5 pt-4 space-y-4">
                        {(course.description || course.wpCourseId) && (
                          <div className="rounded-xl border border-cloud bg-surface p-4 space-y-2">
                            {course.wpCourseId && (
                              <div className="flex items-center gap-2 text-xs text-royal/50">
                                <Icon name="courses" size={13} />
                                <span>WP Course ID: {course.wpCourseId}</span>
                              </div>
                            )}
                            {course.description && (
                              <p className="text-sm text-navy/80 leading-relaxed">{course.description}</p>
                            )}
                            {course.courseUrl && (
                              <a href={course.courseUrl} target="_blank" rel="noreferrer"
                                className="inline-flex items-center gap-2 rounded-xl border border-cloud bg-white px-3 py-2 text-xs font-semibold text-navy hover:bg-cloud transition mt-2">
                                <Icon name="file" size={13} /> Preview course
                              </a>
                            )}
                          </div>
                        )}

                        <div className="space-y-3">
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Decision</label>
                            <div className="flex gap-3">
                              {(['APPROVED', 'REJECTED'] as ReviewStatus[]).map(s => (
                                <button
                                  key={s}
                                  type="button"
                                  onClick={() => setForm(id, 'status', s)}
                                  className={`flex-1 rounded-xl border py-2.5 text-sm font-semibold transition ${
                                    form.status === s
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
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">
                              Review notes {form.status === 'REJECTED' && <span className="text-red-400">(required for rejection)</span>}
                            </label>
                            <textarea
                              value={form.notes}
                              onChange={e => setForm(id, 'notes', e.target.value)}
                              rows={3}
                              placeholder="Add feedback for the teacher…"
                              className="w-full rounded-xl border border-cloud bg-white px-4 py-3 text-sm text-navy outline-none resize-none focus:border-azure focus:ring-2 focus:ring-azure/15 placeholder:text-royal/40"
                            />
                          </div>

                          <Button
                            size="sm"
                            loading={deciding === id}
                            onClick={() => submitReview(id)}
                            variant={form.status === 'REJECTED' ? 'secondary' : 'primary'}
                          >
                            <Icon name={form.status === 'APPROVED' ? 'check' : 'close'} size={13} />
                            Submit {form.status === 'APPROVED' ? 'approval' : 'rejection'}
                          </Button>
                        </div>
                      </div>
                      </motion.div>
                    )}
                    </AnimatePresence>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* Already reviewed */}
        {reviewed.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">ALREADY REVIEWED</p>
            <Card padding="none">
              {reviewed.map((course, i, arr) => (
                <div key={course.courseId ?? course.id} className={`flex items-center gap-4 px-4 py-3.5 opacity-70${i < arr.length - 1 ? ' border-b border-cloud' : ''}`}>
                  <IconBox className="h-8 w-8 rounded-lg flex-shrink-0">
                    <Icon name="courses" size={14} />
                  </IconBox>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy truncate">
                      {course.title ?? course.courseTitle ?? `Course #${course.wpCourseId}`}
                    </p>
                    {course.teacher && (
                      <p className="text-xs text-royal/50 truncate">by {teacherDisplay(course.teacher)}</p>
                    )}
                  </div>
                  <Badge variant={course.status === 'APPROVED' ? 'active' : 'default'}>
                    {course.status === 'APPROVED' ? 'Approved' : 'Rejected'}
                  </Badge>
                </div>
              ))}
            </Card>
          </div>
        )}

      </div>
    </div>
  );
}
