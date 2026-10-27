'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import type { IconName } from '@/lib/icons';
import { spring } from '@/lib/motion';
import api from '@/lib/api';

const TX_LABEL: Record<string, string> = {
  COURSE_SALE: 'Package sale commission', COUNTRY_BONUS: 'Country bonus',
  REVIEW_COMMISSION: 'Review commission', PAYOUT: 'Payout', ADJUSTMENT: 'Adjustment',
};
const TX_ICON: Record<string, string> = {
  COURSE_SALE: 'dollar', COUNTRY_BONUS: 'star', REVIEW_COMMISSION: 'check',
  PAYOUT: 'payouts', ADJUSTMENT: 'edit',
};

interface WalletTransaction {
  id: string;
  type: 'CREDIT' | 'DEBIT';
  source?: string;
  amount: number;
  description?: string | null;
  createdAt: string;
}
interface WalletData {
  balance: number;
  currency: string;
  transactions?: WalletTransaction[];
}
interface PayoutRecord {
  id: string;
  status: string;
  type?: string;
  amount: number;
  currency: string;
  createdAt: string;
}
interface CountryInfo {
  name: string; currency: string; repCommissionPercent: number;
}
interface DashboardData {
  country: CountryInfo;
  totalRevenue: number;
}

export default function CountryRepWalletPage() {
  const [wallet,    setWallet]    = useState<WalletData | null>(null);
  const [payouts,   setPayouts]   = useState<PayoutRecord[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/wallets/me/wallet').catch(() => ({ data: null })),
      api.get('/payouts/me/payouts').catch(() => ({ data: [] })),
      api.get('/countries/country-rep/dashboard').catch(() => ({ data: null })),
    ]).then(([w, p, d]) => {
      setWallet(w.data);
      setPayouts(p.data ?? []);
      setDashboard(d.data);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-6">
        <div className="rounded-2xl h-48 animate-pulse bg-navy/20" />
        <div className="space-y-3">
          {[1,2,3,4].map(i => <div key={i} className="rounded-2xl border border-cloud bg-white h-16 animate-pulse" />)}
        </div>
      </div>
    </div>
  );

  const country    = (dashboard?.country ?? {}) as Partial<CountryInfo>;
  const currency   = wallet?.currency ?? country.currency ?? 'USD';
  const balance    = Number(wallet?.balance ?? 0);
  const commission = Number(country.repCommissionPercent ?? 10);
  const totalRev   = Number(dashboard?.totalRevenue ?? 0);
  const myEarnings = (totalRev * commission) / 100;

  const txns    = wallet?.transactions ?? [];
  const credits = txns.filter(t => t.type === 'CREDIT').reduce((s, t) => s + Number(t.amount), 0);

  const pendingPayouts = payouts.filter(p => p.status === 'PENDING');
  const paidPayouts    = payouts.filter(p => p.status === 'PAID');
  // Sum paid payout statements — accurate even when wallet transactions exceed the 50-row fetch limit
  const totalPaidOut   = paidPayouts.reduce((s, p) => s + Number(p.amount ?? 0), 0);

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Wallet & Earnings" subtitle="Track your commission and payout history" />

      <div className="flex-1 p-6 space-y-6">

        {/* Balance hero */}
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={spring.smooth}
          className="rounded-2xl overflow-hidden"
          style={{ background: 'linear-gradient(135deg, #072061 0%, #0d2872 50%, #1e4db7 100%)' }}>
          <div className="relative p-6">
            <div className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full border-[20px] border-white/5" />
            <div className="pointer-events-none absolute right-10 bottom-4 h-24 w-24 rounded-full border-[12px] border-white/5" />

            <p className="relative z-10 text-[10px] font-semibold uppercase tracking-widest text-azure mb-1">
              Available Balance
            </p>
            <p className="relative z-10 text-4xl font-black text-white mt-1">
              {currency} {balance.toLocaleString()}
            </p>
            <p className="relative z-10 text-xs text-white/40 mt-2">
              {commission}% commission rate · {country.name ?? 'your country'}
            </p>

            <div className="relative z-10 mt-5 grid grid-cols-3 gap-3">
              {[
                { label: 'Total earned',  value: `${currency} ${myEarnings.toLocaleString()}` },
                { label: 'Total in',      value: `${currency} ${credits.toLocaleString()}` },
                { label: 'Total paid out',value: `${currency} ${totalPaidOut.toLocaleString()}` },
              ].map((s, i) => (
                <motion.div key={s.label} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 + i * 0.06, ...spring.smooth }}
                  className="rounded-xl bg-white/8 border border-white/10 px-3 py-2.5">
                  <p className="text-[10px] text-white/40 font-semibold uppercase tracking-widest">{s.label}</p>
                  <p className="text-sm font-bold text-white mt-0.5">{s.value}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* How commission works */}
        <Card padding="md">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-azure/10">
              <Icon name="trending" size={18} className="text-azure" />
            </div>
            <div>
              <p className="text-sm font-bold text-navy">How your earnings work</p>
              <p className="text-xs text-royal/60 mt-1 leading-relaxed">
                You earn <span className="font-semibold text-azure">{commission}%</span> on every package sold to students in{' '}
                <span className="font-semibold text-navy">{country.name ?? 'your country'}</span>.
                Total country revenue: <span className="font-semibold text-navy">{currency} {totalRev.toLocaleString()}</span> →
                Your share: <span className="font-semibold text-azure">{currency} {myEarnings.toLocaleString()}</span>.
              </p>
            </div>
          </div>
        </Card>

        {/* Pending payouts */}
        {pendingPayouts.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">Pending payouts</p>
            <Card padding="none">
              {pendingPayouts.map((p, i, arr) => (
                <div key={p.id} className={`flex items-center gap-4 px-5 py-4${i < arr.length - 1 ? ' border-b border-cloud' : ''}`}>
                  <IconBox className="h-9 w-9 rounded-xl flex-shrink-0">
                    <Icon name="payouts" size={16} />
                  </IconBox>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy capitalize">
                      {p.type?.replace('_', ' ').toLowerCase() ?? 'Payout'}
                    </p>
                    <p className="text-[10px] text-royal/40">{new Date(p.createdAt).toLocaleDateString('en-GB')}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-navy">{p.currency} {Number(p.amount).toLocaleString()}</p>
                    <Badge variant="muted">Pending</Badge>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Transaction history */}
        {txns.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">Transaction history</p>
            <Card padding="none">
              {txns.map((tx, i, arr) => (
                <div key={tx.id} className={`flex items-center gap-4 px-5 py-4${i < arr.length - 1 ? ' border-b border-cloud' : ''}`}>
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-cloud flex-shrink-0">
                    <Icon name={(TX_ICON[tx.source ?? ''] ?? 'dollar') as IconName} size={15} className="text-azure" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy">
                      {TX_LABEL[tx.source ?? ''] ?? tx.source ?? 'Transaction'}
                    </p>
                    {tx.description && (
                      <p className="text-xs text-royal/50 truncate">{tx.description}</p>
                    )}
                    <p className="text-[10px] text-royal/30 mt-0.5">
                      {new Date(tx.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                  </div>
                  <p className={`text-sm font-bold flex-shrink-0 ${tx.type === 'CREDIT' ? 'text-green-600' : 'text-red-500'}`}>
                    {tx.type === 'CREDIT' ? '+' : '-'}{currency} {Number(tx.amount).toLocaleString()}
                  </p>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Paid payouts */}
        {paidPayouts.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">Completed payouts</p>
            <Card padding="none">
              {paidPayouts.map((p, i, arr) => (
                <div key={p.id} className={`flex items-center gap-4 px-5 py-4 opacity-70${i < arr.length - 1 ? ' border-b border-cloud' : ''}`}>
                  <IconBox className="h-9 w-9 rounded-xl flex-shrink-0">
                    <Icon name="check" size={16} />
                  </IconBox>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy capitalize">
                      {p.type?.replace('_', ' ').toLowerCase() ?? 'Payout'}
                    </p>
                    <p className="text-[10px] text-royal/40">{new Date(p.createdAt).toLocaleDateString('en-GB')}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-sm font-bold text-navy">{p.currency} {Number(p.amount).toLocaleString()}</p>
                    <Badge variant="active">Paid</Badge>
                  </div>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* Empty state */}
        {txns.length === 0 && payouts.length === 0 && (
          <Card padding="lg">
            <EmptyState icon="wallet" title="No transactions yet" description="Earnings will appear here as students enroll in your country" />
          </Card>
        )}

      </div>
    </div>
  );
}
