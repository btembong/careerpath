'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { SkeletonTopbar, SkeletonListRow } from '@/components/ui/Skeleton';
import { Card, IconBox } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { EmptyState } from '@/components/ui/EmptyState';
import { Icon } from '@/components/ui/Icon';
import api from '@/lib/api';

interface Purchase {
  id: string;
  type: 'package' | 'course';
  name: string;
  amount: number | null;
  currency: string | null;
  gateway: string | null;
  invoiceNo: string | null;
  purchasedAt: string;
  expiresAt: string | null;
  status: 'ACTIVE' | 'EXPIRED';
}

function fmtAmount(amount: number, currency: string) {
  return `${currency} ${(amount / 100).toLocaleString()}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function StudentBillingPage() {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    api.get('/payments/me/purchases')
      .then(r => setPurchases(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-4 md:p-6 space-y-6 max-w-3xl w-full mx-auto">
        <div className="grid grid-cols-3 gap-3">
          {[1,2,3].map(i => <div key={i} className="rounded-2xl border border-cloud bg-white h-20 animate-pulse" />)}
        </div>
        <div className="rounded-2xl border border-cloud bg-white overflow-hidden">
          {[1,2,3,4].map(i => <SkeletonListRow key={i} />)}
        </div>
      </div>
    </div>
  );

  const active  = purchases.filter(p => p.status === 'ACTIVE');
  const spendByCurrency = purchases.reduce<Record<string, number>>((acc, p) => {
    if (p.amount && p.currency) acc[p.currency] = (acc[p.currency] ?? 0) + p.amount;
    return acc;
  }, {});
  const spendEntries = Object.entries(spendByCurrency);

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Billing" subtitle="Your purchase history and receipts" />

      <div className="flex-1 p-4 md:p-6 space-y-6 max-w-3xl w-full mx-auto">

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="flex flex-col items-center py-4 px-2 text-center col-span-1">
            <p className="text-2xl font-black text-navy">
              {spendEntries.length === 0 ? '—' : spendEntries.map(([cur, amt]) => fmtAmount(amt, cur)).join(' / ')}
            </p>
            <p className="text-[10px] font-bold text-royal/50 mt-0.5">Total Spent</p>
          </Card>
          <Card className="flex flex-col items-center py-4 px-2 text-center">
            <p className="text-2xl font-black text-navy">{purchases.length}</p>
            <p className="text-[10px] font-bold text-royal/50 mt-0.5">Purchases</p>
          </Card>
          <Card className="flex flex-col items-center py-4 px-2 text-center">
            <p className="text-2xl font-black text-navy">{active.length}</p>
            <p className="text-[10px] font-bold text-royal/50 mt-0.5">Active</p>
          </Card>
        </div>

        {/* Purchase history */}
        {purchases.length === 0 ? (
          <Card>
            <EmptyState
              icon="card"
              title="No purchases yet"
              description="Your payment history will appear here after your first purchase."
              action={{ label: 'Browse packages', href: '/packages' }}
            />
          </Card>
        ) : (
          <div className="space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure px-1">Purchase history</p>
            <Card padding="none" className="divide-y divide-cloud">
              {purchases.map(p => {
                const isActive  = p.status === 'ACTIVE';
                const isPackage = p.type === 'package';
                return (
                  <div key={p.id} className="flex items-center gap-4 px-5 py-4">
                    <IconBox className={isActive ? '' : 'opacity-40'}>
                      <Icon name={isPackage ? 'packages' : 'courses'} size={18} />
                    </IconBox>

                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy truncate">{p.name}</p>
                      <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                        <span className="text-xs text-royal/50">{fmtDate(p.purchasedAt)}</span>
                        {p.gateway && (
                          <Badge variant="muted" className="capitalize">{p.gateway}</Badge>
                        )}
                        {p.invoiceNo && (
                          <span className="text-xs font-mono text-royal/40">{p.invoiceNo}</span>
                        )}
                      </div>
                      {p.expiresAt && (
                        <p className={`text-xs mt-0.5 ${!isActive ? 'text-red-400' : 'text-royal/50'}`}>
                          {isActive ? `Expires ${fmtDate(p.expiresAt)}` : `Expired ${fmtDate(p.expiresAt)}`}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      {p.amount != null && p.currency && (
                        <p className="text-sm font-bold text-navy tabular-nums">
                          {fmtAmount(p.amount, p.currency)}
                        </p>
                      )}
                      <Badge variant={isActive ? 'active' : 'muted'}>
                        {isActive ? 'Active' : 'Expired'}
                      </Badge>
                      <a
                        href={`mailto:billing@careerpathafrica.com?subject=Receipt request — ${p.invoiceNo ?? p.id}`}
                        className="text-[10px] text-azure hover:text-royal transition underline underline-offset-2"
                      >
                        Request receipt
                      </a>
                    </div>
                  </div>
                );
              })}
            </Card>
          </div>
        )}

        {/* Upsell */}
        <Card className="flex items-start gap-4 bg-navy border-0">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-white/10">
            <Icon name="packages" size={18} className="text-azure" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">Ready to unlock more?</p>
            <p className="text-xs text-white/50 mt-0.5 leading-relaxed">
              Browse packages for live classes, mentorship and full course libraries — or buy individual courses with lifetime access.
            </p>
            <div className="flex gap-2 mt-3 flex-wrap">
              <Link href="/packages"
                className="inline-flex items-center gap-1.5 rounded-xl bg-azure px-3.5 py-2 text-xs font-bold text-white hover:bg-royal transition">
                <Icon name="packages" size={12} /> Browse packages
              </Link>
              <Link href="/courses"
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/20 px-3.5 py-2 text-xs font-semibold text-white/70 hover:bg-white/10 transition">
                <Icon name="courses" size={12} /> Individual courses
              </Link>
            </div>
          </div>
        </Card>

        {/* Footer */}
        <p className="text-xs text-royal/40 text-center leading-relaxed">
          Receipts are emailed to you at time of purchase.{' '}
          Contact{' '}
          <a href="mailto:billing@careerpathafrica.com" className="text-azure hover:text-royal transition">
            billing@careerpathafrica.com
          </a>
          {' '}for invoice queries.
        </p>

      </div>
    </div>
  );
}
