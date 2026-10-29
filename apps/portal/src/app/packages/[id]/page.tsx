'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';

interface Details {
  id: string; name: string; description: string | null; priceAmount: number; currency: string;
  validityDays: number | null; categoryTags: string[]; mentorship: string | null;
  faq: { q: string; a: string }[]; separateTotal: number | null; lessons: number;
  courses: { id: string; title: string; teacher: string | null; language: string | null; modules: number; lessons: number; minutes: number; price: { amount: number; currency: string } | null }[];
  cohort: { id: string; name: string; teacher: string | null; students: number; examDate: string | null; sittingLabel: string | null; recordings: boolean; next: { title: string; scheduledAt: string; durationMins: number }[] } | null;
  mine: { purchasedAt: string; expiresAt: string | null; invoiceNo: string | null; active: boolean; progressPct: number | null } | null;
}

const DAY = 86_400_000;
const money = (minor: number, cur: string) => `${cur} ${minorToMajor(minor, cur).toLocaleString()}`;
const abbr = (t: string) => t.split(/[\s·—-]+/).filter(w => /^[A-Za-z]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'C';
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const term = (days: number | null) => {
  if (!days) return 'No time limit';
  const m = Math.round(days / 30.44);
  return m >= 1 && Math.abs(m * 30.44 - days) <= 3 ? `${m} month${m === 1 ? '' : 's'}` : `${days} days`;
};
const longDate = (d: string) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const length = (mins: number) => !mins ? null : mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60 ? `${mins % 60} min` : ''}`.trim() : `${mins} min`;
const time = (d: string) => new Date(d).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

/** "Mondays and Wednesdays 17:00" from upcoming classes, in the student's own time zone */
function weeklyPattern(next: { scheduledAt: string }[]) {
  if (next.length < 2) return null;
  const names = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  const days = [...new Set(next.map(c => new Date(c.scheduledAt).getDay()))].sort();
  if (days.length > 3) return null;
  const times = next.map(c => time(c.scheduledAt));
  const common = [...times].sort((a, b) => times.filter(t => t === b).length - times.filter(t => t === a).length)[0];
  const list = days.map(d => names[d]);
  return `${list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}` : list[0]} ${common}`;
}

