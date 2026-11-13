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
const HOUR_PX = 40;
const time = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const hm = (m: number) => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`;
const LABEL: Record<Kind, string> = { live: 'Live classes', mentor: 'Mentorship', study: 'Study time', due: 'Deadlines' };
const ONE: Record<Kind, string> = { live: 'Live class', mentor: 'Mentorship', study: 'Study time', due: 'Deadline' };
const CHIP: Record<Kind, string> = {
  live: 'bg-[#2F57C9] text-[#FFFFFF] border-[#2F57C9]',
  mentor: 'bg-[#072061] text-[#FFFFFF] border-[#072061]',
  study: 'bg-accent-soft text-navy border-[#3F6FE8]',
  due: 'bg-[#FFF6E5] text-[#8A5A0B] border-[#D99A2B]',
};
const mondayOf = (d: Date) => { const m = new Date(d); m.setHours(0, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };
const sameDay = (a: Date | string, b: Date | string) => new Date(a).toDateString() === new Date(b).toDateString();

/** Events that overlap in time sit side by side: each gets a column, and the group shares the width */
function layoutDay(evs: Ev[]) {
  const end = (e: Ev) => +new Date(e.startsAt) + Math.max(e.durationMins, 20) * 60_000;
  const sorted = [...evs].sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));
  const out: { e: Ev; col: number; cols: number }[] = [];
  let group: { e: Ev; col: number; cols: number }[] = [], groupEnd = 0;
  const close = () => { const n = Math.max(1, ...group.map(g => g.col + 1)); group.forEach(g => { g.cols = n; }); out.push(...group); group = []; };
  for (const e of sorted) {
    if (group.length && +new Date(e.startsAt) >= groupEnd) close();
    const used = new Set(group.filter(g => end(g.e) > +new Date(e.startsAt)).map(g => g.col));
    let col = 0; while (used.has(col)) col++;
    group.push({ e, col, cols: 1 });
    groupEnd = Math.max(groupEnd, end(e));
  }
  close();
  return out;
}

function downloadIcs(events: Ev[]) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const clean = (s: string) => s.replace(/[,;\n]/g, ' ');
  const body = events.filter(e => new Date(e.startsAt).getTime() > Date.now()).map(e => {
    const s = new Date(e.startsAt), en = new Date(s.getTime() + Math.max(e.durationMins, 15) * 60_000);
    return ['BEGIN:VEVENT', `UID:${e.kind}-${e.id}@careerpathafrica`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(s)}`, `DTEND:${fmt(en)}`, `SUMMARY:${clean(`${ONE[e.kind]}: ${e.title}`)}`, `DESCRIPTION:${clean(e.detail)}`, 'END:VEVENT'].join('\r\n');
  });
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CareerPath Africa//Study calendar//EN', ...body, 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'study-calendar.ics'; a.click(); URL.revokeObjectURL(a.href);
}

