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
import { Icon, type IconName } from '@/components/ui/Icon';
import { PackageCard, PackageCompare, type ListPkg, type PkgOwned } from '@/components/public/PackageList';

interface Package {
  id: string; name: string; description: string | null;
  priceAmount: number; currency: string;
  courseIds: string[]; validityDays: number | null; categoryTags: string[];
  cohort?: { id: string; name: string } | null;
  mentorship?: string | null;
  bestValue?: boolean;
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
  const [rich, setRich] = useState<Map<string, ListPkg>>(new Map());

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
      api.get('/catalogue/package-list').then(r => setRich(new Map(((r.data ?? []) as ListPkg[]).map(x => [x.id, x])))).catch(() => {}),
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

  // Best value: the one the admin chose; else the biggest saving on buying the courses one by one; failing that, the lowest price per course
  const perCourse = (p: Package) => p.priceAmount / Math.max(1, p.courseIds.length);
  const bestId = plans.find(x => x.p.bestValue)?.p.id
    ?? plans.find(x => x.saving != null)?.p.id
    ?? (plans.length > 1 && new Set(plans.map(x => x.p.currency)).size === 1 ? [...plans].sort((a, b) => perCourse(a.p) - perCourse(b.p))[0].p.id : null);
  const owned = (id: string) => mine.find(m => m.id === id) ?? null;
  const maxSaving = plans.reduce((m, x) => (x.saving && x.saving > m.v ? { v: x.saving, c: x.p.currency } : m), { v: 0, c: 'XAF' });
  // "Under ..." = the middle price, rounded to a tidy figure
  const sorted = [...plans].sort((a, b) => a.p.priceAmount - b.p.priceAmount);
  const mid = sorted[Math.floor(sorted.length / 2)]?.p;
  const step = mid ? (minorToMajor(mid.priceAmount, mid.currency) >= 10000 ? 5000 : 10) : 1;
  const budget = mid ? Math.ceil(minorToMajor(mid.priceAmount, mid.currency) / step) * step : 0;
  const fits = (p: Package) => (!wants.live || !!p.cohort) && (!wants.ment || !!p.mentorship) && (!wants.budget || minorToMajor(p.priceAmount, p.currency) <= budget);
  const anyWant = wants.live || wants.ment || wants.budget;
  const chip = (on: boolean) => clsx('h-8 rounded-md border px-3 text-[13px] font-semibold', on ? 'border-[#3F6FE8] bg-accent-soft text-navy' : 'border-line bg-white text-ink2 hover:text-navy');

  // The public list has what the cards show (teachers, covers, questions, mentoring a month)
  const listed = (x: Package) => rich.get(x.id) ?? null;
  // Theirs first, then the best value, then the rest
  const ordered = [...plans].sort((a, b) => Number(!!owned(b.p.id)) - Number(!!owned(a.p.id)) || Number(b.p.id === bestId) - Number(a.p.id === bestId));
  const ownedOf = (p: Package): PkgOwned | null => {
    const have = owned(p.id);
    if (!have) return null;
    const o = offers[p.id];
    const add = o?.owned ? (['live', 'mentorship'] as const).find(k => o[k] && !o.bought?.includes(k)) : undefined;
    return { until: have.expiresAt, add: add && o?.[add] ? { label: `Add ${add === 'live' ? 'live classes' : 'a mentor'} · ${walletMoney(o[add]!.price, p.currency)}`, href: `/packages/${p.id}/checkout?add=${add}` } : null };
  };
  const cards = ordered.map(x => ({ x, l: listed(x.p) })).filter(c => c.l) as { x: typeof plans[number]; l: ListPkg }[];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Packages" subtitle="Courses, live classes and mentorship together, for less"
        actions={<Link href="/student/catalogue" className="hidden h-9 items-center rounded-md border border-line px-3.5 text-[13px] font-bold text-azure-strong hover:bg-subtle sm:inline-flex">Browse single courses</Link>} />

