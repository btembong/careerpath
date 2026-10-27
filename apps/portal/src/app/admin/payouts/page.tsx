'use client';
import { notify } from '@/lib/notify';
import { useEffect, useState, useMemo } from 'react';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonTable } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

type TypeFilter = 'ALL' | 'TEACHER_COMMISSION' | 'COUNTRY_REP_COMMISSION';

interface Payout {
  id: string;
  type: string;
  status: 'PENDING' | 'PAID';
  amount: number;
  currency: string;
  createdAt: string;
  user?: {
    email: string;
    profile?: {
      bankName?: string | null;
      bankAccountNumber?: string | null;
      bankAccountName?: string | null;
      mobileMoneyNumber?: string | null;
      mobileMoneyProvider?: string | null;
    } | null;
  } | null;
}

function csvDownload(rows: Record<string, unknown>[]) {
  if (!rows.length) { notify.error('No data to export'); return; }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(',')),
  ].join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `cpa-payouts-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
  URL.revokeObjectURL(url);
}

export default function AdminPayoutsPage() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [marking, setMarking] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');

  useEffect(() => {
    api.get('/payouts/admin/payouts').then(r => setPayouts(r.data ?? [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function generatePayouts() {
    setGenerating(true);
    try {
      await api.post('/payouts/admin/payouts/generate');
      const r = await api.get('/payouts/admin/payouts');
      setPayouts(r.data ?? []);
      notify.success('Payouts generated');
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setGenerating(false); }
  }

  async function markPaid(id: string) {
    setMarking(id);
    try {
      await api.patch(`/payouts/admin/payouts/${id}/mark-paid`);
      setPayouts(p => p.map(x => x.id === id ? { ...x, status: 'PAID' } : x));
      notify.success('Marked as paid');
    } catch (err: any) { notify.error(err?.response?.data?.message ?? 'Failed'); }
    finally { setMarking(null); }
  }

  const filtered = useMemo(() => {
    if (typeFilter === 'ALL') return payouts;
    return payouts.filter(p => p.type === typeFilter);
  }, [payouts, typeFilter]);

  const pending = filtered.filter(p => p.status === 'PENDING');
  const paid    = filtered.filter(p => p.status === 'PAID');

  const allPending = payouts.filter(p => p.status === 'PENDING');

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-5 max-w-6xl mx-auto w-full">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[0,1,2,3].map(i => <div key={i} className="h-20 rounded-2xl bg-cloud animate-pulse" />)}
        </div>
        <SkeletonTable />
      </div>
    </div>
  );

  const TYPE_TABS: [TypeFilter, string][] = [
    ['ALL', 'All'],
    ['TEACHER_COMMISSION', 'Teachers'],
    ['COUNTRY_REP_COMMISSION', 'Country Reps'],
  ];

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Payouts" subtitle="Generate and manage teacher and rep payouts" />
      <div className="flex-1 p-6 space-y-5">

        {/* Stats + action */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Pending', value: allPending.length, icon: 'payouts' as const, sub: 'awaiting payment' },
            { label: 'Paid out', value: payouts.filter(p => p.status === 'PAID').length, icon: 'check' as const, sub: 'completed' },
            { label: 'Pending amount', value: allPending.reduce((s, p) => s + Number(p.amount ?? 0), 0).toLocaleString(), icon: 'dollar' as const, sub: 'native currency total' },
          ].map(stat => (
            <Card key={stat.label} padding="md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold text-navy">{stat.value}</p>
                  <p className="text-xs text-royal/40 mt-0.5">{stat.sub}</p>
                </div>
                <IconBox><Icon name={stat.icon} size={16} /></IconBox>
              </div>
            </Card>
          ))}
          <Card padding="md" className="flex flex-col gap-2 justify-center">
            <Button onClick={generatePayouts} loading={generating} size="sm" fullWidth>
              <Icon name="trending" size={14} /> Generate payouts
            </Button>
          </Card>
        </div>

        {/* Filter + Export row */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex gap-1 rounded-xl border border-cloud bg-surface p-1">
            {TYPE_TABS.map(([key, label]) => (
              <button key={key} onClick={() => setTypeFilter(key)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all
                  ${typeFilter === key ? 'bg-white text-navy shadow-sm border border-cloud' : 'text-royal/50 hover:text-navy'}`}>
                {label}
              </button>
            ))}
          </div>
          <div className="ml-auto">
            <button
              onClick={() => {
                const rows = filtered.map(p => ({
                  id: p.id,
                  user: p.user?.email ?? '',
                  type: p.type ?? '',
                  status: p.status,
                  amount: p.amount,
                  currency: p.currency,
                  createdAt: p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '',
                }));
                csvDownload(rows);
                notify.success('CSV downloaded');
              }}
              className="flex items-center gap-1.5 rounded-xl border border-cloud bg-white px-3 py-2 text-xs font-semibold text-navy hover:border-azure/50 transition">
              <Icon name="download" size={12} /> Export CSV
            </button>
          </div>
        </div>

        {/* Pending payouts */}
        {pending.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">PENDING PAYOUTS ({pending.length})</p>
            <Card padding="none">
              {pending.map((p, i, arr) => {
                const profile = p.user?.profile;
                const bankInfo = profile?.bankAccountNumber
                  ? `${profile.bankName ?? ''} · ${profile.bankAccountNumber}`
                  : profile?.mobileMoneyNumber
                    ? `${profile.mobileMoneyProvider ?? 'MoMo'} · ${profile.mobileMoneyNumber}`
                    : null;
                return (
                <div key={p.id} className={`flex items-center gap-4 px-4 py-3.5${i < arr.length - 1 ? ' border-b border-cloud' : ''}`}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cloud text-sm font-bold text-azure flex-shrink-0">
                    {p.user?.email?.[0]?.toUpperCase() ?? 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy truncate">{p.user?.email}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <p className="text-xs text-royal/50 capitalize">{p.type?.toLowerCase().replace(/_/g, ' ') ?? 'payout'}</p>
                      {bankInfo && (
                        <span className="inline-flex items-center gap-1 rounded-md bg-cloud px-1.5 py-0.5 text-[10px] font-mono text-royal/60">
                          <Icon name="wallet" size={9} /> {bankInfo}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 mr-3">
                    <p className="text-sm font-bold text-navy">{p.currency} {Number(p.amount).toLocaleString()}</p>
                    <p className="text-[10px] text-royal/40">{new Date(p.createdAt).toLocaleDateString()}</p>
                  </div>
                  <Button size="sm" loading={marking === p.id} onClick={() => markPaid(p.id)}>
                    <Icon name="check" size={12} /> Mark paid
                  </Button>
                </div>
              );})}
            </Card>
          </div>
        )}

        {/* Paid */}
        {paid.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">COMPLETED ({paid.length})</p>
            <Card padding="none">
              {paid.map((p, i, arr) => (
                <div key={p.id} className={`flex items-center gap-4 px-4 py-3.5 opacity-70${i < arr.length - 1 ? ' border-b border-cloud' : ''}`}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-full bg-cloud text-sm font-bold text-azure flex-shrink-0">
                    {p.user?.email?.[0]?.toUpperCase() ?? 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy truncate">{p.user?.email}</p>
                    <p className="text-xs text-royal/50 capitalize">{p.type?.toLowerCase().replace(/_/g, ' ')}</p>
                  </div>
                  <div className="text-right flex-shrink-0 mr-3">
                    <p className="text-sm font-bold text-navy">{p.currency} {Number(p.amount).toLocaleString()}</p>
                  </div>
                  <Badge variant="active">Paid</Badge>
                </div>
              ))}
            </Card>
          </div>
        )}

        {filtered.length === 0 && (
          <Card padding="lg">
            <EmptyState icon="payouts" title={typeFilter === 'ALL' ? 'No payouts yet' : `No ${typeFilter === 'TEACHER_COMMISSION' ? 'teacher' : 'country rep'} payouts`}
              description='Click "Generate payouts" to compute pending payments' />
          </Card>
        )}
      </div>
    </div>
  );
}
