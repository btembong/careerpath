'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, Drawer, DrawerContent, DrawerSection, InfoGrid } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface ClassRow { id: string; title: string; description: string | null; scheduledAt: string; durationMins: number; status: string; recordingUrl: string | null; live: boolean; ended: boolean; attendedCount: number; rosterSize: number }
interface StudentRow { id: string; name: string; progress: number; attended: number; held: number; submitted: number; assignments: number; lastActive: string | null; flag: string | null }
interface AssignmentRow { id: string; title: string; dueDate: string; maxPoints: number; submitted: number; graded: number; total: number }
interface Overview {
  cohort: { id: string; name: string; sittingLabel: string | null; examDate: string | null; startDate: string | null };
  next: (ClassRow & { live: boolean }) | null;
  stats: { students: number; attention: number; avgProgress: number | null; courses: number; attendancePct: number | null; toGrade: number; toGradeTitle: string | null };
  students: StudentRow[];
  classes: ClassRow[];
  assignments: AssignmentRow[];
}
interface StudentDetail {
  student: { id: string; name: string; joinedAt: string; lastActive: string | null };
  flag: string | null; flagReason: string | null; progress: number; attended: number; held: number; avgGradePct: number | null;
  courses: { id: string; title: string; pct: number }[];
  recentClasses: { id: string; title: string; scheduledAt: string; attended: boolean }[];
  assignments: { id: string; title: string; maxPoints: number; state: string; grade: number | null }[];
}
interface SubRow { student: { id: string; email: string; firstName?: string | null; lastName?: string | null; name?: string | null }; submission?: { id: string; grade?: number | null; feedback?: string | null; fileUrl?: string | null } | null }

