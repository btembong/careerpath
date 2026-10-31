'use client';
import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { useTaxonomy, label, type TaxOptions } from '@/components/admin/taxonomy';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Tab = 'programmes' | 'subjects' | 'systems';
interface Country { id: string; name: string }
interface ProgrammeRow { id: string; name: string; shortName: string | null; type: string; scope: string; isActive: boolean; educationSystem: { id: string; name: string } | null; countries: Country[]; subjects: number; levels: number; courses: number }
interface SubjectRow { id: string; name: string; category: string; isPractical: boolean; programmes: number; courses: number; teachers: number; duplicateOf: string[] }
interface SystemRow { id: string; name: string; countries: Country[]; levels: { id: string; name: string; tier: string; sortOrder: number; courses: number }[]; programmes: { id: string; name: string; shortName: string | null }[] }

const input = 'h-9 w-full rounded-md border border-line bg-white px-2.5 text-[13.5px] text-navy outline-none focus:border-azure';
const Field = ({ l, children, wide }: { l: string; children: React.ReactNode; wide?: boolean }) => (
  <label className={clsx('flex flex-col gap-1', wide && 'sm:col-span-2')}><span className="text-[12.5px] font-semibold text-navy">{l}</span>{children}</label>
);

export default function TaxonomyPage() {
  const [tab, setTab] = useState<Tab>('programmes');
  const { opts, reload } = useTaxonomy();
  const [countries, setCountries] = useState<Country[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  useEffect(() => { api.get('/admin/taxonomy/countries').then(r => setCountries(r.data)).catch(() => {}); }, []);
  useEffect(() => { setSelected(null); setCreating(false); }, [tab]);

  const add = { programmes: 'New programme', subjects: 'New subject', systems: 'New education system' }[tab];
  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Taxonomy" subtitle="Programmes, subjects and education levels that courses are tagged with" backHref="/admin/courses/manage" backLabel="Course management"
        actions={<div className="flex flex-wrap gap-2">
          <div role="tablist" className="flex gap-1 rounded-lg border border-line bg-white p-1 text-[13px]">
            {([['programmes', 'Programmes'], ['subjects', 'Subjects'], ['systems', 'Education systems']] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => { setSelected(null); setCreating(false); setTab(k); }} className={clsx('rounded-md px-3 py-1.5 text-navy', tab === k ? 'bg-accent-soft font-semibold' : 'font-medium hover:bg-subtle')}>{l}</button>
            ))}
          </div>
          <Button size="sm" onClick={() => { setSelected(null); setCreating(true); }}>{add}</Button>
        </div>} />
      {!opts ? <div className="m-4 h-96 rounded-lg bg-subtle animate-pulse lg:mx-7" /> :
        tab === 'programmes' ? <Programmes opts={opts} countries={countries} selected={selected} creating={creating} onSelect={id => { setCreating(false); setSelected(id); }} onDone={reload} />
        : tab === 'subjects' ? <Subjects opts={opts} selected={selected} creating={creating} onSelect={id => { setCreating(false); setSelected(id); }} onDone={reload} />
        : <Systems countries={countries} opts={opts} selected={selected} creating={creating} onSelect={id => { setCreating(false); setSelected(id); }} onDone={reload} />}
    </div>
  );
}

