'use client';
import { useEffect, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, ResponsiveContainer, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend,
} from 'recharts';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';
import { StudyHeatmap } from '@/components/learning/StudyHeatmap';
import { toast } from 'sonner';

interface Stats {
  totalCourses: number;
  completedCourses: number;
  totalLessons: number;
  completedLessons: number;
  avgQuizScore: number;
  studyHours: number;
  streak: number;
  certificates: number;
}

interface WeeklyPoint { week: string; hours: number; lessons: number; }
interface QuizScore  { course: string; score: number; }
interface SkillRadar { subject: string; value: number; }

// Build 8-week placeholder data from localStorage week snapshots
function buildWeeklyData(): WeeklyPoint[] {
  const weeks: WeeklyPoint[] = [];
  for (let i = 7; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i * 7);
    const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    const snap  = localStorage.getItem(`cpa_week_snap_${d.toISOString().slice(0, 10)}`);
    const hours = snap ? JSON.parse(snap).hours ?? 0 : 0;
    weeks.push({ week: label, hours, lessons: 0 });
  }
  return weeks;
}

function StatCard({ label, value, sub, icon, color }: {
  label: string; value: string | number; sub?: string;
  icon: string; color: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border border-cloud bg-white p-4 flex items-center gap-3"
    >
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl ${color}`}>
        <Icon name={icon as never} size={18} className="text-white" />
      </div>
      <div>
        <p className="text-xl font-black text-navy">{value}</p>
        <p className="text-[11px] font-semibold text-navy">{label}</p>
        {sub && <p className="text-[10px] text-royal/40">{sub}</p>}
      </div>
    </motion.div>
  );
}

export default function ProgressPage() {
  const [stats, setStats]     = useState<Stats | null>(null);
  const [weekly, setWeekly]   = useState<WeeklyPoint[]>([]);
  const [quizzes, setQuizzes] = useState<QuizScore[]>([]);
  const [radar, setRadar]     = useState<SkillRadar[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const localWeekly = buildWeeklyData();
    setWeekly(localWeekly);

    Promise.all([
      api.get('/portals/student/stats').then(r => setStats(r.data)).catch(() => {}),
      api.get('/portals/student/quiz-scores').then(r => {
        const raw: { courseTitle?: string; score?: number }[] = r.data ?? [];
        setQuizzes(raw.map(q => ({ course: q.courseTitle ?? 'Quiz', score: q.score ?? 0 })));
        // Build radar from quiz scores by category/course
        setRadar(raw.slice(0, 6).map((q, i) => ({
          subject: (q.courseTitle ?? 'Topic').split(' ')[0],
          value: q.score ?? 0,
        })));
      }).catch(() => {}),
      api.get('/portals/student/weekly-hours').then(r => {
        const raw: { week: string; hours: number; lessons: number }[] = r.data ?? [];
        if (raw.length > 0) setWeekly(raw);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  function exportCSV() {
    const rows = [
      ['Week', 'Hours', 'Lessons'],
      ...weekly.map(w => [w.week, w.hours, w.lessons]),
    ];
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url; a.download = 'study_progress.csv'; a.click();
    URL.revokeObjectURL(url);
    toast.success('CSV exported');
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <div className="h-14 bg-cloud animate-pulse" />
      <div className="p-6 grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[1,2,3,4].map(i => <div key={i} className="h-20 rounded-2xl bg-cloud animate-pulse" />)}
      </div>
    </div>
  );

  const completionPct = stats
    ? Math.round(((stats.completedCourses ?? 0) / Math.max(stats.totalCourses ?? 1, 1)) * 100)
    : 0;
  const lessonPct = stats
    ? Math.round(((stats.completedLessons ?? 0) / Math.max(stats.totalLessons ?? 1, 1)) * 100)
    : 0;

  return (
    <div className="flex flex-col min-h-full">
      <Topbar
        title="My Progress"
        subtitle="Study hours, quiz scores and analytics"
        backHref="/student/dashboard"
        backLabel="Dashboard"
        actions={
          <button
            onClick={exportCSV}
            className="flex items-center gap-1.5 rounded-xl border border-cloud px-3 py-1.5 text-xs font-semibold text-navy hover:bg-cloud transition">
            <Icon name="reports" size={13} /> Export CSV
          </button>
        }
      />

      <div className="flex-1 p-4 md:p-6 space-y-5 max-w-5xl">

        {/* Stat cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard label="Study Hours"     value={stats?.studyHours ?? 0}        icon="calendar"     color="bg-azure"           sub="total logged" />
          <StatCard label="Avg Quiz Score"  value={`${stats?.avgQuizScore ?? 0}%`} icon="assignments"  color="bg-emerald-500"     sub="across all quizzes" />
          <StatCard label="Day Streak"      value={stats?.streak ?? 0}             icon="star"         color="bg-amber-500"       sub="days in a row" />
          <StatCard label="Certificates"    value={stats?.certificates ?? 0}       icon="certificates" color="bg-purple-500"      sub="earned so far" />
        </div>

        {/* Completion rings row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card padding="md" className="flex items-center gap-5">
            <svg width={80} height={80} viewBox="0 0 80 80">
              <circle cx={40} cy={40} r={33} fill="none" stroke="#E6ECFD" strokeWidth={8} />
              <circle cx={40} cy={40} r={33} fill="none" stroke="#5889FA" strokeWidth={8}
                strokeDasharray={`${2 * Math.PI * 33}`}
                strokeDashoffset={`${2 * Math.PI * 33 * (1 - completionPct / 100)}`}
                strokeLinecap="round"
                style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.8s ease' }}
              />
              <text x={40} y={45} textAnchor="middle" fontSize={16} fontWeight={900} fill="#072061">{completionPct}%</text>
            </svg>
            <div>
              <p className="text-sm font-bold text-navy">Course completion</p>
              <p className="text-xs text-royal/50 mt-0.5">{stats?.completedCourses ?? 0} of {stats?.totalCourses ?? 0} courses done</p>
            </div>
          </Card>

          <Card padding="md" className="flex items-center gap-5">
            <svg width={80} height={80} viewBox="0 0 80 80">
              <circle cx={40} cy={40} r={33} fill="none" stroke="#E6ECFD" strokeWidth={8} />
              <circle cx={40} cy={40} r={33} fill="none" stroke="#10b981" strokeWidth={8}
                strokeDasharray={`${2 * Math.PI * 33}`}
                strokeDashoffset={`${2 * Math.PI * 33 * (1 - lessonPct / 100)}`}
                strokeLinecap="round"
                style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.8s ease' }}
              />
              <text x={40} y={45} textAnchor="middle" fontSize={16} fontWeight={900} fill="#072061">{lessonPct}%</text>
            </svg>
            <div>
              <p className="text-sm font-bold text-navy">Lesson completion</p>
              <p className="text-xs text-royal/50 mt-0.5">{stats?.completedLessons ?? 0} of {stats?.totalLessons ?? 0} lessons done</p>
            </div>
          </Card>
        </div>

        {/* Weekly study hours area chart */}
        <Card padding="md">
          <div className="flex items-center justify-between mb-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Weekly Study Hours</p>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weekly} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="hoursGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#5889FA" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#5889FA" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E6ECFD" />
                <XAxis dataKey="week" tick={{ fontSize: 9, fill: '#405FAD' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#405FAD' }} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{ border: 'none', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 11 }}
                  formatter={(v) => [`${v}h`, 'Hours']}
                />
                <Area type="monotone" dataKey="hours" stroke="#5889FA" strokeWidth={2.5} fill="url(#hoursGrad)" dot={{ r: 3, fill: '#5889FA' }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <StudyHeatmap />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

          {/* Quiz scores bar chart */}
          <Card padding="md">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-4">Quiz Scores by Course</p>
            {quizzes.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center">
                <Icon name="assignments" size={28} className="text-cloud mb-2" />
                <p className="text-xs text-royal/40">No quiz data yet</p>
              </div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={quizzes} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E6ECFD" />
                    <XAxis dataKey="course" tick={{ fontSize: 9, fill: '#405FAD' }} tickLine={false} axisLine={false} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#405FAD' }} tickLine={false} axisLine={false} />
                    <Tooltip
                      contentStyle={{ border: 'none', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.08)', fontSize: 11 }}
                      formatter={(v) => [`${v}%`, 'Score']}
                    />
                    <Bar dataKey="score" fill="#5889FA" radius={[6, 6, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

          {/* Skill radar */}
          <Card padding="md">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-4">Skill Coverage</p>
            {radar.length < 3 ? (
              <div className="flex flex-col items-center py-10 text-center">
                <Icon name="star" size={28} className="text-cloud mb-2" />
                <p className="text-xs text-royal/40">Complete more quizzes to see your skill map</p>
              </div>
            ) : (
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radar}>
                    <PolarGrid stroke="#E6ECFD" />
                    <PolarAngleAxis dataKey="subject" tick={{ fontSize: 9, fill: '#405FAD' }} />
                    <Radar name="Score" dataKey="value" stroke="#5889FA" fill="#5889FA" fillOpacity={0.2} strokeWidth={2} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            )}
          </Card>

        </div>
      </div>
    </div>
  );
}
