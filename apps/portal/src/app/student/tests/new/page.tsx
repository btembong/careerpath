'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Lesson { id: string; title: string; count: number }
interface Mod { id: string; title: string; count: number; lessons: Lesson[] }
interface Course { id: string; title: string; programmeId: string | null; subjectId: string | null; count: number; modules: Mod[] }
interface Catalog {
  total: number; pools: Record<string, number>; typeCount: Record<string, number>; difficultyCount: Record<string, number>;
  programmes: { id: string; name: string }[]; subjects: { id: string; name: string }[];
  packages: { id: string; name: string; courseIds: string[] }[]; courses: Course[];
}
type Mode = 'PRACTICE' | 'EXAM';

const POOLS: [string, string][] = [['all', 'All'], ['unused', 'Unused'], ['wrong', 'Got wrong'], ['learning', 'Still learning'], ['mastered', 'Mastered'], ['flagged', 'Flagged']];
const TYPES: [string, string][] = [['MCQ', 'MCQ'], ['STRUCTURED', 'Structured'], ['TRUE_FALSE', 'True / false'], ['FILL_BLANK', 'Fill the blank'], ['SHORT_ANSWER', 'Short answer'], ['WRITTEN', 'Essay']];
const LEVELS: [string, string][] = [['EASY', 'Easy'], ['MEDIUM', 'Medium'], ['HARD', 'Hard']];
const select = 'h-[38px] rounded-lg border border-line bg-white px-2.5 text-[13.5px] text-navy outline-none focus:border-[#5889FA]';

function Chip({ on, onClick, children, disabled }: { on: boolean; onClick: () => void; children: React.ReactNode; disabled?: boolean }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={on}
      className={`inline-flex h-7 items-center rounded-md px-2.5 text-[12.5px] transition disabled:opacity-40 ${on ? 'border border-[#5889FA] bg-[#EAF0FF] font-semibold text-navy' : 'border border-line text-ink2 hover:border-[#5889FA]'}`}>
      {children}
    </button>
  );
}

function Box({ on, partial }: { on: boolean; partial?: boolean }) {
  return <span className={`flex h-4 w-4 flex-shrink-0 items-center justify-center rounded text-[11px] text-white ${on || partial ? 'bg-[#3F6FE8]' : 'border border-[#C9D3E6]'}`}>{on ? '✓' : partial ? '–' : ''}</span>;
}

interface ExamSource { id: string; title: string; meta: string; count: number }

