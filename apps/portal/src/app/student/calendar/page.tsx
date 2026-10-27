'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { spring } from '@/lib/motion';
import api from '@/lib/api';

interface LiveSession { id: string; title: string; scheduledAt: string; status?: string; }
interface AssignmentDue {
  id: string; title: string; dueAt?: string | null;
  course?: { title?: string }; status?: string;
}
type EventType = 'live' | 'assignment';
interface CalEvent {
  type: EventType; id: string; title: string;
  date: Date; href: string; sub?: string;
}

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export default function StudyCalendarPage() {
  const [liveSessions, setLiveSessions] = useState<LiveSession[]>([]);
  const [assignments, setAssignments] = useState<AssignmentDue[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewDate, setViewDate] = useState(() => {
    const d = new Date(); d.setDate(1); return d;
  });
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());

  useEffect(() => {
    Promise.all([
      api.get('/live/student/upcoming')
        .then(r => setLiveSessions(r.data ?? [])).catch(() => {}),
      api.get('/education/assignments/mine')
        .then(r => {
          const all: AssignmentDue[] = r.data ?? [];
          setAssignments(all.filter(a => a.status !== 'GRADED'));
        }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  // Build a flat list of all calendar events
  const allEvents: CalEvent[] = [
    ...liveSessions.map(s => ({
      type: 'live'  as const,
      id: s.id,
      title: s.title,
      date: new Date(s.scheduledAt),
      href: `/student/live/${s.id}`,
      sub: new Date(s.scheduledAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
    })),
    ...assignments
      .filter(a => a.dueAt)
      .map(a => ({
        type: 'assignment' as const,
        id: a.id,
        title: a.title,
        date: new Date(a.dueAt!),
        href: '/student/assignments',
        sub: a.course?.title,
      })),
  ];

  // Group events by date string key
  const eventsByDate = allEvents.reduce<Record<string, CalEvent[]>>((acc, ev) => {
    const key = ev.date.toDateString();
    acc[key] = [...(acc[key] ?? []), ev];
    return acc;
  }, {});

  const calYear  = viewDate.getFullYear();
  const calMonth = viewDate.getMonth();
  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();

  const today     = new Date();
  const todayStr  = today.toDateString();
  const selectedStr = selectedDate.toDateString();
  const selectedEvents = eventsByDate[selectedStr] ?? [];

  // Upcoming events (sorted, future-only)
  const upcomingEvents = allEvents
    .filter(e => e.date >= today)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .slice(0, 5);

  function prevMonth() {
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }
  function nextMonth() {
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-4 md:p-6 space-y-4">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 rounded-2xl bg-cloud animate-pulse" />
          <div className="space-y-3">
            {[1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-cloud animate-pulse" />)}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Topbar
        title="Study Calendar"
        subtitle="Your classes, assignments and deadlines"
        backHref="/student/dashboard"
        backLabel="Dashboard"
      />

      <div className="flex-1 p-4 md:p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 max-w-5xl">

          {/* ── Main Calendar ─────────────────────────────────────── */}
          <div className="lg:col-span-2">
            <Card padding="md">
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-5">
                <button
                  onClick={prevMonth}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-cloud hover:bg-cloud transition">
                  <Icon name="arrowLeft" size={16} className="text-navy" />
                </button>
                <p className="text-base font-bold text-navy">
                  {MONTH_NAMES[calMonth]} {calYear}
                </p>
                <button
                  onClick={nextMonth}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-cloud hover:bg-cloud transition">
                  <Icon name="arrowRight" size={16} className="text-navy" />
                </button>
              </div>

              {/* Day-of-week headers */}
              <div className="grid grid-cols-7 mb-2">
                {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                  <div key={d} className="py-1 text-center text-[10px] font-bold uppercase text-royal/40">
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }, (_, i) => (
                  <div key={`empty-${i}`} className="h-14" />
                ))}
                {Array.from({ length: daysInMonth }, (_, i) => {
                  const dayNum   = i + 1;
                  const dateObj  = new Date(calYear, calMonth, dayNum);
                  const dateStr  = dateObj.toDateString();
                  const isToday    = dateStr === todayStr;
                  const isSelected = dateStr === selectedStr;
                  const events   = eventsByDate[dateStr] ?? [];
                  const hasLive  = events.some(e => e.type === 'live');
                  const hasDue   = events.some(e => e.type === 'assignment');

                  return (
                    <motion.button
                      key={dayNum}
                      onClick={() => setSelectedDate(dateObj)}
                      whileTap={{ scale: 0.92 }}
                      className={`h-14 flex flex-col items-center justify-start pt-1.5 rounded-xl transition-colors
                        ${isSelected ? 'bg-azure/10' : 'hover:bg-cloud/70'}
                        ${isToday && !isSelected ? 'ring-1 ring-azure ring-inset' : ''}`}
                    >
                      <span className={`h-7 w-7 flex items-center justify-center rounded-full text-xs font-bold transition-colors
                        ${isToday ? 'bg-azure text-white' : isSelected ? 'text-azure' : 'text-navy'}`}>
                        {dayNum}
                      </span>
                      {(hasLive || hasDue) && (
                        <div className="flex items-center gap-0.5 mt-0.5">
                          {hasLive && <div className="h-1.5 w-1.5 rounded-full bg-red-400" />}
                          {hasDue  && <div className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                        </div>
                      )}
                    </motion.button>
                  );
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center gap-5 mt-5 pt-4 border-t border-cloud">
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-red-400" />
                  <span className="text-[11px] font-medium text-royal/60">Live class</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full bg-amber-400" />
                  <span className="text-[11px] font-medium text-royal/60">Assignment due</span>
                </div>
                <div className="flex items-center gap-2 ml-auto">
                  <div className="h-2 w-2 rounded-full bg-azure" />
                  <span className="text-[11px] font-medium text-royal/60">Today</span>
                </div>
              </div>
            </Card>
          </div>

          {/* ── Right Panel ──────────────────────────────────────── */}
          <div className="space-y-5">

            {/* Selected day events */}
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-0.5">
                {selectedDate.toLocaleDateString('en-GB', { weekday: 'long' })}
              </p>
              <p className="text-base font-bold text-navy mb-3">
                {selectedDate.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>

              {selectedEvents.length > 0 ? (
                <div className="space-y-2">
                  {selectedEvents.map(ev => {
                    const isLive = ev.type === 'live';
                    return (
                      <Link key={ev.id} href={ev.href}>
                        <motion.div
                          whileHover={{ x: 2, transition: spring.snappy }}
                          className="flex items-center gap-3 rounded-xl border border-cloud bg-white p-3
                                     hover:border-azure/30 hover:shadow-sm transition-all"
                        >
                          <div className={`flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center
                            ${isLive ? 'bg-red-50 text-red-400' : 'bg-amber-50 text-amber-500'}`}>
                            <Icon name={isLive ? 'live' : 'assignments'} size={17} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-navy truncate">{ev.title}</p>
                            <p className="text-[10px] text-royal/40 mt-0.5">
                              {isLive ? ev.sub : `Due${ev.sub ? ` · ${ev.sub}` : ''}`}
                            </p>
                          </div>
                          <span className={`flex-shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full
                            ${isLive ? 'bg-red-50 text-red-400' : 'bg-amber-50 text-amber-500'}`}>
                            {isLive ? 'Live' : 'Due'}
                          </span>
                        </motion.div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <Card className="flex flex-col items-center p-5 text-center">
                  <Icon name="calendar" size={28} className="text-cloud mb-2" />
                  <p className="text-xs font-semibold text-navy">No events</p>
                  <p className="text-[11px] text-royal/40 mt-0.5">Nothing scheduled for this day</p>
                </Card>
              )}
            </div>

            {/* Coming up next */}
            {upcomingEvents.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40 mb-3">Coming up</p>
                <div className="space-y-2">
                  {upcomingEvents.map(ev => {
                    const isLive = ev.type === 'live';
                    const daysAway = Math.ceil((ev.date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                    return (
                      <Link key={ev.id} href={ev.href}>
                        <div className="flex items-center gap-3 rounded-xl border border-cloud bg-white p-3
                                        hover:border-azure/30 hover:shadow-sm transition-all cursor-pointer">
                          <div className={`flex-shrink-0 h-1.5 w-1.5 rounded-full
                            ${isLive ? 'bg-red-400' : 'bg-amber-400'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-navy truncate">{ev.title}</p>
                            <p className="text-[10px] text-royal/40">
                              {ev.date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                              {ev.sub && isLive ? ` · ${ev.sub}` : ''}
                            </p>
                          </div>
                          <span className="flex-shrink-0 text-[10px] font-semibold text-royal/40">
                            {daysAway === 0 ? 'Today' : daysAway === 1 ? 'Tomorrow' : `${daysAway}d`}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {upcomingEvents.length === 0 && (
              <Card className="flex flex-col items-center p-5 text-center">
                <Icon name="star" size={28} className="text-cloud mb-2" />
                <p className="text-xs font-semibold text-navy">All caught up!</p>
                <p className="text-[11px] text-royal/40 mt-0.5">No upcoming sessions or deadlines</p>
              </Card>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
