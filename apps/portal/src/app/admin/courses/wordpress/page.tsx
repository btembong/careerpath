'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { QuickAdd, TagPickers, useTaxonomy, type TaxOptions } from '@/components/admin/taxonomy';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Tags = { programmeId: string | null; subjectId: string | null; levelId: string | null };
interface NewItem { wpId: number; title: string; status: string; link: string; categories: string[]; authorEmail: string | null; suggestion: Tags & { from: string | null }; teacher: { id: string; name: string } | null; ticked: boolean; note: string | null }
interface ChangedItem { courseId: string; wpId: number; title: string; changes: { field: string; kind: string; from: string | null; to: string | null }[]; ticked: boolean }
interface GoneItem { courseId: string; wpId: number; title: string; reason: string; enrolled: number; suggested: 'hide' | 'archive' }
interface Preview { checkedAt: string; site: string | null; counts: { new: number; changed: number; same: number; gone: number }; new: NewItem[]; changed: ChangedItem[]; gone: GoneItem[]; sameTitles: string[]; unmappedCategories: number; settings: Settings }
interface Settings { newStatus: 'DRAFT' | 'PUBLISHED'; nightly: boolean }
interface Pull { id: string; at: string; kind: string; by: string; created: number; updated: number; hidden: number; archived: number; found: { new: number; changed: number; gone: number } | null }
type Group = 'new' | 'changed' | 'same' | 'gone';

