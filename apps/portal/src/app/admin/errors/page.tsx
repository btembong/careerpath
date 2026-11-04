'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { Topbar } from '@/components/layout/Topbar';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Status = 'OPEN' | 'FIXED' | 'IGNORED';
interface Row {
  id: string; source: 'PORTAL' | 'API'; message: string; where: string; stack: string | null; count: number;
  people: number; userIds: string[]; browsers: Record<string, number> | null; status: Status; firstSeen: string; lastSeen: string; isNew: boolean;
}
interface Data { tiles: { last24: number; dayBefore: number; people: number; newToday: number }; rows: Row[] }

function ago(iso: string) {
  const m = Math.round((Date.now() - +new Date(iso)) / 60_000);
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
}
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Admin → Errors: every crash in the portal or the API, grouped by cause */
export default function AdminErrorsPage() {
  const [status, setStatus] = useState<Status>('OPEN');
  const [d, setD] = useState<Data | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    api.get('/errors/admin', { params: { status } }).then(r => { setD(r.data); setSel(s => r.data.rows.some((x: Row) => x.id === s) ? s : r.data.rows[0]?.id ?? null); })
      .catch(() => notify.error('Could not load errors'));
  }, [status]);
  useEffect(load, [load]);

  const row = d?.rows.find(r => r.id === sel) ?? null;
  async function mark(next: Status) {
    if (!row) return;
    setBusy(true);
    try { await api.patch(`/errors/admin/${row.id}`, { status: next }); notify.success(next === 'FIXED' ? 'Marked fixed' : next === 'IGNORED' ? 'Ignored' : 'Opened again'); load(); }
    catch { notify.error('Could not change it'); } finally { setBusy(false); }
  }
  const t = d?.tiles;
  const tiles = [
    { l: 'Errors in the last 24 hours', v: t ? String(t.last24) : '—', s: t ? (t.last24 === t.dayBefore ? 'Same as the day before' : `${t.last24 > t.dayBefore ? 'Up' : 'Down'} from ${t.dayBefore} the day before`) : '' },
    { l: 'People affected', v: t ? String(t.people) : '—', s: 'Signed-in people who hit an error' },
    { l: 'New kinds today', v: t ? String(t.newToday) : '—', s: 'Each new kind emails the admins once' },
  ];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Errors" subtitle="Every crash in the portal or the API, grouped by cause" />
      <div className="flex flex-col gap-4 p-4 lg:px-7 lg:py-6">
        <div className="grid gap-3 sm:grid-cols-3">
          {tiles.map(x => (
            <div key={x.l} className="rounded-[10px] border border-line bg-white px-4 py-3.5">
              <span className="text-[12.5px] text-muted">{x.l}</span>
              <p className="mt-1 text-2xl font-extrabold text-navy">{x.v}</p>
              <span className="text-[12.5px] text-ink2">{x.s}</span>
            </div>
          ))}
        </div>

        <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_420px]">
          <section className="overflow-hidden rounded-[10px] border border-line bg-white">
            <div role="tablist" className="m-3 inline-flex gap-1 rounded-lg border border-line p-[3px] text-[13px]">
              {(['OPEN', 'FIXED', 'IGNORED'] as Status[]).map(k => (
                <button key={k} role="tab" aria-selected={status === k} onClick={() => setStatus(k)} className={clsx('rounded-md px-3 py-1 font-semibold', status === k ? 'bg-accent-soft text-navy' : 'text-ink2')}>
                  {k === 'OPEN' ? 'Open' : k === 'FIXED' ? 'Fixed' : 'Ignored'}
                </button>
              ))}
            </div>
            {!d && <div className="m-4 h-40 animate-pulse rounded-md bg-subtle" />}
            {d && !d.rows.length && <p className="px-4 pb-6 pt-2 text-sm text-ink2">{status === 'OPEN' ? 'Nothing broken right now.' : 'None here.'}</p>}
            {d?.rows.map(r => (
              <button key={r.id} onClick={() => setSel(r.id)} className={clsx('flex w-full items-center gap-3 border-t border-line px-4 py-3 text-left', r.id === sel ? 'bg-[#F5F8FF]' : 'bg-white hover:bg-subtle')}>
                <span className={clsx('h-2 w-2 flex-shrink-0 rounded-full', r.isNew ? 'bg-[#C1352B]' : 'bg-[#97A2BD]')} aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col">
                  <strong className="truncate text-sm text-navy">{r.message}</strong>
                  <span className="truncate text-[12.5px] text-muted">{r.source === 'API' ? 'API' : 'Portal'} · {r.where} · last {ago(r.lastSeen)}</span>
                </span>
                <span className="text-[13px] font-bold text-navy">{r.count}×</span>
                <span className="hidden w-[90px] text-right text-[12.5px] text-muted sm:block">{r.people ? `${r.people} ${r.people === 1 ? 'person' : 'people'}` : '—'}</span>
              </button>
            ))}
          </section>

          {row && (
            <aside className="flex flex-col gap-3 rounded-[10px] border border-line bg-white p-[18px] lg:sticky lg:top-4">
              <span className={clsx('text-xs font-bold', row.isNew ? 'text-[#C1352B]' : 'text-muted')}>{row.isNew ? 'NEW TODAY · ' : ''}{row.source === 'API' ? 'API' : 'PORTAL'}</span>
              <strong className="break-words text-[17px] text-navy">{row.message}</strong>
              <dl className="grid grid-cols-[110px_1fr] gap-x-2.5 gap-y-1.5 text-[13px]">
                <dt className="text-muted">Where</dt><dd className="break-words text-navy">{row.where}</dd>
                <dt className="text-muted">First seen</dt><dd className="text-navy">{when(row.firstSeen)}</dd>
                <dt className="text-muted">Happened</dt><dd className="text-navy">{row.count} time{row.count === 1 ? '' : 's'}{row.people ? `, ${row.people} ${row.people === 1 ? 'person' : 'people'}` : ''}</dd>
                {row.browsers && Object.keys(row.browsers).length > 0 && <><dt className="text-muted">Browsers</dt><dd className="text-navy">{Object.entries(row.browsers).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ')}</dd></>}
              </dl>
              {row.stack && <pre className="max-h-[260px] overflow-auto whitespace-pre-wrap rounded-lg bg-[#0B1530] p-3 text-xs leading-relaxed text-[#C9D6FF]">{row.stack}</pre>}
              {row.userIds.length > 0 && (
                <p className="text-[12.5px] text-ink2">Look up who hit it: {row.userIds.slice(0, 5).map((id, i) => <span key={id}>{i ? ', ' : ''}<Link href={`/admin/users?open=${id}`} className="font-semibold text-azure-strong hover:underline">person {i + 1}</Link></span>)}</p>
              )}
              <p className="text-xs text-muted">Names and emails are never stored with an error, only which page and a user id.</p>
              <div className="flex flex-wrap gap-2">
                {row.status !== 'FIXED' && <button onClick={() => mark('FIXED')} disabled={busy} className="h-9 rounded-md bg-[#3F6FE8] px-3.5 text-[13.5px] font-semibold text-white hover:bg-[#2F57C9] disabled:opacity-50">Mark fixed</button>}
                {row.status !== 'IGNORED' && <button onClick={() => mark('IGNORED')} disabled={busy} className="h-9 rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-50">Ignore this kind</button>}
                {row.status !== 'OPEN' && <button onClick={() => mark('OPEN')} disabled={busy} className="h-9 rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-50">Open again</button>}
              </div>
              <p className="text-xs text-muted">If it happens again after “Mark fixed”, it comes back as open.</p>
            </aside>
          )}
        </div>
      </div>
    </div>
  );
}
