'use client';
import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { PageHero, heroBtnDark, heroBtnLine, asideLabel } from '@/components/hero/PageHero';
import { AreaTag, dayLabel, EntryDetails, placeText, time, Who, type Entry } from '@/components/activity/Activity';
import { Flag as CountryFlag } from '@/components/ui/Flag';
import { downloadFromApi } from '@/lib/download';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Summary {
  week: number; all: number; since: string | null; people: number; areas: Record<string, number>;
  unnamed: { count: number; from: string | null; to: string | null }; failedSignIns: number; adminsWithoutApp: { id: string; name: string }[];
}
interface Person { id: string; name: string; role: string | null; n: number }
interface Filters { q: string; actorId: string; area: string; from: string; to: string; unnamed: string; person: string; targetType: string; targetId: string }
const BLANK: Filters = { q: '', actorId: '', area: '', from: '', to: '', unnamed: '', person: '', targetType: '', targetId: '' };
const AREAS = ['People', 'Courses', 'Money', 'Selling', 'Sign-in', 'Settings'];
const sel = 'h-9 rounded-md border border-line bg-white px-2.5 text-[13px] text-navy outline-none focus:border-azure';
const short = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

/** Admin → Platform → Activity log: who changed what, when and from where. Read-only. */
export default function ActivityLogPage() {
  const [s, setS] = useState<Summary | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [f, setF] = useState<Filters>(BLANK);
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [total, setTotal] = useState(0);
  const [next, setNext] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  useEffect(() => {
    // Links from a drawer's History: ?person= or ?targetType=&targetId=
    const p = new URLSearchParams(window.location.search);
    setF(x => ({ ...x, person: p.get('person') ?? '', targetType: p.get('targetType') ?? '', targetId: p.get('targetId') ?? '' }));
    api.get('/admin/activity/summary').then(r => setS(r.data)).catch(() => {});
    api.get('/admin/activity/people').then(r => setPeople(r.data)).catch(() => {});
  }, []);
  // Search as you type, a moment after the last key
  useEffect(() => { const t = setTimeout(() => setF(x => (x.q === q ? x : { ...x, q })), 350); return () => clearTimeout(t); }, [q]);

  const params = useCallback((cursor?: string) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
    if (cursor) p.set('cursor', cursor);
    return p.toString();
  }, [f]);

  useEffect(() => {
    setRows(null); setOpen(null);
    api.get(`/admin/activity?${params()}`).then(r => { setRows(r.data.entries); setTotal(r.data.total); setNext(r.data.next); })
      .catch(() => { setRows([]); notify.error('Could not load the activity log'); });
  }, [params]);

  async function loadMore() {
    if (!next) return;
    setMore(true);
    try { const r = await api.get(`/admin/activity?${params(next)}`); setRows(x => [...(x ?? []), ...r.data.entries]); setNext(r.data.next); }
    finally { setMore(false); }
  }
  const set = (k: keyof Filters, v: string) => setF(x => ({ ...x, [k]: v }));
  const filtered = Object.entries(f).some(([, v]) => v);
  const exportCsv = () => downloadFromApi(`/admin/activity/export.csv?${params()}`, 'careerpath-activity-log.csv').catch(() => notify.error('Could not export'));

  const days: { day: string; items: Entry[] }[] = [];
  for (const e of rows ?? []) {
    const d = dayLabel(e.at);
    if (days[days.length - 1]?.day !== d) days.push({ day: d, items: [] });
    days[days.length - 1].items.push(e);
  }
  const top = s ? Object.entries(s.areas).filter(([, n]) => n).sort((a, b) => b[1] - a[1]) : [];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Activity log" subtitle="Every change on the platform: who made it, what it was, when and from where"
        actions={<button onClick={exportCsv} className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Export CSV</button>} />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-6">
        {!s ? <div className="h-56 animate-pulse rounded-[14px] bg-[#3F6FE8]/30" /> : (
          <PageHero
            kicker={`Activity log · ${s.all.toLocaleString()} entries${s.since ? ` since ${short(s.since)}` : ''} · ${s.people} ${s.people === 1 ? 'person' : 'people'} this week`}
            l1={`${s.week.toLocaleString()} change${s.week === 1 ? '' : 's'} this week,`}
            l2={s.unnamed.count ? `${s.unnamed.count} with no name.` : 'every one named.'}
            sub={s.unnamed.count
              ? `${s.unnamed.count} tutor approvals${s.unnamed.from ? ` (${short(s.unnamed.from)}${s.unnamed.to && short(s.unnamed.to) !== short(s.unnamed.from) ? `–${short(s.unnamed.to)}` : ''})` : ''} were saved without the admin who made them. Every change since carries a name, the device and the IP address.`
              : 'Every change carries a name, the device and the IP address. Nobody can edit or delete an entry.'}
            chips={top.slice(0, 4).map(([a, n], i) => ({ t: `${n} ${a.toLowerCase()}`, strong: i === 0 }))}
            actions={<>
              {s.unnamed.count > 0 && <button onClick={() => { setF({ ...BLANK, unnamed: '1' }); setQ(''); }} className={heroBtnDark}>Show the {s.unnamed.count}</button>}
              <button onClick={() => { setF({ ...BLANK, area: 'Sign-in' }); setQ(''); }} className={heroBtnLine}>Sign-ins</button>
            </>}
            aside={<>
              <p className={asideLabel}>Worth a look</p>
              {s.unnamed.count > 0 && <Flag tone="warn" title={`${s.unnamed.count} approvals with no admin`} sub="Saved before names were added" />}
              {s.adminsWithoutApp.map(a => <Flag key={a.id} tone="bad" title={`${a.name} has no authenticator app`} sub={Date.now() > Date.UTC(2026, 10, 21) ? "Required now: admin pages are closed to them" : "Required from Sat 21 Nov"} />)}
              {s.failedSignIns ? <Flag tone="bad" title={`${s.failedSignIns} failed admin sign-in${s.failedSignIns === 1 ? '' : 's'}`} sub="Wrong password or code, last 7 days" />
                : <Flag tone="ok" title="No failed admin sign-ins" sub="In the last 7 days" />}
            </>}
          />
        )}

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-white p-3">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search a name, course, action or IP…" aria-label="Search the activity log" className={clsx(sel, 'min-w-[220px] flex-1')} />
          <select aria-label="Person" value={f.actorId} onChange={e => set('actorId', e.target.value)} className={sel}>
            <option value="">Anyone</option>{people.map(p => <option key={p.id} value={p.id}>{p.name} ({p.n})</option>)}
          </select>
          <select aria-label="Area" value={f.area} onChange={e => set('area', e.target.value)} className={sel}>
            <option value="">All areas</option>{AREAS.map(a => <option key={a}>{a}</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-[13px] text-muted">From <input type="date" value={f.from} onChange={e => set('from', e.target.value)} className={sel} /></label>
          <label className="flex items-center gap-1.5 text-[13px] text-muted">to <input type="date" value={f.to} onChange={e => set('to', e.target.value)} className={sel} /></label>
          {filtered && <button onClick={() => { setF(BLANK); setQ(''); history.replaceState(null, '', location.pathname); }} className="h-9 rounded-md px-2.5 text-[13px] font-semibold text-azure-strong hover:underline">Clear</button>}
        </div>
        {s && (
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Areas this week">
            {AREAS.map(a => (
              <button key={a} onClick={() => set('area', f.area === a ? '' : a)} aria-pressed={f.area === a}
                className={clsx('rounded-md ring-offset-1', f.area === a && 'ring-2 ring-[#3F6FE8]')}><AreaTag area={`${a}`} /><span className="sr-only">{a}</span></button>
            ))}
            <span className="ml-1 self-center text-xs text-muted">{AREAS.map(a => `${a} ${s.areas[a] ?? 0}`).join(' · ')} this week</span>
          </div>
        )}
        {(f.person || f.targetId || f.unnamed) && (
          <p className="text-[13px] text-ink2">{f.unnamed ? 'Showing changes saved without a name.' : f.person ? 'Showing what this person did, and what was done to their account.' : 'Showing changes to one item.'}</p>
        )}

        <div className="overflow-hidden rounded-lg border border-line bg-white">
          {!rows ? <div className="m-4 h-40 animate-pulse rounded-md bg-subtle" />
            : !rows.length ? <p className="px-4 py-10 text-center text-[13.5px] text-muted">{filtered ? 'Nothing matches these filters.' : 'No changes yet.'}</p>
            : days.map((d, di) => (
              <div key={d.day}>
                <p className={clsx('bg-[#FAFBFE] px-4 py-2 text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-muted', di > 0 && 'border-t border-line')}>{d.day}</p>
                {d.items.map(e => (
                  <div key={e.id} className={clsx('border-t border-[#EEF1F7]', !e.actor && /^teacher\./.test(e.action) && 'bg-[#FFF8E8]', open === e.id && 'bg-[#F7F9FF]')}>
                    <button type="button" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}
                      className="grid w-full grid-cols-[minmax(0,1fr)] gap-x-4 gap-y-1.5 px-4 py-3 text-left md:grid-cols-[48px_200px_minmax(0,1fr)_92px_190px] md:items-center">
                      <span className="text-[12.5px] tabular-nums text-muted md:order-none">{time(e.at)}</span>
                      <Who e={e} />
                      <span className="text-[13.5px] leading-snug text-navy">{e.summary}</span>
                      <span><AreaTag area={e.area} /></span>
                      <span className="text-[11.5px] leading-tight text-muted">
                        {e.place && <span className="block font-semibold text-navy">{placeText(e.place)} <CountryFlag code={e.place.code} title={e.place.country} />{e.newCountry && <span className="ml-1 rounded bg-[#FFF1D6] px-1 text-[10px] font-extrabold text-[#8A5A00]">New country</span>}</span>}
                        {e.device ?? (e.place ? null : '—')}{e.ip ? <> · {e.ip}</> : null}
                      </span>
                    </button>
                    {open === e.id && <div className="px-4 pb-4 md:pl-[268px]"><EntryDetails e={e} /></div>}
                  </div>
                ))}
              </div>
            ))}
        </div>
        {rows && rows.length > 0 && (
          <div className="flex items-center justify-between gap-3 text-[12.5px] text-muted">
            <span>Showing {rows.length.toLocaleString()} of {total.toLocaleString()} · newest first · kept for 2 years · read-only</span>
            {next && <button onClick={loadMore} disabled={more} className="h-9 rounded-md border border-line bg-white px-3.5 text-[13px] font-semibold text-navy hover:bg-subtle disabled:opacity-50">{more ? 'Loading…' : 'Show more'}</button>}
          </div>
        )}
      </div>
    </div>
  );
}

function Flag({ tone, title, sub }: { tone: 'ok' | 'warn' | 'bad'; title: string; sub: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className={clsx('grid h-[22px] w-[22px] flex-shrink-0 place-items-center rounded-md text-[12px] font-extrabold',
        tone === 'ok' ? 'bg-[#E3F5EA] text-[#17703A]' : tone === 'warn' ? 'bg-[#FFF1D6] text-[#8A5A00]' : 'bg-[#FDF1F0] text-[#C1352B]')}>{tone === 'ok' ? '✓' : '!'}</span>
      <span className="min-w-0"><span className="block text-[13px] font-bold leading-snug text-navy">{title}</span><span className="block text-[11.5px] text-muted">{sub}</span></span>
    </div>
  );
}
