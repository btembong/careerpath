'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { SkeletonTopbar, SkeletonCard, SkeletonListRow } from '@/components/ui/Skeleton';
import { useAuth } from '@/hooks/useAuth';
import api from '@/lib/api';

interface Teacher { id: string; email: string; name: string | null; firstName: string | null; lastName: string | null; }
interface LiveClass {
  id: string; title: string; scheduledAt: string; status: string;
  description?: string; durationMins?: number;
}
interface Cohort {
  id: string; name: string;
  sittingLabel: string | null;
  examDate: string | null;
  startDate: string | null;
  teacher: Teacher | null;
  _count: { students: number; liveClasses: number };
}
interface Member { id: string; email: string; firstName: string | null; lastName: string | null; avatarUrl: string | null; }
interface Assignment { id: string; title: string; dueDate: string | null; maxPoints: number; submission: { status: string; score: number | null } | null; }

function teacherName(t: Teacher): string {
  if (t.firstName || t.lastName) return `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim();
  return t.name ?? t.email;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}
function fmtTime(d: string) {
  return new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** Download a .ics file for a single event */
function addToCalendar(title: string, scheduledAt: string, durationMins?: number) {
  const start = new Date(scheduledAt);
  const end   = new Date(start.getTime() + (durationMins ?? 60) * 60_000);
  const fmt   = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ics = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CareerPath Africa//EN',
    'BEGIN:VEVENT',
    `UID:${scheduledAt}-${Math.random().toString(36).slice(2)}@careerpathafrica`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${title}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${title.replace(/\s+/g, '-')}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function StudentCohortPage() {
  const { user } = useAuth();
  const [cohorts,     setCohorts]     = useState<Cohort[]>([]);
  const [classes,     setClasses]     = useState<Record<string, LiveClass[]>>({});
  const [members,     setMembers]     = useState<Record<string, Member[]>>({});
  const [assignments, setAssignments] = useState<Record<string, Assignment[]>>({});
  const [attendance,  setAttendance]  = useState<Record<string, boolean>>({});
  const [openMembers, setOpenMembers] = useState<string | null>(null);
  const [showAllSessions, setShowAllSessions] = useState<Record<string, boolean>>({});
  const [loading,     setLoading]     = useState(true);

  useEffect(() => {
    api.get('/portals/student/cohorts')
      .then(async r => {
        const data: Cohort[] = r.data ?? [];
        setCohorts(data);
        const [classEntries, assignmentEntries] = await Promise.all([
          Promise.all(data.map(async c => {
            try {
              const cr = await api.get(`/live/cohorts/${c.id}/classes`);
              return [c.id, cr.data ?? []] as [string, LiveClass[]];
            } catch { return [c.id, []] as [string, LiveClass[]]; }
          })),
          Promise.all(data.map(async c => {
            try {
              const ar = await api.get(`/education/cohorts/${c.id}/assignments`);
              return [c.id, ar.data ?? []] as [string, Assignment[]];
            } catch { return [c.id, []] as [string, Assignment[]]; }
          })),
        ]);
        setClasses(Object.fromEntries(classEntries));
        setAssignments(Object.fromEntries(assignmentEntries));

        const completedClasses = classEntries.flatMap(([, cls]) =>
          (cls as LiveClass[]).filter(c => c.status === 'COMPLETED')
        );
        if (completedClasses.length > 0 && user?.id) {
          const attendanceResults = await Promise.all(
            completedClasses.map(async cls => {
              try {
                const ar = await api.get(`/live/classes/${cls.id}/attendance`);
                const attended = (ar.data ?? []).some((a: { userId: string }) => a.userId === user.id);
                return [cls.id, attended] as [string, boolean];
              } catch { return [cls.id, false] as [string, boolean]; }
            })
          );
          setAttendance(Object.fromEntries(attendanceResults));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function loadMembers(cohortId: string) {
    if (members[cohortId]) { setOpenMembers(openMembers === cohortId ? null : cohortId); return; }
    try {
      const r = await api.get(`/portals/student/cohorts/${cohortId}/members`);
      setMembers(m => ({ ...m, [cohortId]: r.data ?? [] }));
      setOpenMembers(cohortId);
    } catch {}
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 space-y-4">
        <SkeletonCard lines={4} />
        <div className="space-y-2">
          <div className="h-2.5 w-36 rounded bg-cloud animate-pulse" />
          <div className="rounded-2xl border border-cloud bg-white shadow-card overflow-hidden">
            {[1,2,3].map(i => <SkeletonListRow key={i} />)}
          </div>
        </div>
        <div className="space-y-2">
          <div className="h-2.5 w-28 rounded bg-cloud animate-pulse" />
          <div className="rounded-2xl border border-cloud bg-white shadow-card overflow-hidden">
            {[1,2,3].map(i => <SkeletonListRow key={i} />)}
          </div>
        </div>
      </div>
    </div>
  );

  if (cohorts.length === 0) {
    return (
      <div className="flex flex-col min-h-full">
        <Topbar title="My Cohort" subtitle="Your learning group" />
        <div className="flex-1 flex items-center justify-center p-6">
          <Card className="max-w-sm w-full">
            <EmptyState
              icon="mentorship"
              title="Not in a cohort yet"
              description="Once you enroll in a package and an admin assigns you to a group, your cohort details will appear here."
              action={{ label: 'Browse packages', href: '/packages' }}
            />
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-full">
      <Topbar
        title="My Cohort"
        subtitle={`${cohorts.length} group${cohorts.length !== 1 ? 's' : ''}`}
      />

      {/* Overview shortcut */}
      <div className="bg-white border-b border-cloud px-5 py-2.5">
        <div className="max-w-3xl mx-auto flex items-center justify-end">
          <Link href="/student/cohorts"
            className="inline-flex items-center gap-1 text-xs font-medium text-azure hover:text-royal transition">
            Cohorts overview <Icon name="arrowRight" size={12} />
          </Link>
        </div>
      </div>

      <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 space-y-8">
        {cohorts.map(cohort => {
          const cohortClasses     = classes[cohort.id] ?? [];
          const cohortAssignments = assignments[cohort.id] ?? [];
          const cohortMembers     = members[cohort.id] ?? [];

          const liveClasses     = cohortClasses.filter(c => c.status === 'ACTIVE');
          const upcomingClasses = cohortClasses.filter(c => c.status === 'SCHEDULED');
          const pastClasses     = cohortClasses.filter(c => c.status === 'COMPLETED' || c.status === 'CANCELLED');

          const attendedCount  = pastClasses.filter(c => attendance[c.id] === true).length;
          const attendancePct  = pastClasses.length > 0
            ? Math.round((attendedCount / pastClasses.length) * 100)
            : null;
          const submittedCount = cohortAssignments.filter(a => !!a.submission).length;
          const overdueList    = cohortAssignments.filter(a => !a.submission && !!a.dueDate && new Date(a.dueDate) < new Date());

          const examDaysLeft = cohort.examDate
            ? Math.ceil((new Date(cohort.examDate).getTime() - Date.now()) / 86400000)
            : null;

          const showAll    = showAllSessions[cohort.id] ?? false;
          const visiblePast = showAll ? pastClasses : pastClasses.slice(0, 3);

          // Stats sections — only include whichever are available
          const statSections: { icon: React.ReactNode; value: string; label: string }[] = [];
          if (pastClasses.length > 0) {
            statSections.push({
              icon: <Icon name="check" size={14} className="text-green-600" />,
              value: attendancePct !== null ? `${attendedCount}/${pastClasses.length} (${attendancePct}%)` : '—',
              label: 'sessions attended',
            });
          }
          if (cohortAssignments.length > 0) {
            statSections.push({
              icon: <Icon name="assignments" size={13} />,
              value: `${submittedCount} / ${cohortAssignments.length}`,
              label: 'assignments submitted',
            });
          }

          return (
            <div key={cohort.id} className="space-y-4">

              {/* ── LIVE CLASS BANNER ── */}
              {liveClasses.map(cls => (
                <div key={cls.id} className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 flex items-center gap-4">
                  <div className="flex-shrink-0 flex items-center gap-2">
                    <span className="relative flex h-3 w-3">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500" />
                    </span>
                    <span className="text-xs font-bold text-red-600 uppercase tracking-wide">Live now</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy truncate">{cls.title}</p>
                    {cls.description && <p className="text-xs text-royal/50 truncate mt-0.5">{cls.description}</p>}
                  </div>
                  <Link href={`/student/live/${cls.id}`}
                    className="flex-shrink-0 rounded-xl bg-red-500 px-4 py-2 text-sm font-semibold text-white hover:bg-red-600 transition">
                    Join now
                  </Link>
                </div>
              ))}

              {/* ── EXAM COUNTDOWN ── */}
              {cohort.examDate && examDaysLeft !== null && (
                <div className={`rounded-2xl border px-5 py-4 flex items-center gap-5 ${
                  examDaysLeft <= 0     ? 'bg-surface border-cloud'
                  : examDaysLeft <= 7  ? 'bg-amber-50 border-amber-200'
                  : examDaysLeft <= 14 ? 'bg-amber-50/50 border-amber-100'
                  : 'bg-white border-cloud shadow-card'
                }`}>
                  <div className="flex-1 min-w-0">
                    {cohort.sittingLabel && (
                      <p className="text-xs font-medium text-royal/50 mb-0.5">{cohort.sittingLabel}</p>
                    )}
                    <p className="text-sm font-semibold text-navy">
                      {examDaysLeft <= 0
                        ? 'Your exam date has passed'
                        : examDaysLeft === 1 ? 'Exam is tomorrow!'
                        : `${examDaysLeft} days until your exam`}
                    </p>
                    <p className="text-xs text-royal/40 mt-0.5">
                      {new Date(cohort.examDate).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  {examDaysLeft > 0 && (
                    <div className={`flex-shrink-0 rounded-2xl px-5 py-3 text-center min-w-[72px] ${
                      examDaysLeft <= 7  ? 'bg-amber-500 text-white'
                      : examDaysLeft <= 14 ? 'bg-amber-100'
                      : 'bg-azure text-white'
                    }`}>
                      <p className={`text-3xl font-black leading-none tabular-nums ${examDaysLeft <= 14 && examDaysLeft > 7 ? 'text-amber-700' : ''}`}>
                        {examDaysLeft}
                      </p>
                      <p className={`text-[10px] font-semibold mt-0.5 uppercase tracking-wide ${examDaysLeft <= 14 && examDaysLeft > 7 ? 'text-amber-600' : 'opacity-70'}`}>
                        days
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ── COHORT IDENTITY CARD ── */}
              <Card padding="none" className="overflow-hidden">
                <div className="h-1 w-full bg-azure" />
                <div className="p-6">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-1">My Group</p>
                      <h2 className="text-xl font-bold text-navy">{cohort.name}</h2>
                      {cohort.sittingLabel && (
                        <span className="inline-block mt-1.5">
                          <Badge variant="active">{cohort.sittingLabel}</Badge>
                        </span>
                      )}
                      {/* Start date */}
                      {cohort.startDate && (
                        <p className="flex items-center gap-1.5 text-xs text-royal/50 mt-2">
                          <Icon name="calendar" size={11} className="text-azure flex-shrink-0" />
                          Started {new Date(cohort.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>
                      )}
                      {cohort.teacher && (
                        <div className="flex items-center gap-2.5 mt-4">
                          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-azure text-sm font-bold text-white flex-shrink-0">
                            {teacherName(cohort.teacher)[0]?.toUpperCase()}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-navy">{teacherName(cohort.teacher)}</p>
                            <p className="text-xs text-royal/50">Instructor</p>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-3 flex-shrink-0">
                      <div className="text-center rounded-xl bg-surface border border-cloud px-4 py-3 min-w-[64px]">
                        <p className="text-2xl font-bold text-navy tabular-nums">{cohort._count.students}</p>
                        <p className="text-xs text-royal/50 mt-0.5">students</p>
                      </div>
                      <div className="text-center rounded-xl bg-surface border border-cloud px-4 py-3 min-w-[64px]">
                        <p className="text-2xl font-bold text-navy tabular-nums">{cohort._count.liveClasses}</p>
                        <p className="text-xs text-royal/50 mt-0.5">sessions</p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Quick stats bar — flex to avoid divide-x breaking with single section */}
                {statSections.length > 0 && (
                  <div className="border-t border-cloud flex divide-x divide-cloud">
                    {statSections.map((s, i) => (
                      <div key={i} className="flex-1 px-5 py-3 flex items-center gap-2">
                        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-green-50 flex-shrink-0">
                          {s.icon}
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-navy">{s.value}</p>
                          <p className="text-[11px] text-royal/50">{s.label}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>

              {/* ── UPCOMING SESSIONS ── */}
              {upcomingClasses.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Upcoming Sessions</p>
                    <Badge variant="active">{upcomingClasses.length}</Badge>
                  </div>
                  <Card padding="none" className="divide-y divide-cloud">
                    {upcomingClasses.map(cls => (
                      <div key={cls.id} className="flex items-center gap-4 px-4 py-4">
                        <div className="flex-shrink-0 text-center min-w-[40px]">
                          <p className="text-base font-bold text-navy leading-none">{new Date(cls.scheduledAt).getDate()}</p>
                          <p className="text-[10px] font-medium text-royal/50 uppercase mt-0.5">
                            {new Date(cls.scheduledAt).toLocaleDateString('en-GB', { month: 'short' })}
                          </p>
                        </div>
                        <div className="w-px h-8 bg-cloud flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-navy truncate">{cls.title}</p>
                          <p className="text-xs text-royal/50 mt-0.5">
                            {fmtTime(cls.scheduledAt)}
                            {cls.durationMins ? ` · ${cls.durationMins} min` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge>Scheduled</Badge>
                          <button
                            onClick={() => addToCalendar(cls.title, cls.scheduledAt, cls.durationMins)}
                            title="Add to calendar"
                            className="flex items-center justify-center h-7 w-7 rounded-lg border border-cloud bg-surface text-royal/40 hover:border-azure hover:text-azure transition">
                            <Icon name="calendar" size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </Card>
                </div>
              )}

              {/* ── PAST SESSIONS ── */}
              {pastClasses.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 px-1">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Past Sessions</p>
                    <Badge>{pastClasses.length}</Badge>
                    {attendancePct !== null && (
                      <span className="text-[10px] text-royal/40">
                        {attendancePct}% attendance
                      </span>
                    )}
                  </div>
                  <Card padding="none" className="divide-y divide-cloud">
                    {visiblePast.map(cls => {
                      const isCancelled = cls.status === 'CANCELLED';
                      const wasPresent  = attendance[cls.id] === true;
                      const wasAbsent   = cls.id in attendance && attendance[cls.id] === false;
                      return (
                        <div key={cls.id} className={`flex items-center gap-4 px-4 py-3.5 ${isCancelled ? 'opacity-50' : ''}`}>
                          <div className="flex-shrink-0 text-center min-w-[40px]">
                            <p className="text-sm font-semibold text-royal/50 leading-none">{new Date(cls.scheduledAt).getDate()}</p>
                            <p className="text-[10px] font-medium text-royal/30 uppercase mt-0.5">
                              {new Date(cls.scheduledAt).toLocaleDateString('en-GB', { month: 'short' })}
                            </p>
                          </div>
                          <div className="w-px h-7 bg-cloud flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-medium truncate ${isCancelled ? 'line-through text-royal/40' : 'text-navy'}`}>{cls.title}</p>
                            <p className="text-xs text-royal/40">{fmtTime(cls.scheduledAt)}{cls.durationMins ? ` · ${cls.durationMins} min` : ''}</p>
                          </div>
                          <div className="flex-shrink-0">
                            {isCancelled ? (
                              <Badge variant="muted">Cancelled</Badge>
                            ) : wasPresent ? (
                              <span className="flex items-center gap-1 rounded-md bg-green-50 border border-green-100 px-2.5 py-1 text-xs font-medium text-green-700">
                                <Icon name="check" size={11} /> Present
                              </span>
                            ) : wasAbsent ? (
                              <Badge variant="muted">Absent</Badge>
                            ) : (
                              <Badge variant="muted">Done</Badge>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </Card>
                  {pastClasses.length > 3 && (
                    <button
                      onClick={() => setShowAllSessions(s => ({ ...s, [cohort.id]: !showAll }))}
                      className="w-full text-center text-xs font-medium text-royal/40 hover:text-azure py-1 transition">
                      {showAll ? 'Show less' : `Show ${pastClasses.length - 3} more sessions`}
                    </button>
                  )}
                </div>
              )}

              {/* ── ASSIGNMENTS ── */}
              {cohortAssignments.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between px-1">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Assignments</p>
                      <Badge>{cohortAssignments.length}</Badge>
                      {overdueList.length > 0 && (
                        <span className="rounded-md bg-red-50 border border-red-100 px-2 py-0.5 text-xs font-medium text-red-600">
                          {overdueList.length} overdue
                        </span>
                      )}
                    </div>
                    <Link href="/student/assignments" className="text-xs font-medium text-azure hover:text-royal transition">
                      View all
                    </Link>
                  </div>

                  <Card padding="none" className="divide-y divide-cloud">
                    {cohortAssignments.slice(0, 5).map(a => {
                      const submitted = !!a.submission;
                      const graded    = submitted && a.submission?.score != null;
                      const overdue   = !submitted && !!a.dueDate && new Date(a.dueDate) < new Date();
                      const daysLeft  = a.dueDate && !submitted
                        ? Math.ceil((new Date(a.dueDate).getTime() - Date.now()) / 86400000)
                        : null;
                      const scorePct  = graded && a.maxPoints > 0
                        ? Math.round((a.submission!.score! / a.maxPoints) * 100)
                        : null;

                      return (
                        <div key={a.id} className={`flex items-center gap-3 px-4 py-3.5 ${overdue ? 'bg-red-50/30' : ''}`}>
                          <IconBox className={`h-8 w-8 rounded-lg ${
                            graded    ? 'bg-green-50 text-green-600'
                            : submitted ? 'bg-cloud text-azure'
                            : overdue   ? 'bg-red-50 text-red-400'
                            : ''
                          }`}>
                            <Icon name={graded ? 'check' : 'assignments'} size={14} />
                          </IconBox>

                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-navy truncate">{a.title}</p>
                            <p className={`text-xs mt-0.5 ${overdue ? 'text-red-500 font-medium' : 'text-royal/40'}`}>
                              {graded    ? `Graded · ${a.submission!.score} / ${a.maxPoints} pts`
                              : submitted ? 'Submitted · awaiting grade'
                              : overdue   ? 'Overdue'
                              : daysLeft === 0 ? 'Due today'
                              : daysLeft === 1 ? 'Due tomorrow'
                              : daysLeft != null ? `Due in ${daysLeft} days`
                              : 'No due date'}
                            </p>
                          </div>

                          {graded && scorePct !== null ? (
                            <span className={`flex-shrink-0 rounded-xl px-3 py-1.5 text-sm font-bold ${
                              scorePct >= 70 ? 'bg-green-50 text-green-700 border border-green-100'
                              : scorePct >= 50 ? 'bg-amber-50 text-amber-700 border border-amber-100'
                              : 'bg-red-50 text-red-600 border border-red-100'
                            }`}>
                              {scorePct}%
                            </span>
                          ) : !submitted ? (
                            <Link
                              href={`/student/assignments?id=${a.id}`}
                              className="flex-shrink-0 rounded-lg bg-azure px-3 py-1.5 text-xs font-semibold text-white hover:bg-royal transition">
                              Submit
                            </Link>
                          ) : null}
                        </div>
                      );
                    })}
                  </Card>
                  {cohortAssignments.length > 5 && (
                    <Link href="/student/assignments"
                      className="block text-center text-xs font-medium text-royal/40 hover:text-azure py-1 transition">
                      +{cohortAssignments.length - 5} more on assignments page
                    </Link>
                  )}
                </div>
              )}

              {/* ── CLASSMATES ── */}
              <Card padding="none" className="overflow-hidden">
                <button
                  onClick={() => loadMembers(cohort.id)}
                  className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-surface transition"
                >
                  <IconBox>
                    <Icon name="mentorship" size={16} />
                  </IconBox>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy">Classmates</p>
                    <p className="text-xs text-royal/50">{cohort._count.students} student{cohort._count.students !== 1 ? 's' : ''} in your group</p>
                  </div>
                  <Icon name="chevronRight" size={14} className={`text-royal/30 flex-shrink-0 transition-transform duration-200 ${openMembers === cohort.id ? 'rotate-90' : ''}`} />
                </button>
                {openMembers === cohort.id && (
                  <div className="border-t border-cloud px-5 py-4">
                    {cohortMembers.length === 0 ? (
                      <p className="text-sm text-royal/50 py-2 text-center">No classmates yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {cohortMembers.map(m => {
                          const hasName = !!(m.firstName || m.lastName);
                          const name = hasName
                            ? [m.firstName, m.lastName].filter(Boolean).join(' ')
                            : m.email.split('@')[0];
                          const inits = hasName
                            ? [m.firstName?.[0], m.lastName?.[0]].filter(Boolean).join('').toUpperCase()
                            : m.email[0].toUpperCase();
                          return (
                            <div key={m.id} className="flex items-center gap-3 rounded-xl bg-surface px-3 py-2.5">
                              <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-azure text-xs font-bold text-white">
                                {inits}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium text-navy truncate">{name}</p>
                                <p className="text-xs text-royal/40">Student</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </Card>

              {/* ── MENTORSHIP CTA ── */}
              {cohort.teacher && (
                <Card className="flex items-center gap-4">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-azure text-sm font-bold text-white">
                    {teacherName(cohort.teacher)[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy">Book a 1-on-1 with {teacherName(cohort.teacher)}</p>
                    <p className="text-xs text-royal/50 mt-0.5">Schedule a private mentorship session at your convenience</p>
                  </div>
                  <Link href="/student/mentorship"
                    className="flex-shrink-0 btn-primary text-xs px-4 py-2">
                    Book now
                  </Link>
                </Card>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
}
