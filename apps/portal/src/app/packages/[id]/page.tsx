'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { clsx } from 'clsx';
import { minorToMajor } from '@cpa/shared';
import { Topbar } from '@/components/layout/Topbar';
import api from '@/lib/api';
import { CourseCover } from '@/components/courses/CourseCover';

interface Details {
  id: string; name: string; description: string | null; priceAmount: number; currency: string;
  validityDays: number | null; categoryTags: string[]; mentorship: string | null;
  mentorshipPerMonth: number | null; mentors: { count: number; names: string[] } | null;
  faq: { q: string; a: string }[]; separateTotal: number | null; lessons: number;
  courses: { id: string; title: string; teacher: string | null; language: string | null; modules: number; lessons: number; minutes: number; price: { amount: number; currency: string } | null }[];
  cohort: { id: string; name: string; teacher: string | null; students: number; examDate: string | null; sittingLabel: string | null; recordings: boolean; next: { title: string; scheduledAt: string; durationMins: number }[] } | null;
  mine: { purchasedAt: string; expiresAt: string | null; invoiceNo: string | null; active: boolean; progressPct: number | null; mentorLeft: number | null } | null;
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

  // Set like the sign-in pages' blue panel: navy name with its last word in white
  const nameWords = d.name.split(' ');
  const nameLast = nameWords.pop() ?? '';
  // What the price covers, as equal blocks under the hero
  const pillars = [
    { abbr: String(d.courses.length), t: `${d.courses.length} course${d.courses.length === 1 ? '' : 's'}`, d: d.courses.slice(0, 4).map(c => c.title.split(/\s[·—-]\s/)[0]).join(', ') },
    ...(d.cohort ? [{ abbr: 'LV', t: 'Live classes', d: [d.cohort.name, d.cohort.teacher].filter(Boolean).join(' · ') }] : []),
    ...(d.mentorship ? [{ abbr: 'MN', t: 'Mentorship', d: d.mentorshipPerMonth ? `${d.mentorshipPerMonth} session${d.mentorshipPerMonth === 1 ? '' : 's'} a month` : d.mentorship }] : []),
  ];
  const months = d.validityDays ? Math.round(d.validityDays / 30.44) : null;
  const momo = ['XAF', 'XOF'].includes(d.currency.toUpperCase());
  const after = [d.cohort && `you’re added to the ${d.cohort.name} class straight away`, d.mentorship && 'you can book your first mentor session'].filter(Boolean).join(' and ');

