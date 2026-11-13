'use client';
import Link from 'next/link';
import { clsx } from 'clsx';
import { majorToMinor } from '@cpa/shared';
import { PersonPhoto } from '@/components/ui/PersonPhoto';
import { KIND_COLOURS, KpiTile, MonthStack, SplitBar, walletMoney } from '@/components/wallet/WalletCharts';

export interface CountryInsights {
  period: string; base: string;
  country: { id: string; code: string; name: string; currency: string };
  rep: { name: string; commissionPct: number | null; perStudentBonus: number | null; commission: number; bonus: number; earned: number; owed: number; owedCurrency: string } | null;
  kpis: { students: number; newStudents: number; newStudentsBefore: number; activeStudents: number; teachers: number; teachersWithStudents: number; sales: number; salesCount: number; salesChange: number | null; paidToTeachers: number };
  trends: { students: number[]; sales: number[] };
  months: { label: string; start: string; package: number; course: number; extra: number }[];
  split: { key: string; label: string; amount: number }[] | null;
  teachers: { id: string; name: string; avatarUrl?: string | null; subjects: string[]; courses: number; classes: number; students: number; earned: number | null }[];
  top: { name: string; kind: 'package' | 'course' | 'extra'; count: number; amount: number }[];
  newest: { name: string; joinedAt: string; bought: boolean }[];
}

