'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import { Button } from '@/components/ui/Button';
import { notify } from '@/lib/notify';
import api from '@/lib/api';

interface Lesson { id: string; title: string; type: 'VIDEO' | 'TEXT' | 'QUIZ' | 'LIVE'; durationSecs: number | null; isFree: boolean }
interface Course {
  id: string; title: string; description: string | null; shortDescription: string | null; source: string; contentImportedAt?: string | null; status: string;
  priceAmount: number | null; priceCurrency: string | null; isSoldIndividually: boolean; accessMonths: number | null;
  language: string | null; outcomes: string[]; hasAccess?: boolean;
  programme: { name: string; shortName: string | null } | null;
  subject: { name: string } | null; level: { name: string } | null;
  teacher: { name: string | null; firstName: string | null; lastName: string | null } | null;
  _count?: { enrollments: number };
  modules: { id: string; title: string; lessons: Lesson[] }[];
}
interface Pkg { id: string; name: string; priceAmount: number; currency: string; courseIds: string[]; validityDays: number | null; cohort?: { id: string } | null; mentorship?: string | null }
interface LibRow { id: string; done: number; lessons: number; pct: number; next: { id: string } | null; access: { kind: string; name?: string; expiresAt: string | null; purchasedAt?: string } }

const money = (minor: number, cur: string) => `${cur} ${minorToMajor(minor, cur).toLocaleString()}`;
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const mins = (secs: number) => { const m = Math.round(secs / 60); return m < 60 ? `${Math.max(1, m)} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`; };
const longDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const months = (m: number | null) => m == null ? null : `${m} month${m === 1 ? '' : 's'}`;
const ICON: Record<Lesson['type'], string> = {
  VIDEO: 'M8 5v14l11-7z', TEXT: 'M7 3h7l5 5v13H7zM14 3v5h5', QUIZ: 'M9 9a3 3 0 1 1 4 2.8c-.6.3-1 .9-1 1.6V14M12 17h.01', LIVE: 'M15 10l5-3v10l-5-3M3 6h12v12H3z',
};

