'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { TeacherBankHero } from '@/components/hero/TeacherWorkHeroes';
import { HelpfulEmpty } from '@/components/ui/HelpfulEmpty';

type Kind = 'MOCK' | 'PAST_PAPER' | 'CAT';
interface Row {
  id: string; kind: Kind; title: string; status: 'DRAFT' | 'PUBLISHED'; timeLimitSecs: number; passMark: number; attemptsAllowed: number;
  randomised: boolean; questionCount: number; examBody: string | null; year: number | null; session: string | null; paperNumber: string | null;
  attempts: number; toMark: number;
}
interface CourseOpt { id: string; title: string; modules: { id: string; title: string }[] }
interface Section { title: string; courseIds: string[]; moduleIds: string[]; count: number; easy: number; medium: number; hard: number }
interface Q { id: string; questionText: string; type: string; difficulty: string; status: string }
interface Form {
  id?: string; status?: string; kind: Kind; title: string; description: string; courseIds: string[]; packageIds: string[];
  timeMinutes: number; passMark: number; attemptsAllowed: number; showAnswers: boolean; randomised: boolean;
  sections: Section[]; questions: Q[]; examBody: string; year: string; session: string; paperNumber: string;
  catMin: number; catMax: number; catStandard: number;
}
interface Mark { sessionId: string; examTitle: string; student: string; submittedAt: string; toMark: number }

const field = 'h-[38px] w-full rounded-lg border border-line bg-white px-2.5 text-[13.5px] text-navy outline-none focus:border-[#5889FA]';
const label = 'flex flex-col gap-1 text-[13px] font-semibold text-navy';
const err = (e: any, f: string) => { const m = e?.response?.data?.message; return Array.isArray(m) ? m.join(' · ') : m ?? f; };
const blankSection = (courseIds: string[] = []): Section => ({ title: 'Section 1', courseIds, moduleIds: [], count: 10, easy: 0, medium: 0, hard: 0 });
const TYPE: Record<string, string> = { MCQ: 'MCQ', TRUE_FALSE: 'True/false', FILL_BLANK: 'Fill', SHORT_ANSWER: 'Short', WRITTEN: 'Essay', STRUCTURED: 'Structured', MATCHING: 'Matching' };

