'use client';
import { useEffect, useState, useRef, useMemo } from 'react';
import { notify } from '@/lib/notify';
import {
  useReactTable, getCoreRowModel, getSortedRowModel, getFilteredRowModel,
  flexRender, createColumnHelper, SortingState,
} from '@tanstack/react-table';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import api from '@/lib/api';

type Role = 'STUDENT' | 'TEACHER' | 'ADMIN' | 'COUNTRY_REP' | 'SUBJECT_REVIEWER';
interface User { id: string; email: string; role: Role; approvalStatus: string; countryId: string | null; }

const ROLE_LABELS: Record<Role, string> = {
  STUDENT: 'Student', TEACHER: 'Teacher', ADMIN: 'Admin',
  COUNTRY_REP: 'Country Rep', SUBJECT_REVIEWER: 'Reviewer',
};
const ROLE_COLORS: Record<Role, 'active' | 'muted' | 'default'> = {
  ADMIN: 'active', TEACHER: 'active', COUNTRY_REP: 'muted', SUBJECT_REVIEWER: 'muted', STUDENT: 'default',
};
const PROMOTE_ROLES: { role: Role; label: string }[] = [
  { role: 'COUNTRY_REP', label: 'Country Rep' },
  { role: 'SUBJECT_REVIEWER', label: 'Subject Reviewer' },
  { role: 'TEACHER', label: 'Teacher' },
  { role: 'ADMIN', label: 'Admin' },
  { role: 'STUDENT', label: 'Student (demote)' },
];

const col = createColumnHelper<User>();

