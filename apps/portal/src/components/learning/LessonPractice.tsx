'use client';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

interface Option { id: string; text: string; }
interface PracticeQuestion { id: string; questionText: string; options: Option[] | null; imageUrl: string | null; }
interface PracticeResult {
  questionId: string; yourAnswer: string | null; correctAnswer: string; isCorrect: boolean;
  explanation: string | null; videoAtSec: number | null;
}

function fmt(s: number) {
  return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
}

/** Auto-marked practice under a video/text lesson. Hidden when the lesson has no practice questions. */
export function LessonPractice({ courseId, lessonId, onSeek }: {
  courseId: string; lessonId: string;
  /** Jump the lesson video to a moment (uploaded files only). */
  onSeek?: (seconds: number) => void;
}) {
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [best, setBest] = useState<{ score: number; total: number } | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [results, setResults] = useState<Record<string, PracticeResult> | null>(null);
  const [score, setScore] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setAnswers({}); setResults(null); setScore(null);
    api.get(`/platform-courses/${courseId}/lessons/${lessonId}/practice`)
      .then(r => { setQuestions(r.data?.questions ?? []); setBest(r.data?.best ?? null); })
      .catch(() => setQuestions([]));
  }, [courseId, lessonId]);

  if (!questions.length) return null;

  const allAnswered = questions.every(q => answers[q.id]);

  async function submit() {
    setSubmitting(true); setError('');
    try {
      const { data } = await api.post(`/platform-courses/${courseId}/lessons/${lessonId}/practice/submit`, { answers });
      setResults(Object.fromEntries((data.results as PracticeResult[]).map(r => [r.questionId, r])));
      setScore(data.score);
      setBest(b => (!b || data.score / data.total > b.score / b.total ? { score: data.score, total: data.total } : b));
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Could not mark your answers. Please try again.');
    } finally { setSubmitting(false); }
  }

  function retry() { setAnswers({}); setResults(null); setScore(null); }

  return (
    <div className="rounded-2xl border border-[var(--pl-divider)] bg-[var(--pl-bg2)] overflow-hidden text-white/85">
      <div className="flex items-center justify-between gap-3 px-5 pt-5">
        <div>
          <p className="text-sm font-bold">Practice</p>
          <p className="text-xs text-[var(--pl-sub)]">
            {questions.length} quick question{questions.length === 1 ? '' : 's'} · marked instantly · try as often as you like
          </p>
        </div>
        {best && (
          <span className="rounded-md bg-azure/15 px-2.5 py-1 text-[11px] font-bold text-azure">
            Best {best.score}/{best.total}
          </span>
        )}
      </div>

      <ol className="px-5 py-4 space-y-5">
        {questions.map((q, qi) => {
          const r = results?.[q.id];
          return (
            <li key={q.id} className="space-y-2">
              <p className="text-sm font-semibold leading-relaxed">{qi + 1}. {q.questionText}</p>
              <div className="grid gap-1.5" role="radiogroup" aria-label={`Question ${qi + 1}`}>
                {(q.options ?? []).map(o => {
                  const chosen = answers[q.id] === o.id;
                  const isRight = r && o.id === r.correctAnswer;
                  const isWrongPick = r && chosen && !r.isCorrect;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      role="radio"
                      aria-checked={chosen}
                      disabled={!!results}
                      onClick={() => setAnswers(a => ({ ...a, [q.id]: o.id }))}
                      className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-left text-sm text-white/85 transition
                        ${isRight ? 'border-emerald-500 bg-emerald-500/10'
                          : isWrongPick ? 'border-red-500 bg-red-500/10'
                          : chosen ? 'border-azure bg-azure/10'
                          : 'border-[var(--pl-divider)] hover:border-azure/50'}`}
                    >
                      <span className={`h-4 w-4 flex-shrink-0 rounded-full border-2 ${chosen ? 'border-azure bg-azure' : 'border-[var(--pl-faint)]'}`} />
                      <span className="flex-1">{o.text}</span>
                      {isRight && <Icon name="check" size={14} className="text-emerald-500" />}
                      {isWrongPick && <Icon name="close" size={14} className="text-red-500" />}
                    </button>
                  );
                })}
              </div>
              {r && !r.isCorrect && (r.explanation || r.videoAtSec !== null) && (
                <div className="rounded-xl bg-[var(--pl-card)] px-3.5 py-3 text-xs leading-relaxed text-[var(--pl-sub)] space-y-2">
                  {r.explanation && <p><strong className="text-white/90">Worked solution: </strong>{r.explanation}</p>}
                  {r.videoAtSec !== null && (
                    onSeek ? (
                      <button type="button" onClick={() => onSeek(r.videoAtSec!)}
                        className="inline-flex items-center gap-1.5 font-semibold text-azure hover:underline">
                        <Icon name="play" size={12} /> Rewatch the explanation at {fmt(r.videoAtSec)}
                      </button>
                    ) : (
                      <p className="font-semibold text-azure">Explained in the video at {fmt(r.videoAtSec)}</p>
                    )
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ol>

      {error && <p role="alert" className="mx-5 mb-3 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-xs text-red-500">{error}</p>}

      <div className="flex items-center justify-between gap-3 border-t border-[var(--pl-divider)] px-5 py-4">
        <p className="text-sm font-semibold" aria-live="polite">
          {score !== null ? `You scored ${score}/${questions.length}` : `${Object.keys(answers).length}/${questions.length} answered`}
        </p>
        {results ? (
          <button type="button" onClick={retry}
            className="rounded-xl border border-[var(--pl-divider)] px-4 py-2 text-xs font-semibold hover:border-azure transition">
            Try again
          </button>
        ) : (
          <button type="button" onClick={submit} disabled={!allAnswered || submitting}
            className="rounded-xl bg-azure px-4 py-2 text-xs font-bold text-white hover:bg-royal transition disabled:opacity-50">
            {submitting ? 'Marking…' : 'Check answers'}
          </button>
        )}
      </div>
    </div>
  );
}