export default function CreateTestPage() {
  const router = useRouter();
  const [cat, setCat] = useState<Catalog | null>(null);
  const [source, setSource] = useState<'courses' | 'packages' | 'papers' | 'mocks'>('courses');
  // Past papers you can take and mocks you've finished
  const [sources, setSources] = useState<{ papers: ExamSource[]; mocks: ExamSource[] } | null>(null);
  const [examIds, setExamIds] = useState<string[]>([]);
  const [programmeId, setProgrammeId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [scope, setScope] = useState<'module' | 'lesson'>('module');
  const [courseIds, setCourseIds] = useState<string[]>([]);
  const [moduleIds, setModuleIds] = useState<string[]>([]);
  const [lessonIds, setLessonIds] = useState<string[]>([]);
  const [open, setOpen] = useState<string[]>([]);
  const [pool, setPool] = useState('all');
  const [levels, setLevels] = useState<string[]>([]);
  const [types, setTypes] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>('PRACTICE');
  const [count, setCount] = useState(20);
  const [minutes, setMinutes] = useState('');
  const [title, setTitle] = useState('');
  const [matched, setMatched] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => { api.get('/test-centre/catalog').then(r => setCat(r.data)).catch(() => notify.error('Could not load your courses')); }, []);
  useEffect(() => { api.get('/test-centre/draw-sources').then(r => setSources(r.data)).catch(() => setSources({ papers: [], mocks: [] })); }, []);
  const fromExams = source === 'papers' || source === 'mocks';
  const examList = source === 'papers' ? sources?.papers ?? [] : source === 'mocks' ? sources?.mocks ?? [] : [];

  const pkg = cat?.packages.find(p => p.id === packageId);
  const shown = useMemo(() => (cat?.courses ?? []).filter(c => c.count > 0
    && (!programmeId || c.programmeId === programmeId) && (!subjectId || c.subjectId === subjectId)
    && (source !== 'packages' || (pkg ? pkg.courseIds.includes(c.id) : (cat?.packages ?? []).some(p => p.courseIds.includes(c.id))))), [cat, programmeId, subjectId, source, pkg]);

  const filters = useMemo(() => fromExams ? {
    // Nothing ticked means all of them
    examIds: examIds.length ? examIds : examList.map(e => e.id),
    pool, difficulty: levels.length ? levels : undefined, types: types.length ? types : undefined,
  } : ({
    programmeId: programmeId || undefined, subjectId: subjectId || undefined,
    packageIds: source === 'packages' ? (packageId ? [packageId] : cat?.packages.map(p => p.id)) : undefined,
    courseIds: courseIds.length ? courseIds : undefined, moduleIds: moduleIds.length ? moduleIds : undefined, lessonIds: lessonIds.length ? lessonIds : undefined,
    pool, difficulty: levels.length ? levels : undefined, types: types.length ? types : undefined,
  }), [fromExams, examIds, examList, programmeId, subjectId, source, packageId, cat, courseIds, moduleIds, lessonIds, pool, levels, types]);

  useEffect(() => {
    if (!cat) return;
    if (fromExams && !examList.length) { setMatched(0); return; }
    const t = setTimeout(() => { api.post('/test-centre/match', filters).then(r => setMatched(r.data.count)).catch(() => setMatched(null)); }, 250);
    return () => clearTimeout(t);
  }, [filters, cat]);

  const toggle = (list: string[], set: (v: string[]) => void, id: string) => set(list.includes(id) ? list.filter(x => x !== id) : [...list, id]);
  const use = Math.min(count, matched ?? count);
  const estimate = Math.max(Math.ceil(use * 1.5), 1);

  function toggleCourse(c: Course) {
    const on = courseIds.includes(c.id);
    setCourseIds(on ? courseIds.filter(x => x !== c.id) : [...courseIds, c.id]);
    // The whole course replaces picks inside it
    setModuleIds(moduleIds.filter(m => !c.modules.some(x => x.id === m)));
    setLessonIds(lessonIds.filter(l => !c.modules.some(m => m.lessons.some(x => x.id === l))));
  }
  function pickPart(c: Course, list: string[], set: (v: string[]) => void, id: string) {
    setCourseIds(courseIds.filter(x => x !== c.id));
    toggle(list, set, id);
  }

  async function start(preset?: 'surprise') {
    setStarting(true);
    try {
      const { data } = await api.post('/test-centre/sessions', preset ? { preset, mode } : {
        ...filters, mode, count, title: title.trim() || undefined,
        timeMinutes: minutes ? Number(minutes) : undefined,
      });
      router.push(`/student/tests/${data.id}`);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Could not start the test');
      setStarting(false);
    }
  }

  if (cat && cat.total === 0) return (
    <div className="flex min-h-full flex-col"><Topbar backHref="/student/tests" backLabel="Test Centre" />
      <div className="m-4 rounded-lg border border-line bg-white p-5 text-sm text-ink2 lg:m-7"><strong className="block text-navy">No questions yet</strong>Buying or joining a course unlocks its questions here. <Link href="/student/catalogue" className="font-semibold text-[#3F6FE8]">Browse the catalogue</Link></div>
    </div>
  );

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/student/tests" backLabel="Test Centre" />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-navy">Create a test</h1>
          <p className="mt-1 text-sm text-ink2">Pick what to cover, then how you want to be tested.</p>
        </div>

        <div className="grid items-start gap-4 xl:grid-cols-[1fr_340px]">
          <section className="flex min-w-0 flex-col gap-3.5 rounded-[10px] border border-line bg-white p-[18px]">
            <h2 className="text-[15px] font-bold text-navy">1. What to cover</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] font-semibold text-navy">Draw from</span>
              <div role="tablist" className="flex flex-wrap gap-1 rounded-lg border border-line p-[3px] text-[13px]">
                {([['courses', 'My courses'], ['packages', 'Packages'], ['papers', 'Past papers'], ['mocks', 'Mock exams']] as const).map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={source === k} onClick={() => { setSource(k); setPackageId(''); setExamIds([]); }} className={`rounded-md px-2.5 py-1 ${source === k ? 'bg-[#EAF0FF] font-semibold text-navy' : 'text-ink2'}`}>{l}</button>
                ))}
              </div>
              <span className="flex-1" />
              <button type="button" onClick={() => start('surprise')} disabled={starting} className="inline-flex h-8 items-center rounded-md border border-[#5889FA] px-3 text-[13px] font-semibold text-[#3F6FE8] hover:bg-[#EAF0FF]">Pick at random for me</button>
            </div>

            {fromExams ? (
              <div className="flex flex-col gap-2.5">
                <p className="text-[13px] text-ink2">{source === 'papers' ? 'Past papers you can take. Tick one or more; tick none to use them all.' : 'Mock exams you’ve finished: practise their questions again. Mocks you haven’t sat yet aren’t here, so practice can’t give them away.'}</p>
                {!sources && <p className="text-sm text-muted">Loading…</p>}
                {sources && !examList.length && (
                  <p className="rounded-lg bg-subtle px-4 py-3 text-[13.5px] text-ink2">{source === 'papers' ? 'No past papers for your courses yet. They appear as your teachers add them.' : 'Finish a mock exam and its questions show up here to practise.'} <Link href={source === 'papers' ? '/student/tests/papers' : '/student/tests/mocks'} className="font-semibold text-[#3F6FE8]">{source === 'papers' ? 'See past papers' : 'See mock exams'}</Link></p>
                )}
                <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                  {examList.map(e => {
                    const on = examIds.includes(e.id);
                    return (
                      <label key={e.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-3.5 py-3 ${on ? 'border-2 border-[#3F6FE8] bg-[#F5F8FF]' : 'border border-line bg-white'}`}>
                        <input type="checkbox" checked={on} onChange={() => toggle(examIds, setExamIds, e.id)} className="mt-0.5 h-[18px] w-[18px] accent-[#3F6FE8]" />
                        <span className="flex min-w-0 flex-col gap-0.5"><strong className="text-sm text-navy">{e.title}</strong><span className="text-[12.5px] text-muted">{[e.meta, `${e.count} questions`].filter(Boolean).join(' · ')}</span></span>
                      </label>
                    );
                  })}
                </div>
              </div>
            ) : (<>
            <div className="grid gap-2.5 sm:grid-cols-3">
              <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Programme
                <select className={select} value={programmeId} onChange={e => setProgrammeId(e.target.value)}><option value="">All programmes</option>{cat?.programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Subject
                <select className={select} value={subjectId} onChange={e => setSubjectId(e.target.value)}><option value="">All subjects</option>{cat?.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
              {source === 'packages' ? (
                <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Package
                  <select className={select} value={packageId} onChange={e => setPackageId(e.target.value)}><option value="">All my packages</option>{cat?.packages.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              ) : <div />}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[13px] font-semibold text-navy">Choose by</span>
              <div role="tablist" className="flex gap-1 rounded-lg border border-line p-[3px] text-[13px]">
                {([['module', 'Module'], ['lesson', 'Lesson']] as const).map(([k, l]) => (
                  <button key={k} role="tab" aria-selected={scope === k} onClick={() => setScope(k)} className={`rounded-md px-2.5 py-1 ${scope === k ? 'bg-[#EAF0FF] font-semibold text-navy' : 'text-ink2'}`}>{l}</button>
                ))}
              </div>
              <span className="text-xs text-muted">Pick nothing to use everything below.</span>
            </div>

            <div className="max-h-[380px] overflow-y-auto rounded-lg border border-line">
              {!cat && <p className="p-4 text-sm text-muted">Loading…</p>}
              {cat && !shown.length && <p className="p-4 text-sm text-muted">No courses match these filters.</p>}
              {shown.map(c => {
                const on = courseIds.includes(c.id);
                const some = c.modules.some(m => moduleIds.includes(m.id) || m.lessons.some(l => lessonIds.includes(l.id)));
                const expanded = open.includes(c.id);
                return (
                  <div key={c.id} className="border-b border-line last:border-0">
                    <div className="flex items-center gap-2.5 px-3 py-2 text-[13.5px] font-bold text-navy">
                      <button type="button" aria-pressed={on} aria-label={`Use all of ${c.title}`} onClick={() => toggleCourse(c)}><Box on={on} partial={some} /></button>
                      <button type="button" onClick={() => toggle(open, setOpen, c.id)} className="flex min-w-0 flex-1 items-center justify-between gap-2 text-left">
                        <span className="truncate">{c.title}</span><span className="flex-shrink-0 text-[12.5px] font-normal text-muted">{c.count} {c.modules.length > 0 && (expanded ? '▴' : '▾')}</span>
                      </button>
                    </div>
                    {expanded && c.modules.map(m => (
                      <div key={m.id}>
                        <div className="flex items-center gap-2.5 py-1.5 pl-8 pr-3 text-[13.5px] text-navy">
                          {scope === 'module' ? <button type="button" aria-pressed={moduleIds.includes(m.id)} aria-label={`Use ${m.title}`} onClick={() => pickPart(c, moduleIds, setModuleIds, m.id)}><Box on={moduleIds.includes(m.id) || on} /></button> : <span className="w-4" />}
                          <span className={`flex-1 truncate ${scope === 'lesson' ? 'font-semibold' : ''}`}>{m.title}</span><span className="text-[12.5px] text-muted">{m.count}</span>
                        </div>
                        {scope === 'lesson' && m.lessons.map(l => (
                          <div key={l.id} className="flex items-center gap-2.5 py-1.5 pl-14 pr-3 text-[13px] text-ink2">
                            <button type="button" aria-pressed={lessonIds.includes(l.id)} aria-label={`Use ${l.title}`} onClick={() => pickPart(c, lessonIds, setLessonIds, l.id)}><Box on={lessonIds.includes(l.id) || on} /></button>
                            <span className="flex-1 truncate">{l.title}</span><span className="text-[12.5px] text-muted">{l.count}</span>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            </>)}

            <div className="grid gap-3 md:grid-cols-2">
              <div className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Question pool</span>
                <div className="flex flex-wrap gap-1.5">{POOLS.map(([k, l]) => <Chip key={k} on={pool === k} onClick={() => setPool(k)}>{l}{k !== 'all' && cat ? ` ${cat.pools[k] ?? 0}` : ''}</Chip>)}</div></div>
              <div className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Difficulty</span>
                <div className="flex flex-wrap gap-1.5"><Chip on={!levels.length} onClick={() => setLevels([])}>Mixed</Chip>{LEVELS.map(([k, l]) => <Chip key={k} on={levels.includes(k)} disabled={!cat?.difficultyCount[k]} onClick={() => toggle(levels, setLevels, k)}>{l}</Chip>)}</div></div>
              <div className="flex flex-col gap-1.5 md:col-span-2"><span className="text-[13px] font-semibold text-navy">Question types</span>
                <div className="flex flex-wrap gap-1.5"><Chip on={!types.length} onClick={() => setTypes([])}>All</Chip>{TYPES.map(([k, l]) => <Chip key={k} on={types.includes(k)} disabled={!cat?.typeCount[k]} onClick={() => toggle(types, setTypes, k)}>{l}</Chip>)}</div></div>
            </div>
          </section>

          <section className="flex flex-col gap-3 rounded-[10px] border border-line bg-white p-[18px] xl:sticky xl:top-4">
            <h2 className="text-[15px] font-bold text-navy">2. How to test</h2>
            {([['PRACTICE', 'Practice (tutor)', 'See the answer and why after each question. No clock unless you want one.'], ['EXAM', 'Exam', 'Timed. Move freely, flag and return. Score only at the end.']] as [Mode, string, string][]).map(([k, t, d]) => (
              <button key={k} type="button" onClick={() => setMode(k)} aria-pressed={mode === k} className={`flex flex-col gap-0.5 rounded-lg p-3 text-left ${mode === k ? 'border border-[#5889FA] bg-[#EAF0FF]' : 'border border-line'}`}>
                <strong className="text-sm text-navy">{t}</strong><span className="text-[12.5px] text-ink2">{d}</span>
              </button>
            ))}
            <div className="flex flex-col gap-1.5 text-[13px] font-semibold text-navy">Number of questions
              <div className="flex items-center gap-2.5">
                <input aria-label="Number of questions" type="number" min={1} max={150} value={count} onChange={e => setCount(Math.min(150, Math.max(1, Number(e.target.value) || 1)))} className="h-9 w-16 rounded-lg border border-line text-center font-normal outline-none focus:border-[#5889FA]" />
                <input aria-label="Number of questions slider" type="range" min={1} max={150} value={count} onChange={e => setCount(Number(e.target.value))} className="flex-1 accent-[#3F6FE8]" />
              </div>
              <span className="text-xs font-normal text-muted">Up to 150. About {estimate} minutes.</span>
            </div>
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Time limit
              <select className={select} value={minutes} onChange={e => setMinutes(e.target.value)}>
                <option value="">{mode === 'EXAM' ? `Standard: ${estimate} minutes` : 'No time limit'}</option>
                {[10, 15, 30, 45, 60, 90, 120, 180].map(m => <option key={m} value={m}>{m} minutes</option>)}
              </select></label>
            <label className="flex flex-col gap-1 text-[13px] font-semibold text-navy">Name <span className="font-normal text-muted">(optional)</span>
              <input value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder={mode === 'EXAM' ? 'Exam' : 'Practice'} className={`${select} font-normal`} /></label>
            <div className="rounded-lg bg-[#EAF0FF] px-3 py-2.5 text-[13px] text-navy">
              {matched === 0 ? <strong>No questions match. Try fewer filters.</strong> : <><strong>{matched ?? '…'} questions match.</strong> We pick {use} at random, so no two tests are the same.</>}
            </div>
            <button type="button" onClick={() => start()} disabled={starting || !matched} className="h-[42px] rounded-md bg-[#3F6FE8] text-sm font-semibold text-white hover:bg-[#2F57C9] disabled:opacity-50">
              {starting ? 'Starting…' : mode === 'EXAM' ? 'Start exam' : 'Start practice'}
            </button>
          </section>
        </div>
      </div>
    </div>
  );
}
