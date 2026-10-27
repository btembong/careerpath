'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState, useRef } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonTable } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

interface UserHit { id: string; email: string; role: string; }
interface Assignment {
  courseId: string;
  teacherId: string | null; teacherCommissionPct: number | null;
  reviewerId: string | null; reviewerCommissionPct: number | null;
  reviewStatus: string; reviewedAt: string | null; reviewNotes: string | null;
  teacher?: { id: string; email: string } | null;
  reviewer?: { id: string; email: string } | null;
}

const STATUS_COLOR: Record<string, 'active' | 'muted' | 'default'> = {
  APPROVED: 'active', PENDING: 'muted', REJECTED: 'default',
};

function UserSearch({
  label, value, onSelect, role,
}: { label: string; value: UserHit | null; onSelect: (u: UserHit | null) => void; role?: string; }) {
  const [q, setQ]         = useState(value?.email ?? '');
  const [results, setResults] = useState<UserHit[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleChange(v: string) {
    setQ(v);
    onSelect(null);
    if (timer.current) clearTimeout(timer.current);
    if (v.length < 2) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const r = await api.get(`/portals/admin/users/search?email=${encodeURIComponent(v)}`);
        setResults(role ? r.data.filter((u: UserHit) => u.role === role) : r.data);
      } catch { setResults([]); }
    }, 300);
  }

  function pick(u: UserHit) {
    setQ(u.email); setResults([]); onSelect(u);
  }

  return (
    <div className="space-y-1 relative">
      <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">{label}</label>
      <div className="relative">
        <Icon name="search" size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-royal/40 pointer-events-none" />
        <input value={q} onChange={e => handleChange(e.target.value)} placeholder="Search by email…"
          className="w-full rounded-xl border border-cloud bg-white pl-8 pr-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
        {value && <Icon name="check" size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-azure" />}
      </div>
      {results.length > 0 && (
        <div className="absolute z-20 left-0 right-0 top-full mt-1 rounded-xl border border-cloud bg-white shadow-lg overflow-hidden">
          {results.map(u => (
            <button key={u.id} type="button" onClick={() => pick(u)}
              className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-cloud transition">
              <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-cloud text-xs font-bold text-azure">
                {u.email[0].toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm text-navy truncate">{u.email}</p>
                <p className="text-[10px] text-royal/40">{u.role}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminReviewsPage() {
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [userMap, setUserMap]         = useState<Record<string, string>>({});
  const [loading, setLoading]         = useState(true);
  const [showForm, setShowForm]       = useState(false);
  const [saving, setSaving]           = useState(false);

  // New assignment form
  const [courseId, setCourseId]               = useState('');
  const [teacher, setTeacher]                 = useState<UserHit | null>(null);
  const [teacherPct, setTeacherPct]           = useState('40');
  const [reviewer, setReviewer]               = useState<UserHit | null>(null);
  const [reviewerPct, setReviewerPct]         = useState('10');

  async function load() {
    try {
      const [ar, ur] = await Promise.all([
        api.get('/admin/courses'),
        api.get('/portals/admin/users').catch(() => ({ data: [] })),
      ]);
      const list: Assignment[] = ar.data ?? [];
      setAssignments(list);
      // Build id→email map from user list + embedded teacher/reviewer objects
      const map: Record<string, string> = {};
      (ur.data ?? []).forEach((u: UserHit) => { map[u.id] = u.email; });
      list.forEach(a => {
        if (a.teacher)  map[a.teacher.id]  = a.teacher.email;
        if (a.reviewer) map[a.reviewer.id] = a.reviewer.email;
      });
      setUserMap(map);
    } catch { setAssignments([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!courseId.trim()) return;
    setSaving(true);
    try {
      await api.post(`/admin/courses/${courseId.trim()}/assign`, {
        ...(teacher    && { teacherId: teacher.id }),
        ...(teacherPct && teacher && { teacherCommissionPct: parseFloat(teacherPct) }),
        ...(reviewer   && { reviewerId: reviewer.id }),
        ...(reviewerPct && reviewer && { reviewerCommissionPct: parseFloat(reviewerPct) }),
      });
      setCourseId(''); setTeacher(null); setTeacherPct('40');
      setReviewer(null); setReviewerPct('10'); setShowForm(false);
      await load();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to save assignment');
    } finally { setSaving(false); }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-5 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-cloud animate-pulse" />)}
        </div>
        <SkeletonTable />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Course Assignments" subtitle="Link WordPress courses to teachers and reviewers" />

      <div className="flex-1 p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">COURSES</p>
            <h2 className="text-base font-bold text-navy">{assignments.length} assigned course{assignments.length !== 1 ? 's' : ''}</h2>
          </div>
          <Button size="sm" onClick={() => setShowForm(v => !v)}>
            <Icon name="add" size={14} /> Assign course
          </Button>
        </div>

        {/* Assignment form */}
        {showForm && (
          <Card padding="md">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-4">NEW COURSE ASSIGNMENT</p>
            <form onSubmit={handleAssign} className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">WordPress Course ID</label>
                <input value={courseId} onChange={e => setCourseId(e.target.value)}
                  placeholder="e.g. 142 or wp-course-slug" required
                  className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                <p className="text-[10px] text-royal/40">Use the numeric WP post ID of the LearnDash / course post.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <UserSearch label="Assign teacher (optional)" value={teacher} onSelect={setTeacher} role="TEACHER" />
                  {teacher && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Teacher commission %</label>
                      <input type="number" min="0" max="100" value={teacherPct}
                        onChange={e => setTeacherPct(e.target.value)}
                        className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure" />
                    </div>
                  )}
                </div>

                <div className="space-y-3">
                  <UserSearch label="Assign reviewer (optional)" value={reviewer} onSelect={setReviewer} role="SUBJECT_REVIEWER" />
                  {reviewer && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Reviewer commission %</label>
                      <input type="number" min="0" max="100" value={reviewerPct}
                        onChange={e => setReviewerPct(e.target.value)}
                        className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure" />
                    </div>
                  )}
                </div>
              </div>

              <div className="flex gap-3 pt-1">
                <Button type="submit" loading={saving} size="sm">Save assignment</Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setShowForm(false)}>Cancel</Button>
              </div>
            </form>
          </Card>
        )}

        {/* Assignments list */}
        {assignments.length === 0 ? (
          <Card padding="lg">
            <EmptyState icon="courses" title="No course assignments yet" description="Assign a WordPress course to a teacher or reviewer to start tracking commissions" />
          </Card>
        ) : (
          <Card padding="none">
            <div className="px-5 py-3 border-b border-cloud">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">ALL ASSIGNMENTS</p>
            </div>
            <ul className="divide-y divide-cloud">
              {assignments.map((a: Assignment) => (
                <li key={a.courseId} className="flex flex-col sm:flex-row sm:items-center gap-3 px-5 py-4">
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-navy">Course #{a.courseId}</p>
                      <Badge variant={STATUS_COLOR[a.reviewStatus] ?? 'default'}>{a.reviewStatus}</Badge>
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-royal/50">
                      {a.teacherId && (
                        <span className="flex items-center gap-1">
                          <Icon name="mentorship" size={11} />
                          {userMap[a.teacherId] ?? a.teacherId.slice(0,8) + '…'}
                          {a.teacherCommissionPct != null && ` · ${a.teacherCommissionPct}%`}
                        </span>
                      )}
                      {a.reviewerId && (
                        <span className="flex items-center gap-1">
                          <Icon name="check" size={11} />
                          {userMap[a.reviewerId] ?? a.reviewerId.slice(0,8) + '…'}
                          {a.reviewerCommissionPct != null && ` · ${a.reviewerCommissionPct}%`}
                        </span>
                      )}
                    </div>
                    {a.reviewNotes && (
                      <p className="text-xs text-royal/40 italic truncate">{a.reviewNotes}</p>
                    )}
                  </div>
                  {a.reviewedAt && (
                    <p className="text-[10px] text-royal/30 flex-shrink-0">
                      Reviewed {new Date(a.reviewedAt).toLocaleDateString()}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