      <div className="flex flex-col gap-[18px] p-4 lg:px-7 lg:py-6">
        <section className="keep-light grid items-center gap-6 overflow-hidden rounded-[18px] bg-[linear-gradient(120deg,#2F57C9_0%,#3F6FE8_50%,#6B8BFF_100%)] p-5 text-[#FFFFFF] sm:p-7 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="flex min-w-0 flex-col gap-3">
            <h1 className="max-w-[640px] text-[30px] font-extrabold leading-[1.02] tracking-[-0.03em] text-[#FFFFFF] sm:text-[42px]">Everything for your exam, <span className="text-[#072061]">one price.</span></h1>
            <p className="max-w-[600px] text-[15px] text-[#EEF3FF]">Several courses with practice and mocks, for less than buying them one by one. Some come with a mentor or a live class.</p>
            {programmes.length > 1 && (
              <div role="tablist" aria-label="Exam" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap">
                {[['all', 'All'] as [string, string], ...programmes].map(([id, l]) => {
                  const n = id === 'all' ? packages.length : packages.filter(p => p.courseIds.some(c => byId.get(c)?.programme?.id === id)).length;
                  return <button key={id} type="button" role="tab" aria-selected={prog === id} onClick={() => setProg(id)}
                    className={clsx('h-8 flex-shrink-0 rounded-md px-3 text-[13px] font-bold', prog === id ? 'bg-[#FFFFFF] text-[#072061]' : 'bg-[rgba(255,255,255,0.22)] text-[#FFFFFF] hover:bg-[rgba(255,255,255,0.32)]')}>{l} <span className="opacity-65">{n}</span></button>;
                })}
              </div>
            )}
            <div className="flex flex-wrap gap-1.5 text-[12px] font-extrabold text-[#072061]">
              {maxSaving.v > 0 && <span className="inline-flex h-[26px] items-center rounded-md bg-[#FFFFFF] px-2.5 text-[#17703A]">Save up to {walletMoney(maxSaving.v, maxSaving.c)}</span>}
              {['MTN MoMo', 'Orange Money'].map(x => <span key={x} className="inline-flex h-[26px] items-center rounded-md bg-[#FFFFFF] px-2.5">{x}</span>)}
            </div>
          </div>
          <div className="hidden -rotate-2 flex-col gap-2 lg:flex">
            {([['courses', 'Many courses, one price', 'for the whole exam'], ['grade', 'Practice and mocks', 'marked straight away'], ['mentorship', 'A mentor or a class', 'when the package has one']] as [IconName, string, string][]).map(([icon, t, d]) => (
              <div key={t} className="flex items-center gap-2.5 rounded-xl bg-[#FFFFFF] px-3.5 py-3 text-[13.5px] text-[#072061] shadow-[0_14px_30px_rgba(7,32,97,0.22)]">
                <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg bg-[#EAF0FF] text-[#2F57C9]"><Icon name={icon} size={15} /></span><span><b className="block">{t}</b>{d}</span>
              </div>
            ))}
          </div>
        </section>

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
          <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map(i => <div key={i} className="h-[520px] animate-pulse rounded-[18px] border border-line bg-white" />)}</div>
        ) : !cards.length ? (
          <div className="rounded-xl border border-line bg-white p-10 text-center">
            <p className="text-sm font-semibold text-navy">No packages here yet</p>
            <p className="mt-1 text-[13px] text-ink2">You can still buy single courses from the catalogue.</p>
          </div>
        ) : <>
          {cards.length === 1
            ? <PackageCard p={cards[0].l} wide signedIn owned={ownedOf(cards[0].x.p)} />
            : <div className="grid gap-x-5 gap-y-7 md:grid-cols-2 xl:grid-cols-3">{cards.map(({ x, l }) => <PackageCard key={l.id} p={l} signedIn owned={ownedOf(x.p)} dim={anyWant && !fits(x.p)} />)}</div>}

          {cards.filter(c => !owned(c.l.id)).length > 1 && (
            <section>
              <h2 className="mb-1 text-lg font-extrabold text-navy">Compare side by side</h2>
              <p className="mb-3 text-[13px] text-muted">{cards.filter(c => !owned(c.l.id)).length > 4 ? `The first 4 of ${cards.filter(c => !owned(c.l.id)).length}.${programmes.length > 1 ? ' Pick an exam above to compare others.' : ''}` : 'Everything each package includes, in one table.'}</p>
              {/* Only the ones they could still buy, best value first */}
              <PackageCompare list={cards.filter(c => !owned(c.l.id)).slice(0, 4).map(c => c.l)} />
            </section>
          )}
        </>}

        <section className="flex flex-wrap items-center gap-3 rounded-[18px] bg-accent-soft px-[22px] py-5">
          <p className="min-w-0 flex-[1_1_300px] text-sm text-ink2"><b className="block text-[17px] text-navy">Only need one subject?</b>Many courses are sold on their own, and you can add live classes or a mentor to them too.</p>
          <Link href="/student/catalogue" className="inline-flex h-10 items-center gap-1.5 rounded-[9px] bg-azure-strong px-3.5 text-[14px] font-extrabold text-on-accent">Browse courses<Icon name="arrowRight" size={14} /></Link>
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
