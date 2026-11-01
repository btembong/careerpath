'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { clsx } from 'clsx';
import { RepTable, td } from '@/components/rep/RepTable';
import { Button } from '@/components/ui/Button';
import { Drawer, DrawerContent, DrawerSection } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import { money } from '@/lib/money';
import api from '@/lib/api';

type Role = 'STUDENT' | 'TEACHER' | 'SUBJECT_REVIEWER' | 'COUNTRY_REP' | 'ADMIN';
interface Row { id: string; name: string; email: string; role: Role; country: string | null; detail: string; joinedAt: string; lastActive: string | null; approval: string }
interface Data {
  rows: Row[]; total: number; page: number; pages: number;
  counts: Record<string, number> & { all: number; pending: number };
  stats: { students: number; activeWeek: number; joinedThisMonth: number; teachers: number; reviewers: number; reps: number };
}

const ROLE: Record<Role, string> = { STUDENT: 'Student', TEACHER: 'Teacher', SUBJECT_REVIEWER: 'Reviewer', COUNTRY_REP: 'Country rep', ADMIN: 'Admin' };
const DAY = 86_400_000;
const date = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
function seen(iso: string | null) {
  if (!iso) return 'Never signed in';
  const days = Math.floor((+new Date(new Date().toDateString()) - +new Date(new Date(iso).toDateString())) / DAY);
  return days <= 0 ? 'Active today' : days < 7 ? 'Active this week' : days < 30 ? 'Active this month' : `Last seen ${date(iso)}`;
}

export default function AdminUsersPage() {
  const [d, setD] = useState<Data | null>(null);
  const [tab, setTab] = useState('all');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback((t: string, term: string, p: number) => {
    const params: Record<string, string> = { page: String(p) };
    if (t === 'pending') params.status = 'pending'; else if (t !== 'all') params.role = t;
    if (term.trim()) params.search = term.trim();
    api.get('/portals/admin/people', { params }).then(r => setD(r.data)).catch(() => notify.error('Could not load users'));
  }, []);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => load(tab, q, page), q ? 250 : 0);
  }, [tab, q, page, load]);

  async function sync() {
    setSyncing(true);
    try {
      const r = await api.post('/portals/admin/sync/wp-users');
      const n = r.data?.imported ?? r.data?.created ?? r.data?.count ?? 0;
      notify.success(n ? `${n} people brought in from WordPress` : 'Everyone on WordPress is already here');
      load(tab, q, page);
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not reach WordPress'); }
    finally { setSyncing(false); }
  }

  const s = d?.stats, c = d?.counts;
  return (
    <>
      <RepTable title="Users" subtitle="Everyone on the portal: students, teachers, reviewers, reps and admins"
        actions={<button onClick={sync} disabled={syncing} className="inline-flex h-9 items-center rounded-md border border-line bg-white px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle disabled:opacity-50">{syncing ? 'Checking WordPress…' : 'Bring in from WordPress'}</button>}
        stats={[
          { l: 'Students', v: s ? s.students.toLocaleString('en-GB') : '—', sub: s ? `${s.joinedThisMonth} people joined this month` : '' },
          { l: 'Teachers', v: s ? String(s.teachers) : '—', sub: c?.pending ? `${c.pending} waiting for approval` : 'all approved' },
          { l: 'Reviewers and reps', v: s ? String(s.reviewers + s.reps) : '—', sub: s ? `${s.reviewers} reviewers · ${s.reps} reps` : '' },
          { l: 'Active this week', v: s ? s.activeWeek.toLocaleString('en-GB') : '—', sub: s?.students ? `${Math.round((s.activeWeek / s.students) * 100)}% of students` : '' },
        ]}
        tabs={[
          { key: 'all', label: 'All', count: c?.all ?? 0 },
          ...(['STUDENT', 'TEACHER', 'SUBJECT_REVIEWER', 'COUNTRY_REP', 'ADMIN'] as Role[]).map(r => ({ key: r, label: r === 'SUBJECT_REVIEWER' ? 'Reviewers' : r === 'COUNTRY_REP' ? 'Reps' : `${ROLE[r]}s`, count: c?.[r] ?? 0 })),
          ...(c?.pending ? [{ key: 'pending', label: 'Waiting for approval', count: c.pending }] : []),
        ]}
        tab={tab} onTab={k => { setTab(k); setPage(1); }} search={q} onSearch={v => { setQ(v); setPage(1); }} searchLabel="Search name, email or phone"
        cols={['Person', 'Role', 'Country', 'Joined', 'Status', '']}
        loading={!d} empty={d && !d.rows.length ? 'Nobody matches.' : null}
        note="People sign up on the portal or come from WordPress. Bringing them in from WordPress never creates WordPress accounts.">
        {d?.rows.map(r => (
          <tr key={r.id} className="cursor-pointer hover:bg-subtle" onClick={() => setOpen(r.id)}>
            <td className={td}><strong className="text-navy">{r.name}</strong><br /><span className="text-[12.5px] text-muted">{r.email}</span></td>
            <td className={clsx(td, 'text-navy')}>{ROLE[r.role]}{r.detail && <><br /><span className="text-[12.5px] text-muted">{r.detail}</span></>}</td>
            <td className={clsx(td, 'text-ink2')}>{r.country ?? '—'}</td>
            <td className={clsx(td, 'text-ink2')}>{date(r.joinedAt)}</td>
            <td className={td}>
              <span className={clsx('inline-flex h-6 items-center whitespace-nowrap rounded px-2 text-[12px] font-semibold',
                r.approval === 'PENDING' ? 'border border-dashed border-azure text-azure-strong' : r.lastActive && Date.now() - +new Date(r.lastActive) < 7 * DAY ? 'bg-accent-soft text-navy' : 'border border-line bg-subtle text-ink2')}>
                {r.approval === 'PENDING' ? 'Waiting for approval' : r.approval === 'SUSPENDED' ? 'Suspended' : seen(r.lastActive)}
              </span>
            </td>
            <td className={clsx(td, 'text-right')}>
              {r.approval === 'PENDING' && r.role === 'TEACHER'
                ? <Link href="/admin/teachers" onClick={e => e.stopPropagation()} className="font-semibold text-azure-strong hover:underline">Review application</Link>
                : <span className="font-semibold text-azure-strong">Open</span>}
            </td>
          </tr>
        ))}
      </RepTable>
      {d && d.pages > 1 && (
        <div className="-mt-3 flex items-center justify-center gap-3 px-4 pb-6 text-[13px] text-ink2">
          <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="rounded-md border border-line bg-white px-3 py-1.5 font-semibold text-navy disabled:opacity-40">Previous</button>
          <span>Page {d.page} of {d.pages} · {d.total.toLocaleString('en-GB')} people</span>
          <button disabled={page >= d.pages} onClick={() => setPage(p => p + 1)} className="rounded-md border border-line bg-white px-3 py-1.5 font-semibold text-navy disabled:opacity-40">Next</button>
        </div>
      )}
      <Person id={open} onClose={() => setOpen(null)} onChanged={() => load(tab, q, page)} />
    </>
  );
}

