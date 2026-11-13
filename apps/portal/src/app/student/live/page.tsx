'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';
import { StudentLiveHero } from '@/components/hero/StudentHeroes';

interface Cls {
  id: string; title: string; description: string | null; scheduledAt: string; durationMins: number; status: string;
  recordingUrl: string | null; cohort: { id: string; name: string }; teacher: string;
  attended?: boolean; beforeJoined?: boolean; inClass?: number;
}
interface Overview {
  live: Cls[]; upcoming: Cls[]; past: Cls[]; catchUp: Cls[];
  attendance: { attended: number; held: number; cohortAvgPct: number | null } | null;
}

const DAY = 86_400_000;
const time = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const dayKey = (d: string) => new Date(d).toDateString();
const dayTitle = (d: string) => {
  const days = Math.round((new Date(dayKey(d)).getTime() - new Date(new Date().toDateString()).getTime()) / DAY);
  const label = new Date(d).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  return days === 0 ? `Today · ${label}` : days === 1 ? `Tomorrow · ${label}` : label;
};
const inDays = (d: string) => {
  const days = Math.round((new Date(dayKey(d)).getTime() - new Date(new Date().toDateString()).getTime()) / DAY);
  return days <= 0 ? 'Today' : days === 1 ? 'Tomorrow' : `In ${days} days`;
};

/** One calendar file with every upcoming class, or just one */
function downloadIcs(list: Cls[], name: string) {
  const fmt = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const clean = (s: string) => s.replace(/[,;\n]/g, ' ');
  const events = list.map(c => {
    const s = new Date(c.scheduledAt), e = new Date(s.getTime() + c.durationMins * 60_000);
    return ['BEGIN:VEVENT', `UID:${c.id}@careerpathafrica`, `DTSTAMP:${fmt(new Date())}`, `DTSTART:${fmt(s)}`, `DTEND:${fmt(e)}`,
      `SUMMARY:${clean(c.title)}`, `DESCRIPTION:${clean(`${c.cohort.name} with ${c.teacher}`)}`, `URL:${window.location.origin}/student/live/${c.id}`, 'END:VEVENT'].join('\r\n');
  });
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CareerPath Africa//Live classes//EN', ...events, 'END:VCALENDAR'].join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  a.download = name; a.click(); URL.revokeObjectURL(a.href);
}

const badge = (blue: boolean) => clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-semibold', blue ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2');
const btn = (primary: boolean) => clsx('inline-flex h-8 items-center whitespace-nowrap rounded-md border px-3 text-[13px] font-semibold',
  primary ? 'border-azure-strong bg-azure-strong text-on-accent' : 'border-line bg-white text-navy hover:bg-subtle');

