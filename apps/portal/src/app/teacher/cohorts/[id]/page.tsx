'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

interface Student {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
}

interface CohortStudent {
  student: Student;
}

interface Cohort {
  id: string;
  name: string;
  examDate?: string | null;
  sittingLabel?: string | null;
  startDate?: string | null;
}

interface Roster {
  cohort?: Cohort;
  name?: string;
  examDate?: string | null;
  sittingLabel?: string | null;
  startDate?: string | null;
  students: CohortStudent[];
}

interface LiveClass {
  id: string;
  title: string;
  scheduledAt: string;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED';
}

interface AttendanceRecord {
  id: string;
  durationSecs?: number | null;
  student?: { firstName?: string | null; lastName?: string | null; email?: string };
}

interface Assignment {
  id: string;
  title: string;
  description?: string;
  maxPoints: number;
  dueDate: string;
}

interface Submission {
  id: string;
  status: 'PENDING' | 'GRADED';
  grade?: number | null;
  feedback?: string | null;
  fileUrl?: string | null;
}

interface SubmissionRow {
  student: Student;
  submission?: Submission | null;
}

interface AssignmentSubmissions {
  assignment?: { title: string; maxPoints: number };
  students: SubmissionRow[];
}

export default function CohortDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [roster,       setRoster]       = useState<Roster | null>(null);
  const [classes,      setClasses]      = useState<LiveClass[]>([]);
  const [progress,     setProgress]     = useState<Record<string, number>>({});
  const [loading,      setLoading]      = useState(true);
  const [starting,     setStarting]     = useState<string | null>(null);
  const [ending,       setEnding]       = useState<string | null>(null);
  const [newClass,     setNewClass]     = useState({ title: '', scheduledAt: '' });
  const [scheduling,   setScheduling]   = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);

  // Attendance state
  const [attendance, setAttendance] = useState<Record<string, AttendanceRecord[]>>({});
  const [loadingAtt, setLoadingAtt] = useState<string | null>(null);
  const [showAtt, setShowAtt] = useState<string | null>(null);

  async function toggleAttendance(classId: string) {
    if (showAtt === classId) { setShowAtt(null); return; }
    if (attendance[classId]) { setShowAtt(classId); return; }
    setLoadingAtt(classId);
    try {
      const r = await api.get(`/live/classes/${classId}/attendance`);
      setAttendance(a => ({ ...a, [classId]: r.data ?? [] }));
      setShowAtt(classId);
    } catch { notify.error('Failed to load attendance'); }
    finally { setLoadingAtt(null); }
  }

  // Assignment state
  const [assignments,    setAssignments]    = useState<Assignment[]>([]);
  const [showNewAsgn,    setShowNewAsgn]    = useState(false);
  const [creatingAsgn,   setCreatingAsgn]   = useState(false);
  const [asgnForm,       setAsgnForm]       = useState({ title: '', description: '', maxPoints: '100', dueDate: '' });
  const [viewAsgn,       setViewAsgn]       = useState<string | null>(null); // assignmentId for submissions view
  const [asgnSubs,       setAsgnSubs]       = useState<AssignmentSubmissions | null>(null);
  const [gradingAsgn,    setGradingAsgn]    = useState<string | null>(null); // submissionId
  const [asgnGrades,     setAsgnGrades]     = useState<Record<string, { score: string; feedback: string }>>({});

  async function loadData() {
    try {
      const [rr, cr, ar] = await Promise.all([
        api.get(`/portals/teacher/rosters/${id}`),
        api.get(`/live/cohorts/${id}/classes`),
        api.get(`/education/cohorts/${id}/assignments`).catch(() => ({ data: [] })),
      ]);
      setRoster(rr.data);
      setClasses(cr.data ?? []);
      setAssignments(ar.data ?? []);

      // Load progress for each student's courses
      const students: CohortStudent[] = rr.data?.students ?? [];
      const progressMap: Record<string, number> = {};
      await Promise.all(students.map(async (s) => {
        const sid = s.student?.id ?? (s as unknown as Student).id;
        try {
          const pr = await api.get(`/portals/teacher/students/${sid}/progress`).catch(() => null);
          progressMap[sid] = pr?.data?.overallPercent ?? pr?.data?.percentComplete ?? 0;
        } catch { progressMap[sid] = 0; }
      }));
      setProgress(progressMap);
    } finally { setLoading(false); }
  }

  useEffect(() => { loadData(); }, [id]);

  async function scheduleClass(e: React.FormEvent) {
    e.preventDefault();
    setScheduling(true);
    try {
      await api.post(`/live/cohorts/${id}/classes`, {
        title: newClass.title,
        scheduledAt: new Date(newClass.scheduledAt).toISOString(),
      });
      const r = await api.get(`/live/cohorts/${id}/classes`);
      setClasses(r.data);
      setNewClass({ title: '', scheduledAt: '' });
      setShowSchedule(false);
      notify.success('Class scheduled');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to schedule');
    } finally { setScheduling(false); }
  }

  async function startClass(classId: string) {
    setStarting(classId);
    try {
      await api.patch(`/live/classes/${classId}/start`);
      window.open(`/teacher/live/${classId}`, '_blank');
      const r = await api.get(`/live/cohorts/${id}/classes`);
      setClasses(r.data);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to start');
    } finally { setStarting(null); }
  }

  async function endClass(classId: string) {
    setEnding(classId);
    try {
      await api.patch(`/live/classes/${classId}/end`);
      notify.success('Class ended');
      const r = await api.get(`/live/cohorts/${id}/classes`);
      setClasses(r.data);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to end');
    } finally { setEnding(null); }
  }

  async function createAssignment(e: React.FormEvent) {
    e.preventDefault();
    setCreatingAsgn(true);
    try {
      await api.post(`/education/cohorts/${id}/assignments`, {
        title: asgnForm.title,
        description: asgnForm.description,
        maxPoints: parseInt(asgnForm.maxPoints),
        dueDate: new Date(asgnForm.dueDate).toISOString(),
      });
      notify.success('Assignment created');
      setShowNewAsgn(false);
      setAsgnForm({ title: '', description: '', maxPoints: '100', dueDate: '' });
      await loadData();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to create assignment');
    } finally { setCreatingAsgn(false); }
  }

  async function loadAssignmentSubmissions(assignmentId: string) {
    try {
      const r = await api.get(`/education/assignments/${assignmentId}/submissions`);
      setAsgnSubs(r.data);
      setViewAsgn(assignmentId);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to load submissions');
    }
  }

  async function gradeAsgnSubmission(submissionId: string) {
    const g = asgnGrades[submissionId];
    if (!g?.score) { notify.error('Enter a score before grading'); return; }
    setGradingAsgn(submissionId);
    try {
      await api.patch(`/education/submissions/${submissionId}/grade`, {
        grade: parseFloat(g.score),
        feedback: g.feedback,
      });
      notify.success('Graded');
      if (viewAsgn) await loadAssignmentSubmissions(viewAsgn);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Grading failed');
    } finally { setGradingAsgn(null); }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar back />
      <div className="flex-1 p-6 space-y-6 max-w-none w-full">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1,2,3,4].map(i => <div key={i} className="rounded-2xl border border-cloud bg-white h-16 animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-3">
            {[1,2,3].map(i => <SkeletonCard key={i} lines={2} />)}
          </div>
          <div className="space-y-3">
            {[1,2].map(i => <SkeletonCard key={i} lines={2} />)}
          </div>
        </div>
      </div>
    </div>
  );

  const students: CohortStudent[] = roster?.students ?? [];
  const cohortName = roster?.cohort?.name ?? roster?.name ?? 'Cohort';
  const examDate   = roster?.cohort?.examDate ?? roster?.examDate ?? null;
  const sittingLabel = roster?.cohort?.sittingLabel ?? roster?.sittingLabel ?? null;
  const startDate  = roster?.cohort?.startDate ?? roster?.startDate ?? null;

  const examDaysLeft = examDate
    ? Math.ceil((new Date(examDate).getTime() - Date.now()) / 86400000)
    : null;

  const live     = classes.filter(c => c.status === 'ACTIVE');
  const upcoming = classes.filter(c => c.status === 'SCHEDULED');
  const past     = classes.filter(c => c.status === 'COMPLETED');

  const avgProgress = students.length > 0
    ? Math.round(Object.values(progress).reduce((s, v) => s + v, 0) / students.length)
    : 0;

  return (
    <div className="flex flex-col min-h-full">
      <Topbar
        title={cohortName}
        subtitle={`${students.length} students enrolled`}
        backHref="/teacher/cohorts"
        backLabel="Cohorts"
      />
      <div className="flex-1 p-6 space-y-6">

        {/* Exam countdown banner */}
        {examDate && examDaysLeft !== null && (
          <div className={`rounded-2xl px-5 py-4 flex items-center gap-4 flex-wrap ${
            examDaysLeft <= 0
              ? 'bg-royal/10 border border-royal/20'
              : examDaysLeft <= 14
              ? 'bg-amber-50 border border-amber-200'
              : 'bg-azure/5 border border-azure/20'
          }`}>
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
              examDaysLeft <= 0 ? 'bg-royal/20' : examDaysLeft <= 14 ? 'bg-amber-100' : 'bg-azure/10'
            }`}>
              <Icon name="clock" size={18} className={examDaysLeft <= 14 && examDaysLeft > 0 ? 'text-amber-600' : 'text-azure'} />
            </div>
            <div className="flex-1 min-w-0">
              {sittingLabel && (
                <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-0.5">{sittingLabel}</p>
              )}
              <p className="text-sm font-bold text-navy">
                {examDaysLeft <= 0
                  ? 'Exam date has passed'
                  : examDaysLeft === 1
                  ? 'Exam is tomorrow!'
                  : `${examDaysLeft} days until exam`}
              </p>
              <p className="text-xs text-royal/50">
                {new Date(examDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                {startDate && ` · Started ${new Date(startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
              </p>
            </div>
            {examDaysLeft > 0 && (
              <div className={`flex-shrink-0 rounded-xl px-4 py-2 text-center ${
                examDaysLeft <= 14 ? 'bg-amber-500 text-white' : 'bg-azure text-white'
              }`}>
                <p className="text-2xl font-black leading-none">{examDaysLeft}</p>
                <p className="text-[10px] font-semibold mt-0.5">days left</p>
              </div>
            )}
          </div>
        )}

        {/* Stat strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: 'Students',      value: students.length,        icon: 'graduate'  as const },
            { label: 'Sessions',      value: classes.length,         icon: 'live'      as const },
            { label: 'Avg progress',  value: `${avgProgress}%`,      icon: 'courses'   as const },
            { label: 'Assignments',   value: assignments.length, icon: 'assignments' as const },
          ].map(s => (
            <Card key={s.label} padding="sm">
              <div className="flex items-center gap-3">
                <IconBox className="h-8 w-8 rounded-lg flex-shrink-0"><Icon name={s.icon} size={14} /></IconBox>
                <div>
                  <p className="text-sm font-bold text-navy">{s.value}</p>
                  <p className="text-[10px] text-royal/40 font-semibold">{s.label}</p>
                </div>
              </div>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Students roster — 2/3 */}
          <div className="lg:col-span-2 space-y-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">STUDENTS</p>
              <h2 className="text-base font-bold text-navy">{students.length} enrolled</h2>
            </div>

            {students.length === 0 ? (
              <Card padding="lg">
                <div className="flex flex-col items-center py-8 text-center">
                  <IconBox className="h-12 w-12 rounded-2xl mb-3"><Icon name="mentorship" size={20} /></IconBox>
                  <p className="text-sm font-semibold text-navy">No students yet</p>
                  <p className="text-xs text-royal/50 mt-1">Admin will enroll students into this cohort</p>
                </div>
              </Card>
            ) : (
              <Card padding="none">
                {students.map((s, i, arr) => {
                  const student = s.student ?? (s as unknown as Student);
                  const pct = progress[student.id] ?? 0;
                  return (
                    <div key={student.id} className={`flex items-center gap-4 px-4 py-3.5${i < arr.length - 1 ? ' border-b border-cloud' : ''}`}>
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-azure text-sm font-bold text-white">
                        {(student.firstName ?? student.email ?? 'S')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy truncate">
                          {student.firstName || student.lastName
                            ? `${student.firstName ?? ''} ${student.lastName ?? ''}`.trim()
                            : student.email}
                        </p>
                        {(student.firstName || student.lastName) && <p className="text-[10px] text-royal/40 truncate">{student.email}</p>}
                        <div className="mt-1.5 flex items-center gap-2">
                          <div className="flex-1 h-1.5 rounded-full bg-cloud overflow-hidden">
                            <div className="h-full rounded-full bg-azure transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-[10px] font-semibold text-azure flex-shrink-0">{pct}%</span>
                        </div>
                      </div>
                      <Badge variant={pct === 100 ? 'active' : pct > 0 ? 'muted' : 'default'}>
                        {pct === 100 ? 'Done' : pct > 0 ? 'In progress' : 'Not started'}
                      </Badge>
                    </div>
                  );
                })}
              </Card>
            )}
          </div>

          {/* Live classes — 1/3 */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">LIVE CLASSES</p>
                <h2 className="text-base font-bold text-navy">Schedule</h2>
              </div>
              <Button size="sm" onClick={() => setShowSchedule(v => !v)}>
                <Icon name="add" size={13} /> New
              </Button>
            </div>

            {showSchedule && (
              <Card padding="md">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-3">SCHEDULE CLASS</p>
                <form onSubmit={scheduleClass} className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-navy">Class title</label>
                    <input value={newClass.title} onChange={e => setNewClass(f => ({ ...f, title: e.target.value }))} required
                      placeholder="e.g. Algebra Week 3"
                      className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/15 placeholder:text-royal/40" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-navy">Date & time</label>
                    <input type="datetime-local" value={newClass.scheduledAt}
                      onChange={e => setNewClass(f => ({ ...f, scheduledAt: e.target.value }))} required
                      className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/15" />
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit" fullWidth loading={scheduling} size="sm">Schedule</Button>
                    <Button type="button" variant="secondary" size="sm" onClick={() => setShowSchedule(false)}>Cancel</Button>
                  </div>
                </form>
              </Card>
            )}

            {/* Live now */}
            {live.map(cls => (
              <Card key={cls.id} padding="sm" className="border-azure/30 bg-azure/5">
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-azure">
                    <Icon name="live" size={14} className="text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant="active">Live now</Badge>
                    </div>
                    <p className="text-xs font-semibold text-navy truncate">{cls.title}</p>
                    <p className="text-[10px] text-royal/50">
                      {new Date(cls.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
                <div className="flex gap-2 mt-3">
                  <Link href={`/teacher/live/${cls.id}`} target="_blank"
                    className="flex-1 flex items-center justify-center gap-1.5 rounded-lg bg-azure py-2 text-xs font-semibold text-white hover:bg-royal transition">
                    <Icon name="live" size={12} /> Rejoin
                  </Link>
                  <Button size="sm" loading={ending === cls.id}
                    onClick={() => endClass(cls.id)}
                    className="flex-1 bg-red-500 border-red-500 hover:bg-red-600 hover:border-red-600">
                    <Icon name="close" size={12} /> End
                  </Button>
                </div>
              </Card>
            ))}

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-royal/40 uppercase tracking-widest">UPCOMING</p>
                {upcoming.map(cls => (
                  <Card key={cls.id} padding="sm">
                    <div className="flex items-start gap-3">
                      <IconBox><Icon name="live" size={14} /></IconBox>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-navy truncate">{cls.title}</p>
                        <p className="text-[10px] text-royal/50">
                          {new Date(cls.scheduledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                          {' · '}
                          {new Date(cls.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <Button size="sm" loading={starting === cls.id} onClick={() => startClass(cls.id)}>
                        Start
                      </Button>
                    </div>
                  </Card>
                ))}
              </div>
            )}

            {/* Past */}
            {past.length > 0 && (
              <div className="space-y-2">
                <p className="text-[10px] font-semibold text-royal/30 uppercase tracking-widest">PAST</p>
                {past.map(cls => (
                  <Card key={cls.id} padding="sm">
                    <div className="flex items-center gap-3">
                      <IconBox><Icon name="live" size={14} /></IconBox>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-navy truncate">{cls.title}</p>
                        <p className="text-[10px] text-royal/50">
                          {new Date(cls.scheduledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </p>
                      </div>
                      <Badge variant="default">Done</Badge>
                    </div>
                    <button onClick={() => toggleAttendance(cls.id)}
                      className="mt-2 w-full flex items-center justify-center gap-1.5 rounded-lg border border-cloud py-1.5 text-[10px] font-semibold text-royal/50 hover:text-azure hover:border-azure transition">
                      {loadingAtt === cls.id
                        ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-azure border-t-transparent" />
                        : <Icon name="graduate" size={11} />}
                      {showAtt === cls.id ? 'Hide attendance' : 'View attendance'}
                    </button>
                    {showAtt === cls.id && (
                      <div className="mt-2 rounded-xl border border-cloud bg-cloud/20 divide-y divide-cloud">
                        {(attendance[cls.id] ?? []).length === 0 ? (
                          <p className="px-3 py-2 text-[10px] text-royal/40">No attendance recorded</p>
                        ) : (
                          (attendance[cls.id] ?? []).map((att) => {
                            const name = att.student?.firstName || att.student?.lastName
                              ? `${att.student.firstName ?? ''} ${att.student.lastName ?? ''}`.trim()
                              : att.student?.email ?? 'Unknown';
                            const mins = att.durationSecs ? Math.round(att.durationSecs / 60) : null;
                            return (
                              <div key={att.id} className="flex items-center justify-between px-3 py-1.5">
                                <p className="text-[10px] font-semibold text-navy truncate">{name}</p>
                                <p className="text-[10px] text-royal/40 flex-shrink-0 ml-2">
                                  {mins != null ? `${mins}m` : '—'}
                                </p>
                              </div>
                            );
                          })
                        )}
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            )}

            {classes.length === 0 && !showSchedule && (
              <Card padding="md">
                <div className="flex flex-col items-center py-4 text-center">
                  <IconBox className="h-10 w-10 rounded-xl mb-2"><Icon name="live" size={16} /></IconBox>
                  <p className="text-xs font-semibold text-navy">No classes scheduled</p>
                  <p className="text-[10px] text-royal/40 mt-0.5">Click "New" to add a session</p>
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* ── Assignments ──────────────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">ASSIGNMENTS</p>
              <h2 className="text-base font-bold text-navy">{assignments.length} assignment{assignments.length !== 1 ? 's' : ''}</h2>
            </div>
            <Button size="sm" onClick={() => setShowNewAsgn(v => !v)}>
              <Icon name="add" size={13} /> New
            </Button>
          </div>

          {/* New assignment form */}
          {showNewAsgn && (
            <Card padding="md">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-3">NEW ASSIGNMENT</p>
              <form onSubmit={createAssignment} className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-navy">Title *</label>
                    <input value={asgnForm.title} onChange={e => setAsgnForm(f => ({ ...f, title: e.target.value }))} required
                      placeholder="e.g. Essay on Climate Change"
                      className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/15 placeholder:text-royal/40" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-navy">Max points *</label>
                    <input type="number" min="1" value={asgnForm.maxPoints}
                      onChange={e => setAsgnForm(f => ({ ...f, maxPoints: e.target.value }))} required
                      className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/15" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-navy">Due date *</label>
                    <input type="datetime-local" value={asgnForm.dueDate}
                      onChange={e => setAsgnForm(f => ({ ...f, dueDate: e.target.value }))} required
                      className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/15" />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-navy">Description</label>
                    <input value={asgnForm.description}
                      onChange={e => setAsgnForm(f => ({ ...f, description: e.target.value }))}
                      placeholder="What students should submit…"
                      className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/15 placeholder:text-royal/40" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" loading={creatingAsgn}>Create</Button>
                  <Button type="button" variant="secondary" size="sm" onClick={() => setShowNewAsgn(false)}>Cancel</Button>
                </div>
              </form>
            </Card>
          )}

          {/* Assignment cards */}
          {assignments.length === 0 && !showNewAsgn ? (
            <Card padding="md">
              <div className="flex flex-col items-center py-4 text-center">
                <IconBox className="h-10 w-10 rounded-xl mb-2"><Icon name="assignments" size={16} /></IconBox>
                <p className="text-xs font-semibold text-navy">No assignments yet</p>
                <p className="text-[10px] text-royal/40 mt-0.5">Click "New" to create an assignment for this cohort</p>
              </div>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {assignments.map((asgn) => {
                const isPast = new Date() > new Date(asgn.dueDate);
                return (
                  <Card key={asgn.id} padding="sm"
                    className={`cursor-pointer hover:border-azure/40 transition ${viewAsgn === asgn.id ? 'border-azure bg-azure/5' : ''}`}
                    onClick={() => viewAsgn === asgn.id ? (setViewAsgn(null), setAsgnSubs(null)) : loadAssignmentSubmissions(asgn.id)}>
                    <div className="flex items-start gap-3">
                      <IconBox className="flex-shrink-0"><Icon name="assignments" size={14} /></IconBox>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-navy truncate">{asgn.title}</p>
                        <p className="text-[10px] text-royal/50 mt-0.5">
                          Due {new Date(asgn.dueDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                        <p className="text-[10px] text-royal/40">{asgn.maxPoints} pts</p>
                      </div>
                      <Badge variant={isPast ? 'muted' : 'active'}>{isPast ? 'Closed' : 'Open'}</Badge>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Submissions panel */}
          {viewAsgn && asgnSubs && (
            <Card padding="md">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-azure">SUBMISSIONS</p>
                  <p className="text-sm font-bold text-navy">{asgnSubs.assignment?.title}</p>
                  <p className="text-[10px] text-royal/50">Max: {asgnSubs.assignment?.maxPoints} pts</p>
                </div>
                <button onClick={() => { setViewAsgn(null); setAsgnSubs(null); }}
                  className="rounded-lg p-1.5 text-royal/30 hover:text-navy transition">
                  <Icon name="close" size={14} />
                </button>
              </div>
              <div className="divide-y divide-cloud">
                {(asgnSubs.students ?? []).map((row) => {
                  const sub = row.submission;
                  const gradeKey = sub?.id ?? `missing-${row.student.id}`;
                  const grade = asgnGrades[gradeKey] ?? {
                    score: sub?.grade != null ? String(sub.grade) : '',
                    feedback: sub?.feedback ?? '',
                  };
                  return (
                    <div key={row.student.id} className="py-3 flex items-start gap-3">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-azure text-xs font-bold text-white">
                        {(row.student.firstName ?? row.student.email ?? 'S')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-navy">
                          {row.student.firstName || row.student.lastName
                            ? `${row.student.firstName ?? ''} ${row.student.lastName ?? ''}`.trim()
                            : row.student.email}
                        </p>
                        {!sub ? (
                          <p className="text-[10px] text-royal/40 mt-0.5">Not submitted</p>
                        ) : sub.status === 'GRADED' ? (
                          <div className="mt-0.5">
                            <p className="text-[10px] text-green-600 font-semibold">
                              Graded: {sub.grade}/{asgnSubs.assignment?.maxPoints}
                            </p>
                            {sub.feedback && <p className="text-[10px] text-royal/50 mt-0.5 italic">{sub.feedback}</p>}
                          </div>
                        ) : (
                          <div className="mt-1.5 flex items-center gap-2 flex-wrap">
                            <input type="number" min="0" max={asgnSubs.assignment?.maxPoints} placeholder="Score"
                              value={grade.score}
                              onChange={e => setAsgnGrades(g => ({ ...g, [sub.id]: { ...grade, score: e.target.value } }))}
                              className="w-20 rounded-lg border border-cloud px-2 py-1 text-xs text-navy outline-none focus:border-azure" />
                            <input placeholder="Feedback (optional)"
                              value={grade.feedback}
                              onChange={e => setAsgnGrades(g => ({ ...g, [sub.id]: { ...grade, feedback: e.target.value } }))}
                              className="flex-1 min-w-[120px] rounded-lg border border-cloud px-2 py-1 text-xs text-navy outline-none focus:border-azure placeholder:text-royal/30" />
                            <Button size="sm" loading={gradingAsgn === sub.id}
                              onClick={() => gradeAsgnSubmission(sub.id)}>Grade</Button>
                          </div>
                        )}
                        {sub?.fileUrl && (
                          <a href={sub.fileUrl} target="_blank" rel="noreferrer"
                            className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-azure hover:underline">
                            <Icon name="file" size={10} /> View submission
                          </a>
                        )}
                      </div>
                      <Badge variant={!sub ? 'default' : sub.status === 'GRADED' ? 'active' : 'muted'}>
                        {!sub ? 'Missing' : sub.status === 'GRADED' ? 'Graded' : 'Pending'}
                      </Badge>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </div>

      </div>
    </div>
  );
}
