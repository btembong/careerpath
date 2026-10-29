'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Drawer, DrawerContent, DrawerSection, InfoGrid } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Kind = 'live' | 'upcoming' | 'held' | 'cancelled';
interface Row {
  id: string; title: string; scheduledAt: string; durationMins: number; status: string; recordingUrl: string | null;
  cohort: { id: string; name: string }; teacher: { id: string; name: string };
  rosterSize: number; attendedCount: number; inClass: number; kind: Kind; missingRecording: boolean;
}
interface Overview {
  stats: { liveNow: number; inClassNow: number; thisWeek: number; cohortsThisWeek: number; teachersThisWeek: number; attendancePct: number | null; missingRecordings: number };
  live: Row[]; classes: Row[];
}
type Tab = 'week' | 'held' | 'missing' | 'cancelled' | 'all';

const DAY = 86_400_000;
const time = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const when = (d: string) => {
  const days = Math.round((new Date(new Date(d).toDateString()).getTime() - new Date(new Date().toDateString()).getTime()) / DAY);
  return days === 0 ? `Today ${time(d)}` : days === 1 ? `Tomorrow ${time(d)}` : `${new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}${days > 0 ? ` ${time(d)}` : ''}`;
};
const STATUS: Record<Kind, string> = { live: 'Live', upcoming: 'Scheduled', held: 'Held', cancelled: 'Cancelled' };

