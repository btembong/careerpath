'use client';
import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

export interface TaxOptions {
  programmes: { id: string; name: string; shortName: string | null; type: string; subjectIds: string[]; levelIds: string[] }[];
  subjects: { id: string; name: string; category: string }[];
  levels: { id: string; name: string; tier: string; system: { id: string; name: string } }[];
  teachers: { id: string; name: string }[];
  types: string[]; scopes: string[]; categories: string[]; tiers: string[];
}

/** Options for programme / subject / level / teacher dropdowns; `reload` after adding one */
export function useTaxonomy() {
  const [opts, setOpts] = useState<TaxOptions | null>(null);
  const reload = useCallback(() => api.get('/admin/taxonomy/options').then(r => setOpts(r.data)).catch(() => notify.error('Could not load programmes and subjects')), []);
  useEffect(() => { reload(); }, [reload]);
  return { opts, reload };
}

export const label = (s: string) => s.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase());
export const progName = (p: { name: string; shortName: string | null }) => p.shortName || p.name;
const select = 'h-[38px] w-full rounded-md border border-line bg-white px-2.5 text-[13.5px] text-navy outline-none focus:border-azure';

/**
 * Programme → subject → level pickers. Subjects and levels linked to the chosen programme come first.
 * `onAdd` opens the quick-add dialog for a missing programme or subject.
 */
export function TagPickers({ opts, value, onChange, onAdd, compact = false }: {
  opts: TaxOptions; value: { programmeId: string | null; subjectId: string | null; levelId: string | null };
  onChange: (v: { programmeId: string | null; subjectId: string | null; levelId: string | null }) => void;
  onAdd?: (kind: 'programme' | 'subject') => void; compact?: boolean;
}) {
  const prog = opts.programmes.find(p => p.id === value.programmeId);
  const subjects = prog ? [...opts.subjects].sort((a, b) => Number(prog.subjectIds.includes(b.id)) - Number(prog.subjectIds.includes(a.id)) || a.name.localeCompare(b.name)) : opts.subjects;
  const linked = (id: string) => !!prog?.subjectIds.includes(id);
  const levels = prog?.levelIds.length ? opts.levels.filter(l => prog.levelIds.includes(l.id)) : opts.levels;
  const field = (title: string, add: 'programme' | 'subject' | null, el: React.ReactNode) => (
    <label className="flex min-w-0 flex-col gap-1">
      {!compact && <span className="flex justify-between text-[13px] font-semibold text-navy">{title}{add && onAdd && <button type="button" onClick={() => onAdd(add)} className="font-semibold text-azure-strong hover:underline">+ New {add}</button>}</span>}
      {el}
    </label>
  );
  return (
    <div className={compact ? 'flex flex-wrap gap-2' : 'flex flex-col gap-3'}>
      {field('Programme', 'programme', (
        <select aria-label="Programme" className={select} value={value.programmeId ?? ''} onChange={e => onChange({ ...value, programmeId: e.target.value || null })}>
          <option value="">{compact ? 'Programme…' : 'No programme'}</option>
          {opts.programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      ))}
      {field('Subject', 'subject', (
        <select aria-label="Subject" className={select} value={value.subjectId ?? ''} onChange={e => onChange({ ...value, subjectId: e.target.value || null })}>
          <option value="">{compact ? 'Subject…' : 'No subject'}</option>
          {prog && prog.subjectIds.length > 0 && <optgroup label={`In ${progName(prog)}`}>{subjects.filter(s => linked(s.id)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>}
          <optgroup label={prog && prog.subjectIds.length ? 'Other subjects' : 'Subjects'}>{subjects.filter(s => !linked(s.id)).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
        </select>
      ))}
      {field('Level', null, (
        <select aria-label="Level" className={select} value={value.levelId ?? ''} onChange={e => onChange({ ...value, levelId: e.target.value || null })}>
          <option value="">{compact ? 'Any level' : 'Any level'}</option>
          {levels.map(l => <option key={l.id} value={l.id}>{l.name}{prog?.levelIds.length ? '' : ` · ${l.system.name}`}</option>)}
        </select>
      ))}
    </div>
  );
}

/** Add a programme or subject without leaving the page */
export function QuickAdd({ kind, opts, programmeId, onClose, onAdded }: {
  kind: 'programme' | 'subject'; opts: TaxOptions; programmeId?: string | null; onClose: () => void; onAdded: (id: string) => void;
}) {
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [type, setType] = useState('INTERNATIONAL_EXAM');
  const [category, setCategory] = useState('LANGUAGES');
  const [link, setLink] = useState(!!programmeId);
  const [saving, setSaving] = useState(false);
  const prog = opts.programmes.find(p => p.id === programmeId);
  async function save() {
    if (!name.trim()) { notify.error('Give it a name'); return; }
    setSaving(true);
    try {
      const r = kind === 'programme'
        ? await api.post('/admin/taxonomy/programmes', { name: name.trim(), shortName: shortName.trim() || undefined, type })
        : await api.post('/admin/taxonomy/subjects', { name: name.trim(), category, programmeIds: link && programmeId ? [programmeId] : [] });
      notify.success(kind === 'programme' ? 'Programme added' : 'Subject added');
      onAdded(r.data.id);
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not add it'); } finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title={kind === 'programme' ? 'New programme' : 'New subject'} description={kind === 'programme' ? 'An exam, curriculum or qualification students prepare for.' : 'Check the subject list first so you don’t add a duplicate.'}>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Name</span>
            <input autoFocus value={name} onChange={e => setName(e.target.value)} className={select} placeholder={kind === 'programme' ? 'IELTS — International English Language Testing System' : 'Financial Accounting'} />
          </label>
          {kind === 'programme' ? <>
            <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Short name students see</span><input value={shortName} onChange={e => setShortName(e.target.value)} className={select} placeholder="IELTS" /></label>
            <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Type</span>
              <select value={type} onChange={e => setType(e.target.value)} className={select}>{opts.types.map(t => <option key={t} value={t}>{label(t)}</option>)}</select>
            </label>
          </> : <>
            <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Category</span>
              <select value={category} onChange={e => setCategory(e.target.value)} className={select}>{opts.categories.map(t => <option key={t} value={t}>{label(t)}</option>)}</select>
            </label>
            {prog && <label className="flex items-center gap-2 text-[13px] text-navy"><input type="checkbox" checked={link} onChange={e => setLink(e.target.checked)} /> Add it to {progName(prog)}</label>}
          </>}
        </div>
        <DialogFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={save} loading={saving}>Add {kind}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