function Shell({ list, detail }: { list: React.ReactNode; detail: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-[22px]">
      <section className="min-w-0 flex-[999_1_520px] rounded-lg border border-line bg-white">{list}</section>
      <aside className="min-w-0 flex-[1_1_380px] rounded-lg border border-azure bg-white p-[18px] lg:sticky lg:top-4">{detail}</aside>
    </div>
  );
}
const Row = ({ on, onClick, title, meta, right, badge, blue }: { on: boolean; onClick: () => void; title: string; meta: string; right: string; badge: string; blue: boolean }) => (
  <button onClick={onClick} className={clsx('flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left first:border-t-0', on ? 'bg-accent-soft shadow-[inset_3px_0_0_var(--color-azure-strong,#3F6FE8)]' : 'hover:bg-subtle')}>
    <div className="min-w-0 flex-1"><p className="truncate text-sm font-[650] text-navy">{title}</p><p className="mt-0.5 truncate text-[12.5px] text-muted">{meta}</p></div>
    <span className="hidden whitespace-nowrap text-[12.5px] text-ink2 sm:inline">{right}</span>
    <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-semibold', blue ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>{badge}</span>
  </button>
);
const Toolbar = ({ q, setQ, placeholder, children }: { q: string; setQ: (v: string) => void; placeholder: string; children?: React.ReactNode }) => (
  <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3 text-[13px]">
    <input value={q} onChange={e => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} className="h-[34px] min-w-[180px] flex-1 rounded-md border border-line px-2.5 outline-none focus:border-azure" />
    {children}
  </div>
);
const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button onClick={onClick} aria-pressed={on} className={clsx('h-[34px] rounded-md px-2.5', on ? 'border border-azure bg-accent-soft font-semibold text-navy' : 'border border-line text-navy')}>{children}</button>
);
const Pick = ({ items, value, onChange, all }: { items: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void; all: { id: string; name: string }[] }) => (
  <div className="flex flex-wrap gap-1.5">
    {items.map(i => <span key={i.id} className="inline-flex items-center gap-1 rounded-md border border-line bg-subtle px-2 py-1 text-[12.5px] text-navy">{i.name}<button onClick={() => onChange(value.filter(v => v !== i.id))} aria-label={`Remove ${i.name}`} className="text-muted hover:text-navy">✕</button></span>)}
    <select aria-label="Add" className="h-7 rounded-md border border-dashed border-azure bg-white px-1.5 text-[12.5px] font-semibold text-azure-strong" value="" onChange={e => { if (e.target.value) onChange([...value, e.target.value]); }}>
      <option value="">+ Add</option>{all.filter(a => !value.includes(a.id)).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
  </div>
);

// ── Programmes ───────────────────────────────────────────

function Programmes({ opts, countries, selected, creating, onSelect, onDone }: { opts: TaxOptions; countries: Country[]; selected: string | null; creating: boolean; onSelect: (id: string) => void; onDone: () => void }) {
  const [rows, setRows] = useState<ProgrammeRow[] | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [activeOnly, setActiveOnly] = useState(true);
  const [empty, setEmpty] = useState(false);
  const load = useCallback(() => api.get('/admin/taxonomy/programmes').then(r => setRows(r.data)).catch(() => notify.error('Could not load programmes')), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!selected && !creating && rows?.length) onSelect(rows[0].id); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = (rows ?? []).filter(r => (!q.trim() || `${r.name} ${r.shortName ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())) && (!type || r.type === type) && (!activeOnly || r.isActive) && (!empty || r.courses === 0));
  return (
    <Shell
      list={<>
        <Toolbar q={q} setQ={setQ} placeholder={`Search ${rows?.length ?? ''} programmes`}>
          <select aria-label="Type" className="h-[34px] rounded-md border border-line px-2 text-navy" value={type} onChange={e => setType(e.target.value)}><option value="">All types</option>{opts.types.map(t => <option key={t} value={t}>{label(t)}</option>)}</select>
          <Chip on={activeOnly} onClick={() => setActiveOnly(v => !v)}>Active only</Chip>
          <Chip on={empty} onClick={() => setEmpty(v => !v)}>No courses yet</Chip>
        </Toolbar>
        {!rows ? <div className="m-4 h-64 rounded bg-subtle animate-pulse" /> : !shown.length ? <p className="px-4 py-10 text-center text-[13px] text-ink2">No programmes match.</p> : shown.map(r => (
          <Row key={r.id} on={selected === r.id} onClick={() => onSelect(r.id)} title={r.shortName ? `${r.shortName} — ${r.name.replace(new RegExp(`^${r.shortName}\\s*[—–-]\\s*`), '')}` : r.name}
            meta={`${label(r.type)} · ${r.countries.length ? r.countries.map(c => c.name).slice(0, 3).join(', ') + (r.countries.length > 3 ? ` +${r.countries.length - 3}` : '') : label(r.scope)}`}
            right={`${r.subjects} subjects · ${r.levels} levels · ${r.courses} courses`} badge={r.isActive ? 'Active' : 'Hidden'} blue={r.isActive} />
        ))}
      </>}
      detail={creating || selected ? <ProgrammeForm key={creating ? 'new' : selected!} id={creating ? null : selected} opts={opts} countries={countries} onSaved={id => { load(); onDone(); onSelect(id); }} /> : <p className="text-[13px] text-ink2">Choose a programme.</p>} />
  );
}

function ProgrammeForm({ id, opts, countries, onSaved }: { id: string | null; opts: TaxOptions; countries: Country[]; onSaved: (id: string) => void }) {
  const [f, setF] = useState({ name: '', shortName: '', type: 'NATIONAL_CURRICULUM', scope: 'COUNTRY', isActive: true, educationSystemId: '', countryIds: [] as string[], subjectIds: [] as string[], levelIds: [] as string[], courses: 0, perSubject: {} as Record<string, number> });
  const [systems, setSystems] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.get('/admin/taxonomy/systems').then(r => setSystems(r.data)).catch(() => {}); }, []);
  useEffect(() => {
    if (!id) return;
    api.get(`/admin/taxonomy/programmes/${id}`).then(r => {
      const p = r.data;
      setF({ name: p.name, shortName: p.shortName ?? '', type: p.type, scope: p.scope, isActive: p.isActive, educationSystemId: p.educationSystemId ?? '', countryIds: p.countries.map((c: Country) => c.id), subjectIds: p.subjects.map((s: { id: string }) => s.id), levelIds: p.levels.map((l: { id: string }) => l.id), courses: p.courses, perSubject: Object.fromEntries(p.subjects.map((s: { id: string; courses: number }) => [s.id, s.courses])) });
    }).catch(() => notify.error('Could not open this programme'));
  }, [id]);
  async function save(extra: Partial<typeof f> = {}) {
    const body = { ...f, ...extra };
    setSaving(true);
    try {
      const payload = { name: body.name, shortName: body.shortName || null, type: body.type, scope: body.scope, isActive: body.isActive, educationSystemId: body.educationSystemId || null, countryIds: body.countryIds, subjectIds: body.subjectIds, levelIds: body.levelIds };
      const r = id ? await api.patch(`/admin/taxonomy/programmes/${id}`, payload) : await api.post('/admin/taxonomy/programmes', payload);
      notify.success(id ? 'Programme saved' : 'Programme added'); onSaved(r.data.id);
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); } finally { setSaving(false); }
  }
  const subjects = opts.subjects.map(s => ({ id: s.id, name: s.name }));
  const levels = opts.levels.filter(l => !f.educationSystemId || l.system.id === f.educationSystemId).map(l => ({ id: l.id, name: f.educationSystemId ? l.name : `${l.name} · ${l.system.name}` }));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">Programme</p>
      <h2 className="text-lg font-extrabold text-navy">{id ? (f.shortName || f.name || '…') : 'New programme'}</h2>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field l="Name" wide><input className={input} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field l="Short name students see"><input className={input} value={f.shortName} onChange={e => setF({ ...f, shortName: e.target.value })} placeholder="WASSCE" /></Field>
        <Field l="Type"><select className={input} value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>{opts.types.map(t => <option key={t} value={t}>{label(t)}</option>)}</select></Field>
        <Field l="Applies"><select className={input} value={f.scope} onChange={e => setF({ ...f, scope: e.target.value })}>{opts.scopes.map(t => <option key={t} value={t}>{t === 'COUNTRY' ? 'In one country' : t === 'REGIONAL' ? 'In a region' : 'Everywhere'}</option>)}</select></Field>
        <Field l="Education system"><select className={input} value={f.educationSystemId} onChange={e => setF({ ...f, educationSystemId: e.target.value })}><option value="">None</option>{systems.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
      </div>
      <Field l="Countries"><Pick items={countries.filter(c => f.countryIds.includes(c.id))} value={f.countryIds} onChange={countryIds => setF({ ...f, countryIds })} all={countries} /></Field>
      <Field l={`Subjects (${f.subjectIds.length})`}><Pick items={subjects.filter(s => f.subjectIds.includes(s.id)).map(s => ({ ...s, name: f.perSubject[s.id] ? `${s.name} · ${f.perSubject[s.id]}` : s.name }))} value={f.subjectIds} onChange={subjectIds => setF({ ...f, subjectIds })} all={subjects} /></Field>
      <Field l={`Levels (${f.levelIds.length})`}><Pick items={opts.levels.filter(l => f.levelIds.includes(l.id)).map(l => ({ id: l.id, name: l.name }))} value={f.levelIds} onChange={levelIds => setF({ ...f, levelIds })} all={levels} /></Field>
      {id && <p className="rounded-md bg-accent-soft px-3 py-2.5 text-[13px] text-navy">{f.courses} course{f.courses === 1 ? '' : 's'} use this programme. Students see it as “{f.shortName || f.name}” in the catalogue and in their exam choice.</p>}
      <div className="mt-1 flex gap-2">
        <Button size="sm" onClick={() => save()} loading={saving}>Save</Button>
        {id && <Button size="sm" variant="secondary" onClick={() => { const isActive = !f.isActive; setF({ ...f, isActive }); save({ isActive }); }}>{f.isActive ? 'Hide from students' : 'Show to students'}</Button>}
      </div>
    </div>
  );
}

// ── Subjects ─────────────────────────────────────────────

function Subjects({ opts, selected, creating, onSelect, onDone }: { opts: TaxOptions; selected: string | null; creating: boolean; onSelect: (id: string) => void; onDone: () => void }) {
  const [rows, setRows] = useState<SubjectRow[] | null>(null);
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [mode, setMode] = useState<'' | 'used' | 'dupes' | 'unused'>('');
  const load = useCallback(() => api.get('/admin/taxonomy/subjects').then(r => setRows(r.data)).catch(() => notify.error('Could not load subjects')), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!selected && !creating && rows?.length) onSelect(rows[0].id); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const dupes = (rows ?? []).filter(r => r.duplicateOf.length).length;
  const shown = (rows ?? []).filter(r => (!q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase())) && (!cat || r.category === cat)
    && (mode !== 'used' || r.courses > 0) && (mode !== 'dupes' || r.duplicateOf.length > 0) && (mode !== 'unused' || (r.courses === 0 && r.programmes === 0)));
  return (
    <Shell
      list={<>
        <Toolbar q={q} setQ={setQ} placeholder={`Search ${rows?.length ?? ''} subjects`}>
          <select aria-label="Category" className="h-[34px] rounded-md border border-line px-2 text-navy" value={cat} onChange={e => setCat(e.target.value)}><option value="">All categories</option>{opts.categories.map(t => <option key={t} value={t}>{label(t)}</option>)}</select>
          <Chip on={mode === 'used'} onClick={() => setMode(m => m === 'used' ? '' : 'used')}>Used by courses</Chip>
          <Chip on={mode === 'dupes'} onClick={() => setMode(m => m === 'dupes' ? '' : 'dupes')}>Possible duplicates {dupes || ''}</Chip>
          <Chip on={mode === 'unused'} onClick={() => setMode(m => m === 'unused' ? '' : 'unused')}>Unused</Chip>
        </Toolbar>
        {!rows ? <div className="m-4 h-64 rounded bg-subtle animate-pulse" /> : !shown.length ? <p className="px-4 py-10 text-center text-[13px] text-ink2">No subjects match.</p> : shown.map(r => (
          <Row key={r.id} on={selected === r.id} onClick={() => onSelect(r.id)} title={r.name} meta={`${label(r.category)} · in ${r.programmes} programme${r.programmes === 1 ? '' : 's'}`}
            right={`${r.courses} course${r.courses === 1 ? '' : 's'}`} badge={r.duplicateOf.length ? 'Duplicate?' : r.courses || r.programmes ? 'In use' : 'Unused'} blue={!r.duplicateOf.length && (r.courses > 0 || r.programmes > 0)} />
        ))}
      </>}
      detail={creating || selected ? <SubjectForm key={creating ? 'new' : selected!} id={creating ? null : selected} opts={opts} rows={rows ?? []} onSaved={id => { load(); onDone(); if (id) onSelect(id); }} /> : <p className="text-[13px] text-ink2">Choose a subject.</p>} />
  );
}

function SubjectForm({ id, opts, rows, onSaved }: { id: string | null; opts: TaxOptions; rows: SubjectRow[]; onSaved: (id: string | null) => void }) {
  const [f, setF] = useState({ name: '', category: 'MATHEMATICS', isPractical: false, programmeIds: [] as string[], courses: 0, teachers: 0 });
  const [saving, setSaving] = useState(false);
  const [mergeInto, setMergeInto] = useState('');
  useEffect(() => {
    if (!id) return;
    api.get(`/admin/taxonomy/subjects/${id}`).then(r => { const s = r.data; setF({ name: s.name, category: s.category, isPractical: s.isPractical, programmeIds: s.programmes.map((p: { id: string }) => p.id), courses: s.courses, teachers: s.teachers }); }).catch(() => notify.error('Could not open this subject'));
  }, [id]);
  const row = rows.find(r => r.id === id);
  const twins = rows.filter(r => row?.duplicateOf.includes(r.id));
  useEffect(() => { setMergeInto(twins[0]?.id ?? ''); }, [id, rows.length]); // eslint-disable-line react-hooks/exhaustive-deps

  async function save() {
    setSaving(true);
    try {
      const body = { name: f.name, category: f.category, isPractical: f.isPractical, programmeIds: f.programmeIds };
      const r = id ? await api.patch(`/admin/taxonomy/subjects/${id}`, body) : await api.post('/admin/taxonomy/subjects', body);
      notify.success(id ? 'Subject saved' : 'Subject added'); onSaved(r.data.id);
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); } finally { setSaving(false); }
  }
  async function merge() {
    const into = rows.find(r => r.id === mergeInto);
    if (!id || !into || !confirm(`Merge “${f.name}” into “${into.name}”? Its ${f.courses} course${f.courses === 1 ? '' : 's'} and programmes move across and “${f.name}” is removed.`)) return;
    try { await api.post(`/admin/taxonomy/subjects/${id}/merge`, { intoId: into.id }); notify.success(`Merged into ${into.name}`); onSaved(into.id); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not merge'); }
  }
  async function remove() {
    if (!id || !confirm(`Delete “${f.name}”?`)) return;
    try { await api.delete(`/admin/taxonomy/subjects/${id}`); notify.success('Subject deleted'); onSaved(null); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not delete'); }
  }
  const programmes = opts.programmes.map(p => ({ id: p.id, name: p.shortName || p.name }));
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">Subject</p>
      <h2 className="text-lg font-extrabold text-navy">{id ? f.name || '…' : 'New subject'}</h2>
      <div className="grid gap-2.5 sm:grid-cols-2">
        <Field l="Name"><input className={input} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></Field>
        <Field l="Category"><select className={input} value={f.category} onChange={e => setF({ ...f, category: e.target.value })}>{opts.categories.map(t => <option key={t} value={t}>{label(t)}</option>)}</select></Field>
        <Field l="Practical subject"><select className={input} value={f.isPractical ? 'yes' : 'no'} onChange={e => setF({ ...f, isPractical: e.target.value === 'yes' })}><option value="no">No</option><option value="yes">Yes (lab or workshop)</option></select></Field>
        {id && <Field l="Used by"><span className="flex h-9 items-center text-[13.5px] text-navy">{f.courses} course{f.courses === 1 ? '' : 's'} · {f.teachers} teacher{f.teachers === 1 ? '' : 's'}</span></Field>}
      </div>
      <Field l={`In programmes (${f.programmeIds.length})`}><Pick items={programmes.filter(p => f.programmeIds.includes(p.id))} value={f.programmeIds} onChange={programmeIds => setF({ ...f, programmeIds })} all={programmes} /></Field>
      {id && twins.length > 0 && (
        <div className="flex flex-col gap-2 rounded-md bg-accent-soft px-3 py-2.5 text-[13px] text-navy">
          <p>“{f.name}” looks like the same subject as {twins.map(t => `“${t.name}” (${t.courses} course${t.courses === 1 ? '' : 's'})`).join(' and ')}. Merge one into the other — courses, programmes and teachers move across.</p>
          <div className="flex flex-wrap items-center gap-2">
            <span>Merge “{f.name}” into</span>
            <select className="h-8 rounded border border-line bg-white px-1.5" value={mergeInto} onChange={e => setMergeInto(e.target.value)}>{twins.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
            <Button size="sm" variant="secondary" onClick={merge}>Merge</Button>
          </div>
        </div>
      )}
      {id && !twins.length && (
        <details className="text-[13px] text-ink2"><summary className="cursor-pointer font-semibold text-azure-strong">Merge into another subject…</summary>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <select className="h-8 max-w-[220px] rounded border border-line bg-white px-1.5" value={mergeInto} onChange={e => setMergeInto(e.target.value)}><option value="">Choose…</option>{rows.filter(r => r.id !== id).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
            <Button size="sm" variant="secondary" onClick={merge} disabled={!mergeInto}>Merge</Button>
          </div>
        </details>
      )}
      <div className="mt-1 flex gap-2">
        <Button size="sm" onClick={save} loading={saving}>Save</Button>
        {id && f.courses === 0 && <Button size="sm" variant="secondary" onClick={remove}>Delete</Button>}
      </div>
    </div>
  );
}

// ── Education systems ────────────────────────────────────

function Systems({ countries, opts, selected, creating, onSelect, onDone }: { countries: Country[]; opts: TaxOptions; selected: string | null; creating: boolean; onSelect: (id: string) => void; onDone: () => void }) {
  const [rows, setRows] = useState<SystemRow[] | null>(null);
  const [q, setQ] = useState('');
  const load = useCallback(() => api.get('/admin/taxonomy/systems').then(r => setRows(r.data)).catch(() => notify.error('Could not load education systems')), []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (!selected && !creating && rows?.length) onSelect(rows[0].id); }, [rows]); // eslint-disable-line react-hooks/exhaustive-deps
  const shown = (rows ?? []).filter(r => !q.trim() || `${r.name} ${r.countries.map(c => c.name).join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()));
  const sys = rows?.find(r => r.id === selected) ?? null;
  return (
    <Shell
      list={<>
        <Toolbar q={q} setQ={setQ} placeholder={`Search ${rows?.length ?? ''} education systems`} />
        {!rows ? <div className="m-4 h-64 rounded bg-subtle animate-pulse" /> : shown.map(r => (
          <Row key={r.id} on={selected === r.id} onClick={() => onSelect(r.id)} title={r.name} meta={r.countries.map(c => c.name).join(', ') || 'No country set'}
            right={r.levels.length ? `${r.levels[0].name} → ${r.levels.at(-1)!.name} · ${r.levels.length} levels` : 'No levels yet'} badge={r.programmes.length ? 'In use' : 'Unused'} blue={r.programmes.length > 0} />
        ))}
      </>}
      detail={creating || sys ? <SystemForm key={creating ? 'new' : sys!.id} sys={creating ? null : sys} countries={countries} tiers={opts.tiers} onSaved={id => { load(); onDone(); if (id) onSelect(id); }} /> : <p className="text-[13px] text-ink2">Choose an education system.</p>} />
  );
}

function SystemForm({ sys, countries, tiers, onSaved }: { sys: SystemRow | null; countries: Country[]; tiers: string[]; onSaved: (id: string | null) => void }) {
  const [name, setName] = useState(sys?.name ?? '');
  const [countryIds, setCountryIds] = useState<string[]>(sys?.countries.map(c => c.id) ?? []);
  const [levels, setLevels] = useState(sys?.levels ?? []);
  const [newLevel, setNewLevel] = useState({ name: '', tier: 'SENIOR_SECONDARY' });
  const [saving, setSaving] = useState(false);
  async function save() {
    setSaving(true);
    try {
      const r = sys ? await api.patch(`/admin/taxonomy/systems/${sys.id}`, { name, countryIds }) : await api.post('/admin/taxonomy/systems', { name, countryIds });
      notify.success(sys ? 'Saved' : 'Education system added'); onSaved(r.data.id);
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); } finally { setSaving(false); }
  }
  async function addLevel() {
    if (!sys || !newLevel.name.trim()) return;
    try { const r = await api.post(`/admin/taxonomy/systems/${sys.id}/levels`, newLevel); setLevels(l => [...l, { ...r.data, courses: 0 }]); setNewLevel({ ...newLevel, name: '' }); onSaved(sys.id); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not add the level'); }
  }
  async function move(i: number, d: -1 | 1) {
    if (!sys) return;
    const next = [...levels]; const j = i + d; if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]]; setLevels(next);
    try { await api.put(`/admin/taxonomy/systems/${sys.id}/levels/order`, { ids: next.map(l => l.id) }); } catch { notify.error('Could not reorder'); setLevels(levels); }
  }
  async function removeLevel(id: string) {
    try { await api.delete(`/admin/taxonomy/levels/${id}`); setLevels(l => l.filter(x => x.id !== id)); } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not delete'); }
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">Education system</p>
      <h2 className="text-lg font-extrabold text-navy">{sys ? name || '…' : 'New education system'}</h2>
      <Field l="Name"><input className={input} value={name} onChange={e => setName(e.target.value)} placeholder="Ghana Education Service" /></Field>
      <Field l="Countries"><Pick items={countries.filter(c => countryIds.includes(c.id))} value={countryIds} onChange={setCountryIds} all={countries} /></Field>
      {sys && <>
        <div className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-navy">Levels in order</span>
          {!levels.length ? <p className="text-[13px] text-muted">No levels yet.</p> : levels.map((l, i) => (
            <div key={l.id} className="flex items-center gap-2 rounded-md border border-line px-2.5 py-1.5 text-[13px]">
              <span className="w-5 text-xs text-muted">{i + 1}</span><span className="flex-1 text-navy">{l.name}</span><span className="text-xs text-muted">{label(l.tier)}{l.courses ? ` · ${l.courses} courses` : ''}</span>
              <button onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${l.name} up`} className="px-1 text-ink2 disabled:opacity-30">↑</button>
              <button onClick={() => move(i, 1)} disabled={i === levels.length - 1} aria-label={`Move ${l.name} down`} className="px-1 text-ink2 disabled:opacity-30">↓</button>
              {!l.courses && <button onClick={() => removeLevel(l.id)} aria-label={`Delete ${l.name}`} className="px-1 text-muted hover:text-navy">✕</button>}
            </div>
          ))}
          <div className="flex gap-1.5">
            <input className={clsx(input, 'h-8')} value={newLevel.name} onChange={e => setNewLevel({ ...newLevel, name: e.target.value })} placeholder="Add a level, e.g. SHS 1" onKeyDown={e => { if (e.key === 'Enter') addLevel(); }} />
            <select className="h-8 rounded-md border border-line px-1.5 text-[12.5px]" value={newLevel.tier} onChange={e => setNewLevel({ ...newLevel, tier: e.target.value })}>{tiers.map(t => <option key={t} value={t}>{label(t)}</option>)}</select>
            <Button size="sm" variant="secondary" onClick={addLevel}>Add</Button>
          </div>
        </div>
        {sys.programmes.length > 0 && <p className="text-[12.5px] text-muted">Used by {sys.programmes.map(p => p.shortName || p.name).join(', ')}</p>}
      </>}
      <div className="mt-1"><Button size="sm" onClick={save} loading={saving}>Save</Button></div>
    </div>
  );
}
