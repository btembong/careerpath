'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, Drawer, DrawerContent, DrawerSection, InfoGrid } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Status = 'running' | 'upcoming' | 'ended';
interface Row {
  id: string; name: string; sittingLabel: string | null; examDate: string | null; startDate: string | null;
  teacher: { id: string; name: string }; students: number;
  nextClass: { title: string; scheduledAt: string; status: string } | null;
  packages: { id: string; name: string; isPublished: boolean }[]; status: Status;
}
interface ListData {
  stats: { running: number; upcoming: number; students: number; joinedThisWeek: number; classesThisWeek: number; attendanceLastWeekPct: number | null; withoutPackage: number };
  cohorts: Row[];
}
interface Detail {
  cohort: { id: string; name: string; sittingLabel: string | null; examDate: string | null; startDate: string | null; status: Status };
  teacher: { id: string; name: string; email: string };
  stats: { attendancePct: number | null; avgProgress: number | null; held: number; ahead: number };
  revenue: { currency: string; amount: number }[];
  members: { id: string; name: string; email: string; source: string; addedAt: string }[];
  packages: { id: string; name: string; priceAmount: number; currency: string; validityDays: number | null; isPublished: boolean; sold: number }[];
  upcoming: { id: string; title: string; scheduledAt: string; durationMins: number }[];
}
interface Teacher { id: string; email: string; name: string | null; firstName?: string | null; lastName?: string | null; approvalStatus?: string }