/** Amounts from the insights API are in major units */
export const majorMoney = (major: number, currency: string) => walletMoney(majorToMinor(major, currency), currency);
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const SPLIT_COLOUR: Record<string, string> = { kept: '#072061', course: KIND_COLOURS[0], class: KIND_COLOURS[1], review: KIND_COLOURS[4], rep: KIND_COLOURS[2] };
const KIND_NAME = { package: 'Package', course: 'Course', extra: 'Extra' };
function when(iso: string) {
  const d = Math.floor((Date.now() - +new Date(iso)) / 86_400_000);
  return d <= 0 ? 'today' : d === 1 ? 'yesterday' : new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/**
 * One country's people and money: the admin's country tab and the rep's own dashboard. The rep sees their
 * own earnings instead of the split of every sale, and teachers' students instead of what they earned.
 */
export function CountryView({ d, forRep, studentsHref, teachersHref }: { d: CountryInsights; forRep?: boolean; studentsHref: string; teachersHref: string }) {
  const cur = d.base, k = d.kpis;
  const m = (v: number) => majorMoney(v, cur);
  const growth = k.newStudentsBefore ? Math.round(((k.newStudents - k.newStudentsBefore) / k.newStudentsBefore) * 100) : null;
  const topMax = Math.max(1, ...d.top.map(t => t.amount));
  const kinds = [{ key: 'package', name: 'Packages' }, { key: 'course', name: 'Courses' }, { key: 'extra', name: 'Extras' }];
  const byMonth = d.months.map(x => ({ package: majorToMinor(x.package, cur), course: majorToMinor(x.course, cur), extra: majorToMinor(x.extra, cur) }));

  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap gap-[18px]">
        {forRep && d.rep ? (
          <section className="keep-light flex min-w-0 flex-[999_1_520px] flex-col gap-2.5 rounded-xl bg-[#3F6FE8] p-5 text-navy sm:px-[26px] sm:py-6">
            <p className="text-[12.5px] font-bold uppercase tracking-[0.08em]">You earned · {d.period.toLowerCase()}</p>
            <p className="text-[38px] font-extrabold leading-none tracking-[-0.03em] sm:text-[46px]"><span className="text-[#FFFFFF]">{m(d.rep.earned)}</span></p>
            <p className="text-sm text-[#0B1F55]">{[d.rep.commissionPct ? `${d.rep.commissionPct}% of ${m(k.sales)} sold in ${d.country.name}` : null, d.rep.perStudentBonus ? `plus ${walletMoney(d.rep.perStudentBonus, cur)} a month for each active student` : null].filter(Boolean).join(', ') || `Sales in ${d.country.name}: ${m(k.sales)}`}</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/country-rep/wallet" className="inline-flex h-[34px] items-center rounded-md bg-[#072061] px-3.5 text-[13px] font-bold text-[#FFFFFF]">Open my wallet</Link>
            </div>
          </section>
        ) : (
          <section className="keep-light flex min-w-0 flex-[999_1_520px] flex-col gap-2.5 rounded-xl bg-[#3F6FE8] p-5 text-navy sm:px-[26px] sm:py-[22px]">
            <p className="text-[12.5px] font-bold uppercase tracking-[0.08em]">{d.country.code} · {d.country.currency} · {d.period}</p>
            <p className="text-[32px] font-extrabold leading-[1.05] tracking-[-0.03em] sm:text-[40px]">{d.country.name} sold <span className="text-[#FFFFFF]">{k.sales ? m(k.sales) : 'nothing yet'}</span></p>
            <p className="text-sm text-[#0B1F55]">{k.students.toLocaleString()} students · {k.newStudents.toLocaleString()} new · {k.teachers} teachers · {k.salesCount} purchase{k.salesCount === 1 ? '' : 's'}</p>
            {k.salesChange != null && <span className="inline-flex h-[30px] items-center self-start rounded-md bg-[#FFFFFF] px-3 text-[12.5px] font-bold">{k.salesChange >= 0 ? '+' : '−'}{Math.abs(k.salesChange)}% on the period before</span>}
          </section>
        )}

        {forRep ? (
          <section className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 rounded-xl border border-line bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Where it came from</p>
            <SplitBar currency={cur} items={[
              { name: 'Commission', how: d.rep?.commissionPct ? `${d.rep.commissionPct}% of every sale in ${d.country.name}` : 'On sales in your country', amount: majorToMinor(d.rep?.commission ?? 0, cur), colour: KIND_COLOURS[0] },
              { name: 'Active-student bonus', how: d.rep?.perStudentBonus ? `${walletMoney(d.rep.perStudentBonus, cur)} a month per active student` : 'Monthly bonus', amount: majorToMinor(d.rep?.bonus ?? 0, cur), colour: KIND_COLOURS[2] },
            ]} />
            <p className="mt-auto text-[12.5px] text-muted">Owed to you now: <strong className="text-navy">{walletMoney(d.rep?.owed ?? 0, d.rep?.owedCurrency ?? cur)}</strong></p>
          </section>
        ) : (
          <section className="flex min-w-0 flex-[1_1_300px] flex-col gap-2.5 rounded-xl border border-line bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.06em] text-muted">Country rep</p>
            {d.rep ? <>
              <div className="flex items-center gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[#1baf7a] font-extrabold text-[#FFFFFF]">{initials(d.rep.name)}</span><div className="min-w-0"><p className="truncate text-[15px] font-bold text-navy">{d.rep.name}</p><p className="mt-px text-[12.5px] text-muted">{[d.rep.commissionPct ? `${d.rep.commissionPct}% of sales` : null, d.rep.perStudentBonus ? `${walletMoney(d.rep.perStudentBonus, cur)} a month per active student` : null].filter(Boolean).join(' · ') || 'No terms set'}</p></div></div>
              <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1.5 text-[13px]"><dt className="text-ink2">Earned this period</dt><dd className="font-bold text-navy">{m(d.rep.earned)}</dd><dt className="text-ink2">Owed now</dt><dd className="font-bold text-navy">{walletMoney(d.rep.owed, d.rep.owedCurrency)}</dd></dl>
              <Link href="/admin/wallets" className="mt-auto text-[13px] font-bold text-azure-strong hover:underline">Open wallets</Link>
            </> : <>
              <p className="text-[13.5px] text-ink2">No rep for {d.country.name} yet.</p>
              <Link href="/admin/countries" className="mt-auto text-[13px] font-bold text-azure-strong hover:underline">Assign a rep</Link>
            </>}
          </section>
        )}
      </div>

      <dl className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4">
        <KpiTile label="Students" value={k.students.toLocaleString()} change={k.newStudents} changeIsPct={false} sub={`${k.newStudents} joined${growth != null ? ` · ${growth >= 0 ? '+' : '−'}${Math.abs(growth)}% on before` : ''}`} series={d.trends.students} />
        <KpiTile label="Active students" value={k.activeStudents.toLocaleString()} change={null} changeIsPct sub="used the portal in the last 30 days" series={d.trends.students.map(() => k.activeStudents)} />
        <KpiTile label="Teachers" value={String(k.teachers)} change={null} changeIsPct={false} sub={`${k.teachersWithStudents} with students`} series={d.trends.students.map(() => k.teachers)} />
        <KpiTile label={forRep ? `Sales in ${d.country.name}` : 'Sales'} value={k.sales ? m(k.sales) : '—'} change={k.salesChange} changeIsPct sub={`${k.salesCount} purchase${k.salesCount === 1 ? '' : 's'}`} series={d.trends.sales} />
      </dl>

      <div className="flex flex-wrap items-start gap-[18px]">
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-3.5 rounded-xl border border-line bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2.5">
            <div><h2 className="text-base font-bold text-navy">Sales {forRep ? `in ${d.country.name} ` : ''}by month</h2><p className="mt-0.5 text-[12.5px] text-muted">{cur === 'XAF' || cur === 'XOF' ? 'FCFA' : cur} · last 6 months · hover a month</p></div>
            <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[12.5px] text-ink2">{kinds.map((x, i) => <li key={x.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: KIND_COLOURS[i] }} />{x.name}</li>)}</ul>
          </div>
          <MonthStack months={d.months.map(x => x.start)} kinds={kinds} byKindMonth={byMonth} currency={cur} />
        </section>
        {d.split ? (
          <section className="flex min-w-0 flex-[1_1_320px] flex-col gap-1 rounded-xl border border-line bg-white p-4 sm:p-5">
            <h2 className="mb-2 text-base font-bold text-navy">Where the money went</h2>
            <SplitBar currency={cur} items={d.split.map(s => ({ name: s.label, amount: majorToMinor(Math.max(0, s.amount), cur), colour: SPLIT_COLOUR[s.key] ?? '#9AA6C2' }))} />
          </section>
        ) : (
          <TopList d={d} topMax={topMax} m={m} title={`Top in ${d.country.name}`} />
        )}
      </div>

      <div className="flex flex-wrap items-start gap-[18px]">
        <section className="min-w-0 flex-[1_1_380px] rounded-xl border border-line bg-white">
          <div className="flex justify-between px-[18px] py-3.5"><h2 className="text-base font-bold text-navy">Teachers in {d.country.name}</h2><Link href={teachersHref} className="text-[13px] font-bold text-azure-strong hover:underline">All teachers</Link></div>
          {!d.teachers.length && <p className="border-t border-line px-[18px] py-6 text-center text-[13px] text-ink2">No approved teachers live here yet.</p>}
          {d.teachers.map((t, i) => (
            <div key={t.id} className="flex items-center gap-3 border-t border-line px-[18px] py-2.5 text-[13.5px]">
              <PersonPhoto src={t.avatarUrl} name={t.name} id={t.id} size={36} />
              <div className="min-w-0 flex-1"><p className="truncate font-bold text-navy">{t.name}</p><p className="mt-px truncate text-xs text-muted">{[t.subjects.join(', '), `${t.courses} course${t.courses === 1 ? '' : 's'}`, t.classes ? `${t.classes} class${t.classes === 1 ? '' : 'es'}` : null].filter(Boolean).join(' · ')}</p></div>
              <strong className="whitespace-nowrap text-navy">{t.earned != null ? m(t.earned) : `${t.students.toLocaleString()} student${t.students === 1 ? '' : 's'}`}</strong>
            </div>
          ))}
        </section>
        {d.split && <TopList d={d} topMax={topMax} m={m} title="Top courses and packages" />}
        <section className="min-w-0 flex-[1_1_320px] rounded-xl border border-line bg-white">
          <div className="flex justify-between px-[18px] py-3.5"><h2 className="text-base font-bold text-navy">Newest students</h2><Link href={studentsHref} className="text-[13px] font-bold text-azure-strong hover:underline">All students</Link></div>
          {!d.newest.length && <p className="border-t border-line px-[18px] py-6 text-center text-[13px] text-ink2">No students here yet.</p>}
          {d.newest.map((s, i) => (
            <div key={i} className="flex items-center gap-2.5 border-t border-line px-[18px] py-2.5 text-[13px]">
              <span className="flex-1 truncate font-semibold text-navy">{s.name}</span>
              <span className="text-muted">{when(s.joinedAt)}</span>
              <span className={clsx('inline-flex h-[22px] items-center whitespace-nowrap rounded-md px-2 text-[11.5px] font-bold', s.bought ? 'bg-[#E6F5EE] text-[#1F6B47]' : 'bg-subtle text-ink2')}>{s.bought ? 'Bought' : 'Signed up'}</span>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
}

function TopList({ d, topMax, m, title }: { d: CountryInsights; topMax: number; m: (v: number) => string; title: string }) {
  return (
    <section className="min-w-0 flex-[1_1_320px] rounded-xl border border-line bg-white">
      <div className="flex justify-between px-[18px] py-3.5"><h2 className="text-base font-bold text-navy">{title}</h2><span className="text-[12.5px] text-muted">by sales · {d.period.toLowerCase()}</span></div>
      {!d.top.length && <p className="border-t border-line px-[18px] py-6 text-center text-[13px] text-ink2">No sales in this period.</p>}
      {d.top.map(t => (
        <div key={t.kind + t.name} className="flex flex-col gap-1.5 border-t border-line px-[18px] py-2.5 text-[13.5px]">
          <div className="flex justify-between gap-2"><span className="min-w-0 truncate font-bold text-navy">{t.name}</span><strong className="whitespace-nowrap text-navy">{m(t.amount)}</strong></div>
          <span className="block h-1.5 rounded-[3px] bg-accent-soft"><span className="block h-1.5 rounded-[3px] bg-[#3F6FE8]" style={{ width: `${Math.round((t.amount / topMax) * 100)}%` }} /></span>
          <span className="text-xs text-muted">{KIND_NAME[t.kind]} · {t.count} {t.kind === 'extra' ? 'added' : 'sold'}</span>
        </div>
      ))}
    </section>
  );
}
