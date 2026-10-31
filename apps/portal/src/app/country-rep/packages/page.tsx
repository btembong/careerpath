'use client';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { RepTable, td } from '@/components/rep/RepTable';
import { notify } from '@/lib/notify';
import { money } from '@/lib/money';
import api from '@/lib/api';

interface Row {
  kind: 'package' | 'course'; id: string; name: string; price: number; currency: string; detail: string; access: string;
  courses: number; activeStudents: number; soldThisMonth: number; revenueThisMonth: { currency: string; amount: number }[]; link: string;
}
interface Data {
  country: { name: string; currency: string };
  stats: { onSale: number; packages: number; courses: number; soldThisMonth: number; revenue: { currency: string; amount: number }[]; renewals: number };
  rows: Row[];
}

export default function RepPackagesPage() {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  useEffect(() => { api.get('/countries/country-rep/packages').then(r => setD(r.data)).catch(e => notify.error(e?.response?.data?.message ?? 'Could not load packages')); }, []);

  async function copy(r: Row) {
    const url = `${window.location.origin}${r.link}`;
    try { await navigator.clipboard.writeText(url); notify.success('Link copied', { description: 'Share it with schools and parents.' }); }
    catch { notify.error('Could not copy the link'); }
  }

  const filter = (k: string) => (r: Row) => k === 'all' || (k === 'packages' ? r.kind === 'package' : r.kind === 'course');
  const rows = (d?.rows ?? []).filter(filter(tab)).filter(r => !q.trim() || r.name.toLowerCase().includes(q.trim().toLowerCase()));
  const s = d?.stats;
  const main = s?.revenue.find(x => x.currency === d?.country.currency);

  return (
    <RepTable title="Packages" subtitle={`What’s on sale in ${d?.country.name ?? 'your country'} and how it’s selling`}
      stats={[
        { l: 'On sale', v: s ? String(s.onSale) : '—', sub: s ? `${s.packages} package${s.packages === 1 ? '' : 's'} · ${s.courses} single course${s.courses === 1 ? '' : 's'}` : '' },
        { l: 'Sold this month', v: s ? String(s.soldThisMonth) : '—', sub: `in ${d?.country.name ?? 'your country'}` },
        { l: 'Revenue', v: d ? money(main?.amount ?? 0, d.country.currency) : '—', sub: s && s.revenue.filter(x => x.currency !== d!.country.currency).length ? `plus ${s.revenue.filter(x => x.currency !== d!.country.currency).map(x => money(x.amount, x.currency)).join(', ')}` : 'this month' },
        { l: 'Renewals due', v: s ? String(s.renewals) : '—', sub: 'access ends this week' },
      ]}
      tabs={[{ key: 'all', label: 'All', count: d?.rows.length ?? 0 }, { key: 'packages', label: 'Packages', count: d?.rows.filter(filter('packages')).length ?? 0 }, { key: 'courses', label: 'Single courses', count: d?.rows.filter(filter('courses')).length ?? 0 }]}
      tab={tab} onTab={setTab} search={q} onSearch={setQ} searchLabel="Search packages"
      cols={[tab === 'courses' ? 'Course' : 'Package', `Price`, 'Courses', 'Active students', 'Sold this month', '']}
      loading={!d} empty={d && !rows.length ? (d.rows.length ? 'Nothing matches.' : 'Nothing is on sale yet.') : null}
      note="Prices are set by CareerPath. Share a link with schools and parents — every sale in your country counts towards your commission.">
      {rows.map(r => (
        <tr key={r.kind + r.id} className="hover:bg-subtle">
          <td className={td}><strong className="text-navy">{r.name}</strong><br /><span className="text-[12.5px] text-muted">{r.detail}</span></td>
          <td className={clsx(td, 'text-navy')}>{r.price ? money(r.price, r.currency) : 'Free'}<br /><span className="text-[12.5px] text-muted">{r.access}</span></td>
          <td className={clsx(td, 'text-navy')}>{r.courses}</td>
          <td className={clsx(td, 'text-navy')}>{r.activeStudents}</td>
          <td className={clsx(td, 'text-navy')}>{r.soldThisMonth || '—'}{r.revenueThisMonth.length > 0 && <><br /><span className="text-[12.5px] text-muted">{r.revenueThisMonth.map(x => money(x.amount, x.currency)).join(', ')}</span></>}</td>
          <td className={clsx(td, 'text-right')}><button onClick={() => copy(r)} className="font-semibold text-azure-strong hover:underline">Copy link</button></td>
        </tr>
      ))}
    </RepTable>
  );
}