export default function PackageDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<Details | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => { api.get(`/packages/${id}/details`).then(r => setD(r.data)).catch(() => setError(true)); }, [id]);

  if (error) return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/packages" backLabel="Packages" title="Package" />
      <div className="m-4 rounded-lg border border-line bg-white p-10 text-center lg:m-7">
        <p className="text-sm font-semibold text-navy">This package isn’t available</p>
        <Link href="/packages" className="mt-3 inline-block text-[13px] font-semibold text-azure-strong hover:underline">See all packages</Link>
      </div>
    </div>
  );
  if (!d) return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/packages" backLabel="Packages" title="Package" />
      <div className="flex flex-wrap gap-6 p-4 lg:px-7 lg:py-6">
        <div className="h-[520px] min-w-0 flex-[999_1_540px] rounded-lg border border-line bg-white animate-pulse" />
        <div className="h-[420px] min-w-0 flex-[1_1_320px] rounded-lg border border-line bg-white animate-pulse" />
      </div>
    </div>
  );

  const owned = !!d.mine?.active;
  const expired = !!d.mine && !d.mine.active;
  const saving = d.separateTotal != null && d.separateTotal > d.priceAmount ? d.separateTotal - d.priceAmount : null;
  const access = term(d.validityDays);
  const daysLeft = d.mine?.expiresAt ? Math.ceil((new Date(d.mine.expiresAt).getTime() - Date.now()) / DAY) : null;
  const pattern = d.cohort ? weeklyPattern(d.cohort.next) : null;
  const extras = [d.cohort && 'live classes', d.mentorship && 'mentorship'].filter(Boolean).join(' and ');
  const included = [
    `${d.courses.length} course${d.courses.length === 1 ? '' : 's'} with practice and quizzes`,
    d.cohort ? `Live classes${pattern ? ` (${pattern.split(' ').slice(0, -1).join(' ').toLowerCase()})` : ''}${d.cohort.recordings ? ' and recordings' : ''}` : null,
    d.mentorship,
    'Certificate for each course',
    d.validityDays ? `${access} of access` : 'No time limit on access',
  ].filter(Boolean) as string[];
  const facts = [
    { l: 'Courses', v: `${d.courses.length}${d.lessons ? ` · ${d.lessons} lessons` : ''}` },
    { l: 'Access', v: access },
    ...(d.cohort ? [{ l: 'Live classes', v: pattern ?? (d.cohort.next.length ? 'Scheduled' : 'Starting soon') }] : []),
    ...(d.cohort?.examDate ? [{ l: 'Exam', v: `${d.cohort.sittingLabel ? `${d.cohort.sittingLabel.split(/[·-]/)[0].trim()} · ` : ''}${new Date(d.cohort.examDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}` }] : []),
  ];

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/packages" backLabel="Packages" title={d.name} />

      <div className="flex flex-wrap items-start gap-6 p-4 lg:px-7 lg:py-6">
        <div className="flex min-w-0 flex-[999_1_540px] flex-col gap-5">
          <section className="flex flex-col gap-2">
            {d.categoryTags.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {d.categoryTags.slice(0, 4).map((t, i) => (
                  <span key={t} className={clsx('inline-flex h-6 items-center rounded px-2 text-xs font-semibold', i === 0 ? 'bg-accent-soft text-navy' : 'border border-line bg-white text-ink2')}>{t}</span>
                ))}
              </div>
            )}
            <h1 className="mt-1 text-[28px] font-extrabold tracking-[-0.01em] text-navy">{d.name}</h1>
            {d.description && <p className="max-w-[680px] text-[14.5px] leading-relaxed text-ink2">{d.description}</p>}
          </section>

          <dl className="grid rounded-lg border border-line bg-white [grid-template-columns:repeat(auto-fit,minmax(150px,1fr))]">
            {facts.map(f => (
              <div key={f.l} className="-mr-px border-r border-line px-4 py-3.5">
                <dt className="text-[11.5px] text-muted">{f.l}</dt>
                <dd className="mt-0.5 text-[15px] font-bold text-navy">{f.v}</dd>
              </div>
            ))}
          </dl>

          <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-white p-[18px]">
            <h2 className="flex items-center gap-2 text-base font-bold text-navy">
              Courses in this package <span className="inline-flex h-5 items-center rounded bg-accent-soft px-1.5 text-[11.5px] font-bold">{d.courses.length}</span>
            </h2>
            {d.courses.map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3">
                <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md bg-accent-soft text-[13px] font-extrabold text-azure-strong">{abbr(c.title)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold text-navy">{c.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {[c.teacher, `${c.modules} module${c.modules === 1 ? '' : 's'}`, `${c.lessons} lesson${c.lessons === 1 ? '' : 's'}`, length(c.minutes), c.language].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[12.5px] text-muted">{c.price ? `${money(c.price.amount, c.price.currency)} on its own` : 'Only in packages'}</p>
                  <Link href={owned ? `/student/learn/${c.id}` : `/student/courses/${c.id}`} className="text-[13px] font-semibold text-azure-strong hover:underline">
                    {owned ? 'Open course' : 'Preview'}
                  </Link>
                </div>
              </div>
            ))}
          </section>

          {d.cohort && (
            <section className="flex flex-col gap-3 rounded-lg border border-line bg-white p-[18px]">
              <h2 className="text-base font-bold text-navy">Live classes</h2>
              <div className="flex flex-wrap items-center gap-3.5">
                <span className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-md bg-accent-soft text-[15px] font-extrabold text-azure-strong">{initials(d.cohort.teacher ?? d.cohort.name)}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-semibold text-navy">{d.cohort.name} cohort{d.cohort.teacher ? ` with ${d.cohort.teacher}` : ''}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted">
                    {[pattern, `${d.cohort.students} student${d.cohort.students === 1 ? '' : 's'}`, d.cohort.recordings ? 'recordings of past classes' : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </div>
              {d.cohort.next.length > 0 ? (
                <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                  {d.cohort.next.slice(0, 3).map(k => (
                    <div key={k.scheduledAt} className="rounded-md bg-subtle px-3 py-2.5">
                      <p className="text-xs text-muted">{new Date(k.scheduledAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })} · {time(k.scheduledAt)}</p>
                      <p className="mt-0.5 truncate text-[13.5px] font-semibold text-navy">{k.title}</p>
                    </div>
                  ))}
                </div>
              ) : <p className="text-[13px] text-ink2">The teacher will publish the class timetable soon.</p>}
            </section>
          )}

          {d.mentorship && (
            <section className="flex flex-col gap-2 rounded-lg border border-line bg-white p-[18px]">
              <h2 className="text-base font-bold text-navy">Mentorship</h2>
              <p className="text-[13.5px] text-ink2">{d.mentorship}. Book a slot from the Mentorship page once you have the package.</p>
            </section>
          )}

          {d.faq.length > 0 && (
            <section className="flex flex-col rounded-lg border border-line bg-white p-[18px]">
              <h2 className="mb-1.5 text-base font-bold text-navy">Questions</h2>
              {d.faq.map(f => (
                <details key={f.q} className="group border-t border-line py-2.5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-navy">
                    {f.q}
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden className="flex-shrink-0 text-muted transition-transform group-open:rotate-180"><path d="M6 9l6 6 6-6" /></svg>
                  </summary>
                  <p className="mt-1.5 text-[13.5px] text-ink2">{f.a}</p>
                </details>
              ))}
            </section>
          )}
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-3.5 rounded-lg border border-azure bg-white p-5 lg:sticky lg:top-6">
          {owned ? <>
            <span className="inline-flex h-6 items-center self-start rounded bg-accent-soft px-2 text-xs font-bold text-navy">This package is yours</span>
            <div>
              <p className="text-[13px] text-muted">{d.mine!.expiresAt ? 'Access until' : 'Access'}</p>
              <p className="mt-0.5 text-[22px] font-extrabold text-navy">{d.mine!.expiresAt ? longDate(d.mine!.expiresAt) : 'No time limit'}</p>
              <p className="mt-0.5 text-[12.5px] text-muted">Bought {longDate(d.mine!.purchasedAt)}{d.mine!.invoiceNo ? ` · invoice ${d.mine!.invoiceNo}` : ''}</p>
            </div>
            {d.mine!.progressPct != null && (
              <div>
                <div className="flex justify-between text-[13px]"><span className="text-ink2">Your progress</span><strong className="text-navy">{d.mine!.progressPct}%</strong></div>
                <span className="mt-1.5 block h-1.5 overflow-hidden rounded-[3px] bg-subtle"><span className="block h-1.5 bg-azure" style={{ width: `${d.mine!.progressPct}%` }} /></span>
              </div>
            )}
            <Link href={d.courses[0] ? `/student/learn/${d.courses[0].id}` : '/student/courses'} className="inline-flex h-[42px] items-center justify-center rounded-md bg-azure-strong text-[14.5px] font-semibold text-on-accent">Continue learning</Link>
            {d.cohort && <Link href={`/student/cohorts?id=${d.cohort.id}`} className="inline-flex h-[38px] items-center justify-center rounded-md border border-line text-[13.5px] font-semibold text-navy hover:bg-subtle">Go to my cohort</Link>}
            {daysLeft != null && daysLeft <= 30
              ? <Link href={`/packages/${d.id}/checkout`} className="inline-flex h-[38px] items-center justify-center rounded-md border border-line text-[13.5px] font-semibold text-navy hover:bg-subtle">Renew for another {access.toLowerCase()}</Link>
              : d.mine!.expiresAt && <p className="text-[12.5px] text-muted">You can renew from here in the last 30 days of your access.</p>}
          </> : <>
            {expired && <span className="inline-flex h-6 items-center self-start rounded bg-accent-soft px-2 text-xs font-bold text-navy">Your access ended {d.mine!.expiresAt ? longDate(d.mine!.expiresAt) : ''}</span>}
            <div>
              <p className="text-[30px] font-extrabold tracking-[-0.01em] text-navy">{money(d.priceAmount, d.currency)}</p>
              <p className="mt-0.5 text-[13px] text-muted">One payment · {d.validityDays ? `${access.toLowerCase()} of access` : 'no time limit'}</p>
            </div>
            {saving != null && (
              <p className="rounded-md bg-accent-soft px-3 py-2.5 text-[13px] text-ink2">
                <strong className="text-navy">Saves {money(saving, d.currency)}</strong> compared with buying the {d.courses.length} courses separately{extras ? `, and adds ${extras}` : ''}.
              </p>
            )}
            <ul className="flex flex-col gap-2 text-[13.5px] text-navy">
              {included.map(i => (
                <li key={i} className="flex items-start gap-2">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden className="mt-0.5 flex-shrink-0 text-azure-strong"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{i}
                </li>
              ))}
            </ul>
            <Link href={`/packages/${d.id}/checkout`} className="inline-flex h-[42px] items-center justify-center rounded-md bg-azure-strong text-[14.5px] font-semibold text-on-accent">
              {expired ? 'Buy again' : 'Get this package'}
            </Link>
            <p className="text-center text-[12.5px] text-muted">Mobile money, card or Paystack · have a coupon? Add it at checkout</p>
          </>}
        </aside>
      </div>
    </div>
  );
}
