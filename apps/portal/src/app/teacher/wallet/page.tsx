'use client';
import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/lib/icons';
import api from '@/lib/api';

const SOURCE_LABEL: Record<string, string> = {
  COURSE_SALE:       'Course sale',
  COUNTRY_BONUS:     'Country bonus',
  REVIEW_COMMISSION: 'Review commission',
  PAYOUT:            'Payout',
  ADJUSTMENT:        'Adjustment',
};

const SOURCE_ICON: Record<string, string> = {
  COURSE_SALE:       'dollar',
  COUNTRY_BONUS:     'star',
  REVIEW_COMMISSION: 'check',
  PAYOUT:            'payouts',
  ADJUSTMENT:        'edit',
};

interface WalletTransaction {
  id: string; type: 'CREDIT' | 'DEBIT'; source?: string;
  amount: number; currency?: string; courseId?: string;
  description?: string | null; createdAt: string;
}
interface WalletData {
  balance: number; currency: string; message?: string;
  transactions?: WalletTransaction[];
}
interface Payout {
  id: string; status: string; paidAt?: string | null;
  amount: number; currency?: string; createdAt: string;
  periodStart?: string; periodEnd?: string;
}
interface Course { id: string; title: string; }

export default function TeacherWalletPage() {
  const [wallet,  setWallet]  = useState<WalletData | null>(null);
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedTx, setExpandedTx] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/wallets/me/wallet').catch(() => ({ data: null })),
      api.get('/payouts/me/payouts').catch(() => ({ data: [] })),
      api.get('/platform-courses').catch(() => ({ data: [] })),
    ]).then(([wr, pr, cr]) => {
      setWallet(wr.data);
      setPayouts(pr.data ?? []);
      setCourses(cr.data ?? []);
    }).finally(() => setLoading(false));
  }, []);

  const courseMap = useMemo(() => {
    const m: Record<string, string> = {};
    for (const c of courses) m[c.id] = c.title;
    return m;
  }, [courses]);

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-6">
        <div className="rounded-2xl h-48 animate-pulse bg-navy/20" />
        <SkeletonCard lines={2} />
        <div className="space-y-2">
          {[1,2,3].map(i => <div key={i} className="rounded-2xl border border-cloud bg-white h-14 animate-pulse" />)}
        </div>
      </div>
    </div>
  );

  const currency = wallet?.currency ?? '—';
  const balance  = wallet?.balance  ?? 0;
  const txns     = wallet?.transactions ?? [];

  const totalEarned = txns
    .filter(t => t.type === 'CREDIT')
    .reduce((s, t) => s + t.amount, 0);

  const totalPaidOut = payouts
    .filter(p => p.status === 'PAID' || p.paidAt)
    .reduce((s, p) => s + Number(p.amount ?? 0), 0);

  const courseEarnings = useMemo(() => {
    const map: Record<string, { title: string; amount: number; count: number }> = {};
    for (const tx of txns) {
      if (tx.type !== 'CREDIT' || !tx.courseId) continue;
      if (!map[tx.courseId]) {
        map[tx.courseId] = { title: courseMap[tx.courseId] ?? `Course …${tx.courseId.slice(-6)}`, amount: 0, count: 0 };
      }
      map[tx.courseId].amount += tx.amount;
      map[tx.courseId].count  += 1;
    }
    return Object.entries(map).sort((a, b) => b[1].amount - a[1].amount);
  }, [txns, courseMap]);

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Wallet & Earnings" subtitle="Track your commissions and payout history" />

      <div className="flex-1 p-6 pb-28 lg:pb-6 space-y-6">

        {/* Balance hero */}
        <div className="rounded-2xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #072061 0%, #0d2872 50%, #1e4db7 100%)' }}>
          <div className="relative p-6">
            <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full border-[20px] border-white/5" />
            <div className="pointer-events-none absolute right-10 bottom-4 h-24 w-24 rounded-full border-[12px] border-white/5" />

            <p className="relative z-10 text-[10px] font-semibold uppercase tracking-widest text-azure mb-1">AVAILABLE BALANCE</p>
            <div className="relative z-10 flex items-end gap-2 mb-4">
              <p className="text-5xl font-black text-white leading-none tracking-tight">
                {Number(balance).toLocaleString()}
              </p>
              <p className="text-lg font-semibold text-white/50 mb-1">{currency}</p>
            </div>

            <div className="relative z-10 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-white/10 px-4 py-3">
                <p className="text-[10px] text-white/50 mb-0.5">Total earned</p>
                <p className="text-sm font-bold text-white">{currency} {Number(totalEarned).toLocaleString()}</p>
              </div>
              <div className="rounded-xl bg-white/10 px-4 py-3">
                <p className="text-[10px] text-white/50 mb-0.5">Total paid out</p>
                <p className="text-sm font-bold text-white">{currency} {Number(totalPaidOut).toLocaleString()}</p>
              </div>
            </div>
          </div>
        </div>

        {/* No wallet message */}
        {wallet?.message && (
          <Card padding="md">
            <div className="flex items-center gap-3">
              <IconBox className="h-10 w-10 rounded-xl flex-shrink-0">
                <Icon name="wallet" size={18} />
              </IconBox>
              <p className="text-sm text-royal/60">{wallet.message}</p>
            </div>
          </Card>
        )}

        {/* Per-course earnings breakdown */}
        {courseEarnings.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">EARNINGS BY COURSE</p>
            <Card padding="none">
              <ul className="divide-y divide-cloud">
                {courseEarnings.map(([courseId, data]) => (
                  <li key={courseId} className="flex items-center gap-4 px-5 py-3.5">
                    <IconBox className="h-9 w-9 rounded-xl flex-shrink-0">
                      <Icon name="courses" size={15} />
                    </IconBox>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy truncate">{data.title}</p>
                      <p className="text-xs text-royal/40">{data.count} sale{data.count !== 1 ? 's' : ''}</p>
                    </div>
                    <p className="text-sm font-bold text-azure flex-shrink-0">
                      +{currency} {Number(data.amount).toLocaleString()}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

        {/* Transaction history */}
        {txns.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">TRANSACTION HISTORY</p>
            <Card padding="none">
              <ul className="divide-y divide-cloud">
                {txns.map(tx => {
                  const courseName = tx.courseId ? (courseMap[tx.courseId] ?? `Course …${tx.courseId.slice(-6)}`) : null;
                  const isExpanded = expandedTx === tx.id;
                  return (
                    <li key={tx.id}>
                      <button
                        onClick={() => setExpandedTx(isExpanded ? null : tx.id)}
                        className="flex items-center gap-4 px-5 py-3.5 w-full text-left hover:bg-cloud/30 transition-colors"
                      >
                        <IconBox className="h-9 w-9 rounded-xl flex-shrink-0">
                          <Icon name={(SOURCE_ICON[tx.source ?? ''] ?? 'dollar') as IconName} size={15} />
                        </IconBox>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-navy truncate">
                            {SOURCE_LABEL[tx.source ?? ''] ?? tx.source}
                          </p>
                          <p className="text-xs text-royal/40 truncate">
                            {new Date(tx.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                            {courseName && ` · ${courseName}`}
                            {!courseName && tx.description && ` · ${tx.description}`}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0 mr-1">
                          <p className={`text-sm font-bold ${tx.type === 'CREDIT' ? 'text-azure' : 'text-red-500'}`}>
                            {tx.type === 'CREDIT' ? '+' : '−'}{tx.currency ?? currency} {Number(tx.amount).toLocaleString()}
                          </p>
                        </div>
                        <Icon name="chevronDown" size={14}
                          className={`text-royal/30 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                      </button>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="px-5 pb-4 pt-0 ml-14 grid grid-cols-2 gap-3 text-xs">
                              <div>
                                <p className="text-royal/40 mb-0.5">Transaction ID</p>
                                <p className="font-mono text-navy text-[11px]">{tx.id.slice(0, 12)}…</p>
                              </div>
                              <div>
                                <p className="text-royal/40 mb-0.5">Type</p>
                                <Badge variant={tx.type === 'CREDIT' ? 'success' : 'danger'}>
                                  {tx.type === 'CREDIT' ? 'Credit' : 'Debit'}
                                </Badge>
                              </div>
                              <div>
                                <p className="text-royal/40 mb-0.5">Source</p>
                                <p className="text-navy">{SOURCE_LABEL[tx.source ?? ''] ?? tx.source ?? '—'}</p>
                              </div>
                              {courseName && (
                                <div>
                                  <p className="text-royal/40 mb-0.5">Course</p>
                                  <p className="text-navy truncate">{courseName}</p>
                                </div>
                              )}
                              {tx.description && (
                                <div className="col-span-2">
                                  <p className="text-royal/40 mb-0.5">Note</p>
                                  <p className="text-navy">{tx.description}</p>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </div>
        )}

        {txns.length === 0 && !wallet?.message && (
          <Card padding="lg">
            <EmptyState
              icon="wallet"
              title="No transactions yet"
              description="Commissions appear here once a student purchases a package that includes your courses"
            />
          </Card>
        )}

        {/* Payout statements */}
        {payouts.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">PAYOUT STATEMENTS</p>
            <Card padding="none">
              <ul className="divide-y divide-cloud">
                {payouts.map(p => (
                  <li key={p.id} className="flex items-center gap-4 px-5 py-3.5">
                    <IconBox className="h-9 w-9 rounded-xl flex-shrink-0">
                      <Icon name="payouts" size={15} />
                    </IconBox>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy">
                        {p.currency ?? currency} {Number(p.amount ?? 0).toLocaleString()}
                      </p>
                      <p className="text-xs text-royal/40">
                        {p.periodStart && p.periodEnd
                          ? `${new Date(p.periodStart).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })} – ${new Date(p.periodEnd).toLocaleDateString('en-GB', { month: 'short', day: 'numeric', year: 'numeric' })}`
                          : new Date(p.createdAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}
                      </p>
                    </div>
                    <Badge variant={(p.status === 'PAID' || p.paidAt) ? 'active' : 'muted'}>
                      {(p.status === 'PAID' || p.paidAt) ? 'Paid' : 'Pending'}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        )}

        {/* Payout info note */}
        <div className="rounded-xl border border-cloud bg-cloud/30 px-4 py-3 text-xs text-royal/60 leading-relaxed flex items-start gap-2">
          <Icon name="shield" size={14} className="text-azure mt-0.5 flex-shrink-0" />
          <span>Commission rates are set per course by admin. Payouts are generated at the end of each period — your statements appear above once processed. Contact admin for early payout requests.</span>
        </div>
      </div>
    </div>
  );
}
