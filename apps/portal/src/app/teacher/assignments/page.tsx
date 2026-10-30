'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, Drawer, DrawerContent, DrawerSection, InfoGrid } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Sub {
  id: string; assignmentId: string; title: string; maxPoints: number; dueDate: string;
  cohort: { id: string; name: string }; student: { id: string; name: string };
  fileUrl: string | null; note: string | null; grade: number | null; feedback: string | null; submittedAt: string; late: boolean;
}
interface Assignment { id: string; title: string; description: string; dueDate: string; maxPoints: number; cohort: { id: string; name: string }; students: number; submitted: number; graded: number; late: number }
interface Overview {
  cohorts: { id: string; name: string; students: number }[];
  stats: { toGrade: number; oldestWaitDays: number | null; setThisMonth: number; onTimePct: number | null; avgGradePct: number | null };
  toGrade: Sub[]; graded: Sub[]; assignments: Assignment[];
}
type Tab = 'grade' | 'all' | 'graded';
const DAY = 86_400_000;
const ago = (d: string) => { const n = Math.floor((Date.now() - new Date(d).getTime()) / DAY); return n <= 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`; };
const date = (d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

export default function TeacherAssignmentsPage() {
  const [d, setD] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>('grade');
  const [grading, setGrading] = useState<Sub | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() { const r = await api.get('/education/teacher/assignments-overview'); setD(r.data); return r.data as Overview; }
  useEffect(() => { load().catch(() => notify.error('Could not load assignments')); }, []);

  const s = d?.stats;
  const btn = (primary: boolean) => clsx('inline-flex h-8 items-center rounded-md border px-3 text-[13px] font-semibold', primary ? 'border-azure-strong bg-azure-strong text-on-accent' : 'border-line bg-white text-navy hover:bg-subtle');

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Assignments" subtitle="Set work for your cohorts and grade what comes in"
        actions={<Button size="sm" disabled={!d?.cohorts.length} onClick={() => setCreating(true)}>New assignment</Button>} />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
          {[
            { l: 'To grade', v: s ? String(s.toGrade) : '…', sub: s?.oldestWaitDays != null ? `Oldest waiting ${s.oldestWaitDays} day${s.oldestWaitDays === 1 ? '' : 's'}` : 'Nothing waiting' },
            { l: 'Due this month', v: s ? String(s.setThisMonth) : '…', sub: d ? `${d.cohorts.length} cohort${d.cohorts.length === 1 ? '' : 's'}` : '' },
            { l: 'On time', v: s?.onTimePct != null ? `${s.onTimePct}%` : '—', sub: 'Handed in before the due date' },
            { l: 'Average grade', v: s?.avgGradePct != null ? `${s.avgGradePct}%` : '—', sub: 'Last 30 days' },
          ].map(x => (
            <div key={x.l} className="rounded-lg border border-line bg-white p-4">
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{x.l}</dt>
              <dd className="mt-1.5 text-[22px] font-extrabold text-navy">{x.v}</dd>
              <dd className="mt-0.5 truncate text-[12.5px] text-muted">{x.sub}</dd>
            </div>
          ))}
        </dl>

        <section className="rounded-lg border border-line bg-white">
          <div role="tablist" aria-label="Assignments" className="flex gap-1 border-b border-line px-4">
            {([['grade', 'To grade', d?.toGrade.length], ['all', 'All assignments', d?.assignments.length], ['graded', 'Graded', d?.graded.length]] as [Tab, string, number | undefined][]).map(([k, l, n]) => (
              <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={clsx('-mb-px h-[46px] border-b-2 px-3 text-[13.5px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent font-medium')}>
                {l} <span className="font-medium text-muted">{n ?? 0}</span>
              </button>
            ))}
          </div>
          {!d ? <div className="m-4 h-40 rounded-md bg-subtle animate-pulse" /> : tab === 'all' ? (
            !d.assignments.length ? <p className="px-4 py-10 text-center text-[13px] text-ink2">No assignments yet. Use “New assignment” to set one.</p> :
            d.assignments.map(a => (
              <div key={a.id} className="flex flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-3.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy">{a.title}</p>
                  <p className="mt-0.5 truncate text-[12.5px] text-muted">{a.cohort.name} · {new Date(a.dueDate).getTime() < Date.now() ? 'closed' : 'due'} {date(a.dueDate)} · {a.maxPoints} marks</p>
                </div>
                <div className="w-[160px]">
                  <p className="mb-1 text-[12.5px] text-ink2">{a.submitted} of {a.students} handed in{a.late ? ` · ${a.late} late` : ''}</p>
                  <span className="block h-1.5 overflow-hidden rounded-[3px] bg-subtle"><span className="block h-1.5 bg-azure" style={{ width: `${a.students ? Math.round((a.submitted / a.students) * 100) : 0}%` }} /></span>
                </div>
                <Link href={`/teacher/cohorts/${a.cohort.id}`} className={btn(false)}>Cohort</Link>
              </div>
            ))
          ) : (
            !(tab === 'grade' ? d.toGrade : d.graded).length ? <p className="px-4 py-10 text-center text-[13px] text-ink2">{tab === 'grade' ? 'Nothing to grade. Well done!' : 'Nothing graded yet.'}</p> :
            (tab === 'grade' ? d.toGrade : d.graded).map(x => (
              <div key={x.id} className="flex flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-3.5 first:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy">{x.title} — {x.student.name}</p>
                  <p className="mt-0.5 truncate text-[12.5px] text-muted">{x.cohort.name} · handed in {ago(x.submittedAt)} · {x.maxPoints} marks</p>
                </div>
                {tab === 'grade'
                  ? <span className={clsx('inline-flex h-6 items-center rounded px-2 text-xs font-semibold', x.late ? 'border border-line bg-subtle text-ink2' : 'bg-accent-soft text-navy')}>{x.late ? 'Late' : 'New'}</span>
                  : <span className="inline-flex h-6 items-center rounded bg-accent-soft px-2 text-xs font-semibold text-navy">{x.grade}/{x.maxPoints}</span>}
                <button type="button" onClick={() => setGrading(x)} className={btn(tab === 'grade')}>{tab === 'grade' ? 'Grade' : 'View'}</button>
              </div>
            ))
          )}
        </section>
      </div>

      <GradeDrawer sub={grading} onClose={() => setGrading(null)}
        onSaved={async () => {
          const fresh = await load();
          const next = fresh.toGrade[0];
          setGrading(next ?? null);
          if (!next) notify.success('All graded');
        }} />
      {d && <NewAssignmentDialog open={creating} cohorts={d.cohorts} onClose={() => setCreating(false)} onDone={async () => { setCreating(false); await load(); }} />}
    </div>
  );
}

function GradeDrawer({ sub, onClose, onSaved }: { sub: Sub | null; onClose: () => void; onSaved: () => Promise<void> }) {
  const [score, setScore] = useState('');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { setScore(sub?.grade != null ? String(sub.grade) : ''); setFeedback(sub?.feedback ?? ''); }, [sub?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sub) return <Drawer open={false} onOpenChange={() => {}}>{null}</Drawer>;
  const n = Number(score);
  const valid = score.trim() !== '' && n >= 0 && n <= sub.maxPoints;
  const graded = sub.grade != null;

  async function save() {
    setBusy(true);
    try {
      await api.patch(`/education/submissions/${sub!.id}/grade`, { grade: n, feedback: feedback.trim() || undefined });
      notify.success('Grade saved', { description: `${sub!.student.name} gets a notification.` });
      await onSaved();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not save the grade'); }
    finally { setBusy(false); }
  }

  return (
    <Drawer open onOpenChange={o => { if (!o) onClose(); }}>
      <DrawerContent title={sub.title} description={`${sub.student.name} · handed in ${ago(sub.submittedAt)}${sub.late ? ' (late)' : ''}`}
        footer={!graded ? <><span className="flex-1" /><Button loading={busy} disabled={!valid} onClick={save}>Save grade and next</Button></> : undefined}>
        <InfoGrid items={[
          { label: 'Cohort', value: sub.cohort.name },
          { label: 'Due', value: date(sub.dueDate) },
          { label: 'Marks', value: String(sub.maxPoints) },
        ]} />
        <DrawerSection title="Their work">
          {sub.fileUrl
            ? <a href={sub.fileUrl} target="_blank" rel="noopener noreferrer" className="block rounded-md border border-dashed border-azure bg-subtle px-4 py-4 text-[13.5px] font-semibold text-azure-strong hover:underline">Open the file they handed in</a>
            : <p className="text-[13px] text-ink2">No file — see their note.</p>}
          {sub.note && <p className="text-[13px] text-ink2">Their note: “{sub.note}”</p>}
        </DrawerSection>
        <DrawerSection title={graded ? 'Your grade' : 'Grade'}>
          <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Score out of {sub.maxPoints}</span>
            <input inputMode="decimal" value={score} disabled={graded} onChange={e => setScore(e.target.value)} className="input-base w-32" /></label>
          <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Feedback</span>
            <textarea rows={4} value={feedback} disabled={graded} onChange={e => setFeedback(e.target.value)} placeholder="What went well, and what to work on"
              className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" /></label>
        </DrawerSection>
      </DrawerContent>
    </Drawer>
  );
}

function NewAssignmentDialog({ open, cohorts, onClose, onDone }: { open: boolean; cohorts: Overview['cohorts']; onClose: () => void; onDone: () => Promise<void> }) {
  const [f, setF] = useState({ cohortId: '', title: '', description: '', maxPoints: '20', dueDate: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const d = new Date(Date.now() + 7 * DAY); d.setHours(23, 59, 0, 0);
    setF({ cohortId: cohorts[0]?.id ?? '', title: '', description: '', maxPoints: '20', dueDate: new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) });
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      {open && (
        <DialogContent title="New assignment" description="Every student in the cohort sees it, and it appears on their calendar.">
          <div className="space-y-3">
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Cohort</span>
              <select value={f.cohortId} onChange={e => setF({ ...f, cohortId: e.target.value })} className="input-base">{cohorts.map(c => <option key={c.id} value={c.id}>{c.name} · {c.students} students</option>)}</select></label>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Title</span>
              <input autoFocus value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="For example: Quadratics worksheet" className="input-base" /></label>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Instructions</span>
              <textarea rows={4} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" /></label>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Due</span>
                <input type="datetime-local" value={f.dueDate} onChange={e => setF({ ...f, dueDate: e.target.value })} className="input-base" /></label>
              <label className="flex w-28 flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Marks</span>
                <input inputMode="numeric" value={f.maxPoints} onChange={e => setF({ ...f, maxPoints: e.target.value })} className="input-base" /></label>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={busy} disabled={!f.cohortId || !f.title.trim() || !f.description.trim() || !f.dueDate || !(parseInt(f.maxPoints) > 0)} onClick={async () => {
              setBusy(true);
              try {
                await api.post(`/education/cohorts/${f.cohortId}/assignments`, { title: f.title.trim(), description: f.description.trim(), maxPoints: parseInt(f.maxPoints), dueDate: new Date(f.dueDate).toISOString() });
                notify.success('Assignment set'); await onDone();
              } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not create the assignment'); }
              finally { setBusy(false); }
            }}>Set assignment</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}
