'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { notify } from '@/lib/notify';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import api from '@/lib/api';

interface Option { id: string; text: string; }
interface Question {
  id: string; questionText: string; type: 'MCQ' | 'WRITTEN';
  options: Option[] | null; correctAnswer: string; explanation: string | null;
  sortOrder: number; videoAtSec?: number | null;
}
interface QuizConfig {
  passMark: number | null; timeLimitSecs: number | null;
  maxAttempts: number; shuffleQuestions: boolean; title: string;
  /** QUIZ = graded quiz; VIDEO/TEXT = practice questions under the lesson */
  type: string;
}

function fmtAt(s: number) { return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
/** "2:15" or "135" → seconds; '' → null; anything else → NaN */
function parseAt(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const m = t.match(/^(?:(d+):)?(d+):(d{2})$|^(d+)$/);
  if (!m) return NaN;
  if (m[4] !== undefined) return +m[4];
  return (+(m[1] ?? 0)) * 3600 + +m[2] * 60 + +m[3];
}

const EMPTY_OPTIONS: Option[] = [
  { id: 'a', text: '' }, { id: 'b', text: '' },
  { id: 'c', text: '' }, { id: 'd', text: '' },
];

export default function QuizBuilderPage() {
  const { courseId, lessonId } = useParams<{ courseId: string; lessonId: string }>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [config,    setConfig]    = useState<QuizConfig | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [editId,      setEditId]      = useState<string | null>(null);
  const [showAdd,     setShowAdd]     = useState(false);
  const [confirmDel,  setConfirmDel]  = useState<string | null>(null); // questionId to delete

  // Config form state
  const [cfgPassMark,   setCfgPassMark]   = useState('');
  const [cfgTimeLimit,  setCfgTimeLimit]  = useState('');
  const [cfgMaxAttempts,setCfgMaxAttempts]= useState('0');
  const [cfgShuffle,    setCfgShuffle]    = useState(false);
  const [savingCfg,     setSavingCfg]     = useState(false);

  // New question form
  const [qType,    setQType]    = useState<'MCQ' | 'WRITTEN'>('MCQ');
  const [qText,    setQText]    = useState('');
  const [qOptions, setQOptions] = useState<Option[]>(EMPTY_OPTIONS.map(o => ({ ...o })));
  const [qCorrect, setQCorrect] = useState('a');
  const [qExpl,    setQExpl]    = useState('');
  const [qAt,      setQAt]      = useState('');
  const [addingQ,  setAddingQ]  = useState(false);
  const [generating, setGenerating] = useState(false);
  const [genMsg,     setGenMsg]     = useState('');

  async function generateWithAI() {
    setGenerating(true); setGenMsg('');
    try {
      const { data } = await api.post(`/ai/generate-quiz/${lessonId}`, { count: 5 });
      await load();
      setGenMsg(`Added ${data.generated} draft question${data.generated === 1 ? '' : 's'} from your lesson. Check each one and fix or delete anything that isn't right.`);
    } catch (err: any) {
      setGenMsg(err?.response?.data?.message ?? 'Could not generate questions. Please try again.');
    } finally { setGenerating(false); }
  }

  async function load() {
    const [qRes, lRes] = await Promise.all([
      api.get(`/platform-courses/${courseId}/lessons/${lessonId}/questions`),
      api.get(`/platform-courses/${courseId}`),
    ]);
    setQuestions(qRes.data ?? []);
    // Find this lesson in the course
    const course = lRes.data;
    const lesson = course.modules?.flatMap((m: any) => m.lessons)?.find((l: any) => l.id === lessonId);
    if (lesson) {
      setConfig({ passMark: lesson.passMark, timeLimitSecs: lesson.timeLimitSecs, maxAttempts: lesson.maxAttempts, shuffleQuestions: lesson.shuffleQuestions, title: lesson.title, type: lesson.type });
      if (lesson.type !== 'QUIZ') setQType('MCQ'); // practice is auto-marked
      setCfgPassMark(lesson.passMark != null ? String(lesson.passMark) : '');
      setCfgTimeLimit(lesson.timeLimitSecs != null ? String(Math.round(lesson.timeLimitSecs / 60)) : '');
      setCfgMaxAttempts(String(lesson.maxAttempts ?? 0));
      setCfgShuffle(lesson.shuffleQuestions ?? false);
    }
  }

  useEffect(() => {
    load().catch(() => notify.error('Failed to load')).finally(() => setLoading(false));
  }, [courseId, lessonId]);

  async function saveConfig() {
    setSavingCfg(true);
    try {
      await api.patch(`/platform-courses/${courseId}/lessons/${lessonId}/quiz-config`, {
        passMark:        cfgPassMark ? parseInt(cfgPassMark) : null,
        timeLimitSecs:   cfgTimeLimit ? parseInt(cfgTimeLimit) * 60 : null,
        maxAttempts:     parseInt(cfgMaxAttempts) || 0,
        shuffleQuestions: cfgShuffle,
      });
      notify.success('Quiz settings saved');
      await load();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setSavingCfg(false); }
  }

  async function addQuestion(e: React.FormEvent) {
    e.preventDefault();
    const videoAtSec = config?.type === 'VIDEO' ? parseAt(qAt) : null;
    if (Number.isNaN(videoAtSec)) { notify.error('Use mm:ss for the video moment, e.g. 2:15'); return; }
    setAddingQ(true);
    try {
      const options = qType === 'MCQ'
        ? qOptions.filter(o => o.text.trim()).map(o => ({ id: o.id, text: o.text.trim() }))
        : null;
      await api.post(`/platform-courses/${courseId}/lessons/${lessonId}/questions`, {
        questionText: qText.trim(),
        type: qType,
        options,
        correctAnswer: qType === 'MCQ' ? qCorrect : '',
        explanation: qExpl.trim() || undefined,
        ...(config?.type === 'VIDEO' && { videoAtSec }),
      });
      notify.success('Question added');
      setQText(''); setQOptions(EMPTY_OPTIONS.map(o => ({ ...o }))); setQCorrect('a'); setQExpl(''); setQAt('');
      setShowAdd(false);
      await load();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setAddingQ(false); }
  }

  async function deleteQuestion(id: string) {
    setConfirmDel(id);
  }

  async function executeDeleteQuestion(id: string) {
    setConfirmDel(null);
    try {
      await api.delete(`/platform-courses/${courseId}/lessons/${lessonId}/questions/${id}`);
      notify.success('Question deleted');
      setQuestions(prev => prev.filter(q => q.id !== id));
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
  }

  if (loading || !config) return (
    <div className="flex flex-col min-h-full bg-surface">
      <SkeletonTopbar />
      <div className="flex-1 p-6 max-w-3xl mx-auto w-full space-y-4">
        <div className="h-24 rounded-2xl bg-cloud animate-pulse" />
        {[0,1,2].map(i => <div key={i} className="h-16 rounded-xl bg-cloud animate-pulse" />)}
      </div>
    </div>
  );

  const isPractice = config.type !== 'QUIZ';
  const mcqCount = questions.filter(q => q.type === 'MCQ').length;
  const writtenCount = questions.filter(q => q.type === 'WRITTEN').length;

  return (
    <>
    <div className="flex flex-col min-h-full bg-surface">
      <Topbar
        title={`${isPractice ? 'Practice' : 'Quiz'}: ${config.title}`}
        subtitle={`${questions.length} question${questions.length !== 1 ? 's' : ''}`}
        backHref={`/teacher/courses/${courseId}/builder`}
        backLabel="Builder"
      />

      <div className="flex-1 p-6 max-w-3xl w-full mx-auto space-y-6">

        {isPractice && (
          <Card padding="md">
            <p className="text-sm font-bold text-navy">Practice questions</p>
            <p className="text-xs text-royal/60 mt-1 leading-relaxed">
              Shown under this lesson. Students answer, see the worked solution instantly, and can retry as often as they like.
              Practice never affects quiz scores or certificates. Aim for 3–5 multiple-choice questions
              {config.type === 'VIDEO' ? ', and add the video moment that explains each one.' : '.'}
            </p>
          </Card>
        )}

        {/* Quiz Config */}
        {!isPractice && <Card padding="md">
          <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-4">Quiz Settings</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-royal/50 uppercase tracking-wider">Pass mark (%)</label>
              <input type="number" min="0" max="100" value={cfgPassMark}
                onChange={e => setCfgPassMark(e.target.value)} placeholder="e.g. 70"
                className="w-full rounded-lg border border-cloud px-3 py-2 text-sm text-navy focus:outline-none focus:border-azure" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-royal/50 uppercase tracking-wider">Time limit (mins)</label>
              <input type="number" min="0" value={cfgTimeLimit}
                onChange={e => setCfgTimeLimit(e.target.value)} placeholder="none"
                className="w-full rounded-lg border border-cloud px-3 py-2 text-sm text-navy focus:outline-none focus:border-azure" />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-semibold text-royal/50 uppercase tracking-wider">Max attempts</label>
              <input type="number" min="0" value={cfgMaxAttempts}
                onChange={e => setCfgMaxAttempts(e.target.value)} placeholder="0 = unlimited"
                className="w-full rounded-lg border border-cloud px-3 py-2 text-sm text-navy focus:outline-none focus:border-azure" />
            </div>
            <div className="space-y-1 flex flex-col justify-end">
              <label className="flex items-center gap-2 text-xs text-navy cursor-pointer pb-2">
                <button type="button" onClick={() => setCfgShuffle(v => !v)}
                  className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full border-2 border-transparent transition-colors ${cfgShuffle ? 'bg-azure' : 'bg-cloud'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${cfgShuffle ? 'translate-x-4' : 'translate-x-0'}`} />
                </button>
                Shuffle
              </label>
            </div>
          </div>
          <Button size="sm" loading={savingCfg} onClick={saveConfig}>Save settings</Button>
        </Card>}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Total questions', value: questions.length },
            { label: 'Multiple choice', value: mcqCount },
            { label: 'Written', value: writtenCount },
          ].map(s => (
            <div key={s.label} className="bg-white rounded-xl border border-cloud px-4 py-3 text-center">
              <p className="text-2xl font-black text-navy">{s.value}</p>
              <p className="text-[10px] text-royal/50 mt-0.5 uppercase tracking-wider">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Question list */}
        {questions.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Questions</p>
            {questions.map((q, idx) => (
              <Card key={q.id} padding="md">
                <div className="flex items-start gap-3">
                  <span className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-lg bg-azure/10 text-[11px] font-black text-azure">{idx + 1}</span>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-semibold text-navy">{q.questionText}</p>
                      <div className="flex gap-1.5 flex-shrink-0">
                        <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${q.type === 'MCQ' ? 'bg-azure/10 text-azure' : 'bg-amber-100 text-amber-700'}`}>
                          {q.type === 'MCQ' ? 'MCQ' : 'Written'}
                        </span>
                        <button onClick={() => deleteQuestion(q.id)}
                          className="rounded-lg p-1 text-royal/30 hover:text-red-500 transition">
                          <Icon name="trash" size={12} />
                        </button>
                      </div>
                    </div>
                    {q.type === 'MCQ' && q.options && (
                      <div className="grid grid-cols-2 gap-1.5">
                        {(q.options as Option[]).map(opt => (
                          <div key={opt.id}
                            className={`rounded-lg border px-3 py-1.5 text-xs ${opt.id === q.correctAnswer ? 'border-green-300 bg-green-50 text-green-800 font-semibold' : 'border-cloud text-navy/70'}`}>
                            <span className="font-bold uppercase mr-1.5">{opt.id}.</span>{opt.text}
                            {opt.id === q.correctAnswer && <span className="ml-1 text-green-600">✓</span>}
                          </div>
                        ))}
                      </div>
                    )}
                    {q.explanation && (
                      <p className="text-[11px] text-royal/50 italic">💡 {q.explanation}</p>
                    )}
                    {q.videoAtSec != null && (
                      <p className="text-[11px] text-azure font-semibold">▶ Explained at {fmtAt(q.videoAtSec)}</p>
                    )}
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Add question */}
        {showAdd ? (
          <Card padding="md" className="border-azure border">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-4">Add Question</p>
            <form onSubmit={addQuestion} className="space-y-4">
              {/* Type toggle (quizzes only — practice is multiple choice) */}
              {!isPractice && <div className="flex gap-2">
                {(['MCQ', 'WRITTEN'] as const).map(t => (
                  <button key={t} type="button"
                    onClick={() => setQType(t)}
                    className={`flex-1 rounded-xl border py-2 text-xs font-semibold transition ${qType === t ? 'border-azure bg-azure/10 text-azure' : 'border-cloud text-navy/60 hover:bg-cloud'}`}>
                    {t === 'MCQ' ? '⚪ Multiple Choice' : '✏️ Written / Essay'}
                  </button>
                ))}
              </div>}

              {/* Question text */}
              <div>
                <label className="text-[10px] font-semibold text-royal/50 uppercase tracking-wider block mb-1">Question *</label>
                <textarea value={qText} onChange={e => setQText(e.target.value)} required rows={3}
                  placeholder="Enter the question text…"
                  className="w-full rounded-lg border border-cloud px-3 py-2 text-sm text-navy focus:outline-none focus:border-azure resize-none" />
              </div>

              {/* MCQ options */}
              {qType === 'MCQ' && (
                <div className="space-y-2">
                  <label className="text-[10px] font-semibold text-royal/50 uppercase tracking-wider block">Answer options *</label>
                  {qOptions.map(opt => (
                    <div key={opt.id} className="flex items-center gap-2">
                      <button type="button"
                        onClick={() => setQCorrect(opt.id)}
                        className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 font-bold text-[10px] transition ${qCorrect === opt.id ? 'border-azure bg-azure text-white' : 'border-cloud text-royal/40'}`}>
                        {opt.id.toUpperCase()}
                      </button>
                      <input
                        value={opt.text}
                        onChange={e => setQOptions(prev => prev.map(o => o.id === opt.id ? { ...o, text: e.target.value } : o))}
                        placeholder={`Option ${opt.id.toUpperCase()}…`}
                        className="flex-1 rounded-lg border border-cloud px-3 py-1.5 text-sm text-navy focus:outline-none focus:border-azure placeholder:text-royal/30"
                      />
                      {qCorrect === opt.id && <span className="text-[10px] font-bold text-azure flex-shrink-0">✓ Correct</span>}
                    </div>
                  ))}
                  <p className="text-[10px] text-royal/40">Click a letter to mark the correct answer.</p>
                </div>
              )}

              {/* Explanation */}
              <div>
                <label className="text-[10px] font-semibold text-royal/50 uppercase tracking-wider block mb-1">Explanation (shown after submission)</label>
                <input value={qExpl} onChange={e => setQExpl(e.target.value)}
                  placeholder="Optional — explain why this is the correct answer…"
                  className="w-full rounded-lg border border-cloud px-3 py-2 text-sm text-navy focus:outline-none focus:border-azure placeholder:text-royal/30" />
              </div>

              {config.type === 'VIDEO' && (
                <div className="max-w-[220px]">
                  <label className="text-[10px] font-semibold text-royal/50 uppercase tracking-wider block mb-1">Explained in the video at</label>
                  <input value={qAt} onChange={e => setQAt(e.target.value)} placeholder="mm:ss, e.g. 2:15"
                    className="w-full rounded-lg border border-cloud px-3 py-2 text-sm text-navy focus:outline-none focus:border-azure placeholder:text-royal/30" />
                  <p className="text-[10px] text-royal/40 mt-1">Students who get it wrong can jump straight there.</p>
                </div>
              )}

              <div className="flex gap-2">
                <Button type="submit" size="sm" loading={addingQ}>Add question</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setShowAdd(false)}>Cancel</Button>
              </div>
            </form>
          </Card>
        ) : (
          <div className="space-y-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <button onClick={() => setShowAdd(true)}
                className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-cloud py-5 text-sm font-semibold text-royal/50 hover:border-azure hover:text-azure transition">
                <Icon name="add" size={16} /> Add question
              </button>
              <button onClick={generateWithAI} disabled={generating}
                className="flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-cloud py-5 text-sm font-semibold text-royal/50 hover:border-azure hover:text-azure transition disabled:opacity-60">
                <Icon name="sparkles" size={16} /> {generating ? 'Writing questions…' : 'Draft 5 questions with AI'}
              </button>
            </div>
            {genMsg && <p className="text-xs text-royal/60 px-1">{genMsg}</p>}
          </div>
        )}

      </div>
    </div>

    {/* Confirm delete dialog */}
    {confirmDel && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 px-4">
        <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
          <p className="text-sm font-bold text-navy mb-1">Delete this question?</p>
          <p className="text-xs text-royal/60 mb-5">This question will be permanently removed{isPractice ? ' from the practice set' : ' from the quiz'}.</p>
          <div className="flex gap-2">
            <Button size="sm" onClick={() => executeDeleteQuestion(confirmDel)}>Delete</Button>
            <Button size="sm" variant="secondary" onClick={() => setConfirmDel(null)}>Cancel</Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
