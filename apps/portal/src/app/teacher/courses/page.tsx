'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { CourseCover } from '@/components/courses/CourseCover';
import { TeacherCoursesHero } from '@/components/hero/TeacherWorkHeroes';

type Status = 'DRAFT' | 'PENDING_REVIEW' | 'PUBLISHED' | 'ARCHIVED';
interface Course {
  id: string; title: string; status: Status; source?: string;
  programme?: { name: string; shortName: string | null } | null;
  isSoldIndividually: boolean; priceAmount: number | null; priceCurrency: string | null;
  proposedPriceAmount: number | null; proposedPriceCurrency: string | null;
  _count?: { modules?: number; enrollments?: number };
}
interface Checklist { items: { key: string; label: string; ok: boolean; required: boolean }[]; readyToSubmit: boolean }

type Tab = 'all' | 'PUBLISHED' | 'PENDING_REVIEW' | 'DRAFT';
const STATUS: Record<Status, { label: string; blue: boolean }> = {
  PUBLISHED: { label: 'Published', blue: true },
  PENDING_REVIEW: { label: 'In review', blue: true },
  DRAFT: { label: 'Draft', blue: false },
  ARCHIVED: { label: 'Archived', blue: false },
};
const money = (minor: number | null, cur: string | null) => minor == null || !cur ? null : `${cur} ${minorToMajor(minor, cur).toLocaleString()}`;
const abbr = (t: string) => t.split(/[\s·—-]+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'C';

export default function TeacherCoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [checklists, setChecklists] = useState<Record<string, Checklist>>({});
  const [avg, setAvg] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('all');
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [showNew, setShowNew] = useState(false);

  async function load() {
    const r = await api.get('/platform-courses').catch(() => ({ data: [] }));
    // WordPress courses appear once their content is imported: from then on they're built here
    const list: Course[] = (r.data ?? []).filter((c: Course & { contentImportedAt?: string | null }) => c.source !== 'WORDPRESS' || !!c.contentImportedAt);
    setCourses(list);
    list.filter(c => c.status === 'DRAFT' || c.status === 'PENDING_REVIEW').forEach(c => {
      api.get(`/platform-courses/${c.id}/checklist`).then(x => setChecklists(m => ({ ...m, [c.id]: x.data }))).catch(() => {});
    });
  }
  useEffect(() => {
    Promise.all([
      load(),
      api.get('/portals/teacher/overview').then(r => {
        const m: Record<string, number> = {};
        (r.data?.courses ?? []).forEach((c: { id: string; avgPct: number }) => { m[c.id] = c.avgPct; });
        setAvg(m);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  async function submit(id: string) {
    setSubmitting(id);
    try {
      await api.post(`/platform-courses/${id}/submit`);
      notify.success('Sent for review', { description: 'A subject reviewer will check it, then an admin publishes it.' });
      await load();
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Could not submit the course');
    } finally { setSubmitting(null); }
  }

  async function create() {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const r = await api.post('/platform-courses', { title: newTitle.trim() });
      router.push(`/teacher/courses/${r.data.id}/builder`);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Could not create the course');
      setCreating(false);
    }
  }

  const count = (t: Tab) => t === 'all' ? courses.length : courses.filter(c => c.status === t).length;
  const shown = courses.filter(c => tab === 'all' || c.status === tab);
  const TABS: [Tab, string][] = [['all', 'All'], ['PUBLISHED', 'Published'], ['PENDING_REVIEW', 'In review'], ['DRAFT', 'Drafts']];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="My courses" subtitle="Build, submit for review and see how students are doing"
        actions={<Button size="sm" onClick={() => setShowNew(true)}>New course</Button>} />

      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <TeacherCoursesHero onNew={() => setShowNew(true)} />
        <div role="tablist" aria-label="Filter courses" className="flex self-start gap-1 rounded-lg border border-line bg-white p-1">
          {TABS.map(([k, l]) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
              className={clsx('h-8 rounded-md px-3 text-[13px] transition-colors',
                tab === k ? 'bg-accent-soft font-semibold text-navy' : 'font-medium text-ink2 hover:text-navy')}>
              {l} <span className="font-medium text-muted">{count(k)}</span>
            </button>
          ))}
        </div>

        {loading ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
            {[0, 1, 2].map(i => <div key={i} className="h-60 rounded-lg border border-line bg-white animate-pulse" />)}
          </div>
        ) : !shown.length ? (
          <div className="rounded-lg border border-line bg-white p-10 text-center">
            <p className="text-sm font-semibold text-navy">{courses.length ? 'No courses here' : 'You haven’t created a course yet'}</p>
            <p className="mt-1 text-[13px] text-ink2">Start from the template: it sets up modules, lessons and quizzes for you to fill in.</p>
            <Button size="sm" className="mt-4" onClick={() => setShowNew(true)}>New course</Button>
          </div>
        ) : (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(340px,1fr))]">
            {shown.map(c => {
              const st = STATUS[c.status];
              const cl = checklists[c.id];
              const required = cl?.items.filter(i => i.required) ?? [];
              const met = required.filter(i => i.ok).length;
              const missing = required.filter(i => !i.ok).map(i => i.label);
              const price = c.isSoldIndividually ? money(c.priceAmount, c.priceCurrency)
                : c.proposedPriceAmount != null ? `${money(c.proposedPriceAmount, c.proposedPriceCurrency)} proposed` : 'Package only';
              return (
                <article key={c.id} className="flex flex-col gap-3.5 rounded-lg border border-line bg-white p-[18px]">
                  <div className="flex items-center gap-3">
                    <CourseCover variant="tile" size="md" course={{ title: c.title }} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-bold text-navy">{c.title}</p>
                      <p className="mt-0.5 text-[12.5px] text-muted">
                        {[c.programme ? c.programme.shortName ?? c.programme.name : null, `${c._count?.modules ?? 0} modules`].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-semibold',
                      st.blue ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>{st.label}</span>
                  </div>

                  <dl className="grid grid-cols-3 overflow-hidden rounded-md border border-line">
                    {[['Students', c._count?.enrollments ? String(c._count.enrollments) : '—'],
                      ['Avg progress', avg[c.id] != null && c._count?.enrollments ? `${avg[c.id]}%` : '—'],
                      ['Price', price]].map(([l, v]) => (
                      <div key={l} className="-mr-px border-r border-line px-3 py-2.5">
                        <dt className="text-[11.5px] text-muted">{l}</dt>
                        <dd className="mt-0.5 truncate text-[13.5px] font-semibold text-navy">{v}</dd>
                      </div>
                    ))}
                  </dl>

                  {(c.status === 'DRAFT' || c.status === 'PENDING_REVIEW') && (
                    <div className="flex flex-col gap-1.5">
                      <div className="flex justify-between text-[12.5px]">
                        <span className="text-ink2">Quality checklist</span>
                        <span className="font-semibold text-navy">{cl ? `${met} of ${required.length}` : '…'}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-[3px] bg-subtle">
                        <div className="h-1.5 bg-azure" style={{ width: `${required.length ? (met / required.length) * 100 : 0}%` }} />
                      </div>
                      <p className="text-[12.5px] text-ink2">
                        {c.status === 'PENDING_REVIEW' ? 'Waiting for the subject reviewer and an admin.'
                          : !cl ? '' : missing.length ? `Missing: ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}` : 'Ready to submit for review.'}
                      </p>
                    </div>
                  )}

                  <div className="mt-auto flex flex-wrap gap-2">
                    <Link href={`/teacher/courses/${c.id}/builder`} className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle">Open builder</Link>
                    <Link href={`/teacher/courses/${c.id}/pricing`} className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle">Pricing</Link>
                    {c.status === 'PUBLISHED' && (
                      <Link href={`/teacher/courses/${c.id}/discussion`} className="inline-flex h-8 items-center rounded-md border border-line bg-white px-3 text-[13px] font-semibold text-navy hover:bg-subtle">Discussion</Link>
                    )}
                    <span className="flex-1" />
                    {c.status === 'DRAFT' && (
                      <Button size="sm" loading={submitting === c.id} disabled={!cl?.readyToSubmit} onClick={() => submit(c.id)}>Submit for review</Button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      <Dialog open={showNew} onOpenChange={setShowNew}>
        {showNew && (
          <DialogContent title="New course" description="You can change the title later. Start from the template in the builder.">
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Course title</span>
              <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') create(); }}
                placeholder="For example: Physics · GCE O Level" className="input-base" />
            </label>
            <DialogFooter>
              <Button size="sm" variant="secondary" onClick={() => setShowNew(false)}>Cancel</Button>
              <Button size="sm" loading={creating} disabled={!newTitle.trim()} onClick={create}>Create and open builder</Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
