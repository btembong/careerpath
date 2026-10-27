'use client';
import { useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

interface GamificationStats {
  xpTotal: number;
  streak: number;
  badges: { badge: string; awardedAt: string }[];
  courseProgress: { courseId: string; title: string; percentComplete: number }[];
  recentXP: { type: string; points: number; createdAt: string }[];
}

interface QuizAnalytics {
  lessonId: string;
  lessonTitle?: string;
  passRate: number;
  avgScore: number;
  totalAttempts: number;
}

const BADGE_LABELS: Record<string, string> = {
  FIRST_LESSON: 'First Lesson',
  FIVE_LESSONS: '5 Lessons',
  TWENTY_LESSONS: '20 Lessons',
  FIRST_QUIZ_PASS: 'First Quiz Pass',
  STREAK_7: '7-Day Streak',
  STREAK_30: '30-Day Streak',
  TOP_SCORER: 'Top Scorer',
  COURSE_COMPLETE: 'Course Complete',
};

const XP_LABELS: Record<string, string> = {
  LESSON_COMPLETE: 'Lesson complete',
  QUIZ_PASS: 'Quiz passed',
  QUIZ_PERFECT: 'Perfect quiz',
  STREAK_BONUS: 'Streak bonus',
  ASSIGNMENT_SUBMIT: 'Assignment submitted',
  PEER_REVIEW_GIVEN: 'Peer review given',
  DISCUSSION_POST: 'Discussion post',
};

function levelFromXP(xp: number) { return Math.floor(xp / 1000) + 1; }
function xpInLevel(xp: number) { return xp % 1000; }

export default function StudentAnalyticsPage() {
  const [stats, setStats] = useState<GamificationStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/gamification/me').then(r => setStats(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col min-h-full bg-surface">
        <SkeletonTopbar />
        <div className="flex-1 p-4 max-w-2xl mx-auto w-full space-y-5">
          <div className="rounded-2xl bg-navy/80 animate-pulse h-40" />
          <div className="rounded-2xl bg-cloud animate-pulse h-32" />
          <div className="rounded-2xl bg-cloud animate-pulse h-24" />
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="flex flex-col min-h-full bg-surface">
        <Topbar title="My Progress" backHref="/student/dashboard" />
        <p className="text-center text-royal/40 text-sm py-20">Could not load analytics.</p>
      </div>
    );
  }

  const level = levelFromXP(stats.xpTotal);
  const xpProgress = xpInLevel(stats.xpTotal);
  const pct = (xpProgress / 1000) * 100;

  return (
    <div className="flex flex-col min-h-full bg-surface">
      <Topbar title="My Progress" backHref="/student/dashboard" />
      <div className="flex-1 p-4 max-w-2xl mx-auto w-full space-y-6">

        {/* XP & Level card */}
        <div className="bg-navy rounded-2xl p-6 text-white">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Current Level</p>
              <p className="text-4xl font-black">{level}</p>
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-widest text-white/40 mb-1">Total XP</p>
              <p className="text-2xl font-black text-azure">{stats.xpTotal.toLocaleString()}</p>
            </div>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-1">
            <div className="h-full bg-azure rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-white/30">
            <span>{xpProgress} / 1000 XP</span>
            <span>{1000 - xpProgress} XP to level {level + 1}</span>
          </div>
          {stats.streak > 0 && (
            <div className="mt-4 flex items-center gap-2">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-azure/20 flex-shrink-0">
                <Icon name="live" size={16} className="text-azure" />
              </div>
              <div>
                <p className="text-sm font-bold">{stats.streak}-day streak</p>
                <p className="text-[10px] text-white/30">Keep it up! Log in daily to maintain your streak.</p>
              </div>
            </div>
          )}
        </div>

        {/* Course Progress */}
        {stats.courseProgress?.length > 0 && (
          <div className="bg-white rounded-2xl border border-cloud p-5">
            <h3 className="font-bold text-navy mb-4">Course Progress</h3>
            <div className="space-y-4">
              {stats.courseProgress.map(cp => (
                <div key={cp.courseId}>
                  <div className="flex items-center justify-between mb-1">
                    <p className="text-sm font-semibold text-navy truncate flex-1 mr-3">{cp.title}</p>
                    <span className="text-xs font-bold text-azure flex-shrink-0">{cp.percentComplete}%</span>
                  </div>
                  <div className="h-2 bg-cloud rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${cp.percentComplete === 100 ? 'bg-green-500' : 'bg-azure'}`}
                      style={{ width: `${cp.percentComplete}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Badges */}
        {stats.badges?.length > 0 && (
          <div className="bg-white rounded-2xl border border-cloud p-5">
            <h3 className="font-bold text-navy mb-4">Badges Earned ({stats.badges.length})</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {stats.badges.map((b, i) => (
                <div key={i} className="flex items-center gap-3 bg-surface rounded-xl p-3 border border-cloud">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-azure/10 flex-shrink-0">
                    <Icon name="certificates" size={15} className="text-azure" />
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-navy">
                      {BADGE_LABELS[b.badge] ?? b.badge}
                    </p>
                    <p className="text-[10px] text-royal/40">
                      {new Date(b.awardedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recent XP Events */}
        {stats.recentXP?.length > 0 && (
          <div className="bg-white rounded-2xl border border-cloud p-5">
            <h3 className="font-bold text-navy mb-4">Recent Activity</h3>
            <div className="space-y-2">
              {stats.recentXP.slice(0, 15).map((e, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-cloud last:border-0">
                  <div>
                    <p className="text-sm font-medium text-navy">{XP_LABELS[e.type] ?? e.type}</p>
                    <p className="text-[10px] text-royal/40">
                      {new Date(e.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-azure">+{e.points} XP</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {stats.badges?.length === 0 && stats.recentXP?.length === 0 && (
          <p className="text-center text-royal/40 py-10 text-sm">Complete lessons and quizzes to earn XP and badges!</p>
        )}
      </div>
    </div>
  );
}
