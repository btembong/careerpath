'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { SkeletonTopbar, SkeletonTable } from '@/components/ui/Skeleton';
import { Select } from '@/components/ui/Select';
import api from '@/lib/api';

/* ── Types ──────────────────────────────────────────────────────── */
interface Country   { id: string; name: string; code: string; currency: string; }
interface Subject   { id: string; name: string; }
interface Level     { id: string; name: string; }
interface ProgrammeCountry { id: string; code: string; name: string; }
interface Programme {
  id: string; name: string; shortName: string | null; type: string;
  countries?: ProgrammeCountry[];
  subjects: Subject[]; levels: Level[];
}
interface PlatformCourse {
  id: string; title: string; description: string | null; status: string;
  source: 'NATIVE' | 'WORDPRESS';
  wpCourseId: number | null;
  wpCourseUrl: string | null;
  programme: { id: string; name: string; shortName: string | null } | null;
  subject:   { id: string; name: string } | null;
  level:     { id: string; name: string } | null;
  teacher:   { id: string; email: string };
  _count:    { modules: number; enrollments: number };
}

/* ── Programme type config (matches Prisma ProgrammeType enum) ──── */
const PROG_TYPES: { value: string; label: string; sub: string; color: string }[] = [
  { value: 'NATIONAL_CURRICULUM',    label: 'National Curriculum',  sub: 'WAEC · KCSE · Matric · GCE · BAC · BEPC',  color: 'text-azure bg-azure/10' },
  { value: 'INTERNATIONAL_EXAM',     label: 'International Exams',  sub: 'Cambridge · IB · SAT · GRE · GMAT · LSAT', color: 'text-royal bg-royal/10' },
  { value: 'PROFESSIONAL_LICENSURE', label: 'Professional',         sub: 'ACCA · CFA · ICAN · ICAG · CIMA · PMP',    color: 'text-amber-600 bg-amber-50' },
  { value: 'LANGUAGE_PROFICIENCY',   label: 'Language Proficiency', sub: 'IELTS · TOEFL · DELF/DALF · TEF',          color: 'text-green-700 bg-green-50' },
  { value: 'CPD',                    label: 'CPD',                  sub: 'Continuing Professional Development',       color: 'text-purple-700 bg-purple-50' },
  { value: 'UNIVERSITY',             label: 'University',           sub: 'Foundation · Licence · Master · LMD',      color: 'text-navy bg-navy/10' },
];
const TYPE_MAP = Object.fromEntries(PROG_TYPES.map(t => [t.value, t]));

const STATUS_BADGE: Record<string, 'active' | 'muted' | 'default'> = {
  PUBLISHED: 'active', PENDING_REVIEW: 'muted', DRAFT: 'default', ARCHIVED: 'default',
};
const STATUS_LABEL: Record<string, string> = {
  PUBLISHED: 'Published', PENDING_REVIEW: 'Under Review', DRAFT: 'Draft', ARCHIVED: 'Archived',
};

