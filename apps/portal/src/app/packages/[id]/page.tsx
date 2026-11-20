import Link from 'next/link';
import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import PackageDetailApp from '@/components/packages/PackageDetailApp';
import { Cover, PublicFooter, PublicHeader, perMonth, price } from '@/components/public/PublicChrome';
import { Icon, type IconName } from '@/components/ui/Icon';
import { AllCard, ReadMore } from '@/components/public/course/CourseParts';
import { MoreFromTeachers, PackageCourses, YourCourses, type PkgCourse, type TeacherMore } from '@/components/public/course/PackageParts';
import { cardTitle } from '@/components/public/course/BigCourseCard';
import { Topbar } from '@/components/layout/Topbar';
import { LiveClassCard, MentoringCard, weeksTo, type PkgLiveClass, type PkgPerson } from '@/components/public/course/PackageLive';

export const revalidate = 300;

interface Me { role: string; activePackages?: { id: string; expiresAt: string | null }[] }
interface LibRow { id: string; pct: number; state: 'new' | 'going' | 'done'; next: { id: string; title: string } | null }
interface Portal { owned: { until: string | null } | null; lib: Map<string, LibRow> }
async function authed<T>(path: string, token: string): Promise<T | null> {
  try { const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}${path}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
}

interface Teacher { name: string | null; avatarUrl: string | null; slug: string | null; subjects: string[]; yearsExperience: number | null; courses: number }
interface PackagePage {
  id: string; name: string; description: string | null; priceAmount: number; currency: string; months: number | null; bestValue: boolean; exams: string[]; worth: number | null;
  courses: PkgCourse[]; teachers: Teacher[]; published?: boolean;
  counts: { courses: number; ready: number; lessons: number; videos: number; quizzes: number; questions: number };
  live: { cohort: string; teacher: string | null; examDate: string | null; next: { title: string; scheduledAt: string; durationMins: number }[] } | null;
  liveClass?: PkgLiveClass | null;
  mentorship: { text: string | null; perMonth: number | null } | null;
  mentors?: PkgPerson[];
  addOns: { live: { price: number; cohort: string } | null; mentorship: { price: number; perMonth: number } | null };
  faq: { q: string; a: string }[];
  others?: { id: string; name: string; priceAmount: number; currency: string; courses: number; months: number | null; bestValue: boolean; published?: boolean }[];
  moreByTeacher?: TeacherMore[];
}

