'use client';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { TeacherBankHero } from '@/components/hero/TeacherWorkHeroes';
import { AdminQuestionsHero } from '@/components/hero/AdminContentHeroes';
import { useAiEnabled } from '@/lib/ai';
import { HelpfulEmpty } from '@/components/ui/HelpfulEmpty';
import { cardTitle } from '@/components/public/course/BigCourseCard';

interface Row {
  id: string; text: string; type: string; difficulty: string; status: string; bankOnly: boolean; reviewNote: string | null;
  courseId: string; courseTitle: string; programme: string | null; moduleTitle: string | null; lessonTitle: string | null;
  hasExplanation: boolean; answered: number; percentRight: number | null;
  hasAiDraft: boolean; aiGenerated: boolean; aiFlag: boolean;
  /** In a bundle: its number within the course, and its module's number */
  number: number | null; moduleNo: number | null;
}
/** A course's questions as a bundle, under its exam and subject */
interface Bundle { id: string; title: string; exam: { id: string; name: string } | null; subject: string | null; level: string | null; total: number; withWhy: number; inReview: number; drafts: number; types: Record<string, number> }
interface BundleStats { total: number; withWhy: number; types: Record<string, number>; difficulty: Record<string, number>; percentRight: number | null }
type View = 'bundles' | 'all' | 'needs';
interface AiDraft { explanation: string; modelAnswer?: string | null; markSchemes?: string[] | null; answerLooksWrong: boolean; note: string }
interface Job { id: string; total: number; done: number; failed: number; errors: string[]; status: 'running' | 'finished' }
interface Stats { all: number; noWhy: number; mediumOnly: number; inReview: number; drafts: number; aiDrafts: number; aiCheck: number }
interface CourseOpt { id: string; title: string; programmeId: string | null; programme: { id: string; name: string; shortName: string | null } | null; modules: { id: string; title: string; lessons: { id: string; title: string }[] }[] }
type Part = { label: string; text: string; marks: number; markScheme: string };
interface Draft {
  id?: string; courseId: string; moduleId: string; sourceLessonId: string; questionText: string; type: string; difficulty: string;
  options: { id: string; text: string; match?: string }[]; correctAnswer: string; parts: Part[]; explanation: string; tags: string; status?: string; bankOnly?: boolean; reviewNote?: string | null; aiDraft?: AiDraft | null; aiGenerated?: boolean;
}

const TYPES: [string, string][] = [['MCQ', 'Single answer (MCQ)'], ['STRUCTURED', 'Structured'], ['MATCHING', 'Matching'], ['TRUE_FALSE', 'True / false'], ['FILL_BLANK', 'Fill the blank'], ['SHORT_ANSWER', 'Short answer'], ['WRITTEN', 'Essay']];
const typeName = (t: string) => TYPES.find(x => x[0] === t)?.[1] ?? t;
const title = (s: string) => s[0] + s.slice(1).toLowerCase();
const STATUS: Record<string, string> = { LIVE: 'Live', DRAFT: 'Draft', IN_REVIEW: 'In review' };
const field = 'w-full rounded-lg border border-line bg-white px-3 py-2 text-sm text-navy outline-none focus:border-[#5889FA]';
const select = 'h-[38px] rounded-lg border border-line bg-white px-2.5 text-[13.5px] text-navy outline-none focus:border-[#5889FA]';
const blankOptions = () => ['a', 'b', 'c', 'd'].map(id => ({ id, text: '' }));
const blank = (courseId = ''): Draft => ({ courseId, moduleId: '', sourceLessonId: '', questionText: '', type: 'MCQ', difficulty: 'MEDIUM', options: blankOptions(), correctAnswer: '', parts: [{ label: '(a)', text: '', marks: 1, markScheme: '' }], explanation: '', tags: '' });
const err = (e: any, f: string) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(' · ') : m ?? f; };

/** Splits a CSV into rows of named columns. Handles quoted cells with commas and line breaks. */
function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [[]];
  let cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (ch === '"') quoted = false; else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { rows[rows.length - 1].push(cell); cell = ''; }
    else if (ch === '\n') { rows[rows.length - 1].push(cell.replace(/\r$/, '')); cell = ''; rows.push([]); }
    else cell += ch;
  }
  rows[rows.length - 1].push(cell);
  const [head, ...body] = rows;
  const names = (head ?? []).map(h => h.trim().toLowerCase());
  return body.filter(r => r.some(c => c.trim())).map(r => Object.fromEntries(names.map((n, i) => [n, r[i] ?? ''])));
}

