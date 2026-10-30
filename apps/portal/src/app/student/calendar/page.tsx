'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Dialog, DialogContent, DialogFooter } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Kind = 'live' | 'due' | 'mentor' | 'study';
interface Ev { id: string; kind: Kind; title: string; startsAt: string; durationMins: number; detail: string; href: string | null; done?: boolean }
interface Cal { events: Ev[]; week: { plannedMins: number; doneMins: number; lessonMins: number }; exam: { date: string; label: string | null; daysLeft: number } | null }

const DAY = 86_400_000;
const time = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const hm = (m: number) => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`;
const CHIP: Record<Kind, string> = {
  live: 'bg-azure-strong text-on-accent', due: 'border border-azure-strong text-navy', mentor: 'bg-navy text-white dark:bg-ink2', study: 'bg-accent-soft text-navy',
};
const LABEL: Record<Kind, string> = { live: 'Live class', due: 'Deadline', mentor: 'Mentorship', study: 'Study time' };

function downloadIcs(events: Ev[]) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const clean = (s: string) => s.replace(/[,;\n]/g, ' ');
  const body = events.filter(e => new Date(e.startsAt).getTime() > Date.now()).map(e => {
    const s = new Date(e.startsAt), en = new Date(s.getTime() + Math.max(e.durationMins, 15) * 60_000);
    return ['BEGIN:VEVENT', `UID:${e.kind}-${e.id}@careerpathafrica`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(s)}`, `DTEND:${fmt(en)}`, `SUMMARY:${clean(`${LABEL[e.kind]}: ${e.title}`)}`, `DESCRIPTION:${clean(e.detail)}`, 'END:VEVENT'].join('\r\n');
  });
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CareerPath Africa//Study calendar//EN', ...body, 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'study-calendar.ics'; a.click(); URL.revokeObjectURL(a.href);
}

