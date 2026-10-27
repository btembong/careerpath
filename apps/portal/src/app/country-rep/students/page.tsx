'use client';
import { useEffect, useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/EmptyState';
import { Badge } from '@/components/ui/Badge';
import { SkeletonTopbar, SkeletonCard } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { Avatar } from '@/components/ui/Avatar';
import { spring } from '@/lib/motion';
import api from '@/lib/api';

interface Student {
  id: string;
  email: string;
  name: string | null;
  enrolledAt: string;
  packageName?: string;
  expiresAt?: string | null;
}

interface CountryInfo {
  name: string; currency: string; code?: string;
}
interface DashboardData {
  country: CountryInfo;
}

export default function CountryRepStudentsPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [students,  setStudents]  = useState<Student[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [search,    setSearch]    = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/countries/country-rep/dashboard').catch(() => ({ data: null })),
      api.get('/countries/country-rep/students').catch(() => ({ data: [] })),
    ]).then(([dash, st]) => {
      setDashboard(dash.data);
      // Flatten students from purchases if dedicated endpoint returns nothing
      const directStudents: Student[] = st.data ?? [];
      if (directStudents.length > 0) {
        setStudents(directStudents);
      } else {
        // Derive from recentPurchases in dashboard
        const purchases: any[] = dash.data?.recentPurchases ?? [];
        setStudents(purchases.map((p: any) => ({
          id: p.id,
          email: p.student?.email ?? p.user?.email ?? '—',
          name: p.student?.name ?? p.student?.firstName
            ? `${p.student.firstName ?? ''} ${p.student.lastName ?? ''}`.trim()
            : (p.user?.name ?? null),
          enrolledAt: p.purchasedAt ?? p.createdAt,
          packageName: p.package?.name,
          expiresAt: p.expiresAt ?? null,
        })));
      }
    }).finally(() => setLoading(false));
  }, []);

  const country  = (dashboard?.country ?? {}) as Partial<CountryInfo>;
  const currency = country.currency ?? 'USD';

  const filtered = useMemo(() => {
    if (!search.trim()) return students;
    const q = search.toLowerCase();
    return students.filter(s =>
      (s.name ?? '').toLowerCase().includes(q) ||
      s.email.toLowerCase().includes(q) ||
      (s.packageName ?? '').toLowerCase().includes(q)
    );
  }, [students, search]);

  // Stats
  const now = Date.now();
  const active  = students.filter(s => !s.expiresAt || new Date(s.expiresAt).getTime() > now).length;
  const expired = students.length - active;

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <div key={i} className="rounded-2xl border border-cloud bg-white h-24 animate-pulse" />)}
        </div>
        <SkeletonCard />
      </div>
    </div>
  );

  function daysLeft(expiresAt: string | null | undefined) {
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - now;
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="flex flex-col min-h-full">
      <Topbar
        title="Students"
        subtitle={`Students in ${country.name ?? 'your country'}`}
      />

      <div className="flex-1 p-6 space-y-6">

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: 'Total students',   value: students.length, icon: 'graduate'     as const, sub: 'all time' },
            { label: 'Active',           value: active,          icon: 'check'        as const, sub: 'enrolled now' },
            { label: 'Expired',          value: expired,         icon: 'clock'        as const, sub: 'access lapsed' },
            { label: 'Country',          value: country.name ?? '—', icon: 'countries' as const, sub: country.code ?? '' },
          ].map((stat, i) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06, ...spring.smooth }}>
              <Card padding="md">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/50">{stat.label}</p>
                    <p className="mt-1 text-2xl font-bold text-navy">{stat.value}</p>
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
          <Icon name="search" size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-royal/40 pointer-events-none" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            className="w-full rounded-xl border border-cloud bg-white pl-9 pr-10 py-2.5 text-sm text-navy outline-none focus:border-azure placeholder:text-royal/30"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-royal/30 hover:text-navy transition">
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        {/* Student list */}
        {filtered.length === 0 ? (
          <Card padding="lg">
            <EmptyState
                icon="graduate"
                title={search ? 'No students match your search' : 'No students yet'}
                description={search ? 'Try a different search term' : 'Students who purchase packages in your country will appear here'}
              />
          </Card>
        ) : (
          <Card padding="none">
            <div className="px-5 py-3 border-b border-cloud flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-royal/40">
                {filtered.length} student{filtered.length !== 1 ? 's' : ''}
              </p>
            </div>
            <ul className="divide-y divide-cloud">
              {filtered.map(student => {
                const days = daysLeft(student.expiresAt);
                const isActive = days === null || days > 0;
                const isExpiring = days !== null && days > 0 && days <= 7;
                return (
                  <li key={student.id} className="flex items-center gap-4 px-5 py-4 hover:bg-cloud/20 transition">
                    <Avatar name={student.name ?? student.email} size="md" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-navy truncate">
                        {student.name ?? student.email}
                      </p>
                      {student.name && (
                        <p className="text-xs text-royal/40 truncate">{student.email}</p>
                      )}
                      {student.packageName && (
                        <p className="text-[10px] text-azure font-semibold mt-0.5">{student.packageName}</p>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                      {isActive ? (
                        <Badge variant="active">Active</Badge>
                      ) : (
                        <Badge variant="default">Expired</Badge>
                      )}
                      {isExpiring && (
                        <span className="text-[10px] font-semibold text-amber-500">
                          Expires in {days}d
                        </span>
                      )}
                      {student.enrolledAt && (
                        <span className="text-[10px] text-royal/30">
                          Joined {new Date(student.enrolledAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

      </div>
    </div>
  );
}
