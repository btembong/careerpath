'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { minorToMajor, majorToMinor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, Drawer, DrawerContent, DrawerSection, InfoGrid, Stepper } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Status = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
interface Course {
  id: string; title: string; status: Status; source?: string;
  teacher?: { id: string; email: string; name?: string | null; firstName?: string | null; lastName?: string | null } | null;
  programme?: { id: string; name: string; shortName: string | null } | null;
  priceAmount: number | null; priceCurrency: string | null; isSoldIndividually: boolean;
  accessMonths: number | null; language: string | null;
  proposedPriceAmount: number | null; proposedPriceCurrency: string | null; priceProposedAt: string | null;
  updatedAt?: string;
  _count?: { modules?: number; enrollments?: number };
}
interface Pkg { id: string; name: string; courseIds: string[]; priceAmount: number; currency: string; isPublished: boolean }
interface Programme { id: string; name: string; shortName: string | null }
interface DefaultRow { programmeId: string | null; currency: string; amount: number }
interface ChecklistItem { key: string; label: string; ok: boolean; required: boolean }

type Tab = 'all' | 'review' | 'price' | 'published' | 'drafts';
const CURRENCIES = ['GHS', 'XAF', 'NGN', 'USD', 'XOF', 'LRD'];
const LANGUAGES = ['English', 'French', 'Portuguese', 'Arabic'];
/** '6' | '12' | 'custom' | 'none' for the access select */
const accessChoice = (m: number | null) => m == null ? 'none' : m === 6 || m === 12 ? String(m) : 'custom';
const accessLabel = (m: number | null) => m == null ? 'No time limit' : `${m} month${m === 1 ? '' : 's'}`;

const money = (minor: number | null, cur: string | null) =>
  minor == null || !cur ? '—' : `${cur} ${minorToMajor(minor, cur).toLocaleString()}`;
const teacherName = (c: Course) =>
  c.teacher?.name || [c.teacher?.firstName, c.teacher?.lastName].filter(Boolean).join(' ') || c.teacher?.email?.split('@')[0] || '—';
const STATUS: Record<Status, { label: string; blue: boolean }> = {
  PENDING_REVIEW: { label: 'Waiting to publish', blue: true },
  PUBLISHED: { label: 'Published', blue: false },
  DRAFT: { label: 'Draft', blue: false },
  ARCHIVED: { label: 'Archived', blue: false },
};

const th = 'border-b border-line py-2.5 pr-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted';
const td = 'border-b border-line py-3 pr-3 align-middle';
const label = 'text-[13px] font-semibold text-navy';

