'use client';
import { useEffect, useMemo, useState, Suspense as _Suspense } from 'react';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const Suspense = _Suspense as any;
import Link from 'next/link';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
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

const money = (minor: number, cur: string) => `${cur} ${minorToMajor(minor, cur).toLocaleString()}`;
const term = (days: number | null) => !days ? 'No time limit' : days % 30 === 0 ? `${days / 30} month${days === 30 ? '' : 's'}` : `${days} days`;
const CHECK = 'M5 12.5l4.5 4.5L19 7.5', DASH = 'M6 12h12';

function PackagesInner() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [packages, setPackages] = useState<Package[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [mine, setMine] = useState<ActivePackage[]>([]);
  const [loading, setLoading] = useState(true);
  const [prog, setProgState] = useState(params.get('programme') ?? 'all');

  useEffect(() => {
    Promise.all([
      api.get('/packages').then(r => setPackages(r.data ?? [])).catch(() => {}),
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

  // A package belongs to the programmes of the courses it holds
  const programmes = useMemo(() => {
    const m = new Map<string, string>();
    packages.forEach(p => p.courseIds.forEach(id => { const pr = byId.get(id)?.programme; if (pr) m.set(pr.id, pr.shortName ?? pr.name); }));
    return [...m].sort((a, b) => a[1].localeCompare(b[1]));
  }, [packages, byId]);

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
  // Mentorship only shows when at least one package includes it
  const anyMentorship = plans.some(x => x.p.mentorship);
  const owned = (id: string) => mine.find(m => m.id === id) ?? null;

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/student/catalogue" backLabel="Catalogue" title="Packages" />

      <div className="flex flex-col gap-[22px] p-4 lg:px-7 lg:py-6">
        <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-extrabold tracking-[-0.01em] text-navy">Choose a package</h1>
            <p className="mt-1 text-[13.5px] text-muted">A package bundles several courses{anyMentorship ? ', live classes and mentorship' : ', often with live classes,'} for less than buying them one by one.</p>
          </div>
          {programmes.length > 1 && (
            <div role="tablist" aria-label="Programme" className="flex max-w-full flex-wrap gap-1 rounded-lg border border-line bg-white p-1">
              {[['all', 'All'] as [string, string], ...programmes].map(([id, l]) => (
                <button key={id} type="button" role="tab" aria-selected={prog === id} onClick={() => setProg(id)}
                  className={clsx('h-8 rounded-md px-3 text-[13px] transition-colors', prog === id ? 'bg-accent-soft font-semibold text-navy' : 'font-medium text-ink2 hover:text-navy')}>{l}</button>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
            {[0, 1, 2].map(i => <div key={i} className="h-96 rounded-lg border border-line bg-white animate-pulse" />)}
          </div>
        ) : !plans.length ? (
          <div className="rounded-lg border border-line bg-white p-10 text-center">
            <p className="text-sm font-semibold text-navy">No packages here yet</p>
            <p className="mt-1 text-[13px] text-ink2">You can still buy single courses from the catalogue.</p>
          </div>
        ) : (
          <>
            <div className="grid items-stretch gap-4 [grid-template-columns:repeat(auto-fit,minmax(280px,1fr))]">
              {plans.map(({ p, cs, saving }) => {
                const best = p.id === bestId;
                const have = owned(p.id);
                const lessonsHint = cs.reduce((n, c) => n + c._count.modules, 0);
                const items: [boolean, string][] = [
                  [true, `${p.courseIds.length} course${p.courseIds.length === 1 ? '' : 's'}${lessonsHint ? `, ${lessonsHint} modules` : ''}`],
                  [true, 'Practice and quizzes'],
                  [true, 'Certificates'],
                  [!!p.cohort, p.cohort ? `Live classes with ${p.cohort.name}` : 'Live classes'],
                  ...(anyMentorship ? [[!!p.mentorship, p.mentorship || 'Mentorship'] as [boolean, string]] : []),
                ];
                return (
                  <article key={p.id} className={clsx('flex flex-col gap-1.5 rounded-lg border bg-white p-5', best ? 'border-azure' : 'border-line')}>
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-base font-bold text-navy">{p.name}</p>
                      {have ? <span className="inline-flex h-[22px] items-center rounded bg-accent-soft px-1.5 text-[11.5px] font-bold text-navy">Yours</span>
                        : best && <span className="inline-flex h-[22px] items-center rounded bg-accent-soft px-1.5 text-[11.5px] font-bold text-navy">Best value</span>}
                    </div>
                    <p className="line-clamp-2 text-[13px] text-muted">
                      {p.description || cs.map(c => c.title.split(' · ')[0]).slice(0, 4).join(', ')}
                    </p>
                    <p className="mt-1.5 text-[28px] font-extrabold tracking-[-0.01em] text-navy">{money(p.priceAmount, p.currency)}</p>
                    <p className="text-[12.5px] text-muted">
                      {p.validityDays ? `${term(p.validityDays)} of access` : 'No time limit'}
                      {saving != null && <span className="font-semibold text-azure-strong"> · saves {money(saving, p.currency)}</span>}
                    </p>
                    <div className="my-1 h-px bg-line" />
                    <ul className="flex flex-col gap-2">
                      {items.map(([ok, t]) => (
                        <li key={t} className={clsx('flex items-start gap-2 text-[13.5px]', ok ? 'text-navy' : 'text-muted')}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 flex-shrink-0"><path d={ok ? CHECK : DASH} /></svg>
                          {t}
                        </li>
                      ))}
                    </ul>
                    {have?.expiresAt && (
                      <p className="mt-2 text-[12.5px] text-ink2">Your access runs until {new Date(have.expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
                    )}
                    <div className="mt-auto flex flex-col gap-1.5 pt-3">
                      {have ? (
                        <Link href="/student/courses" className="inline-flex h-10 items-center justify-center rounded-md border border-line bg-white text-sm font-semibold text-navy hover:bg-subtle">Go to my courses</Link>
                      ) : (
                        <Link href={`/packages/${p.id}/checkout`}
                          className={clsx('inline-flex h-10 items-center justify-center rounded-md border text-sm font-semibold',
                            best ? 'border-azure-strong bg-azure-strong text-on-accent' : 'border-line bg-white text-navy hover:bg-subtle')}>
                          Get {p.name}
                        </Link>
                      )}
                      <Link href={`/packages/${p.id}`} className="text-center text-xs font-semibold text-muted hover:text-navy">See what’s inside</Link>
                    </div>
                  </article>
                );
              })}
            </div>

            {plans.length > 1 && (
              <section className="flex flex-col gap-3 rounded-lg border border-line bg-white p-[18px]">
                <h2 className="text-base font-bold text-navy">Compare</h2>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] border-collapse text-[13.5px]">
                    <thead>
                      <tr>
                        <th className="border-b border-line px-3 py-2" />
                        {plans.map(({ p }) => (
                          <th key={p.id} className="border-b border-line px-3 py-2 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">{p.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {([
                        ['Courses', ({ p }) => String(p.courseIds.length)],
                        ['Access', ({ p }) => term(p.validityDays)],
                        ['Live classes', ({ p }) => p.cohort ? 'Yes' : '—'],
                        ...(anyMentorship ? [['Mentorship', ({ p }: typeof plans[number]) => p.mentorship || '—'] as [string, (x: typeof plans[number]) => string]] : []),
                        ['Certificates', () => 'Yes'],
                        ['Price', ({ p }) => money(p.priceAmount, p.currency)],
                        ['Price per course', ({ p }) => p.courseIds.length ? money(Math.round(p.priceAmount / p.courseIds.length), p.currency) : '—'],
                        ['Saving vs single courses', ({ p, saving }) => saving != null ? money(saving, p.currency) : '—'],
                      ] as [string, (x: typeof plans[number]) => string][]).map(([label, get]) => (
                        <tr key={label}>
                          <td className="border-b border-line px-3 py-[11px] text-ink2">{label}</td>
                          {plans.map(x => {
                            const v = get(x);
                            return <td key={x.p.id} className={clsx('border-b border-line px-3 py-[11px] text-center font-semibold', v === '—' ? 'text-muted' : 'text-navy')}>{v}</td>;
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-white px-4 py-3.5">
          <p className="min-w-0 flex-1 text-[13.5px] text-ink2"><strong className="text-navy">Only need one subject?</strong> Many courses can also be bought on their own from the catalogue.</p>
          <Link href="/student/catalogue" className="inline-flex h-8 items-center rounded-md border border-line px-3 text-[13px] font-semibold text-navy hover:bg-subtle">Browse single courses</Link>
        </div>
      </div>
    </div>
  );
}

export default function PackagesPage() {
  return (
    <Suspense fallback={<div className="m-7 h-64 rounded-lg border border-line bg-white animate-pulse" />}>
      <PackagesInner />
    </Suspense>
  );
}