export default function AdminUsersPage() {
  const [users, setUsers]             = useState<User[]>([]);
  const [allUsers, setAllUsers]       = useState<User[]>([]);
  const [loading, setLoading]         = useState(true);
  const [roleFilter, setRoleFilter]   = useState<Role | ''>('');
  const [globalFilter, setGlobalFilter] = useState('');
  const [sorting, setSorting]         = useState<SortingState>([]);
  const [promoteId, setPromoteId]     = useState<string | null>(null);
  const [promoteRole, setPromoteRole] = useState<Role>('COUNTRY_REP');
  const [currency, setCurrency]       = useState('USD');
  const [saving, setSaving]           = useState(false);
  const [syncing, setSyncing]         = useState(false);
  const [lastRoleChanged, setLastRoleChanged] = useState<string | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function load(email?: string, role?: Role | '') {
    setLoading(true);
    try {
      if (email && email.length >= 2) {
        const r = await api.get(`/portals/admin/users/search?email=${encodeURIComponent(email)}`);
        setUsers(r.data);
      } else {
        const params = role ? `?role=${role}` : '';
        const r = await api.get(`/portals/admin/users${params}`);
        setUsers(r.data);
        if (!role) setAllUsers(r.data);
      }
    } catch { setUsers([]); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function handleSyncWp() {
    setSyncing(true);
    try {
      const r = await api.post('/portals/admin/sync/wp-users');
      notify.success('WordPress sync complete', {
        description: `${r.data.created} new users imported, ${r.data.skipped} already existed`,
      });
      load(globalFilter, roleFilter);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Sync failed');
    } finally { setSyncing(false); }
  }

  function handleSearchChange(v: string) {
    setGlobalFilter(v);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => load(v, roleFilter), 300);
  }

  function handleRoleFilter(r: Role | '') {
    setRoleFilter(r);
    load(globalFilter, r);
  }

  async function handlePromote(e: React.FormEvent) {
    e.preventDefault();
    if (!promoteId) return;
    setSaving(true);
    try {
      await api.patch(`/portals/admin/users/${promoteId}/role`, {
        role: promoteRole,
        ...(promoteRole === 'SUBJECT_REVIEWER' && { payoutCurrency: currency.toUpperCase() }),
      });
      const email = users.find(u => u.id === promoteId)?.email ?? '';
      notify.success('Role updated', { description: `${email} → ${ROLE_LABELS[promoteRole]}` });
      setLastRoleChanged(email);
      setPromoteId(null);
      load(globalFilter, roleFilter);
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Failed to update role');
    } finally { setSaving(false); }
  }

  const columns = useMemo(() => [
    col.accessor('email', {
      header: 'User',
      cell: info => (
        <div className="flex items-center gap-3">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-azure/10 text-sm font-bold text-azure">
            {info.getValue()[0].toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-navy truncate">{info.getValue()}</p>
            <p className="text-[10px] text-royal/40 font-mono truncate">{info.row.original.id.slice(0, 8)}…</p>
          </div>
        </div>
      ),
    }),
    col.accessor('role', {
      header: ({ column }) => (
        <button className="flex items-center gap-1" onClick={column.getToggleSortingHandler()}>
          Role <span className="text-royal/30">{{ asc: '↑', desc: '↓' }[column.getIsSorted() as string] ?? '↕'}</span>
        </button>
      ),
      cell: info => <Badge variant={ROLE_COLORS[info.getValue()]}>{ROLE_LABELS[info.getValue()]}</Badge>,
    }),
    col.accessor('approvalStatus', {
      header: 'Status',
      cell: info => info.getValue() === 'PENDING'
        ? <Badge variant="muted">Pending</Badge>
        : <span className="text-[11px] text-green-600 font-semibold">Active</span>,
    }),
    col.display({
      id: 'actions',
      header: '',
      cell: ({ row }) => (
        <button
          onClick={() => { setPromoteId(row.original.id); setPromoteRole(row.original.role); setCurrency('USD'); }}
          className="flex items-center gap-1.5 rounded-xl border border-cloud px-2.5 py-1.5 text-[11px] font-semibold text-navy hover:bg-cloud transition ml-auto">
          <Icon name="edit" size={12} /> Change Role
        </button>
      ),
    }),
  ], []);

  const table = useReactTable({
    data: users,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: 'includesString',
  });

  const counts = useMemo(() => {
    const map: Record<string, number> = {};
    allUsers.forEach(u => { map[u.role] = (map[u.role] ?? 0) + 1; });
    return map;
  }, [allUsers]);

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Users" subtitle="Search, manage roles, and promote accounts" />
      <div className="flex-1 p-6 space-y-5">

        {/* Stat tiles */}
        {allUsers.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            {(['STUDENT','TEACHER','ADMIN','COUNTRY_REP','SUBJECT_REVIEWER'] as Role[]).map(r => (
              <button key={r} onClick={() => handleRoleFilter(roleFilter === r ? '' : r)}
                className={`rounded-2xl border px-4 py-3 text-left transition ${
                  roleFilter === r ? 'border-azure bg-azure/5 shadow-sm' : 'border-cloud bg-white hover:border-azure/30'
                }`}>
                <p className="text-xl font-bold text-navy">{counts[r] ?? 0}</p>
                <p className="text-[10px] text-royal/50 font-semibold mt-0.5">{ROLE_LABELS[r]}</p>
              </button>
            ))}
          </div>
        )}

        {/* Sync from WordPress */}
        <div className="flex items-center justify-between">
          <div />
          <Button size="sm" variant="secondary" loading={syncing} onClick={handleSyncWp}>
            <Icon name="arrowRight" size={13} /> Sync from WordPress
          </Button>
        </div>

        {/* Re-login notice after role change */}
        {lastRoleChanged && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Icon name="clock" size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-amber-900">Role updated for {lastRoleChanged}</p>
              <p className="text-xs text-amber-700 mt-0.5">
                The new role takes effect the next time they log in — their current session still uses the old role.
              </p>
            </div>
            <button onClick={() => setLastRoleChanged(null)} className="text-amber-400 hover:text-amber-600 transition flex-shrink-0">
              <Icon name="close" size={14} />
            </button>
          </div>
        )}

        {/* Search + role filter */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-royal/40 pointer-events-none" />
            <input value={globalFilter} onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search by email…"
              className="w-full rounded-xl border border-cloud bg-white py-2.5 pl-9 pr-4 text-sm text-navy outline-none focus:border-azure focus:ring-2 focus:ring-azure/15 placeholder:text-royal/40" />
          </div>
          <div className="flex gap-2 flex-wrap">
            {(['','STUDENT','TEACHER','COUNTRY_REP','SUBJECT_REVIEWER','ADMIN'] as const).map(r => (
              <button key={r} onClick={() => handleRoleFilter(r)}
                className={`rounded-xl border px-3 py-2 text-xs font-semibold transition ${
                  roleFilter === r ? 'border-azure bg-azure text-white' : 'border-cloud bg-white text-navy hover:bg-cloud'
                }`}>
                {r ? ROLE_LABELS[r as Role] : 'All'}
              </button>
            ))}
          </div>
        </div>

        {/* Promote panel */}
        {promoteId && (
          <Card padding="md" className="border-azure/30 bg-azure/5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure mb-3">CHANGE ROLE</p>
            <p className="text-xs text-royal/60 mb-4">
              Changing role for: <span className="font-semibold text-navy">{users.find(u => u.id === promoteId)?.email}</span>
            </p>
            <form onSubmit={handlePromote} className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {PROMOTE_ROLES.map(p => (
                  <button key={p.role} type="button" onClick={() => setPromoteRole(p.role)}
                    className={`rounded-xl border py-2.5 text-xs font-semibold transition ${
                      promoteRole === p.role ? 'border-azure bg-azure text-white' : 'border-cloud bg-white text-navy hover:bg-cloud'
                    }`}>
                    {p.label}
                  </button>
                ))}
              </div>
              {promoteRole === 'SUBJECT_REVIEWER' && (
                <div className="space-y-1">
                  <label className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">
                    Payout currency <span className="text-red-400">*</span>
                  </label>
                  <input value={currency} onChange={e => setCurrency(e.target.value)}
                    placeholder="USD, NGN, GHS…" maxLength={5}
                    className="w-full rounded-xl border border-cloud bg-white px-3 py-2 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/40" />
                  <p className="text-[10px] text-royal/40">Reviewer earnings credited in this currency.</p>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Button type="submit" size="sm" loading={saving}>Save role</Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setPromoteId(null)}>Cancel</Button>
              </div>
            </form>
          </Card>
        )}

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-azure border-t-transparent" />
          </div>
        ) : users.length === 0 ? (
          <Card padding="lg">
            <EmptyState icon="user" title="No users found" description="Try a different search or filter" />
          </Card>
        ) : (
          <Card padding="none" className="overflow-hidden">
            <div className="px-4 py-3 border-b border-cloud flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">
                {table.getFilteredRowModel().rows.length} users
              </p>
              <p className="text-[10px] text-royal/30">Click column headers to sort</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  {table.getHeaderGroups().map(hg => (
                    <tr key={hg.id} className="border-b border-cloud bg-cloud/30">
                      {hg.headers.map(header => (
                        <th key={header.id}
                          className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-royal/50 whitespace-nowrap select-none"
                          onClick={header.column.getToggleSortingHandler()}
                          style={{ cursor: header.column.getCanSort() ? 'pointer' : 'default' }}>
                          {flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-cloud">
                  {table.getRowModel().rows.map(row => (
                    <tr key={row.id} className="hover:bg-cloud/20 transition group">
                      {row.getVisibleCells().map(cell => (
                        <td key={cell.id} className="px-4 py-3">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
