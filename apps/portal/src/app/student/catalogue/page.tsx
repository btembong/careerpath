'use client';
import { Suspense as _Suspense, useEffect, useMemo, useState } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Suspense = _Suspense as any;
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { Drawer, DrawerContent, DrawerSection, InfoGrid } from '@/components/ui/Dialog';
import { notify } from '@/lib/notify';
import api from '@/lib/api';
import { CourseCover } from '@/components/courses/CourseCover';
import { PageHero, asideLabel } from '@/components/hero/PageHero';
import { BigCourseCard, CARD_GRID, ROW_GRID, levelKey, type CardCourse, type CardMine } from '@/components/public/course/BigCourseCard';

/** The public course list's extras for a card: cover, teacher photo, level, topics, practice questions */
interface PubCourse { id: string; slug: string; coverUrl: string | null; level?: string | null; topics?: string[]; questions: number; lessons: number; website: boolean; added: string; teacher: { name: string | null; avatarUrl: string | null } | null }
/** A course in the student's library: how far they are */
interface LibCourse { id: string; pct: number; state: 'new' | 'going' | 'done'; next: { id: string; title: string } | null }

interface Programme { id: string; name: string; shortName: string | null }
interface Course {
  id: string; title: string; description: string | null; status: string; createdAt: string;
  priceAmount: number | null; priceCurrency: string | null; isSoldIndividually: boolean; source?: string; coverUrl?: string | null;
  programme: { id: string; name: string; shortName: string | null } | null;
  subject: { id: string; name: string } | null;
  level: { id: string; name: string } | null;
  teacher: { name: string | null; firstName: string | null; lastName: string | null } | null;
  accessMonths: number | null; language: string | null;
  _count: { modules: number; enrollments: number };
}
interface Package {
  id: string; name: string; description: string | null;
  priceAmount: number; currency: string; courseIds: string[];
  validityDays: number | null; categoryTags: string[];
  cohort?: { id: string; name: string } | null;
  mentorship?: string | null;
}
interface Lesson { id: string; title: string; isFree: boolean; durationSecs: number | null }
interface Detail { id: string; hasAccess?: boolean; modules: { id: string; title: string; lessons: Lesson[] }[] }

type PriceFilter = 'any' | 'single' | 'free' | 'package';
type Sort = 'popular' | 'newest' | 'az' | 'price';

