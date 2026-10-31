'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, Drawer, DrawerContent, DrawerSection } from '@/components/ui/Dialog';
import { QuickAdd, TagPickers, useTaxonomy, progName, type TaxOptions } from '@/components/admin/taxonomy';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Tags = { programmeId: string | null; subjectId: string | null; levelId: string | null };
interface Row {
  id: string; title: string; source: 'NATIVE' | 'WORDPRESS'; status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED'; hidden: boolean;
  wpCourseUrl: string | null; pulledAt: string | null; updatedAt: string;
  programme: { id: string; name: string; shortName: string | null } | null; subject: { id: string; name: string } | null; level: { id: string; name: string } | null;
  teacher: { id: string; name: string } | null; students: number;
  suggestion: (Tags & { from: string | null; label: string }) | null;
}
interface Stats { all: number; published: number; review: number; drafts: number; untagged: number; untaggedWithSuggestion: number; noTeacher: number; hidden: number; lastPull: { createdAt: string; kind: string } | null }

const STATUS: Record<Row['status'], string> = { DRAFT: 'Draft', PENDING_REVIEW: 'In review', PUBLISHED: 'Live', ARCHIVED: 'Archived' };
const sel = 'h-[34px] rounded-md border border-line bg-white px-2 text-[13px] text-navy outline-none focus:border-azure';
function ago(iso: string | null) {
  if (!iso) return '';
  const d = Math.floor((Date.now() - +new Date(iso)) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

export default function CourseManagementPage() {
  const router = useRouter();
  const { opts, reload } = useTaxonomy();
  const [stats, setStats] = useState<Stats | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [f, setF] = useState({ q: '', source: '', status: '', programmeId: '', untagged: false, noTeacher: false });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkTags, setBulkTags] = useState<Tags>({ programmeId: null, subjectId: null, levelId: null });
  const [bulkTeacher, setBulkTeacher] = useState('');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState<{ kind: 'programme' | 'subject'; programmeId?: string | null; then: (id: string) => void } | null>(null);
  const PAGE = 25;

  const load = useCallback(async () => {
    const params = { q: f.q || undefined, source: f.source || undefined, status: f.status || undefined, programmeId: f.programmeId || undefined, untagged: f.untagged ? '1' : undefined, noTeacher: f.noTeacher ? '1' : undefined, page, pageSize: PAGE };
    const [l, s] = await Promise.all([api.get('/admin/course-manage', { params }), api.get('/admin/course-manage/stats')]);
    setRows(l.data.rows); setTotal(l.data.total); setStats(s.data);
  }, [f, page]);
  useEffect(() => { const t = setTimeout(() => load().catch(() => notify.error('Could not load courses')), f.q ? 300 : 0); return () => clearTimeout(t); }, [load, f.q]);
  useEffect(() => { setPage(1); }, [f]);

  async function bulk(action: string, extra: Record<string, unknown> = {}, ids = [...picked]) {
    if (!ids.length) return;
    setBusy(true);
    try {
      const r = await api.post('/admin/course-manage/bulk', { courseIds: ids, action, ...extra });
      notify.success(`${r.data.updated} course${r.data.updated === 1 ? '' : 's'} updated`);
      setPicked(new Set()); await load();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not update'); } finally { setBusy(false); }
  }

  const allOnPage = !!rows?.length && rows.every(r => picked.has(r.id));
  const toggleAll = () => setPicked(prev => { const n = new Set(prev); rows?.forEach(r => allOnPage ? n.delete(r.id) : n.add(r.id)); return n; });
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Course management" subtitle="Every course, where it sits in the catalogue, and who teaches it"
        actions={<Button size="sm" onClick={() => setCreating(true)} disabled={!opts}>New course</Button>} />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-[22px]">
        <div className="-mb-1 flex flex-wrap justify-end gap-2">
          <Link href="/admin/courses/taxonomy" className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Taxonomy</Link>
          <Link href="/admin/courses/wordpress" className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Pull from WordPress</Link>
        </div>
        {stats && stats.untagged > 0 && (
          <section className="flex flex-wrap items-center gap-3.5 rounded-lg border border-azure bg-white px-[18px] py-4">
            <div className="min-w-0 flex-1">
              <p className="text-base font-extrabold text-navy">{stats.untagged} course{stats.untagged === 1 ? ' isn’t' : 's aren’t'} in the catalogue yet</p>
              <p className="mt-0.5 text-[13px] text-ink2">
                Without a programme and subject, students browsing by exam never see them.
                {stats.untaggedWithSuggestion ? ` We’ve suggested tags for ${stats.untaggedWithSuggestion} from their WordPress categories.` : ' Pull from WordPress to get suggested tags from their categories.'}
              </p>
            </div>
            {stats.untaggedWithSuggestion > 0
              ? <Button size="sm" onClick={() => setF({ ...f, untagged: true })}>Review suggested tags</Button>
              : <Link href="/admin/courses/wordpress" className="inline-flex h-9 items-center rounded-md bg-azure-strong px-3.5 text-[13.5px] font-semibold text-on-accent">Pull from WordPress</Link>}
          </section>
        )}

        <dl className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
          {[
            ['All courses', stats?.all, () => setF({ q: '', source: '', status: '', programmeId: '', untagged: false, noTeacher: false })],
            ['Live', stats?.published, () => setF({ ...f, status: 'PUBLISHED' })],
            ['In review', stats?.review, () => setF({ ...f, status: 'PENDING_REVIEW' })],
            ['Drafts', stats?.drafts, () => setF({ ...f, status: 'DRAFT' })],
            ['Not tagged', stats?.untagged, () => setF({ ...f, untagged: true })],
            ['No teacher yet', stats?.noTeacher, () => setF({ ...f, noTeacher: true })],
          ].map(([l, v, on]) => (
            <button key={l as string} onClick={on as () => void} className="rounded-lg border border-line bg-white px-3.5 py-3 text-left hover:border-azure">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{l as string}</dt>
              <dd className="mt-1 text-xl font-extrabold text-navy">{v == null ? '—' : String(v)}</dd>
            </button>
          ))}
        </dl>

        <section className="rounded-lg border border-line bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
            <input value={f.q} onChange={e => setF({ ...f, q: e.target.value })} placeholder="Search courses or teachers" aria-label="Search courses"
              className="h-[34px] min-w-[200px] flex-1 rounded-md border border-line px-2.5 text-[13px] text-navy outline-none focus:border-azure" />
            <select aria-label="Source" className={sel} value={f.source} onChange={e => setF({ ...f, source: e.target.value })}><option value="">Source: all</option><option value="NATIVE">Built on the portal</option><option value="WORDPRESS">From WordPress</option></select>
            <select aria-label="Status" className={sel} value={f.status} onChange={e => setF({ ...f, status: e.target.value })}><option value="">Status: all</option><option value="PUBLISHED">Live</option><option value="PENDING_REVIEW">In review</option><option value="DRAFT">Draft</option><option value="HIDDEN">Hidden from catalogue</option><option value="ARCHIVED">Archived</option></select>
            <select aria-label="Programme" className={clsx(sel, 'max-w-[200px]')} value={f.programmeId} onChange={e => setF({ ...f, programmeId: e.target.value })}><option value="">Programme: all</option>{opts?.programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
            {([['untagged', 'Not tagged only'], ['noTeacher', 'No teacher yet']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setF({ ...f, [k]: !f[k] })} aria-pressed={f[k]}
                className={clsx('h-[34px] rounded-md px-2.5 text-[13px]', f[k] ? 'border border-azure bg-accent-soft font-semibold text-navy' : 'border border-line text-navy')}>{l}</button>
            ))}
          </div>

          {picked.size > 0 && opts && (
            <div className="flex flex-wrap items-center gap-2 border-b border-azure bg-accent-soft px-4 py-2.5 text-[13px]">
              <strong className="text-navy">{picked.size} selected</strong>
              <span className="text-ink2">Put them in</span>
              <TagPickers compact opts={opts} value={bulkTags} onChange={setBulkTags} />
              <Button size="sm" loading={busy} disabled={!bulkTags.programmeId && !bulkTags.subjectId && !bulkTags.levelId}
                onClick={() => bulk('tag', Object.fromEntries(Object.entries(bulkTags).filter(([, v]) => v)))}>Apply</Button>
              <button onClick={() => setAdding({ kind: 'programme', then: id => { reload(); setBulkTags(t => ({ ...t, programmeId: id })); } })} className="font-semibold text-azure-strong hover:underline">+ Programme</button>
              <button onClick={() => setAdding({ kind: 'subject', programmeId: bulkTags.programmeId, then: id => { reload(); setBulkTags(t => ({ ...t, subjectId: id })); } })} className="font-semibold text-azure-strong hover:underline">+ Subject</button>
              <span className="flex-1" />
              {rows?.some(r => picked.has(r.id) && r.suggestion) && <button onClick={() => bulk('accept')} className="font-semibold text-azure-strong hover:underline">Accept suggestions</button>}
              <select aria-label="Teacher" className={sel} value={bulkTeacher} onChange={e => { const v = e.target.value; setBulkTeacher(''); if (v) bulk('teacher', { teacherId: v === 'none' ? null : v }); }}>
                <option value="">Change teacher…</option><option value="none">No teacher yet</option>{opts.teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <button onClick={() => bulk('publish')} className="font-semibold text-azure-strong hover:underline">Publish</button>
              <button onClick={() => bulk('unpublish')} className="font-semibold text-azure-strong hover:underline">Unpublish</button>
              <button onClick={() => bulk('hide')} className="font-semibold text-azure-strong hover:underline">Hide</button>
              <button onClick={() => setPicked(new Set())} className="text-ink2 hover:text-navy" aria-label="Clear selection">✕</button>
            </div>
          )}

          {!rows ? <div className="m-4 h-64 rounded-md bg-subtle animate-pulse" /> : !rows.length ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink2">No courses match.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-[13.5px]">
                <thead><tr>
                  <th className="w-10 border-b border-line px-3.5 py-2.5"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={toggleAll} /></th>
                  {['Course', 'Programme · subject · level', 'Teacher', 'Students', 'Status', ''].map(h => <th key={h} className="border-b border-line px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{h}</th>)}
                </tr></thead>
                <tbody>
                  {rows.map(r => {
                    const on = picked.has(r.id);
                    const tagged = !!(r.programme && r.subject);
                    return (
                      <tr key={r.id} className={clsx(on ? 'bg-[#F6F9FF]' : 'hover:bg-subtle')}>
                        <td className="border-b border-line px-3.5 py-3 align-top"><input type="checkbox" aria-label={`Select ${r.title}`} checked={on} onChange={() => setPicked(p => { const n = new Set(p); on ? n.delete(r.id) : n.add(r.id); return n; })} /></td>
                        <td className="max-w-[320px] border-b border-line px-3.5 py-3 align-top">
                          <button onClick={() => setOpenId(r.id)} className="text-left font-semibold text-navy hover:underline">{r.title}</button>
                          <p className="text-xs text-muted">{r.source === 'WORDPRESS' ? `WordPress${r.pulledAt ? ` · pulled ${ago(r.pulledAt)}` : ''}` : 'Built on the portal'}</p>
                        </td>
                        <td className="border-b border-line px-3.5 py-3 align-top">
                          {r.programme || r.subject ? (
                            <span className="text-navy">{[r.programme && progName(r.programme), r.subject?.name, r.level?.name].filter(Boolean).join(' · ')}{!tagged && <span className="ml-1 text-xs text-muted">(incomplete)</span>}</span>
                          ) : <span className="inline-flex rounded border border-dashed border-line px-2 py-0.5 text-[12.5px] text-muted">Not tagged</span>}
                          {!tagged && r.suggestion && (
                            <p className="mt-1 text-xs text-azure-strong">Suggested: {r.suggestion.label} · <button onClick={() => bulk('accept', {}, [r.id])} className="font-semibold underline">Accept</button></p>
                          )}
                        </td>
                        <td className="border-b border-line px-3.5 py-3 align-top text-ink2">{r.teacher?.name ?? <span className="text-muted">CareerPath (no teacher yet)</span>}</td>
                        <td className="border-b border-line px-3.5 py-3 align-top text-ink2">{r.students || '—'}</td>
                        <td className="border-b border-line px-3.5 py-3 align-top">
                          <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-semibold', r.status === 'PUBLISHED' && !r.hidden ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>{r.hidden ? 'Hidden' : STATUS[r.status]}</span>
                        </td>
                        <td className="border-b border-line px-3.5 py-3 text-right align-top"><button onClick={() => setOpenId(r.id)} className="font-semibold text-azure-strong hover:underline">Open</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="flex items-center justify-between px-4 py-3 text-[12.5px] text-muted">
            <span>{total ? `Showing ${(page - 1) * PAGE + 1}–${Math.min(total, page * PAGE)} of ${total}` : ''}</span>
            <span className="flex items-center gap-2">
              <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded px-2 py-1 font-semibold text-navy disabled:opacity-40">‹ Previous</button>
              <span>Page {page} of {pages}</span>
              <button disabled={page >= pages} onClick={() => setPage(p => p + 1)} className="rounded px-2 py-1 font-semibold text-navy disabled:opacity-40">Next ›</button>
            </span>
          </div>
        </section>
      </div>

      {openId && opts && <CourseDrawer id={openId} opts={opts} onClose={() => setOpenId(null)} onSaved={load}
        onAdd={(kind, programmeId, then) => setAdding({ kind, programmeId, then: id => { reload(); then(id); } })} />}
      {creating && opts && <NewCourse opts={opts} onClose={() => setCreating(false)}
        onCreated={id => router.push(`/admin/courses/${id}/builder`)}
        onAdd={(kind, programmeId, then) => setAdding({ kind, programmeId, then: id => { reload(); then(id); } })} />}
      {adding && opts && <QuickAdd kind={adding.kind} opts={opts} programmeId={adding.programmeId} onClose={() => setAdding(null)} onAdded={id => { adding.then(id); setAdding(null); }} />}
    </div>
  );
}

interface Detail {
  id: string; title: string; source: string; status: Row['status']; catalogueHidden: boolean; wpCourseUrl: string | null; wpCategories: string[]; wpAuthorEmail: string | null;
  programmeId: string | null; subjectId: string | null; levelId: string | null; teacher: { id: string; name: string } | null; students: number; modules: number;
  suggestion: (Tags & { from: string | null }) | null;
}

function CourseDrawer({ id, opts, onClose, onSaved, onAdd }: { id: string; opts: TaxOptions; onClose: () => void; onSaved: () => Promise<void>; onAdd: (kind: 'programme' | 'subject', programmeId: string | null, then: (id: string) => void) => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [tags, setTags] = useState<Tags>({ programmeId: null, subjectId: null, levelId: null });
  const [teacher, setTeacher] = useState('none');
  const [status, setStatus] = useState<Row['status']>('DRAFT');
  const [listed, setListed] = useState(true);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.get(`/admin/course-manage/${id}`).then(r => {
      const x: Detail = r.data; setD(x);
      setTags({ programmeId: x.programmeId, subjectId: x.subjectId, levelId: x.levelId });
      setTeacher(x.teacher?.id ?? 'none'); setStatus(x.status); setListed(!x.catalogueHidden);
    }).catch(() => notify.error('Could not open this course'));
  }, [id]);

  async function save() {
    if (!d) return;
    setSaving(true);
    const one = (action: string, extra: Record<string, unknown> = {}) => api.post('/admin/course-manage/bulk', { courseIds: [d.id], action, ...extra });
    try {
      if (tags.programmeId !== d.programmeId || tags.subjectId !== d.subjectId || tags.levelId !== d.levelId) await one('tag', tags);
      if (teacher !== (d.teacher?.id ?? 'none')) await one('teacher', { teacherId: teacher === 'none' ? null : teacher });
      if (status !== d.status) await one(status === 'PUBLISHED' ? 'publish' : status === 'ARCHIVED' ? 'archive' : 'unpublish');
      if (listed === d.catalogueHidden) await one(listed ? 'show' : 'hide');
      notify.success('Course saved'); await onSaved(); onClose();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not save'); } finally { setSaving(false); }
  }
  const s = d?.suggestion;
  const sName = s ? [opts.programmes.find(p => p.id === s.programmeId), opts.subjects.find(x => x.id === s.subjectId), opts.levels.find(l => l.id === s.levelId)].filter(Boolean).map(x => 'shortName' in x! && x.shortName ? x.shortName : x!.name).join(' · ') : '';

  return (
    <Drawer open onOpenChange={o => { if (!o) onClose(); }}>
      <DrawerContent title={d?.title ?? 'Course'} description={d ? `${d.source === 'WORDPRESS' ? 'WordPress course' : 'Built on the portal'} · ${d.students} student${d.students === 1 ? '' : 's'}${d.source === 'NATIVE' ? ` · ${d.modules} module${d.modules === 1 ? '' : 's'}` : ''}` : ' '}
        footer={<>
          {d?.wpCourseUrl && <a href={d.wpCourseUrl} target="_blank" rel="noreferrer" className="inline-flex h-9 items-center rounded-md border border-line px-3 text-[13px] font-semibold text-navy">Open on WordPress</a>}
          {d?.source === 'NATIVE' && <Link href={`/admin/courses/${d.id}/builder`} className="inline-flex h-9 items-center rounded-md border border-line px-3 text-[13px] font-semibold text-navy">Course builder</Link>}
          <span className="flex-1" />
          <Button size="sm" onClick={save} loading={saving} disabled={!d}>Save</Button>
        </>}>
        {!d ? <div className="h-64 rounded bg-subtle animate-pulse" /> : <>
          {s && sName && (tags.programmeId !== s.programmeId || tags.subjectId !== s.subjectId) && (
            <p className="rounded-md bg-accent-soft px-3 py-2.5 text-[13px] text-navy">
              Suggested from WordPress {s.from ? `(“${s.from}”)` : ''}: <strong>{sName}</strong> —{' '}
              <button onClick={() => setTags({ programmeId: tags.programmeId ?? s.programmeId, subjectId: tags.subjectId ?? s.subjectId, levelId: tags.levelId ?? s.levelId })} className="font-semibold text-azure-strong underline">Use this</button>
            </p>
          )}
          <TagPickers opts={opts} value={tags} onChange={setTags} onAdd={kind => onAdd(kind, tags.programmeId, id => setTags(t => kind === 'programme' ? { ...t, programmeId: id } : { ...t, subjectId: id }))} />
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Teacher</span>
            <select className="input-base" value={teacher} onChange={e => setTeacher(e.target.value)}>
              <option value="none">CareerPath (no teacher yet)</option>{opts.teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
            {d.wpAuthorEmail && !d.teacher && <span className="text-xs text-muted">WordPress author: {d.wpAuthorEmail} (no portal teacher with this email)</span>}
          </label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Status</span>
            <select className="input-base" value={status} onChange={e => setStatus(e.target.value as Row['status'])}>
              <option value="DRAFT">Draft</option>{d.status === 'PENDING_REVIEW' && <option value="PENDING_REVIEW">In review</option>}<option value="PUBLISHED">Live</option><option value="ARCHIVED">Archived</option>
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 rounded-md border border-line px-3.5 py-2.5 text-[13.5px] text-navy">
            <span>Show in the catalogue<span className="block text-xs text-muted">Off: students who have it keep it, but it isn’t listed</span></span>
            <input type="checkbox" checked={listed} onChange={e => setListed(e.target.checked)} />
          </label>
          {d.wpCategories.length > 0 && <DrawerSection title="WordPress categories"><div className="flex flex-wrap gap-1.5">{d.wpCategories.map(c => <span key={c} className="rounded border border-line bg-subtle px-2 py-1 text-xs text-ink2">{c}</span>)}</div></DrawerSection>}
        </>}
      </DrawerContent>
    </Drawer>
  );
}

function NewCourse({ opts, onClose, onCreated, onAdd }: { opts: TaxOptions; onClose: () => void; onCreated: (id: string) => void; onAdd: (kind: 'programme' | 'subject', programmeId: string | null, then: (id: string) => void) => void }) {
  const [title, setTitle] = useState('');
  const [tags, setTags] = useState<Tags>({ programmeId: null, subjectId: null, levelId: null });
  const [teacherId, setTeacherId] = useState('');
  const [saving, setSaving] = useState(false);
  async function create() {
    if (!title.trim()) { notify.error('Give the course a title'); return; }
    if (!tags.programmeId || !tags.subjectId) { notify.error('Choose a programme and subject so students can find it'); return; }
    setSaving(true);
    try {
      const r = await api.post('/platform-courses', { title: title.trim(), programmeId: tags.programmeId, subjectId: tags.subjectId, levelId: tags.levelId || undefined, teacherId: teacherId || undefined });
      notify.success('Course created'); onCreated(r.data.id);
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not create the course'); } finally { setSaving(false); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title="New course" description="Place it in the catalogue now — the teacher builds it, a reviewer approves it.">
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Title</span><input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. WASSCE Physics — Mechanics" className="input-base" /></label>
          <TagPickers opts={opts} value={tags} onChange={setTags} onAdd={kind => onAdd(kind, tags.programmeId, id => setTags(t => kind === 'programme' ? { ...t, programmeId: id } : { ...t, subjectId: id }))} />
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Teacher</span>
            <select className="input-base" value={teacherId} onChange={e => setTeacherId(e.target.value)}><option value="">Choose later</option>{opts.teachers.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
          </label>
        </div>
        <DialogFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" onClick={create} loading={saving}>Create and open the builder</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