export default function StudyCalendarPage() {
  const [view, setView] = useState<'week' | 'month'>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [cal, setCal] = useState<Cal | null>(null);
  const [now3, setNow3] = useState<Cal | null>(null);
  const [off, setOff] = useState<Partial<Record<Kind, boolean>>>({});
  const [sel, setSel] = useState<string | null>(null);
  const [day, setDay] = useState(() => new Date().toDateString());
  const [planning, setPlanning] = useState<Date | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // What's shown: one week, or the month in whole weeks
  const [from, to] = useMemo(() => {
    if (view === 'week') { const m = mondayOf(anchor); return [m, new Date(+m + 7 * DAY)]; }
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
    return [mondayOf(first), new Date(+mondayOf(last) + 7 * DAY)];
  }, [view, anchor]);

  async function load() {
    const thisMonday = mondayOf(new Date());
    const [r, w] = await Promise.all([
      api.get('/portals/student/calendar', { params: { from: from.toISOString(), to: to.toISOString() } }),
      // This week for the summary, and three weeks ahead for deadlines
      api.get('/portals/student/calendar', { params: { from: thisMonday.toISOString(), to: new Date(+thisMonday + 21 * DAY).toISOString() } }),
    ]);
    setCal(r.data); setNow3(w.data);
  }
  useEffect(() => { setCal(null); load().catch(() => notify.error('Could not load your calendar')); }, [+from, +to]); // eslint-disable-line react-hooks/exhaustive-deps

  const vis = (e: Ev) => !off[e.kind];
  const events = (cal?.events ?? []).filter(vis);
  const all = [...(cal?.events ?? []), ...(now3?.events ?? [])];
  const picked = all.find(e => `${e.kind}-${e.id}` === sel) ?? null;

  // This week's study: planned vs done per day (study blocks), plus the week totals from the server
  const thisMonday = mondayOf(new Date());
  const weekDays = Array.from({ length: 7 }, (_, i) => new Date(+thisMonday + i * DAY));
  const studyThisWeek = (now3?.events ?? []).filter(e => e.kind === 'study' && new Date(e.startsAt) < new Date(+thisMonday + 7 * DAY));
  const perDay = weekDays.map(d => {
    const es = studyThisWeek.filter(e => sameDay(e.startsAt, d));
    return { d, plan: es.reduce((n, e) => n + e.durationMins, 0), done: es.filter(e => e.done).reduce((n, e) => n + e.durationMins, 0) };
  });
  const dayMax = Math.max(60, ...perDay.map(x => x.plan));
  const w = now3?.week;
  const studied = w ? Math.max(w.doneMins, w.lessonMins) : 0;
  const today = (now3?.events ?? []).filter(e => sameDay(e.startsAt, new Date()) || (e.kind === 'due' && !e.done && sameDay(e.startsAt, new Date(Date.now() + DAY))));
  const deadlines = (now3?.events ?? []).filter(e => e.kind === 'due' && new Date(e.startsAt).getTime() > Date.now() - 3 * DAY).slice(0, 5);

  const days = Array.from({ length: Math.round((+to - +from) / DAY) }, (_, i) => new Date(+from + i * DAY));
  const timed = events.filter(e => e.kind !== 'due');
  const startHour = Math.min(8, ...timed.map(e => new Date(e.startsAt).getHours()));
  const endHour = Math.max(21, ...timed.map(e => Math.ceil(new Date(e.startsAt).getHours() + e.durationMins / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const nowTop = ((new Date().getHours() + new Date().getMinutes() / 60) - startHour) * HOUR_PX;
  const title = view === 'week'
    ? `${from.getDate()} ${from.getMonth() !== new Date(+to - DAY).getMonth() ? from.toLocaleDateString('en-GB', { month: 'short' }) + ' ' : ''}– ${new Date(+to - DAY).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}`
    : anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
  const move = (n: number) => setAnchor(a => view === 'week' ? new Date(+a + n * 7 * DAY) : new Date(a.getFullYear(), a.getMonth() + n, 1));
  const dayEvents = events.filter(e => sameDay(e.startsAt, day)).sort((a, b) => +new Date(a.startsAt) - +new Date(b.startsAt));

  async function act(e: Ev, k: 'done' | 'del') {
    setBusy(k);
    try {
      if (k === 'del') { await api.delete(`/portals/student/study-blocks/${e.id}`); setSel(null); }
      else await api.patch(`/portals/student/study-blocks/${e.id}`, { done: !e.done });
      await load();
    } catch { notify.error('That didn’t work'); }
    finally { setBusy(null); }
  }

  const evButton = (e: Ev, cls: string, style?: React.CSSProperties) => (
    <button key={`${e.kind}-${e.id}`} type="button" onClick={() => setSel(`${e.kind}-${e.id}`)} title={`${ONE[e.kind]}: ${e.title}`} style={style}
      className={clsx('overflow-hidden rounded-md border text-left text-[11px] leading-tight', CHIP[e.kind], e.done && 'opacity-55', sel === `${e.kind}-${e.id}` && 'ring-2 ring-[#3F6FE8] ring-offset-2', cls)}>
      <span className={clsx('block truncate font-bold', e.done && e.kind === 'due' && 'line-through')}>{e.title}</span>
      {e.kind !== 'due' && <span className="block truncate opacity-85">{time(e.startsAt)} · {hm(e.durationMins)}</span>}
    </button>
  );

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Study calendar" subtitle="Classes, deadlines, mentor sessions and the study time you plan"
        actions={<>
          <Button size="sm" onClick={() => { const d = new Date(Date.now() + DAY); d.setHours(17, 0, 0, 0); setPlanning(d); }}>+ Plan study time</Button>
        </>} />
      <div className="flex flex-col gap-[18px] p-4 lg:px-7 lg:py-6">
        <div className="flex flex-wrap gap-[18px]">
          <section className="keep-light flex min-w-0 flex-[999_1_520px] flex-wrap items-end gap-5 rounded-xl bg-[#3F6FE8] p-5 text-navy sm:px-[26px] sm:py-[22px]">
            <div className="flex min-w-0 flex-[1_1_240px] flex-col gap-2">
              <p className="text-[12.5px] font-bold uppercase tracking-[0.08em]">This week</p>
              <p className="text-[34px] font-extrabold leading-none tracking-[-0.03em] sm:text-[44px]"><span className="text-[#FFFFFF]">{hm(studied)}</span> studied</p>
              <p className="text-sm text-[#0B1F55]">{w?.plannedMins ? `of ${hm(w.plannedMins)} you planned${w.plannedMins > studied ? ` · ${hm(w.plannedMins - studied)} still to go by Sunday` : ' · on plan'}` : 'Plan some study time and tick it off when you’re done'}</p>
              {now3?.exam && <span className="mt-1 inline-flex h-7 items-center self-start rounded-md bg-[#FFFFFF] px-2.5 text-[12.5px] font-bold">{now3.exam.daysLeft} days to {now3.exam.label ?? 'your exam'}</span>}
            </div>
            <div role="img" aria-label="Study planned and done each day this week" className="flex h-[130px] min-w-0 flex-[1_1_300px] items-end gap-2.5">
              {perDay.map(({ d, plan, done }) => {
                const isToday = sameDay(d, new Date());
                return (
                  <div key={+d} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
                    <span className="flex w-full max-w-[30px] items-end overflow-hidden rounded border-2 border-dashed border-[rgba(255,255,255,0.8)]" style={{ height: Math.max(8, Math.round((plan / dayMax) * 104)) }}>
                      <span className="block w-full bg-[#FFFFFF]" style={{ height: `${plan ? Math.round((done / plan) * 100) : 0}%` }} />
                    </span>
                    <span className={clsx('text-[11.5px]', isToday ? 'font-extrabold' : 'font-medium')}>{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 rounded-xl border border-line bg-white p-5">
            <div className="flex items-baseline justify-between"><h2 className="text-base font-bold text-navy">Today</h2><span className="text-[12.5px] text-muted">{new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</span></div>
            {!now3 ? <div className="h-24 animate-pulse rounded-lg bg-subtle" /> : !today.length ? <p className="text-[13px] text-ink2">Nothing today. A good day to plan an hour of study.</p> : today.map(e => (
              <div key={`${e.kind}-${e.id}`} className="flex items-center gap-2.5 rounded-lg bg-subtle px-3 py-2.5">
                <span className={clsx('w-1 self-stretch rounded-sm border', CHIP[e.kind])} />
                <button type="button" onClick={() => setSel(`${e.kind}-${e.id}`)} className="min-w-0 flex-1 text-left">
                  <span className={clsx('block truncate text-[13.5px] font-bold text-navy', e.done && 'line-through opacity-60')}>{e.title}</span>
                  <span className="block truncate text-xs text-muted">{e.kind === 'due' ? `Due ${sameDay(e.startsAt, new Date()) ? 'today' : 'tomorrow'}, ${time(e.startsAt)}` : `${time(e.startsAt)} · ${hm(e.durationMins)} · ${ONE[e.kind].toLowerCase()}`}</span>
                </button>
                {e.kind === 'study'
                  ? <button type="button" disabled={!!busy} onClick={() => act(e, 'done')} className="inline-flex h-[30px] items-center whitespace-nowrap rounded-md border border-line bg-white px-2.5 text-xs font-bold text-navy">{e.done ? 'Undo' : 'Mark done'}</button>
                  : e.href && <Link href={e.href} className="inline-flex h-[30px] items-center whitespace-nowrap rounded-md border border-line bg-white px-2.5 text-xs font-bold text-navy">{e.kind === 'live' ? 'Open' : 'Open'}</Link>}
              </div>
            ))}
          </section>
        </div>

        <div className="flex flex-wrap items-start gap-[18px]">
          <section className="flex min-w-0 flex-[999_1_640px] flex-col gap-3 rounded-xl border border-line bg-white p-4 sm:p-[18px]">
            <div className="flex flex-wrap items-center gap-2.5">
              <strong className="flex-1 text-[17px] text-navy">{title}</strong>
              <div className="flex gap-1">
                <button type="button" aria-label="Previous" onClick={() => move(-1)} className="inline-flex h-8 items-center rounded-md border border-line px-2.5 text-[13px] font-bold text-navy hover:bg-subtle">‹</button>
                <button type="button" onClick={() => { setAnchor(new Date()); setDay(new Date().toDateString()); }} className="inline-flex h-8 items-center rounded-md border border-line px-3 text-[13px] font-bold text-navy hover:bg-subtle">Today</button>
                <button type="button" aria-label="Next" onClick={() => move(1)} className="inline-flex h-8 items-center rounded-md border border-line px-2.5 text-[13px] font-bold text-navy hover:bg-subtle">›</button>
              </div>
              <button type="button" disabled={!cal?.events.length} onClick={() => cal && downloadIcs(cal.events)} className="hidden h-8 items-center rounded-md border border-line px-3 text-[13px] font-semibold text-navy hover:bg-subtle disabled:opacity-50 sm:inline-flex">Add to phone calendar</button>
              <div role="tablist" aria-label="View" className="flex gap-0.5 rounded-lg border border-line p-[3px]">
                {(['week', 'month'] as const).map(v => <button key={v} type="button" role="tab" aria-selected={view === v} onClick={() => setView(v)} className={clsx('h-7 rounded-md px-3 text-[12.5px] capitalize text-navy', view === v ? 'bg-accent-soft font-bold' : 'font-medium')}>{v}</button>)}
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {(['live', 'due', 'study', 'mentor'] as Kind[]).map(k => (
                <button key={k} type="button" aria-pressed={!off[k]} onClick={() => setOff(o => ({ ...o, [k]: !o[k] }))}
                  className={clsx('inline-flex h-[30px] items-center gap-1.5 rounded-md border px-2.5 text-[12.5px] font-semibold', !off[k] ? 'border-[#C9D7FB] bg-white text-navy' : 'border-dashed border-line bg-subtle text-muted line-through')}>
                  <span className={clsx('h-2.5 w-2.5 rounded-[3px] border', CHIP[k])} />{LABEL[k]}
                </button>
              ))}
            </div>

            {!cal ? <div className="h-[420px] animate-pulse rounded-lg bg-subtle" /> : view === 'week' ? <>
              {/* Phones: pick a day, see its list */}
              <div className="flex flex-col gap-2.5 lg:hidden">
                <div className="flex gap-1.5 overflow-x-auto">
                  {days.map(d => {
                    const on = d.toDateString() === day, n = events.filter(e => sameDay(e.startsAt, d)).length;
                    return (
                      <button key={+d} type="button" onClick={() => setDay(d.toDateString())} aria-pressed={on}
                        className={clsx('flex h-[58px] min-w-[44px] flex-1 flex-col items-center justify-center gap-0.5 rounded-lg', on ? 'bg-[#3F6FE8] text-[#FFFFFF]' : 'border border-line text-navy')}>
                        <span className="text-[11px] font-semibold">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span>
                        <span className="text-base font-extrabold">{d.getDate()}</span>
                        <span className="flex h-1 gap-0.5">{Array.from({ length: Math.min(3, n) }, (_, i) => <span key={i} className={clsx('h-1 w-1 rounded-full', on ? 'bg-[#FFFFFF]' : 'bg-[#3F6FE8]')} />)}</span>
                      </button>
                    );
                  })}
                </div>
                {!dayEvents.length ? <p className="rounded-lg bg-subtle px-3.5 py-6 text-center text-[13px] text-ink2">Nothing this day.</p> : dayEvents.map(e => (
                  <div key={`${e.kind}-${e.id}`} className="flex gap-3">
                    <span className="w-11 flex-shrink-0 pt-2 text-xs font-bold text-azure-strong">{e.kind === 'due' ? 'Due' : time(e.startsAt)}</span>
                    {evButton(e, 'flex-1 px-3 py-2 text-[12.5px]')}
                  </div>
                ))}
              </div>

              {/* Larger screens: the week with times */}
              <div className="hidden overflow-x-auto lg:block">
                <div className="min-w-[720px]">
                  <div className="grid grid-cols-[48px_repeat(7,1fr)] gap-1">
                    <span />
                    {days.map(d => {
                      const isToday = sameDay(d, new Date());
                      return <div key={+d} className={clsx('flex flex-col items-center rounded-lg py-1.5', isToday ? 'bg-[#3F6FE8] text-[#FFFFFF]' : 'text-navy')}><span className="text-[11.5px] font-semibold">{d.toLocaleDateString('en-GB', { weekday: 'short' })}</span><span className="text-lg font-extrabold">{d.getDate()}</span></div>;
                    })}
                    <span className="self-center text-[10.5px] text-muted">Due</span>
                    {days.map(d => <div key={+d} className="flex min-h-7 flex-col gap-[3px]">{events.filter(e => e.kind === 'due' && sameDay(e.startsAt, d)).map(e => evButton(e, 'w-full px-1.5 py-1'))}</div>)}
                  </div>
                  <div className="mt-1 grid grid-cols-[48px_repeat(7,1fr)] gap-1">
                    <div className="flex flex-col">{hours.map(h => <span key={h} className="text-[10.5px] text-muted" style={{ height: HOUR_PX }}>{String(h).padStart(2, '0')}:00</span>)}</div>
                    {days.map(d => {
                      const isToday = sameDay(d, new Date());
                      return (
                        <div key={+d} className={clsx('relative rounded-md', isToday ? 'bg-accent-soft/40' : 'bg-white')}
                          style={{ height: hours.length * HOUR_PX, backgroundImage: `repeating-linear-gradient(transparent 0, transparent ${HOUR_PX - 1}px, var(--color-line, #EEF1F7) ${HOUR_PX - 1}px, var(--color-line, #EEF1F7) ${HOUR_PX}px)` }}>
                          {layoutDay(timed.filter(e => sameDay(e.startsAt, d))).map(({ e, col, cols }) => {
                            const s = new Date(e.startsAt), top = (s.getHours() + s.getMinutes() / 60 - startHour) * HOUR_PX;
                            return evButton(e, 'absolute px-1.5 py-1', { top, height: Math.max(26, (e.durationMins / 60) * HOUR_PX - 2), left: `calc(${(col / cols) * 100}% + 2px)`, width: `calc(${100 / cols}% - 4px)` });
                          })}
                          {isToday && nowTop > 0 && nowTop < hours.length * HOUR_PX && <span className="absolute left-0 right-0 h-0.5 bg-[#E5484D]" style={{ top: nowTop }} />}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </> : (
              <div className="grid grid-cols-7 gap-1">
                {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(x => <span key={x} className="px-1 text-[11px] font-semibold uppercase text-muted">{x}</span>)}
                {days.map(d => {
                  const inMonth = d.getMonth() === anchor.getMonth(), isToday = sameDay(d, new Date());
                  const es = events.filter(e => sameDay(e.startsAt, d));
                  return (
                    <button key={+d} type="button" onClick={() => { setView('week'); setAnchor(d); setDay(d.toDateString()); }}
                      className={clsx('flex min-h-[74px] flex-col gap-[3px] rounded-md border p-1.5 text-left', isToday ? 'border-[#3F6FE8]' : 'border-line', inMonth ? 'bg-white' : 'bg-subtle')}>
                      <span className={clsx('text-[12.5px] font-bold', isToday ? 'inline-grid h-[22px] w-[22px] place-items-center rounded-full bg-[#3F6FE8] text-[#FFFFFF]' : inMonth ? 'text-navy' : 'text-muted')}>{d.getDate()}</span>
                      <span className="hidden flex-col gap-[3px] sm:flex">{es.slice(0, 3).map(e => <span key={`${e.kind}-${e.id}`} className={clsx('truncate rounded border px-1 text-[10.5px] font-semibold', CHIP[e.kind], e.done && 'opacity-55')}>{e.kind !== 'due' ? `${time(e.startsAt)} ` : ''}{e.title}</span>)}</span>
                      <span className="flex flex-wrap gap-[3px] sm:hidden">{es.slice(0, 4).map(e => <span key={`${e.kind}-${e.id}`} className={clsx('h-1.5 w-1.5 rounded-full border', CHIP[e.kind])} />)}</span>
                      {es.length > 3 && <span className="hidden text-[10.5px] text-muted sm:block">+{es.length - 3} more</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
            {picked && (
              <section className="flex flex-col gap-2 rounded-xl border-2 border-[#3F6FE8] bg-white p-[18px]">
                <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">{ONE[picked.kind]}</p>
                <p className="text-[17px] font-extrabold text-navy">{picked.title}</p>
                <p className="text-[13px] text-ink2">{new Date(picked.startsAt).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}, {picked.kind === 'due' ? `by ${time(picked.startsAt)}` : `${time(picked.startsAt)} · ${hm(picked.durationMins)}`}</p>
                <p className="text-[13px] text-ink2">{picked.detail}{picked.kind === 'due' ? (picked.done ? ' · handed in' : ' · not handed in yet') : ''}</p>
                <div className="mt-1 flex flex-wrap gap-2">
                  {picked.kind === 'study' && <>
                    <Button size="sm" loading={busy === 'done'} onClick={() => act(picked, 'done')}>{picked.done ? 'Not done yet' : 'Mark done'}</Button>
                    <Button size="sm" variant="secondary" loading={busy === 'del'} onClick={() => act(picked, 'del')}>Remove</Button>
                  </>}
                  {picked.href && <Link href={picked.href} className="inline-flex h-8 items-center rounded-md bg-azure-strong px-3 text-[13px] font-semibold text-on-accent">{picked.kind === 'live' ? 'Open class' : picked.kind === 'due' ? 'Open assignment' : picked.kind === 'mentor' ? 'Open mentorship' : 'Open course'}</Link>}
                </div>
              </section>
            )}
            <section className="flex flex-col gap-2 rounded-xl border border-line bg-white p-[18px]">
              <h3 className="text-[15px] font-bold text-navy">Deadlines</h3>
              {!now3 ? <div className="h-20 animate-pulse rounded-lg bg-subtle" /> : !deadlines.length ? <p className="text-[13px] text-ink2">Nothing due in the next three weeks.</p> : deadlines.map(e => {
                const days = Math.ceil((+new Date(e.startsAt) - Date.now()) / DAY);
                return (
                  <button key={e.id} type="button" onClick={() => setSel(`${e.kind}-${e.id}`)} className="flex items-center gap-2.5 border-t border-line py-2 text-left">
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-bold text-navy">{e.title}</span><span className="block truncate text-xs text-muted">{e.detail}</span></span>
                    <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-bold', e.done ? 'bg-[#E6F5EE] text-[#1F6B47]' : days <= 2 ? 'bg-[#FFF6E5] text-[#8A5A0B]' : 'bg-subtle text-ink2')}>
                      {e.done ? 'Done' : days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`}
                    </span>
                  </button>
                );
              })}
            </section>
            <button type="button" onClick={() => cal && downloadIcs(cal.events)} className="rounded-xl border border-line bg-white p-[18px] text-left sm:hidden">
              <span className="block text-[15px] font-bold text-navy">Add to my phone calendar</span>
              <span className="mt-0.5 block text-[13px] text-ink2">Your classes, sessions and study time, in your phone’s calendar.</span>
            </button>
          </aside>
        </div>
      </div>

      <PlanDialog at={planning} onClose={() => setPlanning(null)} onDone={async () => { setPlanning(null); await load(); }} />
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