export default function AdminLivePage() {
  const [d, setD] = useState<Overview | null>(null);
  const [tab, setTab] = useState<Tab>('week');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() { const r = await api.get('/live/admin/classes'); setD(r.data); }
  useEffect(() => {
    load().catch(() => notify.error('Could not load live classes'));
    const iv = setInterval(() => load().catch(() => {}), 60_000);
    return () => clearInterval(iv);
  }, []);

  const lists = useMemo(() => {
    const all = d?.classes ?? [];
    const weekEnd = Date.now() + 7 * DAY;
    return {
      week: all.filter(c => (c.kind === 'upcoming' || c.kind === 'live') && +new Date(c.scheduledAt) < weekEnd).reverse(),
      held: all.filter(c => c.kind === 'held'),
      missing: all.filter(c => c.missingRecording),
      cancelled: all.filter(c => c.kind === 'cancelled'),
      all,
    } as Record<Tab, Row[]>;
  }, [d]);
  const shown = lists[tab].filter(c => !q.trim() || `${c.title} ${c.cohort.name} ${c.teacher.name}`.toLowerCase().includes(q.trim().toLowerCase()));

  async function end(c: Row) {
    setBusy(c.id);
    try { await api.patch(`/live/classes/${c.id}/end`); notify.success('Class ended'); await load(); }
    catch (err: any) { notify.error(err?.response?.data?.message ?? 'Could not end the class'); }
    finally { setBusy(null); }
  }

  const s = d?.stats;
  const open = d?.classes.find(c => c.id === openId) ?? null;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Live classes" subtitle="Every class on the platform, what’s live now and how well they’re attended" />

      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <dl className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
          {[
            { l: 'Live now', v: s ? String(s.liveNow) : '…', sub: s ? (s.liveNow ? `${s.inClassNow} student${s.inClassNow === 1 ? '' : 's'} in class` : 'No class running') : '' },
            { l: 'This week', v: s ? `${s.thisWeek} class${s.thisWeek === 1 ? '' : 'es'}` : '…', sub: s ? `${s.cohortsThisWeek} cohort${s.cohortsThisWeek === 1 ? '' : 's'} · ${s.teachersThisWeek} teacher${s.teachersThisWeek === 1 ? '' : 's'}` : '' },
            { l: 'Attendance', v: s?.attendancePct != null ? `${s.attendancePct}%` : '—', sub: 'Last 4 weeks' },
            { l: 'Missing recordings', v: s ? String(s.missingRecordings) : '…', sub: 'Held more than 2 days ago' },
          ].map(x => (
            <div key={x.l} className="rounded-lg border border-line bg-white p-4">
              <dt className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-muted">{x.l}</dt>
              <dd className="mt-1.5 text-[22px] font-extrabold text-navy">{x.v}</dd>
              <dd className="mt-0.5 truncate text-[12.5px] text-muted">{x.sub}</dd>
            </div>
          ))}
        </dl>

        {d && d.live.length > 0 && (
          <section className="flex flex-col gap-2 rounded-lg border border-azure bg-white px-[18px] py-4">
            <h2 className="flex items-center gap-2 text-[15px] font-bold text-navy"><span className="h-2 w-2 animate-pulse rounded-full bg-azure-strong" /> Live now</h2>
            {d.live.map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-navy">{c.title}</p>
                  <p className="mt-0.5 truncate text-[12.5px] text-muted">{c.cohort.name} · {c.teacher.name} · started {time(c.scheduledAt)} · {c.inClass} of {c.rosterSize} in class</p>
                </div>
                <button type="button" onClick={() => setOpenId(c.id)} className="inline-flex h-8 items-center rounded-md border border-line px-3 text-[13px] font-semibold text-navy hover:bg-subtle">Details</button>
                <button type="button" disabled={busy === c.id} onClick={() => end(c)} className="inline-flex h-8 items-center rounded-md border border-line px-3 text-[13px] font-semibold text-navy hover:bg-subtle disabled:opacity-60">End class</button>
              </div>
            ))}
          </section>
        )}

        <section className="rounded-lg border border-line bg-white">
          <div className="flex flex-wrap items-center gap-2.5 border-b border-line px-4">
            <div role="tablist" aria-label="Classes" className="flex flex-1 gap-1 overflow-x-auto">
              {([['week', 'This week'], ['held', 'Held'], ['missing', 'Missing recording'], ['cancelled', 'Cancelled'], ['all', 'All']] as [Tab, string][]).map(([k, l]) => (
                <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                  className={clsx('-mb-px h-[46px] whitespace-nowrap border-b-2 px-3 text-[13.5px] text-navy', tab === k ? 'border-azure-strong font-semibold' : 'border-transparent font-medium')}>
                  {l} <span className="font-medium text-muted">{lists[k].length}</span>
                </button>
              ))}
            </div>
            <input type="search" aria-label="Search classes" value={q} onChange={e => setQ(e.target.value)} placeholder="Search by class, cohort or teacher" className="input-base my-2 h-[34px] w-64" />
          </div>
          {!d ? <div className="m-4 h-60 rounded-md bg-subtle animate-pulse" /> : !shown.length ? (
            <p className="px-4 py-10 text-center text-[13px] text-ink2">No classes here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[880px] border-collapse text-[13.5px]">
                <thead><tr>
                  {['Class', 'Cohort', 'Teacher', 'When', 'Attendance', 'Recording', 'Status'].map(h => (
                    <th key={h} className="border-b border-line px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{h}</th>
                  ))}
                </tr></thead>
                <tbody>
                  {shown.map(c => (
                    <tr key={c.id} onClick={() => setOpenId(c.id)} className="cursor-pointer hover:bg-subtle">
                      <td className="border-b border-line px-4 py-3 font-semibold text-navy">{c.title}</td>
                      <td className="border-b border-line px-4 py-3 text-ink2">{c.cohort.name}</td>
                      <td className="border-b border-line px-4 py-3 text-navy">{c.teacher.name}</td>
                      <td className="border-b border-line px-4 py-3 text-ink2">{when(c.scheduledAt)}</td>
                      <td className="border-b border-line px-4 py-3 text-navy">
                        {c.kind === 'held' || c.kind === 'live' ? `${c.attendedCount} of ${c.rosterSize}${c.rosterSize ? ` · ${Math.round((c.attendedCount / c.rosterSize) * 100)}%` : ''}` : '—'}
                      </td>
                      <td className="border-b border-line px-4 py-3 text-ink2">{c.recordingUrl ? 'Added' : c.missingRecording ? 'Missing' : '—'}</td>
                      <td className="border-b border-line px-4 py-3">
                        <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-semibold',
                          c.kind === 'live' || c.kind === 'held' ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>{STATUS[c.kind]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <ClassDrawer cls={open} onClose={() => setOpenId(null)} onChanged={load} />
    </div>
  );
}

function ClassDrawer({ cls, onClose, onChanged }: { cls: Row | null; onClose: () => void; onChanged: () => Promise<void> }) {
  const [who, setWho] = useState<{ id: string; joinedAt?: string; leftAt?: string | null; student?: { firstName?: string | null; lastName?: string | null; email?: string } }[] | null>(null);
  const [rec, setRec] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => {
    setWho(null); setRec(cls?.recordingUrl ?? '');
    if (cls && (cls.kind === 'held' || cls.kind === 'live')) api.get(`/live/classes/${cls.id}/attendance`).then(r => setWho(r.data ?? [])).catch(() => setWho([]));
  }, [cls?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(key: string, fn: () => Promise<unknown>, done: string, close = false) {
    setBusy(key);
    try { await fn(); notify.success(done); await onChanged(); if (close) onClose(); }
    catch (err: any) { notify.error(err?.response?.data?.message ?? 'That didn’t work. Please try again.'); }
    finally { setBusy(null); }
  }

  return (
    <Drawer open={!!cls} onOpenChange={o => { if (!o) onClose(); }}>
      {cls && (
        <DrawerContent title={cls.title} description={`${cls.cohort.name} · ${cls.teacher.name}`}
          footer={<>
            <Link href={`/admin/messages?to=${cls.teacher.id}`} className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Message the teacher</Link>
            <span className="flex-1" />
            {cls.kind === 'live' && <Button size="sm" variant="secondary" loading={busy === 'end'} onClick={() => run('end', () => api.patch(`/live/classes/${cls.id}/end`), 'Class ended')}>End class</Button>}
            {cls.kind === 'upcoming' && <Button size="sm" variant="danger" loading={busy === 'cancel'} onClick={() => run('cancel', () => api.delete(`/live/classes/${cls.id}`), 'Class cancelled', true)}>Cancel class</Button>}
          </>}>
          <InfoGrid items={[
            { label: 'When', value: `${new Date(cls.scheduledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · ${time(cls.scheduledAt)}` },
            { label: 'Attendance', value: cls.kind === 'held' || cls.kind === 'live' ? `${cls.attendedCount} of ${cls.rosterSize}` : '—' },
            { label: 'Status', value: STATUS[cls.kind] },
          ]} />
          {(cls.kind === 'held' || cls.kind === 'live') && (
            <DrawerSection title="Who came" count={who?.length}>
              {!who ? <div className="h-24 rounded-md bg-subtle animate-pulse" /> : !who.length ? <p className="text-[13px] text-ink2">Nobody joined this class.</p> : (
                <div className="space-y-2">
                  {who.map(w => {
                    const n = [w.student?.firstName, w.student?.lastName].filter(Boolean).join(' ') || w.student?.email?.split('@')[0] || 'Student';
                    const mins = w.joinedAt && w.leftAt ? Math.round((+new Date(w.leftAt) - +new Date(w.joinedAt)) / 60_000) : null;
                    return (
                      <p key={w.id} className="flex justify-between gap-3 rounded-md border border-line px-3 py-2 text-[13px]">
                        <span className="font-semibold text-navy">{n}</span>
                        <span className="text-muted">{w.joinedAt ? time(w.joinedAt) : ''}{mins != null ? ` · ${mins} min` : w.leftAt === null && cls.kind === 'live' ? ' · in class' : ''}</span>
                      </p>
                    );
                  })}
                </div>
              )}
            </DrawerSection>
          )}
          {cls.kind === 'held' && (
            <DrawerSection title="Recording">
              <div className="flex gap-2">
                <input aria-label="Recording link" value={rec} onChange={e => setRec(e.target.value)} placeholder="https://" className="input-base h-9 flex-1" />
                <Button size="sm" variant="secondary" loading={busy === 'rec'} disabled={rec.trim() === (cls.recordingUrl ?? '')}
                  onClick={() => run('rec', () => api.patch(`/live/classes/${cls.id}`, { recordingUrl: rec.trim() || null }), 'Recording saved')}>Save</Button>
              </div>
            </DrawerSection>
          )}
        </DrawerContent>
      )}
    </Drawer>
  );
}
