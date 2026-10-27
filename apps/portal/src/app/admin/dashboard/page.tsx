'use client';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import Link from 'next/link';
import { notify } from '@/lib/notify';
import { Topbar } from '@/components/layout/Topbar';
import { Card, IconBox } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { SkeletonTopbar, SkeletonCard, SkeletonStat } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { spring } from '@/lib/motion';
import api from '@/lib/api';

interface PendingTeacher {
  id: string;
  email: string;
  teacherApplication?: { subjectAreas?: string[] } | null;
}

interface TopCourse {
  id: string;
  title: string;
  teacher: string;
  enrollments: number;
  completionRate: number;
  coverUrl?: string | null;
}

interface TeacherRevenue {
  id: string;
  name: string;
  balance: number;
  currency: string;
  avatarUrl?: string | null;
}

interface Analytics {
  summary: {
    totalStudents: number;
    totalEnrollments: number;
    recentEnrollments30d: number;
    completionRate: number;
    totalCourses: number;
    totalTeachers: number;
  };
  topCourses: TopCourse[];
  teacherRevenue: TeacherRevenue[];
}

interface BillingStats {
  totalPurchases: number;
  totalRevenue?: number;
  activePackages: number;
  recentPurchases: {
    id: string;
    purchasedAt: string;
    student?: { email: string };
    package?: { name: string; priceAmount: number; currency: string };
  }[];
  salesPerPackage: { packageName: string; count: number; revenue?: number }[];
}

