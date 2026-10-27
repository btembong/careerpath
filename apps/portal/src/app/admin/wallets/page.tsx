'use client';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonTable } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

const ROLE_LABEL: Record<string, string> = {
  TEACHER: 'Teacher',
  SUBJECT_REVIEWER: 'Reviewer',
  COUNTRY_REP: 'Country Rep',
};

const ROLE_VARIANT: Record<string, 'active' | 'muted' | 'default'> = {
  TEACHER: 'active',
  SUBJECT_REVIEWER: 'default',
  COUNTRY_REP: 'muted',
};

const SOURCE_LABEL: Record<string, string> = {
  COURSE_SALE:       'Course sale',
  COUNTRY_BONUS:     'Country bonus',
  REVIEW_COMMISSION: 'Review commission',
  PAYOUT:            'Payout',
  ADJUSTMENT:        'Adjustment',
};

export default function AdminWalletsPage() {
  const [wallets,  setWallets]  = useState<any[]>([]);
  const [detail,   setDetail]   = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detLoading, setDetLoading] = useState(false);

  useEffect(() => {
    api.get('/wallets/admin/wallets')
      .then(r => setWallets(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function openDetail(wallet: any) {
    if (detailId === wallet.id) { setDetailId(null); setDetail(null); return; }
    setDetailId(wallet.id);
    setDetLoading(true);
    try {
      const r = await api.get(`/wallets/admin/wallets/${wallet.id}`);
      setDetail(r.data);
    } catch { setDetail(null); }
    finally { setDetLoading(false); }
  }

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

  const totalBalance = wallets.reduce((s, w) => s + (w.balance ?? 0), 0);
  const teachers  = wallets.filter(w => w.user?.role === 'TEACHER');
  const reviewers = wallets.filter(w => w.user?.role === 'SUBJECT_REVIEWER');
  const reps      = wallets.filter(w => w.user?.role === 'COUNTRY_REP');

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Wallets" subtitle="All earner wallet balances and transaction history" />

      <div className="flex-1 p-6 space-y-6">

        {/* Summary stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total wallets',    value: wallets.length,   icon: 'wallet' as const },
            { label: 'Teacher wallets',  value: teachers.length,  icon: 'graduate' as const },
            { label: 'Reviewer wallets', value: reviewers.length, icon: 'assignments' as const },
            { label: 'Rep wallets',      value: reps.length,      icon: 'countries' as const },
          ].map(s => (
            <Card key={s.label} padding="md">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">{s.label}</p>
                  <p className="mt-1 text-2xl font-bold text-navy">{s.value}</p>
                </div>
                <IconBox><Icon name={s.icon} size={16} /></IconBox>
              </div>
            </Card>
          ))}
        </div>

        {/* Wallet list */}
        {wallets.length === 0 ? (
          <Card padding="lg">
            <EmptyState icon="wallet" title="No wallets yet" description="Wallets are created automatically when a first commission is credited." />
          </Card>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">ALL WALLETS</p>
            <Card padding="none">
              <ul className="divide-y divide-cloud">
                {wallets.map((w: any) => (
                  <li key={w.id}>
                    <button
                      onClick={() => openDetail(w)}
                      className="w-full flex items-center gap-4 px-5 py-4 hover:bg-cloud/40 transition-colors text-left"
                    >
                      <IconBox className="h-10 w-10 rounded-xl flex-shrink-0">
                        <Icon name="wallet" size={16} />
                      </IconBox>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy truncate">{w.user?.email ?? '—'}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <Badge variant={ROLE_VARIANT[w.user?.role] ?? 'muted'}>
                            {ROLE_LABEL[w.user?.role] ?? w.user?.role}
                          </Badge>
                          <span className="text-[11px] text-royal/40">{w._count?.transactions ?? 0} transactions</span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-navy">
                          {w.currency} {Number(w.balance ?? 0).toLocaleString()}
                        </p>
                        <p className="text-[11px] text-royal/40">balance</p>
                      </div>
                      <Icon
                        name="chevronDown"
                        size={14}
                        className={`text-royal/30 flex-shrink-0 transition-transform ${detailId === w.id ? 'rotate-180' : ''}`}
                      />
                    </button>

                    {/* Expanded transaction detail */}
                    <AnimatePresence>
                    {detailId === w.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                      <div className="border-t border-cloud bg-surface px-5 py-4">
                        {detLoading ? (
                          <div className="flex items-center justify-center py-6">
                            <div className="h-5 w-5 rounded-full border-2 border-azure border-t-transparent animate-spin" />
                          </div>
                        ) : !detail ? (
                          <p className="text-sm text-royal/40 py-2">Failed to load transactions.</p>
                        ) : (
                          <div className="space-y-4">
                            {/* Mini stats */}
                            <div className="grid grid-cols-3 gap-3">
                              {[
                                {
                                  label: 'Available balance',
                                  value: `${detail.currency} ${Number(detail.balance ?? 0).toLocaleString()}`,
                                },
                                {
                                  label: 'Total credited',
                                  value: `${detail.currency} ${
                                    (detail.transactions ?? [])
                                      .filter((t: any) => t.type === 'CREDIT')
                                      .reduce((s: number, t: any) => s + t.amount, 0)
                                      .toLocaleString()
                                  }`,
                                },
                                {
                                  label: 'Total debited',
                                  value: `${detail.currency} ${
                                    (detail.transactions ?? [])
                                      .filter((t: any) => t.type === 'DEBIT')
                                      .reduce((s: number, t: any) => s + t.amount, 0)
                                      .toLocaleString()
                                  }`,
                                },
                              ].map(s => (
                                <div key={s.label} className="rounded-xl bg-white border border-cloud px-4 py-3">
                                  <p className="text-[10px] text-royal/50 mb-0.5">{s.label}</p>
                                  <p className="text-sm font-bold text-navy">{s.value}</p>
                                </div>
                              ))}
                            </div>

                            {/* Transaction list */}
                            {(detail.transactions ?? []).length === 0 ? (
                              <p className="text-sm text-royal/40 py-2">No transactions yet.</p>
                            ) : (
                              <ul className="divide-y divide-cloud rounded-xl border border-cloud bg-white overflow-hidden">
                                {(detail.transactions as any[]).map((tx: any) => (
                                  <li key={tx.id} className="flex items-center gap-3 px-4 py-3">
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold text-navy">
                                        {SOURCE_LABEL[tx.source] ?? tx.source}
                                        {tx.description && <span className="font-normal text-royal/50"> · {tx.description}</span>}
                                      </p>
                                      <p className="text-[11px] text-royal/40">
                                        {new Date(tx.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                                        {tx.courseId && <span> · course {tx.courseId.slice(0, 8)}…</span>}
                                      </p>
                                    </div>
                                    <p className={`text-xs font-bold flex-shrink-0 ${tx.type === 'CREDIT' ? 'text-azure' : 'text-red-500'}`}>
                                      {tx.type === 'CREDIT' ? '+' : '−'}{tx.currency} {Number(tx.amount).toLocaleString()}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                        )}
                      </div>
                      </motion.div>
                    )}
                    </AnimatePresence>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