export default function StudyCalendarPage() {
  const [month, setMonth] = useState(() => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), 1); });
  const [cal, setCal] = useState<Cal | null>(null);
  const [planning, setPlanning] = useState<Date | null>(null);
  const [picked, setPicked] = useState<Ev | null>(null);

  // The grid shows whole weeks, Monday first
  const gridStart = useMemo(() => new Date(month.getTime() - ((month.getDay() + 6) % 7) * DAY), [month]);
  const gridEnd = useMemo(() => {
    const last = new Date(month.getFullYear(), month.getMonth() + 1, 0);
    return new Date(last.getTime() + (7 - ((last.getDay() + 6) % 7)) * DAY);
  }, [month]);

  async function load() {
    const r = await api.get('/portals/student/calendar', { params: { from: gridStart.toISOString(), to: gridEnd.toISOString() } });
    setCal(r.data);
  }
  useEffect(() => { setCal(null); load().catch(() => notify.error('Could not load your calendar')); }, [gridStart.getTime()]); // eslint-disable-line react-hooks/exhaustive-deps

  const days = useMemo(() => {
    const out: { date: Date; events: Ev[] }[] = [];
    for (let t = gridStart.getTime(); t < gridEnd.getTime(); t += DAY) {
      const d = new Date(t);
      out.push({ date: d, events: (cal?.events ?? []).filter(e => new Date(e.startsAt).toDateString() === d.toDateString()) });
    }
    return out;
  }, [cal, gridStart, gridEnd]);
  const agenda = (cal?.events ?? []).filter(e => { const t = new Date(e.startsAt).getTime(); return t >= Date.now() - 3_600_000 && t < Date.now() + 7 * DAY; });
  const today = new Date().toDateString();
  const w = cal?.week;
  const studied = w ? Math.max(w.doneMins, w.lessonMins) : 0;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Study calendar" subtitle="Classes, deadlines, mentorship and your own study time"
        actions={<>
          <Button size="sm" variant="secondary" disabled={!cal?.events.length} onClick={() => cal && downloadIcs(cal.events)}>Add to my phone calendar</Button>
          <Button size="sm" onClick={() => { const d = new Date(Date.now() + DAY); d.setHours(17, 0, 0, 0); setPlanning(d); }}>Plan study time</Button>
        </>} />
      <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-6">
        <section className="min-w-0 flex-[999_1_600px] rounded-lg border border-line bg-white p-4">
          <div className="mb-3 flex flex-wrap items-center gap-2.5">
            <strong className="flex-1 text-base text-navy">{month.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</strong>
            <span className="flex gap-3 text-[13px] font-semibold text-azure-strong">
              <button type="button" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() - 1, 1))}>‹ Previous</button>
              <button type="button" onClick={() => { const n = new Date(); setMonth(new Date(n.getFullYear(), n.getMonth(), 1)); }}>Today</button>
              <button type="button" onClick={() => setMonth(m => new Date(m.getFullYear(), m.getMonth() + 1, 1))}>Next ›</button>
            </span>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => <p key={x} className="p-1 text-[11.5px] font-semibold uppercase text-muted">{x}</p>)}
            {days.map(({ date, events }) => {
              const inMonth = date.getMonth() === month.getMonth();
              const isToday = date.toDateString() === today;
              return (
                <div key={date.toISOString()} className={clsx('group min-h-[92px] rounded-md border p-1.5', isToday ? 'border-azure' : 'border-line', !inMonth && 'bg-subtle')}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className={clsx('text-[12.5px] font-bold', isToday ? 'text-azure-strong' : inMonth ? 'text-navy' : 'text-muted')}>{date.getDate()}</span>
                    <button type="button" aria-label="Plan study time this day" onClick={() => { const d = new Date(date); d.setHours(17, 0, 0, 0); setPlanning(d); }}
                      className="hidden h-5 w-5 rounded text-[13px] font-bold leading-none text-azure-strong hover:bg-accent-soft group-hover:block">+</button>
                  </div>
                  {events.slice(0, 3).map(e => (
                    <button key={`${e.kind}-${e.id}`} type="button" onClick={() => setPicked(e)} title={`${LABEL[e.kind]}: ${e.title}`}
                      className={clsx('mb-[3px] block w-full truncate rounded-[3px] px-1.5 py-0.5 text-left text-[10.5px] font-semibold', CHIP[e.kind], e.done && 'line-through opacity-60')}>
                      {e.kind !== 'due' ? `${time(e.startsAt)} ` : ''}{e.title}
                    </button>
                  ))}
                  {events.length > 3 && <p className="text-[10.5px] text-muted">+{events.length - 3} more</p>}
                </div>
              );
            })}
          </div>
          <div className="mt-3 flex flex-wrap gap-3.5 text-[12.5px] text-ink2">
            {(['live', 'due', 'study', 'mentor'] as Kind[]).map(k => <span key={k} className="flex items-center gap-1.5"><span className={clsx('inline-block h-2.5 w-2.5 rounded-sm', CHIP[k])} />{LABEL[k]}</span>)}
          </div>
        </section>

        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
          <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-4">
            <h3 className="text-[15px] font-semibold text-navy">Next 7 days</h3>
            {!cal ? <div className="h-24 rounded-md bg-subtle animate-pulse" /> : !agenda.length ? <p className="text-[13px] text-ink2">Nothing coming up. Plan some study time.</p> : agenda.map(e => (
              <button key={`${e.kind}-${e.id}`} type="button" onClick={() => setPicked(e)} className="flex gap-2.5 rounded-md border border-line px-2.5 py-2 text-left hover:bg-subtle">
                <span className="w-16 flex-shrink-0 text-xs font-bold text-azure-strong">{new Date(e.startsAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })}</span>
                <span className="min-w-0">
                  <span className={clsx('block truncate text-[13px] font-semibold text-navy', e.done && 'line-through')}>{e.title}</span>
                  <span className="block truncate text-xs text-muted">{LABEL[e.kind]}{e.kind !== 'due' ? ` · ${time(e.startsAt)}` : ' · by ' + time(e.startsAt)}{e.durationMins ? ` · ${hm(e.durationMins)}` : ''}</span>
                </span>
              </button>
            ))}
          </section>
          <section className="flex flex-col gap-1.5 rounded-lg border border-line bg-white p-4">
            <h3 className="text-[15px] font-semibold text-navy">This week</h3>
            <p className="text-[26px] font-extrabold text-navy">{hm(studied)} <span className="text-[13px] font-medium text-muted">{w?.plannedMins ? `of ${hm(w.plannedMins)} planned` : 'studied'}</span></p>
            {w?.plannedMins ? <span className="block h-1.5 overflow-hidden rounded-[3px] bg-subtle"><span className="block h-1.5 bg-azure" style={{ width: `${Math.min(100, Math.round((studied / w.plannedMins) * 100))}%` }} /></span> : null}
            <p className="text-[12.5px] text-muted">{cal?.exam ? `${cal.exam.daysLeft} days until ${cal.exam.label ?? 'your exam'}` : 'Counts lessons you watch and study time you tick off'}</p>
          </section>
        </aside>
      </div>

      <PlanDialog at={planning} onClose={() => setPlanning(null)} onDone={async () => { setPlanning(null); await load(); }} />
      <EventDialog ev={picked} onClose={() => setPicked(null)} onChanged={async () => { setPicked(null); await load(); }} />
    </div>
  );
}

