'use client';
import { useCallback, useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { RepTable, td } from '@/components/rep/RepTable';
import { notify } from '@/lib/notify';
import type { SchoolStudent } from '@/lib/school';
import api from '@/lib/api';

const DAY = 86_400_000;
const ago = (iso: string | null) => {
  if (!iso) return 'never';
  const d = Math.floor((+new Date(new Date().toDateString()) - +new Date(new Date(iso).toDateString())) / DAY);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d < 14 ? `${d} days ago` : d < 60 ? `${Math.round(d / 7)} weeks ago` : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export default function SchoolStudentsPage() {
  const [rows, setRows] = useState<SchoolStudent[] | null>(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => api.get('/org/school/students').then(r => setRows(r.data)).catch(e => { setRows([]); notify.error(e?.response?.data?.message ?? 'Could not load students'); }), []);
  useEffect(() => { load(); }, [load]);

  const filters: Record<string, (s: SchoolStudent) => boolean> = {
    all: () => true, joined: s => s.status === 'joined', invited: s => s.status === 'invited',
    notStarted: s => s.status === 'joined' && s.lessons.done === 0,
  };
  const shown = (rows ?? []).filter(filters[tab]).filter(s => !q.trim() || `${s.name ?? ''} ${s.email ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()));

  async function remind(s: SchoolStudent) {
    setBusy(s.seatId);
    try { await api.post(`/org/school/seats/${s.seatId}/remind`); notify.success(`Invitation sent again to ${s.email}`); load(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not send it'); }
    finally { setBusy(null); }
  }
  async function remove(s: SchoolStudent) {
    if (!confirm(`Remove the invitation for ${s.email}? Their seat becomes free for another student.`)) return;
    setBusy(s.seatId);
    try { await api.delete(`/org/school/seats/${s.seatId}`); notify.success('Invitation removed; the seat is free'); load(); }
    catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not remove it'); }
    finally { setBusy(null); }
  }

  return (
    <RepTable title="Students" subtitle="Everyone your school has invited"
      stats={[]}
      tabs={[{ key: 'all', label: 'All', count: rows?.length ?? 0 }, { key: 'joined', label: 'Joined', count: rows?.filter(filters.joined).length ?? 0 }, { key: 'invited', label: 'Invited', count: rows?.filter(filters.invited).length ?? 0 }, { key: 'notStarted', label: 'Not started', count: rows?.filter(filters.notStarted).length ?? 0 }]}
      tab={tab} onTab={setTab} search={q} onSearch={setQ} searchLabel="Search students"
      cols={['Student', 'Package', 'Progress', 'Last active', 'Status', '']}
      loading={!rows} empty={rows && !shown.length ? (rows.length ? 'Nobody matches.' : 'Nobody yet. Invite students from the Invite page.') : null}
      note="Removing someone who hasn’t joined frees their seat for another student. Students who have joined keep access until the package ends.">
      {shown.map(s => {
        const pct = s.lessons.total ? Math.round((s.lessons.done / s.lessons.total) * 100) : 0;
        return (
          <tr key={s.seatId} className="hover:bg-subtle">
            <td className={td}><strong className="text-navy">{s.name ?? s.email}</strong><br /><span className="text-[12.5px] text-muted">{s.name ? s.email : s.status === 'invited' ? `invited ${ago(s.invitedAt)}` : ''}</span></td>
            <td className={clsx(td, 'text-ink2')}>{s.packageName}</td>
            <td className={clsx(td, 'w-[160px]')}>
              {s.status === 'joined' ? <>
                <span className="block h-1.5 rounded-[3px] bg-subtle"><span className="block h-1.5 rounded-[3px] bg-azure" style={{ width: `${pct}%` }} /></span>
                <span className="text-[12px] text-muted">{s.lessons.done ? `${s.lessons.done} of ${s.lessons.total} lessons${s.avgQuiz != null ? ` · quiz avg ${s.avgQuiz}%` : ''}` : 'not started'}</span>
              </> : <span className="text-[12.5px] text-muted">—</span>}
            </td>
            <td className={clsx(td, 'text-ink2')}>{s.status === 'joined' ? ago(s.lastActive) : 'never'}</td>
            <td className={td}><span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-[12px] font-semibold', s.status === 'joined' ? 'bg-accent-soft text-navy' : 'border border-dashed border-azure text-azure-strong')}>{s.status === 'joined' ? (s.joinedVia === 'LINK' ? 'Joined with link' : 'Joined') : 'Invited'}</span></td>
            <td className={clsx(td, 'whitespace-nowrap text-right')}>
              {s.status === 'invited' && <>
                <button onClick={() => remind(s)} disabled={busy === s.seatId} className="mr-3 font-semibold text-azure-strong hover:underline disabled:opacity-50">Resend</button>
                <button onClick={() => remove(s)} disabled={busy === s.seatId} className="font-semibold text-muted hover:text-navy hover:underline disabled:opacity-50">Remove</button>
              </>}
            </td>
          </tr>
        );
      })}
    </RepTable>
  );
}