type Tab = 'students' | 'classes' | 'work';
const DAY = 86_400_000;
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const time = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const short = (d: string) => new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
const ago = (d: string | null) => {
  if (!d) return 'Never';
  const days = Math.floor((Date.now() - new Date(d).getTime()) / DAY);
  return days <= 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
};
const when = (d: string) => {
  const days = Math.round((new Date(new Date(d).toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / DAY);
  return `${days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : short(d)} ${time(d)}`;
};
const personName = (s: SubRow['student']) => s.name || [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email.split('@')[0];
const btn = (primary: boolean) => clsx('inline-flex h-8 items-center whitespace-nowrap rounded-md border px-3 text-[13px] font-semibold disabled:opacity-60',
  primary ? 'border-azure-strong bg-azure-strong text-on-accent' : 'border-line bg-white text-navy hover:bg-subtle');
const label = 'text-[13px] font-semibold text-navy';
const localInput = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);

export default function TeacherCohortPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>('students');
  const [openStudent, setOpenStudent] = useState<string | null>(null);
  const [dialog, setDialog] = useState<null | 'schedule' | 'assignment'>(null);
  const [editClass, setEditClass] = useState<ClassRow | null>(null);
  const [attendanceFor, setAttendanceFor] = useState<ClassRow | null>(null);
  const [gradeFor, setGradeFor] = useState<AssignmentRow | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const r = await api.get(`/portals/teacher/cohorts/${id}/overview`);
    setData(r.data);
  }
  useEffect(() => { load().catch(() => notify.error('Could not load this cohort')); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function start(c: { id: string; live: boolean }) {
    if (c.live) { window.open(`/teacher/live/${c.id}`, '_blank'); return; }
    setBusy(c.id);
    try {
      await api.patch(`/live/classes/${c.id}/start`);
      window.open(`/teacher/live/${c.id}`, '_blank');
      await load();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not start the class'); }
    finally { setBusy(null); }
  }
  async function end(c: ClassRow) {
    setBusy(c.id);
    try { await api.patch(`/live/classes/${c.id}/end`); notify.success('Class ended'); await load(); }
    catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not end the class'); }
    finally { setBusy(null); }
  }

  if (!data) return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/teacher/cohorts" backLabel="Cohorts" title="Cohort" />
      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">{[0, 1, 2, 3].map(i => <div key={i} className="h-24 rounded-lg border border-line bg-white animate-pulse" />)}</div>
        <div className="h-96 rounded-lg border border-line bg-white animate-pulse" />
      </div>
    </div>
  );

  const { cohort, stats, next } = data;
  const examDays = cohort.examDate ? Math.ceil((new Date(cohort.examDate).getTime() - Date.now()) / DAY) : null;
  const sub = [
    `${stats.students} student${stats.students === 1 ? '' : 's'}`,
    cohort.examDate ? `exam on ${new Date(cohort.examDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}${examDays != null && examDays >= 0 ? ` (${examDays} days)` : ''}` : null,
    cohort.startDate ? `started ${new Date(cohort.startDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : null,
  ].filter(Boolean).join(' · ');
  const tabs: [Tab, string, number][] = [['students', 'Students', data.students.length], ['classes', 'Live classes', data.classes.length], ['work', 'Assignments', data.assignments.length]];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/teacher/cohorts" backLabel="Cohorts" title={cohort.name}
        actions={<>
          <Button size="sm" variant="secondary" onClick={() => setDialog('assignment')}>New assignment</Button>
          <Button size="sm" onClick={() => setDialog('schedule')}>Schedule a class</Button>
        </>} />

      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-navy">{cohort.name}</h1>
            <p className="mt-1 text-[13.5px] text-muted">{sub}</p>
          </div>
          {next && (
            <div className="flex items-center gap-2.5 rounded-lg border border-azure bg-white px-3.5 py-2.5">
              <div className="min-w-0">
                <p className="text-xs text-muted">{next.live ? 'Live now' : `Next class · ${when(next.scheduledAt)}`}</p>
                <p className="truncate text-sm font-semibold text-navy">{next.title}</p>
              </div>
              <button type="button" disabled={busy === next.id} onClick={() => start(next)} className={clsx(btn(true), 'h-[34px] px-3.5')}>{next.live ? 'Open class' : 'Start class'}</button>
            </div>
          )}
        </div>

        <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          {[
            { l: 'Students', v: String(stats.students), sub: stats.attention ? `${stats.attention} need${stats.attention === 1 ? 's' : ''} attention` : 'Everyone on track' },
            { l: 'Avg progress', v: stats.avgProgress != null ? `${stats.avgProgress}%` : '—', sub: stats.courses ? `Across ${stats.courses} course${stats.courses === 1 ? '' : 's'}` : 'No courses linked yet' },
            { l: 'Attendance', v: stats.attendancePct != null ? `${stats.attendancePct}%` : '—', sub: 'Last 4 weeks' },
            { l: 'To grade', v: String(stats.toGrade), sub: stats.toGradeTitle ?? 'Nothing waiting' },
          ].map(s => (
            <div key={s.l} className="rounded-lg border border-line bg-white p-4">
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{s.l}</dt>
              <dd className="mt-1.5 text-[22px] font-extrabold text-navy">{s.v}</dd>
              <dd className="mt-0.5 truncate text-[12.5px] text-muted">{s.sub}</dd>
            </div>
          ))}
        </dl>

        <section className="rounded-lg border border-line bg-white">
          <div className="flex flex-wrap items-center gap-3 border-b border-line px-4">
            <div role="tablist" aria-label="Cohort" className="flex flex-1 gap-1">
              {tabs.map(([k, l, n]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={clsx('-mb-px h-[46px] border-b-2 px-3 text-[13.5px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent font-medium')}>
                  {l} <span className="font-medium text-muted">{n}</span>
                </button>
              ))}
            </div>
            {tab === 'students' && data.students.length > 0 && <span className="text-[13px] text-muted">Show: <strong className="text-navy">Needs attention first</strong></span>}
          </div>

          {tab === 'students' && (
            !data.students.length ? <p className="px-[18px] py-8 text-center text-[13px] text-ink2">No students yet. Students join when they buy a package linked to this cohort, or an admin adds them.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-[13.5px]">
                  <thead><tr>
                    {['Student', 'Course progress', 'Classes', 'Assignments', 'Last active', ''].map(h => (
                      <th key={h} className="border-b border-line px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {data.students.map(s => (
                      <tr key={s.id} onClick={() => setOpenStudent(s.id)} className="cursor-pointer hover:bg-subtle">
                        <td className="border-b border-line px-4 py-[11px]">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-md bg-accent-soft text-[11.5px] font-bold text-navy">{initials(s.name)}</span>
                            <span className="font-semibold text-navy">{s.name}</span>
                          </div>
                        </td>
                        <td className="border-b border-line px-4 py-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="h-1.5 w-[90px] overflow-hidden rounded-[3px] bg-subtle"><span className="block h-1.5 bg-azure" style={{ width: `${s.progress}%` }} /></span>
                            <span className="font-semibold text-navy">{s.progress}%</span>
                          </div>
                        </td>
                        <td className="border-b border-line px-4 py-[11px] text-navy">{s.held ? `${s.attended} of ${s.held}` : '—'}</td>
                        <td className="border-b border-line px-4 py-[11px] text-navy">{s.assignments ? `${s.submitted} of ${s.assignments}` : '—'}</td>
                        <td className="border-b border-line px-4 py-[11px] text-muted">{ago(s.lastActive)}</td>
                        <td className="border-b border-line px-4 py-[11px] text-right">
                          {s.flag && <span className="inline-flex h-6 items-center whitespace-nowrap rounded bg-accent-soft px-2 text-xs font-semibold text-navy">{s.flag}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}

          {tab === 'classes' && (
            <div>
              {!data.classes.length && <p className="px-[18px] py-8 text-center text-[13px] text-ink2">No classes yet. Use “Schedule a class” to add one.</p>}
              {[...data.classes.filter(c => !c.ended), ...data.classes.filter(c => c.ended).reverse()].map(c => (
                <div key={c.id} className="flex flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-[13px] first:border-t-0">
                  <div className={clsx('w-12 flex-shrink-0 rounded-md py-1.5 text-center', c.ended ? 'bg-subtle' : 'bg-accent-soft')}>
                    <p className="text-[11px] font-bold uppercase text-azure-strong">{new Date(c.scheduledAt).toLocaleDateString('en-GB', { month: 'short' })}</p>
                    <p className="text-lg font-extrabold text-navy">{String(new Date(c.scheduledAt).getDate()).padStart(2, '0')}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy">{c.title}</p>
                    <p className="mt-0.5 text-[12.5px] text-muted">
                      {c.ended
                        ? `${c.attendedCount} of ${c.rosterSize} attended · ${c.recordingUrl ? 'recording added' : 'no recording yet'}`
                        : `${when(c.scheduledAt)} · ${c.durationMins} min${c.live ? ' · live now' : ''}`}
                    </p>
                  </div>
                  {c.live ? <>
                    <button type="button" onClick={() => start(c)} className={btn(true)}>Open class</button>
                    <button type="button" disabled={busy === c.id} onClick={() => end(c)} className={btn(false)}>End class</button>
                  </> : !c.ended ? <>
                    {new Date(c.scheduledAt).getTime() - Date.now() < DAY && <button type="button" disabled={busy === c.id} onClick={() => start(c)} className={btn(true)}>Start class</button>}
                    <button type="button" onClick={() => setEditClass(c)} className={btn(false)}>Edit</button>
                  </> : <>
                    <button type="button" onClick={() => setAttendanceFor(c)} className={btn(false)}>Attendance</button>
                    <button type="button" onClick={() => setEditClass(c)} className={btn(false)}>{c.recordingUrl ? 'Change recording' : 'Add recording'}</button>
                  </>}
                </div>
              ))}
            </div>
          )}

          {tab === 'work' && (
            <div>
              {!data.assignments.length && <p className="px-[18px] py-8 text-center text-[13px] text-ink2">No assignments yet. Use “New assignment” to set one.</p>}
              {data.assignments.map(a => {
                const toGrade = a.submitted - a.graded;
                const closed = new Date(a.dueDate).getTime() < Date.now();
                const pct = a.total ? Math.round(((toGrade ? a.submitted : a.graded) / a.total) * 100) : 0;
                return (
                  <div key={a.id} className="flex flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-[13px] first:border-t-0">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-navy">{a.title}</p>
                      <p className="mt-0.5 text-[12.5px] text-muted">{closed ? 'Closed' : 'Due'} {new Date(a.dueDate).toLocaleDateString('en-GB', { weekday: closed ? undefined : 'long', day: 'numeric', month: 'long' })} · {a.maxPoints} marks</p>
                    </div>
                    <div className="w-[150px]">
                      <p className="mb-1 text-[12.5px] text-ink2">{toGrade ? `${a.submitted} of ${a.total} submitted` : `${a.graded} of ${a.total} graded`}</p>
                      <span className="block h-1.5 overflow-hidden rounded-[3px] bg-subtle"><span className="block h-1.5 bg-azure" style={{ width: `${pct}%` }} /></span>
                    </div>
                    <button type="button" onClick={() => setGradeFor(a)} className={btn(toGrade > 0)}>{toGrade ? `Grade ${toGrade}` : 'View'}</button>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <StudentDrawer cohortId={id} studentId={openStudent} onClose={() => setOpenStudent(null)} />
      <ScheduleDialog open={dialog === 'schedule'} cohortId={id} onClose={() => setDialog(null)} onDone={load} />
      <AssignmentDialog open={dialog === 'assignment'} cohortId={id} onClose={() => setDialog(null)} onDone={load} />
      <EditClassDialog cls={editClass} onClose={() => setEditClass(null)} onDone={load} />
      <AttendanceDrawer cls={attendanceFor} onClose={() => setAttendanceFor(null)} />
      <GradeDrawer assignment={gradeFor} onClose={() => setGradeFor(null)} onChanged={load} />
    </div>
  );
}

/* ─── Student drawer ─────────────────────────────────────────────────────── */

function StudentDrawer({ cohortId, studentId, onClose }: { cohortId: string; studentId: string | null; onClose: () => void }) {
  const [d, setD] = useState<StudentDetail | null>(null);
  useEffect(() => {
    setD(null);
    if (studentId) api.get(`/portals/teacher/cohorts/${cohortId}/students/${studentId}`).then(r => setD(r.data)).catch(() => notify.error('Could not load this student'));
  }, [cohortId, studentId]);
  const stateText = (a: StudentDetail['assignments'][number]) => a.state === 'graded' ? `${a.grade}/${a.maxPoints}` : a.state === 'waiting' ? 'Waiting for grade' : a.state === 'overdue' ? 'Not submitted' : 'Not due yet';

  return (
    <Drawer open={!!studentId} onOpenChange={o => { if (!o) onClose(); }}>
      {studentId && (
        <DrawerContent title={d?.student.name ?? 'Student'}
          description={d ? `In this cohort since ${new Date(d.student.joinedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}` : undefined}
          action={d && <Link href={`/teacher/messages?to=${d.student.id}`} className={btn(false)}>Message</Link>}>
          {!d ? <div className="h-64 rounded-md bg-subtle animate-pulse" /> : <>
            {d.flag && d.flagReason && (
              <p className="rounded-md border border-azure bg-accent-soft px-3.5 py-3 text-[13px] text-ink2">
                <strong className="text-navy">{d.flag}.</strong> {d.flagReason.charAt(0).toUpperCase() + d.flagReason.slice(1)}.
              </p>
            )}
            <InfoGrid items={[
              { label: 'Progress', value: `${d.progress}%` },
              { label: 'Classes', value: d.held ? `${d.attended} of ${d.held}` : '—' },
              { label: 'Avg grade', value: d.avgGradePct != null ? `${d.avgGradePct}%` : '—' },
            ]} />
            <DrawerSection title="Courses">
              {!d.courses.length ? <p className="text-[13px] text-ink2">No courses are linked to this cohort’s packages.</p> : (
                <div className="space-y-3">
                  {d.courses.map(c => (
                    <div key={c.id}>
                      <div className="flex justify-between gap-3 text-[13px]"><span className="truncate text-ink2">{c.title}</span><strong className="text-navy">{c.pct}%</strong></div>
                      <span className="mt-1.5 block h-1.5 overflow-hidden rounded-[3px] bg-subtle"><span className="block h-1.5 bg-azure" style={{ width: `${c.pct}%` }} /></span>
                    </div>
                  ))}
                </div>
              )}
            </DrawerSection>
            <DrawerSection title="Recent classes">
              {!d.recentClasses.length ? <p className="text-[13px] text-ink2">No classes held since they joined.</p> : (
                <div className="space-y-2">
                  {d.recentClasses.map(c => (
                    <p key={c.id} className="flex justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13px]">
                      <span className="truncate text-navy">{c.title} · {new Date(c.scheduledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                      <strong className="font-semibold text-navy">{c.attended ? 'Attended' : 'Missed'}</strong>
                    </p>
                  ))}
                </div>
              )}
            </DrawerSection>
            <DrawerSection title="Assignments">
              {!d.assignments.length ? <p className="text-[13px] text-ink2">No assignments yet.</p> : (
                <div className="space-y-2">
                  {d.assignments.map(a => (
                    <p key={a.id} className="flex justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13px]">
                      <span className="truncate text-navy">{a.title}</span><strong className="font-semibold text-navy">{stateText(a)}</strong>
                    </p>
                  ))}
                </div>
              )}
            </DrawerSection>
          </>}
        </DrawerContent>
      )}
    </Drawer>
  );
}

/* ─── Dialogs ─────────────────────────────────────────────────────────────── */

function ScheduleDialog({ open, cohortId, onClose, onDone }: { open: boolean; cohortId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [at, setAt] = useState('');
  const [mins, setMins] = useState('90');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTitle(''); setDesc(''); setMins('90'); const d = new Date(Date.now() + DAY); d.setHours(17, 0, 0, 0); setAt(localInput(d)); } }, [open]);
  async function save() {
    setBusy(true);
    try {
      await api.post(`/live/cohorts/${cohortId}/classes`, { title: title.trim(), scheduledAt: new Date(at).toISOString(), durationMinutes: Number(mins), description: desc.trim() || undefined });
      notify.success('Class scheduled', { description: 'Students see it on their cohort page.' });
      onClose(); await onDone();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not schedule the class'); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      {open && (
        <DialogContent title="Schedule a class" description="Students can join from 10 minutes before the start.">
          <div className="space-y-3">
            <label className="flex flex-col gap-1.5"><span className={label}>Topic</span>
              <input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="For example: Quadratic equations" className="input-base" /></label>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1.5"><span className={label}>Starts</span>
                <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} className="input-base" /></label>
              <label className="flex w-32 flex-col gap-1.5"><span className={label}>Length</span>
                <select value={mins} onChange={e => setMins(e.target.value)} className="input-base">{[45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}</select></label>
            </div>
            <label className="flex flex-col gap-1.5"><span className={label}>What you’ll cover (optional)</span>
              <textarea rows={3} value={desc} onChange={e => setDesc(e.target.value)} className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" /></label>
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

function AssignmentDialog({ open, cohortId, onClose, onDone }: { open: boolean; cohortId: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [f, setF] = useState({ title: '', description: '', maxPoints: '20', dueDate: '' });
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { const d = new Date(Date.now() + 7 * DAY); d.setHours(23, 59, 0, 0); setF({ title: '', description: '', maxPoints: '20', dueDate: localInput(d) }); } }, [open]);
  async function save() {
    setBusy(true);
    try {
      await api.post(`/education/cohorts/${cohortId}/assignments`, { title: f.title.trim(), description: f.description.trim(), maxPoints: parseInt(f.maxPoints), dueDate: new Date(f.dueDate).toISOString() });
      notify.success('Assignment set');
      onClose(); await onDone();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not create the assignment'); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      {open && (
        <DialogContent title="New assignment" description="Every student in the cohort sees it on their cohort page.">
          <div className="space-y-3">
            <label className="flex flex-col gap-1.5"><span className={label}>Title</span>
              <input autoFocus value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="For example: Quadratics worksheet" className="input-base" /></label>
            <label className="flex flex-col gap-1.5"><span className={label}>Instructions</span>
              <textarea rows={4} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" /></label>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1.5"><span className={label}>Due</span>
                <input type="datetime-local" value={f.dueDate} onChange={e => setF({ ...f, dueDate: e.target.value })} className="input-base" /></label>
              <label className="flex w-28 flex-col gap-1.5"><span className={label}>Marks</span>
                <input inputMode="numeric" value={f.maxPoints} onChange={e => setF({ ...f, maxPoints: e.target.value })} className="input-base" /></label>
            </div>
          </div>
          <DialogFooter>
            <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={busy} disabled={!f.title.trim() || !f.description.trim() || !f.dueDate || !(parseInt(f.maxPoints) > 0)} onClick={save}>Set assignment</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function EditClassDialog({ cls, onClose, onDone }: { cls: ClassRow | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [at, setAt] = useState('');
  const [mins, setMins] = useState('90');
  const [rec, setRec] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (cls) { setTitle(cls.title); setAt(localInput(new Date(cls.scheduledAt))); setMins(String(cls.durationMins)); setRec(cls.recordingUrl ?? ''); } }, [cls]);
  if (!cls) return <Dialog open={false} onOpenChange={() => {}}>{null}</Dialog>;
  const scheduled = cls.status === 'SCHEDULED' && !cls.ended;
  async function save() {
    setBusy('save');
    try {
      await api.patch(`/live/classes/${cls!.id}`, scheduled
        ? { title: title.trim(), scheduledAt: new Date(at).toISOString(), durationMins: Number(mins) }
        : { title: title.trim(), recordingUrl: rec.trim() || null });
      notify.success('Class updated');
      onClose(); await onDone();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not update the class'); }
    finally { setBusy(null); }
  }
  async function cancel() {
    setBusy('cancel');
    try { await api.delete(`/live/classes/${cls!.id}`); notify.success('Class cancelled'); onClose(); await onDone(); }
    catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not cancel the class'); }
    finally { setBusy(null); }
  }
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title={scheduled ? 'Edit class' : 'Class recording'} description={scheduled ? 'Students see the new time straight away.' : 'Paste a link to the recording so students who missed it can watch.'}>
        <div className="space-y-3">
          <label className="flex flex-col gap-1.5"><span className={label}>Topic</span>
            <input value={title} onChange={e => setTitle(e.target.value)} className="input-base" /></label>
          {scheduled ? (
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1.5"><span className={label}>Starts</span>
                <input type="datetime-local" value={at} onChange={e => setAt(e.target.value)} className="input-base" /></label>
              <label className="flex w-32 flex-col gap-1.5"><span className={label}>Length</span>
                <select value={mins} onChange={e => setMins(e.target.value)} className="input-base">{[45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}{![45, 60, 90, 120].includes(Number(mins)) && <option value={mins}>{mins} min</option>}</select></label>
            </div>
          ) : (
            <label className="flex flex-col gap-1.5"><span className={label}>Recording link</span>
              <input value={rec} onChange={e => setRec(e.target.value)} placeholder="https://" className="input-base" /></label>
          )}
        </div>
        <DialogFooter>
          {scheduled && <Button size="sm" variant="ghost" loading={busy === 'cancel'} onClick={cancel} className="mr-auto">Cancel class</Button>}
          <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
          <Button size="sm" loading={busy === 'save'} disabled={!title.trim()} onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AttendanceDrawer({ cls, onClose }: { cls: ClassRow | null; onClose: () => void }) {
  const [rows, setRows] = useState<{ id: string; joinedAt?: string; leftAt?: string | null; student?: { firstName?: string | null; lastName?: string | null; name?: string | null; email?: string } }[] | null>(null);
  useEffect(() => { setRows(null); if (cls) api.get(`/live/classes/${cls.id}/attendance`).then(r => setRows(r.data ?? [])).catch(() => setRows([])); }, [cls]);
  return (
    <Drawer open={!!cls} onOpenChange={o => { if (!o) onClose(); }}>
      {cls && (
        <DrawerContent title={cls.title} description={`${short(cls.scheduledAt)} · ${cls.attendedCount} of ${cls.rosterSize} attended`}>
          {!rows ? <div className="h-40 rounded-md bg-subtle animate-pulse" /> : !rows.length ? <p className="text-[13px] text-ink2">Nobody joined this class.</p> : (
            <div className="overflow-hidden rounded-md border border-line">
              {rows.map(r => {
                const n = r.student ? (r.student.name || [r.student.firstName, r.student.lastName].filter(Boolean).join(' ') || r.student.email?.split('@')[0] || 'Student') : 'Student';
                const mins = r.joinedAt && r.leftAt ? Math.round((new Date(r.leftAt).getTime() - new Date(r.joinedAt).getTime()) / 60_000) : null;
                return (
                  <p key={r.id} className="flex justify-between gap-3 border-b border-line px-3 py-2 text-[13px] last:border-b-0">
                    <span className="font-semibold text-navy">{n}</span>
                    <span className="text-muted">{r.joinedAt ? `Joined ${time(r.joinedAt)}` : ''}{mins != null ? ` · ${mins} min` : ''}</span>
                  </p>
                );
              })}
            </div>
          )}
        </DrawerContent>
      )}
    </Drawer>
  );
}

function GradeDrawer({ assignment, onClose, onChanged }: { assignment: AssignmentRow | null; onClose: () => void; onChanged: () => Promise<void> }) {
  const [rows, setRows] = useState<SubRow[] | null>(null);
  const [grades, setGrades] = useState<Record<string, { score: string; feedback: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  async function load(a: AssignmentRow) {
    const r = await api.get(`/education/assignments/${a.id}/submissions`);
    const list: SubRow[] = r.data?.students ?? [];
    // Submitted and ungraded first
    list.sort((x, y) => Number(!!y.submission && y.submission.grade == null) - Number(!!x.submission && x.submission.grade == null) || Number(!!y.submission) - Number(!!x.submission));
    setRows(list);
  }
  useEffect(() => { setRows(null); setGrades({}); if (assignment) load(assignment).catch(() => setRows([])); }, [assignment]); // eslint-disable-line react-hooks/exhaustive-deps
  async function grade(subId: string) {
    const g = grades[subId];
    if (!g?.score) { notify.error('Enter a score first'); return; }
    setBusy(subId);
    try {
      await api.patch(`/education/submissions/${subId}/grade`, { grade: parseFloat(g.score), feedback: g.feedback });
      notify.success('Graded');
      await load(assignment!); await onChanged();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not save the grade'); }
    finally { setBusy(null); }
  }
  return (
    <Drawer open={!!assignment} onOpenChange={o => { if (!o) onClose(); }}>
      {assignment && (
        <DrawerContent title={assignment.title} description={`${assignment.submitted} of ${assignment.total} submitted · ${assignment.graded} graded · ${assignment.maxPoints} marks`}>
          {!rows ? <div className="h-40 rounded-md bg-subtle animate-pulse" /> : rows.map(r => {
            const s = r.submission;
            return (
              <div key={r.student.id} className="space-y-2 rounded-md border border-line p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13.5px] font-semibold text-navy">{personName(r.student)}</p>
                  <span className="text-[12.5px] text-muted">{!s ? 'Not submitted' : s.grade != null ? `Graded · ${s.grade}/${assignment.maxPoints}` : 'Waiting for your grade'}</span>
                </div>
                {s?.fileUrl && <a href={s.fileUrl} target="_blank" rel="noopener noreferrer" className="text-[13px] font-semibold text-azure-strong hover:underline">Open their work</a>}
                {s && s.grade == null && (
                  <div className="flex flex-wrap items-start gap-2">
                    <input inputMode="decimal" aria-label="Score" placeholder={`Score / ${assignment.maxPoints}`} value={grades[s.id]?.score ?? ''}
                      onChange={e => setGrades(g => ({ ...g, [s.id]: { score: e.target.value, feedback: g[s.id]?.feedback ?? '' } }))} className="input-base h-9 w-28" />
                    <input aria-label="Feedback" placeholder="Feedback for the student" value={grades[s.id]?.feedback ?? ''}
                      onChange={e => setGrades(g => ({ ...g, [s.id]: { score: g[s.id]?.score ?? '', feedback: e.target.value } }))} className="input-base h-9 min-w-[160px] flex-1" />
                    <Button size="sm" loading={busy === s.id} onClick={() => grade(s.id)}>Save</Button>
                  </div>
                )}
                {s?.feedback && s.grade != null && <p className="text-[12.5px] text-ink2">“{s.feedback}”</p>}
              </div>
            );
          })}
        </DrawerContent>
      )}
    </Drawer>
  );
}
