'use client';
import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Suggestion { id: string; name: string; confidence: 'high' | 'medium'; why: string }
interface Row {
  id: string; title: string; status: string; teacher: string | null; students: number; modules: number; hint: string; placeholder: boolean;
  current: { exam: { id: string; name: string } | null; subject: { id: string; name: string } | null };
  exam: Suggestion | null; subject: Suggestion | null;
}
interface Data { programmes: { id: string; name: string; full: string }[]; subjects: { id: string; name: string }[]; courses: Row[]; stats: { total: number; withExam: number; withSubject: number; placeholders: number } }
type Tab = 'title' | 'maybe' | 'none' | 'placeholder';
interface Choice { exam: string; subject: string; on: boolean }

const tabOf = (r: Row): Tab => r.placeholder ? 'placeholder'
  : (r.exam?.confidence === 'high' || r.subject?.confidence === 'high') ? 'title'
  : (r.exam || r.subject) ? 'maybe' : 'none';

/** Courses without an exam or subject: a suggestion for each from its title, description and modules, applied in one go */
export default function ClassifyCoursesPage() {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState<Tab>('title');
  const [choice, setChoice] = useState<Record<string, Choice>>({});
  const [saving, setSaving] = useState(false);

  async function load() {
    const r = await api.get('/admin/course-classify');
    const data: Data = r.data;
    setD(data);
    // The suggestion is already chosen; ticked when it comes from the title
    setChoice(Object.fromEntries(data.courses.map(c => [c.id, {
      exam: c.current.exam?.id ?? c.exam?.id ?? '', subject: c.current.subject?.id ?? c.subject?.id ?? '',
      on: tabOf(c) === 'title',
    }])));
  }
  useEffect(() => { load().catch(() => notify.error('Could not load the courses')); }, []);

  const rows = useMemo(() => (d?.courses ?? []).filter(c => tabOf(c) === tab), [d, tab]);
  const counts = useMemo(() => {
    const m: Record<Tab, number> = { title: 0, maybe: 0, none: 0, placeholder: 0 };
    (d?.courses ?? []).forEach(c => { m[tabOf(c)]++; });
    return m;
  }, [d]);
  const picked = Object.entries(choice).filter(([id, c]) => {
    const row = d?.courses.find(r => r.id === id);
    return c.on && row && ((c.exam && c.exam !== row.current.exam?.id) || (c.subject && c.subject !== row.current.subject?.id));
  });
  const set = (id: string, p: Partial<Choice>) => setChoice(m => ({ ...m, [id]: { ...m[id], ...p, on: p.on ?? true } }));
  const allOn = rows.length > 0 && rows.every(r => choice[r.id]?.on);

  async function apply() {
    setSaving(true);
    try {
      const items = picked.map(([courseId, c]) => ({ courseId, programmeId: c.exam || null, subjectId: c.subject || null }));
      const r = await api.post('/admin/course-classify', { items });
      notify.success(`${r.data.updated} course${r.data.updated === 1 ? '' : 's'} updated`, { description: 'They now show under their exam and subject in the catalogue.' });
      await load();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); }
    finally { setSaving(false); }
  }

  const TABS: [Tab, string, string][] = [
    ['title', 'From the title', 'The title names the exam or subject. Ticked for you: check and apply.'],
    ['maybe', 'Maybe', 'Guessed from the description or modules. Check each one before ticking it.'],
    ['none', 'No suggestion', 'Nothing in the course says which exam or subject it is. Choose them, or leave them.'],
    ['placeholder', 'Placeholder titles', 'Titled just “Cameroon” or “New Course”, usually from WordPress. Open them to see what they are, or hide them from the catalogue in Course management.'],
  ];
  const select = 'h-9 w-full rounded-md border border-line bg-white pl-2 pr-7 text-[13px] text-navy outline-none focus:border-azure';

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Exam and subject" subtitle="So students find each course under its exam and subject in the catalogue" backHref="/admin/courses/manage" backLabel="Course management" />
      <div className="flex flex-col gap-4 p-4 pb-28 lg:px-7 lg:py-6 lg:pb-28">
        {!d ? <div className="h-40 animate-pulse rounded-lg border border-line bg-white" /> : <>
          <section className="rounded-lg border border-azure bg-white px-[18px] py-4">
            <p className="text-base font-extrabold text-navy">{d.stats.total} course{d.stats.total === 1 ? '' : 's'} without an exam or subject</p>
            <p className="mt-0.5 text-[13px] text-ink2">We suggested an exam for {d.stats.withExam} and a subject for {d.stats.withSubject}, from their titles, descriptions and modules. Each dropdown has the suggestion chosen: change any you disagree with, tick the courses, then apply.</p>
          </section>

          <div role="tablist" aria-label="Suggestions" className="flex flex-wrap gap-1 self-start rounded-lg border border-line bg-white p-1">
            {TABS.map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={clsx('h-8 rounded-md px-3 text-[13px]', tab === k ? 'bg-accent-soft font-semibold text-navy' : 'font-medium text-ink2 hover:text-navy')}>
                {l} <span className="text-muted">{counts[k]}</span>
              </button>
            ))}
          </div>
          <p className="-mt-1 text-[13px] text-ink2">{TABS.find(t => t[0] === tab)?.[2]}</p>

          <section className="overflow-x-auto rounded-lg border border-line bg-white">
            {!rows.length ? <p className="px-4 py-10 text-center text-[13px] text-ink2">Nothing here.</p> : (
              <table className="w-full min-w-[860px] text-[13.5px]">
                <thead><tr className="border-b border-line text-left text-[11.5px] uppercase tracking-[0.06em] text-muted">
                  <th className="w-10 px-3 py-2.5"><input type="checkbox" aria-label="Tick all" checked={allOn} onChange={e => rows.forEach(r => set(r.id, { on: e.target.checked }))} /></th>
                  <th className="px-3 py-2.5 font-semibold">Course</th>
                  <th className="w-[230px] px-3 py-2.5 font-semibold">Exam</th>
                  <th className="w-[230px] px-3 py-2.5 font-semibold">Subject</th>
                </tr></thead>
                <tbody>
                  {rows.map(r => {
                    const c = choice[r.id] ?? { exam: '', subject: '', on: false };
                    const tag = (s: Suggestion | null, has: boolean) => has ? <span className="text-[11px] text-muted">Already set</span>
                      : s ? <span className={clsx('text-[11px] font-semibold', s.confidence === 'high' ? 'text-[#1A7F4B]' : 'text-[#8A5A0B]')}>{s.confidence === 'high' ? 'From the title' : 'Maybe, from ' + s.why}</span>
                      : <span className="text-[11px] text-muted">No suggestion</span>;
                    return (
                      <tr key={r.id} className={clsx('border-t border-line align-top', c.on && 'bg-accent-soft/40')}>
                        <td className="px-3 py-3"><input type="checkbox" aria-label={`Tick ${r.title}`} checked={c.on} onChange={e => set(r.id, { on: e.target.checked })} /></td>
                        <td className="px-3 py-3">
                          <a href={`/admin/courses/${r.id}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-navy hover:underline">{r.title}</a>
                          <p className="text-xs text-muted">{[r.teacher, `${r.modules} module${r.modules === 1 ? '' : 's'}`, r.students ? `${r.students} student${r.students === 1 ? '' : 's'}` : null, r.status === 'PUBLISHED' ? null : r.status.toLowerCase().replace('_', ' ')].filter(Boolean).join(' · ')}</p>
                          {r.hint.replace(/[·\s]/g, '') && <p className="mt-1 line-clamp-2 max-w-[520px] text-xs text-ink2">{r.hint}</p>}
                        </td>
                        <td className="px-3 py-3">
                          <select aria-label="Exam" value={c.exam} disabled={!!r.current.exam} onChange={e => set(r.id, { exam: e.target.value })} className={select}>
                            <option value="">No exam</option>
                            {d.programmes.map(p => <option key={p.id} value={p.id} title={p.full}>{p.name}</option>)}
                          </select>
                          <div className="mt-1">{tag(r.exam, !!r.current.exam)}</div>
                        </td>
                        <td className="px-3 py-3">
                          <select aria-label="Subject" value={c.subject} disabled={!!r.current.subject} onChange={e => set(r.id, { subject: e.target.value })} className={select}>
                            <option value="">No subject</option>
                            {d.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                          <div className="mt-1">{tag(r.subject, !!r.current.subject)}</div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>
        </>}
      </div>

      {d && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:left-[248px]" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom, 0px))' }}>
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-[13.5px] text-ink2"><b className="text-navy">{picked.length}</b> course{picked.length === 1 ? '' : 's'} ticked, across all tabs</p>
            <Button className="ml-auto" loading={saving} disabled={!picked.length} onClick={apply}>Apply to {picked.length} course{picked.length === 1 ? '' : 's'}</Button>
          </div>
        </div>
      )}
    </div>
  );
}
