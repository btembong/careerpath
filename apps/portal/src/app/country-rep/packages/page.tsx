'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { spring } from '@/lib/motion';
import api from '@/lib/api';

interface Package {
  id: string; name: string; description: string | null;
  priceAmount: number; currency: string;
  courseIds: string[]; validityDays: number | null;
  categoryTags: string[];
  countryId: string | null;
  _count?: { purchases: number };
  totalRevenue?: number;
}
interface CountryInfo {
  id: string; name: string; currency: string; repCommissionPercent: number;
}
interface DashboardData {
  country: CountryInfo;
}

export default function CountryRepPackagesPage() {
  const [packages,  setPackages]  = useState<Package[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/countries/country-rep/dashboard').catch(() => ({ data: null })),
      api.get('/packages').catch(() => ({ data: [] })),
    ]).then(([dash, pkgs]) => {
      setDashboard(dash.data);
      // Filter packages by the rep's country if country is available
      const countryId = dash.data?.country?.id;
      const all: Package[] = pkgs.data ?? [];
      setPackages(countryId ? all.filter(p => !p.countryId || p.countryId === countryId) : all);
    }).finally(() => setLoading(false));
  }, []);

  const country  = (dashboard?.country ?? {}) as Partial<CountryInfo>;
  const currency = country.currency ?? 'USD';

  const filtered = useMemo(() => {
    if (!search.trim()) return packages;
    const q = search.toLowerCase();
    return packages.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.categoryTags?.some(t => t.toLowerCase().includes(q))
    );
  }, [packages, search]);

  // Aggregate stats
  const totalSold = packages.reduce((n, p) => n + (p._count?.purchases ?? 0), 0);
  const totalRevenue = packages.reduce((n, p) => n + (p.totalRevenue ?? (p._count?.purchases ?? 0) * Number(p.priceAmount)), 0);
  const commission = Number(country.repCommissionPercent ?? 10);
  const myEarnings = (totalRevenue * commission) / 100;

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="rounded-2xl border border-cloud bg-white h-24 animate-pulse" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[1,2,3].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex flex-col min-h-full">
      <Topbar
        title="Packages"
        subtitle={`Learning packages${country.name ? ` — ${country.name}` : ''}`}
      />

      <div className="flex-1 p-6 space-y-6">

        {/* Stats strip */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total packages', value: packages.length,          icon: 'packages'  as const, sub: 'available' },
            { label: 'Total sold',     value: totalSold.toLocaleString(), icon: 'graduate' as const, sub: 'enrollments' },
            { label: 'Total revenue',  value: `${currency} ${totalRevenue.toLocaleString()}`, icon: 'wallet' as const, sub: 'gross' },
            { label: 'My earnings',    value: `${currency} ${myEarnings.toLocaleString()}`,   icon: 'certificates' as const, sub: `${commission}% commission` },
          ].map((stat, i) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, ...spring.smooth }}>
              <Card padding="md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">{stat.label}</p>
                    <p className="mt-1 text-lg font-black text-navy leading-tight">{stat.value}</p>
                    <p className="text-xs text-royal/40 mt-0.5">{stat.sub}</p>
                  </div>
                  <IconBox><Icon name={stat.icon} size={16} /></IconBox>
                </div>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Search */}
        <div className="relative max-w-md">
          <Icon name="search" size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-royal/30 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search packages…"
            className="w-full rounded-xl border border-cloud bg-white pl-10 pr-10 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/30"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-royal/30 hover:text-navy transition">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        {/* Package grid */}
        {filtered.length === 0 ? (
          <Card padding="lg">
            <div className="flex flex-col items-center py-12 text-center">
              <Icon name="packages" size={28} className="text-royal/20 mb-2" />
              <p className="text-sm font-semibold text-navy">
                {search ? 'No packages match your search' : 'No packages available'}
              </p>
              {search && (
                <button onClick={() => setSearch('')} className="mt-2 text-xs text-azure hover:text-royal transition">
                  Clear search
                </button>
              )}
            </div>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filtered.map((pkg, i) => {
              const sold    = pkg._count?.purchases ?? null;
              const revenue = pkg.totalRevenue != null
                ? pkg.totalRevenue
                : sold != null ? sold * Number(pkg.priceAmount) : null;
              const earned  = revenue != null ? (revenue * commission) / 100 : null;

              return (
                <motion.div key={pkg.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, ...spring.smooth }}>
                <Card padding="none" className="overflow-hidden flex flex-col h-full">
                  {/* Header */}
                  <div className="bg-navy p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-md bg-azure/20 flex-shrink-0">
                        <Icon name="packages" size={18} className="text-azure" />
                      </div>
                      <span className="text-sm font-black text-white">
                        {pkg.currency} {Number(pkg.priceAmount).toLocaleString()}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-bold text-white leading-snug">{pkg.name}</h3>
                    {pkg.description && (
                      <p className="mt-1 text-xs text-white/40 line-clamp-2">{pkg.description}</p>
                    )}
                  </div>

                  {/* Body */}
                  <div className="flex-1 p-4 space-y-3">

                    {/* Sales + earnings */}
                    {(sold != null || earned != null) && (
                      <div className="grid grid-cols-2 gap-2">
                        {sold != null && (
                          <div className="rounded-lg bg-cloud px-3 py-2 text-center">
                            <p className="text-sm font-black text-navy">{sold.toLocaleString()}</p>
                            <p className="text-[9px] uppercase tracking-widest text-royal/50 mt-0.5">Sold</p>
                          </div>
                        )}
                        {earned != null && (
                          <div className="rounded-lg bg-azure/10 px-3 py-2 text-center">
                            <p className="text-sm font-black text-azure">{pkg.currency} {Math.round(earned).toLocaleString()}</p>
                            <p className="text-[9px] uppercase tracking-widest text-royal/50 mt-0.5">My cut</p>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Meta */}
                    <div className="flex items-center gap-3 text-xs text-royal/60">
                      <span className="flex items-center gap-1">
                        <Icon name="courses" size={11} className="text-azure" />
                        {pkg.courseIds?.length ?? 0} courses
                      </span>
                      {pkg.validityDays && (
                        <span className="flex items-center gap-1">
                          <Icon name="clock" size={11} className="text-azure" />
                          {pkg.validityDays}d
                        </span>
                      )}
                    </div>

                    {/* Tags */}
                    {pkg.categoryTags?.length > 0 && (
                      <div className="flex flex-wrap gap-1">
                        {pkg.categoryTags.slice(0, 3).map(tag => (
                          <span key={tag} className="rounded bg-cloud px-2 py-0.5 text-[10px] font-medium text-royal/60">{tag}</span>
                        ))}
                      </div>
                    )}

                    {/* CTA */}
                    <Link href={`/packages/${pkg.id}`} className="block">
                      <button className="flex w-full items-center justify-center gap-1.5 rounded-md border border-cloud py-2 text-xs font-semibold text-navy hover:bg-cloud transition">
                        View details <Icon name="chevronRight" size={11} />
                      </button>
                    </Link>
                  </div>
                </Card>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
