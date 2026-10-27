'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonListRow } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { BottomSheet } from '@/components/layout/BottomSheet';
import api from '@/lib/api';

interface Student { id: string; firstName?: string | null; lastName?: string | null; email?: string; }
interface Assignment { id: string; title?: string; maxPoints?: number; }
interface Submission {
  id: string;
  submittedAt?: string;
  createdAt?: string;
  fileUrl?: string | null;
  textContent?: string | null;
  notes?: string | null;
  student?: Student;
  assignment?: Assignment;
  assignmentId?: string;
}

function studentName(s?: Student): string {
  if (!s) return 'Student';
  if (s.firstName || s.lastName) return `${s.firstName ?? ''} ${s.lastName ?? ''}`.trim();
  return s.email?.split('@')[0] ?? 'Student';
}

function GradingForm({ s, grades, setGrade, grading, submitGrade }: {
  s: Submission;
  grades: Record<string, { score: string; feedback: string }>;
  setGrade: (id: string, field: 'score' | 'feedback', value: string) => void;
  grading: string | null;
  submitGrade: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      {s.notes && (
        <div className="rounded-xl bg-azure/5 border border-azure/20 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-1">Student note</p>
          <p className="text-xs text-navy/80 leading-relaxed">{s.notes}</p>
        </div>
      )}
      {s.fileUrl && (
        <a href={s.fileUrl} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-2 rounded-xl border border-cloud bg-surface px-3 py-2 text-xs font-semibold text-navy hover:bg-cloud transition">
          <Icon name="download" size={13} /> View submission
        </a>
      )}
      {s.textContent && (
        <div className="rounded-xl bg-surface border border-cloud p-3 text-sm text-navy/80 leading-relaxed max-h-32 overflow-y-auto">
          {s.textContent}
        </div>
      )}
      <div className="space-y-1">
        <label className="text-xs font-semibold text-navy">Score (0–{s.assignment?.maxPoints ?? 100})</label>
        <input type="number" min="0" max={s.assignment?.maxPoints ?? 100}
          value={grades[s.id]?.score ?? ''} onChange={e => setGrade(s.id, 'score', e.target.value)}
          placeholder={`e.g. ${Math.round((s.assignment?.maxPoints ?? 100) * 0.85)}`}
          className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/15" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-semibold text-navy">Feedback <span className="font-normal text-royal/40">(optional)</span></label>
        <textarea rows={3} value={grades[s.id]?.feedback ?? ''} onChange={e => setGrade(s.id, 'feedback', e.target.value)}
          placeholder="Great work on…"
          className="w-full rounded-xl border border-cloud bg-white px-3 py-2.5 text-sm text-navy outline-none resize-none focus:border-azure focus:ring-2 focus:ring-azure/15 placeholder:text-royal/40" />
      </div>
      <Button size="sm" loading={grading === s.id} onClick={() => submitGrade(s.id)}>
        <Icon name="check" size={13} /> Submit grade
      </Button>
    </div>
  );
}

