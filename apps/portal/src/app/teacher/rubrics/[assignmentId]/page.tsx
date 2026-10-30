'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Level { points: number; label: string }
interface Criterion { id?: string; title: string; weight: number; descriptors: Level[] }
interface Template { key: string; name: string; hint: string; criteria: { title: string; share: number; levels: string[] }[] }
interface Data {
  assignment: { id: string; title: string; maxPoints: number; cohort: { id: string; name: string } };
  rubric: { id: string; total: number; criteria: Criterion[] } | null;
  gradedWithIt: number;
  templates: Template[];
}

const HEADERS: Record<number, string[]> = {
  2: ['Not shown', 'Shown'], 3: ['Not shown', 'Partly', 'Fully'], 4: ['Not shown', 'Partly', 'Mostly', 'Fully'],
  5: ['Not shown', 'Weak', 'Partly', 'Mostly', 'Fully'], 6: ['Not shown', 'Weak', 'Partly', 'Good', 'Mostly', 'Fully'],
};
const spread = (weight: number, n: number) => Array.from({ length: n }, (_, j) => Math.round((weight * j) / (n - 1)));
const th = 'border-b border-line px-2.5 py-[9px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted';
const td = 'border-b border-line p-2.5 align-top';
const cellInput = 'w-full rounded border border-transparent bg-transparent px-1 py-0.5 text-navy outline-none hover:border-line focus:border-azure';

