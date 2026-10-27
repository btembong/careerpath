'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { notify } from '@/lib/notify';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTopbar, SkeletonTable } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

type StatusFilter = 'all' | 'ACTIVE' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED';

const STATUS_BADGE: Record<string, 'active' | 'muted' | 'default'> = {
  ACTIVE:    'active',
  SCHEDULED: 'muted',
  COMPLETED: 'default',
  CANCELLED: 'muted',
};

function teacherName(t?: any) {
  if (!t) return '—';
  if (t.firstName || t.lastName) return `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim();
  return t.email ?? '—';
}

export default function AdminLivePage() {
  const [data, setData]     = useState<{ stats: any; classes: any[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter]   = useState<StatusFilter>('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    api.get('/live/admin/overview')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function forceEnd(classId: string) {
    setActing(classId);
    try {
      await api.patch(`/live/classes/${classId}/end`);
      setData(prev => prev ? {
        ...prev,
        classes: prev.classes.map(c => c.id === classId ? { ...c, status: 'COMPLETED' } : c),
      } : prev);
      notify.success('Class ended');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to end class');
    } finally { setActing(null); }
  }

  async function cancelClass(classId: string) {
    setActing(classId);
    try {
      await api.patch(`/live/classes/${classId}/cancel`);
      setData(prev => prev ? {
        ...prev,
        classes: prev.classes.map(c => c.id === classId ? { ...c, status: 'CANCELLED' } : c),
      } : prev);
      notify.success('Class cancelled');
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to cancel class');
    } finally { setActing(null); }
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

  const stats = data?.stats ?? {};
  const classes = data?.classes ?? [];
  const filtered = filter === 'all' ? classes : classes.filter(c => c.status === filter);

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Live Classes" subtitle="All cohort sessions across all teachers" />
      <div className="flex-1 p-4 md:p-6 space-y-5 max-w-5xl w-full mx-auto">

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {([
            { key: 'active',    label: 'Live now',  color: 'text-azure'   },
            { key: 'scheduled', label: 'Scheduled', color: 'text-royal'   },
            { key: 'completed', label: 'Completed', color: 'text-navy'    },
            { key: 'cancelled', label: 'Cancelled', color: 'text-royal/40'},
            { key: 'totalAttendance', label: 'Total joins', color: 'text-navy' },
          ]).map(s => (
            <Card key={s.key} className="flex flex-col items-center py-4 text-center">
              <p className={`text-2xl font-black ${s.color}`}>{stats[s.key] ?? 0}</p>
              <p className="text-[10px] font-semibold text-royal/50 mt-0.5">{s.label}</p>
            </Card>
          ))}
        </div>

        {/* Filter tabs */}
        <div className="flex gap-1 rounded-xl border border-cloud bg-surface p-1 w-fit flex-wrap">
          {(['all', 'ACTIVE', 'SCHEDULED', 'COMPLETED', 'CANCELLED'] as StatusFilter[]).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all capitalize
                ${filter === f ? 'bg-white text-navy shadow-sm border border-cloud' : 'text-royal/50 hover:text-navy'}`}>
              {f === 'all' ? 'All' : f.charAt(0) + f.slice(1).toLowerCase()}
              {f !== 'all' && (
                <span className="ml-1.5 text-[10px] text-royal/40">
                  {f === 'ACTIVE' ? stats.active : f === 'SCHEDULED' ? stats.scheduled : f === 'COMPLETED' ? stats.completed : stats.cancelled}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Class list */}
        {filtered.length === 0 ? (
          <EmptyState icon="live" title="No classes" description={`No ${filter === 'all' ? '' : filter.toLowerCase()} live classes`} />
        ) : (
          <div className="space-y-2">
            {filtered.map(cls => {
              const isExpanded = expanded === cls.id;
              return (
                <Card key={cls.id} padding="none" className="overflow-hidden">
                  {/* Row */}
                  <button onClick={() => setExpanded(isExpanded ? null : cls.id)}
                    className="flex w-full items-center gap-4 px-5 py-4 text-left hover:bg-surface transition">
                    <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl
                      ${cls.status === 'ACTIVE' ? 'bg-azure' : 'bg-cloud'}`}>
                      <Icon name="live" size={16}
                        className={cls.status === 'ACTIVE' ? 'text-white animate-pulse' : 'text-royal/40'} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy truncate">{cls.title}</p>
                      <p className="text-[11px] text-royal/50 mt-0.5">
                        {cls.cohort?.name}
                        {cls.cohort?.teacher && <> · <span className="text-azure">{teacherName(cls.cohort.teacher)}</span></>}
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <p className="text-[11px] text-royal/40 hidden sm:block">
                        {new Date(cls.scheduledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {' '}
                        {new Date(cls.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                      {cls._count?.attendance > 0 && (
                        <span className="flex items-center gap-1 text-[11px] text-royal/50">
                          <Icon name="user" size={11} />
                          {cls._count.attendance}
                        </span>
                      )}
                      <Badge variant={STATUS_BADGE[cls.status] ?? 'default'} className="capitalize text-[10px]">
                        {cls.status.toLowerCase()}
                      </Badge>
                      <Icon name="chevronDown" size={13}
                        className={`text-royal/30 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                    </div>
                  </button>

                  {/* Expanded detail */}
                  <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                    <div className="border-t border-cloud px-5 py-4 space-y-3">
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'Cohort', value: cls.cohort?.name ?? '—' },
                          { label: 'Teacher', value: teacherName(cls.cohort?.teacher) },
                          { label: 'Duration', value: `${cls.durationMins ?? 90} min` },
                          { label: 'Attendance', value: cls._count?.attendance ?? 0 },
                        ].map(item => (
                          <div key={item.label} className="rounded-xl bg-surface p-3">
                            <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40 mb-1">{item.label}</p>
                            <p className="text-sm font-semibold text-navy">{item.value}</p>
                          </div>
                        ))}
                      </div>
                      {cls.description && (
                        <p className="text-xs text-royal/60 bg-surface rounded-xl p-3">{cls.description}</p>
                      )}
                      {cls.recordingUrl && (
                        <a href={cls.recordingUrl} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-2 rounded-xl border border-azure/30 bg-azure/5 px-4 py-2 text-xs font-semibold text-azure hover:bg-azure/10 transition">
                          <Icon name="live" size={13} /> Watch recording
                        </a>
                      )}
                      <div className="flex gap-2">
                        {cls.status === 'ACTIVE' && (
                          <button
                            onClick={() => forceEnd(cls.id)}
                            disabled={acting === cls.id}
                            className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-100 transition disabled:opacity-50">
                            {acting === cls.id ? 'Ending…' : 'Force end'}
                          </button>
                        )}
                        {cls.status === 'SCHEDULED' && (
                          <button
                            onClick={() => cancelClass(cls.id)}
                            disabled={acting === cls.id}
                            className="flex items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-500 hover:bg-red-100 transition disabled:opacity-50">
                            {acting === cls.id ? 'Cancelling…' : 'Cancel class'}
                          </button>
                        )}
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
    </div>
  );
}