interface Detail {
  id: string; name: string; email: string; phone: string | null; role: Role; approval: string; avatarUrl: string | null; country: string | null;
  joinedAt: string; lastActive: string | null; referredBy: string | null; paid: { currency: string; amount: number }[]; certificates: number;
  access: { title: string; kind: string; expiresAt: string | null; active: boolean }[];
  payments: { id: string; title: string; at: string; amount: number; currency: string }[];
  courses: { id: string; title: string; status: string }[]; subjects: string[];
  payout: { label: string; verified: boolean } | null; owed: { amount: number; currency: string } | null;
}

function Person({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const [p, setP] = useState<Detail | null>(null);
  const [role, setRole] = useState<Role>('STUDENT');
  const [currency, setCurrency] = useState('GHS');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    setP(null);
    if (id) api.get(`/portals/admin/people/${id}`).then(r => { setP(r.data); setRole(r.data.role); }).catch(() => notify.error('Could not open this person'));
  }, [id]);

  async function changeRole() {
    if (!p || role === p.role) return;
    if (!confirm(`Make ${p.name} a ${ROLE[role].toLowerCase()}? They’ll see the ${ROLE[role].toLowerCase()} portal the next time they sign in.`)) return;
    setSaving(true);
    try {
      await api.patch(`/portals/admin/users/${p.id}/role`, { role, ...(role === 'SUBJECT_REVIEWER' ? { payoutCurrency: currency } : {}) });
      notify.success(`${p.name} is now a ${ROLE[role].toLowerCase()}`);
      setP({ ...p, role }); onChanged();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not change the role'); }
    finally { setSaving(false); }
  }

  const initials = p?.name.split(/\s+/).map(w => w[0]?.toUpperCase()).join('').slice(0, 2);
  return (
    <Drawer open={!!id} onOpenChange={o => !o && onClose()}>
      <DrawerContent title={p?.name ?? 'Person'} description={p ? `${ROLE[p.role]}${p.country ? ` · ${p.country}` : ''} · joined ${date(p.joinedAt)}` : ' '}
        footer={p && <>
          <Link href={`/admin/messages?to=${p.id}`} className="inline-flex h-9 items-center rounded-md bg-azure-strong px-3.5 text-[13.5px] font-semibold text-on-accent">Send a message</Link>
          {p.role === 'TEACHER' && <Link href="/admin/teachers" className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Teacher page</Link>}
          {p.owed && <Link href="/admin/payouts" className="inline-flex h-9 items-center rounded-md border border-line px-3.5 text-[13.5px] font-semibold text-navy hover:bg-subtle">Payouts</Link>}
        </>}>
        {!p ? <div className="h-64 animate-pulse rounded bg-subtle" /> : <>
          <div className="flex items-center gap-3">
            {p.avatarUrl
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={p.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" />
              : <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-accent-soft font-extrabold text-navy">{initials}</span>}
            <p className="text-[13px] text-ink2">{seen(p.lastActive)}{p.approval === 'PENDING' ? ' · waiting for approval' : p.approval === 'SUSPENDED' ? ' · suspended' : ''}</p>
          </div>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5 text-[13px]">
            {[
              ['Email', p.email], ['Phone', p.phone ?? '—'],
              ...(p.role === 'STUDENT' ? [['Referred by', p.referredBy ?? '—'], ['Paid in total', p.paid.length ? p.paid.map(x => money(x.amount, x.currency)).join(' + ') : 'nothing yet'], ['Certificates', String(p.certificates)]] : []),
              ...(p.role !== 'STUDENT' && p.role !== 'ADMIN' ? [['Payout account', p.payout ? `${p.payout.label}${p.payout.verified ? ' ✓' : ' (not verified)'}` : 'none yet'], ['Owed', p.owed ? money(p.owed.amount, p.owed.currency) : '—']] : []),
              ...(p.subjects.length ? [['Subjects', p.subjects.join(', ')]] : []),
            ].map(([l, v]) => (
              <div key={l} className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{l}</dt><dd className="mt-0.5 break-words text-navy">{v}</dd></div>
            ))}
          </dl>
          {p.role === 'STUDENT' && (
            <DrawerSection title="Access" count={p.access.length}>
              {p.access.length ? <div className="flex flex-col gap-1.5">{p.access.map((a, i) => (
                <p key={i} className="flex justify-between gap-3 text-[13px] text-navy"><span className="min-w-0 truncate">{a.title}</span><span className={clsx('shrink-0', a.active ? 'text-muted' : 'text-azure-strong')}>{a.kind === 'free' ? 'free course' : !a.expiresAt ? 'no end date' : `${a.active ? 'until' : 'ended'} ${date(a.expiresAt)}`}</span></p>
              ))}</div> : <p className="text-[13px] text-ink2">No courses yet.</p>}
            </DrawerSection>
          )}
          {p.role === 'STUDENT' && p.payments.length > 0 && (
            <DrawerSection title="Payments" count={p.payments.length}>
              <div className="flex flex-col gap-1.5">{p.payments.map(x => (
                <p key={x.id} className="flex justify-between gap-3 text-[13px] text-navy"><span className="min-w-0 truncate">{x.title}</span><span className="shrink-0 text-muted">{date(x.at)} · {money(x.amount, x.currency)}</span></p>
              ))}</div>
            </DrawerSection>
          )}
          {p.courses.length > 0 && (
            <DrawerSection title="Courses" count={p.courses.length}>
              <div className="flex flex-col gap-1.5">{p.courses.map(x => (
                <Link key={x.id} href={`/admin/courses/${x.id}`} className="flex justify-between gap-3 text-[13px] text-navy hover:text-azure-strong"><span className="min-w-0 truncate">{x.title}</span><span className="shrink-0 text-muted">{x.status.toLowerCase().replace('_', ' ')}</span></Link>
              ))}</div>
            </DrawerSection>
          )}
          <DrawerSection title="Role">
            <div className="flex flex-wrap items-center gap-2">
              <select value={role} onChange={e => setRole(e.target.value as Role)} aria-label="Role" className="input-base h-[38px] min-w-[160px] flex-1">
                {(Object.keys(ROLE) as Role[]).map(r => <option key={r} value={r}>{ROLE[r]}</option>)}
              </select>
              {role === 'SUBJECT_REVIEWER' && p.role !== 'SUBJECT_REVIEWER' && (
                <select value={currency} onChange={e => setCurrency(e.target.value)} aria-label="Paid in" className="input-base h-[38px] w-28">
                  {['GHS', 'XAF', 'XOF', 'NGN', 'KES', 'USD'].map(x => <option key={x}>{x}</option>)}
                </select>
              )}
              <Button size="sm" variant="secondary" onClick={changeRole} loading={saving} disabled={role === p.role}>Change role</Button>
            </div>
            <p className="mt-1.5 text-[12.5px] text-muted">Changing a role changes what they see the next time they sign in. Their courses and payments stay.</p>
          </DrawerSection>
        </>}
      </DrawerContent>
    </Drawer>
  );
}
