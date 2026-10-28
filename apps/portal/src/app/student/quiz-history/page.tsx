'use client';
import { useEffect, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import Link from 'next/link';
import api from '@/lib/api';

interface QuizAttempt {
  id: string;
  score: number | null;
  maxScore: number;
  passed: boolean | null;
  isFullyGraded: boolean;
  attemptNumber: number;
  submittedAt: string;
  gradedAt: string | null;
  lesson: { id: string; title: string; courseId: string; courseName: string } | null;
}

export default function QuizHistoryPage() {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/education/quizzes/my-attempts')
      .then(r => setAttempts(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-4 md:p-6 space-y-6 max-w-3xl mx-auto w-full">
        <div className="grid grid-cols-3 gap-3">
          {[0, 1, 2].map(i => (
            <div key={i} className="rounded-2xl bg-cloud animate-pulse h-20" />
          ))}
        </div>
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map(i => (
            <div key={i} className="rounded-2xl bg-cloud animate-pulse h-24" />
          ))}
        </div>
      </div>
    </div>
  );

  const pending   = attempts.filter(a => !a.isFullyGraded);
  const passed    = attempts.filter(a => a.isFullyGraded && a.passed);
  const failed    = attempts.filter(a => a.isFullyGraded && a.passed === false);

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Quiz History" subtitle="All your quiz attempts and results" backHref="/student/dashboard" backLabel="Dashboard" />

      <div className="flex-1 p-4 md:p-6 space-y-6 max-w-3xl mx-auto w-full">

        {/* Summary row */}
        {attempts.length > 0 && (
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: 'Passed',          value: passed.length,  color: 'text-azure' },
              { label: 'Pending review',  value: pending.length, color: 'text-amber-500' },
              { label: 'Failed',          value: failed.length,  color: 'text-red-400' },
            ].map(s => (
              <Card key={s.label} className="flex flex-col items-center py-4 text-center">
                <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                <p className="text-[10px] font-bold text-royal/50 mt-0.5">{s.label}</p>
              </Card>
            ))}
          </div>
        )}

        {attempts.length === 0 ? (
          <Card padding="lg">
            <EmptyState
              icon="assignments"
              title="No quiz attempts yet"
              description="Complete quizzes in your lessons and your results will appear here"
            />
          </Card>
        ) : (
          <div className="space-y-3">
            {attempts.map(attempt => {
              const pct = attempt.maxScore > 0 && attempt.score !== null
                ? Math.round((attempt.score / attempt.maxScore) * 100)
                : null;

              return (
                <Card key={attempt.id} padding="none" className="overflow-hidden">
                  <div className="flex items-center gap-4 p-4">
                    {/* Status icon */}
                    <div className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
                      !attempt.isFullyGraded
                        ? 'bg-amber-50 border border-amber-200'
                        : attempt.passed
                          ? 'bg-azure/10'
                          : 'bg-red-50 border border-red-100'
                    }`}>
                      <Icon
                        name={!attempt.isFullyGraded ? 'clock' : attempt.passed ? 'certificates' : 'close'}
                        size={18}
                        className={
                          !attempt.isFullyGraded
                            ? 'text-amber-500'
                            : attempt.passed
                              ? 'text-azure'
                              : 'text-red-400'
                        }
                      />
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy truncate">
                        {attempt.lesson?.courseName ?? 'Course quiz'}
                      </p>
                      <p className="text-xs text-royal/50 truncate">
                        {attempt.lesson?.title ?? 'Lesson quiz'} · Attempt #{attempt.attemptNumber}
                      </p>
                      <p className="text-[10px] text-royal/30 mt-0.5">
                        Submitted {new Date(attempt.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        {attempt.gradedAt && ` · Graded ${new Date(attempt.gradedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`}
                      </p>
                    </div>

                    {/* Score */}
                    <div className="text-right flex-shrink-0">
                      {!attempt.isFullyGraded ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2.5 py-1 text-[10px] font-bold text-amber-600">
                          Pending review
                        </span>
                      ) : (
                        <>
                          <p className={`text-lg font-black ${attempt.passed ? 'text-azure' : 'text-red-400'}`}>
                            {pct !== null ? `${pct}%` : '—'}
                          </p>
                          <p className="text-[10px] text-royal/40">
                            {attempt.score ?? '—'}/{attempt.maxScore}
                          </p>
                          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-bold mt-0.5 ${
                            attempt.passed ? 'bg-azure/10 text-azure' : 'bg-red-50 text-red-500'
                          }`}>
                            {attempt.passed ? 'PASSED' : 'FAILED'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Link to lesson */}
                  {attempt.lesson && (
                    <div className="border-t border-cloud px-4 py-2.5 bg-surface">
                      <Link
                        href={`/student/learn/${attempt.lesson.courseId}/lesson/${attempt.lesson.id}`}
                        className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-azure hover:text-royal transition">
                        <Icon name="arrowRight" size={11} /> Go to lesson
                      </Link>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