function when(iso: string) {
  const d = new Date(iso), now = new Date();
  if (d.toDateString() === now.toDateString()) return `Today ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function WordPressPullPage() {
  const [tab, setTab] = useState<'review' | 'map'>('review');
  const { opts, reload } = useTaxonomy();
  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Pull from WordPress" subtitle="See what changed on careerpathafrica.com, then bring in what you want" backHref="/admin/courses/manage" backLabel="Course management"
        actions={
          <div role="tablist" className="flex gap-1 rounded-lg border border-line bg-white p-1 text-[13px]">
            {([['review', 'Review'], ['map', 'Category mapping']] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={clsx('rounded-md px-3 py-1.5 text-navy', tab === k ? 'bg-accent-soft font-semibold' : 'font-medium hover:bg-subtle')}>{l}</button>
            ))}
          </div>
        } />
      {!opts ? <div className="m-4 h-96 rounded-lg bg-subtle animate-pulse lg:mx-7" /> : tab === 'review' ? <Review opts={opts} reload={reload} onMap={() => setTab('map')} /> : <Mapping opts={opts} />}
    </div>
  );
}

function Review({ opts, reload, onMap }: { opts: TaxOptions; reload: () => void; onMap: () => void }) {
  const [p, setP] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [group, setGroup] = useState<Group>('new');
  const [newSel, setNewSel] = useState<Record<number, { on: boolean; tags: Tags; teacherId: string | null }>>({});
  const [changedSel, setChangedSel] = useState<Record<number, boolean>>({});
  const [goneSel, setGoneSel] = useState<Record<string, 'keep' | 'hide' | 'archive'>>({});
  const [history, setHistory] = useState<Pull[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [applying, setApplying] = useState(false);
  const [adding, setAdding] = useState<{ kind: 'programme' | 'subject'; programmeId: string | null; wpId: number } | null>(null);

  const check = useCallback(async (fresh = true) => {
    setChecking(true); setError(null);
    try {
      const r = await api.get('/admin/wp-pull/preview', { params: { fresh: fresh ? '1' : '0' } });
      const d: Preview = r.data;
      setP(d); setSettings(d.settings);
      setNewSel(Object.fromEntries(d.new.map(n => [n.wpId, { on: n.ticked, tags: { programmeId: n.suggestion.programmeId, subjectId: n.suggestion.subjectId, levelId: n.suggestion.levelId }, teacherId: n.teacher?.id ?? null }])));
      setChangedSel(Object.fromEntries(d.changed.map(c => [c.wpId, c.ticked])));
      setGoneSel(Object.fromEntries(d.gone.map(g => [g.courseId, g.suggested])));
      setGroup(d.counts.new ? 'new' : d.counts.changed ? 'changed' : d.counts.gone ? 'gone' : 'same');
    } catch (e: any) { setError(e?.response?.data?.message ?? 'Could not check WordPress'); } finally { setChecking(false); }
  }, []);
  const loadHistory = useCallback(() => api.get('/admin/wp-pull/history').then(r => setHistory(r.data)).catch(() => {}), []);
  useEffect(() => { check(); loadHistory(); }, [check, loadHistory]);

  async function saveSettings(patch: Partial<Settings>) {
    try { const r = await api.patch('/admin/wp-pull/settings', patch); setSettings(r.data); notify.success('Saved'); } catch { notify.error('Could not save'); }
  }

  const ticked = useMemo(() => ({
    new: Object.values(newSel).filter(x => x.on).length,
    changed: Object.values(changedSel).filter(Boolean).length,
    gone: Object.values(goneSel).filter(a => a !== 'keep').length,
  }), [newSel, changedSel, goneSel]);
  const totalTicked = ticked.new + ticked.changed + ticked.gone;

  async function apply(everything = false) {
    if (!p) return;
    const body = {
      new: p.new.filter(n => everything ? n.ticked : newSel[n.wpId]?.on).map(n => {
        const s = everything ? { tags: { programmeId: n.suggestion.programmeId, subjectId: n.suggestion.subjectId, levelId: n.suggestion.levelId }, teacherId: n.teacher?.id ?? null } : newSel[n.wpId];
        return { wpId: n.wpId, ...s.tags, teacherId: s.teacherId };
      }),
      changed: p.changed.filter(c => everything || changedSel[c.wpId]).map(c => c.wpId),
      gone: p.gone.map(g => ({ courseId: g.courseId, action: everything ? g.suggested : goneSel[g.courseId] })).filter(g => g.action !== 'keep'),
    };
    setApplying(true);
    try {
      const r = await api.post('/admin/wp-pull/apply', body);
      const x = r.data;
      notify.success('Brought in', { description: [x.created && `${x.created} new`, x.updated && `${x.updated} updated`, x.hidden && `${x.hidden} hidden`, x.archived && `${x.archived} archived`].filter(Boolean).join(' · ') || 'Nothing to change' });
      await Promise.all([check(true), loadHistory()]);
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not bring them in'); } finally { setApplying(false); }
  }

  if (checking && !p) return (
    <div className="p-4 lg:px-7 lg:py-6"><div className="rounded-lg border border-line bg-white px-6 py-14 text-center"><p className="text-[15px] font-semibold text-navy">Checking WordPress…</p><p className="mt-1 text-[13px] text-ink2">Reading every course, category and author. This can take half a minute.</p><div className="mx-auto mt-4 h-1.5 w-48 overflow-hidden rounded-full bg-subtle"><div className="h-1.5 w-1/3 animate-pulse rounded-full bg-azure" /></div></div></div>
  );
  if (error && !p) return (
    <div className="p-4 lg:px-7 lg:py-6"><div className="rounded-lg border border-line bg-white px-6 py-12 text-center"><p className="text-[15px] font-semibold text-navy">{error}</p><Button size="sm" className="mt-3" onClick={() => check()}>Try again</Button></div></div>
  );
  if (!p) return null;

  const tiles: [Group, string, number, string][] = [
    ['new', 'New', p.counts.new, 'not on the portal yet'], ['changed', 'Changed', p.counts.changed, 'since the last pull'],
    ['same', 'Same', p.counts.same, 'nothing to do'], ['gone', 'Gone', p.counts.gone, 'removed on WordPress'],
  ];

  return (
    <div className="flex flex-wrap items-start gap-5 p-4 lg:px-7 lg:py-[22px]">
      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-muted">
          <span>{p.site?.replace(/^https?:\/\//, '') ?? 'WordPress'} · checked {when(p.checkedAt)}</span>
          <button onClick={() => check()} disabled={checking} className="font-semibold text-azure-strong hover:underline disabled:opacity-50">{checking ? 'Checking…' : 'Check again'}</button>
          {p.unmappedCategories > 0 && <span className="ml-auto">{p.unmappedCategories} WordPress categories aren’t mapped yet — <button onClick={onMap} className="font-semibold text-azure-strong hover:underline">map them</button> for better suggestions</span>}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {tiles.map(([k, l, v, sub]) => (
            <button key={k} onClick={() => setGroup(k)} aria-pressed={group === k}
              className={clsx('flex flex-col gap-0.5 rounded-lg border bg-white px-3.5 py-3 text-left', group === k ? 'border-azure-strong shadow-[inset_0_0_0_1px_var(--color-azure-strong,#3F6FE8)]' : 'border-line hover:border-azure')}>
              <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{l}</span>
              <span className="text-[22px] font-extrabold text-navy">{v}</span>
              <span className="text-xs text-muted">{sub}</span>
            </button>
          ))}
        </div>

        <section className="rounded-lg border border-line bg-white">
          {group === 'new' && <>
            <ListHead title={`${p.counts.new} new course${p.counts.new === 1 ? '' : 's'} on WordPress`} all={p.new.length > 0 && p.new.every(n => newSel[n.wpId]?.on)}
              onAll={on => setNewSel(s => Object.fromEntries(Object.entries(s).map(([k, v]) => [k, { ...v, on }])))} />
            {!p.new.length ? <Empty text="No new courses." /> : p.new.map(n => {
              const s = newSel[n.wpId];
              return (
                <div key={n.wpId} className="flex gap-3 border-t border-line px-4 py-3.5">
                  <input type="checkbox" className="mt-1" aria-label={`Bring in ${n.title}`} checked={!!s?.on} onChange={e => setNewSel(x => ({ ...x, [n.wpId]: { ...x[n.wpId], on: e.target.checked } }))} />
                  <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                    <p className="flex flex-wrap items-baseline gap-x-2"><a href={n.link} target="_blank" rel="noreferrer" className="text-sm font-semibold text-navy hover:underline">{n.title}</a>
                      <span className="text-xs text-muted">{[n.categories.length ? `WordPress category: ${n.categories.join(', ')}` : 'No WordPress category', n.authorEmail && `author: ${n.authorEmail}`].filter(Boolean).join(' · ')}</span></p>
                    {n.note && <p className="text-xs font-semibold text-ink2">Left unticked: {n.note}</p>}
                    {s && <div className="flex flex-wrap items-center gap-2">
                      <TagPickers compact opts={opts} value={s.tags} onChange={tags => setNewSel(x => ({ ...x, [n.wpId]: { ...x[n.wpId], tags } }))} />
                      <select aria-label="Teacher" className="h-[38px] rounded-md border border-line bg-white px-2.5 text-[13px] text-navy" value={s.teacherId ?? ''} onChange={e => setNewSel(x => ({ ...x, [n.wpId]: { ...x[n.wpId], teacherId: e.target.value || null } }))}>
                        <option value="">CareerPath (no teacher yet)</option>{opts.teachers.map(t => <option key={t.id} value={t.id}>{t.name}{n.teacher?.id === t.id ? ' (matched by email)' : ''}</option>)}
                      </select>
                      <button onClick={() => setAdding({ kind: 'subject', programmeId: s.tags.programmeId, wpId: n.wpId })} className="text-[12.5px] font-semibold text-azure-strong hover:underline">+ Subject</button>
                    </div>}
                  </div>
                  <span className="h-6 self-start whitespace-nowrap rounded bg-accent-soft px-2 text-xs font-semibold leading-6 text-navy">{n.status === 'publish' ? 'New' : n.status}</span>
                </div>
              );
            })}
          </>}

          {group === 'changed' && <>
            <ListHead title={`${p.counts.changed} course${p.counts.changed === 1 ? '' : 's'} changed on WordPress`} all={p.changed.length > 0 && p.changed.every(c => changedSel[c.wpId])}
              onAll={on => setChangedSel(Object.fromEntries(p.changed.map(c => [c.wpId, on])))} />
            {!p.changed.length ? <Empty text="Nothing changed." /> : p.changed.map(c => (
              <div key={c.wpId} className="flex gap-3 border-t border-line px-4 py-3.5">
                <input type="checkbox" className="mt-1" aria-label={`Update ${c.title}`} checked={!!changedSel[c.wpId]} onChange={e => setChangedSel(x => ({ ...x, [c.wpId]: e.target.checked }))} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p className="text-sm font-semibold text-navy">{c.title}</p>
                  {c.changes.map((ch, i) => (
                    <p key={i} className="text-[12.5px] text-ink2">
                      {ch.field === 'title' ? (ch.kind === 'cleaned' ? <>Title cleaned: <span className="line-through">{ch.from}</span> → <strong className="text-navy">{ch.to}</strong></> : <>Renamed: <span className="line-through">{ch.from}</span> → <strong className="text-navy">{ch.to}</strong></>)
                        : <>Description rewritten on WordPress{ch.to ? `: “${ch.to.slice(0, 120)}${ch.to.length > 120 ? '…' : ''}”` : ' (now empty)'}</>}
                    </p>
                  ))}
                  <p className="text-xs text-muted">Only the text updates — tags, prices, teacher and status stay as they are on the portal.</p>
                </div>
                <span className="h-6 self-start rounded border border-line bg-subtle px-2 text-xs font-semibold leading-6 text-ink2">Changed</span>
              </div>
            ))}
          </>}

          {group === 'same' && <>
            <div className="border-b border-line px-4 py-3 text-sm font-semibold text-navy">{p.counts.same} course{p.counts.same === 1 ? '' : 's'} are the same</div>
            {p.sameTitles.map(t => <p key={t} className="border-t border-line px-4 py-2.5 text-[13px] text-ink2 first:border-t-0">{t}</p>)}
            {p.counts.same > p.sameTitles.length && <p className="border-t border-line px-4 py-2.5 text-xs text-muted">…and {p.counts.same - p.sameTitles.length} more</p>}
          </>}

          {group === 'gone' && <>
            <div className="border-b border-line px-4 py-3 text-sm font-semibold text-navy">{p.counts.gone} course{p.counts.gone === 1 ? ' is' : 's are'} gone from WordPress</div>
            {!p.gone.length ? <Empty text="Nothing has been removed." /> : p.gone.map(g => (
              <div key={g.courseId} className="flex flex-wrap gap-3 border-t border-line px-4 py-3.5 first-of-type:border-t-0">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-navy">{g.title}</p>
                  <p className="text-xs text-muted">{g.reason} · {g.enrolled ? `${g.enrolled} student${g.enrolled === 1 ? '' : 's'} still have it` : 'no students'}</p>
                </div>
                <div role="radiogroup" aria-label={`What to do with ${g.title}`} className="flex gap-1.5 self-center text-[12.5px]">
                  {([['keep', 'Keep'], ['hide', 'Hide from catalogue'], ['archive', 'Archive']] as const).map(([k, l]) => (
                    <button key={k} role="radio" aria-checked={goneSel[g.courseId] === k} onClick={() => setGoneSel(x => ({ ...x, [g.courseId]: k }))}
                      className={clsx('h-7 rounded-md px-2.5', goneSel[g.courseId] === k ? 'border border-azure bg-accent-soft font-semibold text-navy' : 'border border-line text-ink2 hover:text-navy')}>{l}</button>
                  ))}
                </div>
              </div>
            ))}
          </>}
        </section>

        <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-line bg-white px-[18px] py-3.5">
          <span className="min-w-0 flex-1 text-[13px] text-ink2">
            {totalTicked ? <>{[ticked.new && `${ticked.new} new`, ticked.changed && `${ticked.changed} changed`, ticked.gone && `${ticked.gone} gone`].filter(Boolean).join(' · ')} ticked{ticked.new ? <> · new courses arrive as <strong className="text-navy">{settings?.newStatus === 'PUBLISHED' ? 'live' : 'drafts'}</strong></> : ''}</> : 'Nothing ticked'}
          </span>
          <Button variant="secondary" onClick={() => apply(true)} loading={applying} disabled={!(p.counts.new + p.counts.changed + p.counts.gone)}>Bring in everything as suggested</Button>
          <Button onClick={() => apply(false)} loading={applying} disabled={!totalTicked}>Bring in {totalTicked} change{totalTicked === 1 ? '' : 's'}</Button>
        </div>
      </div>

      <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-3.5">
        <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-white p-4">
          <h3 className="text-[15px] font-semibold text-navy">How courses come in</h3>
          {settings && <>
            <label className="flex items-center justify-between gap-2 text-[13px]"><span className="text-ink2">New courses</span>
              <select className="rounded border border-line px-1.5 py-1 font-semibold text-navy" value={settings.newStatus} onChange={e => saveSettings({ newStatus: e.target.value as Settings['newStatus'] })}>
                <option value="DRAFT">Draft until you publish</option><option value="PUBLISHED">Live straight away</option>
              </select>
            </label>
            <p className="flex justify-between gap-2 text-[13px]"><span className="text-ink2">Course owner</span><strong className="text-right text-navy">WordPress author if they’re a portal teacher</strong></p>
            <p className="flex justify-between gap-2 text-[13px]"><span className="text-ink2">Tags</span><button onClick={onMap} className="text-right font-semibold text-azure-strong hover:underline">From category mapping</button></p>
            <label className="flex items-center justify-between gap-2 text-[13px]"><span className="text-ink2">Check every night at 02:00</span>
              <input type="checkbox" checked={settings.nightly} onChange={e => saveSettings({ nightly: e.target.checked })} />
            </label>
            <p className="text-xs text-muted">The nightly check only looks — admins get a notification when there’s something to bring in.</p>
          </>}
        </section>
        <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-4">
          <h3 className="text-[15px] font-semibold text-navy">Earlier pulls</h3>
          {!history.length ? <p className="text-[13px] text-muted">None yet.</p> : history.map(h => (
            <p key={h.id} className="flex justify-between gap-2 text-[13px]">
              <span>{when(h.at)} · <span className="text-muted">{h.by}</span></span>
              <span className="text-right text-ink2">{h.kind === 'NIGHTLY' ? (h.found ? `found ${h.found.new} new, ${h.found.changed} changed, ${h.found.gone} gone` : 'checked') : [h.created && `+${h.created} new`, h.updated && `${h.updated} updated`, h.hidden && `${h.hidden} hidden`, h.archived && `${h.archived} archived`].filter(Boolean).join(', ') || 'nothing changed'}</span>
            </p>
          ))}
          <Link href="/admin/courses/manage" className="mt-1 text-[13px] font-semibold text-azure-strong hover:underline">Tag courses in Course management</Link>
        </section>
      </aside>
      {adding && <QuickAdd kind={adding.kind} opts={opts} programmeId={adding.programmeId} onClose={() => setAdding(null)}
        onAdded={id => { reload(); setNewSel(x => ({ ...x, [adding.wpId]: { ...x[adding.wpId], tags: { ...x[adding.wpId].tags, [adding.kind === 'programme' ? 'programmeId' : 'subjectId']: id } } })); setAdding(null); }} />}
    </div>
  );
}

function ListHead({ title, all, onAll }: { title: string; all: boolean; onAll: (on: boolean) => void }) {
  return (
    <div className="flex items-center gap-2.5 border-b border-line px-4 py-3">
      <input type="checkbox" aria-label="Tick all" checked={all} onChange={e => onAll(e.target.checked)} />
      <strong className="text-sm text-navy">{title}</strong><span className="flex-1" /><span className="text-[12.5px] text-muted">Tick what to bring in</span>
    </div>
  );
}
const Empty = ({ text }: { text: string }) => <p className="px-4 py-8 text-center text-[13px] text-ink2">{text}</p>;

interface MapRow { wpTermId: number; name: string; path: string; courseCount: number; programme: { id: string } | null; subject: { id: string } | null; level: { id: string } | null; ignored: boolean; setBy: string; mapped: boolean }

function Mapping({ opts }: { opts: TaxOptions }) {
  const [rows, setRows] = useState<MapRow[] | null>(null);
  const [q, setQ] = useState('');
  const [onlyUnmapped, setOnlyUnmapped] = useState(true);
  const load = useCallback((refresh = false) => api.get('/admin/wp-pull/categories', { params: { refresh: refresh ? '1' : undefined } }).then(r => setRows(r.data)).catch(e => notify.error(e?.response?.data?.message ?? 'Could not load categories')), []);
  useEffect(() => { load(); }, [load]);

  async function save(r: MapRow, patch: Partial<{ programmeId: string | null; subjectId: string | null; levelId: string | null; ignored: boolean }>) {
    try {
      await api.put(`/admin/wp-pull/categories/${r.wpTermId}`, patch);
      setRows(prev => prev?.map(x => x.wpTermId !== r.wpTermId ? x : {
        ...x, setBy: 'ADMIN',
        ...(patch.programmeId !== undefined && { programme: patch.programmeId ? { id: patch.programmeId } : null }),
        ...(patch.subjectId !== undefined && { subject: patch.subjectId ? { id: patch.subjectId } : null }),
        ...(patch.levelId !== undefined && { level: patch.levelId ? { id: patch.levelId } : null }),
        ...(patch.ignored !== undefined && { ignored: patch.ignored }),
      }).map(x => ({ ...x, mapped: x.ignored || !!(x.programme || x.subject || x.level) })) ?? prev);
    } catch { notify.error('Could not save'); }
  }

  const unmapped = rows?.filter(r => !r.mapped).length ?? 0;
  const shown = (rows ?? []).filter(r => (!onlyUnmapped || !r.mapped) && (!q.trim() || r.path.toLowerCase().includes(q.trim().toLowerCase())));
  const sel = 'h-8 max-w-[190px] rounded-md border border-line bg-white px-1.5 text-[12.5px] text-navy';

  return (
    <div className="flex flex-col gap-3.5 p-4 lg:px-7 lg:py-[22px]">
      <section className="flex flex-wrap items-center gap-3.5 rounded-lg border border-azure bg-white px-[18px] py-3.5">
        <div className="min-w-0 flex-1"><p className="text-[15px] font-extrabold text-navy">Tell us what each WordPress category means</p>
          <p className="mt-0.5 text-[13px] text-ink2">Set it once — every pull uses it to suggest a programme, subject and level. Categories are matched by name to start with; changes save as you make them.</p></div>
        <Button size="sm" variant="secondary" onClick={() => load(true)}>Refresh from WordPress</Button>
      </section>
      <section className="rounded-lg border border-line bg-white">
        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3 text-[13px]">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search categories" aria-label="Search categories" className="h-[34px] min-w-[180px] flex-1 rounded-md border border-line px-2.5 outline-none focus:border-azure" />
          <button onClick={() => setOnlyUnmapped(true)} aria-pressed={onlyUnmapped} className={clsx('h-[34px] rounded-md px-2.5', onlyUnmapped ? 'border border-azure bg-accent-soft font-semibold text-navy' : 'border border-line text-navy')}>Not mapped {unmapped}</button>
          <button onClick={() => setOnlyUnmapped(false)} aria-pressed={!onlyUnmapped} className={clsx('h-[34px] rounded-md px-2.5', !onlyUnmapped ? 'border border-azure bg-accent-soft font-semibold text-navy' : 'border border-line text-navy')}>All {rows?.length ?? 0}</button>
        </div>
        {!rows ? <div className="m-4 h-48 rounded bg-subtle animate-pulse" /> : !shown.length ? <p className="px-4 py-10 text-center text-[13px] text-ink2">{onlyUnmapped ? 'Every category is mapped.' : 'No categories match.'}</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[880px] border-collapse text-[13px]">
              <thead><tr>{['WordPress category', 'Programme', 'Subject', 'Level', ''].map(h => <th key={h} className="border-b border-line px-3.5 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{h}</th>)}</tr></thead>
              <tbody>{shown.map(r => {
                const parts = r.path.split(' › ');
                return (
                  <tr key={r.wpTermId} className={clsx(r.ignored && 'opacity-60')}>
                    <td className="border-b border-line px-3.5 py-2.5"><span className="text-muted">{parts.slice(0, -1).map(x => x + ' › ').join('')}</span><strong className="text-navy">{parts.at(-1)}</strong><br /><span className="text-xs text-muted">{r.courseCount} course{r.courseCount === 1 ? '' : 's'}</span></td>
                    <td className="border-b border-line px-3.5 py-2.5"><select aria-label="Programme" className={sel} disabled={r.ignored} value={r.programme?.id ?? ''} onChange={e => save(r, { programmeId: e.target.value || null })}><option value="">—</option>{opts.programmes.map(p => <option key={p.id} value={p.id}>{p.shortName || p.name}</option>)}</select></td>
                    <td className="border-b border-line px-3.5 py-2.5"><select aria-label="Subject" className={sel} disabled={r.ignored} value={r.subject?.id ?? ''} onChange={e => save(r, { subjectId: e.target.value || null })}><option value="">—</option>{opts.subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                    <td className="border-b border-line px-3.5 py-2.5"><select aria-label="Level" className={sel} disabled={r.ignored} value={r.level?.id ?? ''} onChange={e => save(r, { levelId: e.target.value || null })}><option value="">—</option>{opts.levels.map(l => <option key={l.id} value={l.id}>{l.name} · {l.system.name}</option>)}</select></td>
                    <td className="border-b border-line px-3.5 py-2.5 text-xs text-muted">
                      <span className="mr-2">{r.ignored ? 'ignored' : r.setBy === 'ADMIN' ? 'set by you' : r.mapped ? 'matched by name' : 'not mapped'}</span>
                      <button onClick={() => save(r, { ignored: !r.ignored })} className="font-semibold text-azure-strong hover:underline">{r.ignored ? 'Use it' : 'Ignore'}</button>
                    </td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