const money = (minor: number, cur: string) => `${cur} ${minorToMajor(minor, cur).toLocaleString()}`;
const abbr = (t: string) => t.split(/[\s·—-]+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'C';
const short = (p: { name: string; shortName: string | null }) => p.shortName ?? p.name;
// Whole months when the days are close to one (365 days = 12 months)
const term = (days: number | null) => {
  if (!days) return 'no time limit';
  const m = Math.round(days / 30.44);
  return m >= 1 && Math.abs(m * 30.44 - days) <= 3 ? `${m} month${m === 1 ? '' : 's'}` : `${days} days`;
};
/** Free to join: sold on its own at no charge, or a WordPress course (anyone can enrol) */
const isWebsite = (c: Course) => c.source === 'WORDPRESS' && !c.isSoldIndividually;
const isFree = (c: Course) => (c.isSoldIndividually && !c.priceAmount) || isWebsite(c);
/** The teacher's name — never their email */
const teacherOf = (c: Course) => c.teacher?.name || [c.teacher?.firstName, c.teacher?.lastName].filter(Boolean).join(' ') || null;
const accessText = (m: number | null) => m == null ? 'No time limit' : `${m} month${m === 1 ? '' : 's'}`;

export default function StudentCataloguePage() {
  return (
    <Suspense fallback={<div className="m-7 h-64 rounded-lg border border-line bg-white animate-pulse" />}>
      <Catalogue />
    </Suspense>
  );
}

function Catalogue() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [owned, setOwned] = useState<Set<string>>(new Set());
  const [ownedPkgs, setOwnedPkgs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [subject, setSubject] = useState('all');
  const [price, setPrice] = useState<PriceFilter>('any');
  const [lang, setLang] = useState('all');
  const [sort, setSort] = useState<Sort>('popular');
  const [prog, setProgState] = useState<string>(params.get('tab') ?? '');
  const [openId, setOpenId] = useState<string | null>(null);
  const [starting, setStarting] = useState<string | null>(null);
  const [allSubjects, setAllSubjects] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pub, setPub] = useState<Map<string, PubCourse>>(new Map());
  const [lib, setLib] = useState<LibCourse[]>([]);
  const [level, setLevel] = useState('all');

  function setProg(id: string) {
    setProgState(id);
    const p = new URLSearchParams(params.toString());
    p.set('tab', id);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  useEffect(() => {
    (async () => {
      const me = await api.get('/auth/me').then(r => r.data).catch(() => null);
      const progUrl = me?.countryId ? `/catalogue/programmes?countryId=${encodeURIComponent(me.countryId)}` : '/catalogue/programmes';
      const [pr, cr, pk, cp, pl] = await Promise.all([
        api.get(progUrl).catch(() => ({ data: [] })),
        api.get('/platform-courses').catch(() => ({ data: [] })),
        api.get('/packages').catch(() => ({ data: [] })),
        api.get('/portals/student/course-purchases').catch(() => ({ data: [] })),
        api.get('/catalogue/course-list').catch(() => ({ data: { courses: [] } })),
      ]);
      setPub(new Map(((pl.data?.courses ?? []) as PubCourse[]).map(x => [x.id, x])));
      const lib = await api.get('/portals/student/library').catch(() => ({ data: null }));
      const list: Course[] = (cr.data ?? []).filter((c: Course) => c.status === 'PUBLISHED');
      const pkgs: Package[] = pk.data ?? [];
      const activePkg = new Set<string>((me?.activePackages ?? []).map((p: { id: string }) => p.id));
      const ids = new Set<string>((cp.data ?? []).map((p: { courseId: string }) => p.courseId));
      pkgs.forEach(p => { if (activePkg.has(p.id)) p.courseIds.forEach(id => ids.add(id)); });
      // Free courses they've joined are theirs too: Continue, not Start
      ((lib.data?.courses ?? []) as { id: string }[]).forEach(c => ids.add(c.id));
      setLib((lib.data?.courses ?? []) as LibCourse[]);
      // Only offer programmes that have something to buy
      const withCourses = (pr.data as Programme[] ?? []).filter(p => list.some(c => c.programme?.id === p.id));
      setProgrammes(withCourses); setCourses(list); setPackages(pkgs); setOwned(ids); setOwnedPkgs(activePkg);
      // ?course=<id> opens that course's preview (links from onboarding and elsewhere)
      const deep = params.get('course');
      if (deep && list.some(c => c.id === deep)) setOpenId(deep);
      if (!params.get('tab')) {
        const interest: string[] = me?.programmeInterestIds ?? [];
        setProgState(withCourses.find(p => interest.includes(p.id))?.id ?? 'all');
      }
    })().finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const byId = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses]);
  const progCourses = useMemo(() => courses.filter(c => prog === 'all' || !prog || c.programme?.id === prog), [courses, prog]);
  const progName = prog && prog !== 'all' ? short(programmes.find(p => p.id === prog) ?? { name: 'this programme', shortName: null }) : 'all programmes';

  // What buying a package's courses one by one would cost — only when every course is sold alone in the package's currency
  const separateTotal = (p: Package) => {
    const cs = p.courseIds.map(id => byId.get(id));
    if (!cs.length || cs.some(c => !c || !c.isSoldIndividually || c.priceAmount == null || c.priceCurrency !== p.currency)) return null;
    return cs.reduce((s, c) => s + (c!.priceAmount ?? 0), 0);
  };
  const pkgsFor = (courseId: string) => packages.filter(p => p.courseIds.includes(courseId));

  const progPackages = useMemo(() => {
    const ids = new Set(progCourses.map(c => c.id));
    return packages
      .filter(p => p.courseIds.some(id => ids.has(id)))
      .map(p => { const t = separateTotal(p); return { p, saving: t != null && t > p.priceAmount ? t - p.priceAmount : null }; })
      .sort((a, b) => (b.saving ?? -1) - (a.saving ?? -1));
  }, [packages, progCourses]); // eslint-disable-line react-hooks/exhaustive-deps

  const subjects = useMemo(() => {
    const m = new Map<string, string>();
    progCourses.forEach(c => { if (c.subject) m.set(c.subject.id, c.subject.name); });
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [progCourses]);

  // Only offered when some courses say what language they're taught in
  const languages = useMemo(() => [...new Set(progCourses.map(c => c.language).filter(Boolean) as string[])].sort(), [progCourses]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = progCourses.filter(c =>
      (subject === 'all' || c.subject?.id === subject) &&
      (level === 'all' || levelKey(c.level?.name, c.programme ? short(c.programme) : null) === level) &&
      (lang === 'all' || c.language === lang) &&
      (price === 'any'
        || (price === 'single' && c.isSoldIndividually && !!c.priceAmount)
        || (price === 'free' && isFree(c))
        || (price === 'package' && !c.isSoldIndividually && !isWebsite(c))) &&
      (!q || `${c.title} ${c.subject?.name ?? ''} ${teacherOf(c) ?? ''} ${c.description ?? ''}`.toLowerCase().includes(q)));
    const cmp: Record<Sort, (a: Course, b: Course) => number> = {
      popular: (a, b) => b._count.enrollments - a._count.enrollments,
      newest: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      az: (a, b) => a.title.localeCompare(b.title),
      price: (a, b) => (isFree(a) ? 0 : a.isSoldIndividually ? a.priceAmount ?? 0 : Infinity) - (isFree(b) ? 0 : b.isSoldIndividually ? b.priceAmount ?? 0 : Infinity),
    };
    return [...list].sort(cmp[sort]);
  }, [progCourses, search, subject, lang, price, sort, level]);

  const open = openId ? byId.get(openId) ?? null : null;
  const selectBox = 'h-9 rounded-md border border-line bg-white pl-3 pr-8 text-[13px] text-navy outline-none focus:border-azure';

  // Counts for the filter options, from the courses in the chosen exam
  const priceCount = (p: PriceFilter) => progCourses.filter(c => p === 'free' ? isFree(c) : p === 'single' ? c.isSoldIndividually && !!c.priceAmount : p === 'package' ? pkgsFor(c.id).length > 0 : true).length;
  const subjectCount = (id: string) => progCourses.filter(c => c.subject?.id === id).length;
  const filtered = !!search.trim() || subject !== 'all' || price !== 'any' || lang !== 'all' || level !== 'all';
  const clearAll = () => { setSearch(''); setSubject('all'); setLang('all'); setPrice('any'); setLevel('all'); };
  const freeRow = !filtered ? progCourses.filter(c => isFree(c) && !owned.has(c.id)).sort((a, b) => b._count.enrollments - a._count.enrollments).slice(0, 8) : [];
  const bestPkg = progPackages.find(x => x.saving != null) ?? progPackages[0] ?? null;

  /** Free courses start in one tap: join, then open the first lesson */
  async function start(c: Course) {
    setStarting(c.id);
    try {
      await api.post(isWebsite(c) ? `/platform-courses/${c.id}/enroll` : `/payments/enroll-free/${c.id}`);
      setOwned(s => new Set(s).add(c.id));
      router.push(`/student/learn/${c.id}`);
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not start the course'); setStarting(null); }
  }

  const lvOf = (c: Course) => levelKey(c.level?.name, c.programme ? short(c.programme) : null);
  const levels = ([['o', 'O-Level and WASSCE'], ['a', 'A-Level'], ['prep', 'Test prep']] as [string, string][]).filter(([k]) => progCourses.some(c => lvOf(c) === k));

  /** A catalogue course as the public card, with the extras the public list knows (cover, teacher photo, topics, questions) */
  const toCard = (c: Course): CardCourse => {
    const p = pub.get(c.id);
    const selling = isFree(c) ? 'free' : c.isSoldIndividually && c.priceAmount ? 'paid' : pkgsFor(c.id).length ? 'package' : 'notsale';
    return {
      id: c.id, slug: p?.slug ?? c.id, title: c.title, coverUrl: p?.coverUrl ?? c.coverUrl ?? null,
      exam: c.programme ? short(c.programme) : null, subject: c.subject?.name ?? null, level: c.level?.name ?? p?.level ?? null,
      lessons: p?.lessons ?? 0, questions: p?.questions ?? 0, topics: p?.topics ?? [], website: p?.website ?? false, added: p?.added ?? c.createdAt,
      selling, price: selling === 'paid' ? { amount: c.priceAmount!, currency: c.priceCurrency! } : null, inPackage: pkgsFor(c.id).length > 0,
      teacher: p?.teacher ?? (teacherOf(c) ? { name: teacherOf(c), avatarUrl: null } : null),
    };
  };
  const libById = useMemo(() => new Map(lib.map(l => [l.id, l])), [lib]);
  /** Theirs: progress, the next lesson, and Continue straight into it */
  const mineOf = (c: Course): CardMine | null => {
    if (!owned.has(c.id)) return null;
    const l = libById.get(c.id);
    return { pct: l?.pct ?? 0, next: l?.next?.title ?? null, href: l?.next ? `/student/learn/${c.id}/lesson/${l.next.id}` : `/student/learn/${c.id}` };
  };
  // The package a course is in, by name (not just "In a package"), unless it's already theirs
  const onlyInOf = (c: Course) => !owned.has(c.id) ? pkgsFor(c.id)[0]?.name ?? null : null;
  const Big = ({ c }: { c: Course }) => <BigCourseCard c={toCard(c)} href={`/student/courses/${c.id}`} mine={mineOf(c)} onlyIn={onlyInOf(c)} />;
  // Started courses, most recent first (the library is sorted that way)
  const going = lib.filter(l => l.state === 'going').map(l => byId.get(l.id)).filter(Boolean).slice(0, 4) as Course[];

  const PRICES: [PriceFilter, string][] = [['any', 'Any price'], ['free', 'Free to start'], ['single', 'Buy on its own'], ['package', 'In a package']];
  const filterGroups = (
    <>
      <fieldset className="flex flex-col gap-1">
        <legend className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">Price</legend>
        {PRICES.map(([k, l]) => (
          <label key={k} className="flex cursor-pointer items-center gap-2.5 py-1 text-[13.5px] text-ink2">
            <input type="radio" name="price" checked={price === k} onChange={() => setPrice(k)} className="accent-[var(--color-azure-strong)]" />
            <span className="flex-1">{l}</span><span className="text-xs text-muted">{priceCount(k)}</span>
          </label>
        ))}
      </fieldset>
      {levels.length > 1 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">Level</legend>
          {[['all', 'Any level'] as [string, string], ...levels].map(([k, l]) => (
            <label key={k} className="flex cursor-pointer items-center gap-2.5 py-1 text-[13.5px] text-ink2">
              <input type="radio" name="level" checked={level === k} onChange={() => setLevel(k)} className="accent-[var(--color-azure-strong)]" />
              <span className="flex-1">{l}</span><span className="text-xs text-muted">{k === 'all' ? progCourses.length : progCourses.filter(c => lvOf(c) === k).length}</span>
            </label>
          ))}
        </fieldset>
      )}
      {subjects.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">Subject</legend>
          {[['all', 'All subjects'] as [string, string], ...(allSubjects ? subjects : subjects.slice(0, 6))].map(([id, n]) => (
            <label key={id} className="flex cursor-pointer items-center gap-2.5 py-1 text-[13.5px] text-ink2">
              <input type="radio" name="subject" checked={subject === id} onChange={() => setSubject(id)} className="accent-[var(--color-azure-strong)]" />
              <span className="min-w-0 flex-1 truncate">{n}</span><span className="text-xs text-muted">{id === 'all' ? progCourses.length : subjectCount(id)}</span>
            </label>
          ))}
          {subjects.length > 6 && <button type="button" onClick={() => setAllSubjects(v => !v)} className="self-start py-1 text-[13px] font-semibold text-azure-strong">{allSubjects ? 'Show fewer' : `Show all ${subjects.length}`}</button>}
        </fieldset>
      )}
      {languages.length > 0 && (
        <fieldset className="flex flex-col gap-1">
          <legend className="mb-1.5 text-[11.5px] font-bold uppercase tracking-[0.06em] text-muted">Language</legend>
          {['all', ...languages].map(l => (
            <label key={l} className="flex cursor-pointer items-center gap-2.5 py-1 text-[13.5px] text-ink2">
              <input type="radio" name="lang" checked={lang === l} onChange={() => setLang(l)} className="accent-[var(--color-azure-strong)]" />
              <span className="flex-1">{l === 'all' ? 'Any language' : l}</span><span className="text-xs text-muted">{l === 'all' ? progCourses.length : progCourses.filter(c => c.language === l).length}</span>
            </label>
          ))}
        </fieldset>
      )}
    </>
  );

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Catalogue" subtitle="Courses and packages for your exam" />

      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <PageHero
          kicker={`Catalogue · ${courses.length} course${courses.length === 1 ? '' : 's'}${packages.length ? ` · ${packages.length} package${packages.length === 1 ? '' : 's'}` : ''}`}
          l1={<><span className="text-[#FFFFFF]">Find the course</span><br />for your exam.</>}
          actions={<div className="flex w-full flex-col gap-3">
            <label className="flex h-12 w-full max-w-[640px] items-center gap-2.5 rounded-lg bg-[#FFFFFF] pl-4 pr-2 shadow-[0_10px_24px_rgba(7,32,97,0.18)]">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden className="text-muted"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" /></svg>
              <input type="search" aria-label="Search courses" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search a subject, topic or teacher" className="min-w-0 flex-1 bg-transparent text-[15px] text-navy outline-none placeholder:text-muted" />
              <button type="button" onClick={() => setFiltersOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#072061] px-3 text-[13px] font-bold text-[#FFFFFF] lg:hidden">Filters{filtered ? ' •' : ''}</button>
            </label>
            {programmes.length > 0 && (
              <div role="tablist" aria-label="Exam" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
                {[{ id: 'all', label: 'All exams', n: courses.length }, ...programmes.map(p => ({ id: p.id, label: short(p), n: courses.filter(c => c.programme?.id === p.id).length }))].map(t => {
                  const sel = (prog || 'all') === t.id;
                  return (
                    <button key={t.id} type="button" role="tab" aria-selected={sel} onClick={() => setProg(t.id)}
                      className={clsx('inline-flex h-8 flex-shrink-0 items-center gap-1.5 rounded-md px-3 text-[13px] font-bold', sel ? 'bg-[#FFFFFF] text-navy' : 'bg-[rgba(255,255,255,0.25)] text-navy hover:bg-[rgba(255,255,255,0.4)]')}>
                      {t.label} <span className="font-semibold opacity-70">{t.n}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>}
          asideClassName="hidden lg:flex"
          aside={bestPkg ? <>
            <p className={asideLabel}>Save with a package</p>
            <p className="text-[15px] font-bold leading-snug">{bestPkg.p.name}</p>
            <p className="line-clamp-2 text-xs text-muted">{bestPkg.p.courseIds.map(id => byId.get(id)?.title.split(' · ')[0]).filter(Boolean).slice(0, 3).join(', ')}{bestPkg.p.courseIds.length > 3 ? ` and ${bestPkg.p.courseIds.length - 3} more` : ''}{bestPkg.p.cohort ? ' · live classes' : ''}</p>
            <div className="flex items-center justify-between gap-2">
              <span><b className="text-xl">{money(bestPkg.p.priceAmount, bestPkg.p.currency)}</b>{bestPkg.saving != null && <span className="ml-1.5 text-xs text-muted line-through">{money(bestPkg.p.priceAmount + bestPkg.saving, bestPkg.p.currency)}</span>}</span>
              {bestPkg.saving != null && <span className="inline-flex h-6 items-center rounded-md bg-[#E3F5EC] px-2 text-[11.5px] font-bold text-[#1A7F4B]">Save {Math.round((bestPkg.saving / (bestPkg.p.priceAmount + bestPkg.saving)) * 100)}%</span>}
            </div>
            <Link href={`/packages/${bestPkg.p.id}`} className="inline-flex h-9 items-center justify-center rounded-md bg-azure-strong text-[13px] font-semibold text-on-accent">See the package</Link>
            {progPackages.length > 1 && <Link href="/packages" className="text-center text-xs font-semibold text-azure-strong hover:underline">Compare all {progPackages.length} packages</Link>}
          </> : undefined}
        />

        {loading ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-64 rounded-lg border border-line bg-white animate-pulse" />)}
          </div>
        ) : (
          <div className="flex flex-col gap-7">
              {going.length > 0 && !filtered && (
                <section className="flex flex-col gap-3">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-lg font-extrabold text-navy">Continue where you left off</h2>
                    <Link href="/student/courses" className="ml-auto text-[13px] font-semibold text-azure-strong hover:underline">My courses →</Link>
                  </div>
                  <div className="@container"><div className={ROW_GRID}>{going.map(c => <Big key={c.id} c={c} />)}</div></div>
                </section>
              )}
              {freeRow.length > 0 && !going.length && (
                <section className="flex flex-col gap-3">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-lg font-extrabold text-navy">Free to start</h2>
                    <span className="hidden text-[13px] text-muted sm:inline">Try a whole course before you pay for anything</span>
                    <button type="button" onClick={() => setPrice('free')} className="ml-auto text-[13px] font-semibold text-azure-strong hover:underline">See all {priceCount('free')}</button>
                  </div>
                  <div className="@container"><div className={ROW_GRID}>{freeRow.slice(0, 4).map(c => <Big key={c.id} c={c} />)}</div></div>
                </section>
              )}

          <div className="grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
            <aside aria-label="Filters" className="hidden flex-col gap-5 self-start rounded-2xl border border-line bg-white p-[18px] lg:sticky lg:top-4 lg:flex">{filterGroups}</aside>

            <div className="flex min-w-0 flex-col gap-7">
              <section className="flex flex-col gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-lg font-extrabold text-navy">{filtered ? 'Results' : 'All courses'} ({shown.length})</h2>
                  {price !== 'any' && <button type="button" onClick={() => setPrice('any')} className="inline-flex h-7 items-center gap-1 rounded-md bg-accent-soft px-2.5 text-xs font-semibold text-navy">{PRICES.find(p => p[0] === price)?.[1]} ✕</button>}
                  {subject !== 'all' && <button type="button" onClick={() => setSubject('all')} className="inline-flex h-7 items-center gap-1 rounded-md bg-accent-soft px-2.5 text-xs font-semibold text-navy">{subjects.find(s => s[0] === subject)?.[1]} ✕</button>}
                  {level !== 'all' && <button type="button" onClick={() => setLevel('all')} className="inline-flex h-7 items-center gap-1 rounded-md bg-accent-soft px-2.5 text-xs font-semibold text-navy">{levels.find(l => l[0] === level)?.[1]} ✕</button>}
                  {lang !== 'all' && <button type="button" onClick={() => setLang('all')} className="inline-flex h-7 items-center gap-1 rounded-md bg-accent-soft px-2.5 text-xs font-semibold text-navy">{lang} ✕</button>}
                  <select aria-label="Sort" value={sort} onChange={e => setSort(e.target.value as Sort)} className={clsx(selectBox, 'ml-auto')}>
                    <option value="popular">Most popular</option>
                    <option value="newest">Newest</option>
                    <option value="price">Lowest price</option>
                    <option value="az">A to Z</option>
                  </select>
                </div>
                {!shown.length ? (
                  <div className="rounded-lg border border-line bg-white p-10 text-center">
                    <p className="text-sm font-semibold text-navy">No courses match</p>
                    <p className="mt-1 text-[13px] text-ink2">Try another subject or price, or clear the search.</p>
                    <Button size="sm" variant="secondary" className="mt-4" onClick={clearAll}>Clear filters</Button>
                  </div>
                ) : <>
                  <div className="@container"><div className={CARD_GRID}>{shown.map(c => <Big key={c.id} c={c} />)}</div></div>
                </>}
              </section>
            </div>
          </div>
          </div>
        )}
      </div>

      {/* Phones: the filters in a sheet, with how many courses match before closing */}
      {filtersOpen && (<>
        <button type="button" aria-label="Close filters" onClick={() => setFiltersOpen(false)} className="fixed inset-0 z-[70] bg-navy/45 lg:hidden" />
        <div role="dialog" aria-label="Filters" className="fixed inset-x-0 bottom-0 z-[71] flex max-h-[82dvh] flex-col rounded-t-2xl bg-white shadow-[0_-14px_40px_rgba(7,32,97,0.25)] lg:hidden" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
          <span className="mx-auto mt-2 h-1 w-10 rounded-full bg-line" />
          <div className="flex items-center px-4 pb-2 pt-3"><b className="text-[17px] text-navy">Filters</b><button type="button" onClick={clearAll} className="ml-auto text-[13px] font-semibold text-azure-strong">Clear</button></div>
          <div className="flex flex-col gap-5 overflow-y-auto px-4 pb-3">{filterGroups}</div>
          <div className="border-t border-line p-3"><Button className="h-11 w-full" onClick={() => setFiltersOpen(false)}>Show {shown.length} course{shown.length === 1 ? '' : 's'}</Button></div>
        </div>
      </>)}

      <Drawer open={!!open} onOpenChange={o => { if (!o) setOpenId(null); }}>
        {open && <CoursePreview course={open} packages={pkgsFor(open.id)} owned={owned.has(open.id)} separateTotal={separateTotal}
          onEnrolled={() => setOwned(s => new Set(s).add(open.id))} />}
      </Drawer>
    </div>
  );
}

function CoursePreview({ course, packages, owned, separateTotal, onEnrolled }: {
  course: Course; packages: Package[]; owned: boolean;
  separateTotal: (p: Package) => number | null; onEnrolled: () => void;
}) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [choice, setChoice] = useState<string>(course.isSoldIndividually ? 'course' : packages[0]?.id ?? 'course');
  const [enrolling, setEnrolling] = useState(false);

  useEffect(() => {
    api.get(`/platform-courses/${course.id}`).then(r => setDetail(r.data)).catch(() => setDetail({ id: course.id, modules: [] }));
  }, [course.id]);

  const lessons = detail?.modules.flatMap(m => m.lessons) ?? [];
  const secs = lessons.reduce((s, l) => s + (l.durationSecs ?? 0), 0);
  const firstFree = lessons.find(l => l.isFree);
  const free = isFree(course);
  const sellsAlone = course.isSoldIndividually && !!course.priceAmount && !!course.priceCurrency;
  const coursePrice = sellsAlone ? money(course.priceAmount!, course.priceCurrency!) : null;
  const pkg = packages.find(p => p.id === choice);

  async function enrollFree() {
    setEnrolling(true);
    try {
      // Website courses are joined like any free course; their enrolment is what gives access
      await api.post(isWebsite(course) ? `/platform-courses/${course.id}/enroll` : `/payments/enroll-free/${course.id}`);
      notify.success('You’re enrolled', { description: 'The course is in your library now.' });
      onEnrolled();
    } catch (e: any) {
      notify.error(e?.response?.data?.message ?? 'Could not enrol you');
    } finally { setEnrolling(false); }
  }

  const primary = owned
    ? <Link href={`/student/learn/${course.id}`} className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-azure-strong text-sm font-semibold text-on-accent">Continue learning</Link>
    : free
      ? <Button className="h-10 flex-1" loading={enrolling} onClick={enrollFree}>Enrol for free</Button>
      : choice === 'course' && coursePrice
        ? <Link href={`/student/courses/${course.id}/checkout`} className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-azure-strong text-sm font-semibold text-on-accent">Buy for {coursePrice}</Link>
        : pkg
          ? <Link href={`/packages/${pkg.id}`} className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-azure-strong text-sm font-semibold text-on-accent">Get {pkg.name}</Link>
          : <Link href="/packages" className="inline-flex h-10 flex-1 items-center justify-center rounded-md bg-azure-strong text-sm font-semibold text-on-accent">See packages</Link>;

  return (
    <DrawerContent title={course.title} description={[teacherOf(course), course.programme ? short(course.programme) : null].filter(Boolean).join(' · ')}
      footer={<>
        {primary}
        {!owned && firstFree && (
          <Link href={`/student/learn/${course.id}/lesson/${firstFree.id}`} className="inline-flex h-10 items-center rounded-md border border-line bg-white px-4 text-sm font-semibold text-navy hover:bg-subtle">Watch free lesson</Link>
        )}
      </>}>
      <InfoGrid items={[
        { label: 'Lessons', value: detail ? lessons.length : '…' },
        { label: 'Length', value: !detail ? '…' : secs ? (secs >= 3600 ? `${Math.round(secs / 3600)} h` : `${Math.max(1, Math.round(secs / 60))} min`) : '—' },
        { label: 'Access', value: free ? 'No time limit' : accessText(course.accessMonths) },
        ...(course.language ? [{ label: 'Language', value: course.language }] : []),
      ]} />

      {course.description && <p className="whitespace-pre-line text-[13.5px] leading-relaxed text-ink2">{course.description}</p>}

      {!owned && !free && (
        <DrawerSection title="Choose how to get it">
          <div className="flex flex-col gap-2.5">
            {sellsAlone && (
              <Option checked={choice === 'course'} onPick={() => setChoice('course')} title="This course only"
                body={`All lessons, practice and quizzes, plus the certificate · ${course.accessMonths ? `${accessText(course.accessMonths)} of access` : 'no time limit'}`} price={coursePrice!} />
            )}
            {packages.map(p => {
              const t = separateTotal(p);
              const others = p.courseIds.length - 1;
              return (
                <Option key={p.id} checked={choice === p.id} onPick={() => setChoice(p.id)} title={p.name}
                  body={`This course${others > 0 ? ` and ${others} more` : ''}${p.cohort ? ', live classes' : ''}${p.mentorship ? `, ${p.mentorship.toLowerCase()}` : ''} · ${term(p.validityDays)}`}
                  note={t != null && t > p.priceAmount ? `Saves ${money(t - p.priceAmount, p.currency)} compared with buying the ${p.courseIds.length} courses` : undefined}
                  price={money(p.priceAmount, p.currency)} />
              );
            })}
            {!sellsAlone && !packages.length && (
              <p className="rounded-md border border-line bg-subtle px-3.5 py-3 text-[13px] text-ink2">This course isn’t on sale yet. Check the packages, or ask your school.</p>
            )}
          </div>
        </DrawerSection>
      )}

      <DrawerSection title="What’s inside" count={detail?.modules.length}>
        {!detail ? <div className="h-24 rounded-md bg-subtle animate-pulse" /> : !detail.modules.length ? (
          <p className="text-[13px] text-ink2">The outline isn’t available yet.</p>
        ) : (
          <div className="flex flex-col gap-2.5">
            {detail.modules.map(m => (
              <div key={m.id} className="overflow-hidden rounded-md border border-line">
                <p className="border-b border-line bg-subtle px-3 py-2 text-[13px] font-semibold text-navy">{m.title}</p>
                {m.lessons.map(l => (
                  <p key={l.id} className="flex items-center gap-2 px-3 py-2 text-[13px] text-ink2">
                    <span className="min-w-0 flex-1 truncate">{l.title}</span>
                    {l.isFree && !owned && (
                      <Link href={`/student/learn/${course.id}/lesson/${l.id}`} className="inline-flex h-5 items-center rounded bg-accent-soft px-1.5 text-[11px] font-bold text-navy hover:underline">Free preview</Link>
                    )}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </DrawerSection>
    </DrawerContent>
  );
}

function Option({ checked, onPick, title, body, note, price }: {
  checked: boolean; onPick: () => void; title: string; body: string; note?: string; price: string;
}) {
  return (
    <label className={clsx('flex cursor-pointer gap-3 rounded-lg border p-3.5', checked ? 'border-azure bg-accent-soft' : 'border-line hover:bg-subtle')}>
      <input type="radio" name="buy" checked={checked} onChange={onPick} className="mt-1 accent-[var(--color-azure-strong)]" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-bold text-navy">{title}</span>
        <span className="mt-0.5 block text-[12.5px] text-ink2">{body}</span>
        {note && <span className="mt-1 block text-[12.5px] font-semibold text-azure-strong">{note}</span>}
      </span>
      <span className="whitespace-nowrap text-[15px] font-extrabold text-navy">{price}</span>
    </label>
  );
}