export default function TeacherAssignmentsPage() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [grading,     setGrading]     = useState<string | null>(null);
  const [grades,      setGrades]      = useState<Record<string, { score: string; feedback: string }>>({});
  const [open,        setOpen]        = useState<string | null>(null);
  const [search,      setSearch]      = useState('');

  useEffect(() => {
    api.get('/education/submissions/queue')
      .then(r => setSubmissions(r.data ?? []))
      .catch(() => notify.error('Failed to load grading queue'))
      .finally(() => setLoading(false));
  }, []);

  function setGrade(id: string, field: 'score' | 'feedback', value: string) {
    setGrades(g => ({ ...g, [id]: { ...g[id], score: g[id]?.score ?? '', feedback: g[id]?.feedback ?? '', [field]: value } }));
  }

  async function submitGrade(submissionId: string) {
    const g = grades[submissionId];
    if (!g?.score) { notify.error('Enter a score before submitting.'); return; }
    setGrading(submissionId);
    try {
      await api.patch(`/education/submissions/${submissionId}/grade`, {
        grade: parseFloat(g.score),
        feedback: g.feedback || undefined,
      });
      notify.success('Grade submitted');
      setSubmissions(s => s.filter(x => x.id !== submissionId));
      setOpen(null);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Grading failed');
    } finally {
      setGrading(null);
    }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-4">
        <div className="h-8 w-48 rounded-xl bg-cloud animate-pulse" />
        <div className="rounded-2xl border border-cloud bg-white overflow-hidden">
          {[1,2,3,4,5].map(i => <SkeletonListRow key={i} />)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Assignments" subtitle="Review and grade student submissions" />
      <div className="flex-1 p-6 pb-28 lg:pb-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">GRADING QUEUE</p>
            <h2 className="text-base font-bold text-navy">{submissions.length} pending submission{submissions.length !== 1 ? 's' : ''}</h2>
          </div>
          <div className="flex items-center gap-2">
            {submissions.length > 0 && (
              <div className="relative">
                <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-azure/40 pointer-events-none" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search student…"
                  className="w-full sm:w-48 rounded-xl border border-cloud bg-white pl-9 pr-3 py-2 text-sm text-navy placeholder:text-royal/30 outline-none focus:border-azure focus:ring-2 focus:ring-azure/10 transition"
                />
              </div>
            )}
            <Link href="/teacher/quiz-grading"
              className="inline-flex items-center gap-1.5 rounded-xl border border-cloud bg-white px-3 py-2 text-xs font-semibold text-navy hover:bg-cloud transition">
              <Icon name="graduate" size={13} /> Written quizzes
            </Link>
          </div>
        </div>

        {submissions.length === 0 ? (
          <Card padding="lg">
            <EmptyState
              icon="check"
              title="All caught up!"
              description="No pending submissions to grade right now"
            />
          </Card>
        ) : (
          <>
            <div className="space-y-3">
              {(() => {
                const filtered = search.trim()
                  ? submissions.filter(s => studentName(s.student).toLowerCase().includes(search.toLowerCase())
                      || (s.assignment?.title ?? '').toLowerCase().includes(search.toLowerCase()))
                  : submissions;
                if (filtered.length === 0 && search.trim()) {
                  return <p className="text-sm text-royal/40 text-center py-12">No submissions match &ldquo;{search}&rdquo;</p>;
                }
                return filtered.map(s => (
                  <Card key={s.id} padding="none" className="overflow-hidden">
                    {/* Header row */}
                    <button onClick={() => setOpen(open === s.id ? null : s.id)}
                      className="flex items-center gap-4 px-4 py-4 w-full text-left hover:bg-cloud/30 transition">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-azure text-sm font-bold text-white flex-shrink-0">
                        {studentName(s.student)[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy truncate">{studentName(s.student)}</p>
                        <p className="text-xs text-royal/50 truncate">{s.assignment?.title ?? `Assignment #${s.assignmentId?.slice(0, 8)}`}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-[10px] text-royal/40">
                          {new Date(s.submittedAt ?? s.createdAt ?? '').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                        </span>
                        <Badge variant="default">Pending</Badge>
                        <Icon name="chevronDown" size={14} className={`text-royal/40 transition-transform ${open === s.id ? 'rotate-180' : ''}`} />
                      </div>
                    </button>

                    {/* Desktop inline grading panel */}
                    <AnimatePresence>
                      {open === s.id && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="hidden lg:block overflow-hidden"
                        >
                          <div className="border-t border-cloud px-4 pb-4 pt-3">
                            <GradingForm s={s} grades={grades} setGrade={setGrade} grading={grading} submitGrade={submitGrade} />
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </Card>
                ));
              })()}
            </div>

            {/* Mobile: grading in BottomSheet (tall to fit form) */}
            {open && (() => {
              const s = submissions.find(x => x.id === open);
              if (!s) return null;
              return (
                <BottomSheet open title={`Grade: ${s.assignment?.title ?? 'Assignment'}`} onClose={() => setOpen(null)} height="auto">
                  <GradingForm s={s} grades={grades} setGrade={setGrade} grading={grading} submitGrade={submitGrade} />
                </BottomSheet>
              );
            })()}
          </>
        )}
      </div>
    </div>
  );
}