export function MockExams({ role }: { role: 'ADMIN' | 'TEACHER' }) {
  const base = role === 'ADMIN' ? '/admin/mocks' : '/teacher/mocks';
  const [tab, setTab] = useState<'MOCK' | 'PAST_PAPER' | 'CAT' | 'MARK'>('MOCK');
  const [calibrating, setCalibrating] = useState(false);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [toMark, setToMark] = useState(0);
  const [queue, setQueue] = useState<Mark[] | null>(null);
  const [courses, setCourses] = useState<CourseOpt[]>([]);
  const [packages, setPackages] = useState<{ id: string; name: string }[]>([]);
  const [form, setForm] = useState<Form | null>(null);
  const [avail, setAvail] = useState<{ total: number; easy: number; medium: number; hard: number }[]>([]);
  const [saving, setSaving] = useState(false);
  const [pick, setPick] = useState<{ search: string; courseId: string; rows: Q[] }>({ search: '', courseId: '', rows: [] });

  const load = useCallback(() => {
    if (tab === 'MARK') { api.get('/mock-exams/marking').then(r => setQueue(r.data)).catch(() => setQueue([])); return; }
    api.get(`/mock-exams?kind=${tab}`).then(r => { setRows(r.data.exams); setToMark(r.data.toMark); }).catch(() => setRows([]));
  }, [tab]);
  useEffect(load, [load]);
  useEffect(() => {
    api.get('/question-bank/courses').then(r => setCourses(r.data)).catch(() => {});
    api.get('/packages').then(r => setPackages((r.data ?? []).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })))).catch(() => {});
  }, []);

  // Live count of questions each section can draw on
  useEffect(() => {
    if (!form?.randomised) return;
    const t = setTimeout(() => api.post('/mock-exams/availability', { sections: form.sections }).then(r => setAvail(r.data)).catch(() => {}), 300);
    return () => clearTimeout(t);
  }, [form?.randomised, form?.sections]);

  // Question picker for fixed papers
  useEffect(() => {
    if (!form || form.randomised) return;
    const q = new URLSearchParams({ status: 'LIVE', ...(pick.search ? { search: pick.search } : {}), ...(pick.courseId ? { courseId: pick.courseId } : {}) });
    const t = setTimeout(() => api.get(`/question-bank?${q}`).then(r => setPick(p => ({ ...p, rows: r.data.rows.map((x: { id: string; text: string; type: string; difficulty: string; status: string }) => ({ id: x.id, questionText: x.text, type: x.type, difficulty: x.difficulty, status: x.status })) }))).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [form?.randomised, pick.search, pick.courseId, form]);

  const put = (patch: Partial<Form>) => setForm(f => (f ? { ...f, ...patch } : f));
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter(x => x !== id) : [...list, id]);

  function newExam(kind: Kind) {
    const mine = courses.length === 1 ? [courses[0].id] : [];
    setForm({ kind, title: '', description: '', courseIds: mine, packageIds: [], timeMinutes: kind === 'PAST_PAPER' ? 90 : kind === 'CAT' ? 300 : 60, passMark: 50, attemptsAllowed: kind === 'PAST_PAPER' ? 0 : 3, showAnswers: true, randomised: kind !== 'PAST_PAPER', sections: [{ ...blankSection(mine), count: kind === 'CAT' ? 100 : 10 }], questions: [], examBody: '', year: '', session: '', paperNumber: '', catMin: 85, catMax: 150, catStandard: 0 });
  }

  async function open(id: string) {
    try {
      const { data: e } = await api.get(`/mock-exams/${id}`);
      setForm({
        id: e.id, status: e.status, kind: e.kind, title: e.title, description: e.description ?? '', courseIds: e.courseIds, packageIds: e.packageIds,
        timeMinutes: e.timeMinutes, passMark: e.passMark, attemptsAllowed: e.attemptsAllowed, showAnswers: e.showAnswers, randomised: e.randomised,
        sections: (e.sections ?? []).map((s: Section) => ({ ...blankSection(), ...s, moduleIds: s.moduleIds ?? [] })), questions: e.questions ?? [],
        examBody: e.examBody ?? '', year: e.year ? String(e.year) : '', session: e.session ?? '', paperNumber: e.paperNumber ?? '',
        catMin: e.catMin ?? 85, catMax: e.catMax ?? 150, catStandard: e.catStandard ?? 0,
      });
    } catch (x) { notify.error(err(x, 'Could not open it')); }
  }

  const payload = (f: Form) => ({
    kind: f.kind, title: f.title, description: f.description, courseIds: f.courseIds, packageIds: f.packageIds,
    timeMinutes: f.timeMinutes, passMark: f.passMark, attemptsAllowed: f.attemptsAllowed, showAnswers: f.showAnswers, randomised: f.randomised,
    sections: f.randomised ? f.sections : undefined, questionIds: f.randomised ? undefined : f.questions.map(q => q.id),
    examBody: f.examBody, year: f.year ? Number(f.year) : null, session: f.session, paperNumber: f.paperNumber,
    ...(f.kind === 'CAT' ? { catMin: f.catMin, catMax: f.catMax, catStandard: f.catStandard } : {}),
  });

  async function save(publish?: boolean) {
    if (!form) return;
    setSaving(true);
    try {
      const { data } = form.id ? await api.patch(`/mock-exams/${form.id}`, payload(form)) : await api.post('/mock-exams', payload(form));
      if (publish) await api.post(`/mock-exams/${data.id}/status`, { status: 'PUBLISHED' });
      notify.success(publish ? 'Published. Students can take it now.' : 'Saved');
      setForm(null); load();
    } catch (x) { notify.error(err(x, 'Could not save')); }
    finally { setSaving(false); }
  }

  async function act(fn: () => Promise<unknown>, done: string) {
    setSaving(true);
    try { await fn(); notify.success(done); setForm(null); load(); } catch (x) { notify.error(err(x, 'That didn’t work')); } finally { setSaving(false); }
  }

  const total = form ? (form.randomised ? form.sections.reduce((n, s) => n + (Number(s.count) || 0), 0) : form.questions.length) : 0;
  const kindName = (k: Kind) => (k === 'MOCK' ? 'mock exam' : k === 'CAT' ? 'CAT readiness exam' : 'past paper');

  async function calibrate() {
    setCalibrating(true);
    try { const { data } = await api.post('/mock-exams/calibrate'); notify.success(`Difficulty updated for ${data.updated} questions. ${data.waiting} more need ${data.minAnswers} answers first.`); }
    catch (x) { notify.error(err(x, 'Could not calibrate')); } finally { setCalibrating(false); }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-6">
        {role === 'TEACHER' && <TeacherBankHero page="mocks" onNew={() => newExam('MOCK')} />}
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-navy">Mock exams and past papers</h1>
            <p className="mt-1 text-sm text-ink2">Set a paper once. Students who bought the courses or packages you choose can sit it in the Test Centre.</p>
          </div>
          {role === 'ADMIN' && <button onClick={calibrate} disabled={calibrating} title="Sets each question’s difficulty for adaptive tests from how often students get it right" className="h-[38px] rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy disabled:opacity-50">{calibrating ? 'Calibrating…' : 'Calibrate difficulty'}</button>}
          <button onClick={() => newExam('CAT')} className="h-[38px] rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy">New CAT exam</button>
          <button onClick={() => newExam('PAST_PAPER')} className="h-[38px] rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy">Add past paper</button>
          <button onClick={() => newExam('MOCK')} className="h-[38px] rounded-md bg-[#3F6FE8] px-3.5 text-[13.5px] font-semibold text-white hover:bg-[#2F57C9]">New mock exam</button>
        </div>

        <div role="tablist" className="flex gap-1 self-start rounded-lg border border-line bg-white p-[3px] text-[13px]">
          {([['MOCK', 'Mock exams'], ['PAST_PAPER', 'Past papers'], ['CAT', 'CAT readiness'], ['MARK', `To mark${toMark ? ` (${toMark})` : ''}`]] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`rounded-md px-2.5 py-1 ${tab === k ? 'bg-[#EAF0FF] font-semibold text-navy' : 'text-ink2'}`}>{l}</button>
          ))}
        </div>

        {tab === 'MARK' ? (
          <section className="overflow-hidden rounded-[10px] border border-line bg-white">
            {queue === null && <p className="p-4 text-sm text-muted">Loading…</p>}
            {queue?.length === 0 && <div className="-m-px"><HelpfulEmpty title="Nothing to mark. Enjoy the quiet." body="Written answers from your mock exams land here as students finish." cta={{ label: 'Set a mock exam', onClick: () => { setTab('MOCK'); newExam('MOCK'); } }} preview={{ icon: '✎', title: 'Ama O.', line: '2 answers to mark' }} /></div>}
            {queue?.map(m => (
              <Link key={m.sessionId} href={`${base}/mark/${m.sessionId}`} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm last:border-0 hover:bg-subtle">
                <span><strong className="text-navy">{m.student}</strong><br /><span className="text-xs text-muted">{m.examTitle} · finished {new Date(m.submittedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span></span>
                <span className="font-semibold text-[#3F6FE8]">{m.toMark} to mark →</span>
              </Link>
            ))}
          </section>
        ) : (
          <section className="overflow-x-auto rounded-[10px] border border-line bg-white">
            <table className="w-full min-w-[720px] border-collapse text-[13.5px] text-navy">
              <thead><tr className="bg-subtle text-left text-ink2"><th className="px-4 py-2.5 font-semibold">{tab === 'MOCK' ? 'Exam' : 'Paper'}</th><th className="font-semibold">Questions</th><th className="font-semibold">Time</th><th className="font-semibold">Pass mark</th><th className="font-semibold">Taken</th><th className="pr-4 font-semibold">Status</th></tr></thead>
              <tbody>
                {rows === null && <tr><td colSpan={6} className="p-4 text-muted">Loading…</td></tr>}
                {rows?.length === 0 && <tr><td colSpan={6} className="p-4 text-muted">None yet. Use “{tab === 'MOCK' ? 'New mock exam' : 'Add past paper'}” to set one up.</td></tr>}
                {rows?.map(r => (
                  <tr key={r.id} onClick={() => open(r.id)} className="cursor-pointer border-t border-line hover:bg-subtle">
                    <td className="px-4 py-2.5"><strong>{r.title}</strong>{r.kind === 'PAST_PAPER' && <span className="block text-xs text-muted">{[r.examBody, r.year, r.session, r.paperNumber && `Paper ${r.paperNumber}`].filter(Boolean).join(' · ')}</span>}</td>
                    <td>{r.kind === 'CAT' ? `up to ${r.questionCount} · adaptive` : <>{r.questionCount}{r.randomised ? ' · random mix' : ''}</>}</td>
                    <td>{Math.round(r.timeLimitSecs / 60)} min</td>
                    <td>{r.passMark}%</td>
                    <td>{r.attempts}{r.toMark ? <span className="ml-1 text-[#3F6FE8]">· {r.toMark} to mark</span> : ''}</td>
                    <td className="pr-4 font-semibold">{r.status === 'PUBLISHED' ? 'Live' : 'Draft'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </div>

      {form && (
        <div role="dialog" aria-modal="true" aria-label={form.id ? 'Edit exam' : 'New exam'} className="fixed inset-0 z-50 flex justify-end bg-navy/40">
          <div className="flex h-full w-full max-w-[860px] flex-col bg-white">
            <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
              <strong className="flex-1 text-lg text-navy">{form.id ? `Edit ${kindName(form.kind)}` : form.kind === 'MOCK' ? 'New mock exam' : form.kind === 'CAT' ? 'New CAT readiness exam' : 'Add a past paper'}</strong>
              {form.status && <span className="rounded-md bg-subtle px-2 py-0.5 text-xs font-semibold text-ink2">{form.status === 'PUBLISHED' ? 'Live' : 'Draft'}</span>}
              <button aria-label="Close" onClick={() => setForm(null)} className="text-lg text-muted">✕</button>
            </div>
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={`${label} sm:col-span-2`}>Name<input className={field} value={form.title} onChange={e => put({ title: e.target.value })} placeholder={form.kind === 'MOCK' ? 'NCLEX-RN Mock 4' : 'Core Mathematics'} /></label>
                {form.kind === 'PAST_PAPER' && <>
                  <label className={label}>Exam body<input className={field} value={form.examBody} onChange={e => put({ examBody: e.target.value })} placeholder="WAEC, GCE Board, Cambridge…" /></label>
                  <label className={label}>Year<input className={field} inputMode="numeric" value={form.year} onChange={e => put({ year: e.target.value.replace(/\D/g, '').slice(0, 4) })} /></label>
                  <label className={label}>Session<input className={field} value={form.session} onChange={e => put({ session: e.target.value })} placeholder="May/June" /></label>
                  <label className={label}>Paper number<input className={field} value={form.paperNumber} onChange={e => put({ paperNumber: e.target.value })} placeholder="1" /></label>
                </>}
                <label className={`${label} sm:col-span-2`}>Note for students <span className="font-normal text-muted">(optional)</span><input className={field} value={form.description} onChange={e => put({ description: e.target.value })} /></label>
              </div>

              <div className="grid gap-3 sm:grid-cols-4">
                <label className={label}>Time limit (min)<input type="number" min={1} max={480} className={field} value={form.timeMinutes} onChange={e => put({ timeMinutes: Number(e.target.value) })} /></label>
                <label className={label}>Pass mark (%)<input type="number" min={1} max={100} className={field} value={form.passMark} onChange={e => put({ passMark: Number(e.target.value) })} /></label>
                <label className={label}>Attempts <span className="font-normal text-muted">0 = no limit</span><input type="number" min={0} max={50} className={field} value={form.attemptsAllowed} onChange={e => put({ attemptsAllowed: Number(e.target.value) })} /></label>
                <label className={label}>After submitting<select className={field} value={form.showAnswers ? 'yes' : 'no'} onChange={e => put({ showAnswers: e.target.value === 'yes' })}><option value="yes">Show the answers</option><option value="no">Only show the score</option></select></label>
              </div>

              <div className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Who can take it <span className="font-normal text-muted">· anyone who bought one of these</span></span>
                <div className="flex max-h-36 flex-wrap gap-1.5 overflow-y-auto">
                  {courses.map(c => { const on = form.courseIds.includes(c.id); return <button key={c.id} type="button" aria-pressed={on} onClick={() => put({ courseIds: toggle(form.courseIds, c.id) })} className={`rounded-md px-2.5 py-1 text-[12.5px] ${on ? 'border border-[#5889FA] bg-[#EAF0FF] font-semibold text-navy' : 'border border-line text-ink2'}`}>{c.title}</button>; })}
                  {packages.map(p => { const on = form.packageIds.includes(p.id); return <button key={p.id} type="button" aria-pressed={on} onClick={() => put({ packageIds: toggle(form.packageIds, p.id) })} className={`rounded-md px-2.5 py-1 text-[12.5px] ${on ? 'border border-[#5889FA] bg-[#EAF0FF] font-semibold text-navy' : 'border border-dashed border-line text-ink2'}`}>Package: {p.name}</button>; })}
                </div>
              </div>

              {form.kind === 'CAT' && (
                <div className="flex flex-col gap-2.5 rounded-lg border border-[#5889FA] p-3">
                  <p className="text-[13px] text-navy">Each answer sets the next question. The test stops once it’s 95% sure the student is above or below the passing standard (after the fewest questions), or at the most questions, or when time runs out. Only automatically marked questions are used.</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className={label}>Fewest questions<input type="number" min={5} className={field} value={form.catMin} onChange={e => put({ catMin: Number(e.target.value) })} /></label>
                    <label className={label}>Most questions<input type="number" min={5} max={300} className={field} value={form.catMax} onChange={e => put({ catMax: Number(e.target.value) })} /></label>
                    <label className={label}>Passing standard <span className="font-normal text-muted">0 = average question</span><input type="number" step={0.1} min={-3} max={3} className={field} value={form.catStandard} onChange={e => put({ catStandard: Number(e.target.value) })} /></label>
                  </div>
                  <p className="text-xs text-muted">NCLEX uses 85 to 150 questions in up to 5 hours. Below, each section is a content area and its number is its share of the test (for example 13 for “Management of care”). The bank needs several times more questions than the most questions.</p>
                </div>
              )}

              {form.kind === 'MOCK' && (
                <div role="tablist" className="flex gap-1 self-start rounded-lg border border-line p-[3px] text-[13px]">
                  {([[true, 'Random mix for each student'], [false, 'Fixed paper']] as const).map(([v, l]) => (
                    <button key={l} role="tab" aria-selected={form.randomised === v} onClick={() => put({ randomised: v })} className={`rounded-md px-2.5 py-1 ${form.randomised === v ? 'bg-[#EAF0FF] font-semibold text-navy' : 'text-ink2'}`}>{l}</button>
                  ))}
                </div>
              )}

              {form.randomised ? (
                <div className="flex flex-col gap-2.5">
                  {form.kind !== 'CAT' && <p className="rounded-lg bg-[#EAF0FF] px-3 py-2 text-[13px] text-navy">Every student gets a different mix that follows this plan, so answers can’t simply be shared. Leave easy, medium and hard at 0 for any mix.</p>}
                  {form.sections.map((s, i) => {
                    const up = (patch: Partial<Section>) => put({ sections: form.sections.map((x, n) => (n === i ? { ...x, ...patch } : x)) });
                    const a = avail[i];
                    const short = form.kind !== 'CAT' && a && (a.total < s.count || a.easy < s.easy || a.medium < s.medium || a.hard < s.hard);
                    const mods = courses.filter(c => s.courseIds.includes(c.id)).flatMap(c => c.modules.map(m => ({ ...m, course: c.title })));
                    return (
                      <div key={i} className="flex flex-col gap-2 rounded-lg border border-line p-3">
                        <div className={`grid gap-2 ${form.kind === 'CAT' ? 'sm:grid-cols-[1fr_110px_auto]' : 'sm:grid-cols-[1fr_repeat(4,90px)_auto]'}`}>
                          <label className={label}>{form.kind === 'CAT' ? 'Content area' : 'Section'}<input className={field} value={s.title} onChange={e => up({ title: e.target.value })} /></label>
                          <label className={label}>{form.kind === 'CAT' ? 'Share' : 'Questions'}<input type="number" min={1} className={field} value={s.count} onChange={e => up({ count: Number(e.target.value) })} /></label>
                          {form.kind !== 'CAT' && <>
                            <label className={label}>Easy<input type="number" min={0} className={field} value={s.easy} onChange={e => up({ easy: Number(e.target.value) })} /></label>
                            <label className={label}>Medium<input type="number" min={0} className={field} value={s.medium} onChange={e => up({ medium: Number(e.target.value) })} /></label>
                            <label className={label}>Hard<input type="number" min={0} className={field} value={s.hard} onChange={e => up({ hard: Number(e.target.value) })} /></label>
                          </>}
                          {form.sections.length > 1 && <button type="button" onClick={() => put({ sections: form.sections.filter((_, n) => n !== i) })} className="self-end pb-2 text-[13px] font-semibold text-[#C1352B]">Remove</button>}
                        </div>
                        <span className="text-xs font-semibold text-navy">Pull from</span>
                        <div className="flex flex-wrap gap-1.5">{courses.map(c => { const on = s.courseIds.includes(c.id); return <button key={c.id} type="button" aria-pressed={on} onClick={() => up({ courseIds: toggle(s.courseIds, c.id), moduleIds: [] })} className={`rounded-md px-2 py-0.5 text-[12px] ${on ? 'border border-[#5889FA] bg-[#EAF0FF] font-semibold text-navy' : 'border border-line text-ink2'}`}>{c.title}</button>; })}</div>
                        {mods.length > 0 && <>
                          <span className="text-xs font-semibold text-navy">Only these modules <span className="font-normal text-muted">(optional)</span></span>
                          <div className="flex max-h-24 flex-wrap gap-1.5 overflow-y-auto">{mods.map(m => { const on = s.moduleIds.includes(m.id); return <button key={m.id} type="button" aria-pressed={on} onClick={() => up({ moduleIds: toggle(s.moduleIds, m.id) })} className={`rounded-md px-2 py-0.5 text-[12px] ${on ? 'border border-[#5889FA] bg-[#EAF0FF] font-semibold text-navy' : 'border border-line text-ink2'}`}>{m.title}</button>; })}</div>
                        </>}
                        {a && <span className={`text-xs ${short ? 'font-semibold text-[#C1352B]' : 'text-muted'}`}>{a.total} live questions available · {a.easy} easy, {a.medium} medium, {a.hard} hard{short ? ' · not enough for this section' : ''}</span>}
                      </div>
                    );
                  })}
                  <button type="button" onClick={() => put({ sections: [...form.sections, { ...blankSection(form.courseIds), title: `Section ${form.sections.length + 1}` }] })} className="self-start text-[13px] font-semibold text-[#3F6FE8]">+ Add section</button>
                </div>
              ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <span className="text-[13px] font-semibold text-navy">The paper <span className="font-normal text-muted">· in this order</span></span>
                    {!form.questions.length && <p className="rounded-lg border border-dashed border-line p-3 text-[13px] text-muted">Add questions from the bank on the right. Write new ones in the Question bank first; they need to be live.</p>}
                    {form.questions.map((q, i) => (
                      <div key={q.id} className="flex items-start gap-2 rounded-lg border border-line px-2.5 py-2 text-[13px] text-navy">
                        <span className="w-6 flex-shrink-0 font-bold text-muted">{i + 1}</span>
                        <span className="min-w-0 flex-1"><span className="line-clamp-2">{q.questionText}</span><span className="text-xs text-muted">{TYPE[q.type] ?? q.type} · {q.difficulty.toLowerCase()}{q.status !== 'LIVE' ? ' · not live yet' : ''}</span></span>
                        <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => { const l = [...form.questions]; [l[i - 1], l[i]] = [l[i], l[i - 1]]; put({ questions: l }); }} className="text-muted disabled:opacity-30">↑</button>
                        <button type="button" aria-label="Remove" onClick={() => put({ questions: form.questions.filter(x => x.id !== q.id) })} className="text-[#C1352B]">✕</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex flex-col gap-2">
                    <span className="text-[13px] font-semibold text-navy">Add from the question bank</span>
                    <div className="flex gap-2">
                      <input aria-label="Search the bank" className={field} placeholder="Search…" value={pick.search} onChange={e => setPick(p => ({ ...p, search: e.target.value }))} />
                      <select aria-label="Course" className={`${field} max-w-[180px]`} value={pick.courseId} onChange={e => setPick(p => ({ ...p, courseId: e.target.value }))}><option value="">All courses</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select>
                    </div>
                    <div className="max-h-[360px] overflow-y-auto rounded-lg border border-line">
                      {pick.rows.filter(q => !form.questions.some(x => x.id === q.id)).map(q => (
                        <button key={q.id} type="button" onClick={() => put({ questions: [...form.questions, q] })} className="flex w-full items-start gap-2 border-b border-line px-2.5 py-2 text-left text-[13px] text-navy last:border-0 hover:bg-subtle">
                          <span className="font-bold text-[#3F6FE8]">+</span><span className="min-w-0 flex-1"><span className="line-clamp-2">{q.questionText}</span><span className="text-xs text-muted">{TYPE[q.type] ?? q.type} · {q.difficulty.toLowerCase()}</span></span>
                        </button>
                      ))}
                      {!pick.rows.length && <p className="p-3 text-[13px] text-muted">No live questions match.</p>}
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">
              <span className="mr-auto text-[13px] text-ink2">{form.kind === 'CAT' ? `${form.catMin} to ${form.catMax} questions, adaptive` : `${total} questions`} · {form.timeMinutes} min{form.id ? '' : ' · saved as a draft until you publish'}</span>
              {form.id && <button disabled={saving} onClick={() => { if (window.confirm('Delete this? If students have taken it, it’s archived instead so their results stay.')) act(() => api.delete(`/mock-exams/${form.id}`), 'Removed'); }} className="text-[13px] font-semibold text-[#C1352B]">Delete</button>}
              {form.status === 'PUBLISHED' && <button disabled={saving} onClick={() => act(() => api.post(`/mock-exams/${form.id}/status`, { status: 'DRAFT' }), 'Taken down. Students can’t start it now.')} className="h-9 rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy">Take down</button>}
              <button disabled={saving} onClick={() => save()} className="h-9 rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy disabled:opacity-50">{form.status === 'PUBLISHED' ? 'Save changes' : 'Save draft'}</button>
              {form.status !== 'PUBLISHED' && <button disabled={saving} onClick={() => save(true)} className="h-9 rounded-md bg-[#3F6FE8] px-3.5 text-[13.5px] font-semibold text-white disabled:opacity-50">Publish</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