export default function StudentLivePage() {
  const [d, setD] = useState<Overview | null>(null);
  const [tab, setTab] = useState<'up' | 'past'>('up');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const load = () => api.get('/live/student/overview').then(r => setD(r.data)).catch(() => setD({ live: [], upcoming: [], past: [], catchUp: [], attendance: null }));
    load();
    const iv = setInterval(() => { load(); setNow(Date.now()); }, 60_000);
    return () => clearInterval(iv);
  }, []);

  // Monday-to-Sunday strip for this week
  const week = useMemo(() => {
    const today = new Date(new Date().toDateString());
    const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY);
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday.getTime() + i * DAY);
      const items = [...(d?.live ?? []), ...(d?.upcoming ?? []), ...(d?.past ?? [])].filter(c => dayKey(c.scheduledAt) === day.toDateString())
        .sort((a, b) => +new Date(a.scheduledAt) - +new Date(b.scheduledAt));
      return { day, items, today: day.getTime() === today.getTime() };
    });
  }, [d]);

  const groups = useMemo(() => {
    const list = tab === 'up' ? [...(d?.live ?? []), ...(d?.upcoming ?? [])] : (d?.past ?? []);
    const out: { key: string; title: string; items: Cls[] }[] = [];
    list.forEach(c => {
      const key = dayKey(c.scheduledAt);
      const g = out.find(x => x.key === key);
      if (g) g.items.push(c); else out.push({ key, title: dayTitle(c.scheduledAt), items: [c] });
    });
    return out;
  }, [d, tab]);

  const live = d?.live[0];
  const a = d?.attendance;
  const pct = a?.held ? Math.round((a.attended / a.held) * 100) : null;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Live classes" subtitle="Every class from your cohorts, and recordings of the ones you missed"
        actions={d?.upcoming.length ? <button type="button" onClick={() => downloadIcs(d.upcoming, 'live-classes.ics')} className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Add all to my calendar</button> : undefined} />

      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        {!d ? <div className="h-64 rounded-lg border border-line bg-white animate-pulse" /> : !d.attendance ? (
          <div className="rounded-lg border border-line bg-white p-10 text-center">
            <p className="text-sm font-semibold text-navy">You’re not in a cohort yet</p>
            <p className="mx-auto mt-1 max-w-md text-[13px] text-ink2">Live classes come with packages that include a cohort. You’ll see every class here once you join one.</p>
            <Link href="/packages" className="mt-4 inline-flex h-9 items-center rounded-md bg-azure-strong px-4 text-[13.5px] font-semibold text-on-accent">Browse packages</Link>
          </div>
        ) : <>
          <StudentLiveHero live={live} next={d.upcoming[0]} attendance={d.attendance} week={week} now={now} onAddToCalendar={c => downloadIcs([c as Cls], 'live-class.ics')} />

          <section className="grid grid-cols-7 gap-1.5 sm:gap-2" aria-label="This week">
            {week.map(w => (
              <div key={w.day.toISOString()} className={clsx('min-h-[82px] rounded-lg border bg-white p-1.5 text-center sm:p-2.5', w.today ? 'border-azure' : 'border-line')}>
                <p className="text-[11px] font-semibold uppercase text-muted">{w.day.toLocaleDateString('en-GB', { weekday: 'short' })}</p>
                <p className="mb-1.5 mt-0.5 text-lg font-extrabold text-navy">{w.day.getDate()}</p>
                {w.items.map(c => (
                  <p key={c.id} title={`${time(c.scheduledAt)} ${c.title}`} className="mb-1 truncate rounded bg-accent-soft px-1.5 py-1 text-left text-[11px] font-semibold text-navy">
                    {time(c.scheduledAt)} <span className="hidden sm:inline">{c.cohort.name.split(/[·—-]/)[0].trim()}</span>
                  </p>
                ))}
              </div>
            ))}
          </section>

          <div className="flex flex-wrap items-start gap-5">
            <section className="min-w-0 flex-[999_1_520px] rounded-lg border border-line bg-white">
              <div role="tablist" aria-label="Classes" className="flex gap-1 border-b border-line px-4">
                {([['up', 'Coming up', d.live.length + d.upcoming.length], ['past', 'Past and recordings', d.past.length]] as ['up' | 'past', string, number][]).map(([k, l, n]) => (
                  <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                    className={clsx('-mb-px h-[46px] border-b-2 px-3 text-[13.5px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent font-medium')}>
                    {l} <span className="font-medium text-muted">{n}</span>
                  </button>
                ))}
              </div>
              {!groups.length && <p className="px-[18px] py-8 text-center text-[13px] text-ink2">{tab === 'up' ? 'Nothing scheduled yet. Your teacher will add classes here.' : 'No classes held yet.'}</p>}
              {groups.map(g => (
                <div key={g.key}>
                  <p className="px-[18px] pb-1.5 pt-3.5 text-xs font-semibold uppercase tracking-[0.06em] text-muted">{g.title}</p>
                  {g.items.map(c => {
                    const isLive = c.status === 'ACTIVE';
                    const opensSoon = !isLive && +new Date(c.scheduledAt) - now <= 10 * 60_000;
                    return (
                      <div key={c.id} className="flex flex-wrap items-center gap-3.5 border-t border-line px-[18px] py-3">
                        <div className="w-16 flex-shrink-0 text-center">
                          <p className="text-[15px] font-extrabold text-navy">{time(c.scheduledAt)}</p>
                          <p className="text-[11.5px] text-muted">{c.durationMins} min</p>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-navy">{c.title}</p>
                          <p className="mt-0.5 truncate text-[12.5px] text-muted">{c.cohort.name} · {c.teacher}</p>
                        </div>
                        {tab === 'up' ? <>
                          <span className={badge(isLive)}>{isLive ? 'Live now' : inDays(c.scheduledAt)}</span>
                          {isLive || opensSoon
                            ? <Link href={`/student/live/${c.id}`} className={btn(true)}>Join class</Link>
                            : <button type="button" onClick={() => downloadIcs([c], 'live-class.ics')} className={btn(false)}>Add to calendar</button>}
                        </> : <>
                          <span className={badge(!!c.attended)}>{c.attended ? 'Attended' : c.beforeJoined ? 'Before you joined' : 'Missed'}</span>
                          {c.recordingUrl
                            ? <Link href={`/student/recordings/${c.id}`} className={btn(!c.attended && !c.beforeJoined)}>Watch recording</Link>
                            : <span className="inline-flex h-8 items-center px-1 text-[12.5px] text-muted">Recording coming</span>}
                        </>}
                      </div>
                    );
                  })}
                </div>
              ))}
            </section>

            <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
              <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-white p-[18px]">
                <h3 className="text-[15px] font-semibold text-navy">Your attendance</h3>
                <p className="text-[28px] font-extrabold text-navy">{pct != null ? `${pct}%` : '—'} <span className="text-[13px] font-medium text-muted">{a?.held ? `${a.attended} of ${a.held} classes` : 'No classes held since you joined'}</span></p>
                <span className="block h-1.5 overflow-hidden rounded-[3px] bg-subtle"><span className="block h-1.5 bg-azure" style={{ width: `${pct ?? 0}%` }} /></span>
                <p className="text-[12.5px] text-muted">{a?.cohortAvgPct != null ? `Cohort average ${a.cohortAvgPct}% · ` : ''}counts towards your progress report</p>
              </section>
              {d.catchUp.length > 0 && (
                <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-white p-[18px]">
                  <h3 className="text-[15px] font-semibold text-navy">Catch up</h3>
                  <p className="text-[12.5px] text-muted">Recordings of classes you missed</p>
                  {d.catchUp.map(c => (
                    <div key={c.id} className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-semibold text-navy">{c.title}</p>
                        <p className="mt-0.5 text-xs text-muted">{new Date(c.scheduledAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {c.durationMins} min</p>
                      </div>
                      <Link href={`/student/recordings/${c.id}`} className="inline-flex h-[30px] items-center rounded-md border border-line px-2.5 text-[12.5px] font-semibold text-navy hover:bg-subtle">Watch</Link>
                    </div>
                  ))}
                </section>
              )}
              <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-[18px]">
                <h3 className="text-[15px] font-semibold text-navy">Before a class</h3>
                <ul className="list-disc space-y-1.5 pl-[18px] text-[13px] text-ink2">
                  <li>The Join button opens 10 minutes before the start.</li>
                  <li>On a weak connection, turn your camera off; audio uses far less data.</li>
                  <li>Use earphones so the class doesn’t echo.</li>
                </ul>
              </section>
            </aside>
          </div>
        </>}
      </div>
    </div>
  );
}