const DAY = 86_400_000;
const STATUS: Record<Status, string> = { running: 'Running', upcoming: 'Starting soon', ended: 'Exam passed' };
const SOURCE: Record<string, string> = { PACKAGE: 'Bought the package', ORG: 'School licence', ADMIN: 'Added by admin', TEACHER: 'Added by teacher' };
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const teacherName = (t: Teacher) => t.name || [t.firstName, t.lastName].filter(Boolean).join(' ') || t.email;
const date = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
const when = (d: string) => {
  const days = Math.round((new Date(new Date(d).toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / DAY);
  const t = new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return days === 0 ? `Today ${t}` : days === 1 ? `Tomorrow ${t}` : `${new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${t}`;
};
const months = (d: number | null) => { if (!d) return 'no end date'; const m = Math.round(d / 30.44); return Math.abs(m * 30.44 - d) <= 3 ? `${m} months` : `${d} days`; };
const label = 'text-[13px] font-semibold text-navy';
const badge = (blue: boolean) => clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-semibold', blue ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2');

export default function AdminCohortsPage() {
  const [data, setData] = useState<ListData | null>(null);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [tab, setTab] = useState<Status | 'all'>('running');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const r = await api.get('/portals/admin/cohort-list');
    setData(r.data);
  }
  useEffect(() => {
    load().catch(() => notify.error('Could not load cohorts'));
    api.get('/portals/admin/teachers?status=APPROVED').catch(() => api.get('/portals/admin/teachers'))
      .then(r => setTeachers((r.data ?? []).filter((t: Teacher) => !t.approvalStatus || t.approvalStatus === 'APPROVED'))).catch(() => {});
  }, []);

  const counts = useMemo(() => {
    const c = { running: 0, upcoming: 0, ended: 0, all: data?.cohorts.length ?? 0 };
    data?.cohorts.forEach(r => { c[r.status]++; });
    return c;
  }, [data]);
  const shown = (data?.cohorts ?? []).filter(r => (tab === 'all' || r.status === tab)
    && (!q.trim() || `${r.name} ${r.teacher.name}`.toLowerCase().includes(q.trim().toLowerCase())));
  const s = data?.stats;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Cohorts" subtitle="Groups of students with a teacher, live classes and an exam date"
        actions={<Button size="sm" onClick={() => setCreating(true)}>New cohort</Button>} />

      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          {[
            { l: 'Running cohorts', v: s ? String(s.running) : '…', sub: s ? (s.upcoming ? `${s.upcoming} starting soon` : 'None starting soon') : '' },
            { l: 'Students in cohorts', v: s ? String(s.students) : '…', sub: s ? `${s.joinedThisWeek} joined this week` : '' },
            { l: 'Live classes this week', v: s ? String(s.classesThisWeek) : '…', sub: s?.attendanceLastWeekPct != null ? `${s.attendanceLastWeekPct}% attendance last week` : 'No classes last week' },
            { l: 'Without a package', v: s ? String(s.withoutPackage) : '…', sub: 'Students can’t join these by buying' },
          ].map(x => (
            <div key={x.l} className="rounded-lg border border-line bg-white p-4">
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{x.l}</dt>
              <dd className="mt-1.5 text-[22px] font-extrabold text-navy">{x.v}</dd>
              <dd className="mt-0.5 truncate text-[12.5px] text-muted">{x.sub}</dd>
            </div>
          ))}
        </dl>

        <section className="rounded-lg border border-line bg-white">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4">
            <div role="tablist" aria-label="Status" className="flex flex-1 gap-1 overflow-x-auto">
              {([['running', 'Running'], ['upcoming', 'Starting soon'], ['ended', 'Exam passed'], ['all', 'All']] as [Status | 'all', string][]).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={clsx('-mb-px h-[46px] whitespace-nowrap border-b-2 px-3 text-[13.5px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent font-medium')}>
                  {l} <span className="font-medium text-muted">{counts[k]}</span>
                </button>
              ))}
            </div>
            <input type="search" aria-label="Search cohorts" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by cohort or teacher" className="input-base my-2 h-[34px] w-60" />
          </div>
          {!data ? <div className="m-4 h-60 rounded-md bg-subtle animate-pulse" /> : !shown.length ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink2">{data.cohorts.length ? 'No cohorts here.' : 'No cohorts yet. Create one to group students with a teacher and live classes.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] border-collapse text-[13.5px]">
                <thead><tr>
                  {['Cohort', 'Teacher', 'Students', 'Exam', 'Next class', 'Sold with', 'Status'].map(h => (
                    <th key={h} className="border-b border-line px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {shown.map(r => {
                    const examDays = r.examDate ? Math.ceil((new Date(r.examDate).getTime() - Date.now()) / DAY) : null;
                    return (
                      <tr key={r.id} onClick={() => setOpenId(r.id)} className="cursor-pointer hover:bg-subtle">
                        <td className="border-b border-line px-4 py-3 font-semibold text-navy">{r.name}</td>
                        <td className="border-b border-line px-4 py-3 text-navy">{r.teacher.name}</td>
                        <td className="border-b border-line px-4 py-3 text-navy">{r.students}</td>
                        <td className="border-b border-line px-4 py-3 text-navy">{r.examDate ? `${date(r.examDate)}${examDays != null && examDays >= 0 && r.status !== 'ended' ? ` · ${examDays} days` : ''}` : '—'}</td>
                        <td className="border-b border-line px-4 py-3 text-ink2">{r.nextClass ? (r.nextClass.status === 'ACTIVE' ? 'Live now' : when(r.nextClass.scheduledAt)) : r.status === 'ended' ? '—' : 'Not scheduled'}</td>
                        <td className="border-b border-line px-4 py-3 text-ink2">{r.packages.length ? r.packages.map(p => p.name).join(', ') : 'Not sold yet'}</td>
                        <td className="border-b border-line px-4 py-3"><span className={badge(r.status === 'running')}>{STATUS[r.status]}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <CohortDrawer id={openId} teachers={teachers} onClose={() => setOpenId(null)} onChanged={load} />
      <NewCohortDialog open={creating} teachers={teachers} onClose={() => setCreating(false)} onDone={async () => { setCreating(false); await load(); }} />
    </div>
  );
}

function CohortDrawer({ id, teachers, onClose, onChanged }: { id: string | null; teachers: Teacher[]; onClose: () => void; onChanged: () => Promise<void> }) {
  const [d, setD] = useState<Detail | null>(null);
  const [f, setF] = useState({ name: '', teacherId: '', sittingLabel: '', startDate: '', examDate: '' });
  const [emails, setEmails] = useState('');
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [scheduling, setScheduling] = useState(false);

  async function load(cid: string) {
    const r = await api.get(`/portals/admin/cohorts/${cid}/overview`);
    const x: Detail = r.data;
    setD(x);
    setF({ name: x.cohort.name, teacherId: x.teacher.id, sittingLabel: x.cohort.sittingLabel ?? '', startDate: x.cohort.startDate?.slice(0, 10) ?? '', examDate: x.cohort.examDate?.slice(0, 10) ?? '' });
  }
  useEffect(() => { setD(null); setEmails(''); setShowAll(false); if (id) load(id).catch(() => notify.error('Could not load this cohort')); }, [id]);

  async function run(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    try { await fn(); if (done) notify.success(done); await load(id!); await onChanged(); }
    catch (err: any) { notify.error(err?.response?.data?.message ?? 'That didn’t work. Please try again.'); }
    finally { setBusy(null); }
  }

  async function addStudents() {
    const list = [...new Set(emails.split(/[\s,;]+/).map(e => e.trim().toLowerCase()).filter(e => e.includes('@')))];
    if (!list.length) return;
    setBusy('add');
    const results = await Promise.all(list.map(email => api.post(`/portals/admin/cohorts/${id}/students`, { email })
      .then(() => ({ email, ok: true, msg: '' })).catch(err => ({ email, ok: false, msg: err?.response?.data?.message ?? 'Failed' }))));
    const ok = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok);
    if (ok) notify.success(`${ok} student${ok === 1 ? '' : 's'} added`);
    if (failed.length) notify.error(`${failed.length} not added`, { description: failed.slice(0, 3).map(r => `${r.email}: ${r.msg}`).join(' · ') });
    setEmails(failed.map(r => r.email).join(', '));
    setBusy(null);
    await load(id!); await onChanged();
  }

  const changed = d && (f.name !== d.cohort.name || f.teacherId !== d.teacher.id || f.sittingLabel !== (d.cohort.sittingLabel ?? '')
    || f.startDate !== (d.cohort.startDate?.slice(0, 10) ?? '') || f.examDate !== (d.cohort.examDate?.slice(0, 10) ?? ''));
  const revenue = d?.revenue.length ? d.revenue.map(r => `${r.currency} ${minorToMajor(r.amount, r.currency).toLocaleString()}`).join(' · ') : '—';
  const members = d ? (showAll ? d.members : d.members.slice(0, 8)) : [];

  return (
    <Drawer open={!!id} onOpenChange={o => { if (!o) onClose(); }}>
      {id && (
        <DrawerContent width="lg" title={d?.cohort.name ?? 'Cohort'} description={d ? `${d.teacher.name} · ${d.members.length} student${d.members.length === 1 ? '' : 's'}` : undefined}>
          {!d ? <div className="h-80 rounded-md bg-subtle animate-pulse" /> : <>
            <InfoGrid items={[
              { label: 'Attendance', value: d.stats.attendancePct != null ? `${d.stats.attendancePct}%` : '—' },
              { label: 'Avg progress', value: d.stats.avgProgress != null ? `${d.stats.avgProgress}%` : '—' },
              { label: 'Classes', value: `${d.stats.held} held · ${d.stats.ahead} ahead` },
              { label: 'Started', value: date(d.cohort.startDate) },
              { label: 'Exam', value: date(d.cohort.examDate) },
              { label: 'Revenue', value: revenue },
            ]} />

            <DrawerSection title="Details">
              <div className="grid gap-2.5 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 sm:col-span-2"><span className={label}>Name</span>
                  <input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} className="input-base" /></label>
                <label className="flex flex-col gap-1.5 sm:col-span-2"><span className={label}>Teacher</span>
                  <select value={f.teacherId} onChange={e => setF({ ...f, teacherId: e.target.value })} className="input-base">
                    {!teachers.some(t => t.id === d.teacher.id) && <option value={d.teacher.id}>{d.teacher.name}</option>}
                    {teachers.map(t => <option key={t.id} value={t.id}>{teacherName(t)}</option>)}
                  </select></label>
                <label className="flex flex-col gap-1.5 sm:col-span-2"><span className={label}>Exam sitting</span>
                  <input value={f.sittingLabel} onChange={e => setF({ ...f, sittingLabel: e.target.value })} placeholder="For example: WASSCE · November 2026" className="input-base" /></label>
                <label className="flex flex-col gap-1.5"><span className={label}>Starts</span>
                  <input type="date" value={f.startDate} onChange={e => setF({ ...f, startDate: e.target.value })} className="input-base" /></label>
                <label className="flex flex-col gap-1.5"><span className={label}>Exam date</span>
                  <input type="date" value={f.examDate} onChange={e => setF({ ...f, examDate: e.target.value })} className="input-base" /></label>
              </div>
              <div>
                <Button size="sm" variant="secondary" loading={busy === 'details'} disabled={!changed || !f.name.trim()}
                  onClick={() => run('details', () => api.patch(`/portals/admin/cohorts/${id}`, {
                    name: f.name.trim(), teacherId: f.teacherId, sittingLabel: f.sittingLabel.trim() || null,
                    startDate: f.startDate || null, examDate: f.examDate || null,
                  }), 'Cohort saved')}>Save details</Button>
              </div>
            </DrawerSection>

            <DrawerSection title="Students" count={d.members.length}>
              <div className="flex gap-2">
                <input aria-label="Add students" value={emails} onChange={e => setEmails(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addStudents(); }}
                  placeholder="Paste emails, separated by commas or spaces" className="input-base h-9 flex-1" />
                <Button size="sm" loading={busy === 'add'} disabled={!emails.includes('@')} onClick={addStudents}>Add</Button>
              </div>
              <p className="text-[12.5px] text-muted">Students who buy a package linked to this cohort, or claim a school seat for one, are added automatically.</p>
              {d.members.length > 0 && (
                <div className="overflow-hidden rounded-md border border-line">
                  {members.map(m => (
                    <div key={m.id} className="flex items-center gap-2.5 border-b border-line px-3 py-2 last:border-b-0">
                      <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md bg-accent-soft text-[11px] font-bold text-navy">{initials(m.name)}</span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold text-navy">{m.name}</p>
                        <p className="truncate text-xs text-muted">{m.email}</p>
                      </div>
                      <span className="hidden whitespace-nowrap text-[12.5px] text-muted sm:inline">{SOURCE[m.source] ?? m.source} · {new Date(m.addedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                      <button type="button" disabled={busy === `rm-${m.id}`}
                        onClick={() => run(`rm-${m.id}`, () => api.delete(`/portals/admin/cohorts/${id}/students/${m.id}`), 'Student removed')}
                        className="h-7 rounded-md px-2.5 text-[12.5px] font-semibold text-muted hover:bg-subtle hover:text-error disabled:opacity-50">Remove</button>
                    </div>
                  ))}
                  {d.members.length > 8 && (
                    <button type="button" onClick={() => setShowAll(v => !v)} className="w-full px-3 py-2 text-left text-[12.5px] font-semibold text-azure-strong hover:bg-subtle">
                      {showAll ? 'Show fewer' : `Show all ${d.members.length}`}
                    </button>
                  )}
                </div>
              )}
            </DrawerSection>

            <DrawerSection title="Sold with">
              {!d.packages.length ? (
                <div className="flex flex-wrap items-center gap-2.5 rounded-md border border-line bg-subtle px-3 py-2.5">
                  <p className="min-w-0 flex-1 text-[13px] text-ink2">No package adds students to this cohort, so nobody can join it by buying.</p>
                  <Link href="/admin/packages" className="text-[13px] font-semibold text-azure-strong hover:underline">Link a package</Link>
                </div>
              ) : d.packages.map(p => (
                <div key={p.id} className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-semibold text-navy">{p.name}{p.isPublished ? '' : ' (draft)'}</p>
                    <p className="text-[12.5px] text-muted">{p.currency} {minorToMajor(p.priceAmount, p.currency).toLocaleString()} · {months(p.validityDays)} · {p.sold} sold</p>
                  </div>
                  <Link href="/admin/packages" className="text-[13px] font-semibold text-azure-strong hover:underline">Edit package</Link>
                </div>
              ))}
            </DrawerSection>

            <DrawerSection title="Upcoming classes" action={<Button size="sm" variant="secondary" onClick={() => setScheduling(true)}>Schedule a class</Button>}>
              {!d.upcoming.length ? <p className="text-[13px] text-ink2">Nothing scheduled.</p> : d.upcoming.map(c => (
                <p key={c.id} className="flex justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13px]">
                  <span className="truncate text-navy">{c.title}</span><strong className="whitespace-nowrap font-semibold text-navy">{when(c.scheduledAt)}</strong>
                </p>
              ))}
            </DrawerSection>
          </>}
          <ScheduleDialog open={scheduling} cohortId={id} onClose={() => setScheduling(false)} onDone={async () => { setScheduling(false); await load(id); await onChanged(); }} />
        </DrawerContent>
      )}
    </Drawer>
  );
}

function ScheduleDialog({ open, cohortId, onClose, onDone }: { open: boolean; cohortId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [at, setAt] = useState('');
  const [mins, setMins] = useState('90');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTitle(''); setMins('90'); setAt(''); } }, [open]);
  async function save() {
    setBusy(true);
    try {
      await api.post(`/live/cohorts/${cohortId}/classes`, { title: title.trim(), scheduledAt: new Date(at).toISOString(), durationMinutes: Number(mins) });
      notify.success('Class scheduled');
      await onDone();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not schedule the class'); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      {open && (
        <DialogContent title="Schedule a class">
          <div className="space-y-3">
            <label className="flex flex-col gap-1.5"><span className={label}>Topic</span>
              <input autoFocus value={title} onChange={e => setTitle(e.target.value)} className="input-base" /></label>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1.5"><span className={label}>Starts</span>
                <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} className="input-base" /></label>
              <label className="flex w-32 flex-col gap-1.5"><span className={label}>Length</span>
                <select value={mins} onChange={e => setMins(e.target.value)} className="input-base">{[45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}</select></label>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={busy} disabled={!title.trim() || !at} onClick={save}>Schedule</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function NewCohortDialog({ open, teachers, onClose, onDone }: { open: boolean; teachers: Teacher[]; onClose: () => void; onDone: () => Promise<void> }) {
  const [f, setF] = useState({ name: '', teacherId: '', sittingLabel: '', startDate: '', examDate: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) setF({ name: '', teacherId: '', sittingLabel: '', startDate: '', examDate: '' }); }, [open]);
  async function save() {
    setBusy(true);
    try {
      await api.post('/portals/admin/cohorts', {
        name: f.name.trim(), teacherId: f.teacherId, sittingLabel: f.sittingLabel.trim() || undefined,
        startDate: f.startDate || undefined, examDate: f.examDate || undefined,
      });
      notify.success('Cohort created', { description: 'Link it to a package so students join when they buy.' });
      await onDone();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not create the cohort'); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      {open && (
        <DialogContent title="New cohort" description="A group of students with one teacher, preparing for the same exam.">
          <div className="grid gap-2.5 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 sm:col-span-2"><span className={label}>Name</span>
              <input autoFocus value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="For example: WASSCE Maths · Nov 2026" className="input-base" /></label>
            <label className="flex flex-col gap-1.5 sm:col-span-2"><span className={label}>Teacher</span>
              <select value={f.teacherId} onChange={e => setF({ ...f, teacherId: e.target.value })} className="input-base">
                <option value="">Choose a teacher</option>
                {teachers.map(t => <option key={t.id} value={t.id}>{teacherName(t)}</option>)}
              </select></label>
            <label className="flex flex-col gap-1.5 sm:col-span-2"><span className={label}>Exam sitting (optional)</span>
              <input value={f.sittingLabel} onChange={e => setF({ ...f, sittingLabel: e.target.value })} placeholder="WASSCE · November 2026" className="input-base" /></label>
            <label className="flex flex-col gap-1.5"><span className={label}>Starts</span>
              <input type="date" value={f.startDate} onChange={e => setF({ ...f, startDate: e.target.value })} className="input-base" /></label>
            <label className="flex flex-col gap-1.5"><span className={label}>Exam date</span>
              <input type="date" value={f.examDate} onChange={e => setF({ ...f, examDate: e.target.value })} className="input-base" /></label>
          </div>
          <DialogFooter>
            <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={busy} disabled={!f.name.trim() || !f.teacherId} onClick={save}>Create cohort</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