/** "Showing 26–50 of 380", page numbers (1 … 4 5 6 … 16), and 25, 50 or 100 a page */
function Pager({ page, size, total, onPage, onSize }: { page: number; size: number; total: number; onPage: (p: number) => void; onSize: (s: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (!total) return null;
  const shown = [...new Set([1, page - 1, page, page + 1, pages].filter(p => p >= 1 && p <= pages))].sort((a, b) => a - b);
  const btn = 'inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-[13px] font-semibold';
  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center gap-1.5 text-[13px] text-ink2">
      <span>Showing {(page - 1) * size + 1}–{Math.min(page * size, total)} of {total}</span>
      <span className="flex-1" />
      <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page" className={`${btn} border-line bg-white text-navy disabled:opacity-40`}>←</button>
      {shown.map((p, i) => (
        <React.Fragment key={p}>
          {i > 0 && p - shown[i - 1] > 1 && <span className="px-0.5">…</span>}
          <button type="button" onClick={() => onPage(p)} aria-current={p === page ? 'page' : undefined} className={`${btn} ${p === page ? 'border-[#2F57C9] bg-[#2F57C9] text-white' : 'border-line bg-white text-navy hover:bg-subtle'}`}>{p}</button>
        </React.Fragment>
      ))}
      <button type="button" disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Next page" className={`${btn} border-line bg-white text-navy disabled:opacity-40`}>→</button>
      <label className="ml-2 flex items-center gap-1.5">Per page
        <select value={size} onChange={e => onSize(Number(e.target.value))} className="h-8 rounded-md border border-line bg-white px-1.5 text-[13px] text-navy">{[25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}</select>
      </label>
    </nav>
  );
}
const mix = (types: Record<string, number>) => { const e = Object.entries(types).sort((a, b) => b[1] - a[1]); return e.length === 1 ? `${typeName(e[0][0]).replace(' (MCQ)', '').replace('Single answer', 'MCQ')} ${e[0][1]}` : e.length ? 'Mixed' : ''; };

const TEMPLATE = 'question,type,a,b,c,d,correct,explanation,difficulty,module,tags\n"What is 2 + 2?",mcq,3,4,5,6,b,"Two and two make four.",easy,,"arithmetic"\n';

export function QuestionBank({ role }: { role: 'ADMIN' | 'TEACHER' | 'SUBJECT_REVIEWER' }) {
  const canDecide = role !== 'TEACHER';
  const [rows, setRows] = useState<Row[] | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [size, setSize] = useState(25);
  const [view, setView] = useState<View>('bundles');
  const [bundles, setBundles] = useState<Bundle[] | null>(null);
  const [bundle, setBundle] = useState<BundleStats | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [courses, setCourses] = useState<CourseOpt[]>([]);
  const [f, setF] = useState({ search: '', courseId: '', difficulty: '', type: '', status: '', missing: '', ai: '' });
  const aiOn = useAiEnabled();
  const [job, setJob] = useState<Job | null>(null);
  const [gen, setGen] = useState<{ courseId: string; moduleId: string; lessonId: string; count: number; types: string[]; difficulty: string } | null>(null);
  const [aiText, setAiText] = useState('');
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importCourse, setImportCourse] = useState('');
  const [report, setReport] = useState<{ created: number; errors: { row: number; message: string }[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Where you were (view, bundle, page, page size) comes back from the address and this device
  useEffect(() => {
    const u = new URLSearchParams(window.location.search);
    const v = u.get('view'); if (v === 'all' || v === 'needs' || v === 'bundles') setView(v);
    const b = u.get('bundle'); if (b) setF(c => ({ ...c, courseId: b }));
    if (v === 'needs') setF(c => ({ ...c, missing: 'explanation' }));
    const p = Number(u.get('page')); if (p > 1) setPage(p);
    try { const s = Number(localStorage.getItem('cpa:qb-size')); if ([25, 50, 100].includes(s)) setSize(s); } catch { /* storage blocked */ }
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    const u = new URLSearchParams();
    if (view !== 'bundles') u.set('view', view);
    if (f.courseId) u.set('bundle', f.courseId);
    if (page > 1) u.set('page', String(page));
    window.history.replaceState(null, '', `${window.location.pathname}${u.toString() ? `?${u}` : ''}`);
  }, [ready, view, f.courseId, page]);
  const loadBundles = useCallback(() => api.get('/question-bank/bundles').then(r => setBundles(r.data)).catch(() => setBundles([])), []);
  useEffect(() => { loadBundles(); }, [loadBundles]);

  const load = useCallback(() => {
    if (!ready) return;
    const q = new URLSearchParams(Object.entries({ ...f, page: String(page), size: String(size) }).filter(([, v]) => v));
    api.get(`/question-bank?${q}`).then(r => { setRows(r.data.rows); setStats(r.data.stats); setTotal(r.data.total); setBundle(r.data.bundle ?? null); }).catch(() => { setRows([]); notify.error('Could not load questions'); });
  }, [f, page, size, ready]);
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [load]);
  // Ticks don't carry over to other questions
  useEffect(() => { setPicked(new Set()); }, [f, page, size]);

  /** Bundles grouped by exam, in the order the API gives them (exam, subject, size) */
  const examGroups = useMemo(() => {
    const m = new Map<string, Bundle[]>();
    for (const b of bundles ?? []) { const k = b.exam?.name ?? 'No exam yet'; m.set(k, [...(m.get(k) ?? []), b]); }
    return [...m.entries()].sort((a, b) => Number(a[0] === 'No exam yet') - Number(b[0] === 'No exam yet'));
  }, [bundles]);
  const current = bundles?.find(b => b.id === f.courseId) ?? null;
  function go(v: View) { setView(v); setPage(1); setF(c => ({ ...c, courseId: '', missing: v === 'needs' ? 'explanation' : '' })); }
  function openBundle(id: string) { setView('bundles'); setPage(1); setF(c => ({ ...c, courseId: id, missing: '' })); window.scrollTo({ top: 0 }); }

  /** The same action on every ticked question; what couldn't be done is said, not hidden */
  async function bulk(action: 'difficulty' | 'submit' | 'delete', difficulty?: string) {
    setSaving(true);
    try {
      const { data } = await api.post('/question-bank/bulk', { ids: [...picked], action, difficulty });
      const verb = action === 'difficulty' ? `set to ${title(difficulty!)}` : action === 'submit' ? 'sent for review' : 'deleted';
      if (data.skipped.length) notify.info(`${data.done} ${verb}; ${data.skipped.length} not`, { description: data.skipped[0].reason });
      else notify.success(`${data.done} ${verb}`);
      setPicked(new Set()); load(); loadBundles();
    } catch (e) { notify.error(err(e, 'That didn’t work')); }
    finally { setSaving(false); }
  }
  async function bulkWhys() {
    setSaving(true);
    try { const { data } = await api.post('/question-bank/ai/explanations', { ids: [...picked] }); setJob(data); setPicked(new Set()); }
    catch (e) { notify.error(err(e, 'Could not start')); }
    finally { setSaving(false); }
  }
  useEffect(() => { api.get('/question-bank/courses').then(r => setCourses(r.data)).catch(() => {}); }, []);
  const set = (k: keyof typeof f, v: string) => { setPage(1); setF(c => ({ ...c, [k]: v })); };

  async function open(id: string) {
    try {
      const { data: q } = await api.get(`/question-bank/${id}`);
      setDraft({
        id: q.id, courseId: q.courseId, moduleId: q.moduleId ?? '', sourceLessonId: q.sourceLessonId ?? '', questionText: q.questionText, type: q.type, difficulty: q.difficulty,
        options: Array.isArray(q.options) && q.options.length ? q.options : blankOptions(), correctAnswer: q.correctAnswer ?? '',
        parts: Array.isArray(q.parts) && q.parts.length ? q.parts : blank().parts, explanation: q.explanation ?? '', tags: (q.tags ?? []).join(', '),
        status: q.status, bankOnly: q.bankOnly, reviewNote: q.reviewNote, aiDraft: q.aiDraft, aiGenerated: q.aiGenerated,
      });
      setAiText(q.aiDraft?.explanation ?? '');
    } catch (e) { notify.error(err(e, 'Could not open this question')); }
  }

  const payload = (d: Draft) => ({
    courseId: d.courseId, moduleId: d.moduleId || null, sourceLessonId: d.sourceLessonId || null, questionText: d.questionText, type: d.type, difficulty: d.difficulty,
    options: d.type === 'MCQ' ? d.options : d.type === 'MATCHING' ? d.options.map((o, i) => ({ id: String(i + 1), text: o.text, match: o.match ?? '' })) : null, correctAnswer: d.correctAnswer, parts: d.type === 'STRUCTURED' ? d.parts : null,
    explanation: d.explanation, tags: d.tags.split(',').map(t => t.trim()).filter(Boolean),
  });

  async function save(then?: 'submit' | 'approve' | 'next') {
    if (!draft) return;
    setSaving(true);
    try {
      const { data } = draft.id ? await api.patch(`/question-bank/${draft.id}`, payload(draft)) : await api.post('/question-bank', payload(draft));
      if (then === 'submit') await api.post(`/question-bank/${data.id}/submit`);
      if (then === 'approve') await api.post(`/question-bank/${data.id}/decide`, { approve: true });
      notify.success(then === 'submit' ? 'Sent for review' : then === 'approve' ? 'Question is live' : 'Saved');
      // Save and next: straight on to the following question in the list
      const next = then === 'next' && rows ? rows[rows.findIndex(x => x.id === draft.id) + 1] : undefined;
      setDraft(null); load();
      if (next) await open(next.id);
    } catch (e) { notify.error(err(e, 'Could not save')); }
    finally { setSaving(false); }
  }

  async function act(fn: () => Promise<unknown>, done: string) {
    setSaving(true);
    try { await fn(); notify.success(done); setDraft(null); load(); }
    catch (e) { notify.error(err(e, 'That didn’t work')); }
    finally { setSaving(false); }
  }

  async function sendBack() {
    if (!draft?.id) return;
    const note = window.prompt('What needs fixing?');
    if (note === null) return;
    const id = draft.id;
    await act(() => api.post(`/question-bank/${id}/decide`, { approve: false, note }), 'Sent back to the teacher');
  }

  // ── AI ──
  useEffect(() => {
    if (job?.status !== 'running') return;
    const t = setTimeout(() => api.get(`/question-bank/ai/jobs/${job.id}`).then(r => {
      setJob(r.data);
      if (r.data.status === 'finished') { load(); notify.success(`AI drafted ${r.data.done} explanations. Check them before they go to students.`); }
    }).catch(() => setJob(null)), 1500);
    return () => clearTimeout(t);
  }, [job, load]);

  async function draftExplanations() {
    const target = f.courseId ? 'the questions in this course' : 'every question you can edit';
    if (!window.confirm(`Draft explanations with AI for ${target} that don’t have one? You’ll check each draft before students see it.`)) return;
    try { const { data } = await api.post('/question-bank/ai/explanations', f.courseId ? { courseId: f.courseId } : {}); setJob(data); }
    catch (e) { notify.error(err(e, 'Could not start the AI')); }
  }

  async function generate() {
    if (!gen) return;
    setSaving(true);
    try {
      const { data } = await api.post('/question-bank/ai/generate', { courseId: gen.courseId, moduleId: gen.moduleId || undefined, lessonId: gen.lessonId || undefined, count: gen.count, types: gen.types, difficulty: gen.difficulty });
      notify.success(`${data.created} questions drafted. Check them, then send them for review.`);
      setGen(null); setPage(1); setF(c => ({ ...c, courseId: gen.courseId, ai: 'written', status: 'DRAFT' }));
    } catch (e) { notify.error(err(e, 'The AI couldn’t write questions')); }
    finally { setSaving(false); }
  }

  async function acceptAi() {
    if (!draft?.id) return;
    const id = draft.id;
    setSaving(true);
    try {
      await api.post(`/question-bank/${id}/ai-draft/accept`, { explanation: aiText });
      notify.success('Explanation added');
      load(); await open(id);
    } catch (e) { notify.error(err(e, 'Could not add it')); }
    finally { setSaving(false); }
  }

  async function discardAi() {
    if (!draft?.id) return;
    const id = draft.id;
    try { await api.post(`/question-bank/${id}/ai-draft/discard`); load(); await open(id); }
    catch (e) { notify.error(err(e, 'Could not discard it')); }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!importCourse) { notify.error('Pick the course first'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/question-bank/import', { courseId: importCourse, rows: parseCsv(await file.text()) });
      setReport(data); load();
    } catch (ex) { notify.error(err(ex, 'Could not read that file')); }
    finally { setSaving(false); }
  }

  const template = () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([TEMPLATE], { type: 'text/csv' })); a.download = 'question-template.csv'; a.click(); URL.revokeObjectURL(a.href); };
  const course = courses.find(c => c.id === draft?.courseId);
  const mod = course?.modules.find(m => m.id === draft?.moduleId);
  const put = (patch: Partial<Draft>) => setDraft(d => (d ? { ...d, ...patch } : d));

  const tiles = stats ? [
    { l: 'All questions', v: stats.all, d: `${stats.drafts} drafts`, on: () => set('status', '') },
    { l: 'Waiting for review', v: stats.inReview, d: canDecide ? 'Approve or send back' : 'With the reviewer', on: () => set('status', 'IN_REVIEW') },
    { l: 'No why-explanation', v: stats.noWhy, d: 'Practice shows only the answer', on: () => set('missing', 'explanation') },
    stats.aiDrafts > 0
      ? { l: 'AI drafts to check', v: stats.aiDrafts, d: stats.aiCheck ? `${stats.aiCheck} where the answer may be wrong` : 'Accept, edit or discard', on: () => set('ai', 'drafts') }
      : { l: 'Marked Medium', v: stats.mediumOnly, d: 'CAT needs easy and hard too', on: () => set('difficulty', 'MEDIUM') },
  ] : [];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-6">
        {role === 'ADMIN' && <AdminQuestionsHero aiOn={aiOn} onDraftAI={draftExplanations} onNoWhy={() => set('missing', 'explanation')} onAiDrafts={() => set('ai', 'drafts')} reloadKey={job?.status} />}
        {role === 'TEACHER' && <TeacherBankHero page="questions" onNew={() => setDraft(blank(f.courseId || (courses.length === 1 ? courses[0].id : '')))} />}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-navy">Question bank</h1>
            <p className="mt-1 text-sm text-ink2">Every question from {role === 'ADMIN' ? 'every course' : 'your courses'} in one place. Lesson quizzes and the Test Centre both draw from it.</p>
          </div>
          <button onClick={draftExplanations} disabled={!aiOn || job?.status === 'running'} title={aiOn ? '' : 'Add the AI key to switch this on'} className="h-[38px] rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy disabled:opacity-50">Draft explanations with AI</button>
          <button onClick={() => setGen({ courseId: f.courseId || (courses.length === 1 ? courses[0].id : ''), moduleId: '', lessonId: '', count: 5, types: ['MCQ'], difficulty: 'MIXED' })} disabled={!aiOn} title={aiOn ? '' : 'Add the AI key to switch this on'} className="h-[38px] rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy disabled:opacity-50">Write questions with AI</button>
          <button onClick={() => { setImporting(true); setReport(null); }} className="h-[38px] rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy">Import spreadsheet</button>
          <button onClick={() => setDraft(blank(f.courseId || (courses.length === 1 ? courses[0].id : '')))} className="h-[38px] rounded-md bg-[#3F6FE8] px-3.5 text-[13.5px] font-semibold text-white hover:bg-[#2F57C9]">New question</button>
        </div>

        {!aiOn && <p className="rounded-lg border border-line bg-white px-4 py-2.5 text-[13px] text-ink2">AI drafting switches on once the AI key is added. Until then, write explanations by hand: click “No why-explanation” below, then use Save and next.</p>}
        {job && (
          <div className="flex flex-col gap-2 rounded-lg border border-[#5889FA] bg-[#EAF0FF] px-4 py-3 text-[13px] text-navy">
            <div className="flex justify-between"><strong>{job.status === 'running' ? 'AI is drafting explanations…' : 'AI drafts are ready to check'}</strong><span>{job.done} of {job.total}{job.failed ? ` · ${job.failed} failed` : ''}</span></div>
            <span className="h-1.5 rounded bg-white"><span className="block h-1.5 rounded bg-[#3F6FE8] transition-all" style={{ width: `${job.total ? Math.round(((job.done + job.failed) / job.total) * 100) : 0}%` }} /></span>
            {job.errors.length > 0 && <span className="text-xs text-ink2">{job.errors[0]}</span>}
            {job.status === 'finished' && <span><button onClick={() => { set('ai', 'drafts'); setJob(null); }} className="font-semibold text-[#3F6FE8]">Check the drafts →</button></span>}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map(t => (
            <button key={t.l} onClick={t.on} className="rounded-[10px] border border-line bg-white px-4 py-3.5 text-left transition hover:border-[#5889FA]">
              <span className="text-[12.5px] text-muted">{t.l}</span>
              <p className="mt-0.5 text-2xl font-extrabold text-navy">{t.v}</p>
              <span className="text-xs text-ink2">{t.d}</span>
            </button>
          ))}
        </div>

        <div role="tablist" aria-label="View" className="flex gap-1 overflow-x-auto border-b border-line">
          {([['bundles', 'Bundles', bundles?.length], ['all', 'All questions', stats?.all], ['needs', 'Needs a why', stats?.noWhy]] as [View, string, number | undefined][]).map(([k, l, n]) => (
            <button key={k} type="button" role="tab" aria-selected={view === k} onClick={() => go(k)}
              className={`-mb-px h-[42px] whitespace-nowrap border-b-2 px-3 text-[13.5px] text-navy ${view === k ? 'border-azure-strong font-bold' : 'border-transparent font-medium text-ink2'}`}>
              {l}{n != null && <span className="ml-1 font-medium text-muted">{n}</span>}
            </button>
          ))}
        </div>

        {/* Bundles: one per course, under its exam and subject */}
        {view === 'bundles' && !f.courseId && (
          !bundles ? <div className="h-48 animate-pulse rounded-xl border border-line bg-white" />
          : !bundles.length ? <p className="rounded-xl border border-line bg-white p-6 text-center text-[13.5px] text-ink2">No courses with questions yet.</p>
          : <div className="flex flex-col gap-5">
            {examGroups.map(([exam, list]) => (
              <section key={exam} className="flex flex-col gap-2.5">
                <p className="flex items-baseline gap-2"><b className="text-[16px] text-navy">{exam}</b><span className="text-[12.5px] text-muted">{list.length} bundle{list.length === 1 ? '' : 's'} · {list.reduce((n, b) => n + b.total, 0)} questions</span></p>
                <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                  {list.map(b => (
                    <button key={b.id} type="button" onClick={() => openBundle(b.id)} className="flex min-w-0 flex-col gap-1.5 rounded-xl border border-line bg-white p-3.5 text-left transition hover:border-[#5889FA]">
                      <span className="text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-muted">{b.subject ?? 'No subject'}{b.level ? ` · ${b.level}` : ''}</span>
                      <b className="line-clamp-2 text-[14.5px] leading-snug text-navy">{cardTitle(b.title).title}</b>
                      <span className="flex justify-between text-[12px] text-ink2"><span>{b.total} question{b.total === 1 ? '' : 's'}</span><span>{mix(b.types)}</span></span>
                      <span className="h-1.5 overflow-hidden rounded bg-subtle"><span className="block h-full rounded bg-[#3F6FE8]" style={{ width: `${b.total ? Math.round((b.withWhy / b.total) * 100) : 0}%` }} /></span>
                      <span className="text-[11.5px] text-muted">{b.withWhy} of {b.total} with a why{b.inReview ? ` · ${b.inReview} in review` : ''}{b.drafts ? ` · ${b.drafts} drafts` : ''}</span>
                    </button>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

        {(view !== 'bundles' || f.courseId) && (
          <div className={f.courseId ? 'grid items-start gap-4 lg:grid-cols-[250px_minmax(0,1fr)]' : 'flex flex-col'}>
            {/* Inside a bundle: the other bundles down the side */}
            {f.courseId && (
              <nav aria-label="Bundles" className="hidden flex-col gap-0.5 rounded-xl border border-line bg-white p-2 text-[13px] lg:flex">
                <button type="button" onClick={() => go('bundles')} className="rounded-md px-2 py-1.5 text-left font-semibold text-azure-strong hover:bg-subtle">← All bundles</button>
                {examGroups.map(([exam, list]) => (
                  <div key={exam} className="flex flex-col gap-0.5">
                    <span className="px-2 pb-1 pt-2.5 text-[10.5px] font-extrabold uppercase tracking-[0.06em] text-muted">{exam}</span>
                    {list.map(b => (
                      <button key={b.id} type="button" onClick={() => openBundle(b.id)} className={`flex justify-between gap-2 rounded-md px-2 py-1.5 text-left ${b.id === f.courseId ? 'bg-accent-soft font-bold text-navy' : 'text-ink2 hover:bg-subtle'}`}>
                        <span className="min-w-0 truncate">{cardTitle(b.title).title}</span><span className="text-[12px] text-muted">{b.total}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </nav>
            )}
            <div className="flex min-w-0 flex-col gap-3">
              {f.courseId && current && (
                <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-4 py-3.5">
                  <span className="min-w-0 flex-1">
                    <span className="text-[11px] font-extrabold uppercase tracking-[0.06em] text-muted">{[current.exam?.name, current.subject, cardTitle(current.title).form].filter(Boolean).join(' · ')}</span>
                    <b className="block text-[19px] text-navy">{cardTitle(current.title).title}</b>
                    {bundle && <span className="mt-1.5 flex flex-wrap gap-1.5 text-[11.5px] font-semibold text-ink2">
                      {[`${bundle.total} questions`, mix(bundle.types), `Easy ${bundle.difficulty.EASY ?? 0} · Medium ${bundle.difficulty.MEDIUM ?? 0} · Hard ${bundle.difficulty.HARD ?? 0}`, `${bundle.withWhy} with a why`, bundle.percentRight != null ? `${bundle.percentRight}% answered right` : null].filter(Boolean).map(x => <span key={x} className="rounded-full bg-subtle px-2.5 py-0.5">{x}</span>)}
                    </span>}
                  </span>
                  <button type="button" onClick={() => setDraft(blank(f.courseId))} className="h-9 rounded-md bg-[#3F6FE8] px-3.5 text-[13px] font-semibold text-white hover:bg-[#2F57C9]">Add to this bundle</button>
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <input aria-label="Search questions" value={f.search} onChange={e => set('search', e.target.value)} placeholder={f.courseId ? 'Search in this bundle…' : 'Search questions…'} className={`${select} min-w-[200px] flex-1`} />
                {!f.courseId && <select aria-label="Course" className={`${select} max-w-[240px]`} value={f.courseId} onChange={e => openBundle(e.target.value)}><option value="">All courses</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>}
                <select aria-label="Type" className={select} value={f.type} onChange={e => set('type', e.target.value)}><option value="">All types</option>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                <select aria-label="Difficulty" className={select} value={f.difficulty} onChange={e => set('difficulty', e.target.value)}><option value="">All difficulty</option>{['EASY', 'MEDIUM', 'HARD'].map(k => <option key={k} value={k}>{title(k)}</option>)}</select>
                <select aria-label="Status" className={select} value={f.status} onChange={e => set('status', e.target.value)}><option value="">All statuses</option>{Object.entries(STATUS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
                {f.ai && <button onClick={() => set('ai', '')} className="h-[38px] rounded-md border border-[#5889FA] bg-[#EAF0FF] px-3 text-[13px] font-semibold text-navy">{f.ai === 'drafts' ? 'AI drafts' : f.ai === 'check' ? 'Answer may be wrong' : 'Written by AI'} ✕</button>}
                {f.missing && view !== 'needs' && <button onClick={() => set('missing', '')} className="h-[38px] rounded-md border border-[#5889FA] bg-[#EAF0FF] px-3 text-[13px] font-semibold text-navy">No explanation ✕</button>}
              </div>

              {picked.size > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg bg-accent-soft px-3 py-2 text-[13px] text-navy">
                  <b className="mr-1">{picked.size} selected</b>
                  <select aria-label="Set difficulty" value="" onChange={e => e.target.value && bulk('difficulty', e.target.value)} className={`${select} h-8`}><option value="">Set difficulty…</option>{['EASY', 'MEDIUM', 'HARD'].map(k => <option key={k} value={k}>{title(k)}</option>)}</select>
                  <button type="button" disabled={!aiOn || saving} onClick={bulkWhys} title={aiOn ? '' : 'Add the AI key to switch this on'} className="h-8 rounded-md border border-line bg-white px-3 font-semibold disabled:opacity-50">Draft whys with AI</button>
                  <button type="button" disabled={saving} onClick={() => bulk('submit')} className="h-8 rounded-md border border-line bg-white px-3 font-semibold">Send for review</button>
                  <button type="button" disabled={saving} onClick={() => { if (window.confirm(`Delete ${picked.size} question${picked.size === 1 ? '' : 's'}? Questions in a lesson quiz are kept; remove those in the course builder.`)) bulk('delete'); }} className="h-8 rounded-md border border-line bg-white px-3 font-semibold text-[#A12A2A]">Delete</button>
                  <button type="button" onClick={() => setPicked(new Set())} className="ml-auto font-semibold text-ink2">Clear</button>
                </div>
              )}

              <section className="overflow-x-auto rounded-[10px] border border-line bg-white">
                <table className="w-full min-w-[820px] border-collapse text-[13.5px] text-navy">
                  <thead><tr className="bg-subtle text-left text-ink2">
                    <th className="w-9 pl-3"><input type="checkbox" aria-label="Select this page" className="h-4 w-4 accent-[#3F6FE8]" checked={!!rows?.length && rows.every(r => picked.has(r.id))} onChange={e => setPicked(p => { const n = new Set(p); rows?.forEach(r => (e.target.checked ? n.add(r.id) : n.delete(r.id))); return n; })} /></th>
                    {f.courseId && <th className="w-10 font-semibold">#</th>}
                    <th className="px-3 py-2.5 font-semibold">Question</th>{!f.courseId && <th className="font-semibold">Where it belongs</th>}<th className="font-semibold">Type</th><th className="font-semibold">Difficulty</th><th className="font-semibold">Why</th><th className="font-semibold">% right</th><th className="pr-4 font-semibold">Status</th>
                  </tr></thead>
                  <tbody>
                    {rows === null && <tr><td colSpan={9} className="p-4 text-muted">Loading…</td></tr>}
                    {rows?.length === 0 && Object.values(f).some(Boolean) && <tr><td colSpan={9} className="p-4 text-muted">No questions match.</td></tr>}
                    {rows?.length === 0 && !Object.values(f).some(Boolean) && <tr><td colSpan={9} className="p-0"><HelpfulEmpty title="Start your question bank." body="Write a few questions, import a spreadsheet, or let AI draft some from your lessons." cta={{ label: 'Write a question', onClick: () => setDraft(blank(courses.length === 1 ? courses[0].id : '')) }} preview={{ icon: '?', title: 'Question 1', line: 'Draft · MCQ' }} /></td></tr>}
                    {rows?.map((r, i) => (
                      <React.Fragment key={r.id}>
                        {/* In a bundle, a heading each time the module changes */}
                        {f.courseId && r.moduleTitle && (i === 0 || rows[i - 1].moduleTitle !== r.moduleTitle) && (
                          <tr className="border-t border-line bg-subtle"><td colSpan={9} className="px-3 py-1.5 text-[12.5px] font-extrabold text-ink2">{r.moduleNo ? `Module ${r.moduleNo} · ` : ''}{r.moduleTitle.replace(/^Module \d+\s*[:.–-]?\s*/i, '')}</td></tr>
                        )}
                        <tr onClick={() => open(r.id)} className={`cursor-pointer border-t border-line hover:bg-subtle ${picked.has(r.id) ? 'bg-accent-soft' : ''}`}>
                          <td className="pl-3" onClick={e => e.stopPropagation()}><input type="checkbox" aria-label="Select" className="h-4 w-4 accent-[#3F6FE8]" checked={picked.has(r.id)} onChange={e => setPicked(p => { const n = new Set(p); if (e.target.checked) n.add(r.id); else n.delete(r.id); return n; })} /></td>
                          {f.courseId && <td className="text-[12.5px] font-semibold text-muted tabular-nums">{r.number}</td>}
                          <td className="max-w-[360px] truncate px-3 py-2.5" title={r.text}>{r.text}</td>
                          {!f.courseId && <td className="max-w-[240px] truncate text-ink2" title={r.courseTitle}>{[r.programme, cardTitle(r.courseTitle).title, r.moduleTitle].filter(Boolean).join(' · ')}</td>}
                          <td>{typeName(r.type).replace(' (MCQ)', '')}</td>
                          <td>{title(r.difficulty)}</td>
                          <td className={r.hasExplanation ? '' : 'text-muted'}>{r.hasExplanation ? '✓' : r.aiFlag ? <span className="font-semibold text-[#C1352B]">Check answer</span> : r.hasAiDraft ? <span className="font-semibold text-[#3F6FE8]">AI draft</span> : 'Missing'}</td>
                          <td>{r.percentRight != null ? `${r.percentRight}%` : '—'}</td>
                          <td className="pr-4 font-semibold">{STATUS[r.status]}{r.reviewNote ? ' · sent back' : ''}{r.aiGenerated ? <span className="ml-1.5 rounded bg-[#EAF0FF] px-1.5 py-px text-[10.5px] text-[#2F57C9]">AI</span> : null}</td>
                        </tr>
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </section>
              <Pager page={page} size={size} total={total} onPage={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }} onSize={s => { setSize(s); setPage(1); try { localStorage.setItem('cpa:qb-size', String(s)); } catch { /* storage blocked */ } }} />
            </div>
          </div>
        )}
      </div>

      {gen && (() => {
        const c = courses.find(x => x.id === gen.courseId);
        const m = c?.modules.find(x => x.id === gen.moduleId);
        const up = (patch: Partial<typeof gen>) => setGen(g => (g ? { ...g, ...patch } : g));
        return (
          <div role="dialog" aria-modal="true" aria-label="Write questions with AI" className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
            <div className="flex max-h-[90vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-[10px] bg-white p-5">
              <strong className="text-lg text-navy">Write questions with AI</strong>
              <p className="text-sm text-ink2">The AI writes from the lesson text and video transcripts you pick. Questions arrive as drafts; nothing reaches students until it’s been reviewed.</p>
              <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Course<select className={select} value={gen.courseId} onChange={e => up({ courseId: e.target.value, moduleId: '', lessonId: '' })}><option value="">Select</option>{courses.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Module<select className={select} value={gen.moduleId} disabled={!c} onChange={e => up({ moduleId: e.target.value, lessonId: '' })}><option value="">Whole course</option>{c?.modules.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
                <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Lesson<select className={select} value={gen.lessonId} disabled={!m} onChange={e => up({ lessonId: e.target.value })}><option value="">Whole module</option>{m?.lessons.map(x => <option key={x.id} value={x.id}>{x.title}</option>)}</select></label>
                <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">How many<input type="number" min={1} max={20} className={select} value={gen.count} onChange={e => up({ count: Math.min(20, Math.max(1, Number(e.target.value) || 1)) })} /></label>
                <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Difficulty<select className={select} value={gen.difficulty} onChange={e => up({ difficulty: e.target.value })}><option value="MIXED">Mixed</option>{['EASY', 'MEDIUM', 'HARD'].map(k => <option key={k} value={k}>{title(k)}</option>)}</select></label>
              </div>
              <div className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Question types</span>
                <div className="flex flex-wrap gap-1.5">{TYPES.filter(([k]) => k !== 'WRITTEN').map(([k, l]) => {
                  const on = gen.types.includes(k);
                  return <button key={k} type="button" aria-pressed={on} onClick={() => up({ types: on ? gen.types.filter(x => x !== k) : [...gen.types, k] })} className={`h-7 rounded-md px-2.5 text-[12.5px] ${on ? 'border border-[#5889FA] bg-[#EAF0FF] font-semibold text-navy' : 'border border-line text-ink2'}`}>{l}</button>;
                })}</div>
              </div>
              <div className="flex justify-end gap-2">
                <button onClick={() => setGen(null)} className="h-9 rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy">Cancel</button>
                <button onClick={generate} disabled={saving || !gen.courseId || !gen.types.length} className="h-9 rounded-md bg-[#3F6FE8] px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-50">{saving ? 'Writing… this can take a minute' : 'Write questions'}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {importing && (
        <div role="dialog" aria-modal="true" aria-label="Import spreadsheet" className="fixed inset-0 z-50 flex items-center justify-center bg-navy/40 p-4">
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col gap-3 overflow-y-auto rounded-[10px] bg-white p-5">
            <strong className="text-lg text-navy">Import a spreadsheet</strong>
            <p className="text-sm text-ink2">Save your sheet as CSV with these columns. Each good row becomes a draft; rows with a problem are listed so you can fix them. <button onClick={template} className="font-semibold text-[#3F6FE8]">Download the template</button></p>
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Course<select className={select} value={importCourse} onChange={e => setImportCourse(e.target.value)}><option value="">Select</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={onFile} />
            {report && (
              <div className="rounded-lg bg-[#EAF0FF] p-3 text-[13px] text-navy">
                <strong>{report.created} added as drafts.</strong>
                {report.errors.length > 0 && <ul className="mt-1.5 list-disc pl-4">{report.errors.slice(0, 20).map(e => <li key={e.row}>Row {e.row}: {e.message}</li>)}{report.errors.length > 20 && <li>and {report.errors.length - 20} more</li>}</ul>}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setImporting(false)} className="h-9 rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy">Close</button>
              <button onClick={() => fileRef.current?.click()} disabled={saving || !importCourse} className="h-9 rounded-md bg-[#3F6FE8] px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-50">{saving ? 'Importing…' : 'Choose file'}</button>
            </div>
          </div>
        </div>
      )}

      {draft && (
        <div role="dialog" aria-modal="true" aria-label={draft.id ? 'Edit question' : 'New question'} className="fixed inset-0 z-50 flex justify-end bg-navy/40">
          <div className="flex h-full w-full max-w-[720px] flex-col bg-white">
            <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
              <strong className="flex-1 text-lg text-navy">{draft.id ? `Edit question${rows?.find(x => x.id === draft.id)?.number ? ` #${rows.find(x => x.id === draft.id)!.number}` : ''}` : 'New question'}</strong>
              {draft.id && rows && (() => { const i = rows.findIndex(x => x.id === draft.id); return i < 0 ? null : <span className="flex gap-1"><button type="button" disabled={i <= 0} onClick={() => open(rows[i - 1].id)} aria-label="Previous question" className="h-8 rounded-md border border-line px-2.5 text-[13px] font-semibold text-navy disabled:opacity-40">←</button><button type="button" disabled={i >= rows.length - 1} onClick={() => open(rows[i + 1].id)} aria-label="Next question" className="h-8 rounded-md border border-line px-2.5 text-[13px] font-semibold text-navy disabled:opacity-40">→</button></span>; })()}
              {draft.status && <span className="rounded-md bg-subtle px-2 py-0.5 text-xs font-semibold text-ink2">{STATUS[draft.status]}</span>}
              <button aria-label="Close" onClick={() => setDraft(null)} className="text-lg text-muted">✕</button>
            </div>
            <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-5">
              {draft.aiGenerated && draft.status !== 'LIVE' && <p className="rounded-lg bg-[#EAF0FF] px-3 py-2 text-[13px] text-navy">Written by AI. Check the question, the answer and the explanation before sending it for review.</p>}
              {draft.aiDraft && (
                <div className="flex flex-col gap-2 rounded-lg border border-[#5889FA] p-3 text-[13px] text-navy">
                  <strong>AI-drafted explanation</strong>
                  {draft.aiDraft.answerLooksWrong && <p className="rounded-md bg-[#FDF1F0] px-2.5 py-1.5 text-[#C1352B]"><strong>The AI thinks the marked answer may be wrong.</strong> {draft.aiDraft.note}</p>}
                  <textarea aria-label="AI-drafted explanation" rows={3} className={field} value={aiText} onChange={e => setAiText(e.target.value)} />
                  {draft.aiDraft.modelAnswer && <p><strong>Suggested model answer:</strong> {draft.aiDraft.modelAnswer}</p>}
                  {!!draft.aiDraft.markSchemes?.length && <p><strong>Suggested marking schemes:</strong> {draft.aiDraft.markSchemes.join(' · ')}</p>}
                  <div className="flex gap-2">
                    <button disabled={saving || !aiText.trim()} onClick={acceptAi} className="h-8 rounded-md bg-[#3F6FE8] px-3 text-[13px] font-semibold text-white disabled:opacity-50">Use this explanation</button>
                    <button disabled={saving} onClick={discardAi} className="h-8 rounded-md border border-line px-3 text-[13px] font-semibold text-navy">Discard</button>
                  </div>
                </div>
              )}
              {draft.reviewNote && <p className="rounded-lg border border-[#5889FA] bg-[#EAF0FF] px-3 py-2 text-[13px] text-navy"><strong>Reviewer’s note:</strong> {draft.reviewNote}</p>}
              {draft.id && !draft.bankOnly && <p className="rounded-lg bg-subtle px-3 py-2 text-[13px] text-ink2">This question is part of a lesson quiz. Edits here change the quiz too.</p>}
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Course<select className={select} disabled={!!draft.id} value={draft.courseId} onChange={e => put({ courseId: e.target.value, moduleId: '', sourceLessonId: '' })}><option value="">Select</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
                <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Question type<select className={select} value={draft.type} onChange={e => put({ type: e.target.value, correctAnswer: '' })}>{TYPES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></label>
                <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Module <span className="font-normal text-muted">(optional)</span><select className={select} value={draft.moduleId} onChange={e => put({ moduleId: e.target.value, sourceLessonId: '' })}><option value="">None</option>{course?.modules.map(m => <option key={m.id} value={m.id}>{m.title}</option>)}</select></label>
                <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Lesson <span className="font-normal text-muted">(optional)</span><select className={select} value={draft.sourceLessonId} disabled={!mod} onChange={e => put({ sourceLessonId: e.target.value })}><option value="">None</option>{mod?.lessons.map(l => <option key={l.id} value={l.id}>{l.title}</option>)}</select></label>
                <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Difficulty<select className={select} value={draft.difficulty} onChange={e => put({ difficulty: e.target.value })}>{['EASY', 'MEDIUM', 'HARD'].map(k => <option key={k} value={k}>{title(k)}</option>)}</select></label>
                <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Topic tags <span className="font-normal text-muted">(comma separated)</span><input className={`${select} font-normal`} value={draft.tags} onChange={e => put({ tags: e.target.value })} /></label>
              </div>
              <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Question<textarea rows={3} className={`${field} font-normal`} value={draft.questionText} onChange={e => put({ questionText: e.target.value })} /></label>

              {draft.type === 'MCQ' && (
                <div className="flex flex-col gap-2"><span className="text-[13px] font-semibold text-navy">Answers <span className="font-normal text-muted">· tick the correct one</span></span>
                  {draft.options.map((o, i) => (
                    <div key={o.id} className="flex items-center gap-2.5">
                      <input aria-label={`Answer ${i + 1} is correct`} type="radio" name="correct" className="h-4 w-4 accent-[#3F6FE8]" checked={draft.correctAnswer === o.id} onChange={() => put({ correctAnswer: o.id })} />
                      <input aria-label={`Answer ${i + 1}`} className={field} value={o.text} onChange={e => put({ options: draft.options.map(x => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} />
                    </div>
                  ))}
                  {draft.options.length < 6 && <button type="button" onClick={() => put({ options: [...draft.options, { id: String.fromCharCode(97 + draft.options.length), text: '' }] })} className="self-start text-[13px] font-semibold text-[#3F6FE8]">+ Add answer</button>}
                </div>
              )}
              {draft.type === 'MATCHING' && (
                <div className="flex flex-col gap-2"><span className="text-[13px] font-semibold text-navy">Pairs <span className="font-normal text-muted">· students match each item to its answer, chosen from all the answers shuffled. One mark per pair.</span></span>
                  {draft.options.map((o, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
                      <input aria-label={`Item ${i + 1}`} placeholder="Item" className={field} value={o.text} onChange={e => put({ options: draft.options.map((x, n) => (n === i ? { ...x, text: e.target.value } : x)) })} />
                      <input aria-label={`Its answer ${i + 1}`} placeholder="Its answer" className={field} value={o.match ?? ''} onChange={e => put({ options: draft.options.map((x, n) => (n === i ? { ...x, match: e.target.value } : x)) })} />
                      {draft.options.length > 2 ? <button type="button" aria-label="Remove pair" onClick={() => put({ options: draft.options.filter((_, n) => n !== i) })} className="text-[#C1352B]">✕</button> : <span />}
                    </div>
                  ))}
                  {draft.options.length < 10 && <button type="button" onClick={() => put({ options: [...draft.options, { id: String(draft.options.length + 1), text: '', match: '' }] })} className="self-start text-[13px] font-semibold text-[#3F6FE8]">+ Add pair</button>}
                </div>
              )}
              {draft.type === 'TRUE_FALSE' && (
                <div className="flex gap-2">{['True', 'False'].map(v => <button key={v} type="button" aria-pressed={draft.correctAnswer === v} onClick={() => put({ correctAnswer: v })} className={`h-9 rounded-md px-4 text-sm font-semibold ${draft.correctAnswer === v ? 'border border-[#5889FA] bg-[#EAF0FF] text-navy' : 'border border-line text-navy'}`}>{v}</button>)}</div>
              )}
              {draft.type === 'FILL_BLANK' && <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">The word that fills the blank<input className={`${field} font-normal`} value={draft.correctAnswer} onChange={e => put({ correctAnswer: e.target.value })} /></label>}
              {(draft.type === 'SHORT_ANSWER' || draft.type === 'WRITTEN') && <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Model answer <span className="font-normal text-muted">Students compare with this when marking themselves</span><textarea rows={4} className={`${field} font-normal`} value={draft.correctAnswer} onChange={e => put({ correctAnswer: e.target.value })} /></label>}
              {draft.type === 'STRUCTURED' && (
                <div className="flex flex-col gap-3"><span className="text-[13px] font-semibold text-navy">Parts</span>
                  {draft.parts.map((p, i) => {
                    const up = (patch: Partial<Part>) => put({ parts: draft.parts.map((x, n) => (n === i ? { ...x, ...patch } : x)) });
                    return (
                      <div key={i} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                        <div className="flex items-center gap-2">
                          <input aria-label="Part label" className={`${field} w-16`} value={p.label} onChange={e => up({ label: e.target.value })} />
                          <input aria-label="Marks" type="number" min={1} className={`${field} w-20`} value={p.marks} onChange={e => up({ marks: Number(e.target.value) })} /><span className="flex-1 text-[13px] text-muted">marks</span>
                          {draft.parts.length > 1 && <button type="button" onClick={() => put({ parts: draft.parts.filter((_, n) => n !== i) })} className="text-[13px] font-semibold text-[#C1352B]">Remove</button>}
                        </div>
                        <textarea aria-label="Part question" rows={2} placeholder="The question for this part" className={field} value={p.text} onChange={e => up({ text: e.target.value })} />
                        <textarea aria-label="Marking scheme" rows={2} placeholder="Marking scheme" className={field} value={p.markScheme} onChange={e => up({ markScheme: e.target.value })} />
                      </div>
                    );
                  })}
                  <button type="button" onClick={() => put({ parts: [...draft.parts, { label: `(${String.fromCharCode(97 + draft.parts.length)})`, text: '', marks: 1, markScheme: '' }] })} className="self-start text-[13px] font-semibold text-[#3F6FE8]">+ Add part</button>
                </div>
              )}
              <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Why this is right <span className="font-normal text-muted">Practice mode shows this. Needed before sending for review.</span><textarea rows={3} className={`${field} font-normal`} value={draft.explanation} onChange={e => put({ explanation: e.target.value })} /></label>
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
              {draft.id && draft.bankOnly && <button disabled={saving} onClick={() => { if (window.confirm('Delete this question?')) act(() => api.delete(`/question-bank/${draft.id}`), 'Deleted'); }} className="mr-auto text-[13px] font-semibold text-[#C1352B]">Delete</button>}
              {canDecide && draft.status === 'IN_REVIEW' && <button disabled={saving} onClick={sendBack} className="h-9 rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy">Send back</button>}
              <button disabled={saving} onClick={() => save()} className="h-9 rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy disabled:opacity-50">{draft.id ? 'Save' : 'Save draft'}</button>
              {draft.id && rows && rows.findIndex(x => x.id === draft.id) < rows.length - 1 && <button disabled={saving} onClick={() => save('next')} className="h-9 rounded-md bg-[#3F6FE8] px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-50">Save and next</button>}
              {(!draft.status || draft.status === 'DRAFT') && !canDecide && <button disabled={saving} onClick={() => save('submit')} className="h-9 rounded-md bg-[#3F6FE8] px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-50">Send for review</button>}
              {canDecide && draft.status !== 'LIVE' && (role === 'ADMIN' || draft.status === 'IN_REVIEW') && <button disabled={saving} onClick={() => save('approve')} className="h-9 rounded-md bg-[#3F6FE8] px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-50">Approve and go live</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
