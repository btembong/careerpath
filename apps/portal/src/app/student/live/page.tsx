'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

interface CohortTeacher { email: string; firstName?: string | null; lastName?: string | null; }
interface Cohort { id: string; name: string; teacher?: CohortTeacher; }
interface LiveClass {
  id: string;
  title: string;
  description?: string;
  scheduledAt: string;
  durationMins?: number;
  status: 'SCHEDULED' | 'ACTIVE' | 'COMPLETED' | 'CANCELLED';
  recordingUrl?: string;
  cohort?: Cohort;
}

function teacherName(t?: CohortTeacher | null): string | null {
  if (!t) return null;
  if (t.firstName || t.lastName) return `${t.firstName ?? ''} ${t.lastName ?? ''}`.trim();
  return t.email.split('@')[0];
}

function isToday(d: string) {
  const t = new Date(d); const n = new Date();
  return t.getFullYear() === n.getFullYear() && t.getMonth() === n.getMonth() && t.getDate() === n.getDate();
}

function addToCalendar(title: string, scheduledAt: string, durationMins?: number) {
  const start = new Date(scheduledAt);
  const end   = new Date(start.getTime() + (durationMins ?? 60) * 60_000);
  const fmt   = (d: Date) => d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CareerPath Africa//EN',
    'BEGIN:VEVENT',
    `UID:${scheduledAt}-${Math.random().toString(36).slice(2)}@careerpathafrica`,
    `DTSTART:${fmt(start)}`, `DTEND:${fmt(end)}`, `SUMMARY:${title}`,
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${title.replace(/\s+/g, '-')}.ics`; a.click();
  URL.revokeObjectURL(url);
}

function useCountdowns(sessions: LiveClass[]) {
  const compute = useCallback(() => {
    const now = Date.now();
    const out: Record<string, string> = {};
    sessions.forEach(s => {
      const diff = new Date(s.scheduledAt).getTime() - now;
      if (diff <= 0) { out[s.id] = 'Starting soon'; return; }
      const mins = Math.floor(diff / 60_000);
      if (mins < 60) { out[s.id] = `Starts in ${mins} min${mins !== 1 ? 's' : ''}`; return; }
      const hrs = Math.floor(mins / 60);
      if (hrs < 24) { out[s.id] = `Starts in ${hrs}h ${mins % 60}m`; return; }
      out[s.id] = `Starts in ${Math.floor(hrs / 24)} day${Math.floor(hrs / 24) !== 1 ? 's' : ''}`;
    });
    return out;
  }, [sessions]);

  const [countdowns, setCountdowns] = useState<Record<string, string>>({});

  useEffect(() => {
    setCountdowns(compute());
    const id = setInterval(() => setCountdowns(compute()), 30_000);
    return () => clearInterval(id);
  }, [compute]);

  return countdowns;
}

export default function StudentLivePage() {
  const [sessions, setSessions] = useState<LiveClass[]>([]);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    api.get('/live/student/upcoming')
      .then(r => setSessions(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const countdowns = useCountdowns(sessions);

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        <div className="space-y-3">
          <div className="h-2.5 w-24 rounded bg-cloud animate-pulse" />
          {[1, 2].map(i => <SkeletonCard key={i} lines={3} />)}
        </div>
        <div className="space-y-3">
          <div className="h-2.5 w-20 rounded bg-cloud animate-pulse" />
          {[1, 2, 3].map(i => <SkeletonCard key={i} lines={2} />)}
        </div>
      </div>
    </div>
  );

  const live      = sessions.filter(s => s.status === 'ACTIVE');
  const upcoming  = sessions.filter(s => s.status === 'SCHEDULED');
  const completed = sessions.filter(s => s.status === 'COMPLETED');
  const cancelled = sessions.filter(s => s.status === 'CANCELLED');

  function SessionCard({ s }: { s: LiveClass }) {
    const teacher   = s.cohort?.teacher;
    const isLive    = s.status === 'ACTIVE';
    const isCompleted = s.status === 'COMPLETED';
    const isCancelled = s.status === 'CANCELLED';
    const isPast    = isCompleted || isCancelled;
    const today     = !isPast && isToday(s.scheduledAt);

    return (
      <Card padding="none" className="overflow-hidden">
        <div className={`h-1 w-full ${
          isLive      ? 'bg-red-400'
          : today     ? 'bg-azure'
          : isPast    ? 'bg-cloud'
          : 'bg-royal/20'
        }`} />
        <div className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
              isLive ? 'bg-azure' : 'bg-cloud'
            }`}>
              <Icon name="live" size={18} className={isLive ? 'text-white' : 'text-royal/40'} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <p className="text-sm font-bold text-navy leading-tight truncate">{s.title}</p>
                {today && !isLive && (
                  <span className="rounded-md bg-azure/10 border border-azure/20 px-2 py-0.5 text-[10px] font-semibold text-azure flex-shrink-0">
                    Today
                  </span>
                )}
              </div>
              {s.cohort && (
                <p className="text-[11px] text-royal/50 mt-0.5">
                  {s.cohort.name}
                  {teacher && teacherName(teacher) && (
                    <> · <span className="text-azure font-medium">{teacherName(teacher)}</span></>
                  )}
                </p>
              )}
              {s.description && (
                <p className="text-[11px] text-royal/40 mt-1 line-clamp-2">{s.description}</p>
              )}
            </div>
            <Badge variant={isLive ? 'active' : isCancelled ? 'muted' : isPast ? 'default' : 'muted'}>
              {isLive ? 'Live now' : isCancelled ? 'Cancelled' : isPast ? 'Ended' : 'Upcoming'}
            </Badge>
          </div>

          {/* Date / time / duration row */}
          <div className="flex items-center gap-4 text-xs text-royal/50 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Icon name="calendar" size={12} />
              <span>{new Date(s.scheduledAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Icon name="clock" size={12} />
              <span>{new Date(s.scheduledAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            {s.durationMins && (
              <div className="flex items-center gap-1.5">
                <Icon name="courses" size={12} />
                <span>{s.durationMins} min</span>
              </div>
            )}
          </div>

          {/* Actions */}
          {isLive && (
            <Link href={`/student/live/${s.id}`}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-azure py-2.5 text-sm font-bold text-white hover:bg-royal transition">
              <Icon name="live" size={14} /> Join class now
            </Link>
          )}

          {!isLive && !isPast && (
            <div className="flex items-center gap-2">
              <div className="flex-1 flex items-center gap-2 rounded-xl border border-cloud bg-surface px-3 py-2">
                <Icon name="clock" size={12} className="text-royal/40 flex-shrink-0" />
                <p className="text-xs text-royal/50">{countdowns[s.id] ?? '—'}</p>
              </div>
              <button
                onClick={() => addToCalendar(s.title, s.scheduledAt, s.durationMins)}
                title="Add to calendar"
                className="flex items-center justify-center h-9 w-9 rounded-xl border border-cloud bg-surface text-royal/40 hover:border-azure hover:text-azure transition flex-shrink-0">
                <Icon name="calendar" size={13} />
              </button>
            </div>
          )}

          {isCompleted && s.recordingUrl && (
            <a href={s.recordingUrl} target="_blank" rel="noreferrer"
              className="flex items-center gap-2 rounded-xl border border-azure/30 bg-azure/5 px-3 py-2 text-xs font-semibold text-azure hover:bg-azure/10 transition">
              <Icon name="play" size={13} /> Watch recording
            </a>
          )}
          {isCompleted && !s.recordingUrl && (
            <p className="text-xs text-royal/30 px-1">Recording not available yet</p>
          )}
        </div>
      </Card>
    );
  }

  const isEmpty = sessions.length === 0;

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Live Classes" subtitle="Your scheduled and active sessions" />

      <div className="flex-1 p-4 md:p-6 space-y-6 max-w-3xl w-full mx-auto">

        {isEmpty ? (
          <Card>
            <EmptyState
              icon="live"
              title="No live classes scheduled"
              description="Your teacher will schedule sessions for your cohort. Check back soon."
            />
          </Card>
        ) : (
          <>
            {/* Live now */}
            {live.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-red-500 flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-red-400 animate-pulse" />
                  LIVE NOW
                </p>
                {live.map(s => <SessionCard key={s.id} s={s} />)}
              </div>
            )}

            {/* Upcoming */}
            {upcoming.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">UPCOMING</p>
                  <Badge>{upcoming.length}</Badge>
                </div>
                {upcoming.map(s => <SessionCard key={s.id} s={s} />)}
              </div>
            )}

            {/* Completed */}
            {completed.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/30">PAST SESSIONS</p>
                  <Badge>{completed.length}</Badge>
                </div>
                {completed.map(s => <SessionCard key={s.id} s={s} />)}
              </div>
            )}

            {/* Cancelled */}
            {cancelled.length > 0 && (
              <div className="space-y-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/20">CANCELLED</p>
                {cancelled.map(s => <SessionCard key={s.id} s={s} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