const API = process.env.NEXT_PUBLIC_API_URL;
async function load(id: string): Promise<PackagePage | null> {
  try { const r = await fetch(`${API}/catalogue/package-page/${encodeURIComponent(id)}`, { next: { revalidate: 300 } }); return r.ok ? await r.json() : null; } catch { return null; }
}
/** Admins can look at a package before it's published */
async function preview(id: string, token: string): Promise<PackagePage | null> {
  try { const r = await fetch(`${API}/admin/packages/${encodeURIComponent(id)}/public-preview`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' }); return r.ok ? await r.json() : null; } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const p = await load((await params).id);
  if (!p) return { title: 'Package' };
  return {
    title: `${p.name} · ${price(p.priceAmount, p.currency)}`,
    description: p.description ?? `${p.counts.courses} courses in one package${p.months ? ` for ${p.months} months` : ''}.`,
    openGraph: { title: p.name, description: p.description ?? undefined },
  };
}

const s = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
const TILT = ['left-[6px] top-[58px] -rotate-[9deg]', 'left-[40px] top-[30px] -rotate-2'];

/** Visitors: the package as a product, in the course page's layout. Signed in: the portal's own package page (admins can add ?preview=1). */
export default async function PackagePageRoute({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const token = (await cookies()).get('cpa_token')?.value;
  let raw: PackagePage | null = null;
  let portal: Portal | null = null;
  if (token && sp.preview === '1') raw = await preview(id, token);
  else if (token) {
    const [r, me, lib] = await Promise.all([load(id), authed<Me>('/auth/me', token), authed<{ courses: LibRow[] }>('/portals/student/library', token)]);
    if (!r || me?.role !== 'STUDENT') return <PackageDetailApp />;
    raw = r;
    const have = (me.activePackages ?? []).find(x => x.id === id);
    portal = { owned: have ? { until: have.expiresAt ?? null } : null, lib: new Map((lib?.courses ?? []).map(x => [x.id, x])) };
  } else raw = await load(id);
  if (!raw) notFound();
  const p: PackagePage = { ...raw, teachers: raw.teachers ?? [], courses: raw.courses ?? [], others: raw.others ?? [], moreByTeacher: raw.moreByTeacher ?? [], faq: raw.faq ?? [], liveClass: raw.liveClass ?? null, mentors: raw.mentors ?? [] };

  const checkout = portal ? `/packages/${p.id}/checkout` : `/register?next=${encodeURIComponent(`/packages/${p.id}/checkout`)}`;
  const owned = portal?.owned ?? null;
  // Theirs: each course with how far they are and where Continue goes
  const mine = owned ? p.courses.map(c => ({ c, l: portal!.lib.get(c.id) ?? null })) : [];
  const started = mine.filter(x => x.l && (x.l.pct > 0 || x.l.state === 'going'));
  const nextUp = mine.find(x => x.l?.state === 'going' && x.l.next) ?? mine.find(x => x.c.lessons > 0 && x.l?.state !== 'done') ?? null;
  const learn = (x: { c: PkgCourse; l: LibRow | null }) => x.l?.next ? `/student/learn/${x.c.id}/lesson/${x.l.next.id}` : `/student/learn/${x.c.id}`;
  const monthly = perMonth(p.priceAmount, p.currency, p.months);
  const soon = p.courses.filter(c => c.lessons === 0).length;
  const subjects = [...new Set(p.courses.map(c => c.subject).filter(Boolean))] as string[];
  const mentoring = p.mentorship?.perMonth ?? null;
  const showMentoring = !!p.mentorship || !!p.addOns.mentorship;
  const examWeeks = p.liveClass ? weeksTo(p.liveClass.examDate) : null;
  // Badges on the blue card: what comes with it, at a glance
  const badges: [IconName, string, string | null][] = [
    ...(p.liveClass ? [['live', p.liveClass.included ? 'Live classes' : 'Live classes as an add-on', '#live-class'] as [IconName, string, string]] : []),
    ...(showMentoring ? [['mentorship', p.mentorship ? 'Mentoring included' : 'Mentoring as an add-on', '#mentoring'] as [IconName, string, string]] : []),
    ...(examWeeks && p.liveClass?.included ? [['calendar', `Exam in ${s(examWeeks, 'week')}`, null] as [IconName, string, null]] : []),
  ];
  const tiles: [IconName, string][] = [
    ['courses', s(p.counts.courses, 'course')],
    ...(mentoring ? [['mentorship', mentoring === 1 ? 'Mentor once a month' : `${mentoring} mentor sessions a month`] as [IconName, string]] : []),
    ...(p.live ? [['live', 'Live classes'] as [IconName, string]] : []),
    ...(p.counts.lessons ? [['list', s(p.counts.lessons, 'lesson')] as [IconName, string]] : []),
    ...(p.counts.questions ? [['grade', s(p.counts.questions, 'practice question')] as [IconName, string]] : []),
    ['calendar', p.months ? `${p.months} months access` : 'Access while it’s on sale'],
    ['clock', 'At your own pace'], ['certificates', 'Certificate per course'], ['phone', 'Phone and data saver'],
  ];
  const faq = p.faq.length ? p.faq.map(f => [f.q, f.a]) : [
    [p.months ? `What happens after ${p.months} months?` : 'How long do I keep it?', p.months ? `Your access to the courses ends; your certificates and progress stay. You can buy the package again to keep going.` : 'For as long as the package is on CareerPath.'],
    ...(mentoring ? [['How do I book my mentor?', 'From Mentorship in your portal: pick a teacher, a day and a time. Your sessions for the month show there.']] : []),
    ['Can I pay with MTN or Orange Money?', 'Yes: MTN Mobile Money, Orange Money or a card. You get a receipt by email straight away.'],
    ...(soon ? [['What does “Lessons coming” mean?', 'Those courses are on careerpathafrica.com and their lessons are being moved into the portal. They appear in your package as soon as they’re here, at no extra cost.']] : []),
  ];

  return (
    <div className={portal ? 'flex min-h-full flex-col text-navy' : 'keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy'}>
      {portal ? <Topbar backHref="/packages" backLabel="Packages" title={p.name} /> : <PublicHeader />}
      {p.published === false && <p className="bg-[#FFF1D6] px-4 py-2.5 text-center text-[13.5px] font-semibold text-[#8A5A00]">Preview: this package isn’t published yet. Only admins can see this page.</p>}
      {!portal && <nav aria-label="Where it sits" className="mx-auto flex w-full max-w-[1252px] flex-wrap gap-1.5 px-4 pt-5 text-[13px] text-[#637090] sm:px-8">
        <Link href="/packages" className="hover:text-navy">Packages</Link><span>›</span><b className="text-navy">{p.name}</b>
      </nav>}

      <main className={`mx-auto grid w-full max-w-[1252px] items-start gap-8 px-4 pb-28 ${portal ? 'pt-5 lg:px-7' : 'pt-4 sm:px-8'} lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12 lg:pb-16`}>
        <div className="flex min-w-0 flex-col">
          {/* The blue card is the box */}
          <section className="keep-light relative grid items-center gap-6 overflow-hidden rounded-[22px] bg-[linear-gradient(120deg,#2F57C9_0%,#3F6FE8_45%,#6B8BFF_100%)] p-6 text-[#FFFFFF] sm:p-9 md:grid-cols-[minmax(0,1fr)_230px]">
            {p.bestValue && <span className="absolute -right-12 top-6 rotate-[40deg] bg-[#072061] px-14 py-1 text-[11.5px] font-extrabold tracking-[0.04em] text-[#FFFFFF]">BEST VALUE</span>}
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1.5">{['Package', ...p.exams.slice(0, 2), ...subjects.slice(0, 2), p.months ? `${p.months} months` : null].filter(Boolean).map(t => <span key={t} className="inline-flex h-7 items-center rounded-md bg-[rgba(255,255,255,0.22)] px-2.5 text-[13px] font-bold">{t}</span>)}</div>
              <h1 className="mt-4 text-[30px] font-extrabold leading-[1.06] tracking-[-0.03em] text-[#FFFFFF] sm:text-[38px]">{p.name.replace(/\s+Package$/i, '')}</h1>
              {p.description && <p className="mt-3 line-clamp-3 max-w-[520px] whitespace-pre-line text-[15.5px] leading-relaxed text-[#EEF3FF]">{p.description}</p>}
              {badges.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {badges.map(([icon, label, href]) => {
                    const cls = 'inline-flex h-7 items-center gap-1.5 rounded-md bg-[#FFFFFF] px-2.5 text-[13px] font-bold text-[#2F57C9]';
                    return href ? <a key={label} href={href} className={`${cls} hover:bg-[#EAF0FF]`}><Icon name={icon} size={14} />{label}</a> : <span key={label} className={cls}><Icon name={icon} size={14} />{label}</span>;
                  })}
                </div>
              )}
              {p.teachers.length > 0 && (
                <div className="mt-5 flex items-center gap-3">
                  <div className="flex">{p.teachers.slice(0, 3).map((t, i) => (
                    <span key={(t.name ?? '') + i} className={`flex h-[46px] w-[46px] items-center justify-center overflow-hidden rounded-[12px] bg-[#FFFDF8] text-[15px] font-extrabold text-[#3F6FE8] shadow-[0_10px_22px_rgba(7,32,97,0.3)] ${i ? '-ml-2.5' : ''} ${['-rotate-[4deg]', 'rotate-3', '-rotate-2'][i]}`}>
                      {t.avatarUrl ? <img src={t.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(t.name ?? '')}
                    </span>
                  ))}</div>
                  <span className="min-w-0"><b className="block truncate text-[15px]">{p.teachers.slice(0, 2).map(t => t.name).join(', ')}{p.teachers.length > 2 ? ` and ${p.teachers.length - 2} more` : ''}</b>{p.courses.some(c => !c.teacher) && <span className="text-[13px] text-[#DCE6FF]">and the CareerPath team</span>}</span>
                </div>
              )}
            </div>
            <div aria-hidden className="relative hidden h-[190px] md:block">
              {p.courses.slice(0, 2).map((c, i) => (
                <span key={c.id} className={`absolute h-[96px] w-[150px] overflow-hidden rounded-xl shadow-[0_14px_30px_rgba(7,32,97,0.35)] ${TILT[i]}`}>
                  <Cover src={c.coverUrl} label={c.subject ?? c.title} seed={c.id} className="h-full w-full" />
                </span>
              ))}
              <span className="absolute left-[74px] top-1 flex h-[96px] w-[150px] rotate-6 flex-col items-center justify-center rounded-xl bg-[#FFFFFF] text-[#2F57C9] shadow-[0_14px_30px_rgba(7,32,97,0.35)]">
                <b className="text-[30px] leading-none tracking-[-0.02em]">{p.counts.courses}</b><span className="mt-1 text-[10px] font-extrabold tracking-[0.06em] text-[#637090]">COURSE{p.counts.courses === 1 ? '' : 'S'}</span>
              </span>
            </div>
          </section>

          {p.description && (
            <section className="pt-9 lg:px-6">
              <h2 className="mb-3 text-[26px] font-extrabold tracking-[-0.025em]">What’s in the package</h2>
              <ReadMore text={p.description} />
            </section>
          )}

          <section className="mt-8 border-t border-line pt-8 lg:mx-6">
            <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
              <h2 className="text-[26px] font-extrabold tracking-[-0.025em]">{owned ? 'Your courses' : 'Courses inside'}</h2>
              <span className="text-[14px] text-muted">{s(p.counts.courses, 'course')}{owned ? ` · ${started.length} started` : subjects.length ? ` · ${s(subjects.length, 'subject')}` : ''}</span>
              {owned ? <YourCourses rows={mine.map(x => ({ id: x.c.id, title: x.c.title, coverUrl: x.c.coverUrl, subject: x.c.subject, lessons: x.c.lessons, pct: x.l?.pct ?? 0, next: x.l?.next?.title ?? null, href: x.c.lessons ? learn(x) : `/student/courses/${x.c.id}` }))} /> : <PackageCourses courses={p.courses} />}
            </div>
            {soon > 0 && <p className="mt-2 text-[12.5px] text-muted">“Lessons coming”: the course is on careerpathafrica.com and its lessons are being moved into the portal. They appear in your package as soon as they’re here.</p>}
          </section>

          {p.liveClass && (
            <section id="live-class" className="mt-9 scroll-mt-24 border-t border-line pt-8 lg:mx-6">
              <h2 className="mb-3.5 text-[26px] font-extrabold tracking-[-0.025em]">Your live class</h2>
              <LiveClassCard c={p.liveClass} currency={p.currency} />
            </section>
          )}

          {showMentoring && (
            <section id="mentoring" className="mt-9 scroll-mt-24 border-t border-line pt-8 lg:mx-6">
              <h2 className="mb-3.5 text-[26px] font-extrabold tracking-[-0.025em]">Mentoring</h2>
              <div className="keep-light text-navy"><MentoringCard perMonth={p.mentorship ? mentoring : p.addOns.mentorship!.perMonth} included={!!p.mentorship} addOnPrice={p.addOns.mentorship?.price ?? null} currency={p.currency} mentors={p.mentors!} /></div>
            </section>
          )}

          {p.teachers.length > 0 && (
            <section className="mt-9 border-t border-line pt-8 lg:mx-6">
              <h2 className="mb-3.5 text-[26px] font-extrabold tracking-[-0.025em]">Your teachers</h2>
              <div className="keep-light grid gap-3.5 text-navy sm:grid-cols-2">
                {p.teachers.slice(0, 6).map((t, i) => {
                  const card = (
                    <>
                      <span className={`flex h-[76px] w-[76px] flex-shrink-0 items-center justify-center overflow-hidden rounded-[18px] bg-[#FFFDF8] text-[26px] font-extrabold text-azure-strong shadow-[0_12px_26px_rgba(7,32,97,0.22)] ${i % 2 ? 'rotate-3' : '-rotate-3'}`}>
                        {t.avatarUrl ? <img src={t.avatarUrl} alt="" loading="lazy" className="h-full w-full object-cover" /> : initials(t.name ?? '')}
                      </span>
                      <span className="min-w-0">
                        <b className="block text-[17px]">{t.name}</b>
                        <span className="block text-[13px] text-ink2">{[t.subjects.slice(0, 2).join(' · '), t.yearsExperience ? `${t.yearsExperience} yrs` : null].filter(Boolean).join(' · ')}</span>
                        <span className="mt-1 flex items-center gap-1 text-[12.5px] font-extrabold text-[#2F57C9]">{s(t.courses, 'course')} here{t.slug && <> · Profile<Icon name="arrowRight" size={12} /></>}</span>
                      </span>
                    </>
                  );
                  return t.slug
                    ? <Link key={t.slug} href={`/teachers/${t.slug}`} className="flex items-center gap-3.5 rounded-[18px] bg-[linear-gradient(135deg,#EAF0FF,#DCE6FF)] p-[18px] hover:shadow-[0_10px_24px_rgba(7,32,97,0.12)]">{card}</Link>
                    : <div key={(t.name ?? '') + i} className="flex items-center gap-3.5 rounded-[18px] bg-[linear-gradient(135deg,#EAF0FF,#DCE6FF)] p-[18px]">{card}</div>;
                })}
              </div>
            </section>
          )}

          <section className="mt-9 border-t border-line pt-8 lg:mx-6">
            <h2 className="mb-3.5 text-[26px] font-extrabold tracking-[-0.025em]">How a month works</h2>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {([
                ['notebook', 'Every week', 'Lessons and notes at your own pace'],
                ['sparkles', 'Every day', 'A 10-question warm-up in the Test Centre'],
                ...(mentoring ? [['mentorship', mentoring === 1 ? 'Once a month' : `${mentoring} times a month`, '30 minutes one-to-one with a mentor']] : []),
                ...(p.live ? [['live', 'Every week', `Live classes with ${p.live.cohort}`]] : []),
                ['grade', 'When ready', 'A timed mock exam, like the real paper'],
              ] as [IconName, string, string][]).slice(0, 4).map(([icon, when, what]) => (
                <div key={what} className="rounded-xl border border-line bg-white p-3.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent-soft text-azure-strong"><Icon name={icon} size={16} /></span>
                  <b className="mt-2 block text-[12.5px] uppercase tracking-[0.05em] text-azure-strong">{when}</b>
                  <p className="mt-1 text-[14px] leading-snug">{what}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-9 border-t border-line pt-8 lg:mx-6">
            <h2 className="mb-3.5 text-[26px] font-extrabold tracking-[-0.025em]">One course, or the package?</h2>
            <div className="overflow-hidden rounded-xl border border-line bg-white text-[14.5px]">
              <div className="grid grid-cols-[1.4fr_1fr_1fr] border-b border-line px-[18px] py-3 text-[12px] font-extrabold uppercase tracking-[0.06em] text-muted"><span /><span>One course</span><span className="text-azure-strong">This package</span></div>
              {[
                ['Courses', '1', String(p.counts.courses)],
                ['Mentoring', '—', mentoring ? (mentoring === 1 ? '1 session a month' : `${mentoring} sessions a month`) : p.addOns.mentorship ? 'Can be added' : '—'],
                ['Live classes', '—', p.live ? 'Included' : p.addOns.live ? 'Can be added' : '—'],
                ['Access', 'Per course', p.months ? `${p.months} months` : 'While on sale'],
                ...(p.worth ? [['Price', price(p.worth, p.currency) + ' bought one by one', price(p.priceAmount, p.currency)]] : []),
              ].map(([l, a, b]) => (
                <div key={l} className="grid grid-cols-[1.4fr_1fr_1fr] border-b border-line px-[18px] py-3 last:border-b-0"><span>{l}</span><span className={a === '—' ? 'text-muted' : ''}>{a}</span><b className={b === '—' ? 'font-normal text-muted' : ''}>{b}</b></div>
              ))}
            </div>
          </section>

          <section className="mt-9 border-t border-line pt-8 lg:mx-6">
            <h2 className="mb-2 text-[26px] font-extrabold tracking-[-0.025em]">Frequently asked questions</h2>
            {faq.map(([q, a]) => (
              <details key={q} className="group border-t border-line first:border-t-0">
                <summary className="flex cursor-pointer list-none items-center gap-3 py-4 text-[16px] font-bold"><span className="flex-1">{q}</span><span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-azure-strong"><Icon name="chevronRight" size={15} className="transition-transform group-open:rotate-90" /></span></summary>
                <p className="pb-4 pr-12 text-[15px] leading-relaxed text-ink2">{a}</p>
              </details>
            ))}
          </section>
        </div>

        <aside className="order-first flex flex-col gap-[18px] lg:sticky lg:top-20 lg:order-last">
          {owned ? (
            <div className="flex flex-col gap-3 rounded-[20px] border border-line bg-white p-4 shadow-[0_18px_44px_rgba(7,32,97,0.12)]">
              <div className="flex items-start gap-2.5 rounded-xl border border-[rgba(46,170,95,0.35)] bg-[rgba(23,112,58,0.1)] p-3 text-[13.5px]">
                <Icon name="check" size={16} className="mt-0.5 text-[#2EAA5F]" />
                <span><b className="block">This package is yours</b><span className="text-ink2">{owned.until ? `Until ${new Date(owned.until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'No time limit'} · {started.length} of {s(p.counts.courses, 'course')} started</span></span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                {([[p.counts.lessons, 'lessons'], [p.counts.questions, 'questions'], [p.months ?? '∞', 'months']] as [number | string, string][]).map(([n, l]) => <span key={l} className="rounded-[10px] bg-subtle p-2 text-[12px] text-muted"><b className="block text-[19px] text-navy">{n}</b>{l}</span>)}
              </div>
              {nextUp && <Link href={learn(nextUp)} className="flex h-12 items-center justify-center gap-1.5 rounded-lg bg-azure-strong px-3 text-center text-[14.5px] font-extrabold text-on-accent">{nextUp.l?.state === 'going' ? 'Continue' : 'Start'} {cardTitle(nextUp.c.title).title}<Icon name="arrowRight" size={15} /></Link>}
              <Link href="/student/tests" className="flex h-11 items-center justify-center rounded-lg border border-line text-[14px] font-extrabold text-navy hover:bg-subtle">Practise in the Test Centre</Link>
              {(p.addOns.live || p.addOns.mentorship) && <Link href={`/packages/${p.id}/checkout?add=${p.addOns.mentorship ? 'mentorship' : 'live'}`} className="flex h-11 items-center justify-center gap-1.5 rounded-lg border border-line text-[14px] font-extrabold text-navy hover:bg-subtle"><Icon name="mentorship" size={15} />Add {p.addOns.mentorship ? 'a mentor' : 'live classes'}</Link>}
              {mentoring && <Link href="/student/mentorship" className="text-center text-[13px] font-bold text-azure-strong hover:underline">Book this month’s mentor session →</Link>}
            </div>
          ) : (
          <div className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-white p-4 shadow-[0_18px_44px_rgba(7,32,97,0.12)]">
            <div className="pt-1 text-center">
              <span className="text-[12px] font-extrabold uppercase tracking-[0.06em] text-muted">One price{p.months ? `, ${p.months} months` : ''}</span>
              <b className="mt-1 block text-[34px] font-extrabold tracking-[-0.02em]">{price(p.priceAmount, p.currency)}</b>
              {monthly && <p className="mt-0.5 text-[13.5px] text-muted">{monthly}</p>}
              {p.worth && <p className="mt-1 text-[13px] font-bold text-[#17703A]">Save {price(p.worth - p.priceAmount, p.currency)} on buying them one by one</p>}
            </div>
            <Link href={checkout} className="flex h-12 items-center justify-center rounded-lg bg-[#2F57C9] text-[15.5px] font-extrabold text-[#FFFFFF] hover:bg-[#2548AE]">Get the package</Link>
            <p className="-mt-1 text-center text-[13px] text-muted">Pay with MTN MoMo, Orange Money or card</p>
            <div className="h-px bg-line" />
            <div className="grid grid-cols-2 gap-2">
              {tiles.map(([icon, label]) => (
                <div key={label} className="flex items-center gap-2.5 rounded-[10px] bg-subtle p-2.5 text-[13px] font-bold leading-tight text-navy">
                  <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-azure-strong"><Icon name={icon} size={16} /></span>{label}
                </div>
              ))}
            </div>
            {(p.addOns.live || p.addOns.mentorship) && (
              <div className="rounded-[10px] border border-line p-3 text-[13.5px]">
                <b className="mb-1 block">Add at checkout</b>
                {p.addOns.live && <p>Live classes ({p.addOns.live.cohort}) · <b>{price(p.addOns.live.price, p.currency)}</b></p>}
                {p.addOns.mentorship && <p>A mentor, {s(p.addOns.mentorship.perMonth, 'session')} a month · <b>{price(p.addOns.mentorship.price, p.currency)}</b></p>}
              </div>
            )}
            {!portal && <p className="rounded-[10px] bg-accent-soft p-3 text-[13.5px] leading-relaxed"><b>Buying for a class?</b> Schools get seats at a price per student. <Link href="/schools" className="font-extrabold text-azure-strong hover:underline">For schools →</Link></p>}
          </div>
          )}

          {p.others!.length > 0 && (
            <div className="hidden flex-col gap-2.5 rounded-[20px] bg-[#072061] p-[18px] text-[#FFFFFF] lg:flex">
              <b className="text-center text-[17px]">Other packages</b>
              {p.others!.slice(0, 3).map(o => (
                <Link key={o.id} href={o.published === false ? `/packages/${o.id}?preview=1` : `/packages/${o.id}`} className="group flex flex-col gap-2 rounded-[14px] bg-[rgba(255,255,255,0.07)] p-3.5 hover:bg-[rgba(255,255,255,0.12)]">
                  <span className="flex items-start gap-3"><b className="flex-1 text-[15px] leading-snug">{o.name}{o.published === false && <span className="ml-1.5 rounded bg-[rgba(255,241,214,0.9)] px-1.5 py-0.5 align-middle text-[10.5px] font-extrabold text-[#8A5A00]">Draft</span>}</b><span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[rgba(255,255,255,0.14)]"><Icon name="packages" size={15} /></span></span>
                  <span className="text-[12.5px] text-[#C9D4F2]">{[s(o.courses, 'course'), o.months ? `${o.months} months` : null, price(o.priceAmount, o.currency)].filter(Boolean).join(' · ')}</span>
                  <span className="flex items-center justify-end gap-1 text-[12.5px] font-bold text-[#7FA3FF]">Details<Icon name="arrowRight" size={13} /></span>
                </Link>
              ))}
              <AllCard href="/packages" dark label="Compare all packages" />
            </div>
          )}

          {p.moreByTeacher!.length > 0 && <div className="keep-light hidden text-navy lg:block"><MoreFromTeachers teachers={p.moreByTeacher!} /></div>}
        </aside>

        {/* Phones: the lists move under the content */}
        {(p.others!.length > 0 || p.moreByTeacher!.length > 0) && (
          <div className="flex flex-col gap-4 lg:hidden">
            {p.moreByTeacher!.length > 0 && <div className="keep-light text-navy"><MoreFromTeachers teachers={p.moreByTeacher!} /></div>}
            {p.others!.length > 0 && <AllCard href="/packages" label="Compare all packages" />}
          </div>
        )}
      </main>

      {!owned && <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-line bg-white px-4 py-3 lg:hidden" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        <span className="min-w-0"><b className="block text-[18px] leading-tight">{price(p.priceAmount, p.currency)}</b><span className="text-[11.5px] text-muted">{p.months ? `${p.months} months · ` : ''}{s(p.counts.courses, 'course')}</span></span>
        <Link href={checkout} className="flex h-11 flex-1 items-center justify-center rounded-lg bg-[#2F57C9] text-[15px] font-extrabold text-[#FFFFFF]">Get the package</Link>
      </div>}
      {!portal && <PublicFooter />}
    </div>
  );
}
