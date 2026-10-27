'use client';
import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import api from '@/lib/api';
import { notify } from '@/lib/notify';
import { Icon } from '@/components/ui/Icon';
import { Topbar } from '@/components/layout/Topbar';

const QUESTION_TYPES = ['MCQ', 'TRUE_FALSE', 'FILL_BLANK', 'SHORT_ANSWER', 'WRITTEN'];
const DIFFICULTIES = ['EASY', 'MEDIUM', 'HARD'];

interface Question {
  id: string; questionText: string; type: string; difficulty: string;
  tags: string[]; options: any[]; correctAnswer: string; explanation: string; points: number;
}

export default function QuizBuilderPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState<Partial<Question> & { lessonId?: string }>({ type: 'MCQ', difficulty: 'MEDIUM', points: 1, options: [{ id: 'a', text: '', isCorrect: true }, { id: 'b', text: '', isCorrect: false }, { id: 'c', text: '', isCorrect: false }, { id: 'd', text: '', isCorrect: false }] });
  const [saving, setSaving] = useState(false);
  const [generatingAI, setGeneratingAI] = useState(false);
  const [selectedLessonId, setSelectedLessonId] = useState('');

  useEffect(() => {
    api.get(`/quiz/questions?courseId=${courseId}`).then(r => setQuestions(r.data)).finally(() => setLoading(false));
  }, [courseId]);

  const save = async () => {
    if (!form.questionText || !form.correctAnswer) { notify.error('Fill in question text and correct answer'); return; }
    setSaving(true);
    try {
      const r = await api.post('/quiz/questions', { ...form, courseId });
      setQuestions(q => [...q, r.data]);
      setForm({ type: 'MCQ', difficulty: 'MEDIUM', points: 1, options: [{ id: 'a', text: '', isCorrect: true }, { id: 'b', text: '', isCorrect: false }, { id: 'c', text: '', isCorrect: false }, { id: 'd', text: '', isCorrect: false }] });
      notify.success('Question saved');
    } catch { notify.error('Failed to save'); } finally { setSaving(false); }
  };

  const del = async (id: string) => {
    await api.delete(`/quiz/questions/${id}`);
    setQuestions(q => q.filter(x => x.id !== id));
    notify.success('Deleted');
  };

  const aiGenerate = async () => {
    if (!selectedLessonId) { notify.error('Select a lesson ID first'); return; }
    setGeneratingAI(true);
    try {
      const r = await api.post(`/ai/generate-quiz/${selectedLessonId}`, { count: 10 });
      notify.success(`Generated ${r.data.generated} questions`);
      const fresh = await api.get(`/quiz/questions?courseId=${courseId}`);
      setQuestions(fresh.data);
    } catch { notify.error('AI generation failed'); } finally { setGeneratingAI(false); }
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <Topbar title="Quiz Builder" backHref={`/teacher/courses/${courseId}/builder`} />
      <div className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Question form */}
        <div className="bg-white rounded-2xl border border-cloud p-6 h-fit">
          <h2 className="font-bold text-navy mb-4">Add Question</h2>

          <div className="flex gap-2 mb-3">
            {QUESTION_TYPES.map(t => (
              <button key={t} onClick={() => setForm(f => ({ ...f, type: t }))}
                className={`text-xs px-2 py-1 rounded-lg border transition ${form.type === t ? 'bg-azure text-white border-azure' : 'border-cloud text-muted'}`}>
                {t.replace('_', ' ')}
              </button>
            ))}
          </div>

          <textarea rows={3} className="w-full border border-cloud rounded-xl p-3 text-sm mb-3 focus:outline-none focus:border-azure"
            placeholder="Question text…" value={form.questionText ?? ''}
            onChange={e => setForm(f => ({ ...f, questionText: e.target.value }))} />

          {(form.type === 'MCQ' || form.type === 'TRUE_FALSE') && (
            <div className="flex flex-col gap-2 mb-3">
              {(form.options ?? []).map((opt, i) => (
                <div key={opt.id} className="flex items-center gap-2">
                  <input type="radio" name="correct" checked={form.correctAnswer === opt.id}
                    onChange={() => setForm(f => ({ ...f, correctAnswer: opt.id }))} />
                  <input className="flex-1 border border-cloud rounded-lg p-2 text-sm focus:outline-none focus:border-azure"
                    placeholder={`Option ${opt.id.toUpperCase()}`} value={opt.text}
                    onChange={e => setForm(f => ({ ...f, options: (f.options ?? []).map((o, j) => j === i ? { ...o, text: e.target.value } : o) }))} />
                </div>
              ))}
            </div>
          )}

          {(form.type === 'FILL_BLANK' || form.type === 'SHORT_ANSWER') && (
            <input className="w-full border border-cloud rounded-xl p-3 text-sm mb-3 focus:outline-none focus:border-azure"
              placeholder="Correct answer / model answer…" value={form.correctAnswer ?? ''}
              onChange={e => setForm(f => ({ ...f, correctAnswer: e.target.value }))} />
          )}

          <input className="w-full border border-cloud rounded-xl p-3 text-sm mb-3 focus:outline-none focus:border-azure"
            placeholder="Explanation (shown after attempt)…" value={form.explanation ?? ''}
            onChange={e => setForm(f => ({ ...f, explanation: e.target.value }))} />

          <div className="flex gap-3 mb-4">
            <select className="flex-1 border border-cloud rounded-xl p-2 text-sm focus:outline-none"
              value={form.difficulty ?? 'MEDIUM'} onChange={e => setForm(f => ({ ...f, difficulty: e.target.value }))}>
              {DIFFICULTIES.map(d => <option key={d}>{d}</option>)}
            </select>
            <input type="number" min={1} max={10} className="w-20 border border-cloud rounded-xl p-2 text-sm focus:outline-none"
              value={form.points ?? 1} onChange={e => setForm(f => ({ ...f, points: Number(e.target.value) }))} />
          </div>

          <button onClick={save} disabled={saving} className="w-full py-3 rounded-xl bg-azure text-white font-semibold text-sm">
            {saving ? 'Saving…' : 'Save Question'}
          </button>

          <hr className="my-4 border-cloud" />
          <p className="text-xs text-muted mb-2">AI Generate from lesson</p>
          <div className="flex gap-2">
            <input className="flex-1 border border-cloud rounded-xl p-2 text-xs focus:outline-none"
              placeholder="Lesson ID…" value={selectedLessonId}
              onChange={e => setSelectedLessonId(e.target.value)} />
            <button onClick={aiGenerate} disabled={generatingAI}
              className="px-3 py-2 rounded-xl bg-royal text-white text-xs font-semibold">
              {generatingAI ? '…' : '✨ AI'}
            </button>
          </div>
        </div>

        {/* Question list */}
        <div>
          <h2 className="font-bold text-navy mb-4">{questions.length} Questions</h2>
          {loading ? <div className="text-muted text-sm">Loading…</div> : (
            <div className="flex flex-col gap-3">
              {questions.map((q, i) => (
                <div key={q.id} className="bg-white rounded-xl border border-cloud p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="text-xs font-bold text-azure mr-2">#{i + 1} {q.type}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${q.difficulty === 'HARD' ? 'bg-red-100 text-red-600' : q.difficulty === 'EASY' ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>{q.difficulty}</span>
                      <p className="text-sm text-navy mt-1 line-clamp-2">{q.questionText}</p>
                    </div>
                    <button onClick={() => del(q.id)} className="text-red-400 hover:text-red-600 flex-shrink-0">
                      <Icon name="trash" size={14} />
                    </button>
                  </div>
                </div>
              ))}
              {!questions.length && <p className="text-sm text-muted">No questions yet. Add your first one.</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
