'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import api from '@/lib/api';

interface LiveClass {
  id: string; title: string; description?: string;
  scheduledAt: string; durationMins?: number;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  dailyRoomUrl?: string;
}
interface Cohort { id: string; name: string; _count: { students: number }; classes?: LiveClass[]; }

const STATUS_COLOR: Record<string, 'active' | 'muted' | 'default'> = {
  ACTIVE: 'active', SCHEDULED: 'muted', COMPLETED: 'default', CANCELLED: 'muted',
};
const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Live', SCHEDULED: 'Scheduled', COMPLETED: 'Done', CANCELLED: 'Cancelled',
};

// Start button only shows within 30 min of scheduled time
function canStartNow(scheduledAt: string): boolean {
  const diff = new Date(scheduledAt).getTime() - Date.now();
  return diff <= 30 * 60_000; // within 30 min (or already past)
}

export default function TeacherLivePage() {
  const [cohorts,    setCohorts]    = useState<Cohort[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [expanded,   setExpanded]   = useState<string | null>(null);
  const [scheduling, setScheduling] = useState<string | null>(null);
  const [acting,     setActing]     = useState<string | null>(null);
  const [confirming, setConfirming] = useState<{ id: string; action: 'cancel' | 'end' } | null>(null);
  const [showAllPast, setShowAllPast] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState({ title: '', description: '', scheduledAt: '', durationMinutes: '90' });

  // datetime-local min = now (no past scheduling)
  const minDateTime = new Date(Date.now() - new Date().getTimezoneOffset() * 60_000)
    .toISOString().slice(0, 16);

  async function loadCohorts() {
    const r = await api.get('/portals/teacher/cohorts');
    const list: Cohort[] = r.data;
    const withClasses = await Promise.all(
      list.map(async c => {
        try {
          const cr = await api.get(`/live/cohorts/${c.id}/classes`);
          return { ...c, classes: cr.data };
        } catch { return { ...c, classes: [] }; }
      }),
    );
    setCohorts(withClasses);
  }

  useEffect(() => {
    loadCohorts()
      .catch(() => notify.error('Failed to load cohorts'))
      .finally(() => setLoading(false));
  }, []);

  async function scheduleClass(cohortId: string, e: React.FormEvent) {
    e.preventDefault();
    setActing(cohortId);
    try {
      await api.post(`/live/cohorts/${cohortId}/classes`, {
        title: form.title,
        description: form.description || undefined,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        durationMinutes: parseInt(form.durationMinutes),
      });
      setScheduling(null);
      setForm({ title: '', description: '', scheduledAt: '', durationMinutes: '90' });
      await loadCohorts();
      notify.success('Class scheduled');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to schedule class');
    } finally { setActing(null); }
  }

  async function startClass(classId: string) {
    setActing(classId);
    try {
      await api.patch(`/live/classes/${classId}/start`);
      await loadCohorts();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to start class');
    } finally { setActing(null); }
  }

  async function executeConfirmed() {
    if (!confirming) return;
    const { id, action } = confirming;
    setConfirming(null);
    setActing(id);
    try {
      if (action === 'cancel') {
        await api.delete(`/live/classes/${id}`);
        notify.success('Class cancelled');
      } else {
        await api.patch(`/live/classes/${id}/end`);
        notify.success('Class ended');
      }
      await loadCohorts();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? `Failed to ${action} class`);
    } finally { setActing(null); }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-4">
        {[1, 2].map(i => <SkeletonCard key={i} lines={3} />)}
      </div>
    </div>
  );

  const allClasses  = cohorts.flatMap(c => (c.classes ?? []).map(cl => ({ ...cl, cohortName: c.name })));
  const activeClass = allClasses.find(c => c.status === 'ACTIVE');

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Live Classes" subtitle="Schedule, start and manage your live sessions" />

      <div className="flex-1 p-6 pb-28 lg:pb-6 space-y-6">

        {/* Active class banner */}
        {activeClass && (
          <div className="rounded-2xl bg-navy p-5 flex items-center gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-azure/20">
              <Icon name="live" size={18} className="text-azure animate-pulse" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">LIVE NOW</p>
              <p className="text-sm font-bold text-white truncate">{activeClass.title}</p>
              <p className="text-xs text-white/40">{(activeClass as any).cohortName}</p>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              <Link href={`/teacher/live/${activeClass.id}`}>
                <Button size="sm"><Icon name="live" size={13} /> Join room</Button>
              </Link>
              <Button size="sm" variant="secondary" loading={acting === activeClass.id}
                onClick={() => setConfirming({ id: activeClass.id, action: 'end' })}>
                End
              </Button>
            </div>
          </div>
        )}

        {/* Cohorts */}
        {cohorts.length === 0 ? (
          <Card padding="lg">
            <EmptyState
              icon="live"
              title="No cohorts yet"
              description="Create a cohort first from the Cohorts page to schedule live classes"
            />
          </Card>
        ) : (
          <div className="space-y-4">
            {cohorts.map(cohort => {
              const classes   = cohort.classes ?? [];
              const isOpen    = expanded === cohort.id;
              // Fix: only SCHEDULED + ACTIVE are "upcoming", exclude CANCELLED
              const upcoming  = classes.filter(c => c.status === 'SCHEDULED' || c.status === 'ACTIVE');
              const completed = classes.filter(c => c.status === 'COMPLETED');
              const cancelled = classes.filter(c => c.status === 'CANCELLED');
              const showAll   = showAllPast[cohort.id] ?? false;

              return (
                <Card key={cohort.id} padding="none" className="overflow-hidden">
                  {/* Cohort header */}
                  <button onClick={() => setExpanded(isOpen ? null : cohort.id)}
                    className="flex items-center gap-4 w-full px-5 py-4 text-left hover:bg-cloud/20 transition">
                    <IconBox className="h-10 w-10 rounded-xl flex-shrink-0">
                      <Icon name="mentorship" size={18} />
                    </IconBox>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-navy">{cohort.name}</p>
                      <p className="text-xs text-royal/50">
                        {cohort._count.students} students · {upcoming.length} upcoming class{upcoming.length !== 1 ? 'es' : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      {upcoming.some(c => c.status === 'ACTIVE') && (
                        <Badge variant="active">Live</Badge>
                      )}
                      <button onClick={e => { e.stopPropagation(); setScheduling(cohort.id); setExpanded(cohort.id); }}
                        className="flex items-center gap-1.5 rounded-xl border border-cloud px-3 py-1.5 text-xs font-semibold text-navy hover:bg-cloud transition">
                        <Icon name="add" size={12} /> Schedule
                      </button>
                      <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={14} className="text-royal/40" />
                    </div>
                  </button>

                  {isOpen && (
                    <div className="border-t border-cloud">
                      {/* Schedule form */}
                      {scheduling === cohort.id && (
                        <form onSubmit={e => scheduleClass(cohort.id, e)}
                          className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end bg-azure/5 border-b border-cloud px-5 py-4">
                          <div className="space-y-1 sm:col-span-2">
                            <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Class title</label>
                            <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                              placeholder="e.g. Introduction to Python" required
                              className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Description (optional)</label>
                            <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                              placeholder="Topics covered, materials needed…"
                              className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Date & time</label>
                            <input type="datetime-local" value={form.scheduledAt} min={minDateTime}
                              onChange={e => setForm(f => ({ ...f, scheduledAt: e.target.value }))} required
                              className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Duration</label>
                            <div className="relative">
                              <Icon name="clock" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-azure/40 pointer-events-none" />
                              <select value={form.durationMinutes} onChange={e => setForm(f => ({ ...f, durationMinutes: e.target.value }))}
                                className="w-full appearance-none rounded-xl border border-cloud bg-white pl-9 pr-8 py-2 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/10 transition cursor-pointer">
                                <option value="30">30 min</option>
                                <option value="45">45 min</option>
                                <option value="60">60 min</option>
                                <option value="90">90 min</option>
                                <option value="120">120 min</option>
                              </select>
                              <Icon name="chevronDown" size={12} className="absolute right-3 top-1/2 -translate-y-1/2 text-royal/30 pointer-events-none" />
                            </div>
                          </div>
                          <div className="sm:col-span-2 flex gap-2">
                            <Button type="submit" size="sm" loading={acting === cohort.id}>Save</Button>
                            <Button type="button" size="sm" variant="secondary" onClick={() => setScheduling(null)}>Cancel</Button>
                          </div>
                        </form>
                      )}

                      {/* Upcoming classes */}
                      {upcoming.length > 0 && (
                        <div className="divide-y divide-cloud">
                          {upcoming.map(cls => {
                            const ready = canStartNow(cls.scheduledAt);
                            return (
                              <div key={cls.id} className="flex items-center gap-4 px-5 py-3.5">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-navy truncate">{cls.title}</p>
                                  <p className="text-xs text-royal/50">
                                    {new Date(cls.scheduledAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                                    {cls.durationMins ? ` · ${cls.durationMins} min` : ''}
                                  </p>
                                  {cls.description && (
                                    <p className="text-[11px] text-royal/40 truncate mt-0.5">{cls.description}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                  <Badge variant={STATUS_COLOR[cls.status]}>{STATUS_LABEL[cls.status] ?? cls.status}</Badge>
                                  {cls.status === 'SCHEDULED' && (
                                    <>
                                      {ready ? (
                                        <Button size="sm" loading={acting === cls.id} onClick={() => startClass(cls.id)}>
                                          <Icon name="live" size={13} /> Start
                                        </Button>
                                      ) : (
                                        <span className="text-[10px] text-royal/30 px-2">
                                          {(() => {
                                            const mins = Math.ceil((new Date(cls.scheduledAt).getTime() - Date.now()) / 60_000);
                                            const hrs  = Math.floor(mins / 60);
                                            return hrs > 0 ? `in ${hrs}h ${mins % 60}m` : `in ${mins}m`;
                                          })()}
                                        </span>
                                      )}
                                      <button onClick={() => setConfirming({ id: cls.id, action: 'cancel' })}
                                        className="text-royal/30 hover:text-azure transition p-1">
                                        <Icon name="trash" size={14} />
                                      </button>
                                    </>
                                  )}
                                  {cls.status === 'ACTIVE' && (
                                    <Link href={`/teacher/live/${cls.id}`}>
                                      <Button size="sm"><Icon name="live" size={13} /> Join</Button>
                                    </Link>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Completed classes */}
                      {completed.length > 0 && (
                        <div className="px-5 py-3 border-t border-cloud">
                          <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/30 mb-2">
                            {completed.length} completed class{completed.length !== 1 ? 'es' : ''}
                          </p>
                          <div className="divide-y divide-cloud/50">
                            {(showAll ? completed : completed.slice(0, 3)).map(cls => (
                              <div key={cls.id} className="flex items-center justify-between py-2 opacity-50">
                                <p className="text-xs text-navy truncate">{cls.title}</p>
                                <p className="text-[10px] text-royal/40 ml-3 flex-shrink-0">
                                  {new Date(cls.scheduledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                </p>
                              </div>
                            ))}
                          </div>
                          {completed.length > 3 && (
                            <button
                              onClick={() => setShowAllPast(s => ({ ...s, [cohort.id]: !showAll }))}
                              className="mt-2 text-[10px] font-semibold text-royal/40 hover:text-azure transition">
                              {showAll ? 'Show less' : `Show ${completed.length - 3} more`}
                            </button>
                          )}
                        </div>
                      )}

                      {/* Cancelled — collapsed by default */}
                      {cancelled.length > 0 && (
                        <div className="px-5 py-2 border-t border-cloud/50">
                          <p className="text-[10px] text-royal/20">{cancelled.length} cancelled class{cancelled.length !== 1 ? 'es' : ''}</p>
                        </div>
                      )}

                      {upcoming.length === 0 && completed.length === 0 && cancelled.length === 0 && (
                        <div className="px-5 py-6 text-center">
                          <p className="text-xs text-royal/40">No classes yet. Click Schedule to add one.</p>
                        </div>
                      )}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Confirm dialog */}
      <ConfirmDialog
        open={!!confirming}
        onOpenChange={open => { if (!open) setConfirming(null); }}
        title={confirming?.action === 'cancel' ? 'Cancel this class?' : 'End class?'}
        description={confirming?.action === 'cancel'
          ? 'This will remove the scheduled class and cannot be undone.'
          : 'All participants will be disconnected immediately.'}
        confirmLabel={confirming?.action === 'cancel' ? 'Cancel class' : 'End class'}
        cancelLabel="Keep"
        variant="danger"
        loading={!!acting}
        onConfirm={executeConfirmed}
      />
    </div>
  );
}
