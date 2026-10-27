'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import { SkeletonTopbar, SkeletonBalance, SkeletonCard, SkeletonListRow } from '@/components/ui/Skeleton';
import api from '@/lib/api';

interface PurchaseItem {
  id: string;
  type: 'PACKAGE' | 'COURSE';
  label: string;
  amountPaid: number;
  currency: string;
  purchasedAt: string;
  expiresAt: string | null;
}

function formatAmount(amount: number, currency: string) {
  return `${currency} ${(amount / 100).toLocaleString('en', { minimumFractionDigits: 0 })}`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

const HOW_IT_WORKS = [
  { icon: 'card'     as const, title: 'Used at checkout',       desc: 'Wallet balance is automatically applied at checkout before other payment methods.' },
  { icon: 'dollar'   as const, title: 'Earn via referrals',     desc: 'Refer friends and earn wallet credits when they successfully enroll.' },
  { icon: 'packages' as const, title: 'Pay for packages & courses', desc: 'Use your balance toward any package or individual course purchase on the platform.' },
];

interface Me {
  walletBalance?: number; walletCurrency?: string;
  activePackages?: Array<{ id: string; name: string; expiresAt?: string | null }>;
}

export default function StudentWalletPage() {
  const [me,           setMe]           = useState<Me | null>(null);
  const [transactions, setTransactions] = useState<PurchaseItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [expandedTx,   setExpandedTx]   = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/auth/me').catch(() => ({ data: null })),
      api.get('/portals/student/purchase-history').catch(() => ({ data: [] })),
    ]).then(([meRes, txRes]) => {
      setMe(meRes.data);
      setTransactions(txRes.data ?? []);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar back />
      <div className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">
        <SkeletonBalance />
        <div className="grid grid-cols-2 gap-3">
          <SkeletonCard lines={2} />
          <SkeletonCard lines={2} />
        </div>
        <div className="space-y-2">
          <div className="h-2.5 w-32 rounded bg-cloud animate-pulse" />
          <div className="rounded-2xl border border-cloud bg-white shadow-card overflow-hidden">
            {[1,2,3].map(i => <SkeletonListRow key={i} />)}
          </div>
        </div>
      </div>
    </div>
  );

  const balance  = me?.walletBalance ?? 0;
  const currency = me?.walletCurrency ?? 'XAF';
  const packages = me?.activePackages ?? [];

  const totalSpend = transactions.reduce((s, t) => s + t.amountPaid, 0);
  const txCurrency = transactions[0]?.currency ?? currency;

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="My Wallet" subtitle="Balance & spending" backHref="/student/dashboard" backLabel="Dashboard" />

      <div className="flex-1 max-w-2xl w-full mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── Balance card ── */}
        <div
          className="rounded-2xl overflow-hidden shadow-card-md"
          style={{ background: 'linear-gradient(135deg, #072061 0%, #1e4db7 100%)' }}
        >
          <div className="px-6 py-6">
            <p className="text-xs font-medium text-white/60 mb-1">Available balance</p>
            <div className="flex items-end gap-3">
              <p className="text-4xl font-bold text-white tabular-nums leading-none">
                {balance.toLocaleString('en', { minimumFractionDigits: 0 })}
              </p>
              <p className="text-lg font-semibold text-white/60 mb-0.5">{currency}</p>
            </div>
            <p className="text-xs text-white/50 mt-3">
              {packages.length > 0
                ? `${packages.length} active package${packages.length !== 1 ? 's' : ''}`
                : 'No active packages'}
            </p>
          </div>

          {/* Stats bar */}
          <div className="border-t border-white/10 grid grid-cols-2 divide-x divide-white/10 bg-white/5">
            <div className="px-5 py-3">
              <p className="text-sm font-semibold text-white tabular-nums">
                {transactions.length > 0 ? formatAmount(totalSpend, txCurrency) : '—'}
              </p>
              <p className="text-xs text-white/50">total spent</p>
            </div>
            <div className="px-5 py-3">
              <p className="text-sm font-semibold text-white tabular-nums">{transactions.length}</p>
              <p className="text-xs text-white/50">purchases</p>
            </div>
          </div>
        </div>

        {/* ── Action buttons ── */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/packages">
            <Card hover className="flex flex-col items-center gap-2.5 text-center py-4">
              <IconBox><Icon name="packages" size={18} /></IconBox>
              <div>
                <p className="text-sm font-semibold text-navy">Browse packages</p>
                <p className="text-xs text-royal/50 mt-0.5">Spend your balance</p>
              </div>
            </Card>
          </Link>

          <Link href="/student/referrals">
            <Card hover className="flex flex-col items-center gap-2.5 text-center py-4">
              <IconBox><Icon name="mentorship" size={18} /></IconBox>
              <div>
                <p className="text-sm font-semibold text-navy">Refer a friend</p>
                <p className="text-xs text-royal/50 mt-0.5">Earn credits</p>
              </div>
            </Card>
          </Link>
        </div>

        {/* ── Active packages ── */}
        {packages.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure px-1">Active Packages</p>
            <Card padding="none" className="divide-y divide-cloud">
              {packages.map(pkg => (
                <div key={pkg.id} className="flex items-center gap-3 px-4 py-3.5">
                  <IconBox><Icon name="packages" size={16} /></IconBox>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy truncate">{pkg.name}</p>
                    <p className="text-xs text-royal/50 mt-0.5">
                      {pkg.expiresAt
                        ? `Expires ${new Date(pkg.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                        : 'No expiry'}
                    </p>
                  </div>
                  <Badge variant="active">Active</Badge>
                </div>
              ))}
            </Card>
          </div>
        )}

        {/* ── Transaction history ── */}
        <div className="space-y-2">
          <div className="flex items-center justify-between px-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Purchase history</p>
            {transactions.length > 0 && <Badge>{transactions.length}</Badge>}
          </div>

          {transactions.length === 0 ? (
            <Card>
              <EmptyState
                icon="card"
                title="No purchases yet"
                description="Your spending history will appear here once you purchase a package or course."
                action={{ label: 'Browse packages', href: '/packages' }}
              />
            </Card>
          ) : (
            <Card padding="none" className="divide-y divide-cloud">
              {transactions.map(tx => {
                const isExpanded = expandedTx === tx.id;
                return (
                  <div key={tx.id}>
                    <button
                      onClick={() => setExpandedTx(isExpanded ? null : tx.id)}
                      className="flex items-center gap-3 px-4 py-3.5 w-full text-left hover:bg-cloud/30 transition-colors"
                    >
                      <IconBox>
                        <Icon name={tx.type === 'PACKAGE' ? 'packages' : 'courses'} size={16} />
                      </IconBox>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-navy truncate">{tx.label}</p>
                        <p className="text-xs text-royal/50 mt-0.5">{formatDate(tx.purchasedAt)}</p>
                      </div>
                      <div className="flex-shrink-0 text-right mr-1">
                        <p className="text-sm font-bold text-navy tabular-nums">
                          {formatAmount(tx.amountPaid, tx.currency)}
                        </p>
                        <span className={`text-xs font-medium ${tx.type === 'PACKAGE' ? 'text-azure' : 'text-royal/50'}`}>
                          {tx.type === 'PACKAGE' ? 'Package' : 'Course'}
                        </span>
                      </div>
                      <Icon
                        name="chevronDown" size={14}
                        className={`text-royal/30 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                      />
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
                          <div className="px-4 pb-4 pt-0 ml-12 grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <p className="text-royal/40 mb-0.5">Transaction ID</p>
                              <p className="font-mono text-navy text-[11px]">{tx.id.slice(0, 12)}…</p>
                            </div>
                            <div>
                              <p className="text-royal/40 mb-0.5">Type</p>
                              <Badge variant={tx.type === 'PACKAGE' ? 'info' : 'default'}>
                                {tx.type === 'PACKAGE' ? 'Package' : 'Individual Course'}
                              </Badge>
                            </div>
                            <div>
                              <p className="text-royal/40 mb-0.5">Date</p>
                              <p className="text-navy">{formatDate(tx.purchasedAt)}</p>
                            </div>
                            {tx.expiresAt && (
                              <div>
                                <p className="text-royal/40 mb-0.5">Access until</p>
                                <p className="text-navy">{formatDate(tx.expiresAt)}</p>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </Card>
          )}
        </div>

        {/* ── How it works ── */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-azure px-1">How your wallet works</p>
          <div className="space-y-3">
            {HOW_IT_WORKS.map(item => (
              <Card key={item.title} className="flex items-start gap-4">
                <IconBox className="flex-shrink-0 mt-0.5"><Icon name={item.icon} size={18} /></IconBox>
                <div>
                  <p className="text-sm font-semibold text-navy">{item.title}</p>
                  <p className="text-xs text-royal/50 mt-0.5 leading-relaxed">{item.desc}</p>
                </div>
              </Card>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
