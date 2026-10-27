'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { notify } from '@/lib/notify';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

interface QuizAttempt {
  id: string;
  courseId: string;
  autoScore: number;
  manualScore: number;
  finalScore: number;
  isFullyGraded: boolean;
  answersJson: Record<string, string>;
  submittedAt: string;
  student: { id: string; email: string; firstName: string | null; lastName: string | null };
}

export default function QuizGradingPage() {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [scores, setScores] = useState<Record<string, string>>({});
  const [grading, setGrading] = useState<string | null>(null);

  async function load() {
    const r = await api.get('/education/quizzes/written-queue');
    setAttempts(r.data ?? []);
  }

  useEffect(() => {
    load().catch(() => notify.error('Failed to load')).finally(() => setLoading(false));
  }, []);

  async function gradeAttempt(attemptId: string) {
    const raw = scores[attemptId];
    if (!raw && raw !== '0') { notify.error('Enter a manual score'); return; }
    const manualScore = parseFloat(raw);
    if (isNaN(manualScore) || manualScore < 0) { notify.error('Invalid score'); return; }
    setGrading(attemptId);
    try {
      await api.patch(`/education/quizzes/${attemptId}/grade`, { manualScore });
      notify.success('Attempt graded');
      setAttempts(prev => prev.filter(a => a.id !== attemptId));
      setExpanded(null);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Grading failed');
    } finally { setGrading(null); }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar back />
      <div className="flex-1 p-6 max-w-3xl w-full mx-auto space-y-4">
        {[1,2,3].map(i => <SkeletonCard key={i} lines={2} />)}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full bg-surface">
      <Topbar
        title="Written Quiz Grading"
        subtitle={`${attempts.length} attempt${attempts.length !== 1 ? 's' : ''} awaiting review`}
        backHref="/teacher/assignments"
        backLabel="Assignments"
      />

      <div className="flex-1 p-6 pb-28 lg:pb-6 max-w-3xl w-full mx-auto space-y-4">

        {attempts.length === 0 ? (
          <Card padding="lg">
            <div className="flex flex-col items-center py-12 text-center">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 mb-4">
                <Icon name="graduate" size={24} className="text-green-500" />
              </div>
              <p className="text-sm font-bold text-navy">All caught up!</p>
              <p className="text-xs text-royal/50 mt-1">No written quiz answers need grading right now.</p>
            </div>
          </Card>
        ) : (
          attempts.map(attempt => {
            const isOpen = expanded === attempt.id;
            const studentName = attempt.student.firstName || attempt.student.lastName
              ? `${attempt.student.firstName ?? ''} ${attempt.student.lastName ?? ''}`.trim()
              : attempt.student.email.split('@')[0];
            const answers = Object.entries(attempt.answersJson ?? {});

            return (
              <Card key={attempt.id} padding="none">
                {/* Header row */}
                <button
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-cloud/30 transition rounded-2xl"
                  onClick={() => setExpanded(isOpen ? null : attempt.id)}>
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-azure text-sm font-bold text-white">
                    {(attempt.student.firstName ?? attempt.student.email ?? 'S')[0].toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy truncate">{studentName}</p>
                    <p className="text-[10px] text-royal/50">
                      Submitted {new Date(attempt.submittedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {' · '}Auto-score: {attempt.autoScore}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Badge variant="muted">Pending</Badge>
                    <Icon name="chevronDown" size={14} className={`text-royal/40 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Expanded: answers + grading form */}
                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 pb-4 space-y-4 border-t border-cloud pt-4">
                        {/* Written answers */}
                        <div className="space-y-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Student Answers</p>
                          {answers.length === 0 ? (
                            <p className="text-xs text-royal/40">No answers recorded.</p>
                          ) : (
                            answers.map(([questionId, answer]) => (
                              <div key={questionId} className="rounded-xl border border-cloud bg-cloud/30 px-4 py-3">
                                <p className="text-[10px] font-bold text-royal/40 uppercase tracking-widest mb-1">Q: {questionId.slice(0, 8)}…</p>
                                <p className="text-sm text-navy whitespace-pre-wrap">{answer || <span className="italic text-royal/30">No answer provided</span>}</p>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Grading */}
                        <div className="rounded-xl border border-azure/20 bg-azure/5 px-4 py-3 space-y-3">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Grade Written Answers</p>
                          <p className="text-xs text-royal/60">
                            Auto-score (MCQ): <strong className="text-navy">{attempt.autoScore}</strong>. Add your manual score for the written portion below.
                            Final score = auto + manual.
                          </p>
                          <div className="flex items-center gap-3">
                            <div className="space-y-1">
                              <label className="text-[10px] font-semibold text-royal/50 uppercase tracking-wider">Manual score</label>
                              <input
                                type="number" min="0" placeholder="0"
                                value={scores[attempt.id] ?? ''}
                                onChange={e => setScores(s => ({ ...s, [attempt.id]: e.target.value }))}
                                className="w-24 rounded-xl border border-cloud px-3 py-2 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/15" />
                            </div>
                            {scores[attempt.id] && (
                              <div className="space-y-1 self-end pb-2">
                                <p className="text-[10px] text-royal/40">Final score</p>
                                <p className="text-lg font-black text-navy">
                                  {attempt.autoScore + (parseFloat(scores[attempt.id]) || 0)}
                                </p>
                              </div>
                            )}
                          </div>
                          <Button size="sm" loading={grading === attempt.id} onClick={() => gradeAttempt(attempt.id)}>
                            Submit grade
                          </Button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </Card>
            );
          })
        )}

      </div>
    </div>
  );
}
