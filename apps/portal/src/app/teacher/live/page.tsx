'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter, Drawer, DrawerContent } from '@/components/ui/Dialog';
import { EditClassDialog, EditableClass } from '@/components/live/EditClassDialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Row extends EditableClass { description: string | null; cohort: { id: string; name: string }; rosterSize: number; attendedCount: number }
interface Overview {
  cohorts: { id: string; name: string; examDate: string | null; students: number }[];
  next: Row | null;
  stats: { thisWeek: number; cohortsThisWeek: number; attendancePct: number | null; missingRecordings: number; minutesThisTerm: number };
  upcoming: Row[]; needsRecording: Row[]; past: Row[];
}
type Tab = 'up' | 'rec' | 'past';

const DAY = 86_400_000;
const time = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const when = (d: string) => {
  const days = Math.round((new Date(new Date(d).toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / DAY);
  return `${days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} ${time(d)}`;
};
const badge = (blue: boolean) => clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-semibold', blue ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2');
const btn = (primary: boolean) => clsx('inline-flex h-8 items-center whitespace-nowrap rounded-md border px-3 text-[13px] font-semibold disabled:opacity-60',
  primary ? 'border-azure-strong bg-azure-strong text-on-accent' : 'border-line bg-white text-navy hover:bg-subtle');
const label = 'text-[13px] font-semibold text-navy';

export default function TeacherLivePage() {
  const [d, setD] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>('up');
  const [cohort, setCohort] = useState('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [edit, setEdit] = useState<Row | null>(null);
  const [att, setAtt] = useState<Row | null>(null);
  const [scheduling, setScheduling] = useState(false);

  async function load() { const r = await api.get('/live/teacher/overview'); setD(r.data); }
  useEffect(() => { load().catch(() => notify.error('Could not load your classes')); }, []);

  async function start(c: Row) {
    if (c.status === 'ACTIVE') { window.open(`/teacher/live/${c.id}`, '_blank'); return; }
    setBusy(c.id);
    try { await api.patch(`/live/classes/${c.id}/start`); window.open(`/teacher/live/${c.id}`, '_blank'); await load(); }
    catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not start the class'); }
    finally { setBusy(null); }
  }
  async function end(c: Row) {
    setBusy(c.id);
    try { await api.patch(`/live/classes/${c.id}/end`); notify.success('Class ended'); await load(); }
    catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not end the class'); }
    finally { setBusy(null); }
  }

  const filter = (list: Row[]) => list.filter(c => cohort === 'all' || c.cohort.id === cohort);
  const rows = d ? filter(tab === 'up' ? d.upcoming : tab === 'rec' ? d.needsRecording : d.past) : [];
  const next = d?.next;
  const nextIn = next ? Math.round((+new Date(next.scheduledAt) - Date.now()) / 60_000) : 0;
  const hours = d ? Math.round(d.stats.minutesThisTerm / 60) : 0;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Live classes" subtitle="Your classes across all cohorts"
        actions={<Button size="sm" disabled={!d?.cohorts.length} onClick={() => setScheduling(true)}>Schedule a class</Button>} />

      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        {!d ? <div className="h-64 rounded-lg border border-line bg-white animate-pulse" /> : !d.cohorts.length ? (
          <div className="rounded-lg border border-line bg-white p-10 text-center">
            <p className="text-sm font-semibold text-navy">You don’t have a cohort yet</p>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-ink2">An admin creates cohorts and assigns them to you. Once you have one, you can schedule its live classes here.</p>
          </div>
        ) : <>
          {next && (
            <section className="flex flex-wrap items-center gap-4 rounded-lg border border-azure bg-white px-5 py-[18px]">
              <div className="min-w-0 flex-[999_1_300px]">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">
                  {next.status === 'ACTIVE' ? 'Live now' : `Next · ${when(next.scheduledAt)}${nextIn > 0 && nextIn < 120 ? ` · in ${nextIn} min` : ''}`}
                </p>
                <p className="mt-1 text-lg font-extrabold text-navy">{next.title}</p>
                <p className="mt-0.5 text-[13.5px] text-ink2">{next.cohort.name} · {next.rosterSize} students · {next.durationMins} min</p>
              </div>
              {next.status === 'ACTIVE' ? <>
                <button type="button" disabled={busy === next.id} onClick={() => end(next)} className={clsx(btn(false), 'h-10 px-4 text-sm')}>End class</button>
                <button type="button" onClick={() => start(next)} className={clsx(btn(true), 'h-10 px-5 text-sm')}>Open class</button>
              </> : <>
                <button type="button" onClick={() => setEdit(next)} className={clsx(btn(false), 'h-10 px-4 text-sm')}>Edit</button>
                <button type="button" disabled={busy === next.id || nextIn > 24 * 60} onClick={() => start(next)} className={clsx(btn(true), 'h-10 px-5 text-sm')}
                  title={nextIn > 24 * 60 ? 'You can start a class on the day' : undefined}>Start class</button>
              </>}
            </section>
          )}

          <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            {[
              { l: 'This week', v: `${d.stats.thisWeek} class${d.stats.thisWeek === 1 ? '' : 'es'}`, sub: d.stats.cohortsThisWeek ? `${d.stats.cohortsThisWeek} cohort${d.stats.cohortsThisWeek === 1 ? '' : 's'}` : 'Nothing scheduled' },
              { l: 'Attendance', v: d.stats.attendancePct != null ? `${d.stats.attendancePct}%` : '—', sub: 'Last 4 weeks' },
              { l: 'Missing recordings', v: String(d.stats.missingRecordings), sub: d.stats.missingRecordings ? 'Students who missed can’t catch up' : 'All caught up' },
              { l: 'Hours taught', v: `${hours} h`, sub: 'Last 4 months' },
            ].map(s => (
              <div key={s.l} className="rounded-lg border border-line bg-white p-4">
                <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{s.l}</dt>
                <dd className="mt-1.5 text-[22px] font-extrabold text-navy">{s.v}</dd>
                <dd className="mt-0.5 truncate text-[12.5px] text-muted">{s.sub}</dd>
              </div>
            ))}
          </dl>

          <section className="rounded-lg border border-line bg-white">
            <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4">
              <div role="tablist" aria-label="Classes" className="flex flex-1 gap-1 overflow-x-auto">
                {([['up', 'Coming up', d.upcoming], ['rec', 'Needs a recording', d.needsRecording], ['past', 'Past', d.past]] as [Tab, string, Row[]][]).map(([k, l, list]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                    className={clsx('-mb-px h-[46px] whitespace-nowrap border-b-2 px-3 text-[13.5px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent font-medium')}>
                    {l} <span className="font-medium text-muted">{filter(list).length}</span>
                  </button>
                ))}
              </div>
              {d.cohorts.length > 1 && (
                <label className="my-1.5 flex items-center gap-1.5 text-[13px] text-muted">Cohort:
                  <select value={cohort} onChange={e => setCohort(e.target.value)} className="h-8 rounded-md border border-line bg-white px-2 font-semibold text-navy outline-none">
                    <option value="all">All</option>
                    {d.cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              )}
            </div>
            {!rows.length && (
              <p className="px-[18px] py-8 text-center text-[13px] text-ink2">
                {tab === 'up' ? 'Nothing scheduled. Use “Schedule a class” to add one or a weekly series.' : tab === 'rec' ? 'Every class held has its recording. Thank you!' : 'No classes held yet.'}
              </p>
            )}
            {rows.map(c => {
              const pastClass = tab !== 'up';
              const live = c.status === 'ACTIVE';
              const soon = +new Date(c.scheduledAt) - Date.now() < DAY;
              return (
                <div key={c.id} className="flex flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-[13px] first:border-t-0">
                  <div className={clsx('w-12 flex-shrink-0 rounded-md py-1.5 text-center', pastClass ? 'bg-subtle' : 'bg-accent-soft')}>
                    <p className="text-[11px] font-bold uppercase text-azure-strong">{new Date(c.scheduledAt).toLocaleDateString('en-GB', { month: 'short' })}</p>
                    <p className="text-lg font-extrabold text-navy">{String(new Date(c.scheduledAt).getDate()).padStart(2, '0')}</p>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-navy">{c.title}</p>
                    <p className="mt-0.5 truncate text-[12.5px] text-muted">
                      {pastClass ? `${c.attendedCount} of ${c.rosterSize} attended · ${c.cohort.name}${tab === 'past' ? ` · ${c.recordingUrl ? 'recording added' : 'no recording yet'}` : ''}`
                        : `${when(c.scheduledAt)} · ${c.durationMins} min · ${c.cohort.name}`}
                    </p>
                  </div>
                  {tab === 'up' ? <>
                    <span className={badge(live || soon)}>{live ? 'Live now' : soon ? `In ${Math.max(1, Math.round((+new Date(c.scheduledAt) - Date.now()) / 60_000))} min` : 'Scheduled'}</span>
                    {live ? <>
                      <button type="button" onClick={() => start(c)} className={btn(true)}>Open class</button>
                      <button type="button" disabled={busy === c.id} onClick={() => end(c)} className={btn(false)}>End</button>
                    </> : <>
                      {soon && <button type="button" disabled={busy === c.id} onClick={() => start(c)} className={btn(true)}>Start class</button>}
                      <button type="button" onClick={() => setEdit(c)} className={btn(false)}>Edit</button>
                    </>}
                  </> : tab === 'rec' ? <>
                    <span className={badge(false)}>No recording</span>
                    <button type="button" onClick={() => setEdit(c)} className={btn(true)}>Add recording</button>
                  </> : <>
                    <span className={badge(true)}>Held</span>
                    <button type="button" onClick={() => setAtt(c)} className={btn(false)}>Attendance</button>
                    <button type="button" onClick={() => setEdit(c)} className={btn(false)}>{c.recordingUrl ? 'Recording' : 'Add recording'}</button>
                  </>}
                </div>
              );
            })}
          </section>
        </>}
      </div>

      <EditClassDialog cls={edit} onClose={() => setEdit(null)} onDone={load} />
      <AttendanceDrawer cls={att} onClose={() => setAtt(null)} />
      {d && <ScheduleDialog open={scheduling} cohorts={d.cohorts} defaultCohort={cohort !== 'all' ? cohort : d.cohorts[0]?.id} onClose={() => setScheduling(false)} onDone={load} />}
    </div>
  );
}

function ScheduleDialog({ open, cohorts, defaultCohort, onClose, onDone }: {
  open: boolean; cohorts: Overview['cohorts']; defaultCohort?: string; onClose: () => void; onDone: () => Promise<void>;
}) {
  const [f, setF] = useState({ cohortId: '', title: '', at: '', mins: '90', desc: '', repeat: false });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    const d = new Date(Date.now() + DAY); d.setHours(17, 0, 0, 0);
    setF({ cohortId: defaultCohort ?? '', title: '', at: new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16), mins: '90', desc: '', repeat: false });
  }, [open, defaultCohort]);

  const exam = cohorts.find(c => c.id === f.cohortId)?.examDate;
  // Weekly classes from the first one up to the exam (at most 26)
  const weeks = f.at && exam ? Math.min(26, Math.max(1, Math.floor((new Date(exam).getTime() - new Date(f.at).getTime()) / (7 * DAY)) + 1)) : 8;

  async function save() {
    setBusy(true);
    try {
      const r = await api.post(`/live/cohorts/${f.cohortId}/classes/series`, {
        title: f.title.trim(), description: f.desc.trim() || undefined, scheduledAt: new Date(f.at).toISOString(),
        durationMinutes: Number(f.mins), weeks: f.repeat ? weeks : 1,
      });
      notify.success(r.data.created > 1 ? `${r.data.created} classes scheduled` : 'Class scheduled', { description: 'Students see them on their live classes page.' });
      onClose(); await onDone();
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not schedule the class'); }
    finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onClose(); }}>
      {open && (
        <DialogContent title="Schedule a class" description="Students can join from 10 minutes before the start.">
          <div className="space-y-3">
            <label className="flex flex-col gap-1.5"><span className={label}>Cohort</span>
              <select value={f.cohortId} onChange={e => setF({ ...f, cohortId: e.target.value })} className="input-base">
                {cohorts.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></label>
            <label className="flex flex-col gap-1.5"><span className={label}>Topic</span>
              <input autoFocus value={f.title} onChange={e => setF({ ...f, title: e.target.value })} placeholder="For example: Statistics — reading the data" className="input-base" /></label>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1.5"><span className={label}>Starts</span>
                <input type="datetime-local" value={f.at} onChange={e => setF({ ...f, at: e.target.value })} className="input-base" /></label>
              <label className="flex w-32 flex-col gap-1.5"><span className={label}>Length</span>
                <select value={f.mins} onChange={e => setF({ ...f, mins: e.target.value })} className="input-base">{[45, 60, 90, 120].map(m => <option key={m} value={m}>{m} min</option>)}</select></label>
            </div>
            <label className="flex flex-col gap-1.5"><span className={label}>What you’ll cover (optional)</span>
              <textarea rows={2} value={f.desc} onChange={e => setF({ ...f, desc: e.target.value })} className="w-full resize-none rounded-md border border-line px-3 py-2 text-sm text-navy outline-none focus:border-azure" /></label>
            <label className="flex items-center gap-2 text-[13.5px] text-navy">
              <input type="checkbox" checked={f.repeat} onChange={e => setF({ ...f, repeat: e.target.checked })} className="h-4 w-4 accent-[var(--color-azure-strong)]" />
              Repeat every week {exam ? `until the exam (${weeks} classes)` : `for ${weeks} weeks`}
            </label>
          </div>
          <DialogFooter>
            <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={busy} disabled={!f.cohortId || !f.title.trim() || !f.at} onClick={save}>{f.repeat ? `Schedule ${weeks} classes` : 'Schedule'}</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function AttendanceDrawer({ cls, onClose }: { cls: Row | null; onClose: () => void }) {
  const [rows, setRows] = useState<{ id: string; joinedAt?: string; leftAt?: string | null; student?: { firstName?: string | null; lastName?: string | null; email?: string } }[] | null>(null);
  useEffect(() => { setRows(null); if (cls) api.get(`/live/classes/${cls.id}/attendance`).then(r => setRows(r.data ?? [])).catch(() => setRows([])); }, [cls]);
  return (
    <Drawer open={!!cls} onOpenChange={o => { if (!o) onClose(); }}>
      {cls && (
        <DrawerContent title={cls.title} description={`${new Date(cls.scheduledAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · ${cls.attendedCount} of ${cls.rosterSize} attended`}>
          {!rows ? <div className="h-40 rounded-md bg-subtle animate-pulse" /> : !rows.length ? <p className="text-[13px] text-ink2">Nobody joined this class.</p> : (
            <div className="overflow-hidden rounded-md border border-line">
              {rows.map(r => {
                const n = [r.student?.firstName, r.student?.lastName].filter(Boolean).join(' ') || r.student?.email?.split('@')[0] || 'Student';
                const mins = r.joinedAt && r.leftAt ? Math.round((+new Date(r.leftAt) - +new Date(r.joinedAt)) / 60_000) : null;
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
