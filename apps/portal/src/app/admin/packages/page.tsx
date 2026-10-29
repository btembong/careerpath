'use client';
import { useEffect, useMemo, useState } from 'react';
import { clsx } from 'clsx';
import { minorToMajor, majorToMinor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Course {
  id: string; title: string; status: string;
  isSoldIndividually: boolean; priceAmount: number | null; priceCurrency: string | null;
  teacher?: { email: string; name?: string | null; firstName?: string | null; lastName?: string | null } | null;
  programme?: { name: string; shortName: string | null } | null;
}
interface Cohort { id: string; name: string }
interface Pkg {
  id: string; name: string; description: string | null;
  priceAmount: number; currency: string; courseIds: string[];
  validityDays: number | null; categoryTags: string[]; isPublished: boolean;
  cohortId: string | null; cohort?: Cohort | null; mentorship: string | null;
  _count?: { purchases: number };
}
interface Form {
  name: string; description: string; currency: string; price: string; validityDays: string;
  courseIds: string[]; tags: string; cohortId: string; mentorship: string; isPublished: boolean;
}

const CURRENCIES = ['GHS', 'XAF', 'NGN', 'USD', 'XOF', 'LRD', 'KES', 'ZAR', 'RWF', 'UGX'];
const VALIDITY = [['90', '3 months'], ['180', '6 months'], ['365', '12 months'], ['', 'No end date']];
const money = (minor: number | null, cur: string | null) =>
  minor == null || !cur ? '—' : `${cur} ${minorToMajor(minor, cur).toLocaleString()}`;
const teacherName = (c: Course) =>
  c.teacher?.name || [c.teacher?.firstName, c.teacher?.lastName].filter(Boolean).join(' ') || c.teacher?.email?.split('@')[0] || '—';
const months = (d: number | null) => {
  if (!d) return 'No end date';
  const m = Math.round(d / 30.44);
  return m >= 1 && Math.abs(m * 30.44 - d) <= 3 ? `${m} month${m === 1 ? '' : 's'}` : `${d} days`;
};
const label = 'text-[13px] font-semibold text-navy';

function toForm(p?: Pkg): Form {
  return p ? {
    name: p.name, description: p.description ?? '', currency: p.currency,
    price: String(minorToMajor(p.priceAmount, p.currency)), validityDays: p.validityDays ? String(p.validityDays) : '',
    courseIds: p.courseIds, tags: p.categoryTags.join(', '), cohortId: p.cohortId ?? '', mentorship: p.mentorship ?? '', isPublished: p.isPublished,
  } : { name: 'New package', description: '', currency: 'GHS', price: '', validityDays: '365', courseIds: [], tags: '', cohortId: '', mentorship: '', isPublished: false };
}

export default function AdminPackagesPage() {
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(true);
  const [selId, setSelId] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<Form>(toForm());
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  async function loadPackages() {
    const r = await api.get('/admin/packages').catch(() => ({ data: [] }));
    setPackages(r.data ?? []);
    return (r.data ?? []) as Pkg[];
  }
  useEffect(() => {
    Promise.all([
      loadPackages().then(ps => { if (ps[0]) { setSelId(ps[0].id); setForm(toForm(ps[0])); } }),
      api.get('/platform-courses').then(r => setCourses(r.data ?? [])).catch(() => {}),
      api.get('/portals/admin/cohorts').then(r => setCohorts(r.data ?? [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const byId = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses]);
  const sel = selId && selId !== 'new' ? packages.find(p => p.id === selId) ?? null : null;
  const set = (patch: Partial<Form>) => setForm(f => ({ ...f, ...patch }));

  function pick(p: Pkg | 'new') {
    if (p === 'new') { setSelId('new'); setForm(toForm()); }
    else { setSelId(p.id); setForm(toForm(p)); }
  }

  // What the chosen courses cost one by one, in the package currency (courses priced in another currency can't be added up)
  const inPkg = form.courseIds.map(id => byId.get(id)).filter((c): c is Course => !!c);
  const sameCurrency = inPkg.filter(c => c.isSoldIndividually && c.priceAmount != null && c.priceCurrency === form.currency);
  const separateTotal = sameCurrency.reduce((t, c) => t + minorToMajor(c.priceAmount!, c.priceCurrency), 0);
  const priceNum = Number(form.price);
  const allPriced = inPkg.length > 0 && sameCurrency.length === inPkg.length;

  async function save(publish?: boolean) {
    if (!form.name.trim() || !(priceNum > 0)) { notify.error('Give the package a name and a price above zero'); return; }
    setSaving(true);
    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      priceAmount: majorToMinor(priceNum, form.currency),
      currency: form.currency,
      validityDays: form.validityDays ? Number(form.validityDays) : undefined,
      courseIds: form.courseIds,
      categoryTags: form.tags.split(',').map(t => t.trim()).filter(Boolean),
      cohortId: form.cohortId || null,
      mentorship: form.mentorship.trim() || null,
      ...(publish !== undefined && { isPublished: publish }),
    };
    try {
      if (selId === 'new') {
        const r = await api.post('/admin/packages', payload);
        if (publish) await api.patch(`/admin/packages/${r.data.id}`, { isPublished: true });
        notify.success('Package created');
        const ps = await loadPackages();
        const created = ps.find(p => p.id === r.data.id);
        if (created) pick(created);
      } else if (selId) {
        await api.patch(`/admin/packages/${selId}`, payload);
        notify.success(publish === true ? 'Package published' : publish === false ? 'Package unpublished' : 'Changes saved');
        const ps = await loadPackages();
        const updated = ps.find(p => p.id === selId);
        if (updated) setForm(toForm(updated));
      }
    } catch (err: any) {
      const m = err?.response?.data?.message;
      notify.error(Array.isArray(m) ? m.join(', ') : m ?? 'Could not save the package');
    } finally { setSaving(false); }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Packages" subtitle="Bundle courses with live classes, and set the price"
        actions={<Button size="sm" onClick={() => pick('new')}>New package</Button>} />

      <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
        <section aria-label="Packages" className="min-w-0 flex-[1_1_340px] overflow-hidden rounded-lg border border-line bg-white">
          {loading ? <p className="p-5 text-sm text-muted">Loading packages…</p>
            : !packages.length && selId !== 'new' ? <p className="p-5 text-sm text-ink2">No packages yet. Create the first one.</p>
            : (
              <>
                {selId === 'new' && (
                  <div className="flex items-center gap-3 border-b border-line bg-accent-soft px-4 py-3.5">
                    <span className="flex-1 text-sm font-semibold text-navy">{form.name || 'New package'}</span>
                    <span className="inline-flex h-[22px] items-center rounded border border-line bg-white px-1.5 text-[11.5px] font-semibold text-ink2">Not saved</span>
                  </div>
                )}
                {packages.map(p => (
                  <button key={p.id} type="button" onClick={() => pick(p)} aria-current={selId === p.id}
                    className={clsx('flex w-full items-center gap-3 border-b border-line px-4 py-3.5 text-left last:border-b-0 transition-colors',
                      selId === p.id ? 'bg-accent-soft' : 'bg-white hover:bg-subtle')}>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-navy">{p.name}</span>
                      <span className="block truncate text-[12.5px] text-muted">
                        {p.courseIds.length} course{p.courseIds.length === 1 ? '' : 's'} · {months(p.validityDays)}{p.cohort ? ' · live classes' : ''}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-bold text-navy">{money(p.priceAmount, p.currency)}</span>
                      <span className={clsx('mt-1 inline-flex h-[22px] items-center rounded px-1.5 text-[11.5px] font-semibold',
                        p.isPublished ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>
                        {p.isPublished ? 'Published' : 'Draft'}
                      </span>
                    </span>
                  </button>
                ))}
              </>
            )}
        </section>

        {selId && (
          <section aria-label="Package editor" className="flex min-w-0 flex-[999_1_520px] flex-col gap-5 rounded-lg border border-line bg-white p-5">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="min-w-0 flex-1 truncate text-lg font-bold text-navy">{form.name || 'New package'}</h2>
              {sel?._count && <span className="text-[13px] text-muted">{sel._count.purchases} sold</span>}
              <span className={clsx('inline-flex h-6 items-center rounded px-2 text-xs font-semibold',
                form.isPublished ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>
                {selId === 'new' ? 'Not saved' : form.isPublished ? 'Published' : 'Draft'}
              </span>
            </div>

            <div className="grid gap-3.5 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5 sm:col-span-2"><span className={label}>Name</span>
                <input value={form.name} onChange={e => set({ name: e.target.value })} className="input-base" /></label>
              <label className="flex flex-col gap-1.5 sm:col-span-2"><span className={label}>What students get</span>
                <textarea rows={2} value={form.description} onChange={e => set({ description: e.target.value })}
                  placeholder="For example: all four GCE O Level sciences with weekly live classes"
                  className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" /></label>
              <label className="flex flex-col gap-1.5"><span className={label}>Currency</span>
                <select value={form.currency} onChange={e => set({ currency: e.target.value })} className="input-base">{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label>
              <label className="flex flex-col gap-1.5"><span className={label}>Price</span>
                <input inputMode="decimal" value={form.price} onChange={e => set({ price: e.target.value })} placeholder="150" className="input-base" /></label>
              <label className="flex flex-col gap-1.5"><span className={label}>Access lasts</span>
                <select value={form.validityDays} onChange={e => set({ validityDays: e.target.value })} className="input-base">
                  {VALIDITY.map(([v, l]) => <option key={l} value={v}>{l}</option>)}
                </select></label>
              <label className="flex flex-col gap-1.5"><span className={label}>Programmes (for catalogue filters)</span>
                <input value={form.tags} onChange={e => set({ tags: e.target.value })} placeholder="GCE O Level, Sciences" className="input-base" /></label>
            </div>

            <div className="flex flex-col gap-2.5">
              <div className="flex items-center gap-2">
                <h3 className="text-[15px] font-semibold text-navy">Courses</h3>
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-accent-soft px-1.5 text-[11.5px] font-bold text-navy">{form.courseIds.length}</span>
                <span className="flex-1" />
                <Button size="sm" variant="secondary" onClick={() => setPicking(true)}>Add courses</Button>
              </div>
              {inPkg.length ? (
                <div className="overflow-x-auto rounded-md border border-line">
                  <table className="w-full min-w-[480px] border-collapse text-[13.5px]">
                    <thead><tr className="bg-subtle">
                      {['Course', 'Teacher', 'Price on its own', ''].map(h => <th key={h} className="border-b border-line px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {inPkg.map(c => (
                        <tr key={c.id}>
                          <td className="border-b border-line px-3 py-2.5 font-semibold text-navy">{c.title}</td>
                          <td className="border-b border-line px-3 py-2.5 text-ink2">{teacherName(c)}</td>
                          <td className="border-b border-line px-3 py-2.5 text-ink2">{c.isSoldIndividually ? money(c.priceAmount, c.priceCurrency) : 'Package only'}</td>
                          <td className="border-b border-line px-3 py-2.5 text-right">
                            <button type="button" onClick={() => set({ courseIds: form.courseIds.filter(id => id !== c.id) })}
                              className="text-[13px] font-semibold text-muted hover:text-error">Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="text-[13.5px] text-ink2">No courses yet. Add the courses this package unlocks.</p>}
              {allPriced && priceNum > 0 && (
                <p className="rounded-md bg-accent-soft px-3 py-2.5 text-[13px] text-ink2">
                  Bought one by one these cost <strong className="text-navy">{form.currency} {separateTotal.toLocaleString()}</strong>.{' '}
                  {separateTotal > priceNum
                    ? <>The package saves students <strong className="text-navy">{form.currency} {(separateTotal - priceNum).toLocaleString()}</strong>.</>
                    : <strong className="text-navy">The package costs more than buying the courses separately.</strong>}
                </p>
              )}
            </div>

            <label className="flex flex-col gap-1.5"><span className={label}>Live classes</span>
              <select value={form.cohortId} onChange={e => set({ cohortId: e.target.value })} className="input-base">
                <option value="">No live classes</option>
                {cohorts.map(c => <option key={c.id} value={c.id}>Cohort: {c.name}</option>)}
              </select>
              <span className="text-xs text-muted">Buyers join this cohort and its live classes.</span>
            </label>

            <label className="flex flex-col gap-1.5"><span className={label}>Mentorship</span>
              <input value={form.mentorship} onChange={e => set({ mentorship: e.target.value })} maxLength={80} placeholder="For example: Monthly 1-to-1 session" className="input-base" />
              <span className="text-xs text-muted">Leave empty if the package has no mentorship. Students only see it when it’s filled in.</span>
            </label>

            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              <Button size="sm" loading={saving} onClick={() => save()}>{selId === 'new' ? 'Create as draft' : 'Save changes'}</Button>
              {selId !== 'new' && (form.isPublished
                ? <Button size="sm" variant="danger" loading={saving} onClick={() => save(false)}>Unpublish</Button>
                : <Button size="sm" variant="secondary" loading={saving} onClick={() => save(true)}>Publish</Button>)}
              {selId === 'new' && <Button size="sm" variant="secondary" loading={saving} onClick={() => save(true)}>Create and publish</Button>}
            </div>
          </section>
        )}
      </div>

      <CoursePicker open={picking} courses={courses} chosen={form.courseIds}
        onClose={() => setPicking(false)} onDone={ids => { set({ courseIds: ids }); setPicking(false); }} />
    </div>
  );
}

function CoursePicker({ open, courses, chosen, onClose, onDone }: {
  open: boolean; courses: Course[]; chosen: string[]; onClose: () => void; onDone: (ids: string[]) => void;
}) {
  const [q, setQ] = useState('');
  const [ids, setIds] = useState<Set<string>>(new Set(chosen));
  useEffect(() => { if (open) { setIds(new Set(chosen)); setQ(''); } }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = courses.filter(c => c.status === 'PUBLISHED' && (!q.trim() || c.title.toLowerCase().includes(q.trim().toLowerCase())));
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      {open && (
        <DialogContent size="lg" title="Choose courses" description="Only published courses can go in a package">
          <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search courses" aria-label="Search courses" className="input-base mb-3" />
          <ul className="max-h-[360px] overflow-y-auto rounded-md border border-line">
            {list.map(c => (
              <li key={c.id} className="border-b border-line last:border-b-0">
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-subtle">
                  <input type="checkbox" checked={ids.has(c.id)} className="h-4 w-4 accent-[#3F6FE8]"
                    onChange={() => setIds(s => { const n = new Set(s); n.has(c.id) ? n.delete(c.id) : n.add(c.id); return n; })} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-navy">{c.title}</span>
                    <span className="block text-xs text-muted">{teacherName(c)}{c.programme ? ` · ${c.programme.shortName ?? c.programme.name}` : ''}</span>
                  </span>
                </label>
              </li>
            ))}
            {!list.length && <li className="p-4 text-sm text-muted">No published courses match.</li>}
          </ul>
          <DialogFooter>
            <span className="mr-auto text-[13px] text-ink2">{ids.size} chosen</span>
            <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button size="sm" onClick={() => onDone([...ids])}>Use these courses</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
