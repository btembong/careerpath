'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import api from '@/lib/api';

interface Course {
  id: string; title: string; description: string | null; status: string;
  programme: { name: string; shortName: string | null } | null;
  subject: { name: string } | null;
  _count: { modules: number; enrollments: number };
}

const STATUS_BADGE: Record<string, 'active' | 'muted' | 'default'> = {
  PUBLISHED: 'active', PENDING_REVIEW: 'muted', DRAFT: 'default', ARCHIVED: 'default',
};
const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: 'Published', PENDING_REVIEW: 'Under Review', DRAFT: 'Draft', ARCHIVED: 'Archived',
};

type StatusFilter = 'ALL' | 'PUBLISHED' | 'PENDING_REVIEW' | 'DRAFT' | 'ARCHIVED';

export default function TeacherCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  async function load() {
    const r = await api.get('/platform-courses');
    setCourses(r.data);
  }

  useEffect(() => { load().finally(() => setLoading(false)); }, []);

  async function submitForReview(id: string) {
    setSubmitting(id);
    try {
      await api.post(`/platform-courses/${id}/submit`);
      notify.success('Submitted for review', { description: 'Admin will review your course shortly.' });
      await load();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to submit');
    } finally { setSubmitting(null); }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-3">
        {[1,2,3].map(i => <SkeletonCard key={i} lines={2} />)}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="My Courses" subtitle="Create and manage your course content" />
      <div className="flex-1 p-6 pb-28 lg:pb-6 space-y-5">

        {/* Search + Filter */}
        {courses.length > 0 && (
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-azure/40 pointer-events-none" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search courses…"
                className="w-full rounded-xl border border-cloud bg-white pl-9 pr-8 py-2.5 text-sm text-navy placeholder:text-royal/30 outline-none focus:border-azure focus:ring-2 focus:ring-azure/10 transition"
              />
              {search && (
                <button onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 flex h-5 w-5 items-center justify-center rounded-full bg-cloud hover:bg-azure/20 transition">
                  <Icon name="close" size={10} className="text-royal/60" />
                </button>
              )}
            </div>
            <div className="relative flex-shrink-0">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as StatusFilter)}
                className="appearance-none rounded-xl border border-cloud bg-white pl-3 pr-8 py-2.5 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/10 transition cursor-pointer"
              >
                <option value="ALL">All statuses</option>
                <option value="PUBLISHED">Published</option>
                <option value="PENDING_REVIEW">Under Review</option>
                <option value="DRAFT">Draft</option>
                <option value="ARCHIVED">Archived</option>
              </select>
              <Icon name="chevronDown" size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-royal/30 pointer-events-none" />
            </div>
          </div>
        )}

        {courses.length === 0 ? (
          <Card padding="lg">
            <EmptyState
              icon="courses"
              title="No courses yet"
              description="Ask your admin to create a course and assign it to you"
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {(() => {
              const filtered = courses
                .filter(c => statusFilter === 'ALL' || c.status === statusFilter)
                .filter(c => !search.trim() || c.title.toLowerCase().includes(search.toLowerCase()));
              if (filtered.length === 0) {
                return <p className="text-sm text-royal/40 text-center py-12">No courses match your filters.</p>;
              }
              return filtered.map(course => (
                <Card key={course.id} padding="none" className="overflow-hidden">
                  <div className="flex flex-col sm:flex-row sm:items-start gap-4 p-4">
                    <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-cloud text-azure">
                      <Icon name="courses" size={18} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <Badge variant={STATUS_BADGE[course.status]}>{STATUS_LABEL[course.status]}</Badge>
                        {course.programme && (
                          <span className="text-[10px] bg-cloud text-royal/60 rounded-md px-2 py-0.5 font-semibold">
                            {course.programme.shortName ?? course.programme.name}
                          </span>
                        )}
                        {course.subject && (
                          <span className="text-[10px] text-royal/40">{course.subject.name}</span>
                        )}
                      </div>
                      <p className="text-sm font-bold text-navy">{course.title}</p>
                      {course.description && (
                        <p className="text-xs text-royal/50 mt-0.5 line-clamp-1">{course.description}</p>
                      )}
                      <div className="flex items-center gap-3 mt-2 text-[10px] text-royal/40">
                        <span><Icon name="notebook" size={10} className="inline mr-1" />{course._count.modules} modules</span>
                        <span><Icon name="graduate" size={10} className="inline mr-1" />{course._count.enrollments} students</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap sm:flex-nowrap">
                      {course.status === 'DRAFT' && (
                        <Button size="sm" variant="secondary" loading={submitting === course.id}
                          onClick={() => submitForReview(course.id)}>
                          Submit for review
                        </Button>
                      )}
                      <Link href={`/teacher/quiz-builder/${course.id}`}>
                        <Button size="sm" variant="secondary">
                          <Icon name="notebook" size={13} /> Quizzes
                        </Button>
                      </Link>
                      <Link href={`/teacher/courses/${course.id}`}>
                        <Button size="sm">
                          <Icon name="chevronRight" size={13} /> View
                        </Button>
                      </Link>
                    </div>
                  </div>
                </Card>
              ));
            })()}
          </div>
        )}
      </div>
    </div>
  );
}