export default function RubricPage() {
  const { assignmentId } = useParams<{ assignmentId: string }>();
  const [d, setD] = useState<Data | null>(null);
  const [rows, setRows] = useState<Criterion[]>([]);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    api.get(`/rubrics/${assignmentId}`).then(r => {
      setD(r.data);
      setRows(r.data.rubric?.criteria ?? []);
      if (!r.data.rubric) setPicking(true);
    }).catch(e => notify.error(e?.response?.data?.message ?? 'Could not load the rubric'));
  }, [assignmentId]);

  const levels = Math.max(2, ...rows.map(r => r.descriptors.length), rows.length ? 0 : 4);
  const total = rows.reduce((n, r) => n + (Number(r.weight) || 0), 0);
  const edit = (i: number, patch: Partial<Criterion>) => { setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r)); setDirty(true); };
  const editLevel = (i: number, k: number, patch: Partial<Level>) => edit(i, { descriptors: rows[i].descriptors.map((l, j) => j === k ? { ...l, ...patch } : l) });

  function setWeight(i: number, w: number) {
    const old = rows[i];
    const scaled = old.descriptors.map(l => ({ ...l, points: old.weight ? Math.round((l.points / old.weight) * w) : 0 }));
    scaled[scaled.length - 1].points = w;
    edit(i, { weight: w, descriptors: scaled });
  }
  function setLevelCount(n: number) {
    setRows(rs => rs.map(r => {
      const pts = spread(r.weight, n);
      return { ...r, descriptors: pts.map((p, j) => ({ points: p, label: r.descriptors[Math.round((j * (r.descriptors.length - 1)) / (n - 1))]?.label ?? '' })) };
    }));
    setDirty(true);
  }
  function addCriterion() {
    const w = Math.max(1, Math.round((d?.assignment.maxPoints ?? 10) / Math.max(1, rows.length + 1)));
    setRows([...rows, { title: '', weight: w, descriptors: spread(w, levels).map(p => ({ points: p, label: '' })) }]);
    setDirty(true);
  }
  function applyTemplate(t: Template) {
    const max = d?.assignment.maxPoints ?? 20;
    const weights = t.criteria.map(c => Math.max(1, Math.round(c.share * max)));
    weights[weights.length - 1] += max - weights.reduce((a, b) => a + b, 0);
    setRows(t.criteria.map((c, i) => ({ title: c.title, weight: Math.max(1, weights[i]), descriptors: spread(Math.max(1, weights[i]), c.levels.length).map((p, j) => ({ points: p, label: c.levels[j] })) })));
    setPicking(false); setDirty(true);
  }

  async function save() {
    if (!rows.length) { notify.error('Add at least one criterion'); return; }
    setSaving(true);
    try {
      const r = await api.put(`/rubrics/${assignmentId}`, { criteria: rows });
      setD(r.data); setRows(r.data.rubric?.criteria ?? []); setDirty(false);
      notify.success('Rubric saved', { description: 'Use it when grading in the Grading queue.' });
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); } finally { setSaving(false); }
  }

  const matches = d && total === d.assignment.maxPoints;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Rubric" subtitle="How marks are given for this assignment" backHref="/teacher/assignments" backLabel="Assignments" />
      <div className="flex flex-col gap-3.5 p-4 lg:px-7 lg:py-[22px]">
        {!d ? <div className="h-72 rounded-lg bg-subtle animate-pulse" /> : (
          <section className="rounded-lg border border-line bg-white p-[18px]">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-base font-bold text-navy">{d.assignment.title} · rubric</h2>
              <span className="text-[13px] text-muted">
                Total {total} marks · {matches ? 'matches the assignment' : `the assignment is out of ${d.assignment.maxPoints}, so grades are scaled`}
              </span>
            </div>
            {!rows.length ? (
              <p className="py-8 text-center text-[13.5px] text-ink2">No criteria yet. Start from a template or add your own.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-[13px]">
                  <thead><tr>
                    <th className={th}>Criterion</th>
                    {HEADERS[levels].map(h => <th key={h} className={th}>{h}</th>)}
                    <th className={th} aria-label="Remove" />
                  </tr></thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={r.id ?? `new-${i}`}>
                        <td className={clsx(td, 'w-[200px] font-semibold')}>
                          <input value={r.title} onChange={e => edit(i, { title: e.target.value })} placeholder="Correct method" className={clsx(cellInput, 'font-semibold')} />
                          <span className="flex items-center gap-1 px-1 font-normal text-muted">
                            <input type="number" min={1} max={1000} value={r.weight} onChange={e => setWeight(i, Math.max(1, Number(e.target.value) || 1))} className="w-12 rounded border border-line px-1 text-navy" /> marks
                          </span>
                        </td>
                        {Array.from({ length: levels }, (_, k) => {
                          const l = r.descriptors[k];
                          return (
                            <td key={k} className={clsx(td, 'text-ink2')}>
                              {l ? (
                                <span className="flex items-start gap-1">
                                  <input type="number" min={0} max={r.weight} value={l.points} onChange={e => editLevel(i, k, { points: Math.min(r.weight, Math.max(0, Number(e.target.value) || 0)) })}
                                    className="w-10 rounded border border-transparent px-0.5 font-bold text-navy outline-none hover:border-line focus:border-azure" />
                                  <span className="pt-0.5">·</span>
                                  <input value={l.label} onChange={e => editLevel(i, k, { label: e.target.value })} placeholder="describe" className={cellInput} />
                                </span>
                              ) : <span className="text-muted">—</span>}
                            </td>
                          );
                        })}
                        <td className={clsx(td, 'w-8')}><button onClick={() => { setRows(rows.filter((_, j) => j !== i)); setDirty(true); }} className="text-muted hover:text-navy" aria-label="Remove criterion">✕</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button onClick={addCriterion} className="text-[13px] font-semibold text-azure-strong hover:underline">+ Add criterion</button>
              {rows.length > 0 && (
                <label className="ml-3 flex items-center gap-1 text-[13px] text-ink2">Levels
                  <select value={levels} onChange={e => setLevelCount(Number(e.target.value))} className="rounded border border-line px-1 py-0.5 font-semibold text-navy">
                    {[2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              )}
              <span className="flex-1" />
              <Button variant="secondary" size="sm" onClick={() => setPicking(true)}>Use a template</Button>
              <Button size="sm" onClick={save} loading={saving} disabled={!dirty && !!d.rubric}>Save rubric</Button>
            </div>
            {d.gradedWithIt > 0 && <p className="mt-2 text-xs text-muted">Already used to grade {d.gradedWithIt} score{d.gradedWithIt === 1 ? '' : 's'}: you can edit criteria but not remove them.</p>}
          </section>
        )}
        <p className="text-[12.5px] text-muted">Students see the rubric with the assignment, and their scored rubric with your feedback.</p>
      </div>

      {picking && d && (
        <Dialog open onOpenChange={o => { if (!o) setPicking(false); }}>
          <DialogContent title="Use a template" description={`Marks are shared out of ${d.assignment.maxPoints}. You can change everything after.`}>
            <div className="flex flex-col gap-2">
              {d.templates.map(t => (
                <button key={t.key} onClick={() => { if (!rows.length || confirm('Replace the criteria you have?')) applyTemplate(t); }}
                  className="rounded-md border border-line px-3.5 py-3 text-left hover:border-azure hover:bg-accent-soft">
                  <p className="text-[13.5px] font-semibold text-navy">{t.name}</p>
                  <p className="text-xs text-muted">{t.hint} · {t.criteria.map(c => c.title).join(', ')}</p>
                </button>
              ))}
            </div>
            <DialogFooter><Button size="sm" variant="secondary" onClick={() => setPicking(false)}>Start blank</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
