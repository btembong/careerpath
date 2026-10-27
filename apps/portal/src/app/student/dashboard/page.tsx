'use client';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area,
} from 'recharts';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTopbar, SkeletonStat } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { StaggerList, StaggerItem, FadeUp, AnimatedNumber } from '@/components/ui/Motion';
import { spring } from '@/lib/motion';
import { useAuth } from '@/hooks/useAuth';
import { useDarkMode } from '@/hooks/useDarkMode';
import api from '@/lib/api';

/* ─── SVG Progress Ring ─────────────────────────────────────────────────── */
function ProgressRing({ pct, size = 72, stroke = 6, color = '#5889FA', trackColor = '#E6ECFD' }:
  { pct: number; size?: number; stroke?: number; color?: string; trackColor?: string }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = Math.min(100, Math.max(0, pct)) / 100 * circ;
  return (
    <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={trackColor} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        style={{ transition: 'stroke-dasharray 1s ease' }} />
    </svg>
  );
}

/* ─── Daily motivational quotes ─────────────────────────────────────────── */
const QUOTES = [
  { text: 'Education is the most powerful weapon which you can use to change the world.', author: 'Nelson Mandela' },
  { text: 'The beautiful thing about learning is that no one can take it away from you.', author: 'B.B. King' },
  { text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin' },
  { text: 'Education is not the filling of a pail, but the lighting of a fire.', author: 'W.B. Yeats' },
  { text: 'Tell me and I forget. Teach me and I remember. Involve me and I learn.', author: 'Benjamin Franklin' },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'Live as if you were to die tomorrow. Learn as if you were to live forever.', author: 'Mahatma Gandhi' },
  { text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.', author: 'Winston Churchill' },
  { text: 'Knowledge is power. Information is liberating.', author: 'Kofi Annan' },
  { text: 'Strive not to be a success, but rather to be of value.', author: 'Albert Einstein' },
  { text: 'In learning you will teach, and in teaching you will learn.', author: 'Phil Collins' },
  { text: 'The capacity to learn is a gift; the ability to learn is a skill; the willingness to learn is a choice.', author: 'Brian Herbert' },
];

/* ─── Onboarding steps ───────────────────────────────────────────────────── */
const ONBOARD_STEPS = [
  { title: 'Welcome to your dashboard!', body: 'Everything you need to learn, track progress, and connect with teachers — all in one place.' },
  { title: 'Resume your learning', body: 'The blue card at the top takes you straight back to your last lesson. Never lose your place.' },
  { title: 'Track your progress', body: 'Your overall progress ring and activity charts update in real time as you complete lessons.' },
  { title: 'Never miss a deadline', body: 'Your study calendar and deadline radar show live classes and assignments at a glance.' },
  { title: "You're all set!", body: 'Start learning and watch your dashboard come alive with your activity and achievements.' },
];

/* ─── Colour palette ────────────────────────────────────────────────────── */
const COURSE_COLORS = [
  { bg: 'bg-azure/10',   text: 'text-azure',       bar: '#5889FA' },
  { bg: 'bg-red-50',     text: 'text-red-400',      bar: '#f87171' },
  { bg: 'bg-amber-50',   text: 'text-amber-500',    bar: '#f59e0b' },
  { bg: 'bg-emerald-50', text: 'text-emerald-500',  bar: '#10b981' },
  { bg: 'bg-purple-50',  text: 'text-purple-500',   bar: '#a855f7' },
  { bg: 'bg-pink-50',    text: 'text-pink-500',     bar: '#ec4899' },
];

/* ─── Interfaces ─────────────────────────────────────────────────────────── */
interface Package { id: string; name: string; courseIds?: string[]; expiresAt?: string | null; }
interface Me {
  email: string; firstName?: string | null; lastName?: string | null;
  name?: string | null; walletBalance?: number; walletCurrency?: string;
  activePackages?: Package[];
}
interface LiveSession { id: string; title: string; scheduledAt: string; status?: string; }
interface CoursePurchase {
  id: string; courseId: string;
  course?: { title?: string; coverUrl?: string; subject?: { name: string }; programme?: { shortName?: string } };
}
interface CertProgress {
  courseId: string; courseTitle: string; percentComplete?: number;
  certificateEarned?: boolean; lessonsCompleted?: number; totalLessons?: number;
  quizzesPassed?: number; totalQuizzes?: number;
  assignmentsGraded?: number; totalAssignments?: number;
}
interface Rec { courseId: string; title: string; coverUrl?: string; subjectName?: string; tip?: string; }
interface AssignmentDue { id: string; title: string; dueAt?: string | null; course?: { title?: string }; status?: string; }
interface LastLesson { courseId: string; courseTitle?: string; lessonId?: string; lessonTitle?: string; pct?: number; coverUrl?: string; }
interface LeaderboardEntry { userId: string; name: string; xpTotal: number; rank: number; }
interface ActivityItem { userId: string; name: string; action: string; target: string; timestamp: string; }
interface Teacher { id: string; name: string; avatarUrl?: string; subject?: string; }
interface WeekSnap { sessions: number; certs: number; packages: number; }

/* ═══════════════════════════════════════════════════════════════════════════ */
export default function StudentDashboard() {
  const { user } = useAuth();
  const { dark, toggle: toggleDark } = useDarkMode();

  /* ── existing data state ── */
  const [me, setMe]                       = useState<Me | null>(null);
  const [certs, setCerts]                 = useState<unknown[]>([]);
  const [liveSessions, setLiveSessions]   = useState<LiveSession[]>([]);
  const [coursePurchases, setCoursePurchases] = useState<CoursePurchase[]>([]);
  const [progressMap, setProgressMap]     = useState<Record<string, number>>({});
  const [certProgress, setCertProgress]   = useState<CertProgress[]>([]);
  const [recs, setRecs]                   = useState<Rec[]>([]);
  const [assignments, setAssignments]     = useState<AssignmentDue[]>([]);
  const [loading, setLoading]             = useState(true);
  const [loadError, setLoadError]         = useState(false);
  const [searchQuery, setSearchQuery]     = useState('');

  /* ── feature state ── */
  const [streak, setStreak]               = useState(0);
  const [studiedDays, setStudiedDays]     = useState<Set<string>>(new Set());
  const [countdown, setCountdown]         = useState('');
  const [lastLesson, setLastLesson]       = useState<LastLesson | null>(null);
  const [leaderboard, setLeaderboard]     = useState<LeaderboardEntry[]>([]);
  const [activityFeed, setActivityFeed]   = useState<ActivityItem[]>([]);
  const [teachers, setTeachers]           = useState<Teacher[]>([]);
  const [weekTrend, setWeekTrend]         = useState<WeekSnap | null>(null);
  const [recentLessons, setRecentLessons] = useState<LastLesson[]>([]);

  /* ── pomodoro ── */
  const [pomMode, setPomMode]       = useState<'idle' | 'work' | 'break'>('idle');
  const [pomSeconds, setPomSeconds] = useState(25 * 60);
  const [pomSessions, setPomSessions] = useState(0);

  /* ── confetti / onboarding ── */
  const [showConfetti, setShowConfetti]   = useState(false);
  const [onboardStep, setOnboardStep]     = useState<number | null>(null);

  /* ── study reminder ── */
  const [reminderOn, setReminderOn]     = useState(false);
  const [reminderTime, setReminderTime] = useState('09:00');

  /* ── pull-to-refresh ── */
  const [refreshing, setRefreshing]       = useState(false);
  const touchStartY                       = useRef(0);

  /* ── data fetch ── */
  useEffect(() => {
    Promise.all([
      api.get('/auth/me').then(r => setMe(r.data)).catch(() => { setLoadError(true); }),
      api.get('/certificates').then(r => setCerts(r.data ?? [])).catch(() => {}),
      api.get('/education/certificate-progress').then(r => setCertProgress(r.data ?? [])).catch(() => {}),
      api.get('/live/student/upcoming').then(r => setLiveSessions(r.data ?? [])).catch(() => {}),
      api.get('/portals/student/course-purchases').then(r => {
        const purchases: CoursePurchase[] = r.data ?? [];
        setCoursePurchases(purchases);
        purchases.slice(0, 8).forEach(p => {
          api.get(`/platform-courses/${p.courseId}/progress`)
            .then(pr => setProgressMap(m => ({ ...m, [p.courseId]: pr.data?.percentComplete ?? 0 })))
            .catch(() => {});
        });
      }).catch(() => {}),
    ]).finally(() => setLoading(false));

    api.get('/ai/recommendations').then(r => setRecs(r.data?.slice(0, 4) ?? [])).catch(() => {});
    api.get('/education/assignments/mine').then(r => {
      const all: AssignmentDue[] = r.data ?? [];
      setAssignments(all.filter(a => a.status !== 'GRADED').slice(0, 6));
    }).catch(() => {});
    api.get('/portals/student/last-lesson').then(r => setLastLesson(r.data ?? null)).catch(() => {});
    api.get('/portals/student/activity-feed').then(r => setActivityFeed((r.data ?? []).slice(0, 5))).catch(() => {});
    api.get('/portals/student/cohorts').then(r => {
      const firstCohortId: string | undefined = r.data?.[0]?.id;
      if (firstCohortId) {
        api.get(`/gamification/leaderboard/${firstCohortId}`)
          .then(lb => setLeaderboard((lb.data ?? []).map((e: { id: string; name: string; xpTotal: number; rank: number }) => ({
            userId: e.id, name: e.name, xpTotal: e.xpTotal ?? 0, rank: e.rank,
          }))))
          .catch(() => {});
      }
      const seen = new Set<string>();
      const unique: Teacher[] = [];
      (r.data ?? []).forEach((c: any) => {
        if (c.teacher && !seen.has(c.teacher.id)) {
          seen.add(c.teacher.id);
          unique.push({
            id: c.teacher.id,
            name: `${c.teacher.firstName ?? ''} ${c.teacher.lastName ?? ''}`.trim() || c.teacher.email,
            avatarUrl: c.teacher.avatarUrl,
            subject: c.subject?.name,
          });
        }
      });
      setTeachers(unique.slice(0, 5));
    }).catch(() => {});
  }, []);

  /* ── countdown timer ── */
  useEffect(() => {
    const next = liveSessions
      .filter(s => s.status !== 'ACTIVE' && new Date(s.scheduledAt) > new Date())
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];
    if (!next) return;
    const tick = () => {
      const diff = new Date(next.scheduledAt).getTime() - Date.now();
      if (diff <= 0) { setCountdown('Starting now!'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(d > 0
        ? `${d}d ${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m`
        : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [liveSessions]);

  /* ── pomodoro timer ── */
  useEffect(() => {
    if (pomMode === 'idle') return;
    const id = setInterval(() => {
      setPomSeconds(s => {
        if (s <= 1) {
          if (pomMode === 'work') {
            setPomSessions(n => n + 1);
            setPomMode('break');
            return 5 * 60;
          }
          setPomMode('idle');
          return 25 * 60;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [pomMode]);

  /* ── streak tracker ── */
  useEffect(() => {
    const todayStr = new Date().toDateString();
    const raw: string[] = JSON.parse(localStorage.getItem('cpa_study_days') ?? '[]');
    const days = new Set<string>(raw);
    days.add(todayStr);
    localStorage.setItem('cpa_study_days', JSON.stringify(Array.from(days).slice(-60)));
    setStudiedDays(days);
    let s = 0; const d = new Date();
    while (days.has(d.toDateString())) { s++; d.setDate(d.getDate() - 1); }
    setStreak(s);

    // week trend snapshot
    const snap: WeekSnap | null = JSON.parse(localStorage.getItem('cpa_week_snap') ?? 'null');
    if (snap) setWeekTrend(snap);

    // recent lessons from localStorage
    const rl: LastLesson[] = JSON.parse(localStorage.getItem('cpa_recent_lessons') ?? '[]');
    setRecentLessons(rl);

    // reminder settings
    const rem = JSON.parse(localStorage.getItem('cpa_reminder') ?? '{}');
    setReminderOn(rem.enabled ?? false);
    setReminderTime(rem.time ?? '09:00');
  }, []);

  /* ── confetti on new certificate ── */
  useEffect(() => {
    if (loading) return;
    const cached = parseInt(localStorage.getItem('cpa_cert_count') ?? '-1', 10);
    if (cached >= 0 && certs.length > cached) {
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 4500);
    }
    localStorage.setItem('cpa_cert_count', String(certs.length));
  }, [certs.length, loading]);

  /* ── onboarding tour (first visit) ── */
  useEffect(() => {
    if (loading) return;
    const done = localStorage.getItem('cpa_onboarded');
    if (!done) setTimeout(() => setOnboardStep(0), 1200);
  }, [loading]);

  /* ── save week snapshot after data loads ── */
  useEffect(() => {
    if (loading) return;
    const lastTime = parseInt(localStorage.getItem('cpa_week_snap_time') ?? '0', 10);
    if (Date.now() - lastTime > 7 * 86400000) {
      const snap: WeekSnap = { sessions: liveSessions.length, certs: certs.length, packages: (me?.activePackages ?? []).length };
      localStorage.setItem('cpa_week_snap', JSON.stringify(snap));
      localStorage.setItem('cpa_week_snap_time', String(Date.now()));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  /* ── helpers ── */
  function advanceOnboard() {
    if (onboardStep === null) return;
    if (onboardStep < ONBOARD_STEPS.length - 1) { setOnboardStep(onboardStep + 1); }
    else { setOnboardStep(null); localStorage.setItem('cpa_onboarded', '1'); }
  }
  function handleTouchStart(e: React.TouchEvent) { touchStartY.current = e.touches[0].clientY; }
  function handleTouchEnd(e: React.TouchEvent) {
    const diff = e.changedTouches[0].clientY - touchStartY.current;
    if (diff > 90 && window.scrollY === 0 && !refreshing) {
      setRefreshing(true);
      window.location.reload();
    }
  }
  function toggleReminder(newOn: boolean) {
    setReminderOn(newOn);
    localStorage.setItem('cpa_reminder', JSON.stringify({ enabled: newOn, time: reminderTime }));
    if (newOn && 'Notification' in window) Notification.requestPermission();
  }

  /* ── loading / error ── */
  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-4 md:p-6 space-y-6">
        <div className="h-20 rounded-2xl bg-cloud animate-pulse" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1,2,3,4].map(i => <SkeletonStat key={i} />)}
        </div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <div className="lg:col-span-3 space-y-4">
            <div className="h-24 rounded-2xl bg-cloud animate-pulse" />
            <div className="flex gap-3 overflow-hidden">
              {[1,2,3].map(i => <div key={i} className="flex-shrink-0 w-48 rounded-2xl bg-cloud h-44 animate-pulse" />)}
            </div>
          </div>
          <div className="lg:col-span-2 space-y-4">
            {[1,2,3,4].map(i => <div key={i} className="h-32 rounded-2xl bg-cloud animate-pulse" />)}
          </div>
        </div>
      </div>
    </div>
  );

  if (loadError && !me) return (
    <div className="flex min-h-full flex-col items-center justify-center p-6 text-center">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-cloud">
        <Icon name="wifi" size={24} className="text-royal/40" />
      </div>
      <p className="text-base font-bold text-navy">Unable to load dashboard</p>
      <p className="mt-1 text-sm text-royal/60">Check your connection and try refreshing.</p>
      <button onClick={() => window.location.reload()}
        className="mt-5 rounded-xl bg-azure px-5 py-2.5 text-sm font-semibold text-white hover:bg-royal transition">
        Refresh
      </button>
    </div>
  );

  /* ── computed ── */
  const firstName = me?.firstName ?? me?.name?.split(' ')[0] ?? user?.name?.split(' ')[0] ?? me?.email?.split('@')[0] ?? 'there';
  const today     = new Date();
  const hour      = today.getHours();
  const greeting  = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const packages  = me?.activePackages ?? [];
  const hasCourses = packages.length > 0 || coursePurchases.length > 0;
  const now       = today.getTime();
  const sevenDays = 7 * 24 * 60 * 60 * 1000;

  const expiringPkgs = packages.filter(p =>
    p.expiresAt && new Date(p.expiresAt).getTime() - now < sevenDays && new Date(p.expiresAt).getTime() > now
  );
  const overdueAssignments = assignments.filter(a => a.dueAt && new Date(a.dueAt).getTime() < now);
  const allPcts   = Object.values(progressMap);
  const overallPct = allPcts.length > 0 ? Math.round(allPcts.reduce((a, b) => a + b, 0) / allPcts.length) : 0;
  const coursesInProgress = allPcts.filter(p => p > 0 && p < 100).length;
  const dailyGoalPct = Math.min(100, Math.round((coursesInProgress / Math.max(1, allPcts.length)) * 100));

  // Achievements
  const achievements = [
    { id: 'enrolled',  icon: 'courses'      as const, label: 'Enrolled',       color: 'bg-azure/10 text-azure',         earned: coursePurchases.length > 0 },
    { id: 'started',   icon: 'play'         as const, label: 'First Lesson',   color: 'bg-emerald-50 text-emerald-500', earned: allPcts.some(p => p > 0) },
    { id: 'halfway',   icon: 'trending'     as const, label: 'Halfway',        color: 'bg-royal/10 text-royal',         earned: allPcts.some(p => p >= 50) },
    { id: 'done',      icon: 'check'        as const, label: 'Completed',      color: 'bg-green-50 text-green-500',     earned: allPcts.some(p => p >= 100) },
    { id: 'cert',      icon: 'certificates' as const, label: 'Certified',      color: 'bg-amber-50 text-amber-500',     earned: certs.length > 0 },
    { id: 'streak3',   icon: 'star'         as const, label: '3-Day Streak',   color: 'bg-orange-50 text-orange-500',   earned: streak >= 3 },
    { id: 'streak7',   icon: 'star'         as const, label: 'Week Streak',    color: 'bg-red-50 text-red-400',         earned: streak >= 7 },
    { id: 'scholar',   icon: 'graduate'     as const, label: 'Scholar',        color: 'bg-purple-50 text-purple-500',   earned: coursePurchases.length >= 3 },
  ];

  // Daily quote (rotated by day of year)
  const dayOfYear = Math.floor((now - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000);
  const quote = QUOTES[dayOfYear % QUOTES.length];

  // Resume learning card data
  const resumeCourse: LastLesson | null = (() => {
    const base: LastLesson | null = lastLesson ?? (() => {
      const p = coursePurchases
        .filter(p => (progressMap[p.courseId] ?? 0) > 0 && (progressMap[p.courseId] ?? 0) < 100)
        .sort((a, b) => (progressMap[b.courseId] ?? 0) - (progressMap[a.courseId] ?? 0))[0];
      if (!p) return null;
      return { courseId: p.courseId, courseTitle: p.course?.title, pct: progressMap[p.courseId] };
    })();
    if (!base) return null;
    // Attach coverUrl from course purchases if available
    if (!base.coverUrl) {
      const match = coursePurchases.find(cp => cp.courseId === base.courseId);
      if (match?.course?.coverUrl) return { ...base, coverUrl: match.course.coverUrl };
    }
    return base;
  })();

  // Next live session
  const nextLiveSession = liveSessions
    .filter(s => s.status !== 'ACTIVE' && new Date(s.scheduledAt) > today)
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())[0];

  // Cert checklist (first in-progress cert)
  const checklistCert = certProgress.find(cp => !cp.certificateEarned);
  const checklistItems = checklistCert ? [
    { label: 'Lessons',     done: checklistCert.lessonsCompleted ?? 0,    total: checklistCert.totalLessons ?? 0 },
    { label: 'Quizzes',     done: checklistCert.quizzesPassed ?? 0,       total: checklistCert.totalQuizzes ?? 0 },
    { label: 'Assignments', done: checklistCert.assignmentsGraded ?? 0,   total: checklistCert.totalAssignments ?? 0 },
  ].filter(i => i.total > 0) : [];
  const checklistRemaining = checklistItems.reduce((sum, i) => sum + Math.max(0, i.total - i.done), 0);

  // Skill tags (unique subjects)
  const skillTags = Array.from(new Set(
    coursePurchases.map(p => p.course?.subject?.name).filter(Boolean) as string[]
  ));

  // Trend badges
  const sessionTrend  = weekTrend ? liveSessions.length - weekTrend.sessions : null;
  const certTrend     = weekTrend ? certs.length - weekTrend.certs : null;

  // Chart data
  const chartData = certProgress.length > 0
    ? certProgress.slice(0, 6).map(cp => ({ name: cp.courseTitle.split(' ').slice(0, 2).join(' '), progress: Math.round(cp.percentComplete ?? 0) }))
    : coursePurchases.slice(0, 6).map(p => ({ name: (p.course?.title ?? 'Course').split(' ').slice(0, 2).join(' '), progress: progressMap[p.courseId] ?? 0 }));

  const weekDayLabels = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const weekData = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - (6 - i));
    return { day: weekDayLabels[d.getDay()], hours: 0 };
  });

  const filteredCourses = searchQuery.trim()
    ? coursePurchases.filter(p =>
        p.course?.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.course?.subject?.name?.toLowerCase().includes(searchQuery.toLowerCase()))
    : coursePurchases;

  // Calendar
  const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const calYear = today.getFullYear(), calMonth = today.getMonth();
  const calFirstDay = new Date(calYear, calMonth, 1).getDay();
  const calDaysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const liveSessionDateSet   = new Set(liveSessions.map(s => new Date(s.scheduledAt).toDateString()));
  const assignmentDueDateSet = new Set(assignments.map(a => a.dueAt ? new Date(a.dueAt).toDateString() : '').filter(Boolean));

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today); d.setDate(today.getDate() - (6 - i)); return d.toDateString();
  });

  // Pomodoro display
  const pomPct = pomMode === 'work'  ? ((25*60 - pomSeconds) / (25*60)) * 100
               : pomMode === 'break' ? ((5*60  - pomSeconds) / (5*60))  * 100 : 0;
  const pomDisplay = `${String(Math.floor(pomSeconds / 60)).padStart(2,'0')}:${String(pomSeconds % 60).padStart(2,'0')}`;

  const QUICK_LINKS = [
    { label: 'My Courses',   icon: 'courses'      as const, href: '/student/courses'      },
    { label: 'Assignments',  icon: 'assignments'  as const, href: '/student/assignments'  },
    { label: 'Calendar',     icon: 'calendar'     as const, href: '/student/calendar'     },
    { label: 'Certificates', icon: 'certificates' as const, href: '/student/certificates' },
    { label: 'Wallet',       icon: 'wallet'       as const, href: '/student/wallet'       },
    { label: 'Mentorship',   icon: 'mentorship'   as const, href: '/student/mentorship'   },
  ];

  /* ═══════════════════════════════════════════════════════════════════════ */
  return (
    <div className="flex flex-col gap-5 p-4 md:p-6"
      onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>

      {/* Pull-to-refresh indicator */}
      {refreshing && (
        <div className="flex justify-center py-1">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-azure border-t-transparent" />
        </div>
      )}

      <Topbar title="Dashboard" />

      {/* ① HERO GREETING + STREAK + DAILY GOAL RING ─────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-royal/50 uppercase tracking-widest">{greeting}</p>
          <h1 className="mt-1 text-2xl font-bold text-navy truncate">Hello, {firstName}!</h1>
          <p className="mt-1.5 text-sm text-royal/60 max-w-lg">
            {packages.length > 0
              ? `Nice to have you back. You have ${packages.length} active package${packages.length !== 1 ? 's' : ''} and ${coursePurchases.length} course${coursePurchases.length !== 1 ? 's' : ''} enrolled.`
              : 'Nice to have you back. Get ready and continue your lesson today.'}
          </p>
          {/* Streak bar */}
          <div className="mt-3 flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <Icon name="star" size={14} className="text-amber-400" />
              <span className="text-xs font-bold text-navy">{streak} day{streak !== 1 ? 's' : ''}</span>
            </div>
            <div className="flex items-center gap-1">
              {last7Days.map((d, i) => (
                <div key={i} className={`h-2 w-2 rounded-full transition-colors ${studiedDays.has(d) ? 'bg-amber-400' : 'bg-cloud'}`} />
              ))}
            </div>
            <span className="text-[10px] text-royal/40">this week</span>
          </div>
        </div>

        {/* ② Daily Goal Ring + dark mode toggle */}
        <div className="flex flex-col items-center gap-2">
          <div className="relative" title={`${dailyGoalPct}% courses active`}>
            <ProgressRing pct={dailyGoalPct} size={64} stroke={5} />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="h-11 w-11 rounded-full bg-azure/10 flex items-center justify-center text-base font-bold text-azure">
                {firstName[0]?.toUpperCase()}
              </div>
            </div>
          </div>
          {/* ⑭ Dark mode toggle */}
          <button onClick={toggleDark} title={dark ? 'Light mode' : 'Dark mode'}
            className="flex h-7 w-7 items-center justify-center rounded-lg border border-cloud bg-white hover:bg-cloud transition">
            <Icon name={dark ? 'sunLine' : 'moonLine'} size={13} className="text-royal/60" />
          </button>
        </div>
      </div>

      {/* STATS GRID + ⑦ TREND BADGES ────────────────────────────────────── */}
      <StaggerList className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { icon: 'packages'     as const, value: packages.length,     label: 'Active packages',   iconCls: 'bg-azure/10 text-azure',     trend: null },
          { icon: 'live'         as const, value: liveSessions.length,  label: 'Upcoming sessions', iconCls: 'bg-red-50 text-red-400',     trend: sessionTrend },
          { icon: 'certificates' as const, value: certs.length,         label: 'Certificates',      iconCls: 'bg-amber-50 text-amber-500', trend: certTrend },
        ].map(stat => (
          <StaggerItem key={stat.label}>
            <motion.div whileHover={{ y: -2, boxShadow: '0 6px 24px rgba(88,137,250,0.10)', transition: spring.crisp }}
              className="rounded-2xl border border-cloud bg-white shadow-card p-4 flex flex-col gap-2.5 relative">
              <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.iconCls}`}>
                <Icon name={stat.icon} size={17} />
              </div>
              {stat.trend !== null && stat.trend !== 0 && (
                <span className={`absolute top-3 right-3 text-[9px] font-bold px-1.5 py-0.5 rounded-full
                  ${stat.trend > 0 ? 'bg-emerald-50 text-emerald-500' : 'bg-red-50 text-red-400'}`}>
                  {stat.trend > 0 ? '+' : ''}{stat.trend}
                </span>
              )}
              <p className="text-2xl font-bold text-navy leading-none"><AnimatedNumber value={stat.value} /></p>
              <p className="text-xs text-royal/50 font-medium">{stat.label}</p>
            </motion.div>
          </StaggerItem>
        ))}
        <StaggerItem>
          <motion.div whileHover={{ y: -2, boxShadow: '0 6px 24px rgba(88,137,250,0.10)', transition: spring.crisp }}
            className="rounded-2xl border border-cloud bg-white shadow-card p-4 flex flex-col gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-500">
              <Icon name="wallet" size={17} />
            </div>
            <p className="text-2xl font-bold text-navy leading-none">
              <span className="text-sm font-semibold text-royal/50 mr-0.5">{me?.walletCurrency ?? 'XAF'}</span>
              <AnimatedNumber value={me?.walletBalance ?? 0} />
            </p>
            <p className="text-xs text-royal/50 font-medium">Wallet balance</p>
          </motion.div>
        </StaggerItem>
      </StaggerList>

      {/* ⑥ OVERDUE ALERT ────────────────────────────────────────────────── */}
      {overdueAssignments.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 flex items-center gap-3">
          <Icon name="close" size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-800 flex-1">
            <strong>{overdueAssignments.length} assignment{overdueAssignments.length !== 1 ? 's' : ''} overdue</strong>
            {' '}— submit before your teacher closes submissions.
          </p>
          <Link href="/student/assignments"><Button size="sm" variant="primary" className="bg-red-500 hover:bg-red-600">View</Button></Link>
        </div>
      )}

      {/* EXPIRY WARNING */}
      {expiringPkgs.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 flex items-center gap-3">
          <Icon name="clock" size={18} className="text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800 flex-1">
            <strong>{expiringPkgs.map(p => p.name).join(', ')}</strong>{' '}
            expires {new Date(expiringPkgs[0].expiresAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
          </p>
          <Link href="/packages"><Button size="sm" variant="primary">Renew</Button></Link>
        </div>
      )}

      {/* ENROLL BANNER */}
      {!hasCourses && (
        <Card className="bg-navy p-6 text-white">
          <p className="text-lg font-bold mb-1">Start your learning journey</p>
          <p className="text-sm text-white/60 mb-4">Enroll in a package to unlock courses, live classes and mentorship.</p>
          <div className="flex gap-3">
            <Link href="/packages"><Button size="sm" variant="primary">Browse packages</Button></Link>
            <Link href="/courses"><Button size="sm" variant="ghost" className="text-white/70 border-white/20 hover:bg-white/10">View courses</Button></Link>
          </div>
        </Card>
      )}

      {/* MAIN 2-COL LAYOUT */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">

        {/* ── LEFT COL (3/5) ─────────────────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-5">

          {/* ④ RESUME LEARNING */}
          {resumeCourse && (
            <Link href={`/student/learn/${resumeCourse.courseId}${resumeCourse.lessonId ? `/lesson/${resumeCourse.lessonId}` : ''}`}
              onClick={() => {
                // Track recent lessons
                const rl: LastLesson[] = JSON.parse(localStorage.getItem('cpa_recent_lessons') ?? '[]');
                const filtered = rl.filter(x => x.courseId !== resumeCourse.courseId);
                localStorage.setItem('cpa_recent_lessons', JSON.stringify([resumeCourse, ...filtered].slice(0, 3)));
              }}>
              <motion.div whileHover={{ y: -2, boxShadow: '0 8px 32px rgba(88,137,250,0.18)', transition: spring.crisp }}
                className="rounded-2xl bg-gradient-to-r from-azure to-royal text-white relative overflow-hidden flex">
                {/* Course cover thumbnail */}
                {resumeCourse.coverUrl && (
                  <div className="hidden sm:block w-32 flex-shrink-0 relative">
                    <img src={resumeCourse.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-r from-transparent to-azure/80" />
                  </div>
                )}
                <div className="flex-1 p-5 min-w-0">
                  <div className="pointer-events-none absolute right-0 top-0 h-28 w-28 translate-x-8 -translate-y-8 rounded-full bg-white/10" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-white/60 mb-1">Continue Learning</p>
                  <p className="text-base font-bold text-white mb-0.5 truncate">{resumeCourse.courseTitle ?? 'Your course'}</p>
                  {resumeCourse.lessonTitle && <p className="text-xs text-white/70 mb-3 truncate">{resumeCourse.lessonTitle}</p>}
                  {resumeCourse.pct !== undefined && (
                    <div className="space-y-1 mb-4">
                      <div className="flex justify-between">
                        <p className="text-[10px] text-white/60">Progress</p>
                        <p className="text-[10px] font-bold text-white">{resumeCourse.pct}%</p>
                      </div>
                      <div className="h-1 w-full rounded-full bg-white/20">
                        <div className="h-full rounded-full bg-white" style={{ width: `${resumeCourse.pct}%` }} />
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/20">
                      <Icon name="play" size={14} className="text-white" />
                    </div>
                    <span className="text-sm font-bold text-white">Resume lesson</span>
                    <Icon name="arrowRight" size={14} className="text-white/70 ml-auto" />
                  </div>
                </div>
              </motion.div>
            </Link>
          )}

          {/* ⑧ RECENT LESSON HISTORY */}
          {recentLessons.length > 0 && (
            <div className="rounded-xl border border-cloud bg-white p-3">
              <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40 mb-2">Recently visited</p>
              <div className="space-y-1">
                {recentLessons.map((rl, i) => {
                  const c = COURSE_COLORS[i % COURSE_COLORS.length];
                  return (
                    <Link key={rl.courseId} href={`/student/learn/${rl.courseId}`}
                      className="flex items-center gap-3 rounded-lg p-2 hover:bg-cloud/50 transition group">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${c.text.replace('text-', 'bg-')}`} />
                      <p className="text-xs font-semibold text-navy flex-1 truncate">{rl.courseTitle ?? 'Course'}</p>
                      <Icon name="arrowRight" size={11} className="text-royal/20 group-hover:text-azure transition" />
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Search bar */}
          <div className="relative">
            <Icon name="search" size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-royal/40 pointer-events-none" />
            <input value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="Search your courses..."
              className="w-full rounded-xl border border-cloud bg-white pl-10 pr-4 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/30 transition-colors" />
          </div>

          {/* Continue Classes strip */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-block h-4 w-1 rounded-full bg-azure" />
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Continue Classes</h2>
              </div>
              {hasCourses && <Link href="/student/courses" className="text-xs font-semibold text-azure hover:text-royal transition">See All</Link>}
            </div>
            {hasCourses ? (
              <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2
                              [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 md:mx-0 md:px-0">
                {packages.map((pkg, i) => {
                  const c = COURSE_COLORS[i % COURSE_COLORS.length];
                  const started = certProgress.filter(cp => pkg.courseIds?.includes(cp.courseId) && (cp.percentComplete ?? 0) > 0).length;
                  const total = pkg.courseIds?.length ?? 0;
                  const pkgPct = total > 0 ? Math.round((started / total) * 100) : 0;
                  return (
                    <Link key={pkg.id} href="/student/courses" className="snap-start flex-shrink-0 w-[190px]">
                      <motion.div whileHover={{ y: -3, boxShadow: '0 8px 28px rgba(88,137,250,0.15)', transition: spring.crisp }}
                        whileTap={{ scale: 0.97, transition: spring.snappy }}
                        className="h-full rounded-2xl border border-cloud bg-white overflow-hidden">
                        <div className={`h-24 ${c.bg} flex items-center justify-center`}>
                          <div className={`h-14 w-14 rounded-2xl bg-white/60 flex items-center justify-center ${c.text}`}>
                            <Icon name="packages" size={28} />
                          </div>
                        </div>
                        <div className="p-3">
                          <p className="text-xs font-bold text-navy line-clamp-1 mb-1">{pkg.name}</p>
                          <div className="space-y-1 mb-2">
                            <div className="flex justify-between">
                              <p className="text-[10px] text-royal/40">{started}/{total} started</p>
                              <p className="text-[10px] font-bold" style={{ color: c.bar }}>{pkgPct}%</p>
                            </div>
                            <div className="h-1 w-full rounded-full bg-cloud overflow-hidden">
                              <div className="h-full rounded-full transition-all" style={{ width: `${pkgPct}%`, backgroundColor: c.bar }} />
                            </div>
                          </div>
                          <Badge variant="active">Active</Badge>
                        </div>
                      </motion.div>
                    </Link>
                  );
                })}
                {coursePurchases.slice(0, 6).map((p, i) => {
                  const pct = progressMap[p.courseId] ?? 0;
                  const c = COURSE_COLORS[(i + packages.length) % COURSE_COLORS.length];
                  return (
                    <Link key={p.id} href={`/student/learn/${p.courseId}`} className="snap-start flex-shrink-0 w-[190px]">
                      <motion.div whileHover={{ y: -3, boxShadow: '0 8px 28px rgba(88,137,250,0.15)', transition: spring.crisp }}
                        whileTap={{ scale: 0.97, transition: spring.snappy }}
                        className="h-full rounded-2xl border border-cloud bg-white overflow-hidden">
                        {p.course?.coverUrl
                          ? <img src={p.course.coverUrl} alt={p.course.title} className="h-24 w-full object-cover" />
                          : (
                            <div className={`h-24 ${c.bg} flex items-center justify-center`}>
                              <div className={`h-14 w-14 rounded-2xl bg-white/60 flex items-center justify-center text-2xl font-bold ${c.text}`}>
                                {(p.course?.title ?? 'C')[0].toUpperCase()}
                              </div>
                            </div>
                          )}
                        <div className="p-3">
                          <p className="text-xs font-bold text-navy line-clamp-1 mb-0.5">{p.course?.title ?? 'Course'}</p>
                          <p className="text-[10px] text-royal/40 mb-2">{p.course?.subject?.name ?? 'Self-paced'}</p>
                          <div className="space-y-1">
                            <div className="flex justify-between">
                              <p className="text-[10px] text-royal/40 font-semibold">Progress</p>
                              <p className="text-[10px] font-bold text-azure">{pct}%</p>
                            </div>
                            <div className="h-1 w-full rounded-full bg-cloud overflow-hidden">
                              <div className="h-full rounded-full bg-gradient-to-r from-azure to-royal" style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-1 text-azure">
                            <span className="text-[11px] font-bold">{pct === 100 ? 'Review' : 'Continue'}</span>
                            <Icon name="arrowRight" size={11} />
                          </div>
                        </div>
                      </motion.div>
                    </Link>
                  );
                })}
                <Link href="/packages"
                  className="snap-start flex-shrink-0 w-[140px] min-h-[180px] flex flex-col items-center justify-center gap-3
                             rounded-2xl bg-navy hover:opacity-90 active:scale-[0.97] transition-all p-4 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10">
                    <Icon name="packages" size={20} className="text-azure" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-white leading-tight">{packages.length > 0 ? 'More packages' : 'Browse packages'}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">Explore all</p>
                  </div>
                </Link>
              </div>
            ) : (
              <EmptyState icon="courses" title="No courses yet" description="Browse packages to start learning"
                action={{ label: 'Browse packages', href: '/packages' }} />
            )}
          </div>

          {/* ③ ACHIEVEMENT BADGES */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-block h-4 w-1 rounded-full bg-amber-400" />
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Achievements</h2>
              </div>
              <span className="text-xs font-semibold text-royal/40">{achievements.filter(a => a.earned).length}/{achievements.length} earned</span>
            </div>
            <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 md:mx-0 md:px-0 pb-1">
              {achievements.map(a => (
                <div key={a.id} className={`flex-shrink-0 flex flex-col items-center gap-1.5 rounded-xl p-3 w-[78px] border relative transition-all
                  ${a.earned ? 'bg-white border-cloud shadow-sm' : 'bg-cloud/30 border-transparent opacity-50'}`}>
                  <div className={`h-10 w-10 rounded-xl flex items-center justify-center ${a.earned ? a.color : 'bg-cloud text-royal/30'}`}>
                    <Icon name={a.icon} size={18} />
                  </div>
                  <p className="text-[10px] font-semibold text-navy text-center leading-tight">{a.label}</p>
                  {a.earned
                    ? <div className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-amber-400" />
                    : <div className="absolute top-1.5 right-1.5"><Icon name="lock" size={9} className="text-royal/30" /></div>}
                </div>
              ))}
            </div>
          </div>

          {/* ③ DEADLINE RADAR — 14-day strip */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-block h-4 w-1 rounded-full bg-red-400" />
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Deadline Radar</h2>
              </div>
              <span className="text-[10px] text-royal/40 font-medium">Next 14 days</span>
            </div>
            <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 md:mx-0 md:px-0 pb-1">
              {Array.from({ length: 14 }, (_, i) => {
                const d = new Date(today); d.setDate(today.getDate() + i);
                const dStr = d.toDateString();
                const isToday = i === 0;
                const hasLive = liveSessionDateSet.has(dStr);
                const hasDue  = assignmentDueDateSet.has(dStr);
                return (
                  <Link key={i} href="/student/calendar"
                    className={`flex-shrink-0 flex flex-col items-center gap-1 rounded-xl p-2 min-w-[44px] transition
                      ${isToday ? 'bg-azure text-white' : (hasLive || hasDue) ? 'bg-cloud' : 'hover:bg-cloud/60'}`}>
                    <p className={`text-[10px] font-semibold ${isToday ? 'text-white/70' : 'text-royal/50'}`}>
                      {d.toLocaleDateString('en-GB', { weekday: 'short' })}
                    </p>
                    <p className={`text-sm font-bold ${isToday ? 'text-white' : 'text-navy'}`}>{d.getDate()}</p>
                    <div className="flex gap-0.5 h-2 items-center">
                      {hasLive && <div className={`h-1.5 w-1.5 rounded-full ${isToday ? 'bg-white/70' : 'bg-red-400'}`} />}
                      {hasDue  && <div className={`h-1.5 w-1.5 rounded-full ${isToday ? 'bg-white/70' : 'bg-amber-400'}`} />}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>

          {/* ④ CERTIFICATE CHECKLIST */}
          {checklistCert && checklistItems.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-4 w-1 rounded-full bg-azure" />
                  <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Toward Certificate</h2>
                </div>
                <Link href={`/student/learn/${checklistCert.courseId}`} className="text-xs font-semibold text-azure hover:text-royal transition">Study now</Link>
              </div>
              <div className="rounded-2xl border border-cloud bg-white p-4">
                <p className="text-xs font-semibold text-navy mb-3 truncate">{checklistCert.courseTitle}</p>
                <div className="space-y-2.5">
                  {checklistItems.map(item => {
                    const done = item.done >= item.total && item.total > 0;
                    return (
                      <div key={item.label} className="flex items-center gap-3">
                        <div className={`h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0
                          ${done ? 'bg-emerald-50 text-emerald-500' : 'bg-cloud text-royal/40'}`}>
                          <Icon name={done ? 'check' : 'clock'} size={11} />
                        </div>
                        <p className="text-xs text-navy flex-1">{item.label}</p>
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-1 rounded-full bg-cloud overflow-hidden">
                            <div className={`h-full rounded-full ${done ? 'bg-emerald-400' : 'bg-azure'}`}
                              style={{ width: item.total > 0 ? `${Math.min(100, (item.done / item.total) * 100)}%` : '0%' }} />
                          </div>
                          <p className={`text-[10px] font-bold w-8 text-right ${done ? 'text-emerald-500' : 'text-azure'}`}>
                            {item.done}/{item.total}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {checklistRemaining > 0 && (
                  <p className="text-[10px] text-royal/40 mt-3 pt-3 border-t border-cloud text-center">
                    {checklistRemaining} item{checklistRemaining !== 1 ? 's' : ''} left to earn this certificate
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Your Courses list */}
          {filteredCourses.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-4 w-1 rounded-full bg-royal" />
                  <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Your Courses</h2>
                </div>
                <Link href="/student/courses" className="text-xs font-semibold text-azure hover:text-royal transition">See All</Link>
              </div>
              <div className="space-y-2">
                {filteredCourses.slice(0, 5).map((p, i) => {
                  const pct = progressMap[p.courseId] ?? 0;
                  const c = COURSE_COLORS[i % COURSE_COLORS.length];
                  return (
                    <Link key={p.id} href={`/student/learn/${p.courseId}`}>
                      <motion.div whileHover={{ x: 2, transition: spring.snappy }}
                        className="flex items-center gap-4 rounded-xl border border-cloud bg-white p-3 hover:border-azure/30 hover:shadow-sm transition-all cursor-pointer">
                        <div className={`flex-shrink-0 h-12 w-12 rounded-xl ${c.bg} flex items-center justify-center ${c.text} text-base font-bold`}>
                          {(p.course?.title ?? 'C')[0].toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-navy truncate">{p.course?.title ?? 'Course'}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            {p.course?.subject?.name && <span className={`text-[10px] font-semibold ${c.text}`}>{p.course.subject.name}</span>}
                            {p.course?.subject?.name && <span className="text-royal/20">·</span>}
                            <span className="text-[10px] text-royal/40">{pct === 100 ? 'Completed' : pct > 0 ? `${pct}% done` : 'Not started'}</span>
                          </div>
                          <div className="mt-1.5 h-1 w-full rounded-full bg-cloud overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: c.bar }} />
                          </div>
                        </div>
                        <Icon name="arrowRight" size={14} className="text-royal/20 flex-shrink-0" />
                      </motion.div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* ② YOUR TEACHERS */}
          {teachers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-block h-4 w-1 rounded-full bg-royal" />
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Your Teachers</h2>
              </div>
              <div className="flex gap-3 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-4 px-4 md:mx-0 md:px-0 pb-1">
                {teachers.map((t, i) => {
                  const c = COURSE_COLORS[i % COURSE_COLORS.length];
                  return (
                    <div key={t.id} className="flex-shrink-0 w-[140px] rounded-2xl border border-cloud bg-white p-4 flex flex-col items-center gap-2 text-center">
                      <div className={`h-12 w-12 rounded-full ${c.bg} flex items-center justify-center text-base font-bold ${c.text}`}>
                        {t.name[0]?.toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-navy leading-tight truncate">{t.name}</p>
                        {t.subject && <p className={`text-[10px] font-semibold mt-0.5 ${c.text}`}>{t.subject}</p>}
                      </div>
                      <Link href="/student/messages"
                        className="w-full rounded-lg bg-azure/10 py-1.5 text-[11px] font-semibold text-azure hover:bg-azure/20 transition text-center">
                        Message
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ⑤ SKILL TAGS */}
          {skillTags.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-block h-4 w-1 rounded-full bg-emerald-400" />
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Skills & Topics</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {skillTags.map((tag, i) => {
                  const c = COURSE_COLORS[i % COURSE_COLORS.length];
                  return (
                    <Link key={tag} href={`/student/catalogue?q=${encodeURIComponent(tag)}`}>
                      <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-semibold
                        ${c.bg} ${c.text} border-current/20 hover:opacity-80 transition cursor-pointer`}>
                        <Icon name="tag" size={10} />
                        {tag}
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT COL (2/5) ─────────────────────────────────────────────── */}
        <FadeUp delay={0.1} className="lg:col-span-2 space-y-5">

          {/* Date + icons header */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-bold text-navy">{today.toLocaleDateString('en-GB', { weekday: 'long' })}</p>
              <p className="text-xs text-royal/40">{today.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/student/notifications" className="flex h-9 w-9 items-center justify-center rounded-xl border border-cloud bg-white hover:border-azure/30 transition">
                <Icon name="bell" size={16} className="text-royal/60" />
              </Link>
              <div className="h-9 w-9 rounded-xl bg-azure/10 flex items-center justify-center text-sm font-bold text-azure">
                {firstName[0]?.toUpperCase()}
              </div>
            </div>
          </div>

          {/* ⑤ COUNTDOWN TO NEXT LIVE CLASS */}
          {nextLiveSession && countdown && (
            <div className="rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 to-rose-50/40 p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <p className="text-[10px] font-bold uppercase tracking-widest text-red-400">Next Live Class</p>
              </div>
              <p className="text-xs font-semibold text-navy truncate mb-2">{nextLiveSession.title}</p>
              <p className="text-2xl font-bold text-navy font-mono tracking-wider">{countdown}</p>
              <Link href={`/student/live/${nextLiveSession.id}`}
                className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-red-500 hover:text-red-600 transition">
                Join class <Icon name="arrowRight" size={11} />
              </Link>
            </div>
          )}

          {/* ① POMODORO STUDY TIMER */}
          <div className="rounded-2xl border border-cloud bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-block h-4 w-1 rounded-full bg-azure" />
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Study Timer</h2>
              </div>
              <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full
                ${pomMode === 'work' ? 'bg-azure/10 text-azure' : pomMode === 'break' ? 'bg-emerald-50 text-emerald-500' : 'bg-cloud text-royal/40'}`}>
                {pomMode === 'work' ? 'Focus' : pomMode === 'break' ? 'Break' : 'Ready'}
              </span>
            </div>
            <div className="flex items-center justify-center mb-3 relative">
              <ProgressRing pct={pomPct} size={96} stroke={7}
                color={pomMode === 'break' ? '#10b981' : '#5889FA'} trackColor="#E6ECFD" />
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <p className="text-xl font-bold text-navy font-mono">{pomDisplay}</p>
                <p className="text-[10px] text-royal/40">{pomMode === 'break' ? 'break' : 'focus'}</p>
              </div>
            </div>
            <div className="flex justify-center gap-1.5 mb-3">
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} className={`h-2 w-2 rounded-full ${i < pomSessions % 4 ? 'bg-azure' : 'bg-cloud'}`} />
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={() => {
                if (pomMode !== 'idle') { setPomMode('idle'); setPomSeconds(25 * 60); }
                else setPomMode('work');
              }} className={`flex-1 rounded-xl py-2 text-xs font-bold transition
                ${pomMode !== 'idle' ? 'bg-red-50 text-red-400 hover:bg-red-100' : 'bg-azure text-white hover:bg-azure/90'}`}>
                {pomMode !== 'idle' ? 'Stop' : 'Start focus'}
              </button>
              <button onClick={() => { setPomMode('idle'); setPomSeconds(25 * 60); }}
                className="rounded-xl border border-cloud px-3 py-2 text-xs font-bold text-royal/50 hover:bg-cloud transition">
                Reset
              </button>
            </div>
            {pomSessions > 0 && (
              <p className="text-[10px] text-royal/40 text-center mt-2">{pomSessions} session{pomSessions !== 1 ? 's' : ''} completed today</p>
            )}
          </div>

          {/* ⑦ OVERALL PROGRESS RING */}
          {allPcts.length > 0 && (
            <div className="rounded-2xl border border-cloud bg-white p-4">
              <div className="flex items-center gap-2 mb-4">
                <span className="inline-block h-4 w-1 rounded-full bg-azure" />
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Overall Progress</h2>
              </div>
              <div className="flex items-center gap-5">
                <div className="relative flex-shrink-0">
                  <ProgressRing pct={overallPct} size={96} stroke={9} />
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-xl font-bold text-navy leading-none">{overallPct}%</p>
                    <p className="text-[10px] text-royal/40">overall</p>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  {[
                    { label: 'Active',     val: `${allPcts.filter(p => p > 0).length}/${allPcts.length}`, color: 'bg-azure' },
                    { label: 'Completed',  val: `${allPcts.filter(p => p >= 100).length}`,                color: 'bg-emerald-400' },
                    { label: 'Certs',      val: `${certs.length}`,                                        color: 'bg-amber-400' },
                  ].map(row => (
                    <div key={row.label} className="flex items-center gap-2">
                      <div className={`h-2 w-2 rounded-full flex-shrink-0 ${row.color}`} />
                      <p className="text-[11px] text-royal/50 flex-1">{row.label}</p>
                      <p className="text-[11px] font-bold text-navy">{row.val}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Mini Study Calendar */}
          <div className="rounded-2xl border border-cloud bg-white p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="inline-block h-4 w-1 rounded-full bg-azure" />
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Study Calendar</h2>
              </div>
              <Link href="/student/calendar" className="text-xs font-semibold text-azure hover:text-royal transition">Full view</Link>
            </div>
            <p className="text-xs font-semibold text-navy text-center mb-2">{MONTH_NAMES[calMonth]} {calYear}</p>
            <div className="grid grid-cols-7 mb-1">
              {['S','M','T','W','T','F','S'].map((d, i) => (
                <div key={i} className="text-center text-[10px] font-bold text-royal/40">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-y-0.5">
              {Array.from({ length: calFirstDay }, (_, i) => <div key={`e-${i}`} />)}
              {Array.from({ length: calDaysInMonth }, (_, i) => {
                const dayNum = i + 1;
                const dateStr = new Date(calYear, calMonth, dayNum).toDateString();
                const isToday = dayNum === today.getDate();
                const hasLive = liveSessionDateSet.has(dateStr);
                const hasDue  = assignmentDueDateSet.has(dateStr);
                return (
                  <Link key={dayNum} href="/student/calendar"
                    className="flex flex-col items-center py-0.5 rounded-lg hover:bg-cloud/60 transition">
                    <span className={`h-6 w-6 flex items-center justify-center rounded-full text-[11px] font-semibold
                      ${isToday ? 'bg-azure text-white' : 'text-navy'}`}>{dayNum}</span>
                    {(hasLive || hasDue) && (
                      <div className="flex gap-0.5 mt-0.5">
                        {hasLive && <div className="h-1 w-1 rounded-full bg-red-400" />}
                        {hasDue  && <div className="h-1 w-1 rounded-full bg-amber-400" />}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 pt-3 border-t border-cloud">
              <div className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-red-400" /><span className="text-[10px] text-royal/50">Live</span></div>
              <div className="flex items-center gap-1.5"><div className="h-1.5 w-1.5 rounded-full bg-amber-400" /><span className="text-[10px] text-royal/50">Due</span></div>
            </div>
          </div>

          {/* Learning Activity BarChart */}
          <div className="rounded-2xl border border-cloud bg-white p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="inline-block h-4 w-1 rounded-full bg-azure" />
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Learning Activity</h2>
              </div>
              <Link href="/student/progress" className="text-[10px] font-semibold text-azure hover:text-royal transition">Full report</Link>
            </div>
            {chartData.some(d => d.progress > 0) ? (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={chartData} barSize={14} margin={{ top: 8, right: 0, left: -24, bottom: 0 }}>
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#405FAD99' }} tickLine={false} axisLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: '#405FAD99' }} tickLine={false} axisLine={false} domain={[0, 100]} />
                  <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #E6ECFD', boxShadow: 'none', padding: '6px 10px' }}
                    formatter={(v) => [`${v ?? 0}%`, 'Progress']} cursor={{ fill: 'rgba(88,137,250,0.05)' }} />
                  <Bar dataKey="progress" fill="#5889FA" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-44 flex flex-col items-center justify-center gap-2">
                <Icon name="trending" size={32} className="text-cloud" />
                <p className="text-xs text-royal/40">Start a course to see activity</p>
              </div>
            )}
          </div>

          {/* My Progress AreaChart */}
          <div className="rounded-2xl border border-cloud bg-white p-4">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2">
                <span className="inline-block h-4 w-1 rounded-full bg-emerald-400" />
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">My Progress</h2>
              </div>
              <span className="text-[10px] font-semibold text-royal/40 uppercase">Weekly</span>
            </div>
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={weekData} margin={{ top: 6, right: 0, left: -24, bottom: 0 }}>
                <defs>
                  <linearGradient id="progressGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5889FA" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#5889FA" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: '#405FAD99' }} tickLine={false} axisLine={false} />
                <YAxis hide domain={[0, 8]} />
                <Tooltip contentStyle={{ fontSize: 11, borderRadius: 10, border: '1px solid #E6ECFD', boxShadow: 'none', padding: '6px 10px' }}
                  formatter={(v) => [`${v ?? 0}h`, 'Study hours']} />
                <Area type="monotone" dataKey="hours" stroke="#5889FA" strokeWidth={2}
                  fill="url(#progressGrad)" dot={false} activeDot={{ r: 4, fill: '#5889FA' }} />
              </AreaChart>
            </ResponsiveContainer>
            <p className="mt-1 text-[10px] text-royal/40 text-center">Hours tracked as you complete lessons</p>
          </div>

          {/* Assignments */}
          {assignments.filter(a => !overdueAssignments.includes(a)).length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-4 w-1 rounded-full bg-amber-400" />
                  <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Assignments</h2>
                </div>
                <Link href="/student/assignments" className="text-xs font-semibold text-azure hover:text-royal transition">See All</Link>
              </div>
              <div className="space-y-2">
                {assignments.filter(a => !overdueAssignments.includes(a)).slice(0, 3).map((a, i) => {
                  const c = COURSE_COLORS[i % COURSE_COLORS.length];
                  const dueIn = a.dueAt ? Math.ceil((new Date(a.dueAt).getTime() - now) / 86400000) : null;
                  return (
                    <Link key={a.id} href="/student/assignments">
                      <motion.div whileHover={{ x: 2, transition: spring.snappy }}
                        className="flex items-center gap-3 rounded-xl border border-cloud bg-white p-3 hover:border-azure/30 hover:shadow-sm transition-all">
                        <div className={`flex-shrink-0 h-9 w-9 rounded-xl ${c.bg} flex items-center justify-center ${c.text}`}>
                          <Icon name="assignments" size={15} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold text-navy truncate">{a.title}</p>
                          <p className="text-[10px] text-royal/40">
                            {dueIn !== null ? dueIn === 0 ? 'Due today' : `Due in ${dueIn}d` : a.course?.title ?? ''}
                          </p>
                        </div>
                        <div className="flex-shrink-0 h-7 w-7 rounded-full bg-azure flex items-center justify-center">
                          <Icon name="arrowRight" size={12} className="text-white" />
                        </div>
                      </motion.div>
                    </Link>
                  );
                })}
              </div>
            </div>
          )}

          {/* Leaderboard */}
          {leaderboard.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-block h-4 w-1 rounded-full bg-purple-400" />
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Cohort Rank</h2>
              </div>
              <div className="rounded-2xl border border-cloud bg-white p-4 space-y-3">
                {leaderboard.slice(0, 3).map((entry, i) => (
                  <div key={entry.userId} className="flex items-center gap-3">
                    <span className={`text-xs font-bold w-5 text-center flex-shrink-0
                      ${i === 0 ? 'text-amber-500' : i === 1 ? 'text-royal/50' : 'text-orange-400'}`}>#{entry.rank}</span>
                    <div className="h-8 w-8 rounded-full bg-azure/10 flex items-center justify-center text-xs font-bold text-azure flex-shrink-0">
                      {entry.name[0]?.toUpperCase()}
                    </div>
                    <p className="text-xs font-semibold text-navy flex-1 truncate">{entry.name}</p>
                    <div className="flex items-center gap-2">
                      {/* Bar is relative to the cohort leader's XP */}
                      <div className="h-1 w-16 rounded-full bg-cloud overflow-hidden">
                        <div className="h-full rounded-full bg-azure"
                          style={{ width: `${leaderboard[0]?.xpTotal ? Math.round((entry.xpTotal / leaderboard[0].xpTotal) * 100) : 0}%` }} />
                      </div>
                      <p className="text-[10px] font-bold text-azure w-12 text-right">{entry.xpTotal} XP</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Class Activity Feed */}
          {activityFeed.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-block h-4 w-1 rounded-full bg-emerald-400" />
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Class Activity</h2>
              </div>
              <div className="space-y-2">
                {activityFeed.map((item, i) => (
                  <div key={i} className="flex items-start gap-3 rounded-xl border border-cloud bg-white p-3">
                    <div className="flex-shrink-0 h-7 w-7 rounded-full bg-cloud flex items-center justify-center text-xs font-bold text-royal">
                      {item.name[0]?.toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] text-navy">
                        <span className="font-semibold">{item.name}</span> {item.action} <span className="font-semibold">{item.target}</span>
                      </p>
                      <p className="text-[10px] text-royal/40 mt-0.5">{item.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Live sessions */}
          {liveSessions.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-block h-4 w-1 rounded-full bg-red-400" />
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Upcoming Live</h2>
              </div>
              <div className="space-y-2">
                {liveSessions.slice(0, 3).map(session => (
                  <Link key={session.id} href={`/student/live/${session.id}`}>
                    <Card className="flex items-center gap-3 p-3 hover:shadow-sm transition cursor-pointer">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-50 flex-shrink-0">
                        <Icon name="live" size={16} className="text-red-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-navy truncate">{session.title}</p>
                        <p className="text-[11px] text-royal/50">
                          {session.status === 'ACTIVE'
                            ? <span className="inline-flex items-center gap-1 text-red-500 font-semibold">
                                <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse inline-block" /> Live now
                              </span>
                            : new Date(session.scheduledAt).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                    </Card>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* AI Recommendations */}
          {recs.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="inline-block h-4 w-1 rounded-full bg-azure" />
                <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Recommended</h2>
                <Icon name="sparkles" size={13} className="text-azure/60" />
              </div>
              <div className="space-y-2">
                {recs.map(rec => (
                  <Link key={rec.courseId} href="/courses"
                    className="flex items-start gap-3 rounded-xl border border-cloud bg-white p-3 hover:border-azure/40 hover:shadow-sm transition-all group">
                    <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-cloud overflow-hidden">
                      {rec.coverUrl ? <img src={rec.coverUrl} alt={rec.title} className="h-full w-full object-cover" />
                        : <Icon name="courses" size={16} className="text-royal" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-navy truncate">{rec.title}</p>
                      {rec.subjectName && <p className="text-[10px] text-royal/40">{rec.subjectName}</p>}
                      {rec.tip && <p className="text-[10px] text-azure/70 mt-0.5 line-clamp-1">{rec.tip}</p>}
                    </div>
                    <Icon name="arrowRight" size={12} className="text-royal/20 group-hover:text-azure transition flex-shrink-0 mt-0.5" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* ⑥ STUDY REMINDER */}
          <div className="rounded-2xl border border-cloud bg-white p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block h-4 w-1 rounded-full bg-amber-400" />
              <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Study Reminder</h2>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-navy">Daily reminder</p>
                <p className="text-[10px] text-royal/40 mt-0.5">Get notified to study every day</p>
              </div>
              <button onClick={() => toggleReminder(!reminderOn)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${reminderOn ? 'bg-azure' : 'bg-cloud'}`}>
                <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${reminderOn ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            {reminderOn && (
              <div className="mt-3 flex items-center gap-2 pt-3 border-t border-cloud">
                <Icon name="clock" size={13} className="text-royal/40" />
                <input type="time" value={reminderTime}
                  onChange={e => { setReminderTime(e.target.value); localStorage.setItem('cpa_reminder', JSON.stringify({ enabled: true, time: e.target.value })); }}
                  className="text-xs font-semibold text-navy bg-transparent outline-none" />
                <span className="text-[10px] text-royal/40">daily</span>
              </div>
            )}
          </div>

          {/* ⑫ MOTIVATIONAL QUOTE */}
          <div className="rounded-2xl border-l-4 border-azure bg-azure/5 p-4">
            <Icon name="sparkles" size={14} className="text-azure mb-2" />
            <p className="text-sm text-navy italic leading-relaxed">"{quote.text}"</p>
            <p className="text-[11px] font-semibold text-royal/50 mt-2">— {quote.author}</p>
          </div>

          {/* ⑬ KEEP LEARNING PROMO CARD */}
          <div className="rounded-2xl bg-gradient-to-br from-navy via-[#0d35a0] to-royal p-5 relative overflow-hidden">
            <div className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 rounded-full bg-white/5" />
            <div className="pointer-events-none absolute -left-4 bottom-0 h-16 w-16 translate-y-4 rounded-full bg-azure/25" />
            <div className="relative z-10">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 mb-3">
                <Icon name="graduate" size={24} className="text-white" />
              </div>
              <p className="text-sm font-bold text-white leading-snug mb-1">Keep Learning,<br />Go Ahead...</p>
              <p className="text-[11px] text-white/60 mb-4">Explore programmes with CareerPath Africa and unlock your potential.</p>
              <Link href="/packages">
                <button className="w-full rounded-xl bg-azure px-4 py-2 text-xs font-bold text-white hover:bg-azure/90 transition">
                  Get Access
                </button>
              </Link>
            </div>
          </div>

          {/* Quick links */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-block h-4 w-1 rounded-full bg-royal" />
              <h2 className="text-sm font-bold text-navy uppercase tracking-wide">Quick Links</h2>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {QUICK_LINKS.map(link => (
                <Link key={link.label} href={link.href}>
                  <motion.div whileHover={{ y: -2, boxShadow: '0 4px 16px rgba(88,137,250,0.12)', transition: spring.crisp }}
                    whileTap={{ scale: 0.95, transition: spring.snappy }}
                    className="flex flex-col items-center gap-2 rounded-xl border border-cloud bg-white p-3 text-center hover:border-azure/30 transition-colors">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-azure/8">
                      <Icon name={link.icon} size={16} className="text-azure" />
                    </div>
                    <span className="text-[11px] font-semibold text-navy leading-tight">{link.label}</span>
                  </motion.div>
                </Link>
              ))}
            </div>
          </div>

        </FadeUp>
      </div>

      {/* ⑬ CONFETTI — fires when a new certificate is earned */}
      <AnimatePresence>
        {showConfetti && (
          <>
            {Array.from({ length: 55 }, (_, i) => (
              <motion.div key={i} className="confetti-piece"
                style={{
                  left: `${Math.random() * 100}%`,
                  width: `${6 + Math.random() * 7}px`,
                  height: `${6 + Math.random() * 7}px`,
                  borderRadius: Math.random() > 0.5 ? '50%' : '2px',
                  backgroundColor: ['#5889FA','#f59e0b','#10b981','#f87171','#a855f7','#ec4899'][i % 6],
                  animationDuration: `${2 + Math.random() * 2.5}s`,
                  animationDelay: `${Math.random() * 1.2}s`,
                }}
                initial={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            ))}
            <motion.div initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0, opacity: 0 }} transition={{ type: 'spring', stiffness: 300, damping: 20 }}
              className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
              <div className="bg-white rounded-2xl p-6 shadow-2xl text-center border border-cloud mx-4">
                <Icon name="certificates" size={36} className="text-amber-500 mx-auto mb-2" />
                <p className="text-lg font-bold text-navy">Certificate Earned!</p>
                <p className="text-sm text-royal/60 mt-1">Congratulations on your achievement</p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ⑱ ONBOARDING TOUR */}
      <AnimatePresence>
        {onboardStep !== null && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-navy/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <motion.div initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
              className="w-full max-w-sm bg-white rounded-2xl p-6 shadow-2xl">
              {/* Step dots */}
              <div className="flex justify-center gap-1.5 mb-4">
                {ONBOARD_STEPS.map((_, i) => (
                  <div key={i} className={`h-1.5 rounded-full transition-all ${i === onboardStep ? 'w-6 bg-azure' : 'w-1.5 bg-cloud'}`} />
                ))}
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-azure/10 mb-4 mx-auto">
                <Icon name="dashboard" size={22} className="text-azure" />
              </div>
              <h3 className="text-base font-bold text-navy text-center mb-2">{ONBOARD_STEPS[onboardStep].title}</h3>
              <p className="text-sm text-royal/60 text-center leading-relaxed mb-5">{ONBOARD_STEPS[onboardStep].body}</p>
              <div className="flex gap-2">
                <button onClick={() => { setOnboardStep(null); localStorage.setItem('cpa_onboarded', '1'); }}
                  className="flex-1 rounded-xl border border-cloud py-2.5 text-sm font-semibold text-royal/60 hover:bg-cloud transition">
                  Skip
                </button>
                <button onClick={advanceOnboard}
                  className="flex-1 rounded-xl bg-azure py-2.5 text-sm font-bold text-white hover:bg-royal transition">
                  {onboardStep < ONBOARD_STEPS.length - 1 ? 'Next' : "Let's go!"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