/* ── Mini bar chart (pure CSS) ───────────────────────── */
function BarChart({ data }: { data: { label: string; value: number }[] }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-2 h-28 w-full mt-3">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1 min-w-0">
          <div className="w-full rounded-t-md bg-azure transition-all"
            style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 4 : 0 }} />
          <span className="text-[9px] text-royal/40 truncate w-full text-center">{d.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ── Progress ring (SVG) ─────────────────────────────── */
function ProgressRing({ value, size = 56, stroke = 5 }: { value: number; size?: number; stroke?: number }) {
  const r = (size - stroke * 2) / 2;
  const circ = 2 * Math.PI * r;
  const pct = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : 0;
  const offset = circ - (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#E6ECFD" strokeWidth={stroke} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#5889FA" strokeWidth={stroke}
        strokeDasharray={circ} strokeDashoffset={offset} strokeLinecap="round"
        style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
    </svg>
  );
}

/* ── Stat card ───────────────────────────────────────── */
function StatCard({ label, value, sub, icon, accent = false }: {
  label: string; value: string | number; sub: string;
  icon: React.ReactNode; accent?: boolean;
}) {
  return (
    <Card padding="md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-royal/50 mb-1">{label}</p>
          <p className={`text-2xl font-bold ${accent ? 'text-azure' : 'text-navy'}`}>{value}</p>
          <p className="text-[11px] text-royal/40 mt-0.5">{sub}</p>
        </div>
        <IconBox className="h-10 w-10 rounded-xl flex-shrink-0">{icon}</IconBox>
      </div>
    </Card>
  );
}

export default function AdminDashboard() {
  const [billing,  setBilling]  = useState<BillingStats | null>(null);
  const [pending,  setPending]  = useState<PendingTeacher[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/portals/admin/billing/stats').then(r => setBilling(r.data)).catch(() => {}),
      api.get('/portals/admin/teachers/pending').then(r => setPending(r.data)).catch(() => {}),
      api.get('/portals/admin/analytics').then(r => setAnalytics(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  async function handleApproval(id: string, decision: 'approve' | 'reject') {
    try {
      await api.patch(`/portals/admin/teachers/${id}/approve`, { decision });
      const teacher = pending.find(t => t.id === id);
      notify.success(decision === 'approve' ? 'Teacher approved' : 'Teacher rejected', {
        description: teacher?.email?.split('@')[0],
      });
      setPending(p => p.filter(t => t.id !== id));
    } catch (err: any) {
      notify.error(err?.response?.data?.message ?? 'Action failed');
    }
  }

  if (loading) return (
    <div className="flex flex-col min-h-full">
      <SkeletonTopbar />
      <div className="flex-1 p-6 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <SkeletonStat key={i} />)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <SkeletonCard className="lg:col-span-2" />
          <SkeletonCard />
        </div>
      </div>
    </div>
  );

  // Build bar chart data from salesPerPackage
  const barData = (billing?.salesPerPackage ?? []).slice(0, 6).map(s => ({
    label: (s.packageName ?? 'Package').split(' ')[0],
    value: s.count,
  }));

  // Build revenue by day from recentPurchases
  const dayMap: Record<string, number> = {};
  (billing?.recentPurchases ?? []).forEach(p => {
    const day = new Date(p.purchasedAt).toLocaleDateString('en-US', { weekday: 'short' });
    dayMap[day] = (dayMap[day] ?? 0) + (p.package?.priceAmount ?? 0);
  });
  const revenueData = Object.entries(dayMap).map(([label, value]) => ({ label, value }));

  const completionRate = billing?.totalPurchases
    ? Math.min(100, Math.round(((billing.salesPerPackage?.reduce((a, s) => a + s.count, 0) ?? 0) / billing.totalPurchases) * 100))
    : 0;

  return (
    <div className="flex flex-col min-h-full">
      <Topbar title={`${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}, Admin`} subtitle="Platform overview and management" />

      <div className="flex-1 p-6 space-y-6">

        {/* KPI row */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            <StatCard key="purchases" label="Total Purchases" value={billing?.totalPurchases ?? 0}
              sub="All time enrollments" icon={<Icon name="dollar" size={18} />} accent />,
            <StatCard key="packages" label="Active Packages" value={billing?.activePackages ?? 0}
              sub="Live offerings" icon={<Icon name="packages" size={18} />} />,
            <StatCard key="teachers" label="Pending Teachers" value={pending.length}
              sub="Awaiting approval" icon={<Icon name="mentorship" size={18} />}
              accent={pending.length > 0} />,
            <StatCard key="sold" label="Packages Sold" value={billing?.salesPerPackage?.length ?? 0}
              sub="Distinct packages" icon={<Icon name="reports" size={18} />} />,
          ].map((card, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.06, ...spring.smooth }}
            >
              {card}
            </motion.div>
          ))}
        </div>

        {/* Charts + pending row */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Revenue trend (bar chart) */}
          <Card padding="md" className="lg:col-span-2">
            <div className="flex items-start justify-between mb-1">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Revenue</p>
                <h2 className="text-base font-bold text-navy">Trend by day</h2>
              </div>
              <Link href="/admin/reports"
                className="flex items-center gap-1 text-xs font-semibold text-azure hover:text-royal transition">
                Reports <Icon name="chevronRight" size={12} />
              </Link>
            </div>
            {revenueData.length > 0 ? (
              <BarChart data={revenueData} />
            ) : (
              <div className="h-28 flex flex-col items-center justify-center mt-3 rounded-xl bg-cloud/40">
                <Icon name="reports" size={20} className="text-royal/20 mb-1" />
                <p className="text-xs text-royal/30">No revenue data yet</p>
              </div>
            )}
          </Card>

          {/* Completion ring */}
          <Card padding="md">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-1">Packages</p>
            <h2 className="text-base font-bold text-navy mb-4">Sales breakdown</h2>
            <div className="flex flex-col items-center gap-3">
              <div className="relative">
                <ProgressRing value={completionRate} size={80} stroke={7} />
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-lg font-bold text-navy">{completionRate}%</span>
                </div>
              </div>
              <p className="text-xs text-royal/50 text-center">
                {billing?.salesPerPackage?.reduce((a, s) => a + s.count, 0) ?? 0} total sales
                across {billing?.salesPerPackage?.length ?? 0} packages
              </p>
            </div>
            {(billing?.salesPerPackage?.length ?? 0) > 0 && (
              <div className="mt-4 space-y-2">
                {billing!.salesPerPackage.slice(0, 4).map((s, i) => {
                  const total = billing!.salesPerPackage.reduce((a, x) => a + x.count, 0) || 1;
                  const pct = Math.round((s.count / total) * 100);
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-[11px] text-royal/50 mb-0.5">
                        <span className="truncate max-w-[140px]">{s.packageName}</span>
                        <span className="font-semibold text-navy">{s.count}</span>
                      </div>
                      <div className="h-1.5 rounded-full bg-cloud overflow-hidden">
                        <div className="h-full bg-azure rounded-full" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>

        {/* Package performance + Teacher approvals */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Bar chart — package sales */}
          <Card padding="md" className="lg:col-span-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-azure mb-1">Performance</p>
            <h2 className="text-base font-bold text-navy mb-1">Sales per package</h2>
            {barData.length > 0 ? (
              <BarChart data={barData} />
            ) : (
              <div className="h-28 flex flex-col items-center justify-center mt-3 rounded-xl bg-cloud/40">
                <Icon name="packages" size={20} className="text-royal/20 mb-1" />
                <p className="text-xs text-royal/30">No sales data yet</p>
              </div>
            )}
          </Card>

          {/* Teacher approvals + quick links */}
          <div className="space-y-4">
            <Card padding="none" className="overflow-hidden">
              <div className="px-4 py-3 border-b border-cloud flex items-center justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Approvals</p>
                  <p className="text-sm font-bold text-navy mt-0.5">Pending teachers</p>
                </div>
                {pending.length > 0 && <Badge variant="active">{pending.length}</Badge>}
              </div>
              {pending.length === 0 ? (
                <div className="flex flex-col items-center py-6 text-center">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-azure/10 mb-2">
                    <Icon name="check" size={18} className="text-azure" />
                  </div>
                  <p className="text-sm font-semibold text-navy">All caught up</p>
                  <p className="text-xs text-royal/40 mt-0.5">No pending applications</p>
                </div>
              ) : (
                <div className="divide-y divide-cloud">
                  {pending.slice(0, 3).map(t => (
                    <div key={t.id} className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="h-8 w-8 rounded-full bg-cloud flex items-center justify-center text-sm font-bold text-azure flex-shrink-0">
                          {t.email?.[0]?.toUpperCase() ?? 'T'}
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-navy truncate">{t.email?.split('@')[0]}</p>
                          <p className="text-[10px] text-royal/40 truncate">
                            {t.teacherApplication?.subjectAreas?.slice(0, 2).join(', ') ?? 'Teacher'}
                          </p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" fullWidth onClick={() => handleApproval(t.id, 'approve')}>
                          <Icon name="check" size={12} /> Approve
                        </Button>
                        <Button size="sm" variant="secondary" fullWidth onClick={() => handleApproval(t.id, 'reject')}>
                          <Icon name="close" size={12} /> Reject
                        </Button>
                      </div>
                    </div>
                  ))}
                  {pending.length > 3 && (
                    <Link href="/admin/teachers"
                      className="flex items-center justify-center gap-1 py-3 text-xs font-semibold text-azure hover:text-royal transition">
                      View {pending.length - 3} more <Icon name="chevronRight" size={12} />
                    </Link>
                  )}
                </div>
              )}
            </Card>

            {/* Quick links */}
            <Card padding="none">
              <div className="px-4 py-2.5 border-b border-cloud">
                <p className="text-[10px] font-bold uppercase tracking-widest text-royal/40">Management</p>
              </div>
              {[
                { label: 'Manage packages', icon: 'packages' as const, href: '/admin/packages' },
                { label: 'Revenue reports', icon: 'reports' as const,  href: '/admin/reports' },
                { label: 'Payouts',         icon: 'payouts' as const,  href: '/admin/payouts' },
                { label: 'Country reps',    icon: 'countries' as const, href: '/admin/countries' },
              ].map((item, i, arr) => (
                <Link key={item.label} href={item.href}
                  className={`flex items-center gap-3 px-4 py-3 hover:bg-cloud transition-all${i < arr.length - 1 ? ' border-b border-cloud' : ''}`}>
                  <IconBox className="h-7 w-7 rounded-lg"><Icon name={item.icon} size={14} /></IconBox>
                  <span className="flex-1 text-sm font-medium text-navy">{item.label}</span>
                  <Icon name="chevronRight" size={13} className="text-royal/30" />
                </Link>
              ))}
            </Card>
          </div>
        </div>

        {/* Analytics: summary KPIs from deep analytics */}
        {analytics && (
          <>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="Total Students" value={analytics.summary.totalStudents}
                sub="Registered learners" icon={<Icon name="graduate" size={18} />} />
              <StatCard label="Total Enrollments" value={analytics.summary.totalEnrollments}
                sub={`${analytics.summary.recentEnrollments30d} in last 30 days`} icon={<Icon name="courses" size={18} />} accent />
              <StatCard label="Completion Rate" value={`${analytics.summary.completionRate}%`}
                sub="Courses completed" icon={<Icon name="check" size={18} />} />
              <StatCard label="Published Courses" value={analytics.summary.totalCourses}
                sub={`${analytics.summary.totalTeachers} approved teachers`} icon={<Icon name="notebook" size={18} />} />
            </div>

            {/* Top courses + teacher earnings */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Top courses */}
              <Card padding="none" className="overflow-hidden">
                <div className="px-4 py-3 border-b border-cloud">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Engagement</p>
                  <p className="text-sm font-bold text-navy mt-0.5">Top courses by enrollment</p>
                </div>
                <div className="divide-y divide-cloud">
                  {analytics.topCourses.slice(0, 5).map(c => (
                    <div key={c.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="relative w-10 h-8 rounded-lg overflow-hidden flex-shrink-0 bg-cloud">
                        {c.coverUrl && <img src={c.coverUrl} alt={c.title} className="w-full h-full object-cover" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-navy truncate">{c.title}</p>
                        <p className="text-[10px] text-royal/40">{c.teacher}</p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-navy">{c.enrollments}</p>
                        <p className="text-[10px] text-azure">{c.completionRate}% done</p>
                      </div>
                    </div>
                  ))}
                  {analytics.topCourses.length === 0 && (
                    <p className="text-xs text-royal/40 text-center py-8">No enrollment data yet</p>
                  )}
                </div>
              </Card>

              {/* Teacher earnings */}
              <Card padding="none" className="overflow-hidden">
                <div className="px-4 py-3 border-b border-cloud">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Payouts</p>
                  <p className="text-sm font-bold text-navy mt-0.5">Teacher wallet balances</p>
                </div>
                <div className="divide-y divide-cloud">
                  {analytics.teacherRevenue.slice(0, 5).map(t => (
                    <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                      <div className="relative w-8 h-8 rounded-xl overflow-hidden flex-shrink-0 bg-cloud flex items-center justify-center text-azure font-bold text-sm">
                        {t.avatarUrl ? <img src={t.avatarUrl} alt={t.name} className="w-full h-full object-cover" /> : t.name[0]}
                      </div>
                      <p className="flex-1 text-xs font-semibold text-navy truncate">{t.name}</p>
                      <p className="text-xs font-bold text-navy flex-shrink-0">{t.currency} {(t.balance / 100).toLocaleString()}</p>
                    </div>
                  ))}
                  {analytics.teacherRevenue.length === 0 && (
                    <p className="text-xs text-royal/40 text-center py-8">No earnings recorded yet</p>
                  )}
                </div>
              </Card>
            </div>
          </>
        )}

        {/* Recent purchases table */}
        {(billing?.recentPurchases?.length ?? 0) > 0 && (
          <Card padding="none" className="overflow-hidden">
            <div className="px-4 py-3 border-b border-cloud flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-azure">Activity</p>
                <p className="text-sm font-bold text-navy mt-0.5">Recent purchases</p>
              </div>
              <Link href="/admin/reports" className="flex items-center gap-1 text-xs font-semibold text-azure hover:text-royal transition">
                View all <Icon name="chevronRight" size={12} />
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-cloud bg-cloud/30">
                    {['Student', 'Package', 'Amount', 'Date'].map(h => (
                      <th key={h} className="px-4 py-2.5 text-left text-[10px] font-bold uppercase tracking-widest text-royal/40">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-cloud">
                  {billing!.recentPurchases.slice(0, 8).map(p => (
                    <tr key={p.id} className="hover:bg-cloud/20 transition">
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-7 w-7 rounded-full bg-azure/10 flex items-center justify-center text-xs font-bold text-azure flex-shrink-0">
                            {p.student?.email?.[0]?.toUpperCase() ?? 'S'}
                          </div>
                          <span className="text-sm font-medium text-navy truncate max-w-[160px]">
                            {p.student?.email?.split('@')[0] ?? 'Student'}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-royal/60 truncate max-w-[120px] block">{p.package?.name}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-bold text-navy">
                          {p.package?.currency} {Number(p.package?.priceAmount ?? 0).toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-xs text-royal/40">
                          {new Date(p.purchasedAt ?? Date.now()).toLocaleDateString()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
