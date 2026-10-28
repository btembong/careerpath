'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Topbar } from '@/components/layout/Topbar';
import { SkeletonTopbar } from '@/components/ui/Skeleton';
import { Icon } from '@/components/ui/Icon';
import { spring } from '@/lib/motion';
import api from '@/lib/api';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, ReferenceLine,
  PieChart, Pie,
} from 'recharts';

// ── Constants ─────────────────────────────────────────────────────────────────
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const PIE_COLORS = ['#072061','#5889FA','#405FAD','#B8C9FD','#93ADFC'];

// ── Types ─────────────────────────────────────────────────────────────────────
interface Country {
  id: string;
  name: string;
  currency: string;
  repCommissionPercent: number;
  perStudentBonus: number;
}
interface Wallet {
  balance: number;
  currency: string;
}
interface Purchase {
  id: string;
  purchasedAt?: string;
  status?: string;
  student?: { email: string; name?: string | null };
  package?: { name: string; priceAmount: number; currency: string };
}
interface DashboardData {
  country: Country;
  wallet: Wallet;
  activeStudents: number;
  totalRevenue: number;
  recentPurchases: Purchase[];
}

// ── Recharts custom tooltip ────────────────────────────────────────────────────
function BarTip({ active, payload, label, currency }: { active?: boolean; payload?: any[]; label?: string; currency: string }) {
  if (!active || !payload?.length) return null;
  const month = new Date().getFullYear();
  return (
    <div className="rounded-xl border border-cloud bg-white p-3 shadow-lg text-[11px] leading-5">
      <p className="font-bold text-navy">{label} {month}</p>
      <p className="text-royal/60">Revenue <span className="font-semibold text-navy">{currency} {Number(payload[0]?.value ?? 0).toLocaleString()}</span></p>
      {payload[1] && <p className="text-royal/60">Payouts <span className="font-semibold text-azure">{currency} {Math.abs(Number(payload[1]?.value ?? 0)).toLocaleString()}</span></p>}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function CountryRepDashboard() {
  const router = useRouter();
  const [data,      setData]      = useState<DashboardData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [statTab,   setStatTab]   = useState<'Revenue'|'Students'>('Revenue');
  const [calcAmt,   setCalcAmt]   = useState('100');
  const [toolMsg,   setToolMsg]   = useState('');
  const [toolReply, setToolReply] = useState('');

  useEffect(() => {
    api.get('/countries/country-rep/dashboard')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex flex-col min-h-full bg-surface">
      <SkeletonTopbar />
      <div className="flex-1 p-5 space-y-4">
        <div className="grid grid-cols-12 gap-4">
          {[3,6,3].map((span, i) => (
            <div key={i} className={`col-span-12 lg:col-span-${span} rounded-2xl bg-white border border-cloud h-48 animate-pulse`} />
          ))}
        </div>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-7 rounded-2xl bg-white border border-cloud h-64 animate-pulse" />
          <div className="col-span-12 lg:col-span-5 rounded-2xl bg-white border border-cloud h-64 animate-pulse" />
        </div>
      </div>
    </div>
  );

  // ── Derived data ─────────────────────────────────────────────────────────
  const country        = data?.country         ?? {} as Country;
  const wallet         = data?.wallet          ?? {} as Wallet;
  const activeStudents = data?.activeStudents  ?? 0;
  const sales          = data?.recentPurchases ?? [];
  const currency   = country.currency ?? 'USD';
  const commission = Number(country.repCommissionPercent ?? 10);
  const totalRev   = Number(data?.totalRevenue ?? 0);
  const myEarnings = (totalRev * commission) / 100;
  const walletBal  = Number(wallet.balance ?? 0);
  const perStudent = Number(country.perStudentBonus ?? 0);

  // Rep score
  const scoreVal   = Math.min(100, 40 + activeStudents * 4 + (commission > 0 ? 20 : 0));
  const scoreLabel = scoreVal >= 80 ? 'Excellent' : scoreVal >= 55 ? 'Good' : 'Growing';

  // Monthly chart
  const byMonth: Record<number,{revenue:number;payouts:number;students:number}> = {};
  sales.forEach(s => {
    const m = new Date(s.purchasedAt ?? Date.now()).getMonth();
    if (!byMonth[m]) byMonth[m] = { revenue: 0, payouts: 0, students: 0 };
    byMonth[m].revenue  += Number(s.package?.priceAmount ?? 0);
    byMonth[m].payouts  -= (Number(s.package?.priceAmount ?? 0) * commission) / 100;
    byMonth[m].students += 1;
  });
  const barData = MONTHS.map((name, i) => ({
    name,
    Revenue:  byMonth[i]?.revenue  ?? 0,
    Payouts:  byMonth[i]?.payouts  ?? 0,
    Students: byMonth[i]?.students ?? 0,
  }));

  // Pie data
  const pkgMap: Record<string,number> = {};
  sales.forEach(s => {
    const k = s.package?.name ?? 'Other';
    pkgMap[k] = (pkgMap[k] ?? 0) + Number(s.package?.priceAmount ?? 0);
  });
  const pieData = Object.entries(pkgMap).map(([name, value]) => ({ name, value }));
  const pieTotal = pieData.reduce((s, d) => s + d.value, 0);
  const studentPieData = (Array.from(new Set(sales.map(s => s.package?.name ?? 'Other'))) as string[]).map(name => ({
    name,
    value: sales.filter(s => (s.package?.name ?? 'Other') === name).length,
  }));

  // Commission calc
  const calcNum = parseFloat(calcAmt) || 0;
  const calcCut = (calcNum * commission) / 100;
  const calcFee = calcNum * 0.01;
  const calcNet = calcCut - calcFee;

  const currentPie      = statTab === 'Revenue' ? pieData  : studentPieData;
  const currentPieTotal = statTab === 'Revenue' ? pieTotal : sales.length;

  function handleToolSend() {
    const q = toolMsg.toLowerCase().trim();
    if (!q) return;
    if (q.includes('revenue') || q.includes('earning')) {
      setToolReply(`Your total revenue is ${currency} ${Number(totalRev).toLocaleString()}. Your commission at ${commission}% is ${currency} ${Number(myEarnings).toLocaleString()}.`);
    } else if (q.includes('student')) {
      router.push('/country-rep/students');
      return;
    } else if (q.includes('payout') || q.includes('collect') || q.includes('wallet')) {
      router.push('/country-rep/wallet');
      return;
    } else if (q.includes('forecast')) {
      const projected = totalRev * 1.15;
      setToolReply(`Based on current trends, your projected revenue next month is ${currency} ${Number(projected).toLocaleString()} (+15%). Your estimated earnings: ${currency} ${Number((projected * commission) / 100).toLocaleString()}.`);
    } else if (q.includes('package')) {
      router.push('/country-rep/packages');
      return;
    } else {
      setToolReply(`You have ${activeStudents} active students, ${currency} ${Number(totalRev).toLocaleString()} total revenue, and ${currency} ${Number(walletBal).toLocaleString()} wallet balance.`);
    }
    setToolMsg('');
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col min-h-full bg-surface">
      <Topbar
        title={`${new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'} — ${country.name ?? 'Home'}`}
        subtitle="Track your country's revenue with real-time insights and recommendations."
      />

      <div className="flex-1 p-5 overflow-auto space-y-4">

        {/* ═══════════════════════════ ROW 1 ═══════════════════════════ */}
        <div className="grid grid-cols-12 gap-4">

          {/* ── Card 1: Total Revenue (hero) ── */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0, ...spring.smooth }}
            className="col-span-12 lg:col-span-3 relative overflow-hidden rounded-2xl min-h-[160px] flex flex-col justify-between p-5"
            style={{ background: 'linear-gradient(135deg, #0a1f5e 0%, #0d2872 40%, #1e4db7 100%)' }}>
            <div className="pointer-events-none absolute -right-10 -top-10 h-52 w-52 rounded-full border-[28px] border-white/5" />
            <div className="pointer-events-none absolute right-8 bottom-8 h-28 w-28 rounded-full border-[16px] border-white/5" />

            <div className="relative z-10 flex items-start justify-between">
              <p className="text-[11px] font-medium text-white/50">Total Revenue</p>
              <button className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20 transition">
                <Icon name="add" size={13} />
              </button>
            </div>

            <div className="relative z-10 my-2">
              <div className="flex items-end gap-2">
                <p className="text-[56px] font-black text-white leading-none tracking-tight">
                  {Number(totalRev).toLocaleString()}
                </p>
                <p className="text-base font-semibold text-white/50 mb-1">{currency}</p>
              </div>
            </div>

            <div className="relative z-10 flex gap-2">
              <button onClick={() => router.push('/country-rep/wallet')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-navy hover:bg-white/90 transition">
                Collect <Icon name="add" size={13} />
              </button>
              <button onClick={() => router.push('/country-rep/wallet')}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-navy/60 border border-white/10 px-4 py-2.5 text-sm font-semibold text-white hover:bg-navy/80 transition">
                Payouts <Icon name="payouts" size={13} />
              </button>
            </div>
          </motion.div>

          {/* ── Card 2: Country Metrics ── */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06, ...spring.smooth }}
            className="col-span-12 lg:col-span-6 rounded-2xl bg-white border border-cloud shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-bold text-navy">Country Metrics</p>
              <button className="flex items-center gap-1 text-[11px] font-semibold text-azure hover:text-royal transition">
                <Icon name="add" size={12} /> Add Metrics
              </button>
            </div>
            <div className="grid grid-cols-4 divide-x divide-cloud">
              {[
                { icon: 'graduate' as const, label: 'Students',   value: String(activeStudents),                               color: '#5889FA' },
                { icon: 'notebook' as const, label: 'Courses',    value: String(sales.length > 0 ? new Set(sales.map(s => s.package?.name)).size : 0), color: '#5889FA' },
                { icon: 'income'   as const, label: 'Commission', value: `${currency} ${Number(myEarnings).toLocaleString()}`, color: '#5889FA' },
                { icon: 'packages' as const, label: 'Packages',   value: String(pieData.length),                               color: '#5889FA' },
              ].map(m => (
                <div key={m.label} className="flex flex-col items-center text-center gap-2 px-3 first:pl-0 last:pr-0">
                  <Icon name={m.icon} size={36} className="text-azure" />
                  <p className="text-[10px] text-royal/50 leading-tight">{m.label}</p>
                  <p className="text-xs font-black text-navy leading-tight">{m.value}</p>
                  <span className="rounded-md bg-azure/10 px-2 py-0.5 text-[9px] font-semibold text-azure">
                    ↑ Active
                  </span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── Card 3: Rep Score ── */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, ...spring.smooth }}
            className="col-span-12 lg:col-span-3 rounded-2xl bg-white border border-cloud shadow-sm p-5 flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-navy">Rep Score</p>
              <button className="text-royal/30 hover:text-navy transition text-lg leading-none">···</button>
            </div>
            <div>
              <p className="text-[10px] font-medium text-royal/40 uppercase tracking-widest mb-2">Performance Quality</p>
              <div className="flex items-center justify-between mb-3">
                <p className="text-2xl font-black text-navy">{scoreLabel}</p>
                <p className="text-2xl font-black text-azure">{scoreVal}%</p>
              </div>
              <div className="h-3 rounded-full overflow-hidden flex">
                <div className="h-full rounded-l-full bg-navy transition-all duration-700" style={{ width: `${scoreVal}%` }} />
                <div className="h-full rounded-r-full flex-1 bg-azure" />
              </div>
            </div>
            <p className="text-[10px] text-royal/40">{activeStudents} student{activeStudents !== 1 ? 's' : ''} · {commission}% rate</p>
          </motion.div>
        </div>

        {/* ═══════════════════════════ ROW 2 ═══════════════════════════ */}
        <div className="grid grid-cols-12 gap-4">

          {/* ── Card 4: Revenue Flow ── */}
          <div className="col-span-12 lg:col-span-7 rounded-2xl bg-white border border-cloud shadow-sm p-5">
            <div className="flex items-start justify-between mb-1">
              <p className="text-sm font-bold text-navy">Revenue Flow</p>
              <button className="flex items-center gap-1.5 rounded-xl border border-cloud bg-[#F5F6FA] px-3 py-1.5 text-[11px] font-semibold text-navy hover:bg-cloud transition">
                This Year <Icon name="chevronDown" size={11} />
              </button>
            </div>

            <div className="flex items-start gap-6 mb-3">
              <div>
                <p className="text-[10px] text-royal/40">Total Balance</p>
                <p className="text-2xl font-black text-navy">{currency} {Number(totalRev).toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-cloud bg-[#F5F6FA] px-3 py-2 text-[10px] leading-5">
                <p className="font-semibold text-navy">{MONTHS[new Date().getMonth()]} {new Date().getFullYear()}</p>
                <p className="text-royal/60">Revenue <span className="font-semibold text-navy">{currency} {(byMonth[new Date().getMonth()]?.revenue ?? 0).toLocaleString()}</span></p>
                <p className="text-royal/60">Payouts <span className="font-semibold text-azure">{currency} {Math.abs(byMonth[new Date().getMonth()]?.payouts ?? 0).toLocaleString()}</span></p>
              </div>
              <div className="ml-auto flex items-center gap-4 text-[11px] text-royal/50 self-start mt-1">
                <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-navy" /> Revenue</span>
                <span className="flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm bg-azure" /> Payouts</span>
              </div>
            </div>

            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={barData} barSize={12} barGap={2} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#405FAD', opacity: 0.5 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#405FAD', opacity: 0.4 }} axisLine={false} tickLine={false} />
                <ReferenceLine y={0} stroke="#E6ECFD" strokeWidth={1} />
                <Tooltip content={<BarTip currency={currency} />} cursor={{ fill: '#E6ECFD44', radius: 6 } as any} />
                <Bar dataKey="Revenue" radius={[4,4,0,0]}>
                  {barData.map((_, i) => (
                    <Cell key={i} fill={i === new Date().getMonth() ? '#072061' : '#B8C9FD'} />
                  ))}
                </Bar>
                <Bar dataKey="Payouts" radius={[0,0,4,4]}>
                  {barData.map((_, i) => (
                    <Cell key={i} fill={i === new Date().getMonth() ? '#5889FA' : '#E6ECFD'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* ── Card 5: Country Tools ── */}
          <div className="col-span-12 lg:col-span-5 rounded-2xl bg-white border border-cloud shadow-sm p-5 flex flex-col">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-navy">Country Tools</p>
              <button className="text-royal/30 hover:text-navy transition text-lg leading-none">···</button>
            </div>

            <div className="flex flex-col items-center pt-1 pb-3">
              <div className="relative mb-3">
                <div className="absolute inset-0 scale-150 rounded-full blur-xl"
                  style={{ background: 'radial-gradient(circle, #5889FA55, #072061aa)' }} />
                <div className="relative h-20 w-20 rounded-full shadow-xl overflow-hidden"
                  style={{ background: 'radial-gradient(circle at 35% 30%, #5889FA, #072061 70%, #0a1f5e)' }}>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Icon name="countries" size={30} className="text-white/90" />
                  </div>
                  <div className="absolute top-2 left-3 h-5 w-5 rounded-full bg-white/20 blur-sm" />
                </div>
              </div>
              <p className="text-sm font-semibold text-navy">What Can I help with?</p>
            </div>

            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {[
                'Show my revenue','Set a payout goal','Forecast earnings',
                'Plan enrollments','View student list','Others',
              ].map(chip => (
                <button key={chip} onClick={() => { setToolMsg(chip); setToolReply(''); }}
                  className="rounded-xl border border-cloud bg-[#F5F6FA] px-2 py-2 text-[10px] font-medium text-royal/70 hover:bg-cloud hover:text-navy transition leading-tight text-center">
                  {chip}
                </button>
              ))}
            </div>

            {toolReply && (
              <div className="mb-2 rounded-xl border border-azure/20 bg-azure/5 px-3 py-2.5 text-xs text-navy leading-relaxed">
                {toolReply}
              </div>
            )}

            <div className="mt-auto rounded-xl border border-cloud bg-[#F5F6FA] p-3">
              <div className="flex items-center gap-2 mb-2.5">
                <Icon name="edit" size={13} className="text-royal/40 flex-shrink-0" />
                <input
                  value={toolMsg}
                  onChange={e => setToolMsg(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleToolSend()}
                  placeholder="Ask anything…"
                  className="flex-1 bg-transparent text-sm text-navy outline-none placeholder:text-royal/40"
                />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button className="flex h-7 w-7 items-center justify-center rounded-lg bg-white border border-cloud text-royal/40 hover:text-azure transition">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="9" y="2" width="6" height="13" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                  </button>
                </div>
                <button onClick={handleToolSend}
                  className="flex items-center gap-1.5 rounded-xl bg-azure px-3 py-1.5 text-xs font-semibold text-white hover:bg-royal transition">
                  <Icon name="arrowRight" size={12} /> Send
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 mt-2">
              <span className="rounded-lg border border-cloud bg-[#F5F6FA] px-2.5 py-1 text-[10px] font-semibold text-royal/50">{country.name ?? 'Country'}</span>
              <button className="flex items-center gap-1 rounded-lg border border-cloud bg-[#F5F6FA] px-2.5 py-1 text-[10px] font-semibold text-royal/50 hover:bg-cloud transition">
                Choose Tool <Icon name="chevronDown" size={9} />
              </button>
            </div>
          </div>
        </div>

        {/* ═══════════════════════════ ROW 3 ═══════════════════════════ */}
        <div className="grid grid-cols-12 gap-4">

          {/* ── Card 6: Recent Enrollments ── */}
          <div className="col-span-12 lg:col-span-5 rounded-2xl bg-white border border-cloud shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4">
              <p className="text-sm font-bold text-navy">Recent Enrollments</p>
              <div className="flex items-center gap-2">
                <button className="flex items-center gap-1.5 rounded-xl border border-cloud bg-[#F5F6FA] px-3 py-1.5 text-[11px] font-semibold text-navy hover:bg-cloud transition">
                  This Month <Icon name="chevronDown" size={11} />
                </button>
                <button className="flex h-7 w-7 items-center justify-center rounded-lg border border-cloud bg-[#F5F6FA] hover:bg-cloud transition">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#405FAD" strokeWidth="2" strokeLinecap="round"><line x1="4" y1="6" x2="20" y2="6"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="11" y1="18" x2="13" y2="18"/></svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-12 gap-1 px-5 py-2 bg-[#F5F6FA]">
              <p className="col-span-5 text-[10px] font-semibold text-royal/40 uppercase tracking-wide flex items-center gap-0.5">Transaction Name <Icon name="chevronDown" size={9} /></p>
              <p className="col-span-3 text-[10px] font-semibold text-royal/40 uppercase tracking-wide flex items-center gap-0.5">Account <Icon name="chevronDown" size={9} /></p>
              <p className="col-span-2 text-[10px] font-semibold text-royal/40 uppercase tracking-wide flex items-center gap-0.5">Date <Icon name="chevronDown" size={9} /></p>
              <p className="col-span-1 text-[10px] font-semibold text-royal/40 uppercase tracking-wide flex items-center gap-0.5">Amt <Icon name="chevronDown" size={9} /></p>
              <p className="col-span-1 text-[10px] font-semibold text-royal/40 uppercase tracking-wide">Status</p>
            </div>

            {sales.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center px-5">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F5F6FA] mb-3">
                  <Icon name="dollar" size={20} className="text-azure" />
                </div>
                <p className="text-sm font-semibold text-navy">No enrollments yet</p>
                <p className="text-xs text-royal/40 mt-1">Sales from {country.name ?? 'your country'} appear here</p>
              </div>
            ) : (
              sales.slice(0, 6).map((s, i, arr) => {
                const isPending = !s.purchasedAt || s.status === 'PENDING';
                const displayName = s.student?.name
                  ? s.student.name
                  : s.student?.email?.split('@')[0] ?? 'Student';
                return (
                  <div key={s.id ?? i} className={`grid grid-cols-12 gap-1 items-center px-5 py-3 hover:bg-[#F5F6FA]/60 transition${i < arr.length - 1 ? ' border-b border-cloud' : ''}`}>
                    <div className="col-span-5 min-w-0">
                      <p className="text-[11px] font-semibold text-navy truncate">{displayName}</p>
                      <p className="text-[10px] text-royal/40 truncate">{s.package?.name ?? 'Package'}</p>
                    </div>
                    <div className="col-span-3 min-w-0 flex items-center gap-1.5">
                      <div className="flex h-5 w-5 items-center justify-center rounded flex-shrink-0"
                        style={{ background: '#E6ECFD' }}>
                        <Icon name="card" size={10} className="text-azure" />
                      </div>
                      <p className="text-[10px] text-royal/60 truncate">{s.package?.currency ?? currency}</p>
                    </div>
                    <div className="col-span-2">
                      <p className="text-[10px] text-royal/60 leading-tight">
                        {s.purchasedAt ? new Date(s.purchasedAt).toLocaleDateString('en-GB',{day:'2-digit',month:'short'}) : '—'}
                      </p>
                      <p className="text-[9px] text-royal/40">
                        {s.purchasedAt ? new Date(s.purchasedAt).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}) : ''}
                      </p>
                    </div>
                    <div className="col-span-1">
                      <p className="text-[11px] font-bold text-navy">+{Number(s.package?.priceAmount ?? 0).toLocaleString()}</p>
                    </div>
                    <div className="col-span-1">
                      <span className={`text-[10px] font-semibold ${isPending ? 'text-amber-500' : 'text-green-500'}`}>
                        {isPending ? 'Pending' : 'Done'}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* ── Card 7: Statistic (donut) ── */}
          <div className="col-span-12 lg:col-span-4 rounded-2xl bg-white border border-cloud shadow-sm p-5">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-navy">Statistic</p>
              <button className="flex items-center gap-1.5 rounded-xl border border-cloud bg-[#F5F6FA] px-3 py-1.5 text-[11px] font-semibold text-navy hover:bg-cloud transition">
                This Month <Icon name="chevronDown" size={11} />
              </button>
            </div>

            <div className="flex border-b border-cloud mb-3">
              {(['Revenue','Students'] as const).map(t => (
                <button key={t} onClick={() => setStatTab(t)}
                  className={`pb-2 px-3 text-xs font-semibold transition-all border-b-2 -mb-px ${
                    statTab === t
                      ? 'border-azure text-navy'
                      : 'border-transparent text-royal/40 hover:text-navy'
                  }`}>
                  {t} ({t === 'Revenue'
                    ? `${currency} ${Number(pieTotal).toLocaleString()}`
                    : sales.length})
                </button>
              ))}
            </div>

            {currentPie.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <Icon name="packages" size={24} className="text-azure mb-2" />
                <p className="text-xs text-royal/40">No data yet</p>
              </div>
            ) : (
              <>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={170}>
                    <PieChart>
                      <Pie
                        data={currentPie}
                        cx="50%" cy="50%"
                        innerRadius={50} outerRadius={78}
                        paddingAngle={2}
                        dataKey="value"
                        startAngle={90} endAngle={-270}
                      >
                        {currentPie.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className="text-[9px] text-royal/40 leading-tight">Total {statTab}</p>
                    <p className="text-base font-black text-navy leading-tight">
                      {statTab === 'Revenue'
                        ? `${currency} ${Number(currentPieTotal).toLocaleString()}`
                        : String(currentPieTotal)}
                    </p>
                  </div>
                </div>

                <div className="space-y-2 mt-1">
                  {currentPie.slice(0, 3).map((d, i) => {
                    const pct = currentPieTotal > 0 ? Math.round((d.value / currentPieTotal) * 100) : 0;
                    return (
                      <div key={d.name} className="flex items-center gap-2 text-[11px]">
                        <span className="w-7 text-center rounded-md px-1 py-0.5 text-[9px] font-bold text-white flex-shrink-0"
                          style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}>
                          {pct}%
                        </span>
                        <span className="h-2 w-2 rounded-full flex-shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="flex-1 text-royal/60 truncate">{d.name}</span>
                        <span className="font-semibold text-navy flex-shrink-0">
                          {statTab === 'Revenue' ? `${currency} ${Number(d.value).toLocaleString()}` : String(d.value)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* ── Card 8: Commission Calculator ── */}
          <div className="col-span-12 lg:col-span-3 rounded-2xl bg-white border border-cloud shadow-sm p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-navy">Commission</p>
              <button className="text-[11px] font-semibold text-azure hover:text-royal transition">Rates</button>
            </div>

            <p className="text-center text-[11px] text-royal/40 font-medium">
              1 Sale → {commission}% yours
            </p>

            <div className="flex items-center gap-2">
              <button className="flex flex-1 items-center justify-between rounded-xl border border-cloud bg-[#F5F6FA] px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-navy">
                  <Icon name="dollar" size={13} className="text-azure" /> {currency}
                </span>
                <Icon name="chevronDown" size={10} className="text-royal/40" />
              </button>
              <button className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-cloud bg-[#F5F6FA] hover:bg-cloud transition">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5889FA" strokeWidth="2.5" strokeLinecap="round"><path d="M7 16V4m0 0L3 8m4-4l4 4"/><path d="M17 8v12m0 0l4-4m-4 4l-4-4"/></svg>
              </button>
              <button className="flex flex-1 items-center justify-between rounded-xl border border-cloud bg-[#F5F6FA] px-3 py-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-navy">
                  <Icon name="wallet" size={13} className="text-royal" /> Mine
                </span>
                <Icon name="chevronDown" size={10} className="text-royal/40" />
              </button>
            </div>

            <div>
              <p className="text-2xl font-black text-navy mb-0.5">
                {currency} {Number(calcNum).toLocaleString()}
              </p>
              <input
                type="number"
                value={calcAmt}
                onChange={e => setCalcAmt(e.target.value)}
                className="w-full rounded-xl border border-cloud bg-[#F5F6FA] px-3 py-2 text-sm text-navy outline-none focus:border-azure transition"
                placeholder="Enter amount"
              />
              <p className="text-[10px] text-royal/40 mt-1">Available: {currency} {Number(totalRev).toLocaleString()}</p>
            </div>

            <div className="grid grid-cols-3 gap-1 rounded-xl border border-cloud bg-[#F5F6FA] p-3">
              {[
                { label: `Commission (${commission}%)`, value: `${currency} ${Number(calcCut).toFixed(2)}` },
                { label: 'Platform (1%)',                value: `${currency} ${Number(calcFee).toFixed(2)}` },
                { label: 'Net earnings',                 value: `${currency} ${Number(calcNet).toFixed(2)}` },
              ].map(row => (
                <div key={row.label} className="text-center">
                  <p className="text-[9px] text-royal/40 leading-tight mb-0.5">{row.label}</p>
                  <p className="text-[11px] font-bold text-navy">{row.value}</p>
                </div>
              ))}
            </div>

            <button onClick={() => router.push('/country-rep/wallet')}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-azure py-3 text-sm font-bold text-white hover:bg-royal transition mt-auto">
              Request Payout
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