  return (
    <div className="flex min-h-full flex-col">
      <Topbar backHref="/packages" backLabel="Packages" title={d.name} />

      <section className="keep-light mx-4 mt-4 flex flex-wrap items-end gap-6 rounded-lg bg-[#3F6FE8] p-6 lg:mx-7 lg:mt-6 lg:p-7">
        <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-2.5">
          {d.categoryTags.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {d.categoryTags.slice(0, 4).map((t, i) => (
                <span key={t} className={clsx('inline-flex h-6 items-center rounded px-2 text-xs font-bold', i === 0 ? 'bg-[#FFFFFF] text-navy' : 'bg-navy text-[#FFFFFF]')}>{t}</span>
              ))}
            </div>
          )}
          <h1 className="text-[clamp(30px,4vw,40px)] font-extrabold leading-[1.02] tracking-[-0.035em] text-navy [text-wrap:balance]">
            {nameWords.join(' ')} <span className="text-[#FFFFFF]">{nameLast}</span>
          </h1>
          {d.description && <p className="max-w-[640px] text-[15px] leading-relaxed text-navy/85">{d.description}</p>}
        </div>
        <dl className="grid min-w-0 flex-[1_1_260px] grid-cols-2 gap-2.5">
          {facts.map(f => (
            <div key={f.l} className="rounded-md bg-[#FFFFFF] px-3 py-2.5">
              <dt className="text-[11.5px] text-muted">{f.l}</dt>
              <dd className="mt-0.5 text-sm font-bold text-navy">{f.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <div className="flex flex-wrap items-start gap-6 p-4 lg:px-7 lg:py-6">
        <div className="flex min-w-0 flex-[999_1_540px] flex-col gap-5">
          <section className={clsx('grid gap-2.5', pillars.length === 3 ? 'sm:grid-cols-3' : pillars.length === 2 ? 'sm:grid-cols-2' : '')}>
            {pillars.map(p => (
              <div key={p.t} className="rounded-lg border border-line bg-white p-3.5">
                <span className="inline-flex h-[34px] w-[34px] items-center justify-center rounded-md bg-accent-soft text-xs font-extrabold text-azure-strong">{p.abbr}</span>
                <p className="mt-2 text-[15px] font-bold text-navy">{p.t}</p>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] text-ink2" title={p.d}>{p.d}</p>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-2.5 rounded-lg border border-line bg-white p-[18px]">
            <h2 className="flex items-center gap-2 text-base font-bold text-navy">
              Courses in this package <span className="inline-flex h-5 items-center rounded bg-accent-soft px-1.5 text-[11.5px] font-bold">{d.courses.length}</span>
            </h2>
            {d.courses.map(c => (
              <div key={c.id} className="flex flex-wrap items-center gap-3 rounded-md border border-line p-3">
                <CourseCover variant="tile" size="sm" course={{ title: c.title }} />
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
            <section className="flex flex-wrap items-center gap-3.5 rounded-lg border border-line bg-white p-[18px]">
              <div className="min-w-0 flex-[999_1_320px]">
                <h2 className="text-base font-bold text-navy">Mentorship{d.mentorshipPerMonth ? ` · ${d.mentorshipPerMonth} session${d.mentorshipPerMonth === 1 ? '' : 's'} a month` : ''}</h2>
                <p className="mt-1 text-[13.5px] text-ink2">
                  {d.mentorship}. A 1-to-1 with a mentor you choose, to go over your results and plan the weeks ahead
                  {d.mentorshipPerMonth && months ? `: ${d.mentorshipPerMonth * months} sessions over your ${months} months` : ''}. Book from the Mentorship page once you have the package.
                </p>
              </div>
              {d.mentors && d.mentors.names.length > 0 && (
                <div className="flex flex-[1_1_200px] items-center">
                  {d.mentors.names.map(n => (
                    <span key={n} title={n} className="-mr-1.5 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-accent-soft text-xs font-extrabold text-azure-strong">{initials(n)}</span>
                  ))}
                  {d.mentors.count > d.mentors.names.length && <span className="ml-3.5 text-[12.5px] text-muted">and {d.mentors.count - d.mentors.names.length} more mentor{d.mentors.count - d.mentors.names.length === 1 ? '' : 's'}</span>}
                </div>
              )}
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
            {(d.cohort?.next[0] || d.mine!.mentorLeft != null) && (
              <div className="rounded-md bg-subtle px-3 py-2.5 text-[13px] text-ink2">
                {d.cohort?.next[0] && <strong className="block text-navy">Next live class · {new Date(d.cohort.next[0].scheduledAt).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, {time(d.cohort.next[0].scheduledAt)}</strong>}
                {d.mine!.mentorLeft != null && d.mentorshipPerMonth != null && <>Mentor sessions left this month: {d.mine!.mentorLeft} of {d.mentorshipPerMonth}</>}
              </div>
            )}
            <Link href={d.courses[0] ? `/student/learn/${d.courses[0].id}` : '/student/courses'} className="inline-flex h-[42px] items-center justify-center rounded-md bg-azure-strong text-[14.5px] font-semibold text-on-accent">Continue learning</Link>
            {(d.cohort || d.mentorship) && (
              <div className="flex gap-2">
                {d.cohort && <Link href={`/student/cohorts?id=${d.cohort.id}`} className="inline-flex h-[38px] flex-1 items-center justify-center rounded-md border border-line text-[13.5px] font-semibold text-navy hover:bg-subtle">My class</Link>}
                {d.mentorship && <Link href="/student/mentorship" className="inline-flex h-[38px] flex-1 items-center justify-center rounded-md border border-line text-[13.5px] font-semibold text-navy hover:bg-subtle">Book a mentor</Link>}
              </div>
            )}
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
            <p className="rounded-md bg-subtle px-3 py-2.5 text-[12.5px] text-ink2">
              After paying, {after ? `${after}, and ` : ''}your course{d.courses.length === 1 ? '' : 's'} open{d.courses.length === 1 ? 's' : ''} straight away.
            </p>
            <p className="text-center text-[12.5px] text-muted">{momo ? 'MTN MoMo or Orange Money' : 'Card, bank or mobile money'} · have a coupon? Add it at checkout</p>
          </>}
        </aside>
        {/* Room for the phone buy bar, so it never covers the end of the page */}
        <div className="h-16 w-full lg:hidden" aria-hidden />
      </div>

      {/* Phones: the buy card sits at the end of the page, so buying stays one tap away */}
      <div className="fixed left-2.5 right-2.5 z-[50] flex items-center gap-3 rounded-[14px] border border-line bg-white p-2.5 pl-4 shadow-[0_12px_32px_rgba(7,32,97,0.22)] bottom-[calc(12px+env(safe-area-inset-bottom))] [html[data-tabbar=shown]_&]:bottom-[calc(90px+env(safe-area-inset-bottom))] lg:hidden">
        {owned ? <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13.5px] font-bold text-navy">This package is yours</p>
            <p className="truncate text-xs text-muted">{d.mine!.expiresAt ? `Access until ${longDate(d.mine!.expiresAt)}` : 'No time limit'}</p>
          </div>
          <Link href={d.courses[0] ? `/student/learn/${d.courses[0].id}` : '/student/courses'} className="inline-flex h-11 flex-shrink-0 items-center rounded-md bg-azure-strong px-4 text-sm font-semibold text-on-accent">Continue learning</Link>
        </> : <>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold text-navy">{money(d.priceAmount, d.currency)}</p>
            <p className="truncate text-xs text-muted">{saving != null ? `Saves ${money(saving, d.currency)}` : `One payment · ${d.validityDays ? `${access.toLowerCase()} of access` : 'no time limit'}`}</p>
          </div>
          <Link href={`/packages/${d.id}/checkout`} className="inline-flex h-11 flex-shrink-0 items-center rounded-md bg-azure-strong px-4 text-sm font-semibold text-on-accent">{expired ? 'Buy again' : 'Get this package'}</Link>
        </>}
      </div>
    </div>
  );
}
