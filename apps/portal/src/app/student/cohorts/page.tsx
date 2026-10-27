'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import api from '@/lib/api';

interface Teacher {
  id: string; email: string;
  name: string | null; firstName: string | null; lastName: string | null;
}
interface Cohort {
  id: string; name: string; teacherId: string;
  sittingLabel: string | null; examDate: string | null; startDate: string | null;
  teacher: Teacher | null;
  _count: { students: number; liveClasses: number };
}
interface LiveClass {
  id: string; title: string; scheduledAt: string; status: string;
}

function teacherName(t: Teacher | null): string {
  if (!t) return 'No teacher assigned';
  if (t.firstName || t.lastName) return `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim();
  return t.name ?? t.email.split('@')[0];
}

function examCountdown(examDate: string | null): { label: string; urgent: boolean } | null {
  if (!examDate) return null;
  const days = Math.ceil((new Date(examDate).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return { label: `Exam passed ${Math.abs(days)}d ago`, urgent: false };
  if (days === 0) return { label: 'Exam is today!', urgent: true };
  return { label: `${days} day${days !== 1 ? 's' : ''} to exam`, urgent: days <= 14 };
}

export default function StudentCohortsPage() {
  const [cohorts,     setCohorts]     = useState<Cohort[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [expanded,    setExpanded]    = useState<string | null>(null);
  const [classes,     setClasses]     = useState<Record<string, LiveClass[]>>({});
  const [loadingCls,  setLoadingCls]  = useState<string | null>(null);

  useEffect(() => {
    api.get('/portals/student/cohorts')
      .then(r => setCohorts(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function toggleCohort(id: string) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    if (classes[id]) return;
    setLoadingCls(id);
    try {
      const r = await api.get(`/live/cohorts/${id}/classes`);
      setClasses(prev => ({ ...prev, [id]: r.data ?? [] }));
    } catch {
      setClasses(prev => ({ ...prev, [id]: [] }));
    } finally {
      setLoadingCls(null);
    }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-6 py-6 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[1,2].map(i => (
            <div key={i} className="rounded-2xl border border-cloud bg-white p-5 space-y-2">
              <div className="h-2.5 w-20 rounded bg-cloud animate-pulse" />
              <div className="h-8 w-12 rounded bg-cloud animate-pulse" />
            </div>
          ))}
        </div>
        {[1,2].map(i => <SkeletonCard key={i} lines={3} />)}
      </div>
    </div>
  );

  const totalLive = cohorts.reduce((s, c) => s + c._count.liveClasses, 0);

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="My Cohorts" subtitle="Your study groups and live class schedule" />

      <div className="flex-1 p-4 md:p-6 space-y-5 max-w-4xl w-full mx-auto">

        {cohorts.length === 0 ? (
          <Card>
            <EmptyState
              icon="mentorship"
              title="No cohorts yet"
              description="You haven't been placed in a study group. Buy a package that includes a cohort, or ask your admin to enroll you."
              action={{ label: 'Browse packages', href: '/packages' }}
            />
          </Card>
        ) : (
          <>
            {/* Stats — only cohorts + live classes; no misleading total-students sum */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 max-w-xs">
              {[
                { label: 'Cohorts',      value: cohorts.length, icon: 'mentorship' as const },
                { label: 'Live classes', value: totalLive,      icon: 'live'       as const },
              ].map(s => (
                <Card key={s.label} padding="md">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">{s.label}</p>
                      <p className="mt-1 text-2xl font-bold text-navy">{s.value}</p>
                    </div>
                    <IconBox><Icon name={s.icon} size={14} /></IconBox>
                  </div>
                </Card>
              ))}
            </div>

            {/* Cohort list */}
            <div className="space-y-3">
              {cohorts.map(c => {
                const isOpen    = expanded === c.id;
                const countdown = examCountdown(c.examDate);
                const cohortClasses: LiveClass[] = classes[c.id] ?? [];
                // Fix: filter for SCHEDULED only (not filter-out ENDED which doesn't exist in API)
                const upcoming = cohortClasses.filter(
                  cl => cl.status === 'SCHEDULED'
                ).slice(0, 3);
                // Fix: API uses 'ACTIVE' for live status (consistent with cohort/page.tsx)
                const liveNow  = cohortClasses.find(cl => cl.status === 'ACTIVE');

                return (
                  <Card key={c.id} padding="none" className="overflow-hidden">

                    {/* Header row */}
                    <div className="flex items-center gap-4 px-5 py-4 w-full">
                      <button
                        onClick={() => toggleCohort(c.id)}
                        className="flex items-center gap-4 flex-1 min-w-0 text-left hover:opacity-80 transition"
                      >
                      <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-navy text-sm font-bold text-white">
                        {c.name[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-bold text-navy truncate">{c.name}</p>
                          {liveNow && (
                            <span className="flex items-center gap-1 rounded-full bg-azure px-2 py-0.5 text-[10px] font-bold text-white">
                              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                              LIVE NOW
                            </span>
                          )}
                          {c.sittingLabel && (
                            <Badge variant="active">{c.sittingLabel}</Badge>
                          )}
                        </div>
                        <p className="text-xs text-royal/50 mt-0.5 truncate">
                          {teacherName(c.teacher)}
                        </p>
                        {countdown && (
                          <p className={`text-[10px] font-semibold mt-0.5 ${countdown.urgent ? 'text-amber-600' : 'text-royal/40'}`}>
                            {countdown.label}
                            {c.examDate && (
                              <> · {new Date(c.examDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                            )}
                          </p>
                        )}
                      </div>
                      <div className="hidden sm:flex items-center gap-4 flex-shrink-0 mr-2 text-xs text-royal/50">
                        <span className="flex items-center gap-1.5">
                          <Icon name="graduate" size={12} /> {c._count.students}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Icon name="live" size={12} /> {c._count.liveClasses}
                        </span>
                      </div>
                      <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={14} className="text-royal/40 flex-shrink-0" />
                      </button>

                      {/* Quick-join: only visible when a session is live */}
                      {liveNow && (
                        <Link
                          href={`/student/live/${liveNow.id}`}
                          onClick={e => e.stopPropagation()}
                          className="flex-shrink-0 flex items-center gap-1.5 rounded-xl bg-azure px-3 py-2 text-xs font-bold text-white hover:bg-royal transition ml-1"
                        >
                          <Icon name="play" size={12} /> Join
                        </Link>
                      )}
                    </div>

                    {/* Expanded panel */}
                    {isOpen && (
                      <div className="border-t border-cloud">
                        {loadingCls === c.id ? (
                          <div className="flex items-center justify-center py-10">
                            <div className="h-5 w-5 animate-spin rounded-full border-2 border-azure border-t-transparent" />
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-cloud">

                            {/* Instructor info */}
                            <div className="p-5 space-y-4">
                              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">INSTRUCTOR</p>
                              {c.teacher ? (
                                <div className="flex items-center gap-3">
                                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-azure/10 text-sm font-bold text-azure">
                                    {teacherName(c.teacher)[0].toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-sm font-semibold text-navy">{teacherName(c.teacher)}</p>
                                    <p className="text-xs text-royal/40">Instructor</p>
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-royal/40">No instructor assigned yet</p>
                              )}

                              {/* Cohort metadata */}
                              <div className="space-y-2 pt-1">
                                {c.startDate && (
                                  <div className="flex items-center gap-2 text-xs text-royal/50">
                                    <Icon name="calendar" size={12} className="text-azure flex-shrink-0" />
                                    Started {new Date(c.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </div>
                                )}
                                {c.examDate && (
                                  <div className="flex items-center gap-2 text-xs text-royal/50">
                                    <Icon name="clock" size={12} className="text-amber-500 flex-shrink-0" />
                                    Exam on {new Date(c.examDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                  </div>
                                )}
                                <div className="flex items-center gap-2 text-xs text-royal/50">
                                  <Icon name="graduate" size={12} className="text-azure flex-shrink-0" />
                                  {c._count.students} student{c._count.students !== 1 ? 's' : ''} in this cohort
                                </div>
                              </div>

                              {/* Quick links */}
                              <div className="flex gap-2 pt-1 flex-wrap">
                                <Link href={`/student/assignments?cohortId=${c.id}`}
                                  className="flex items-center gap-1.5 rounded-lg border border-cloud px-3 py-2 text-xs font-semibold text-navy hover:bg-cloud transition">
                                  <Icon name="notebook" size={12} /> Assignments
                                </Link>
                                <Link href="/student/mentorship"
                                  className="flex items-center gap-1.5 rounded-lg border border-cloud px-3 py-2 text-xs font-semibold text-navy hover:bg-cloud transition">
                                  <Icon name="mentorship" size={12} /> Mentorship
                                </Link>
                              </div>
                            </div>

                            {/* Upcoming live classes */}
                            <div className="p-5 space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">
                                  UPCOMING SESSIONS
                                </p>
                                <Link href="/student/live"
                                  className="flex items-center gap-1 text-[10px] font-semibold text-azure hover:text-royal transition">
                                  View all <Icon name="arrowRight" size={10} />
                                </Link>
                              </div>

                              {liveNow && (
                                <Link href={`/student/live/${liveNow.id}`}
                                  className="flex items-center gap-3 rounded-xl bg-azure px-4 py-3 text-white hover:bg-royal transition">
                                  <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-white/20">
                                    <Icon name="live" size={14} />
                                  </span>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold truncate">{liveNow.title}</p>
                                    <p className="text-[10px] text-white/70">Live right now — tap to join</p>
                                  </div>
                                  <Icon name="arrowRight" size={13} className="flex-shrink-0 opacity-70" />
                                </Link>
                              )}

                              {upcoming.length === 0 && !liveNow ? (
                                <p className="text-xs text-royal/40 py-4 text-center">No upcoming sessions scheduled</p>
                              ) : (
                                <div className="space-y-2">
                                  {upcoming.map(cls => {
                                    const date = new Date(cls.scheduledAt);
                                    return (
                                      <div key={cls.id} className="flex items-center gap-3 rounded-xl border border-cloud px-3 py-2.5">
                                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-cloud">
                                          <Icon name="live" size={13} className="text-royal/50" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <p className="text-xs font-semibold text-navy truncate">{cls.title}</p>
                                          <p className="text-[10px] text-royal/40">
                                            {date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                            {' · '}
                                            {date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                          </p>
                                        </div>
                                        <Badge variant="muted">Upcoming</Badge>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>

                          </div>
                        )}
                      </div>
                    )}

                  </Card>
                );
              })}
            </div>

            {/* Upsell — only when student has fewer than 2 cohorts */}
            {cohorts.length < 2 && (
              <Card className="flex items-start gap-4">
                <IconBox><Icon name="packages" size={16} /></IconBox>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-navy">Want to join more cohorts?</p>
                  <p className="text-xs text-royal/50 mt-1 leading-relaxed">
                    Each package you purchase can include a dedicated study group with live sessions and an assigned instructor.
                  </p>
                  <Link href="/packages"
                    className="mt-3 inline-flex items-center gap-1.5 btn-primary text-xs px-4 py-2">
                    Browse packages <Icon name="arrowRight" size={12} />
                  </Link>
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
