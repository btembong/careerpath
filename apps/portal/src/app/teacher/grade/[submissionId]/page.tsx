'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';
import { notify } from '@/lib/notify';

interface Criterion {
  id: string;
  name: string;
  description: string;
  weight: number;
}

interface Submission {
  id: string;
  fileUrl?: string;
  content?: string;
  student: { firstName?: string; lastName?: string; email: string };
  assignment: { id: string; title: string; maxPoints: number; rubric?: { criteria: Criterion[] } };
  grade?: number;
  feedback?: string;
}

const SCORE_LABELS = ['Not attempted', 'Below expectations', 'Meets expectations', 'Exceeds expectations', 'Outstanding'];

export default function RubricGradePage() {
  const { submissionId } = useParams<{ submissionId: string }>();
  const router = useRouter();
  const [submission, setSubmission] = useState<Submission | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.get(`/education/submissions/${submissionId}`)
      .then(r => {
        setSubmission(r.data);
        setFeedback(r.data.feedback ?? '');
        const rubric = r.data.assignment?.rubric;
        if (rubric?.criteria) {
          const init: Record<string, number> = {};
          rubric.criteria.forEach((c: Criterion) => { init[c.id] = 0; });
          setScores(init);
        }
      })
      .catch(() => notify.error('Could not load submission'))
      .finally(() => setLoading(false));
  }, [submissionId]);

  const criteria = submission?.assignment?.rubric?.criteria ?? [];
  const totalWeight = criteria.reduce((s, c) => s + c.weight, 0);
  const computedGrade = criteria.length > 0 && totalWeight > 0
    ? Math.round(criteria.reduce((sum, c) => sum + ((scores[c.id] ?? 0) / 4) * (c.weight / totalWeight), 0)
        * (submission?.assignment?.maxPoints ?? 100))
    : null;

  async function submit() {
    setSaving(true);
    try {
      if (criteria.length > 0) {
        await api.post(`/rubrics/grade/${submissionId}`, {
          scores: criteria.map(c => ({ criterionId: c.id, score: scores[c.id] ?? 0 })),
          feedback,
        });
      } else {
        await api.patch(`/education/submissions/${submissionId}/grade`, {
          grade: computedGrade, feedback,
        });
      }
      notify.success('Graded successfully');
      router.back();
    } catch { notify.error('Failed to save grade'); }
    finally { setSaving(false); }
  }

  const studentName = submission
    ? [submission.student.firstName, submission.student.lastName].filter(Boolean).join(' ') || submission.student.email
    : '';

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <Topbar title="Grade Submission" backHref="/teacher/assignments" />
      <div className="flex-1 p-4 max-w-2xl mx-auto w-full space-y-4">
        {loading ? (
          <div className="flex justify-center py-20">
            <div className="w-8 h-8 border-2 border-azure border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !submission ? (
          <p className="text-center text-muted py-20">Submission not found.</p>
        ) : (
          <>
            {/* Submission info */}
            <div className="bg-white rounded-2xl border border-cloud p-5">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="font-bold text-navy">{submission.assignment.title}</p>
                  <p className="text-sm text-muted">{studentName}</p>
                </div>
                {submission.grade != null && (
                  <span className="text-sm font-bold text-azure bg-azure/10 rounded-full px-3 py-1">
                    {submission.grade} / {submission.assignment.maxPoints}
                  </span>
                )}
              </div>
              {submission.content && (
                <div className="mt-3 p-3 bg-surface rounded-xl border border-cloud">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted mb-2">Submission</p>
                  <p className="text-sm text-navy whitespace-pre-wrap leading-relaxed">{submission.content}</p>
                </div>
              )}
              {submission.fileUrl && (
                <a href={submission.fileUrl} target="_blank" rel="noreferrer"
                  className="mt-3 inline-flex items-center gap-2 text-sm text-azure hover:underline">
                  View attached file
                </a>
              )}
            </div>

            {/* Rubric scoring */}
            {criteria.length > 0 && (
              <div className="bg-white rounded-2xl border border-cloud p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-bold text-navy">Rubric Scoring</h3>
                  {computedGrade !== null && (
                    <span className="text-sm font-bold text-azure">
                      Computed: {computedGrade} / {submission.assignment.maxPoints}
                    </span>
                  )}
                </div>
                <div className="space-y-5">
                  {criteria.map(c => (
                    <div key={c.id}>
                      <div className="flex items-baseline justify-between mb-2">
                        <div>
                          <p className="text-sm font-semibold text-navy">{c.name}</p>
                          {c.description && <p className="text-xs text-muted">{c.description}</p>}
                        </div>
                        <span className="text-[10px] font-bold text-azure flex-shrink-0 ml-3">{c.weight}%</span>
                      </div>
                      <div className="flex gap-2">
                        {[0, 1, 2, 3, 4].map(s => (
                          <button key={s} onClick={() => setScores(sc => ({ ...sc, [c.id]: s }))}
                            title={SCORE_LABELS[s]}
                            className={`flex-1 py-2 rounded-xl text-xs font-bold transition border ${
                              scores[c.id] === s
                                ? s === 0 ? 'bg-red-500 text-white border-red-500'
                                  : s <= 1 ? 'bg-amber-500 text-white border-amber-500'
                                  : s <= 2 ? 'bg-blue-500 text-white border-blue-500'
                                  : 'bg-green-500 text-white border-green-500'
                                : 'border-cloud text-muted hover:border-azure hover:text-navy'
                            }`}>
                            {s}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-azure mt-1">{SCORE_LABELS[scores[c.id] ?? 0]}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Feedback */}
            <div className="bg-white rounded-2xl border border-cloud p-5">
              <h3 className="font-bold text-navy mb-3">Feedback to Student</h3>
              <textarea
                rows={4}
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Write feedback for the student…"
                className="w-full border border-cloud rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-azure resize-none"
              />
            </div>

            <button onClick={submit} disabled={saving}
              className="w-full py-3 rounded-xl bg-azure text-white font-bold text-sm hover:bg-royal transition disabled:opacity-50">
              {saving ? 'Saving…' : 'Submit Grade'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
