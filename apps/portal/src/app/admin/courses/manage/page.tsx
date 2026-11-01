'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, Drawer, DrawerContent, DrawerSection } from '@/components/ui/Dialog';
import { QuickAdd, TagPickers, useTaxonomy, progName, type TaxOptions } from '@/components/admin/taxonomy';
import { PricingSettings } from '@/components/admin/PricingSettings';
import { majorToMinor, minorToMajor } from '@cpa/shared';
import { notify } from '@/lib/notify';
import { money } from '@/lib/money';
import api from '@/lib/api';

type Tags = { programmeId: string | null; subjectId: string | null; levelId: string | null };
interface Row {
  id: string; title: string; source: 'NATIVE' | 'WORDPRESS'; status: 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED'; hidden: boolean;
  wpCourseUrl: string | null; pulledAt: string | null; updatedAt: string;
  programme: { id: string; name: string; shortName: string | null } | null; subject: { id: string; name: string } | null; level: { id: string; name: string } | null;
  teacher: { id: string; name: string } | null; students: number;
  suggestion: (Tags & { from: string | null; label: string }) | null;
  selling: Selling; price: Money | null; proposed: Money | null; packages: string[];
  content: { lessons: number; quizzes: number; state: ContentState };
}
type Selling = 'paid' | 'free' | 'package' | 'notsale';
type ContentState = 'built' | 'imported' | 'website' | 'empty' | 'importing';
type Money = { amount: number; currency: string };
interface Stats { all: number; published: number; review: number; drafts: number; untagged: number; untaggedWithSuggestion: number; noTeacher: number; hidden: number; lastPull: { createdAt: string; kind: string } | null; onSale: number; notOnSale: number; proposed: number; websiteOnly: number }
interface Pkg { id: string; name: string; priceAmount: number; currency: string }

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : w.endsWith('z') ? 'zes' : 's'}`;
const priceText = (r: { selling: Selling; price: Money | null }) => r.selling === 'paid' && r.price ? money(r.price.amount, r.price.currency) : r.selling === 'free' ? 'Free' : r.selling === 'package' ? 'Package only' : 'Not on sale';
const contentText = (c: Row['content']) => c.state === 'website' ? 'Website only' : c.state === 'empty' ? 'Nothing in Tutor' : c.state === 'importing' ? 'Importing…'
  : c.lessons || c.quizzes ? [c.lessons ? plural(c.lessons, 'lesson') : null, c.quizzes ? plural(c.quizzes, 'quiz') : null].filter(Boolean).join(' · ') : 'No lessons yet';

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
  const [f, setF] = useState({ q: '', source: '', status: '', programmeId: '', untagged: false, noTeacher: false, price: '', content: '' });
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [pricing, setPricing] = useState(false);
  const [settings, setSettings] = useState(false);
  useEffect(() => { api.get('/admin/packages').then(r => setPkgs(r.data ?? [])).catch(() => {}); }, []);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkTags, setBulkTags] = useState<Tags>({ programmeId: null, subjectId: null, levelId: null });
  const [bulkTeacher, setBulkTeacher] = useState('');
  const [busy, setBusy] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [adding, setAdding] = useState<{ kind: 'programme' | 'subject'; programmeId?: string | null; then: (id: string) => void } | null>(null);
  const PAGE = 25;

  const load = useCallback(async () => {
    const params = { q: f.q || undefined, source: f.source || undefined, status: f.status || undefined, programmeId: f.programmeId || undefined, untagged: f.untagged ? '1' : undefined, noTeacher: f.noTeacher ? '1' : undefined, price: f.price || undefined, content: f.content || undefined, page, pageSize: PAGE };
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
      notify.success(action === 'import' ? `${plural(r.data.updated, 'course')} queued for import` : `${plural(r.data.updated, 'course')} updated`, action === 'import' ? { description: 'Follow it in Course content from Tutor.' } : undefined);
      setPicked(new Set()); await load();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not update'); } finally { setBusy(false); }
  }

  const allOnPage = !!rows?.length && rows.every(r => picked.has(r.id));
  const toggleAll = () => setPicked(prev => { const n = new Set(prev); rows?.forEach(r => allOnPage ? n.delete(r.id) : n.add(r.id)); return n; });
  const pages = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Course management" subtitle="Every course: where it sits, who teaches it, how it’s sold and what’s in it"
        actions={<Button size="sm" onClick={() => setCreating(true)} disabled={!opts}>New course</Button>} />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-[22px]">
        <div className="-mb-1 flex flex-wrap justify-end gap-2">
          <button onClick={() => setSettings(true)} className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Pricing settings</button>
          <Link href="/admin/courses/taxonomy" className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Taxonomy</Link>
          <Link href="/admin/courses/wordpress" className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Pull from WordPress</Link>
          <Link href="/admin/courses/import" className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Course content from Tutor</Link>
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
            ['All courses', stats?.all, () => setF({ q: '', source: '', status: '', programmeId: '', untagged: false, noTeacher: false, price: '', content: '' })],
            ['Live', stats?.published, () => setF({ ...f, status: 'PUBLISHED' })],
            ['In review', stats?.review, () => setF({ ...f, status: 'PENDING_REVIEW' })],
            ['Drafts', stats?.drafts, () => setF({ ...f, status: 'DRAFT' })],
            ['Not tagged', stats?.untagged, () => setF({ ...f, untagged: true })],
            ['No teacher yet', stats?.noTeacher, () => setF({ ...f, noTeacher: true })],
            ['On sale', stats?.onSale, () => setF({ ...f, price: 'paid' })],
            ['Not on sale', stats?.notOnSale, () => setF({ ...f, price: 'notsale' })],
            ['Price proposed', stats?.proposed, () => setF({ ...f, price: 'proposed' })],
            ['Website only', stats?.websiteOnly, () => setF({ ...f, content: 'website' })],
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
            <select aria-label="Price" className={sel} value={f.price} onChange={e => setF({ ...f, price: e.target.value })}><option value="">Price: all</option><option value="paid">Sold on its own</option><option value="free">Free</option><option value="package">Package only</option><option value="notsale">Not on sale</option><option value="proposed">Price proposed</option></select>
            <select aria-label="Content" className={sel} value={f.content} onChange={e => setF({ ...f, content: e.target.value })}><option value="">Content: all</option><option value="imported">Imported from Tutor</option><option value="website">Website only</option><option value="nolessons">No lessons</option></select>
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
          {picked.size > 0 && (
            <div className="flex flex-wrap items-center gap-3.5 border-b border-line bg-[#F6F9FF] px-4 py-2.5 text-[13px]">
              <span className="text-ink2">Selling and content:</span>
              <button onClick={() => setPricing(true)} className="font-semibold text-azure-strong hover:underline">Set price</button>
              <button onClick={() => bulk('free')} className="font-semibold text-azure-strong hover:underline">Make free</button>
              <button onClick={() => bulk('unsell')} className="font-semibold text-azure-strong hover:underline">Stop selling on its own</button>
              {rows?.some(r => picked.has(r.id) && r.proposed) && <>
                <button onClick={() => bulk('approvePrice')} className="font-semibold text-azure-strong hover:underline">Approve proposed prices</button>
                <button onClick={() => bulk('declinePrice')} className="font-semibold text-muted hover:text-navy hover:underline">Decline them</button>
              </>}
              <select aria-label="Add to package" className={sel} value="" onChange={e => { if (e.target.value) bulk('addToPackage', { packageId: e.target.value }); }}>
                <option value="">Add to package…</option>{pkgs.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              {rows?.some(r => picked.has(r.id) && r.source === 'WORDPRESS') && <button onClick={() => bulk('import')} className="font-semibold text-azure-strong hover:underline">Import content</button>}
            </div>
          )}

          {!rows ? <div className="m-4 h-64 rounded-md bg-subtle animate-pulse" /> : !rows.length ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink2">No courses match.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] border-collapse text-[13.5px]">
                <thead><tr>
                  <th className="w-10 border-b border-line px-3.5 py-2.5"><input type="checkbox" aria-label="Select all on this page" checked={allOnPage} onChange={toggleAll} /></th>
                  {['Course', 'Programme · subject · level', 'Teacher', 'Price', 'Content', 'Students', 'Status', ''].map(h => <th key={h} className="border-b border-line px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{h}</th>)}
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
                        <td className="border-b border-line px-3.5 py-3 align-top">
                          <span className={clsx(r.selling === 'notsale' ? 'inline-flex rounded border border-dashed border-azure px-2 py-0.5 text-[12.5px] font-semibold text-azure-strong' : r.selling === 'free' ? 'font-semibold text-[#2F57C9]' : 'font-semibold text-navy')}>{priceText(r)}</span>
                          {r.proposed && <p className="mt-1 text-xs text-azure-strong">Proposed {money(r.proposed.amount, r.proposed.currency)} · <button onClick={() => bulk('approvePrice', {}, [r.id])} className="font-semibold underline">Approve</button></p>}
                          {r.selling !== 'package' && r.packages.length > 0 && <p className="text-xs text-muted">also in {r.packages.length === 1 ? r.packages[0] : plural(r.packages.length, 'package')}</p>}
                        </td>
                        <td className="border-b border-line px-3.5 py-3 align-top text-ink2">{contentText(r.content)}</td>
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

      {opts && <PricingSettings open={settings} programmes={opts.programmes} packageOnly={stats?.notOnSale ?? 0} onClose={() => setSettings(false)} onApplied={load} />}
      <SetPrice open={pricing} count={picked.size} onClose={() => setPricing(false)} onSave={async x => { setPricing(false); await bulk('price', x); }} />
      {openId && opts && <CourseDrawer id={openId} opts={opts} pkgs={pkgs} onClose={() => setOpenId(null)} onSaved={load}
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
  language: string | null;
  selling: Selling; price: Money | null; accessMonths: number | null; proposed: (Money & { at: string | null }) | null;
  packages: { id: string; name: string; priceAmount: number; currency: string }[];
  content: { lessons: number; quizzes: number; questions: number; state: ContentState; importedAt: string | null; lastImport: { status: string; at: string | null } | null };
  review: { reviewer: string | null; sharePct: number | null; status: string | null; reviewedAt: string | null; submittedAt: string | null };
}

const CURRENCIES = ['GHS', 'XAF', 'XOF', 'NGN', 'KES', 'USD'];

/** Price, currency and months of access for one or more courses */
function SetPrice({ open, count, onClose, onSave }: { open: boolean; count: number; onClose: () => void; onSave: (x: { amount: number; currency: string; accessMonths: number | null }) => void }) {
  const [amount, setAmount] = useState(''), [currency, setCurrency] = useState('GHS'), [months, setMonths] = useState('12');
  return (
    <Dialog open={open} onOpenChange={o => !o && onClose()}>
      <DialogContent title={`Set the price for ${plural(count, 'course')}`} description="They can then be bought on their own. Courses in packages stay in them.">
        <div className="grid grid-cols-[1fr_110px_140px] gap-3">
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Price</span><input inputMode="decimal" autoFocus value={amount} onChange={e => setAmount(e.target.value)} placeholder="e.g. 150" className="input-base" /></label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Currency</span><select value={currency} onChange={e => setCurrency(e.target.value)} className="input-base">{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select></label>
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Access</span><select value={months} onChange={e => setMonths(e.target.value)} className="input-base"><option value="">No time limit</option>{[1, 3, 6, 12, 24].map(m => <option key={m} value={m}>{m} month{m === 1 ? '' : 's'}</option>)}</select></label>
        </div>
        <DialogFooter><Button variant="secondary" size="sm" onClick={onClose}>Cancel</Button><Button size="sm" disabled={!(Number(amount) > 0)} onClick={() => onSave({ amount: majorToMinor(Number(amount), currency), currency, accessMonths: months ? Number(months) : null })}>Set price</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CourseDrawer({ id, opts, pkgs, onClose, onSaved, onAdd }: { id: string; opts: TaxOptions; pkgs: Pkg[]; onClose: () => void; onSaved: () => Promise<void>; onAdd: (kind: 'programme' | 'subject', programmeId: string | null, then: (id: string) => void) => void }) {
  const [d, setD] = useState<Detail | null>(null);
  const [tags, setTags] = useState<Tags>({ programmeId: null, subjectId: null, levelId: null });
  const [teacher, setTeacher] = useState('none');
  const [status, setStatus] = useState<Row['status']>('DRAFT');
  const [listed, setListed] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'own' | 'free' | 'none'>('none');
  const [amount, setAmount] = useState(''), [currency, setCurrency] = useState('GHS'), [months, setMonths] = useState('12');
  const [addPkg, setAddPkg] = useState('');
  const [language, setLanguage] = useState('');
  useEffect(() => {
    api.get(`/admin/course-manage/${id}`).then(r => {
      const x: Detail = r.data; setD(x);
      setTags({ programmeId: x.programmeId, subjectId: x.subjectId, levelId: x.levelId });
      setTeacher(x.teacher?.id ?? 'none'); setStatus(x.status); setListed(!x.catalogueHidden);
      setMode(x.selling === 'paid' ? 'own' : x.selling === 'free' ? 'free' : 'none');
      if (x.price) { setAmount(String(minorToMajor(x.price.amount, x.price.currency))); setCurrency(x.price.currency); }
      setMonths(x.accessMonths == null ? '' : String(x.accessMonths));
      setLanguage(x.language ?? '');
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
      // Selling
      const wasMode = d.selling === 'paid' ? 'own' : d.selling === 'free' ? 'free' : 'none';
      const newAmount = mode === 'own' ? majorToMinor(Number(amount), currency) : 0;
      if (mode === 'own' && !(Number(amount) > 0)) throw { response: { data: { message: 'Enter a price, or choose Free or Not sold on its own' } } };
      if (mode === 'own' && (wasMode !== 'own' || newAmount !== d.price?.amount || currency !== d.price?.currency || (months ? Number(months) : null) !== d.accessMonths)) await one('price', { amount: newAmount, currency, accessMonths: months ? Number(months) : null });
      if (mode === 'free' && wasMode !== 'free') await one('free');
      if (mode === 'none' && wasMode !== 'none') await one('unsell');
      if (addPkg) await one('addToPackage', { packageId: addPkg });
      if ((language || null) !== d.language) await api.patch(`/platform-courses/${d.id}`, { language: language || null });
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
          {(d?.source === 'NATIVE' || d?.content.importedAt) && <Link href={`/admin/courses/${d!.id}/builder`} className="inline-flex h-9 items-center rounded-md border border-line px-3 text-[13px] font-semibold text-navy">Course builder</Link>}
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
          <label className="flex flex-col gap-1"><span className="text-[13px] font-semibold text-navy">Teaching language</span>
            <select className="input-base" value={language} onChange={e => setLanguage(e.target.value)}>
              <option value="">Not shown</option>{['English', 'French', 'Bilingual (English and French)'].concat(language && !['English', 'French', 'Bilingual (English and French)'].includes(language) ? [language] : []).map(l => <option key={l}>{l}</option>)}
            </select>
          </label>
          <label className="flex items-center justify-between gap-3 rounded-md border border-line px-3.5 py-2.5 text-[13.5px] text-navy">
            <span>Show in the catalogue<span className="block text-xs text-muted">Off: students who have it keep it, but it isn’t listed</span></span>
            <input type="checkbox" checked={listed} onChange={e => setListed(e.target.checked)} />
          </label>
          <DrawerSection title="Selling">
            <div role="radiogroup" aria-label="How it’s sold" className="flex flex-wrap gap-1.5 text-[13px]">
              {([['own', 'On its own'], ['free', 'Free'], ['none', d.packages.length ? 'Package only' : 'Not sold on its own']] as const).map(([k, l]) => (
                <button key={k} type="button" role="radio" aria-checked={mode === k} onClick={() => setMode(k)} className={clsx('rounded-md px-2.5 py-1.5', mode === k ? 'bg-navy font-semibold text-white' : 'border border-line text-navy hover:bg-subtle')}>{l}</button>
              ))}
            </div>
            {mode === 'own' && (
              <div className="mt-2 grid grid-cols-[1fr_90px_130px] gap-2">
                <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Price" aria-label="Price" className="input-base" />
                <select value={currency} onChange={e => setCurrency(e.target.value)} aria-label="Currency" className="input-base">{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>
                <select value={months} onChange={e => setMonths(e.target.value)} aria-label="Access" className="input-base"><option value="">No time limit</option>{[1, 3, 6, 12, 24].map(m => <option key={m} value={m}>{m} month{m === 1 ? '' : 's'} access</option>)}</select>
              </div>
            )}
            {mode === 'free' && <p className="mt-1.5 text-xs text-muted">{d.source === 'WORDPRESS' ? 'Anyone can join it.' : 'Students enrol for free.'}</p>}
            {mode === 'none' && !d.packages.length && <p className="mt-1.5 text-xs text-azure-strong">Not on sale: add it to a package below, or sell it on its own.</p>}
            {d.proposed && (
              <p className="mt-2 text-[12.5px] text-azure-strong">Teacher proposed {money(d.proposed.amount, d.proposed.currency)}{d.proposed.at ? ` on ${new Date(d.proposed.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''} ·{' '}
                <button onClick={async () => { await api.post('/admin/course-manage/bulk', { courseIds: [d.id], action: 'approvePrice' }); notify.success('Price approved'); await onSaved(); onClose(); }} className="font-semibold underline">Approve</button> ·{' '}
                <button onClick={async () => { await api.post('/admin/course-manage/bulk', { courseIds: [d.id], action: 'declinePrice' }); notify.success('Proposal declined'); await onSaved(); onClose(); }} className="underline">Decline</button>
              </p>
            )}
          </DrawerSection>
          <DrawerSection title="In packages" count={d.packages.length}>
            {d.packages.length ? <div className="flex flex-col gap-1">{d.packages.map(p => <p key={p.id} className="flex justify-between text-[13px] text-navy"><span>{p.name}</span><span className="text-muted">{money(p.priceAmount, p.currency)}</span></p>)}</div> : <p className="text-[13px] text-ink2">Not in any package.</p>}
            <select value={addPkg} onChange={e => setAddPkg(e.target.value)} aria-label="Add to package" className="input-base mt-2 h-9 w-full">
              <option value="">Add to a package…</option>{pkgs.filter(p => !d.packages.some(x => x.id === p.id)).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </DrawerSection>
          <DrawerSection title="Content">
            <p className="text-[13px] text-ink2">
              {d.content.state === 'website' ? 'Not imported yet — it opens on the website.' : d.content.state === 'empty' ? 'Tutor has no lessons for it yet, so it opens on the website.' : d.content.state === 'importing' ? 'Importing from Tutor now…'
                : `${[plural(d.content.lessons, 'lesson'), plural(d.content.quizzes, 'quiz'), plural(d.content.questions, 'question')].join(' · ')}${d.content.importedAt ? ` — imported from Tutor ${new Date(d.content.importedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}, built here since` : ''}`}
            </p>
            {d.source === 'WORDPRESS' && <Link href="/admin/courses/import" className="mt-1 inline-block text-[13px] font-semibold text-azure-strong hover:underline">{d.content.importedAt ? 'Import again' : 'Import content'}</Link>}
          </DrawerSection>
          <DrawerSection title="Review">
            <p className="text-[13px] text-ink2">
              {d.review.reviewer ? `${d.review.reviewer}${d.review.sharePct != null ? ` (${d.review.sharePct}% share)` : ''} · ${d.review.status === 'APPROVED' ? `approved${d.review.reviewedAt ? ` ${new Date(d.review.reviewedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}` : ''}` : d.review.status === 'REJECTED' ? 'sent back' : d.review.submittedAt ? 'waiting for review' : 'not submitted'}` : 'No reviewer yet.'}
            </p>
            <Link href="/admin/reviews" className="mt-1 inline-block text-[13px] font-semibold text-azure-strong hover:underline">{d.review.reviewer ? 'Change' : 'Assign a reviewer'}</Link>
          </DrawerSection>
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