function PlanDialog({ at, onClose, onDone }: { at: Date | null; onClose: () => void; onDone: () => Promise<void> }) {
  const [f, setF] = useState({ when: '', mins: '60', topic: '', courseId: '', weeks: '1' });
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!at) return;
    setF({ when: new Date(at.getTime() - at.getTimezoneOffset() * 60_000).toISOString().slice(0, 16), mins: '60', topic: '', courseId: '', weeks: '1' });
    api.get('/portals/student/library').then(r => setCourses((r.data?.courses ?? []).map((c: { id: string; title: string }) => ({ id: c.id, title: c.title })))).catch(() => {});
  }, [at]);
  return (
    <Dialog open={!!at} onOpenChange={o => { if (!o) onClose(); }}>
      {at && (
        <DialogContent title="Plan study time" description="Put it on your calendar so it actually happens. Tick it off when you’re done.">
          <div className="space-y-3">
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">What will you study?</span>
              <input autoFocus value={f.topic} onChange={e => setF({ ...f, topic: e.target.value })} placeholder="For example: Statistics notes and 10 questions" className="input-base" /></label>
            <div className="flex gap-2">
              <label className="flex flex-1 flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">When</span>
                <input type="datetime-local" value={f.when} onChange={e => setF({ ...f, when: e.target.value })} className="input-base" /></label>
              <label className="flex w-28 flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">How long</span>
                <select value={f.mins} onChange={e => setF({ ...f, mins: e.target.value })} className="input-base">{[30, 45, 60, 90, 120].map(m => <option key={m} value={m}>{hm(m)}</option>)}</select></label>
            </div>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Course (optional)</span>
              <select value={f.courseId} onChange={e => setF({ ...f, courseId: e.target.value })} className="input-base"><option value="">None</option>{courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
            <label className="flex flex-col gap-1.5"><span className="text-[13px] font-semibold text-navy">Repeat</span>
              <select value={f.weeks} onChange={e => setF({ ...f, weeks: e.target.value })} className="input-base"><option value="1">Just once</option>{[2, 4, 6, 8].map(n => <option key={n} value={n}>Every week for {n} weeks</option>)}</select></label>
          </div>
          <DialogFooter>
            <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
            <Button size="sm" loading={busy} disabled={!f.topic.trim() || !f.when} onClick={async () => {
              setBusy(true);
              try {
                await api.post('/portals/student/study-blocks', { startsAt: new Date(f.when).toISOString(), durationMins: Number(f.mins), topic: f.topic.trim(), courseId: f.courseId || undefined, repeatWeeks: Number(f.weeks) });
                notify.success(Number(f.weeks) > 1 ? `${f.weeks} study sessions planned` : 'Study time planned'); await onDone();
              } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not plan that'); }
              finally { setBusy(false); }
            }}>Add to calendar</Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function EventDialog({ ev, onClose, onChanged }: { ev: Ev | null; onClose: () => void; onChanged: () => Promise<void> }) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!ev) return <Dialog open={false} onOpenChange={() => {}}>{null}</Dialog>;
  const run = async (k: string, fn: () => Promise<unknown>) => { setBusy(k); try { await fn(); await onChanged(); } catch { notify.error('That didn’t work'); } finally { setBusy(null); } };
  return (
    <Dialog open onOpenChange={o => { if (!o) onClose(); }}>
      <DialogContent title={ev.title} description={`${LABEL[ev.kind]} · ${new Date(ev.startsAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, ${time(ev.startsAt)}${ev.durationMins ? ` · ${hm(ev.durationMins)}` : ''}`}>
        <p className="text-[13.5px] text-ink2">{ev.detail}{ev.kind === 'due' ? (ev.done ? ' · handed in' : ' · not handed in yet') : ''}</p>
        <DialogFooter>
          {ev.kind === 'study' && <>
            <Button size="sm" variant="ghost" className="mr-auto" loading={busy === 'del'} onClick={() => run('del', () => api.delete(`/portals/student/study-blocks/${ev.id}`))}>Remove</Button>
            <Button size="sm" variant="secondary" loading={busy === 'done'} onClick={() => run('done', () => api.patch(`/portals/student/study-blocks/${ev.id}`, { done: !ev.done }))}>{ev.done ? 'Not done yet' : 'Mark done'}</Button>
          </>}
          {ev.href && <Link href={ev.href} className="inline-flex h-8 items-center rounded-md bg-azure-strong px-3 text-[13px] font-semibold text-on-accent">{ev.kind === 'live' ? 'Open class' : ev.kind === 'due' ? 'Open assignment' : ev.kind === 'mentor' ? 'Open mentorship' : 'Open course'}</Link>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
