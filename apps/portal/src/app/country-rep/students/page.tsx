'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { RepTable, td } from '@/components/rep/RepTable';
import { notify } from '@/lib/notify';
import { money } from '@/lib/money';
import api from '@/lib/api';

interface Row {
  id: string; name: string; email: string; joinedAt: string; lastActive: string | null;
  bought: { name: string; amount: number; currency: string; at: string; more: number } | null;
  lessons: { done: number; total: number }; access: 'until' | 'open' | 'ended' | 'none'; endsAt: string | null;
}
interface Data { country: { name: string; currency: string }; stats: { students: number; active: number; joinedThisMonth: number; joinedLastMonth: number; endingThisWeek: number }; rows: Row[] }

const DAY = 86_400_000;
const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const days = Math.floor((+new Date(new Date().toDateString()) - +new Date(new Date(iso).toDateString())) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : days < 30 ? `${days} days ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};
const soon = (r: Row) => !!r.endsAt && +new Date(r.endsAt) - Date.now() <= 7 * DAY;

export default function RepStudentsPage() {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  useEffect(() => { api.get('/countries/country-rep/students').then(r => setD(r.data)).catch(e => notify.error(e?.response?.data?.message ?? 'Could not load students')); }, []);

  const filters: Record<string, (r: Row) => boolean> = {
    all: () => true,
    active: r => r.access === 'until' || r.access === 'open',
    ending: soon,
    notStarted: r => !!r.bought && r.lessons.done === 0,
  };
  const rows = (d?.rows ?? []).filter(filters[tab]).filter(r => !q.trim() || `${r.name} ${r.email}`.toLowerCase().includes(q.trim().toLowerCase()));
  const s = d?.stats;
  const change = s ? s.joinedThisMonth - s.joinedLastMonth : 0;

  function download() {
    if (!d) return;
    const lines = [['Name', 'Email', 'Joined', 'Last active', 'Bought', 'Amount', 'Currency', 'Lessons done', 'Lessons', 'Access ends'],
      ...rows.map(r => [r.name, r.email, r.joinedAt.slice(0, 10), r.lastActive?.slice(0, 10) ?? '', r.bought?.name ?? '', r.bought ? minorToMajor(r.bought.amount, r.bought.currency) : '', r.bought?.currency ?? '', r.lessons.done, r.lessons.total, r.endsAt?.slice(0, 10) ?? ''])];
    const text = lines.map(l => l.map(c => /[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c).join(',')).join('\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
    a.download = `students-${d.country.name.toLowerCase()}.csv`; a.click();
    URL.revokeObjectURL(a.href);
  }

  return (
    <RepTable title="Students" subtitle={`Everyone learning in ${d?.country.name ?? 'your country'}, what they bought and how they’re doing`}
        actions={<button onClick={download} disabled={!d} className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-50">Download CSV</button>}
        stats={[
          { l: 'Students', v: s ? String(s.students) : '—', sub: `in ${d?.country.name ?? 'your country'}` },
          { l: 'Active access', v: s ? String(s.active) : '—', sub: 'package or course' },
          { l: 'Joined this month', v: s ? String(s.joinedThisMonth) : '—', sub: s ? `${change >= 0 ? '+' : '−'}${Math.abs(change)} on last month` : '' },
          { l: 'Ending this week', v: s ? String(s.endingThisWeek) : '—', sub: 'chase the renewal' },
        ]}
        tabs={[
          { key: 'all', label: 'All', count: d?.rows.length ?? 0 },
          { key: 'active', label: 'Active', count: d?.rows.filter(filters.active).length ?? 0 },
          { key: 'ending', label: 'Ending soon', count: d?.rows.filter(filters.ending).length ?? 0 },
          { key: 'notStarted', label: 'Not started', count: d?.rows.filter(filters.notStarted).length ?? 0 },
        ]}
        tab={tab} onTab={setTab} search={q} onSearch={setQ} searchLabel="Search students"
        cols={['Student', 'Bought', 'Progress', 'Last active', 'Access', '']}
        loading={!d} empty={d && !rows.length ? (d.rows.length ? 'Nobody matches.' : `No students in ${d.country.name} yet.`) : null}
        note="Students with access ending this week are the easiest renewals — a friendly message usually does it.">
        {rows.map(r => {
          const pct = r.lessons.total ? Math.round((r.lessons.done / r.lessons.total) * 100) : 0;
          return (
            <tr key={r.id} className="hover:bg-subtle">
              <td className={td}><strong className="text-navy">{r.name}</strong><br /><span className="text-[12.5px] text-muted">{r.email}</span></td>
              <td className={clsx(td, 'text-navy')}>
                {r.bought ? <>{r.bought.name}{r.bought.more > 0 && <span className="text-muted"> +{r.bought.more}</span>}<br /><span className="text-[12.5px] text-muted">{r.bought.amount ? money(r.bought.amount, r.bought.currency) : 'free'} · {ago(r.bought.at)}</span></> : <span className="text-muted">Nothing yet</span>}
              </td>
              <td className={clsx(td, 'w-40')}>
                {r.lessons.total ? <>
                  <span className="block h-1.5 rounded-[3px] bg-subtle"><span className="block h-1.5 rounded-[3px] bg-azure" style={{ width: `${pct}%` }} /></span>
                  <span className="text-[12px] text-muted">{r.lessons.done ? `${r.lessons.done} of ${r.lessons.total} lessons` : 'not started'}</span>
                </> : <span className="text-[12.5px] text-muted">—</span>}
              </td>
              <td className={clsx(td, 'text-ink2')}>{ago(r.lastActive)}</td>
              <td className={td}>
                <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-[12px] font-semibold', soon(r) || r.access === 'ended' ? 'border border-dashed border-azure text-azure-strong' : 'border border-line bg-subtle text-ink2')}>
                  {r.access === 'open' ? 'no end date' : r.access === 'ended' ? 'ended' : r.access === 'none' ? 'no access' : soon(r) ? `ends in ${Math.max(0, Math.ceil((+new Date(r.endsAt!) - Date.now()) / DAY))} days` : `until ${new Date(r.endsAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`}
                </span>
              </td>
              <td className={clsx(td, 'text-right')}><Link href={`/country-rep/messages?to=${r.id}`} className="font-semibold text-azure-strong hover:underline">Message</Link></td>
            </tr>
          );
        })}
      </RepTable>
  );
}
