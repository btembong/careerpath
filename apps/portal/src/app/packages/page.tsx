'use client';
import { useEffect, useMemo, useState, Suspense as _Suspense } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Suspense = _Suspense as any;
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { majorToMinor, minorToMajor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import { KIND_COLOURS, walletMoney } from '@/components/wallet/WalletCharts';
import api from '@/lib/api';

interface Package {
  id: string; name: string; description: string | null;
  priceAmount: number; currency: string;
  courseIds: string[]; validityDays: number | null; categoryTags: string[];
  cohort?: { id: string; name: string } | null;
  mentorship?: string | null;
}
interface Course {
  id: string; title: string; status: string;
  priceAmount: number | null; priceCurrency: string | null; isSoldIndividually: boolean;
  programme: { id: string; name: string; shortName: string | null } | null;
  _count: { modules: number };
}
interface ActivePackage { id: string; expiresAt: string | null }
interface Offers { live: { price: number } | null; mentorship: { price: number; perMonth: number } | null; owned?: boolean; bought?: string[] }

const term = (days: number | null) => {
  if (!days) return 'No time limit';
  const m = Math.round(days / 30.44);
  return m >= 1 && Math.abs(m * 30.44 - days) <= 3 ? `${m} month${m === 1 ? '' : 's'}` : `${days} days`;
};
const ICON = {
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  book: 'M5 4.5A1.5 1.5 0 0 1 6.5 3H19v15H6.5A1.5 1.5 0 0 0 5 19.5zM5 19.5A1.5 1.5 0 0 0 6.5 21H19v-3',
  video: 'M15 10l5-3v10l-5-3M3 6h12v12H3z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  cal: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
};
const Svg = ({ d, size = 15 }: { d: string; size?: number }) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={d} /></svg>;

function PackagesInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [packages, setPackages] = useState<Package[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [mine, setMine] = useState<ActivePackage[]>([]);
  const [offers, setOffers] = useState<Record<string, Offers>>({});
  const [loading, setLoading] = useState(true);
  const [prog, setProgState] = useState(params.get('programme') ?? 'all');
  const [wants, setWants] = useState<{ live?: boolean; ment?: boolean; budget?: boolean }>({});
  const [col, setCol] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get('/packages').then(r => {
        const ps: Package[] = r.data ?? [];
        setPackages(ps);
        // Extras each package offers at checkout (and which the student already has)
        ps.forEach(p => api.get(`/payments/add-ons/package/${p.id}`).then(o => setOffers(x => ({ ...x, [p.id]: o.data }))).catch(() => {}));
      }).catch(() => {}),
      api.get('/platform-courses').then(r => setCourses((r.data ?? []).filter((c: Course) => c.status === 'PUBLISHED'))).catch(() => {}),
      api.get('/auth/me').then(r => setMine(r.data?.activePackages ?? [])).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  function setProg(id: string) {
    setProgState(id);
    const p = new URLSearchParams(params.toString());
    if (id === 'all') p.delete('programme'); else p.set('programme', id);
    router.replace(`${pathname}${p.toString() ? `?${p}` : ''}`, { scroll: false });
  }

  const byId = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses]);
  const programmeOf = (p: Package) => p.courseIds.map(id => byId.get(id)?.programme).find(Boolean) ?? null;

  const programmes = useMemo(() => {
    const m = new Map<string, string>();
    packages.forEach(p => p.courseIds.forEach(id => { const pr = byId.get(id)?.programme; if (pr) m.set(pr.id, pr.shortName ?? pr.name); }));
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [packages, byId]);
  const progColour = (id: string | undefined) => KIND_COLOURS[Math.max(0, programmes.findIndex(p => p[0] === id)) % KIND_COLOURS.length];

  const plans = useMemo(() => packages
    .filter(p => prog === 'all' || p.courseIds.some(id => byId.get(id)?.programme?.id === prog))
    .map(p => {
      const cs = p.courseIds.map(id => byId.get(id)).filter(Boolean) as Course[];
      const allSold = cs.length === p.courseIds.length && cs.length > 0 && cs.every(c => c.isSoldIndividually && c.priceAmount != null && c.priceCurrency === p.currency);
      const separate = allSold ? cs.reduce((s, c) => s + (c.priceAmount ?? 0), 0) : null;
      return { p, cs, saving: separate != null && separate > p.priceAmount ? separate - p.priceAmount : null };
    })
    .sort((a, b) => (b.saving ?? -1) - (a.saving ?? -1) || a.p.priceAmount - b.p.priceAmount), [packages, byId, prog]);

  const bestId = plans.find(x => x.saving != null)?.p.id ?? null;
  const owned = (id: string) => mine.find(m => m.id === id) ?? null;
  const maxSaving = plans.reduce((m, x) => (x.saving && x.saving > m.v ? { v: x.saving, c: x.p.currency } : m), { v: 0, c: 'XAF' });
  // "Under ..." = the middle price, rounded to a tidy figure
  const sorted = [...plans].sort((a, b) => a.p.priceAmount - b.p.priceAmount);
  const mid = sorted[Math.floor(sorted.length / 2)]?.p;
  const step = mid ? (minorToMajor(mid.priceAmount, mid.currency) >= 10000 ? 5000 : 10) : 1;
  const budget = mid ? Math.ceil(minorToMajor(mid.priceAmount, mid.currency) / step) * step : 0;
  const fits = (p: Package) => (!wants.live || !!p.cohort) && (!wants.ment || !!p.mentorship) && (!wants.budget || minorToMajor(p.priceAmount, p.currency) <= budget);
  const anyWant = wants.live || wants.ment || wants.budget;
  const mineHere = packages.filter(p => owned(p.id));
  const highlight = col ?? bestId;
  const chip = (on: boolean) => clsx('h-8 rounded-md border px-3 text-[13px] font-semibold', on ? 'border-[#3F6FE8] bg-accent-soft text-navy' : 'border-line bg-white text-ink2 hover:text-navy');

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/student/catalogue" backLabel="Catalogue" title="Packages" />

      <div className="flex flex-col gap-[18px] p-4 lg:px-7 lg:py-6">
        <section className="keep-light relative flex flex-col gap-3.5 overflow-hidden rounded-xl bg-[#3F6FE8] p-5 text-navy sm:p-7">
          <svg aria-hidden viewBox="0 0 400 200" className="pointer-events-none absolute -bottom-[60px] -right-[30px] h-[210px] w-[420px] opacity-[0.16]"><rect x="40" y="40" width="120" height="120" rx="14" fill="#FFFFFF" /><rect x="180" y="20" width="120" height="120" rx="14" fill="#FFFFFF" /><rect x="110" y="90" width="120" height="120" rx="14" fill="#FFFFFF" /></svg>
          <h1 className="relative max-w-[640px] text-[30px] font-extrabold leading-[1.02] tracking-[-0.03em] sm:text-[44px]">Everything for your exam, <span className="text-[#FFFFFF]">one price</span></h1>
          <p className="relative max-w-[600px] text-[15px] text-[#0B1F55]">A package gives you several courses, and often live classes with a teacher and one-to-one mentoring, for less than buying them one by one.</p>
          <div className="relative flex flex-wrap items-center gap-2.5">
            {programmes.length > 1 && (
              <div role="tablist" aria-label="Programme" className="flex max-w-full gap-0.5 overflow-x-auto rounded-lg bg-[#FFFFFF] p-1">
                {[['all', 'All'] as [string, string], ...programmes].map(([id, l]) => (
                  <button key={id} type="button" role="tab" aria-selected={prog === id} onClick={() => setProg(id)}
                    className={clsx('h-8 flex-shrink-0 rounded-md px-3.5 text-[13px] text-navy', prog === id ? 'bg-[#EAF0FF] font-bold' : 'font-medium')}>{l}</button>
                ))}
              </div>
            )}
            {maxSaving.v > 0 && <span className="inline-flex h-[30px] items-center rounded-md bg-[rgba(255,255,255,0.35)] px-3 text-[12.5px] font-bold">Save up to {walletMoney(maxSaving.v, maxSaving.c)}</span>}
            <span className="inline-flex h-[30px] items-center rounded-md bg-[rgba(255,255,255,0.35)] px-3 text-[12.5px] font-bold">MTN MoMo or Orange Money</span>
          </div>
        </section>

        {mineHere.map(p => {
          const o = offers[p.id], have = owned(p.id)!;
          const add = o?.owned ? (['live', 'mentorship'] as const).find(k => o[k] && !o.bought?.includes(k)) : undefined;
          return (
            <section key={p.id} className="flex flex-wrap items-center gap-3.5 rounded-xl border border-line bg-white px-[18px] py-3.5">
              <span className="inline-flex h-6 items-center rounded bg-[#E6F5EE] px-2 text-xs font-bold text-[#1F6B47]">Yours</span>
              <p className="min-w-0 flex-[1_1_300px] text-sm text-navy"><strong>{p.name}</strong> <span className="text-ink2">{have.expiresAt ? `until ${new Date(have.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'no time limit'}{o?.bought?.length ? ` · ${o.bought.map(b => (b === 'live' ? 'live classes' : 'mentorship')).join(' and ')} added` : ''}</span></p>
              {add && o?.[add] && <Link href={`/packages/${p.id}/checkout?add=${add}`} className="text-[13px] font-bold text-azure-strong hover:underline">Add {add === 'live' ? 'live classes' : 'mentorship'} · {walletMoney(o[add]!.price, p.currency)}</Link>}
              <Link href={`/packages/${p.id}`} className="inline-flex h-[34px] items-center rounded-md border border-line px-3.5 text-[13px] font-bold text-navy hover:bg-subtle">Open</Link>
            </section>
          );
        })}

        {plans.length > 1 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[13.5px] font-bold text-navy">I want</span>
            <button type="button" aria-pressed={!!wants.live} onClick={() => setWants(w => ({ ...w, live: !w.live }))} className={chip(!!wants.live)}>a teacher every week</button>
            <button type="button" aria-pressed={!!wants.ment} onClick={() => setWants(w => ({ ...w, ment: !w.ment }))} className={chip(!!wants.ment)}>one-to-one mentoring</button>
            {mid && <button type="button" aria-pressed={!!wants.budget} onClick={() => setWants(w => ({ ...w, budget: !w.budget }))} className={chip(!!wants.budget)}>to spend under {walletMoney(majorToMinor(budget, mid.currency), mid.currency)}</button>}
            {anyWant && <span className="text-[12.5px] text-muted">{plans.filter(x => fits(x.p)).length} package{plans.filter(x => fits(x.p)).length === 1 ? '' : 's'} fit</span>}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">{[0, 1, 2].map(i => <div key={i} className="h-[460px] animate-pulse rounded-xl border border-line bg-white" />)}</div>
        ) : !plans.length ? (
          <div className="rounded-xl border border-line bg-white p-10 text-center">
            <p className="text-sm font-semibold text-navy">No packages here yet</p>
            <p className="mt-1 text-[13px] text-ink2">You can still buy single courses from the catalogue.</p>
          </div>
        ) : <>
          <div className="flex snap-x gap-4 overflow-x-auto pb-1 sm:grid sm:items-stretch sm:overflow-visible sm:[grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
            {plans.map(({ p, saving }) => {
              const best = p.id === bestId, have = owned(p.id), fit = !anyWant || fits(p), o = offers[p.id];
              const pr = programmeOf(p);
              const months = p.validityDays ? Math.max(1, Math.round(p.validityDays / 30.44)) : null;
              const perMonth = months ? Math.round(minorToMajor(p.priceAmount, p.currency) / months / 50) * 50 : null;
              const inside: [boolean, string, string, string][] = [
                [true, ICON.book, `${p.courseIds.length} course${p.courseIds.length === 1 ? '' : 's'}`, 'Lessons, practice and quizzes · certificates'],
                [!!p.cohort, ICON.video, p.cohort ? 'Live classes' : 'No live classes', p.cohort ? p.cohort.name : o?.live ? `Add them at checkout · ${walletMoney(o.live.price, p.currency)}` : 'Not offered with this package'],
                [!!p.mentorship, ICON.user, p.mentorship ? p.mentorship : 'No mentorship', p.mentorship ? '30 min with a teacher you choose' : o?.mentorship ? `Add it at checkout · ${walletMoney(o.mentorship.price, p.currency)}` : 'Not offered with this package'],
                [true, ICON.cal, p.validityDays ? `${term(p.validityDays)} of access` : 'No time limit', 'From the day you pay'],
              ];
              return (
                <article key={p.id} className={clsx('flex min-w-[280px] snap-start flex-col overflow-hidden rounded-xl border-2 bg-white transition-opacity sm:min-w-0', best ? 'border-[#2F57C9] shadow-[0_12px_28px_rgba(47,87,201,0.16)]' : 'border-line', !fit && 'opacity-40')}>
                  <div className="keep-light flex items-center justify-between gap-2 px-5 py-2.5 text-[#FFFFFF]" style={{ background: best ? '#2F57C9' : progColour(pr?.id) }}>
                    <span className="flex min-w-0 items-center gap-2 text-xs font-bold tracking-[0.04em]"><Svg d={ICON.box} size={16} /><span className="truncate">{pr ? pr.shortName ?? pr.name : 'Package'}</span></span>
                    {(have || best) && <span className="inline-flex h-[22px] items-center rounded bg-[#FFFFFF] px-2 text-[11.5px] font-extrabold text-[#072061]">{have ? 'Yours' : 'Best value'}</span>}
                  </div>
                  <div className="flex flex-1 flex-col gap-3 px-5 pb-5 pt-[18px]">
                    <div>
                      <h2 className="text-xl font-extrabold tracking-[-0.01em] text-navy">{p.name}</h2>
                      <p className="mt-0.5 line-clamp-2 text-[13px] text-muted">{p.description || p.courseIds.map(id => byId.get(id)?.title.split(' · ')[0]).filter(Boolean).slice(0, 4).join(', ')}</p>
                    </div>
                    <div>
                      <p className="text-[32px] font-extrabold leading-none tracking-[-0.02em] text-navy">{walletMoney(p.priceAmount, p.currency)}</p>
                      <p className="mt-1.5 text-[12.5px] text-ink2">{perMonth ? `About ${walletMoney(majorToMinor(perMonth, p.currency), p.currency)} a month` : 'One payment'}{saving != null && <strong className="text-[#1F6B47]"> · saves {walletMoney(saving, p.currency)}</strong>}</p>
                    </div>
                    <ul className="flex flex-col gap-2.5 border-t border-line pt-3">
                      {inside.map(([on, d, t, sub]) => (
                        <li key={t} className="flex items-start gap-2.5">
                          <span className={clsx('flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md', on ? 'bg-accent-soft text-azure-strong' : 'bg-subtle text-muted')}><Svg d={d} /></span>
                          <span className="min-w-0"><span className={clsx('block text-[13.5px] font-bold', on ? 'text-navy' : 'text-muted')}>{t}</span><span className="block text-xs text-muted">{sub}</span></span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-auto flex flex-col gap-1.5 pt-1.5">
                      {have
                        ? <Link href={`/packages/${p.id}`} className="inline-flex h-[42px] items-center justify-center rounded-md border border-line text-sm font-bold text-navy hover:bg-subtle">Open my package</Link>
                        : <Link href={`/packages/${p.id}/checkout`} className={clsx('inline-flex h-[42px] items-center justify-center rounded-md text-sm font-bold', best ? 'bg-azure-strong text-on-accent' : 'border border-[#3F6FE8] text-azure-strong hover:bg-accent-soft')}>Get {p.name}</Link>}
                      <Link href={`/packages/${p.id}`} className="text-center text-[12.5px] font-semibold text-muted hover:text-navy">See what’s inside</Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {plans.length > 1 && (
            <section className="flex flex-col gap-2.5 rounded-xl border border-line bg-white p-4 sm:p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-base font-bold text-navy">Compare</h2><span className="text-[12.5px] text-muted">Tap a package to highlight it</span></div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] border-collapse text-[13.5px]">
                  <thead>
                    <tr>
                      <th className="border-b border-line px-3 py-2.5" />
                      {plans.map(({ p }) => (
                        <th key={p.id} className={clsx('rounded-t-lg border-b border-line px-3 py-2.5 text-center', highlight === p.id && 'bg-accent-soft')}>
                          <button type="button" onClick={() => setCol(p.id)} className="text-[13px] font-extrabold text-navy">{p.name}</button>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {([
                      ['Price', ({ p }) => walletMoney(p.priceAmount, p.currency)],
                      ['Saving vs single courses', ({ p, saving }) => saving != null ? walletMoney(saving, p.currency) : '—'],
                      ['Courses', ({ p }) => String(p.courseIds.length)],
                      ['Live classes', ({ p }) => p.cohort ? 'Included' : offers[p.id]?.live ? `+ ${walletMoney(offers[p.id]!.live!.price, p.currency)}` : '—'],
                      ['Mentorship', ({ p }) => p.mentorship ? p.mentorship : offers[p.id]?.mentorship ? `+ ${walletMoney(offers[p.id]!.mentorship!.price, p.currency)}` : '—'],
                      ['Access', ({ p }) => term(p.validityDays)],
                      ['Price per course', ({ p }) => p.courseIds.length ? walletMoney(Math.round(p.priceAmount / p.courseIds.length), p.currency) : '—'],
                      ['Certificates', () => 'Yes'],
                    ] as [string, (x: typeof plans[number]) => string][]).map(([label, get]) => (
                      <tr key={label}>
                        <td className="whitespace-nowrap border-b border-line px-3 py-[11px] text-ink2">{label}</td>
                        {plans.map(x => {
                          const v = get(x);
                          return <td key={x.p.id} className={clsx('border-b border-line px-3 py-[11px] text-center font-bold', v === '—' || v.startsWith('+') ? 'text-muted' : 'text-navy', highlight === x.p.id && 'bg-accent-soft')}>{v}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>}

        <section className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-white px-[18px] py-4">
          <p className="min-w-0 flex-[1_1_300px] text-sm text-ink2"><strong className="text-navy">Only need one subject?</strong> Many courses are sold on their own, and you can add live classes or mentorship to them too.</p>
          <Link href="/student/catalogue" className="inline-flex h-[34px] items-center rounded-md border border-line px-3.5 text-[13px] font-bold text-navy hover:bg-subtle">Browse single courses</Link>
        </section>
      </div>
    </div>
  );
}

export default function PackagesPage() {
  return (
    <Suspense fallback={<div className="m-7 h-64 animate-pulse rounded-xl border border-line bg-white" />}>
      <PackagesInner />
    </Suspense>
  );
}
