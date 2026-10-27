'use client';
import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import api from '@/lib/api';
import { notify } from '@/lib/notify';
import { Icon } from '@/components/ui/Icon';

interface Question {
  id: string; questionText: string; type: string;
  imageUrl?: string; options?: { id: string; text: string }[]; points: number;
}

interface QuizState { lessonId: string; questions: Question[]; timeLimitSecs?: number; }

export default function QuizPlayerPage() {
  const { lessonId } = useParams<{ lessonId: string }>();
  const router = useRouter();
  const [quiz, setQuiz] = useState<QuizState | null>(null);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [current, setCurrent] = useState(0);
  const [courseId, setCourseId] = useState('');

  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const cId = q.get('courseId') ?? '';
    setCourseId(cId);
    api.get(`/quiz/start?courseId=${cId}&lessonId=${lessonId}`)
      .then(r => {
        setQuiz(r.data);
        if (r.data.timeLimitSecs) setTimeLeft(r.data.timeLimitSecs);
      })
      .catch(e => { notify.error(e?.response?.data?.message ?? 'Could not load quiz'); router.back(); });
  }, [lessonId]);

  useEffect(() => {
    if (timeLeft === null || timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft(s => (s ?? 1) - 1), 1000);
    return () => clearInterval(t);
  }, [timeLeft]);

  useEffect(() => { if (timeLeft === 0) handleSubmit(); }, [timeLeft]);

  const handleSubmit = useCallback(async () => {
    if (submitting || !quiz) return;
    setSubmitting(true);
    try {
      const r = await api.post('/quiz/submit', { courseId, lessonId, answers, timeTakenSecs: quiz.timeLimitSecs ? quiz.timeLimitSecs - (timeLeft ?? 0) : undefined });
      setResult(r.data);
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Submit failed'); }
    finally { setSubmitting(false); }
  }, [answers, courseId, lessonId, quiz, submitting, timeLeft]);

  if (!quiz) return <div className="flex items-center justify-center h-screen"><div className="w-8 h-8 border-2 border-azure border-t-transparent rounded-full animate-spin" /></div>;

  if (result) return <QuizResult result={result} onBack={() => router.back()} />;

  const q = quiz.questions[current];
  const total = quiz.questions.length;

  return (
    <div className="min-h-screen bg-surface p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button onClick={() => router.back()} className="text-royal/60 hover:text-navy text-sm">← Exit</button>
          <span className="text-sm font-semibold text-muted">Question {current + 1} of {total}</span>
          {timeLeft !== null && (
            <span className={`text-sm font-bold px-3 py-1 rounded-full ${timeLeft < 60 ? 'bg-red/10 text-red-600' : 'bg-cloud text-navy'}`}>
              {Math.floor(timeLeft / 60)}:{(timeLeft % 60).toString().padStart(2, '0')}
            </span>
          )}
        </div>

        {/* Progress */}
        <div className="h-2 bg-cloud rounded-full mb-8">
          <div className="h-2 bg-azure rounded-full transition-all" style={{ width: `${((current + 1) / total) * 100}%` }} />
        </div>

        {/* Question */}
        <div className="bg-white rounded-2xl border border-cloud p-6 mb-6">
          {q.imageUrl && <img src={q.imageUrl} alt="" className="rounded-xl mb-4 w-full object-cover max-h-48" />}
          <p className="text-lg font-semibold text-navy mb-6">{q.questionText}</p>

          {(q.type === 'MCQ' || q.type === 'TRUE_FALSE') && (
            <div className="flex flex-col gap-3">
              {q.options?.map(opt => (
                <button key={opt.id}
                  onClick={() => setAnswers(a => ({ ...a, [q.id]: opt.id }))}
                  className={`text-left p-4 rounded-xl border-2 transition-all ${answers[q.id] === opt.id ? 'border-azure bg-azure/5 text-navy font-semibold' : 'border-cloud hover:border-azure/40'}`}>
                  <span className="inline-flex items-center gap-3">
                    <span className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold ${answers[q.id] === opt.id ? 'border-azure bg-azure text-white' : 'border-cloud'}`}>
                      {opt.id.toUpperCase()}
                    </span>
                    {opt.text}
                  </span>
                </button>
              ))}
            </div>
          )}

          {q.type === 'FILL_BLANK' && (
            <input className="w-full border border-cloud rounded-xl px-4 py-3 text-navy focus:outline-none focus:border-azure"
              placeholder="Type your answer…" value={answers[q.id] ?? ''}
              onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
          )}

          {(q.type === 'SHORT_ANSWER' || q.type === 'WRITTEN') && (
            <textarea rows={5} className="w-full border border-cloud rounded-xl px-4 py-3 text-navy focus:outline-none focus:border-azure resize-none"
              placeholder="Write your answer…" value={answers[q.id] ?? ''}
              onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))} />
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <button onClick={() => setCurrent(c => Math.max(0, c - 1))} disabled={current === 0}
            className="px-4 py-2 rounded-xl border border-cloud text-royal/60 hover:text-navy disabled:opacity-40">
            ← Previous
          </button>
          {current < total - 1 ? (
            <button onClick={() => setCurrent(c => c + 1)}
              className="px-6 py-2 rounded-xl bg-azure text-white font-semibold hover:bg-azure/90">
              Next →
            </button>
          ) : (
            <button onClick={handleSubmit} disabled={submitting}
              className="px-6 py-2 rounded-xl bg-green-500 text-white font-semibold hover:bg-green-600 disabled:opacity-60">
              {submitting ? 'Submitting…' : 'Submit Quiz'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function QuizResult({ result, onBack }: { result: any; onBack: () => void }) {
  const pct = result.percentage ?? Math.round((result.finalScore / result.maxScore) * 100);
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl border border-cloud p-8 text-center">
        <div className={`w-20 h-20 mx-auto rounded-full flex items-center justify-center text-3xl font-black mb-4 ${result.passed ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-500'}`}>
          {pct}%
        </div>
        <h2 className="text-xl font-bold text-navy mb-1">{result.passed ? 'Passed! 🎉' : 'Not quite there'}</h2>
        <p className="text-sm text-muted mb-6">{result.finalScore} / {result.maxScore} points</p>
        <div className="flex flex-col gap-3">
          {result.answers?.map((a: any) => (
            <div key={a.questionId} className={`text-left p-3 rounded-xl text-sm ${a.isCorrect ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
              <span className="font-semibold">{a.isCorrect ? '✓' : '✗'} </span>
              {a.explanation && <span className="text-muted">{a.explanation}</span>}
            </div>
          ))}
        </div>
        <button onClick={onBack} className="mt-6 w-full py-3 rounded-xl bg-azure text-white font-semibold">Back to Course</button>
      </div>
    </div>
  );
}
