'use client';
import { useEffect, useState } from 'react';
import { notify } from '@/lib/notify';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';
import { Drawer, DrawerContent, DrawerSection, InfoGrid } from '@/components/ui/Dialog';
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

function nameOf(a: QuizAttempt) {
  return a.student.firstName || a.student.lastName
    ? `${a.student.firstName ?? ''} ${a.student.lastName ?? ''}`.trim()
    : a.student.email.split('@')[0];
}
const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export default function QuizGradingPage() {
  const [attempts, setAttempts] = useState<QuizAttempt[]>([]);
  const [loading, setLoading] = useState(true);
  const [openId, setOpenId] = useState<string | null>(null);
  const [score, setScore] = useState('');
  const [grading, setGrading] = useState(false);

  async function load() {
    const r = await api.get('/education/quizzes/written-queue');
    setAttempts(r.data ?? []);
  }

  useEffect(() => {
    load().catch(() => notify.error('Could not load the grading queue')).finally(() => setLoading(false));
  }, []);

  const open = attempts.find(a => a.id === openId) ?? null;
  useEffect(() => { setScore(''); }, [openId]);

  async function grade() {
    if (!open) return;
    const manualScore = parseFloat(score);
    if (score.trim() === '' || isNaN(manualScore) || manualScore < 0) { notify.error('Enter a score of 0 or more'); return; }
    setGrading(true);
    try {
      await api.patch(`/education/quizzes/${open.id}/grade`, { manualScore });
      notify.success('Grade saved', { description: `${nameOf(open)} has been notified` });
      setAttempts(prev => prev.filter(a => a.id !== open.id));
      setOpenId(null);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Could not save the grade');
    } finally { setGrading(false); }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar back />
      <div className="flex-1 space-y-3 p-6">
        {[1, 2, 3].map(i => <SkeletonCard key={i} lines={2} />)}
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Topbar
        title="Written quiz grading"
        subtitle={`${attempts.length} attempt${attempts.length !== 1 ? 's' : ''} waiting for a grade`}
      />

      <div className="flex-1 p-4 pb-28 lg:px-7 lg:py-6">
        {attempts.length === 0 ? (
          <Card padding="lg">
            <EmptyState icon="graduate" title="Nothing to grade" description="Written quiz answers appear here when students submit them." />
          </Card>
        ) : (
          <Card padding="none" className="overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left">
                    {['Student', 'Submitted', 'Multiple choice', 'Status', ''].map(h => (
                      <th key={h} className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {attempts.map(a => (
                    <tr key={a.id} onClick={() => setOpenId(a.id)} className="cursor-pointer border-b border-line last:border-b-0 hover:bg-subtle transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-subtle text-[13px] font-bold text-ink2">
                            {nameOf(a)[0]?.toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-navy">{nameOf(a)}</p>
                            <p className="truncate text-xs text-muted">{a.student.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-ink2">{date(a.submittedAt)}</td>
                      <td className="px-5 py-3 text-ink2">{a.autoScore} points</td>
                      <td className="px-5 py-3"><Badge variant="default">Waiting</Badge></td>
                      <td className="px-5 py-3 text-right">
                        <button type="button" onClick={e => { e.stopPropagation(); setOpenId(a.id); }}
                          className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle transition-colors">
                          Grade
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>

      <Drawer open={!!open} onOpenChange={o => { if (!o) setOpenId(null); }}>
        {open && (
          <DrawerContent title={nameOf(open)} description={`Submitted ${date(open.submittedAt)}`}>
            <InfoGrid items={[
              { label: 'Student', value: open.student.email },
              { label: 'Multiple choice', value: `${open.autoScore} points` },
              { label: 'Status', value: 'Waiting for grade' },
            ]} />

            <DrawerSection title="Written answers" count={Object.keys(open.answersJson ?? {}).length}>
              {Object.entries(open.answersJson ?? {}).length === 0 ? (
                <p className="text-sm text-muted">No written answers were recorded.</p>
              ) : (
                <ol className="space-y-3">
                  {Object.entries(open.answersJson ?? {}).map(([qid, answer], i) => (
                    <li key={qid} className="rounded-md border border-line">
                      <p className="border-b border-line bg-subtle px-3 py-2 text-xs font-semibold text-ink2">Answer {i + 1}</p>
                      <p className="whitespace-pre-wrap px-3 py-2.5 text-sm text-navy">
                        {answer || <span className="italic text-muted">No answer given</span>}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </DrawerSection>

            <DrawerSection title="Grade">
              <p className="text-[13px] text-ink2">
                The multiple-choice part scored <strong className="text-navy">{open.autoScore}</strong>. Add the points for the written answers; the final score is the two added together.
              </p>
              <div className="flex items-end gap-4">
                <label className="block space-y-1.5">
                  <span className="text-[13px] font-semibold text-navy">Written score</span>
                  <input type="number" min={0} inputMode="decimal" value={score} onChange={e => setScore(e.target.value)}
                    placeholder="0" className="input-base w-28" />
                </label>
                <div className="pb-1.5">
                  <p className="text-xs text-muted">Final score</p>
                  <p className="text-xl font-extrabold text-navy">{open.autoScore + (parseFloat(score) || 0)}</p>
                </div>
              </div>
              <div className="flex gap-2 border-t border-line pt-4">
                <Button size="sm" loading={grading} onClick={grade}>Save grade</Button>
                <Button size="sm" variant="secondary" onClick={() => setOpenId(null)}>Cancel</Button>
              </div>
            </DrawerSection>
          </DrawerContent>
        )}
      </Drawer>
    </div>
  );
}
