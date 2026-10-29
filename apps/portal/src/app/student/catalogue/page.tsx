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

interface Programme { id: string; name: string; shortName: string | null }
interface Course {
  id: string; title: string; description: string | null; status: string; createdAt: string;
  priceAmount: number | null; priceCurrency: string | null; isSoldIndividually: boolean;
  programme: { id: string; name: string; shortName: string | null } | null;
  subject: { id: string; name: string } | null;
  level: { id: string; name: string } | null;
  _count: { modules: number; enrollments: number };
}
interface Package {
  id: string; name: string; description: string | null;
  priceAmount: number; currency: string; courseIds: string[];
  validityDays: number | null; categoryTags: string[];
  cohort?: { id: string; name: string } | null;
}
interface Lesson { id: string; title: string; isFree: boolean; durationSecs: number | null }
interface Detail { id: string; hasAccess?: boolean; modules: { id: string; title: string; lessons: Lesson[] }[] }

type PriceFilter = 'any' | 'single' | 'free' | 'package';
type Sort = 'popular' | 'newest' | 'az' | 'price';

const money = (minor: number, cur: string) => `${cur} ${minorToMajor(minor, cur).toLocaleString()}`;
const abbr = (t: string) => t.split(/[\s·—-]+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'C';
const short = (p: { name: string; shortName: string | null }) => p.shortName ?? p.name;
const term = (days: number | null) => !days ? 'no time limit' : days % 30 === 0 ? `${days / 30} month${days === 30 ? '' : 's'}` : `${days} days`;
const isFree = (c: Course) => c.isSoldIndividually && !c.priceAmount;

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
  const [sort, setSort] = useState<Sort>('popular');
  const [prog, setProgState] = useState<string>(params.get('tab') ?? '');
  const [openId, setOpenId] = useState<string | null>(null);

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
      const [pr, cr, pk, cp] = await Promise.all([
        api.get(progUrl).catch(() => ({ data: [] })),
        api.get('/platform-courses').catch(() => ({ data: [] })),
        api.get('/packages').catch(() => ({ data: [] })),
        api.get('/portals/student/course-purchases').catch(() => ({ data: [] })),
      ]);
      const list: Course[] = (cr.data ?? []).filter((c: Course) => c.status === 'PUBLISHED');
      const pkgs: Package[] = pk.data ?? [];
      const activePkg = new Set<string>((me?.activePackages ?? []).map((p: { id: string }) => p.id));
      const ids = new Set<string>((cp.data ?? []).map((p: { courseId: string }) => p.courseId));
      pkgs.forEach(p => { if (activePkg.has(p.id)) p.courseIds.forEach(id => ids.add(id)); });
      // Only offer programmes that have something to buy
      const withCourses = (pr.data as Programme[] ?? []).filter(p => list.some(c => c.programme?.id === p.id));
      setProgrammes(withCourses); setCourses(list); setPackages(pkgs); setOwned(ids); setOwnedPkgs(activePkg);
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

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = progCourses.filter(c =>
      (subject === 'all' || c.subject?.id === subject) &&
      (price === 'any'
        || (price === 'single' && c.isSoldIndividually && !!c.priceAmount)
        || (price === 'free' && isFree(c))
        || (price === 'package' && !c.isSoldIndividually)) &&
      (!q || c.title.toLowerCase().includes(q) || (c.subject?.name ?? '').toLowerCase().includes(q) || (c.description ?? '').toLowerCase().includes(q)));
    const cmp: Record<Sort, (a: Course, b: Course) => number> = {
      popular: (a, b) => b._count.enrollments - a._count.enrollments,
      newest: (a, b) => +new Date(b.createdAt) - +new Date(a.createdAt),
      az: (a, b) => a.title.localeCompare(b.title),
      price: (a, b) => (a.isSoldIndividually ? a.priceAmount ?? 0 : Infinity) - (b.isSoldIndividually ? b.priceAmount ?? 0 : Infinity),
    };
    return [...list].sort(cmp[sort]);
  }, [progCourses, search, subject, price, sort]);

  const open = openId ? byId.get(openId) ?? null : null;
  const selectBox = 'h-10 rounded-md border border-line bg-white pl-3 pr-8 text-[13.5px] text-navy outline-none focus:border-azure';

  return (
    <div className="flex min-h-full flex-col">
      <Topbar title="Catalogue" subtitle="Courses and packages for your exam. Buy a single course, or save with a package." />

      <div className="flex flex-col gap-5 p-4 lg:px-7 lg:py-6">
        <div className="flex flex-wrap items-center gap-2.5">
          <label className="flex h-10 min-w-0 flex-[1_1_320px] items-center gap-2.5 rounded-md border border-line bg-white px-3 focus-within:border-azure">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden className="text-muted"><path d="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4" /></svg>
            <input type="search" aria-label="Search courses" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Search courses or subjects" className="min-w-0 flex-1 bg-transparent text-sm text-navy outline-none placeholder:text-muted" />
          </label>
          <select aria-label="Subject" value={subject} onChange={e => setSubject(e.target.value)} className={selectBox}>
            <option value="all">Subject: All</option>
            {subjects.map(([id, n]) => <option key={id} value={id}>{n}</option>)}
          </select>
          <select aria-label="Price" value={price} onChange={e => setPrice(e.target.value as PriceFilter)} className={selectBox}>
            <option value="any">Price: Any</option>
            <option value="single">Sold on its own</option>
            <option value="free">Free</option>
            <option value="package">In a package only</option>
          </select>
          <select aria-label="Sort" value={sort} onChange={e => setSort(e.target.value as Sort)} className={selectBox}>
            <option value="popular">Sort: Most popular</option>
            <option value="newest">Newest</option>
            <option value="price">Lowest price</option>
            <option value="az">A to Z</option>
          </select>
        </div>

        {programmes.length > 0 && (
          <div role="tablist" aria-label="Programme" className="flex max-w-full flex-wrap gap-1 self-start rounded-lg border border-line bg-white p-1">
            {[{ id: 'all', label: 'All', n: courses.length }, ...programmes.map(p => ({ id: p.id, label: short(p), n: courses.filter(c => c.programme?.id === p.id).length }))].map(t => {
              const sel = (prog || 'all') === t.id;
              return (
                <button key={t.id} type="button" role="tab" aria-selected={sel} onClick={() => setProg(t.id)}
                  className={clsx('h-8 rounded-md px-3 text-[13px] transition-colors', sel ? 'bg-accent-soft font-semibold text-navy' : 'font-medium text-ink2 hover:text-navy')}>
                  {t.label} <span className="font-medium text-muted">{t.n}</span>
                </button>
              );
            })}
          </div>
        )}

        {loading ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-48 rounded-lg border border-line bg-white animate-pulse" />)}
          </div>
        ) : (
          <>
            {progPackages.length > 0 && (
              <section className="flex flex-col gap-3">
                <div className="flex items-baseline justify-between gap-3">
                  <h2 className="text-base font-bold text-navy">Packages for {progName}</h2>
                  <Link href="/packages" className="text-[13px] font-semibold text-azure-strong hover:underline">Compare packages</Link>
                </div>
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                  {progPackages.slice(0, 3).map(({ p, saving }, i) => {
                    const best = i === 0 && saving != null;
                    const names = p.courseIds.map(id => byId.get(id)?.title.split(' · ')[0]).filter(Boolean) as string[];
                    return (
                      <article key={p.id} className={clsx('flex flex-col gap-2.5 rounded-lg border bg-white p-4', best ? 'border-azure' : 'border-line')}>
                        <div className="flex justify-between gap-2">
                          <p className="text-[15px] font-bold text-navy">{p.name}</p>
                          {ownedPkgs.has(p.id) ? <span className="inline-flex h-[22px] items-center rounded bg-accent-soft px-1.5 text-[11.5px] font-bold text-navy">Yours</span>
                            : best && <span className="inline-flex h-[22px] items-center rounded bg-accent-soft px-1.5 text-[11.5px] font-bold text-navy">Best value</span>}
                        </div>
                        <p className="line-clamp-2 text-[13px] text-muted">
                          {names.length ? `${names.slice(0, 4).join(', ')}${names.length > 4 ? ` and ${names.length - 4} more` : ''}` : p.description ?? `${p.courseIds.length} courses`}
                        </p>
                        <p className="text-xl font-extrabold text-navy">{money(p.priceAmount, p.currency)} <span className="text-[12.5px] font-medium text-muted">/ {term(p.validityDays)}</span></p>
                        <p className="text-[12.5px] font-semibold text-azure-strong">
                          {[saving != null ? `Saves ${money(saving, p.currency)} vs buying separately` : `${p.courseIds.length} course${p.courseIds.length === 1 ? '' : 's'}`,
                            p.cohort ? 'live classes included' : null].filter(Boolean).join(' · ')}
                        </p>
                        <Link href={`/packages/${p.id}`} className="mt-auto inline-flex h-[34px] items-center justify-center rounded-md border border-line text-[13px] font-semibold text-navy hover:bg-subtle">View package</Link>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="flex flex-col gap-3">
              <h2 className="text-base font-bold text-navy">
                Courses <span className="text-sm font-medium text-muted">· {shown.length} in {progName}</span>
              </h2>
              {!shown.length ? (
                <div className="rounded-lg border border-line bg-white p-10 text-center">
                  <p className="text-sm font-semibold text-navy">No courses match</p>
                  <p className="mt-1 text-[13px] text-ink2">Try another subject or price, or clear the search.</p>
                  <Button size="sm" variant="secondary" className="mt-4" onClick={() => { setSearch(''); setSubject('all'); setPrice('any'); }}>Clear filters</Button>
                </div>
              ) : (
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                  {shown.map(c => {
                    const has = owned.has(c.id);
                    const inPkgs = pkgsFor(c.id);
                    const priceLabel = has ? 'Yours' : isFree(c) ? 'Free' : c.isSoldIndividually && c.priceCurrency ? money(c.priceAmount!, c.priceCurrency) : 'Package only';
                    const note = has ? 'You have access' : inPkgs.length ? `${c.isSoldIndividually ? 'Also in' : 'In'} ${inPkgs[0].name}${inPkgs.length > 1 ? ` and ${inPkgs.length - 1} more` : ''}` : 'Not in a package yet';
                    return (
                      <article key={c.id} className="flex flex-col overflow-hidden rounded-lg border border-line bg-white">
                        <button type="button" onClick={() => setOpenId(c.id)} className="flex flex-col gap-2.5 p-4 text-left hover:bg-subtle/50">
                          <div className="flex items-center gap-3">
                            <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-accent-soft text-[13px] font-extrabold text-azure-strong">{abbr(c.title)}</span>
                            <div className="min-w-0">
                              <p className="line-clamp-2 text-[14.5px] font-semibold leading-snug text-navy">{c.title}</p>
                              <p className="mt-0.5 truncate text-[12.5px] text-muted">{[c.subject?.name, c.programme ? short(c.programme) : null].filter(Boolean).join(' · ')}</p>
                            </div>
                          </div>
                          <dl className="grid grid-cols-3 gap-1.5">
                            {[['Modules', String(c._count.modules)], ['Students', c._count.enrollments.toLocaleString()], ['Level', c.level?.name ?? '—']].map(([l, v]) => (
                              <div key={l} className="min-w-0">
                                <dt className="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{l}</dt>
                                <dd className="mt-0.5 truncate text-[13px] font-semibold text-navy">{v}</dd>
                              </div>
                            ))}
                          </dl>
                        </button>
                        <div className="mt-auto flex items-center gap-2.5 border-t border-line px-4 py-3">
                          <div className="min-w-0 flex-1">
                            <p className="text-[15px] font-extrabold text-navy">{priceLabel}</p>
                            <p className="truncate text-xs text-muted">{note}</p>
                          </div>
                          {has
                            ? <Link href={`/student/learn/${c.id}`} className="inline-flex h-[34px] items-center rounded-md border border-azure-strong bg-azure-strong px-3.5 text-[13px] font-semibold text-on-accent">Continue</Link>
                            : <button type="button" onClick={() => setOpenId(c.id)} className="inline-flex h-[34px] items-center rounded-md border border-line bg-white px-3.5 text-[13px] font-semibold text-navy hover:bg-subtle">View</button>}
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

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
      await api.post(`/payments/enroll-free/${course.id}`);
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
    <DrawerContent title={course.title} description={[course.subject?.name, course.programme ? short(course.programme) : null].filter(Boolean).join(' · ')}
      footer={<>
        {primary}
        {!owned && firstFree && (
          <Link href={`/student/learn/${course.id}/lesson/${firstFree.id}`} className="inline-flex h-10 items-center rounded-md border border-line bg-white px-4 text-sm font-semibold text-navy hover:bg-subtle">Watch free lesson</Link>
        )}
      </>}>
      <InfoGrid items={[
        { label: 'Lessons', value: detail ? lessons.length : '…' },
        { label: 'Length', value: !detail ? '…' : secs ? (secs >= 3600 ? `${Math.round(secs / 3600)} h` : `${Math.max(1, Math.round(secs / 60))} min`) : '—' },
        { label: 'Access', value: 'No time limit' },
      ]} />

      {course.description && <p className="text-[13.5px] leading-relaxed text-ink2">{course.description}</p>}

      {!owned && !free && (
        <DrawerSection title="Choose how to get it">
          <div className="flex flex-col gap-2.5">
            {sellsAlone && (
              <Option checked={choice === 'course'} onPick={() => setChoice('course')} title="This course only"
                body="All lessons, practice and quizzes, plus the certificate" price={coursePrice!} />
            )}
            {packages.map(p => {
              const t = separateTotal(p);
              const others = p.courseIds.length - 1;
              return (
                <Option key={p.id} checked={choice === p.id} onPick={() => setChoice(p.id)} title={p.name}
                  body={`This course${others > 0 ? ` and ${others} more` : ''}${p.cohort ? ', with live classes' : ''} · ${term(p.validityDays)}`}
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
