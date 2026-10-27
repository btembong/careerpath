'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { spring } from '@/lib/motion';
import api from '@/lib/api';

const SOURCE_LABEL: Record<string, string> = {
  REVIEW_COMMISSION: 'Review commission',
  COURSE_SALE:       'Course sale',
  PAYOUT:            'Payout',
  ADJUSTMENT:        'Adjustment',
};

interface WalletTransaction {
  id: string; type: 'CREDIT' | 'DEBIT'; source?: string;
  amount: number; currency?: string; description?: string | null; createdAt: string;
}
interface WalletData {
  balance: number; currency: string;
  transactions?: WalletTransaction[];
}
interface PayoutRecord {
  id: string; status: string; type?: string;
  amount: number; currency?: string; createdAt: string; updatedAt?: string;
}
interface ReviewQueueItem {
  id: string; courseId?: string; reviewStatus?: string; status?: string;
}

export default function ReviewerWalletPage() {
  const [wallet,  setWallet]  = useState<WalletData | null>(null);
  const [payouts, setPayouts] = useState<PayoutRecord[]>([]);
  const [queue,   setQueue]   = useState<ReviewQueueItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/wallets/me/wallet').catch(() => ({ data: null })),
      api.get('/payouts/me/payouts').catch(() => ({ data: [] })),
      api.get('/reviewer/queue').catch(() => ({ data: [] })),
    ]).then(([wr, pr, qr]) => {
      setWallet(wr.data);
      setPayouts(pr.data ?? []);
      setQueue(qr.data ?? []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-6 max-w-3xl w-full mx-auto">
        <div className="rounded-2xl h-48 animate-pulse bg-navy/20" />
        <div className="grid grid-cols-3 gap-4">
          {[1,2,3].map(i => <div key={i} className="rounded-2xl border border-cloud bg-white h-20 animate-pulse" />)}
        </div>
        <div className="space-y-3">
          {[1,2,3].map(i => <div key={i} className="rounded-2xl border border-cloud bg-white h-14 animate-pulse" />)}
        </div>
      </div>
    </div>
  );

  const balance   = Number(wallet?.balance ?? 0);
  const currency  = wallet?.currency ?? 'USD';
  const pending   = payouts.filter(p => p.status === 'PENDING');
  const paid      = payouts.filter(p => p.status === 'PAID');
  const pendingAmt = pending.reduce((s, p) => s + Number(p.amount ?? 0), 0);
  const paidAmt    = paid.reduce((s, p) => s + Number(p.amount ?? 0), 0);

  const reviewed   = queue.filter(c => c.reviewStatus === 'APPROVED' || c.reviewStatus === 'REJECTED');
  const approvals  = reviewed.filter(c => c.reviewStatus === 'APPROVED').length;
  const rejections = reviewed.filter(c => c.reviewStatus === 'REJECTED').length;

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Earnings" subtitle="Your review commissions and payout history" />

      <div className="flex-1 p-6 space-y-6 max-w-3xl w-full mx-auto">

        {/* Balance hero */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}
          className="relative overflow-hidden rounded-2xl p-6 flex flex-col justify-between min-h-[160px]"
          style={{ background: 'linear-gradient(135deg, #072061 0%, #1e4db7 100%)' }}>
          <div className="pointer-events-none absolute -right-8 -top-8 h-48 w-48 rounded-full border-[24px] border-white/5" />
          <div className="pointer-events-none absolute right-12 bottom-6 h-24 w-24 rounded-full border-[14px] border-white/5" />

          <div className="relative z-10">
            <p className="text-[11px] font-semibold text-white/50 uppercase tracking-widest">Available Balance</p>
            <p className="text-5xl font-black text-white leading-none tracking-tight mt-2">
              {Number(balance).toLocaleString()}
            </p>
            <p className="text-sm text-white/40 mt-1">{currency}</p>
          </div>

          <div className="relative z-10 flex gap-3 mt-4">
            <div className="flex-1 rounded-xl bg-white/10 border border-white/10 px-4 py-3">
              <p className="text-[10px] text-white/40 uppercase tracking-widest">Pending</p>
              <p className="text-base font-black text-white">{currency} {pendingAmt.toLocaleString()}</p>
            </div>
            <div className="flex-1 rounded-xl bg-white/10 border border-white/10 px-4 py-3">
              <p className="text-[10px] text-white/40 uppercase tracking-widest">Total Paid Out</p>
              <p className="text-base font-black text-white">{currency} {paidAmt.toLocaleString()}</p>
            </div>
          </div>
        </motion.div>

        {/* Review stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Reviews done',   value: reviewed.length, icon: 'assignments' as const, accent: 'bg-azure/10 text-azure'  },
            { label: 'Approved',       value: approvals,       icon: 'check'       as const, accent: 'bg-green-100 text-green-600' },
            { label: 'Rejected',       value: rejections,      icon: 'close'       as const, accent: 'bg-red-100 text-red-500'    },
          ].map((s, i) => (
            <motion.div key={s.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, ...spring.smooth }}>
              <Card padding="md">
                <div className="flex items-center gap-3">
                  <span className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${s.accent}`}>
                    <Icon name={s.icon} size={18} />
                  </span>
                  <div>
                    <p className="text-xl font-black text-navy leading-none">{s.value}</p>
                    <p className="text-[10px] font-semibold text-royal/50 mt-0.5">{s.label}</p>
                  </div>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Commission transaction history */}
        {(wallet?.transactions ?? []).length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">COMMISSION HISTORY</p>
            <Card padding="none">
              {(wallet!.transactions ?? []).map((tx, i, arr) => (
                <div key={tx.id} className={`flex items-center gap-4 px-5 py-3.5${i < arr.length - 1 ? ' border-b border-cloud' : ''}`}>
                  <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-xl ${tx.type === 'CREDIT' ? 'bg-azure/10 text-azure' : 'bg-cloud text-royal'}`}>
                    <Icon name={tx.type === 'CREDIT' ? 'check' : 'payouts'} size={15} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy">
                      {SOURCE_LABEL[tx.source ?? ''] ?? tx.source}
                    </p>
                    <p className="text-xs text-royal/40">
                      {new Date(tx.createdAt).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                      {tx.description && ` · ${tx.description}`}
                    </p>
                  </div>
                  <p className={`text-sm font-bold flex-shrink-0 ${tx.type === 'CREDIT' ? 'text-azure' : 'text-red-500'}`}>
                    {tx.type === 'CREDIT' ? '+' : '−'}{tx.currency ?? currency} {Number(tx.amount).toLocaleString()}
                  </p>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Pending payouts */}
        {pending.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">PENDING PAYOUTS</p>
            <Card padding="none">
              {pending.map((p, i, arr) => (
                <div key={p.id} className={`flex items-center gap-4 px-5 py-4${i < arr.length - 1 ? ' border-b border-cloud' : ''}`}>
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-azure/10 text-azure">
                    <Icon name="assignments" size={16} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy">Review commission</p>
                    <p className="text-xs text-royal/50 capitalize mt-0.5">{p.type?.toLowerCase().replace(/_/g, ' ') ?? 'commission'}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-navy">{p.currency ?? currency} {Number(p.amount).toLocaleString()}</p>
                    <p className="text-[10px] text-royal/40">{new Date(p.createdAt).toLocaleDateString()}</p>
                  </div>
                  <Badge variant="muted">Pending</Badge>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Payout history */}
        <div className="space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">PAYOUT HISTORY</p>
          {paid.length === 0 ? (
            <Card padding="lg">
              <EmptyState icon="wallet" title="No payouts yet"
                description="Your commission earnings will appear here once admin generates a payout cycle" />
            </Card>
          ) : (
            <Card padding="none">
              {paid.map((p, i, arr) => (
                <div key={p.id} className={`flex items-center gap-4 px-5 py-4 opacity-80${i < arr.length - 1 ? ' border-b border-cloud' : ''}`}>
                  <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-cloud text-azure">
                    <Icon name="check" size={16} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy">Commission paid</p>
                    <p className="text-xs text-royal/50 mt-0.5">{new Date(p.updatedAt ?? p.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-navy">{p.currency ?? currency} {Number(p.amount).toLocaleString()}</p>
                  </div>
                  <Badge variant="active">Paid</Badge>
                </div>
              ))}
            </Card>
          )}
        </div>

        <p className="text-[11px] text-royal/30 text-center">
          Commission payouts are processed by admin. Contact support if you have questions about your earnings.
        </p>
      </div>
    </div>
  );
}
