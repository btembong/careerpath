'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Topbar } from '@/components/layout/Topbar';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonTable } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { EmptyState } from '@/components/ui/EmptyState';
import api from '@/lib/api';

interface Country {
  id: string;
  name: string;
  code: string;
  currency: string;
  repCommissionPercent: number | null;
  perStudentBonus: number | null;
  rep: { id: string; email: string } | null;
}

export default function AdminCountryOverviewPage() {
  const [countries, setCountries] = useState<Country[]>([]);
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    api.get('/countries/admin/countries')
      .then(r => setCountries(r.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

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

  const withRep    = countries.filter(c => c.rep);
  const withoutRep = countries.filter(c => !c.rep);

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title="Country Overview" subtitle="Markets, reps, and commission configuration" />

      <div className="flex-1 p-4 md:p-6 space-y-5 max-w-5xl w-full mx-auto">

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'Active markets',  value: countries.length,   color: 'text-navy'    },
            { label: 'With rep',        value: withRep.length,     color: 'text-azure'   },
            { label: 'No rep assigned', value: withoutRep.length,  color: 'text-amber-500' },
          ].map(s => (
            <Card key={s.label} className="flex flex-col items-center py-4 text-center">
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-[10px] font-semibold text-royal/50 mt-0.5">{s.label}</p>
            </Card>
          ))}
        </div>

        {/* Manage link */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-azure">COUNTRIES</p>
            <h2 className="text-base font-bold text-navy">
              {countries.length} market{countries.length !== 1 ? 's' : ''}
            </h2>
          </div>
          <Link href="/admin/countries">
            <Button size="sm">
              <Icon name="settings" size={13} /> Manage countries
            </Button>
          </Link>
        </div>

        {countries.length === 0 ? (
          <Card padding="lg">
            <EmptyState
              icon="countries"
              title="No countries configured"
              description="Add markets to start tracking reps and revenue"
            />
          </Card>
        ) : (
          <Card padding="none">
            <div className="px-5 py-3 border-b border-cloud flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">ALL MARKETS</p>
              <p className="text-[10px] text-royal/30">Click Manage to edit settings</p>
            </div>
            <ul className="divide-y divide-cloud">
              {countries.map(c => (
                <li key={c.id} className="flex items-center gap-4 px-5 py-4">
                  {/* Country badge */}
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-navy">
                    <span className="text-[10px] font-black text-azure uppercase">{c.code}</span>
                  </div>

                  {/* Name + currency */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-navy truncate">{c.name}</p>
                    <p className="text-[11px] text-royal/50 mt-0.5">{c.currency}</p>
                  </div>

                  {/* Commission */}
                  <div className="text-center hidden sm:block flex-shrink-0">
                    <p className="text-sm font-bold text-navy">
                      {c.repCommissionPercent != null ? `${c.repCommissionPercent}%` : '—'}
                    </p>
                    <p className="text-[10px] text-royal/40">Commission</p>
                  </div>

                  {/* Per-student bonus */}
                  <div className="text-center hidden md:block flex-shrink-0">
                    <p className="text-sm font-bold text-navy">
                      {c.perStudentBonus != null ? `${c.perStudentBonus}` : '—'}
                    </p>
                    <p className="text-[10px] text-royal/40">Bonus / student</p>
                  </div>

                  {/* Rep */}
                  <div className="text-right flex-shrink-0 min-w-0 max-w-[140px]">
                    {c.rep ? (
                      <>
                        <p className="text-xs font-semibold text-azure truncate">{c.rep.email}</p>
                        <p className="text-[10px] text-royal/40">Country Rep</p>
                      </>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-600">
                        <Icon name="clock" size={10} /> No rep
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* Callout for unassigned */}
        {withoutRep.length > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <Icon name="clock" size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-700">
                {withoutRep.length} market{withoutRep.length !== 1 ? 's' : ''} without a country rep
              </p>
              <p className="text-xs text-amber-600 mt-0.5">
                {withoutRep.map(c => c.name).join(', ')} — assign reps in{' '}
                <Link href="/admin/countries" className="underline font-semibold">Manage Countries</Link>.
              </p>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