export default function CourseDetailPage() {
  const { courseId } = useParams<{ courseId: string }>();
  const router = useRouter();
  const [c, setC] = useState<Course | null>(null);
  const [pkgs, setPkgs] = useState<Pkg[]>([]);
  const [mine, setMine] = useState<LibRow | null>(null);
  const [enrolling, setEnrolling] = useState(false);

  async function load() {
    const [cr, pr, lr] = await Promise.all([
      api.get(`/platform-courses/${courseId}`),
      api.get('/packages').catch(() => ({ data: [] })),
      api.get('/portals/student/library').catch(() => ({ data: { courses: [] } })),
    ]);
    setC(cr.data);
    setPkgs((pr.data ?? []).filter((p: Pkg) => p.courseIds?.includes(courseId)));
    setMine((lr.data?.courses ?? []).find((x: LibRow) => x.id === courseId) ?? null);
  }
  useEffect(() => { load().catch(() => router.push('/student/catalogue')); }, [courseId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!c) return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/student/catalogue" backLabel="Catalogue" title="Course" />
      <div className="flex flex-wrap gap-6 p-4 lg:px-7 lg:py-6">
        <div className="h-[520px] min-w-0 flex-[999_1_540px] rounded-lg border border-line bg-white animate-pulse" />
        <div className="h-[380px] min-w-0 flex-[1_1_320px] rounded-lg border border-line bg-white animate-pulse" />
      </div>
    </div>
  );

  const owned = !!mine || !!c.hasAccess;
  const lessons = c.modules.flatMap(m => m.lessons);
  const secs = lessons.reduce((n, l) => n + (l.durationSecs ?? 0), 0);
  const quizzes = lessons.filter(l => l.type === 'QUIZ').length;
  const firstFree = lessons.find(l => l.isFree);
  const teacher = c.teacher ? c.teacher.name || [c.teacher.firstName, c.teacher.lastName].filter(Boolean).join(' ') || null : null;
  const free = c.isSoldIndividually && !c.priceAmount;
  const forSale = c.isSoldIndividually && !!c.priceAmount && !!c.priceCurrency;
  const access = months(c.accessMonths);
  const bestPkg = [...pkgs].sort((a, b) => a.priceAmount - b.priceAmount)[0];
  const website = c.source === 'WORDPRESS' && !c.contentImportedAt;
  const tags = [c.programme ? c.programme.shortName ?? c.programme.name : null, c.subject?.name, c.level?.name].filter(Boolean) as string[];
  const facts = [
    { l: 'Modules', v: String(c.modules.length) },
    { l: 'Lessons', v: lessons.length ? `${lessons.length}${secs ? ` · ${mins(secs)}` : ''}` : '—' },
    ...(quizzes ? [{ l: 'Quizzes', v: String(quizzes) }] : []),
    ...(c.language ? [{ l: 'Language', v: c.language }] : []),
    { l: 'Students', v: (c._count?.enrollments ?? 0).toLocaleString() },
  ];
  const included = [
    lessons.length > 1 ? `All ${lessons.length} lessons with practice` : 'The lesson with practice',
    quizzes ? `${quizzes} graded quiz${quizzes === 1 ? '' : 'zes'}` : null,
    'Certificate when you finish',
    access ? `${access} of access` : 'No time limit on access',
  ].filter(Boolean) as string[];

  async function enrollFree() {
    setEnrolling(true);
    try {
      await api.post(`/payments/enroll-free/${courseId}`);
      notify.success('You’re enrolled', { description: 'The course is in My courses now.' });
      await load();
    } catch (e: any) { notify.error(e?.response?.data?.message ?? 'Could not enrol you'); }
    finally { setEnrolling(false); }
  }

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/student/catalogue" backLabel="Catalogue" title={c.title} />

      <div className="flex flex-wrap items-start gap-6 p-4 lg:px-7 lg:py-6">
        <div className="flex min-w-0 flex-[999_1_540px] flex-col gap-5">
          <section className="flex flex-col gap-2">
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {tags.map((t, i) => <span key={t} className={clsx('inline-flex h-6 items-center rounded px-2 text-xs font-semibold', i === 0 ? 'bg-accent-soft text-navy' : 'border border-line bg-white text-ink2')}>{t}</span>)}
              </div>
            )}
            <h1 className="mt-1 text-[28px] font-extrabold tracking-[-0.01em] text-navy">{c.title}</h1>
            {(c.description || c.shortDescription) && <p className="max-w-[680px] text-[14.5px] leading-relaxed text-ink2">{c.description || c.shortDescription}</p>}
            {teacher && (
              <div className="mt-1.5 flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-md bg-accent-soft text-xs font-extrabold text-azure-strong">{initials(teacher)}</span>
                <p className="text-[13.5px]"><strong className="font-semibold text-navy">{teacher}</strong>{c.subject && <span className="text-muted"> · {c.subject.name}</span>}</p>
              </div>
            )}
          </section>

          {!website && (
            <dl className="grid rounded-lg border border-line bg-white [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
              {facts.map(f => (
                <div key={f.l} className="-mr-px border-r border-line px-4 py-3.5">
                  <dt className="text-[11.5px] text-muted">{f.l}</dt>
                  <dd className="mt-0.5 text-[15px] font-bold text-navy">{f.v}</dd>
                </div>
              ))}
            </dl>
          )}

          {c.outcomes?.length > 0 && (
            <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-white p-[18px]">
              <h2 className="text-base font-bold text-navy">What you’ll be able to do</h2>
              <ul className="grid gap-x-4 gap-y-2 text-[13.5px] text-ink2 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                {c.outcomes.map(o => <Check key={o} text={o} />)}
              </ul>
            </section>
          )}

          {c.modules.length > 0 && (
            <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-white p-[18px]">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="text-base font-bold text-navy">Course outline</h2>
                <span className="text-[13px] text-muted">{c.modules.length} module{c.modules.length === 1 ? '' : 's'} · {lessons.length} lesson{lessons.length === 1 ? '' : 's'}{secs ? ` · ${mins(secs)}` : ''}</span>
              </div>
              {c.modules.map((m, mi) => {
                const ms = m.lessons.reduce((n, l) => n + (l.durationSecs ?? 0), 0);
                return (
                  <div key={m.id} className="overflow-hidden rounded-md border border-line">
                    <p className="flex justify-between gap-3 border-b border-line bg-subtle px-3 py-2.5 text-[13.5px] font-semibold text-navy">
                      <span className="truncate">{/^module/i.test(m.title) ? m.title : `Module ${mi + 1} — ${m.title}`}</span>
                      <span className="whitespace-nowrap font-medium text-muted">{m.lessons.length} lesson{m.lessons.length === 1 ? '' : 's'}{ms ? ` · ${mins(ms)}` : ''}</span>
                    </p>
                    {m.lessons.map(l => {
                      const open = owned || l.isFree;
                      const row = (
                        <>
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="flex-shrink-0 text-muted"><path d={ICON[l.type] ?? ICON.TEXT} /></svg>
                          <span className="min-w-0 flex-1 truncate">{l.title}</span>
                          {l.isFree && !owned && <span className="inline-flex h-5 items-center rounded bg-accent-soft px-1.5 text-[11px] font-bold text-navy">Free preview</span>}
                          <span className="whitespace-nowrap text-xs text-muted">{l.type === 'QUIZ' ? 'Quiz' : l.durationSecs ? mins(l.durationSecs) : l.type === 'TEXT' ? 'Reading' : ''}</span>
                        </>
                      );
                      return open
                        ? <Link key={l.id} href={`/student/learn/${c.id}/lesson/${l.id}`} className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink2 hover:bg-subtle hover:text-navy">{row}</Link>
                        : <p key={l.id} className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-ink2">{row}</p>;
                    })}
                  </div>
                );
              })}
            </section>
          )}

          {pkgs.length > 0 && (
            <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-white p-[18px]">
              <h2 className="text-base font-bold text-navy">Also in {pkgs.length === 1 ? 'this package' : 'these packages'}</h2>
              {pkgs.map(p => {
                const others = p.courseIds.length - 1;
                const vm = p.validityDays ? Math.round(p.validityDays / 30.44) : null;
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-navy">{p.name}</p>
                      <p className="mt-0.5 text-[12.5px] text-muted">
                        {[`This course${others > 0 ? ` and ${others} more` : ''}`, p.cohort ? 'live classes' : null, p.mentorship ? 'mentorship' : null, vm ? `${vm} months` : 'no time limit', money(p.priceAmount, p.currency)].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <Link href={`/packages/${p.id}`} className="text-[13px] font-semibold text-azure-strong hover:underline">View package</Link>
                  </div>
                );
              })}
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 rounded-lg border border-azure bg-white p-5 lg:sticky lg:top-6">
          {owned ? <>
            <span className="inline-flex h-6 items-center self-start rounded bg-accent-soft px-2 text-xs font-bold text-navy">You have this course</span>
            {mine && (
              <div>
                <p className="text-[13px] text-muted">{mine.access.expiresAt ? 'Access until' : 'Access'}</p>
                <p className="mt-0.5 text-[22px] font-extrabold text-navy">{mine.access.expiresAt ? longDate(mine.access.expiresAt) : 'No time limit'}</p>
                <p className="mt-0.5 text-[12.5px] text-muted">
                  {mine.access.kind === 'package' ? `From ${mine.access.name}` : mine.access.kind === 'single' ? `Bought on its own${mine.access.purchasedAt ? ` · ${longDate(mine.access.purchasedAt)}` : ''}` : 'Free course'}
                </p>
              </div>
            )}
            {mine && mine.lessons > 0 && (
              <div>
                <div className="flex justify-between text-[13px]"><span className="text-ink2">{mine.done} of {mine.lessons} lessons</span><strong className="text-navy">{mine.pct}%</strong></div>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-[3px] bg-subtle"><span className="block h-1.5 bg-azure" style={{ width: `${mine.pct}%` }} /></span>
              </div>
            )}
            <Link href={mine?.next && !website ? `/student/learn/${c.id}/lesson/${mine.next.id}` : `/student/learn/${c.id}`}
              className="inline-flex h-[42px] items-center justify-center rounded-md bg-azure-strong text-[14.5px] font-semibold text-on-accent">
              {mine && mine.done > 0 ? 'Continue learning' : 'Start the course'}
            </Link>
          </> : free || website ? <>
            <div>
              <p className="text-[30px] font-extrabold tracking-[-0.01em] text-navy">Free</p>
              <p className="mt-0.5 text-[13px] text-muted">No payment, no time limit</p>
            </div>
            <ul className="flex flex-col gap-2 text-[13.5px] text-navy">
              {included.slice(0, -1).map(i => <Check key={i} text={i} />)}
            </ul>
            {website
              ? <Link href={`/student/learn/${c.id}`} className="inline-flex h-[42px] items-center justify-center rounded-md bg-azure-strong text-[14.5px] font-semibold text-on-accent">Start the course</Link>
              : <Button className="h-[42px]" loading={enrolling} onClick={enrollFree}>Enrol for free</Button>}
          </> : <>
            {forSale ? (
              <div>
                <p className="text-[30px] font-extrabold tracking-[-0.01em] text-navy">{money(c.priceAmount!, c.priceCurrency!)}</p>
                <p className="mt-0.5 text-[13px] text-muted">One payment · {access ? `${access} of access` : 'no time limit'}</p>
              </div>
            ) : (
              <div>
                <p className="text-lg font-extrabold text-navy">Available in a package</p>
                <p className="mt-0.5 text-[13px] text-muted">This course isn’t sold on its own.</p>
              </div>
            )}
            <ul className="flex flex-col gap-2 text-[13.5px] text-navy">
              {(forSale ? included : included.slice(0, -1)).map(i => <Check key={i} text={i} />)}
            </ul>
            {forSale && <Link href={`/student/courses/${c.id}/checkout`} className="inline-flex h-[42px] items-center justify-center rounded-md bg-azure-strong text-[14.5px] font-semibold text-on-accent">Buy this course</Link>}
            {firstFree && (
              <Link href={`/student/learn/${c.id}/lesson/${firstFree.id}`} className="inline-flex h-[38px] items-center justify-center rounded-md border border-line text-[13.5px] font-semibold text-navy hover:bg-subtle">Watch a free lesson</Link>
            )}
            {bestPkg && (forSale ? (
              <p className="rounded-md bg-accent-soft px-3 py-2.5 text-[13px] text-ink2">
                <strong className="text-navy">Or get it in {bestPkg.name}</strong> for {money(bestPkg.priceAmount, bestPkg.currency)}
                {bestPkg.courseIds.length > 1 ? ` with ${bestPkg.courseIds.length - 1} more course${bestPkg.courseIds.length === 2 ? '' : 's'}` : ''}{bestPkg.cohort ? ' and live classes' : ''}.
                {' '}<Link href={`/packages/${bestPkg.id}`} className="font-semibold text-azure-strong hover:underline">View</Link>
              </p>
            ) : (
              <Link href={`/packages/${bestPkg.id}`} className="inline-flex h-[42px] items-center justify-center rounded-md bg-azure-strong px-3 text-center text-[14px] font-semibold text-on-accent">Get {bestPkg.name} · {money(bestPkg.priceAmount, bestPkg.currency)}</Link>
            ))}
            {!forSale && !bestPkg && <p className="text-[13px] text-ink2">This course isn’t on sale yet.</p>}
            {(forSale || bestPkg) && <p className="text-center text-[12.5px] text-muted">Mobile money, card or Paystack</p>}
          </>}
        </aside>
      </div>
    </div>
  );
}

function Check({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 flex-shrink-0 text-azure-strong"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{text}
    </li>
  );
}