export default function AdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [openId, setOpenId] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'price' | 'programme' | 'defaults'>(null);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    const [c, p] = await Promise.all([
      api.get('/platform-courses').then(r => r.data ?? []).catch(() => []),
      api.get('/admin/packages').then(r => r.data ?? []).catch(() => []),
    ]);
    setCourses(c); setPackages(p);
  }
  useEffect(() => {
    Promise.all([load(), api.get('/catalogue/programmes').then(r => setProgrammes(r.data ?? [])).catch(() => {})])
      .finally(() => setLoading(false));
  }, []);

  const pkgsOf = useMemo(() => {
    const m = new Map<string, Pkg[]>();
    packages.forEach(p => p.courseIds.forEach(id => m.set(id, [...(m.get(id) ?? []), p])));
    return m;
  }, [packages]);

  const counts = {
    all: courses.length,
    review: courses.filter(c => c.status === 'PENDING_REVIEW').length,
    price: courses.filter(c => c.proposedPriceAmount != null).length,
    published: courses.filter(c => c.status === 'PUBLISHED').length,
    drafts: courses.filter(c => c.status === 'DRAFT').length,
  };
  const packageOnly = courses.filter(c => c.status === 'PUBLISHED' && !c.isSoldIndividually).length;
  const soldAlone = courses.filter(c => c.status === 'PUBLISHED' && c.isSoldIndividually).length;

  const shown = courses.filter(c =>
    (tab === 'all' || (tab === 'review' && c.status === 'PENDING_REVIEW') || (tab === 'price' && c.proposedPriceAmount != null)
      || (tab === 'published' && c.status === 'PUBLISHED') || (tab === 'drafts' && c.status === 'DRAFT'))
    && (!q.trim() || `${c.title} ${teacherName(c)} ${c.teacher?.email ?? ''}`.toLowerCase().includes(q.trim().toLowerCase())));

  function toggle(id: string) {
    setSelected(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  const allShownSelected = shown.length > 0 && shown.every(c => selected.has(c.id));

  async function syncWebsite() {
    setSyncing(true);
    try {
      const r = await api.post('/platform-courses/wp-sync');
      notify.success('Courses imported from the website', { description: `${r.data?.created ?? 0} new, ${r.data?.updated ?? 0} updated` });
      await load();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Could not import from the website');
    } finally { setSyncing(false); }
  }

  const open = courses.find(c => c.id === openId) ?? null;
  const stats = [
    { l: 'Published', v: counts.published, sub: `${soldAlone} sold on their own` },
    { l: 'Waiting to publish', v: counts.review, sub: 'Submitted by teachers' },
    { l: 'Price requests', v: counts.price, sub: 'Proposed by teachers' },
    { l: 'Package only', v: packageOnly, sub: 'Published, not sold on their own' },
  ];
  const TABS: [Tab, string][] = [['all', 'All'], ['review', 'Waiting to publish'], ['price', 'Price requests'], ['published', 'Published'], ['drafts', 'Drafts']];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Courses" subtitle="Publish, price and organise every course on the platform"
        actions={<>
          <Button size="sm" variant="secondary" onClick={() => setDialog('defaults')}>Pricing settings</Button>
          <Button size="sm" variant="secondary" loading={syncing} onClick={syncWebsite}>Import from website</Button>
        </>} />

      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">
          {stats.map(s => (
            <div key={s.l} className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{s.l}</p>
              <p className="text-2xl font-extrabold text-navy">{loading ? '—' : s.v}</p>
              <p className="text-[12.5px] text-muted">{s.sub}</p>
            </div>
          ))}
        </div>

        <section className="overflow-hidden rounded-lg border border-line bg-white">
          <div role="tablist" aria-label="Filter courses" className="flex gap-1 overflow-x-auto border-b border-line px-4">
            {TABS.map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); setSelected(new Set()); }}
                className={clsx('-mb-px inline-flex h-12 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-[13.5px] transition-colors',
                  tab === k ? 'border-azure font-semibold text-navy' : 'border-transparent font-medium text-muted hover:text-navy')}>
                {l}
                {k !== 'all' && k !== 'published' && counts[k] > 0 && (
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-accent-soft px-1.5 text-[11.5px] font-bold text-navy">{counts[k]}</span>
                )}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4 py-3">
            <input type="search" value={q} onChange={e => setQ(e.target.value)} aria-label="Search courses"
              placeholder="Search by course or teacher" className="input-base h-9 min-w-[220px] flex-1" />
            {selected.size > 0 && (
              <>
                <span className="text-[13px] font-semibold text-navy">{selected.size} selected</span>
                <Button size="sm" variant="secondary" onClick={() => setDialog('price')}>Set single-course price</Button>
                <Button size="sm" variant="secondary" onClick={() => setDialog('programme')}>Assign programme</Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              </>
            )}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-[13.5px]">
              <thead>
                <tr>
                  <th className={clsx(th, 'w-10 pl-4')}>
                    <input type="checkbox" aria-label="Select all shown" checked={allShownSelected}
                      onChange={() => setSelected(allShownSelected ? new Set() : new Set(shown.map(c => c.id)))} className="accent-[#3F6FE8]" />
                  </th>
                  <th className={th}>Course</th><th className={th}>Status</th><th className={th}>Students</th>
                  <th className={th}>Single price</th><th className={th}>In packages</th><th className={th} />
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} className="p-6 text-center text-sm text-muted">Loading courses…</td></tr>
                ) : !shown.length ? (
                  <tr><td colSpan={7} className="p-6 text-center text-sm text-muted">No courses here.</td></tr>
                ) : shown.map(c => {
                  const st = STATUS[c.status];
                  const pk = pkgsOf.get(c.id) ?? [];
                  return (
                    <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer hover:bg-subtle transition-colors">
                      <td className={clsx(td, 'pl-4')} onClick={e => e.stopPropagation()}>
                        <input type="checkbox" aria-label={`Select ${c.title}`} checked={selected.has(c.id)} onChange={() => toggle(c.id)} className="accent-[#3F6FE8]" />
                      </td>
                      <td className={td}>
                        <span className="font-semibold text-navy">{c.title}</span>
                        <span className="block text-xs text-muted">{teacherName(c)}{c.programme ? ` · ${c.programme.shortName ?? c.programme.name}` : ''}</span>
                      </td>
                      <td className={td}>
                        <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-semibold',
                          st.blue ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>{st.label}</span>
                      </td>
                      <td className={clsx(td, 'text-ink2')}>{c._count?.enrollments ?? '—'}</td>
                      <td className={td}>
                        <span className="font-semibold text-navy">{c.isSoldIndividually ? money(c.priceAmount, c.priceCurrency) : 'Not for sale'}</span>
                        <span className={clsx('block text-xs', c.proposedPriceAmount != null ? 'text-azure-strong' : 'text-muted')}>
                          {c.proposedPriceAmount != null
                            ? `Teacher proposes ${money(c.proposedPriceAmount, c.proposedPriceCurrency)}`
                            : c.isSoldIndividually ? 'Sold on its own' : pk.length ? 'Package only' : 'Not in a package'}
                        </span>
                      </td>
                      <td className={clsx(td, 'text-ink2')}>{pk.length || '—'}</td>
                      <td className={clsx(td, 'pr-4 text-right')}>
                        <span className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy">Manage</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <CourseDrawer course={open} packages={open ? pkgsOf.get(open.id) ?? [] : []} onClose={() => setOpenId(null)} onChanged={load} />
      <BulkPriceDialog open={dialog === 'price'} ids={[...selected]} onClose={() => setDialog(null)} onDone={() => { setDialog(null); setSelected(new Set()); load(); }} />
      <AssignProgrammeDialog open={dialog === 'programme'} ids={[...selected]} programmes={programmes} onClose={() => setDialog(null)} onDone={() => { setDialog(null); setSelected(new Set()); load(); }} />
      <DefaultPricesDialog open={dialog === 'defaults'} programmes={programmes} packageOnly={packageOnly} onClose={() => setDialog(null)} onApplied={load} />
    </div>
  );
}

/* ─── Course drawer ───────────────────────────────────────────────────────── */

function CourseDrawer({ course, packages, onClose, onChanged }: { course: Course | null; packages: Pkg[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [checklist, setChecklist] = useState<ChecklistItem[] | null>(null);
  const [sell, setSell] = useState(false);
  const [currency, setCurrency] = useState('GHS');
  const [amount, setAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [sendingBack, setSendingBack] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [access, setAccess] = useState('12');
  const [customMonths, setCustomMonths] = useState('');
  const [language, setLanguage] = useState('');
  const [commission, setCommission] = useState('');
  const [defaultPct, setDefaultPct] = useState<number | null>(null);

  useEffect(() => {
    if (!course) return;
    setSell(course.isSoldIndividually);
    setAccess(accessChoice(course.accessMonths));
    setCustomMonths(course.accessMonths != null && accessChoice(course.accessMonths) === 'custom' ? String(course.accessMonths) : '');
    setLanguage(course.language ?? '');
    setCommission('');
    api.get(`/platform-courses/${course.id}/teacher-share`).then(r => setCommission(r.data?.teacherCommissionPct != null ? String(r.data.teacherCommissionPct) : '')).catch(() => {});
    api.get('/platform-courses/pricing-settings').then(r => setDefaultPct(r.data?.defaultTeacherCommissionPct ?? null)).catch(() => {});
    setCurrency(course.priceCurrency ?? course.proposedPriceCurrency ?? 'GHS');
    setAmount(course.priceAmount != null && course.priceCurrency ? String(minorToMajor(course.priceAmount, course.priceCurrency)) : '');
    setNotes(''); setSendingBack(false); setChecklist(null);
    api.get(`/platform-courses/${course.id}/checklist`).then(r => setChecklist(r.data?.items ?? [])).catch(() => setChecklist([]));
  }, [course?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(key: string, fn: () => Promise<unknown>, done: string) {
    setBusy(key);
    try { await fn(); notify.success(done); await onChanged(); }
    catch (err: any) { notify.error(err?.response?.data?.message ?? 'That didn’t work. Please try again.'); }
    finally { setBusy(null); }
  }

  if (!course) return <Drawer open={false} onOpenChange={() => {}}>{null}</Drawer>;
  const required = checklist?.filter(i => i.required) ?? [];
  const met = required.filter(i => i.ok).length;
  const step = course.status === 'PUBLISHED' ? 4 : course.status === 'PENDING_REVIEW' ? 3 : required.length && met === required.length ? 2 : 1;
  const priceValid = Number(amount) > 0;
  const accessMonths = access === 'none' ? null : access === 'custom' ? Number(customMonths) : Number(access);
  const accessValid = accessMonths === null || (Number.isInteger(accessMonths) && accessMonths >= 1 && accessMonths <= 120);
  const pctValid = commission.trim() === '' || (Number(commission) >= 0 && Number(commission) <= 100);

  return (
    <Drawer open={!!course} onOpenChange={o => { if (!o) onClose(); }}>
      <DrawerContent title={course.title} description={`${teacherName(course)}${course.programme ? ` · ${course.programme.shortName ?? course.programme.name}` : ''}`}
        action={<Link href={`/admin/courses/${course.id}`} className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle">Course details</Link>}>

        <Stepper steps={['Draft', 'Checklist met', 'Submitted', 'Published']} current={step} />

        <InfoGrid items={[
          { label: 'Status', value: STATUS[course.status].label },
          { label: 'Students', value: course._count?.enrollments ?? 0 },
          { label: 'Modules', value: course._count?.modules ?? 0 },
          { label: 'Checklist', value: checklist ? `${met} of ${required.length}` : '…' },
          { label: 'Source', value: course.source === 'WORDPRESS' ? 'Website' : 'Platform' },
          { label: 'Packages', value: packages.length },
          { label: 'Language', value: course.language ?? 'Not set' },
          { label: 'Access', value: accessLabel(course.accessMonths) },
          { label: 'Teacher', value: teacherName(course) },
        ]} />

        {checklist && required.some(i => !i.ok) && (
          <DrawerSection title="Still missing">
            <ul className="list-disc space-y-1 pl-5 text-[13px] text-ink2">
              {required.filter(i => !i.ok).map(i => <li key={i.key}>{i.label}</li>)}
            </ul>
          </DrawerSection>
        )}

        <DrawerSection title="Pricing">
          <label className="flex items-center gap-2.5 text-[13.5px] text-navy">
            <input type="checkbox" checked={sell} onChange={e => setSell(e.target.checked)} className="h-4 w-4 accent-[#3F6FE8]" />
            Sell this course on its own
          </label>
          {sell && (
            <div className="flex items-end gap-2">
              <label className="flex w-28 flex-col gap-1.5"><span className={label}>Currency</span>
                <select value={currency} onChange={e => setCurrency(e.target.value)} className="input-base">
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
              </label>
              <label className="flex flex-1 flex-col gap-1.5"><span className={label}>Price</span>
                <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="60" className="input-base" />
              </label>
            </div>
          )}
          {sell && (
            <div className="flex items-end gap-2">
              <label className="flex flex-1 flex-col gap-1.5"><span className={label}>Access after buying</span>
                <select value={access} onChange={e => setAccess(e.target.value)} className="input-base">
                  <option value="6">6 months</option>
                  <option value="12">12 months</option>
                  <option value="custom">Other length</option>
                  <option value="none">No time limit</option>
                </select>
              </label>
              {access === 'custom' && (
                <label className="flex w-32 flex-col gap-1.5"><span className={label}>Months</span>
                  <input inputMode="numeric" value={customMonths} onChange={e => setCustomMonths(e.target.value)} placeholder="3" className="input-base" />
                </label>
              )}
            </div>
          )}
          {course.proposedPriceAmount != null && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-azure bg-accent-soft px-3 py-2.5">
              <p className="min-w-0 flex-1 text-[13px] text-ink2">
                <strong className="text-navy">Teacher proposes {money(course.proposedPriceAmount, course.proposedPriceCurrency)}.</strong>
              </p>
              <Button size="sm" variant="secondary" loading={busy === 'approve'}
                onClick={() => run('approve', () => api.post(`/platform-courses/${course.id}/price-proposal/decision`, { approve: true }), 'Price approved')}>
                Approve
              </Button>
              <Button size="sm" variant="ghost" loading={busy === 'decline'}
                onClick={() => run('decline', () => api.post(`/platform-courses/${course.id}/price-proposal/decision`, { approve: false }), 'Proposal declined')}>
                Decline
              </Button>
            </div>
          )}
          {packages.length > 0 && (
            <p className="text-[12.5px] text-muted">Also in: {packages.map(p => `${p.name} (${money(p.priceAmount, p.currency)})`).join(', ')}.</p>
          )}
          <div>
            <Button size="sm" variant="secondary" loading={busy === 'price'} disabled={sell && (!priceValid || !accessValid)}
              onClick={() => run('price', () => api.patch(`/platform-courses/${course.id}`, sell
                ? { isSoldIndividually: true, priceCurrency: currency, priceAmount: majorToMinor(Number(amount), currency), accessMonths }
                : { isSoldIndividually: false }), 'Pricing saved')}>
              Save pricing
            </Button>
          </div>
        </DrawerSection>

        <DrawerSection title="Teacher commission">
          <div className="flex items-end gap-2">
            <label className="flex w-32 flex-col gap-1.5"><span className={label}>Share of each sale</span>
              <span className="flex items-center gap-1.5">
                <input inputMode="decimal" value={commission} onChange={e => setCommission(e.target.value)} placeholder={defaultPct != null ? String(defaultPct) : '—'} className="input-base" />
                <span className="text-sm text-ink2">%</span>
              </span>
            </label>
            {defaultPct != null && commission !== String(defaultPct) && (
              <Button size="sm" variant="ghost" onClick={() => setCommission(String(defaultPct))}>Use default ({defaultPct}%)</Button>
            )}
          </div>
          <p className="text-[12.5px] text-muted">
            {commission.trim() === '' ? 'Empty means the teacher is paid outside the platform, so sales add nothing to their wallet.'
              : 'Credited to the teacher’s wallet on every sale of this course, alone or in a package.'}
          </p>
          <div>
            <Button size="sm" variant="secondary" loading={busy === 'commission'} disabled={!pctValid}
              onClick={() => run('commission', () => api.patch(`/platform-courses/${course.id}/commission`, { teacherCommissionPct: commission.trim() === '' ? null : Number(commission) }), 'Commission saved')}>
              Save commission
            </Button>
          </div>
        </DrawerSection>

        <DrawerSection title="Language">
          <div className="flex items-end gap-2">
            <select aria-label="Teaching language" value={language} onChange={e => setLanguage(e.target.value)} className="input-base flex-1">
              <option value="">Not set (hidden from students)</option>
              {LANGUAGES.map(l => <option key={l}>{l}</option>)}
              {language && !LANGUAGES.includes(language) && <option>{language}</option>}
            </select>
            <Button size="sm" variant="secondary" loading={busy === 'language'} disabled={(course.language ?? '') === language}
              onClick={() => run('language', () => api.patch(`/platform-courses/${course.id}`, { language: language || null }), 'Language saved')}>Save</Button>
          </div>
        </DrawerSection>

        {course.status === 'PENDING_REVIEW' && (
          <DrawerSection title="Decision">
            {sendingBack ? (
              <div className="space-y-2">
                <label className="block space-y-1.5"><span className={label}>What should the teacher change?</span>
                  <textarea rows={3} value={notes} onChange={e => setNotes(e.target.value)} maxLength={1000}
                    className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" />
                </label>
                <div className="flex gap-2">
                  <Button size="sm" variant="danger" loading={busy === 'reject'}
                    onClick={() => run('reject', () => api.post(`/platform-courses/${course.id}/reject`, { notes }), 'Sent back to the teacher')}>Send back</Button>
                  <Button size="sm" variant="secondary" onClick={() => setSendingBack(false)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <Button size="sm" loading={busy === 'publish'}
                  onClick={() => run('publish', () => api.post(`/platform-courses/${course.id}/publish`), 'Course published')}>Publish</Button>
                <Button size="sm" variant="secondary" onClick={() => setSendingBack(true)}>Send back</Button>
              </div>
            )}
          </DrawerSection>
        )}
        {course.status === 'PUBLISHED' && (
          <div className="border-t border-line pt-4">
            <Button size="sm" variant="danger" loading={busy === 'archive'}
              onClick={() => run('archive', () => api.post(`/platform-courses/${course.id}/archive`), 'Course archived')}>Archive course</Button>
          </div>
        )}
      </DrawerContent>
    </Drawer>
  );
}

/* ─── Dialogs ─────────────────────────────────────────────────────────────── */

function BulkPriceDialog({ open, ids, onClose, onDone }: { open: boolean; ids: string[]; onClose: () => void; onDone: () => void }) {
  const [currency, setCurrency] = useState('GHS');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(sell: boolean) {
    setBusy(true);
    try {
      const r = await api.patch('/platform-courses/bulk-price', sell
        ? { courseIds: ids, sell: true, currency, amount: majorToMinor(Number(amount), currency) }
        : { courseIds: ids, sell: false });
      notify.success(sell ? `${r.data.updated} courses now on sale` : `${r.data.updated} courses taken off sale`);
      onDone();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not update prices'); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      {open && (
        <DialogContent title="Single-course price" description={`${ids.length} course${ids.length === 1 ? '' : 's'} selected`}>
          <div className="flex items-end gap-2">
            <label className="flex w-28 flex-col gap-1.5"><span className={label}>Currency</span>
              <select value={currency} onChange={e => setCurrency(e.target.value)} className="input-base">{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>
            </label>
            <label className="flex flex-1 flex-col gap-1.5"><span className={label}>Price</span>
              <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="60" className="input-base" />
            </label>
          </div>
          <DialogFooter>
            <Button size="sm" variant="ghost" loading={busy} onClick={() => save(false)}>Take off sale</Button>
            <Button size="sm" loading={busy} disabled={!(Number(amount) > 0)} onClick={() => save(true)}>Put on sale</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function AssignProgrammeDialog({ open, ids, programmes, onClose, onDone }: { open: boolean; ids: string[]; programmes: Programme[]; onClose: () => void; onDone: () => void }) {
  const [programmeId, setProgrammeId] = useState('');
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    try {
      await api.patch('/platform-courses/bulk-assign', { courseIds: ids, programmeId });
      notify.success('Programme assigned');
      onDone();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not assign the programme'); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      {open && (
        <DialogContent title="Assign programme" description={`${ids.length} course${ids.length === 1 ? '' : 's'} selected`}>
          <label className="flex flex-col gap-1.5"><span className={label}>Programme</span>
            <select value={programmeId} onChange={e => setProgrammeId(e.target.value)} className="input-base">
              <option value="">Choose a programme</option>
              {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <DialogFooter>
            <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={busy} disabled={!programmeId} onClick={save}>Assign</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function DefaultPricesDialog({ open, programmes, packageOnly, onClose, onApplied }: {
  open: boolean; programmes: Programme[]; packageOnly: number; onClose: () => void; onApplied: () => Promise<void>;
}) {
  const [rows, setRows] = useState<{ programmeId: string; currency: string; amount: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [applyCurrency, setApplyCurrency] = useState('GHS');
  const [pct, setPct] = useState('');

  useEffect(() => {
    if (!open) return;
    api.get('/platform-courses/pricing-settings').then(r => setPct(r.data?.defaultTeacherCommissionPct != null ? String(r.data.defaultTeacherCommissionPct) : '')).catch(() => {});
    api.get('/platform-courses/price-defaults').then(r => setRows((r.data as DefaultRow[]).map(d => ({
      programmeId: d.programmeId ?? '', currency: d.currency, amount: String(minorToMajor(d.amount, d.currency)),
    })))).catch(() => setRows([]));
  }, [open]);

  const update = (i: number, patch: Partial<{ programmeId: string; currency: string; amount: string }>) =>
    setRows(rs => rs.map((r, j) => j === i ? { ...r, ...patch } : r));

  async function save() {
    setBusy(true);
    try {
      await api.patch('/platform-courses/price-defaults', {
        rows: rows.filter(r => Number(r.amount) > 0).map(r => ({ programmeId: r.programmeId || null, currency: r.currency, amount: majorToMinor(Number(r.amount), r.currency) })),
      });
      notify.success('Default prices saved');
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not save default prices'); }
    finally { setBusy(false); }
  }
  async function saveCommission(applyToo: boolean) {
    setBusy(true);
    try {
      await api.patch('/platform-courses/pricing-settings', { defaultTeacherCommissionPct: pct.trim() === '' ? null : Number(pct) });
      if (applyToo) {
        const r = await api.post('/platform-courses/pricing-settings/apply-commission');
        notify.success(`${r.data.updated} courses now pay ${pct}%`, { description: r.data.skipped ? `${r.data.skipped} already had their own commission` : undefined });
      } else notify.success('Default commission saved');
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not save the commission'); }
    finally { setBusy(false); }
  }
  async function apply() {
    setBusy(true);
    try {
      await save();
      const r = await api.post('/platform-courses/price-defaults/apply', { currency: applyCurrency });
      notify.success(`${r.data.updated} courses put on sale`, { description: r.data.skipped ? `${r.data.skipped} had no default price for their programme` : undefined });
      await onApplied();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not apply default prices'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      {open && (
        <DialogContent size="lg" title="Pricing settings"
          description="Default prices per programme, and the teacher commission new courses start with.">
          <h3 className="text-[14px] font-semibold text-navy">Default single-course prices</h3>
          <p className="mb-2 text-[12.5px] text-muted">Used when you put package-only courses on sale. A programme’s own price wins over “Every programme”.</p>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <select aria-label="Programme" value={r.programmeId} onChange={e => update(i, { programmeId: e.target.value })} className="input-base flex-1">
                  <option value="">Every programme</option>
                  {programmes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select aria-label="Currency" value={r.currency} onChange={e => update(i, { currency: e.target.value })} className="input-base w-24">
                  {CURRENCIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <input aria-label="Price" inputMode="decimal" value={r.amount} onChange={e => update(i, { amount: e.target.value })} placeholder="60" className="input-base w-28" />
                <button type="button" onClick={() => setRows(rs => rs.filter((_, j) => j !== i))} className="text-[13px] font-semibold text-muted hover:text-error">Remove</button>
              </div>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setRows(rs => [...rs, { programmeId: '', currency: 'GHS', amount: '' }])}>Add a price</Button>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-line bg-subtle px-3 py-2.5 text-[13px] text-ink2">
            <span className="flex-1">{packageOnly} published courses are package only. Put them on sale at these prices in</span>
            <select aria-label="Currency to apply" value={applyCurrency} onChange={e => setApplyCurrency(e.target.value)} className="input-base h-8 w-24">
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select>
            <Button size="sm" variant="secondary" loading={busy} onClick={apply}>Apply</Button>
          </div>
          <h3 className="mt-6 text-[14px] font-semibold text-navy">Teacher commission</h3>
          <p className="mb-2 text-[12.5px] text-muted">The share of each sale credited to the course’s teacher. Each course can have its own in the course drawer.</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5">
              <input aria-label="Default commission" inputMode="decimal" value={pct} onChange={e => setPct(e.target.value)} placeholder="e.g. 40" className="input-base w-24" />
              <span className="text-sm text-ink2">%</span>
            </span>
            <Button size="sm" variant="secondary" loading={busy} onClick={() => saveCommission(false)}>Save</Button>
            <Button size="sm" variant="ghost" loading={busy} disabled={pct.trim() === ''} onClick={() => saveCommission(true)}>Save and give it to courses without one</Button>
          </div>
          <DialogFooter>
            <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
            <Button size="sm" loading={busy} onClick={save}>Save defaults</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
