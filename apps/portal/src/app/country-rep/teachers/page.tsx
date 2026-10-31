'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { RepTable, td } from '@/components/rep/RepTable';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

type Status = 'teaching' | 'applied' | 'suspended' | 'declined';
interface Row { id: string; name: string; email: string; avatarUrl: string | null; subjects: string[]; years: number | null; courses: number; students: number; rating: number | null; ratings: number; status: Status; appliedAt: string }
interface Data { country: { name: string }; stats: { teaching: number; applied: number; avgRating: number | null; ratings: number; students: number }; rows: Row[] }

function ago(iso: string) {
  const d = Math.floor((Date.now() - +new Date(iso)) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`;
}

export default function RepTeachersPage() {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  useEffect(() => { api.get('/countries/country-rep/teachers').then(r => setD(r.data)).catch(e => notify.error(e?.response?.data?.message ?? 'Could not load teachers')); }, []);

  const filter = (k: string) => (r: Row) => k === 'all' || r.status === k;
  const rows = (d?.rows ?? []).filter(filter(tab)).filter(r => !q.trim() || `${r.name} ${r.subjects.join(' ')}`.toLowerCase().includes(q.trim().toLowerCase()));
  const s = d?.stats;
  const where = d?.country.name ?? 'your country';

  return (
    <RepTable title="Teachers" subtitle={`Teachers in ${where}, their courses and how students rate them`}
      stats={[
        { l: 'Teachers', v: s ? String(s.teaching) : '—', sub: `teaching in ${where}` },
        { l: 'Applications', v: s ? String(s.applied) : '—', sub: 'waiting for an admin' },
        { l: 'Average rating', v: s?.avgRating != null ? `${s.avgRating} ★` : '—', sub: s ? `${s.ratings} rating${s.ratings === 1 ? '' : 's'}` : '' },
        { l: 'Students taught', v: s ? String(s.students) : '—', sub: 'across their courses' },
      ]}
      tabs={[{ key: 'all', label: 'All', count: d?.rows.length ?? 0 }, { key: 'teaching', label: 'Teaching', count: d?.rows.filter(filter('teaching')).length ?? 0 }, { key: 'applied', label: 'Applied', count: d?.rows.filter(filter('applied')).length ?? 0 }]}
      tab={tab} onTab={setTab} search={q} onSearch={setQ} searchLabel="Search teachers or subjects"
      cols={['Teacher', 'Subjects', 'Courses', 'Students', 'Rating', 'Status', '']}
      loading={!d} empty={d && !rows.length ? (d.rows.length ? 'Nothing matches.' : `No teachers in ${where} yet.`) : null}
      note="Admins approve applications. You can message any teacher in your country.">
      {rows.map(r => (
        <tr key={r.id} className="hover:bg-subtle">
          <td className={td}><strong className="text-navy">{r.name}</strong><br /><span className="text-[12.5px] text-muted">{r.years ? `${r.years} years teaching` : r.email}</span></td>
          <td className={clsx(td, 'text-navy')}>{r.subjects.join(', ') || '—'}</td>
          <td className={clsx(td, 'text-navy')}>{r.status === 'teaching' ? r.courses : '—'}</td>
          <td className={clsx(td, 'text-navy')}>{r.status === 'teaching' ? r.students : '—'}</td>
          <td className={clsx(td, 'text-navy')}>{r.rating != null ? `${r.rating} ★` : '—'}{r.ratings > 0 && <><br /><span className="text-[12.5px] text-muted">{r.ratings} rating{r.ratings === 1 ? '' : 's'}</span></>}</td>
          <td className={td}>
            <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-xs font-semibold', r.status === 'teaching' ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>
              {r.status === 'teaching' ? 'Teaching' : r.status === 'applied' ? `Applied ${ago(r.appliedAt)}` : r.status === 'suspended' ? 'Suspended' : 'Declined'}
            </span>
          </td>
          <td className={clsx(td, 'text-right')}><Link href={`/country-rep/messages?to=${r.id}`} className="font-semibold text-azure-strong hover:underline">Message</Link></td>
        </tr>
      ))}
    </RepTable>
  );
}