/* ═══════════════════════════════════════════════════════════════════
   PANEL 1 — Programme grouped tree
═══════════════════════════════════════════════════════════════════ */
function ProgrammePanel({
  programmes, countries, selected, selCountry,
  onSelect, onAdd, onCountryChange,
}: {
  programmes: Programme[];
  countries: Country[];
  selected: string | null;
  selCountry: string;
  onSelect: (id: string) => void;
  onAdd: (name: string, shortName: string, type: string, countryIds: string[]) => Promise<void>;
  onCountryChange: (id: string) => void;
}) {
  const [search, setSearch] = useState('');
  const [adding,     setAdding]     = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>(
    Object.fromEntries(PROG_TYPES.map(t => [t.value, true]))
  );

  const [name,        setName]        = useState('');
  const [shortName,   setShortName]   = useState('');
  const [type,        setType]        = useState('NATIONAL_CURRICULUM');
  const [selCountries, setSelCountries] = useState<string[]>([]);

  function toggleCountry(id: string) {
    setSelCountries(c => c.includes(id) ? c.filter(x => x !== id) : [...c, id]);
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await onAdd(name, shortName, type, selCountries);
      setAdding(false);
      setName(''); setShortName(''); setType('NATIONAL_CURRICULUM'); setSelCountries([]);
    } finally { setSaving(false); }
  }

  function toggleSection(typeVal: string) {
    setExpanded(e => ({ ...e, [typeVal]: !e[typeVal] }));
  }

  const filtered = programmes.filter(p => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase()) &&
        !(p.shortName ?? '').toLowerCase().includes(search.toLowerCase())) return false;
    if (selCountry && (p.countries ?? []).length > 0 && !(p.countries ?? []).some(c => c.id === selCountry)) return false;
    return true;
  });

  const KNOWN_TYPES = new Set(PROG_TYPES.map(t => t.value));
  const grouped: Record<string, Programme[]> = {};
  filtered.forEach(p => {
    const t = KNOWN_TYPES.has(p.type) ? p.type : 'OTHER';
    if (!grouped[t]) grouped[t] = [];
    grouped[t].push(p);
  });

  const orderedTypes = [
    ...PROG_TYPES.filter(t => grouped[t.value]?.length > 0 || !search),
    ...(grouped['OTHER']?.length > 0
      ? [{ value: 'OTHER', label: 'Other', sub: 'Uncategorised programmes', color: 'text-royal/60 bg-cloud' }]
      : []),
  ];

  return (
    <div className="flex flex-col h-full border-r border-cloud bg-white">
      <div className="px-4 pt-3 pb-2 border-b border-cloud flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-bold uppercase tracking-widest text-azure">PROGRAMMES</p>
          <button onClick={() => setAdding(v => !v)}
            className="flex items-center gap-1 rounded-md border border-cloud bg-white px-2.5 py-1 text-xs font-semibold text-navy hover:bg-cloud transition">
            <Icon name="add" size={12} /> New
          </button>
        </div>

        <div className="relative">
          <Icon name="search" size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-royal/40 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search programmes…"
            className="w-full rounded-md border border-cloud bg-surface pl-7 pr-3 py-1.5 text-xs text-navy outline-none focus:border-azure placeholder:text-royal/30" />
        </div>

        <select value={selCountry} onChange={e => onCountryChange(e.target.value)}
          className="w-full rounded-md border border-cloud bg-white px-2.5 py-1.5 text-xs text-navy outline-none focus:border-azure">
          <option value="">All countries</option>
          {countries.map(c => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {adding && (
        <form onSubmit={handleAdd}
          className="border-b border-cloud bg-azure/5 px-4 py-3 space-y-2.5 flex-shrink-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-azure">NEW PROGRAMME</p>

          <input value={name} onChange={e => setName(e.target.value)} required autoFocus
            placeholder="Full name  e.g. West Africa Senior School Certificate"
            className="w-full rounded-md border border-cloud bg-white px-3 py-1.5 text-xs text-navy outline-none focus:border-azure placeholder:text-royal/40" />

          <div className="flex gap-2">
            <input value={shortName} onChange={e => setShortName(e.target.value)}
              placeholder="Short  e.g. WASSCE"
              className="flex-1 rounded-md border border-cloud bg-white px-3 py-1.5 text-xs text-navy outline-none focus:border-azure placeholder:text-royal/40" />
            <select value={type} onChange={e => setType(e.target.value)}
              className="flex-1 rounded-md border border-cloud bg-white px-2 py-1.5 text-xs text-navy outline-none focus:border-azure">
              {PROG_TYPES.map(t => (
                <option key={t.value} value={t.value}>{t.label}</option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/50 mb-1.5">
              Countries that use this programme
            </p>
            {countries.length === 0 ? (
              <p className="text-[10px] text-royal/30 italic">No countries configured yet</p>
            ) : (
              <div className="grid grid-cols-2 gap-x-2 gap-y-1 max-h-32 overflow-y-auto pr-1">
                {countries.map(c => (
                  <label key={c.id}
                    className="flex items-center gap-1.5 cursor-pointer rounded px-1.5 py-1 hover:bg-cloud transition">
                    <input type="checkbox" checked={selCountries.includes(c.id)}
                      onChange={() => toggleCountry(c.id)}
                      className="rounded accent-azure" />
                    <span className="text-[10px] font-medium text-navy truncate">{c.code}</span>
                    <span className="text-[10px] text-royal/40 truncate">{c.name}</span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <Button type="submit" size="sm" loading={saving}>Save</Button>
            <Button type="button" size="sm" variant="secondary" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
        </form>
      )}

      <ul className="flex-1 overflow-y-auto">
        {orderedTypes.length === 0 && (
          <li className="px-4 py-8 text-center text-xs text-royal/40">
            {search || selCountry ? 'No programmes match the filter' : 'No programmes yet — click New to add one'}
          </li>
        )}

        {orderedTypes.map(typeDef => {
          const group = grouped[typeDef.value] ?? [];
          if (search && group.length === 0) return null;
          const isOpen = expanded[typeDef.value] ?? true;

          return (
            <li key={typeDef.value}>
              <button
                onClick={() => toggleSection(typeDef.value)}
                className="flex items-center gap-2 w-full px-4 py-2 text-left bg-surface border-b border-cloud hover:bg-cloud/50 transition">
                <Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} className="text-royal/40 flex-shrink-0" />
                <span className={`text-[10px] font-bold uppercase tracking-widest ${TYPE_MAP[typeDef.value]?.color?.split(' ')[0] ?? 'text-navy'}`}>
                  {typeDef.label}
                </span>
                <span className="ml-auto text-[10px] font-semibold text-royal/40 flex-shrink-0">
                  {group.length}
                </span>
              </button>

              {isOpen && group.map(p => {
                const isSelected = selected === p.id;
                const typeConf = TYPE_MAP[p.type];
                const progCountries = p.countries ?? [];

                return (
                  <button key={p.id} onClick={() => onSelect(p.id)}
                    className={`flex items-start gap-3 w-full px-4 py-2.5 text-left border-b border-cloud/60 transition-all ${
                      isSelected ? 'bg-azure text-white' : 'hover:bg-cloud/40 text-navy'
                    }`}>

                    <div className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded text-[10px] font-black leading-none mt-0.5 ${
                      isSelected
                        ? 'bg-white/20 text-white'
                        : (typeConf?.color ?? 'bg-cloud text-azure')
                    }`}>
                      {(p.shortName ?? p.name).slice(0, 3).toUpperCase()}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-semibold truncate leading-tight ${isSelected ? 'text-white' : 'text-navy'}`}>
                        {p.shortName ?? p.name}
                      </p>
                      {p.shortName && (
                        <p className={`text-[10px] truncate leading-tight ${isSelected ? 'text-white/60' : 'text-royal/40'}`}>
                          {p.name}
                        </p>
                      )}
                      {progCountries.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1">
                          {progCountries.slice(0, 4).map(c => (
                            <span key={c.id}
                              className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${
                                isSelected ? 'bg-white/20 text-white' : 'bg-cloud text-royal/60'
                              }`}>
                              {c.code}
                            </span>
                          ))}
                          {progCountries.length > 4 && (
                            <span className={`rounded px-1 py-0.5 text-[9px] font-bold ${isSelected ? 'text-white/50' : 'text-royal/30'}`}>
                              +{progCountries.length - 4}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex-shrink-0 flex flex-col items-end gap-1 mt-0.5">
                      <Icon name="chevronRight" size={11} className={isSelected ? 'text-white/60' : 'text-royal/20'} />
                      <span className={`text-[9px] ${isSelected ? 'text-white/50' : 'text-royal/30'}`}>
                        {p.subjects.length}s · {p.levels.length}l
                      </span>
                    </div>
                  </button>
                );
              })}

              {isOpen && group.length === 0 && (
                <div className="px-4 py-2 text-[10px] text-royal/30 italic border-b border-cloud/60">
                  No {typeDef.label.toLowerCase()} programmes
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="px-4 py-2 border-t border-cloud flex-shrink-0">
        <p className="text-[10px] text-royal/40">
          {filtered.length} of {programmes.length} programme{programmes.length !== 1 ? 's' : ''}
          {selCountry && ` · ${countries.find(c => c.id === selCountry)?.name ?? 'Country'}`}
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PANEL 2 — Subjects + Levels
═══════════════════════════════════════════════════════════════════ */
function TaxonomyPanel({
  programme, countries, selCountry,
  selectedSubject, selectedLevel,
  onSelectSubject, onSelectLevel,
  onAddSubject, onAddLevel,
  onDeleteSubject, onDeleteLevel,
}: {
  programme: Programme; countries: Country[]; selCountry: string;
  selectedSubject: string | null; selectedLevel: string | null;
  onSelectSubject: (id: string | null) => void;
  onSelectLevel:   (id: string | null) => void;
  onAddSubject:    (name: string) => Promise<void>;
  onAddLevel:      (name: string) => Promise<void>;
  onDeleteSubject: (id: string) => Promise<void>;
  onDeleteLevel:   (id: string) => Promise<void>;
}) {
  const [addingSubj, setAddingSubj] = useState(false);
  const [addingLvl,  setAddingLvl]  = useState(false);
  const [subjName,   setSubjName]   = useState('');
  const [lvlName,    setLvlName]    = useState('');
  const [saving,     setSaving]     = useState<string | null>(null);

  const typeConf = TYPE_MAP[programme.type];
  const progCountries = programme.countries ?? [];

  async function handleAddSubj(e: React.FormEvent) {
    e.preventDefault(); setSaving('subj');
    try { await onAddSubject(subjName); setAddingSubj(false); setSubjName(''); }
    finally { setSaving(null); }
  }
  async function handleAddLvl(e: React.FormEvent) {
    e.preventDefault(); setSaving('lvl');
    try { await onAddLevel(lvlName); setAddingLvl(false); setLvlName(''); }
    finally { setSaving(null); }
  }

  return (
    <div className="flex flex-col h-full border-r border-cloud bg-white">
      <div className="px-4 py-3 border-b border-cloud flex-shrink-0">
        <p className="text-[10px] font-bold uppercase tracking-widest text-azure">TAXONOMY</p>
        <p className="text-sm font-bold text-navy truncate mt-0.5">{programme.shortName ?? programme.name}</p>

        <span className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold mt-1 ${typeConf?.color ?? 'bg-cloud text-navy'}`}>
          {typeConf?.label ?? programme.type}
        </span>

        {progCountries.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {progCountries.map(c => (
              <span key={c.id} className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${
                selCountry === c.id
                  ? 'bg-azure text-white'
                  : 'bg-cloud text-royal/60'
              }`}>
                {c.code}
              </span>
            ))}
          </div>
        )}
        {selCountry && progCountries.length > 0 && !progCountries.find(c => c.id === selCountry) && (
          <p className="text-[10px] text-amber-500 mt-1.5">
            ⚠ Programme not tagged to selected country
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="px-4 pt-3 pb-1">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-royal/50">
              Subjects <span className="text-royal/30 ml-1">({programme.subjects.length})</span>
            </p>
            <button onClick={() => setAddingSubj(v => !v)}
              className="text-azure hover:text-royal transition flex items-center gap-0.5 text-[10px] font-semibold">
              <Icon name="add" size={12} /> Add
            </button>
          </div>

          {addingSubj && (
            <form onSubmit={handleAddSubj} className="flex gap-1.5 mb-2">
              <input value={subjName} onChange={e => setSubjName(e.target.value)} required autoFocus
                placeholder="Subject name"
                className="flex-1 rounded-md border border-azure bg-white px-2.5 py-1.5 text-xs text-navy outline-none placeholder:text-royal/40" />
              <Button type="submit" size="sm" loading={saving === 'subj'}>Add</Button>
            </form>
          )}

          <ul className="space-y-0.5">
            <li>
              <button onClick={() => onSelectSubject(null)}
                className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-xs transition ${
                  selectedSubject === null ? 'bg-azure/10 text-azure font-semibold' : 'text-royal/50 hover:bg-cloud'
                }`}>
                All subjects
              </button>
            </li>
            {programme.subjects.map(s => (
              <li key={s.id} className="group flex items-center gap-1">
                <button onClick={() => onSelectSubject(selectedSubject === s.id ? null : s.id)}
                  className={`flex-1 text-left rounded-md px-2.5 py-1.5 text-xs transition ${
                    selectedSubject === s.id ? 'bg-azure/10 text-azure font-semibold' : 'text-navy hover:bg-cloud'
                  }`}>
                  {s.name}
                </button>
                <button onClick={() => onDeleteSubject(s.id)}
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 rounded p-1 text-royal/30 hover:text-red-400 transition">
                  <Icon name="close" size={10} />
                </button>
              </li>
            ))}
            {programme.subjects.length === 0 && (
              <li className="px-2.5 py-2 text-[10px] text-royal/30 italic">No subjects yet</li>
            )}
          </ul>
        </div>

        <div className="border-t border-cloud mx-4 my-3" />

        <div className="px-4 pb-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-royal/50">
              Levels <span className="text-royal/30 ml-1">({programme.levels.length})</span>
            </p>
            <button onClick={() => setAddingLvl(v => !v)}
              className="text-azure hover:text-royal transition flex items-center gap-0.5 text-[10px] font-semibold">
              <Icon name="add" size={12} /> Add
            </button>
          </div>

          {addingLvl && (
            <form onSubmit={handleAddLvl} className="flex gap-1.5 mb-2">
              <input value={lvlName} onChange={e => setLvlName(e.target.value)} required autoFocus
                placeholder="Level name"
                className="flex-1 rounded-md border border-azure bg-white px-2.5 py-1.5 text-xs text-navy outline-none placeholder:text-royal/40" />
              <Button type="submit" size="sm" loading={saving === 'lvl'}>Add</Button>
            </form>
          )}

          <ul className="space-y-0.5">
            <li>
              <button onClick={() => onSelectLevel(null)}
                className={`flex w-full items-center rounded-md px-2.5 py-1.5 text-xs transition ${
                  selectedLevel === null ? 'bg-azure/10 text-azure font-semibold' : 'text-royal/50 hover:bg-cloud'
                }`}>
                All levels
              </button>
            </li>
            {programme.levels.map(l => (
              <li key={l.id} className="group flex items-center gap-1">
                <button onClick={() => onSelectLevel(selectedLevel === l.id ? null : l.id)}
                  className={`flex-1 text-left rounded-md px-2.5 py-1.5 text-xs transition ${
                    selectedLevel === l.id ? 'bg-azure/10 text-azure font-semibold' : 'text-navy hover:bg-cloud'
                  }`}>
                  {l.name}
                </button>
                <button onClick={() => onDeleteLevel(l.id)}
                  className="opacity-0 group-hover:opacity-100 flex-shrink-0 rounded p-1 text-royal/30 hover:text-red-400 transition">
                  <Icon name="close" size={10} />
                </button>
              </li>
            ))}
            {programme.levels.length === 0 && (
              <li className="px-2.5 py-2 text-[10px] text-royal/30 italic">No levels yet</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PANEL 3 — Courses
═══════════════════════════════════════════════════════════════════ */
function CoursesPanel({
  courses, programme, teachers, acting,
  onPublish, onTag, onRefresh,
}: {
  courses: PlatformCourse[];
  programme: Programme | null;
  teachers: { id: string; email: string }[];
  acting: string | null;
  onPublish: (id: string) => void;
  onTag: (id: string, progId: string, subjId: string, lvlId: string) => Promise<void>;
  onRefresh: () => Promise<void>;
}) {
  const [showCreate, setShowCreate] = useState(false);
  const [creating,   setCreating]   = useState(false);
  const [syncing,    setSyncing]    = useState(false);
  const [tagTarget,  setTagTarget]  = useState<string | null>(null);
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'NATIVE' | 'WORDPRESS'>('ALL');
  const [form, setForm] = useState({ title: '', description: '', subjectId: '', levelId: '', teacherId: '' });

  const displayed = sourceFilter === 'ALL' ? courses : courses.filter(c => c.source === sourceFilter);

  async function syncWp() {
    setSyncing(true);
    try {
      const r = await api.post('/platform-courses/wp-sync');
      notify.success(`Synced: ${r.data.created} new, ${r.data.updated} updated (${r.data.total} total)`);
      await onRefresh();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'WP sync failed');
    } finally { setSyncing(false); }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault(); setCreating(true);
    try {
      await api.post('/platform-courses', {
        title: form.title,
        description: form.description || undefined,
        programmeId: programme?.id ?? undefined,
        subjectId: form.subjectId || undefined,
        levelId:   form.levelId   || undefined,
        teacherId: form.teacherId || undefined,
      });
      setShowCreate(false);
      setForm({ title: '', description: '', subjectId: '', levelId: '', teacherId: '' });
      await onRefresh();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to create course');
    } finally { setCreating(false); }
  }

  return (
    <div className="flex flex-col h-full bg-surface">
      <div className="px-5 py-3 border-b border-cloud bg-white flex-shrink-0 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure">COURSES</p>
            <p className="text-xs font-semibold text-navy">
              {displayed.length} of {courses.length} course{courses.length !== 1 ? 's' : ''}
              {programme ? ` · ${programme.shortName ?? programme.name}` : ' · All programmes'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={syncWp} disabled={syncing}
              className="flex items-center gap-1.5 rounded-md border border-cloud bg-white px-3 py-1.5 text-xs font-semibold text-orange-600 hover:bg-orange-50 transition disabled:opacity-50">
              <Icon name="live" size={12} />
              {syncing ? 'Syncing…' : 'Sync WP'}
            </button>
            <Button size="sm" onClick={() => setShowCreate(v => !v)}>
              <Icon name="add" size={13} /> New course
            </Button>
          </div>
        </div>

        <div className="flex gap-1">
          {(['ALL', 'NATIVE', 'WORDPRESS'] as const).map(s => (
            <button key={s} onClick={() => setSourceFilter(s)}
              className={`rounded-md px-3 py-1 text-[10px] font-bold uppercase tracking-widest transition ${
                sourceFilter === s
                  ? s === 'WORDPRESS' ? 'bg-orange-100 text-orange-600' : 'bg-azure text-white'
                  : 'bg-cloud text-royal/50 hover:bg-cloud/80'
              }`}>
              {s === 'ALL' ? 'All' : s === 'NATIVE' ? 'Native' : 'WordPress'}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {showCreate && (
          <div className="rounded-md border-2 border-azure/20 bg-white p-4 space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure">NEW COURSE</p>
            <form onSubmit={handleCreate} className="space-y-3">
              <input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required
                placeholder="Course title *"
                className="w-full rounded-md border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
              <textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                rows={2} placeholder="Description (optional)"
                className="w-full rounded-md border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40 resize-none" />
              {programme && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Subject</label>
                    <Select value={form.subjectId} onValueChange={v => setForm(f => ({ ...f, subjectId: v }))}
                      placeholder="— Any —"
                      options={programme.subjects.map(s => ({ value: s.id, label: s.name }))} />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Level</label>
                    <Select value={form.levelId} onValueChange={v => setForm(f => ({ ...f, levelId: v }))}
                      placeholder="— Any —"
                      options={programme.levels.map(l => ({ value: l.id, label: l.name }))} />
                  </div>
                </div>
              )}
              <div className="space-y-1">
                <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">Assign Teacher</label>
                <Select value={form.teacherId} onValueChange={v => setForm(f => ({ ...f, teacherId: v }))}
                  placeholder="— Assign later —"
                  options={teachers.map(t => ({ value: t.id, label: t.email, avatar: t.email[0].toUpperCase() }))} />
              </div>
              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" loading={creating}>Create</Button>
                <Button type="button" size="sm" variant="secondary" onClick={() => setShowCreate(false)}>Cancel</Button>
              </div>
            </form>
          </div>
        )}

        {displayed.length === 0 ? (
          <div className="flex flex-col items-center py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-cloud mb-3">
              <Icon name="courses" size={20} className="text-azure" />
            </div>
            <p className="text-sm font-semibold text-navy">No courses here yet</p>
            <p className="text-xs text-royal/50 mt-1">
              {sourceFilter === 'WORDPRESS'
                ? 'Click "Sync WP" to import courses from WordPress'
                : programme
                  ? `Create a course tagged to ${programme.shortName ?? programme.name}`
                  : 'Select a programme in Panel 1 to filter, or create a course'}
            </p>
          </div>
        ) : (
          displayed.map(course => (
            <div key={course.id} className="rounded-md border border-cloud bg-white p-4">
              <div className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                    <Badge variant={STATUS_BADGE[course.status]}>{STATUS_LABEL[course.status]}</Badge>
                    {course.source === 'WORDPRESS' && (
                      <span className="rounded bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-600 uppercase">WP</span>
                    )}
                    {course.subject && (
                      <span className="rounded bg-cloud px-2 py-0.5 text-[10px] font-semibold text-royal/60">
                        {course.subject.name}
                      </span>
                    )}
                    {course.level && (
                      <span className="rounded bg-azure/10 px-2 py-0.5 text-[10px] font-semibold text-azure">
                        {course.level.name}
                      </span>
                    )}
                  </div>
                  <Link href={`/admin/courses/${course.id}`}
                    className="text-sm font-bold text-navy leading-snug hover:text-azure transition line-clamp-2">
                    {course.title}
                  </Link>
                  {course.description && (
                    <p className="text-xs text-royal/50 mt-0.5 line-clamp-1">{course.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-2 text-[10px] text-royal/40">
                    <span><Icon name="mentorship" size={10} className="inline mr-1" />{course.teacher.email}</span>
                    <span><Icon name="notebook" size={10} className="inline mr-1" />{course._count.modules} modules</span>
                    <span><Icon name="graduate" size={10} className="inline mr-1" />{course._count.enrollments} enrolled</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-cloud flex-wrap">
                <InlineTagForm
                  course={course} programme={programme}
                  open={tagTarget === course.id}
                  onOpen={() => setTagTarget(course.id)}
                  onClose={() => setTagTarget(null)}
                  onSave={onTag}
                  acting={acting === course.id}
                />
                {course.source === 'WORDPRESS' && course.wpCourseUrl && (
                  <a href={course.wpCourseUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-1.5 rounded-md border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-600 hover:bg-orange-100 transition">
                    <Icon name="live" size={12} /> Open in WP
                  </a>
                )}
                {course.source === 'NATIVE' && course.status === 'PENDING_REVIEW' && (
                  <Button size="sm" loading={acting === course.id} onClick={() => onPublish(course.id)}>
                    Publish
                  </Button>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

/* ── Inline tag form ────────────────────────────────────────────── */
function InlineTagForm({ course, programme, open, onOpen, onClose, onSave, acting }: {
  course: PlatformCourse; programme: Programme | null;
  open: boolean; onOpen: () => void; onClose: () => void;
  onSave: (id: string, progId: string, subjId: string, lvlId: string) => Promise<void>;
  acting: boolean;
}) {
  const [progId, setProgId] = useState(course.programme?.id ?? '');
  const [subjId, setSubjId] = useState(course.subject?.id  ?? '');
  const [lvlId,  setLvlId]  = useState(course.level?.id    ?? '');

  if (!open) {
    return (
      <button onClick={onOpen}
        className="flex items-center gap-1.5 rounded-md border border-cloud px-3 py-1.5 text-xs font-semibold text-navy hover:bg-cloud transition">
        <Icon name="tag" size={12} />
        {course.subject ? course.subject.name : 'Tag subject/level'}
      </button>
    );
  }

  return (
    <div className="flex-1 flex items-center gap-2 flex-wrap">
      {programme && (
        <>
          <Select value={subjId} onValueChange={setSubjId} placeholder="Subject"
            options={programme.subjects.map(s => ({ value: s.id, label: s.name }))} />
          <Select value={lvlId} onValueChange={setLvlId} placeholder="Level"
            options={programme.levels.map(l => ({ value: l.id, label: l.name }))} />
        </>
      )}
      <Button size="sm" loading={acting} onClick={() => onSave(course.id, progId, subjId, lvlId)}>Save</Button>
      <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PAGE ROOT
═══════════════════════════════════════════════════════════════════ */
export default function AdminCoursesManagePage() {
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [courses,    setCourses]    = useState<PlatformCourse[]>([]);
  const [countries,  setCountries]  = useState<Country[]>([]);
  const [teachers,   setTeachers]   = useState<{ id: string; email: string }[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [acting,     setActing]     = useState<string | null>(null);

  const [selProg,    setSelProg]    = useState<string | null>(null);
  const [selSubj,    setSelSubj]    = useState<string | null>(null);
  const [selLevel,   setSelLevel]   = useState<string | null>(null);
  const [selCountry, setSelCountry] = useState('');

  async function loadAll() {
    const [cr, pr] = await Promise.all([
      api.get('/platform-courses'),
      api.get('/catalogue/programmes'),
    ]);
    setCourses(cr.data);
    setProgrammes(pr.data);
  }

  useEffect(() => {
    Promise.all([
      loadAll(),
      api.get('/countries/admin/countries')
        .then(r => setCountries(r.data ?? [])).catch(() => {}),
      api.get('/portals/admin/teachers')
        .then(r => setTeachers(r.data?.map((t: any) => ({ id: t.id, email: t.email })) ?? []))
        .catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  async function addProgramme(name: string, shortName: string, type: string, countryIds: string[]) {
    try {
      await api.post('/catalogue/programmes', {
        name, shortName: shortName || undefined, type,
        countryIds: countryIds.length > 0 ? countryIds : undefined,
      });
      await loadAll();
      notify.success('Programme created');
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
  }

  async function addSubject(progId: string, name: string) {
    try {
      await api.post(`/catalogue/programmes/${progId}/subjects`, { name });
      await loadAll();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
  }
  async function addLevel(progId: string, name: string) {
    try {
      await api.post(`/catalogue/programmes/${progId}/levels`, { name });
      await loadAll();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
  }
  async function deleteSubject(subjectId: string) {
    if (!confirm('Remove this subject?')) return;
    try {
      await api.delete(`/catalogue/subjects/${subjectId}`);
      await loadAll();
      if (selSubj === subjectId) setSelSubj(null);
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
  }
  async function deleteLevel(levelId: string) {
    if (!confirm('Remove this level?')) return;
    try {
      await api.delete(`/catalogue/levels/${levelId}`);
      await loadAll();
      if (selLevel === levelId) setSelLevel(null);
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
  }

  async function tagCourse(id: string, progId: string, subjId: string, lvlId: string) {
    setActing(id);
    try {
      await api.patch(`/platform-courses/${id}`, {
        programmeId: progId || null,
        subjectId:   subjId || null,
        levelId:     lvlId  || null,
      });
      await loadAll();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setActing(null); }
  }
  async function publishCourse(id: string) {
    setActing(id);
    try {
      await api.post(`/platform-courses/${id}/publish`);
      notify.success('Course published');
      await loadAll();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setActing(null); }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-5 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-cloud animate-pulse" />)}
        </div>
        <SkeletonTable />
      </div>
    </div>
  );

  const selectedProg = programmes.find(p => p.id === selProg) ?? null;

  const filteredCourses = courses.filter(c => {
    if (selProg  && c.programme?.id !== selProg)  return false;
    if (selSubj  && c.subject?.id   !== selSubj)  return false;
    if (selLevel && c.level?.id     !== selLevel) return false;
    if (selCountry && !selProg) {
      const prog = programmes.find(p => p.id === c.programme?.id);
      if (prog && (prog.countries ?? []).length > 0 && !(prog.countries ?? []).some(ct => ct.id === selCountry)) return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Manage Courses" subtitle="Programmes · Subjects · Levels · Courses" backHref="/admin/courses" backLabel="Courses" />

      <div
        className="flex-1 grid overflow-hidden"
        style={{
          height: 'calc(100vh - 65px)',
          gridTemplateColumns: '320px 280px 1fr',
        }}>

        <ProgrammePanel
          programmes={programmes}
          countries={countries}
          selected={selProg}
          selCountry={selCountry}
          onSelect={id => { setSelProg(id); setSelSubj(null); setSelLevel(null); }}
          onAdd={addProgramme}
          onCountryChange={setSelCountry}
        />

        {selectedProg ? (
          <TaxonomyPanel
            programme={selectedProg}
            countries={countries}
            selCountry={selCountry}
            selectedSubject={selSubj}  selectedLevel={selLevel}
            onSelectSubject={setSelSubj} onSelectLevel={setSelLevel}
            onAddSubject={name => addSubject(selectedProg.id, name)}
            onAddLevel={name   => addLevel(selectedProg.id, name)}
            onDeleteSubject={deleteSubject}
            onDeleteLevel={deleteLevel}
          />
        ) : (
          <div className="flex flex-col items-center justify-center border-r border-cloud bg-white text-center px-6">
            <Icon name="notebook" size={22} className="text-royal/20 mb-2" />
            <p className="text-xs text-royal/40 leading-relaxed">
              Select a programme to manage its subjects and levels
            </p>
          </div>
        )}

        <CoursesPanel
          courses={filteredCourses}
          programme={selectedProg}
          teachers={teachers}
          acting={acting}
          onPublish={publishCourse}
          onTag={tagCourse}
          onRefresh={loadAll}
        />
      </div>
    </div>
  );
}
