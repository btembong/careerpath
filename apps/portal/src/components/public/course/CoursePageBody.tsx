import Link from 'next/link';
import { Cover, PayWith, price } from '@/components/public/PublicChrome';
import { Icon, type IconName } from '@/components/ui/Icon';
import { LessonPreview, type Preview } from './LessonPreview';
import { AllCard, CourseCard, CourseContent, ExamMore, ReadMore, type Lesson, type MiniCourse } from './CourseParts';

export interface CoursePage {
  id: string; slug: string; title: string; shortDescription: string | null; description: string | null; outcomes: string[]; coverUrl: string | null;
  language: string; accessMonths: number | null; updatedAt: string; exam: string | null; subject: string | null; level: string | null;
  selling: 'free' | 'paid' | 'package' | 'notsale'; price: { amount: number; currency: string } | null; students: number;
  teacher: { slug: string | null; name: string | null; avatarUrl: string | null; bio: string | null; hasVideo: boolean; subjects: string[]; yearsExperience: number | null; country: string | null; courses: number } | null;
  modules: { title: string; lessons: Lesson[] }[];
  counts: { lessons: number; videos: number; notes: number; quizzes: number; live: number; questions: number; minutes: number };
  packages: { id: string; name: string; priceAmount: number; currency: string; courses: number; months: number | null }[];
  examCountries: { code: string; name: string }[];
  teacherMore: MiniCourse[]; examMore: MiniCourse[];
  preview?: Preview | null;
}

const s = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const initials = (n: string) => n.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
// "Cameroon GCE, Form Upper Sixth. Biology – The Nervous System" → "The Nervous System" and "Cameroon GCE · Form Upper Sixth"
function splitTitle(t: string) {
  const m = /^(.*?)[–—-]\s+([^–—-]+)$/.exec(t);
  if (!m || m[2].length < 4) return { main: t, sub: null as string | null };
  return { main: m[2].trim(), sub: m[1].replace(/[.,]\s*(Biology|Chemistry|Physics|English Language|Literature in English|Human Biology|Mathematics)\s*$/i, '').replace(/[.,]\s*/g, ' · ').replace(/\s·\s*$/, '').trim() };
}
export { splitTitle };

/**
 * The course page's body: the blue card, about, topics, the teacher, content, packages, questions, and the sidebar.
 * The public site shows it to visitors; the portal shows it to students who don't have the course yet (`portal`),
 * with `start` and `buy` going straight in instead of through sign-up.
 */
export function CoursePageBody({ c, start, buy, portal }: { c: CoursePage; start: string; buy: string; portal?: boolean }) {
  const pack = c.packages[0];
  const { main, sub } = splitTitle(c.title);
  const firstFree = c.modules.flatMap(m => m.lessons).find(l => l.free);
  const teacher = c.teacher;
  const country = c.examCountries.length === 1 ? c.examCountries[0].name : c.exam && !c.examCountries.length ? 'International' : null;
  const [examTop, ...examRest] = (c.exam ?? '').split(/\s+/);
  const topics = c.outcomes.length ? c.outcomes : c.modules.flatMap(m => m.lessons).filter(l => l.type !== 'QUIZ').map(l => l.title.replace(/^\d+[.)]\s*/, '')).slice(0, 8);
  const priceLabel = c.selling === 'paid' && c.price ? price(c.price.amount, c.price.currency) : c.selling === 'free' ? 'Free' : pack ? price(pack.priceAmount, pack.currency) : 'Coming soon';
  const ribbon = c.selling === 'free' ? 'FREE' : c.selling === 'paid' && c.price ? price(c.price.amount, c.price.currency) : c.selling === 'package' ? 'PACKAGE' : null;
  const main_cta = c.selling === 'paid' ? { href: buy, label: 'Buy the course' } : c.selling === 'package' && pack ? { href: `/packages/${pack.id}`, label: `See ${pack.name}` } : { href: start, label: 'Start this course free' };
  const tiles: [IconName, string][] = [
    ['notebook', s(c.modules.length, 'module')], ['list', s(c.counts.lessons, 'lesson')],
    ...(c.counts.videos ? [['play', s(c.counts.videos, 'video')] as [IconName, string]] : []),
    ...(c.counts.notes ? [['docLine', s(c.counts.notes, 'note')] as [IconName, string]] : []),
    ...(c.counts.quizzes ? [['question', s(c.counts.quizzes, 'quiz', 'quizzes')] as [IconName, string]] : []),
    ...(c.counts.questions ? [['grade', s(c.counts.questions, 'practice question')] as [IconName, string]] : []),
    ...(c.counts.live ? [['live', s(c.counts.live, 'live class', 'live classes')] as [IconName, string]] : []),
    ['certificates', 'Certificate'], ['globe', c.language], ['phone', 'Phone and data saver'],
  ];
  return (
    <>
      <main className={`mx-auto grid w-full max-w-[1252px] items-start gap-8 px-4 pb-28 ${portal ? 'pt-5 lg:px-7' : 'pt-4 sm:px-8'} lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-12 lg:pb-16`}>
        <div className="flex min-w-0 flex-col">
          {/* The coloured card: what the course is */}
          <section className="keep-light relative grid items-center gap-6 overflow-hidden rounded-[22px] bg-[linear-gradient(120deg,#2F57C9_0%,#3F6FE8_45%,#6B8BFF_100%)] p-6 text-[#FFFFFF] sm:p-9 md:grid-cols-[minmax(0,1fr)_200px]">
            {ribbon && <span className={`absolute -right-11 top-5 rotate-[40deg] px-12 py-1 text-[12px] font-extrabold tracking-[0.04em] text-[#FFFFFF] ${c.selling === 'free' ? 'bg-[#17703A]' : 'bg-[#072061]'}`}>{ribbon}</span>}
            <div className="min-w-0">
              <div className="flex flex-wrap gap-1.5">{[c.exam, c.subject, c.level, c.language].filter(Boolean).map(t => <span key={t} className="inline-flex h-7 items-center rounded-md bg-[rgba(255,255,255,0.22)] px-2.5 text-[13px] font-bold">{t}</span>)}</div>
              <h1 className="mt-4 text-[30px] font-extrabold leading-[1.06] tracking-[-0.03em] text-[#FFFFFF] sm:text-[38px]">{main}</h1>
              {sub && <p className="mt-1 text-[14px] text-[#DCE6FF]">{sub}</p>}
              {(c.shortDescription || c.description) && <p className="mt-3 line-clamp-3 max-w-[540px] text-[15.5px] leading-relaxed text-[#EEF3FF]">{c.shortDescription ?? c.description}</p>}
              <div className="mt-5 flex items-center gap-3">
                <span className="flex h-14 w-14 flex-shrink-0 -rotate-3 items-center justify-center overflow-hidden rounded-[14px] bg-[#FFFDF8] text-[18px] font-extrabold text-azure-strong shadow-[0_10px_22px_rgba(7,32,97,0.3)]">
                  {teacher?.avatarUrl ? <img src={teacher.avatarUrl} alt="" className="h-full w-full object-cover" /> : teacher?.name ? initials(teacher.name) : 'c'}
                </span>
                <span className="min-w-0"><b className="block text-[16px]">{teacher?.name ?? 'CareerPath Africa'}</b><span className="text-[13px] text-[#DCE6FF]">{teacher ? [teacher.subjects[0] ? `${teacher.subjects[0]} teacher` : 'Teacher', teacher.yearsExperience ? `${teacher.yearsExperience} years` : null, teacher.country].filter(Boolean).join(' · ') : 'Made by the CareerPath Africa team'}</span></span>
              </div>
            </div>
            {c.exam ? (
              <div aria-hidden className="hidden h-[210px] w-[190px] flex-col items-center justify-center justify-self-center bg-[#072061] text-center [clip-path:polygon(50%_0,100%_25%,100%_75%,50%_100%,0_75%,0_25%)] md:flex">
                {examRest.length ? <><span className="text-[12px] font-extrabold tracking-[0.12em] text-[#7FA3FF]">{examTop}</span><span className="mt-1 px-3 text-[26px] font-extrabold leading-none">{examRest.join(' ')}</span></> : <span className="px-3 text-[26px] font-extrabold leading-none">{examTop}</span>}
                {c.subject && <><span className="my-2.5 h-px w-[70px] bg-[rgba(255,255,255,0.3)]" /><span className="px-3 text-[15px] font-extrabold leading-tight">{c.subject}</span></>}
                {country && <span className="mt-1 text-[11px] font-bold tracking-[0.14em] text-[#9AA8D2]">{country.toUpperCase()}</span>}
              </div>
            ) : (
              <Cover src={c.coverUrl} label={c.subject ?? c.title} seed={c.id} className="hidden h-[150px] w-[200px] rounded-xl md:block" />
            )}
          </section>

          {c.description && (
            <section className="pt-9 lg:px-6">
              <h2 className="mb-3 text-[26px] font-extrabold tracking-[-0.025em]">About this course</h2>
              <ReadMore text={c.description} />
            </section>
          )}

          {topics.length > 0 && (
            <section className="mt-8 border-t border-line pt-8 lg:mx-6">
              <h2 className="mb-3.5 text-[26px] font-extrabold tracking-[-0.025em]">{c.outcomes.length ? 'What you’ll be able to do' : 'Key topics'}</h2>
              <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">{topics.map(t => <li key={t} className="flex gap-2.5 text-[15px] leading-snug text-ink2"><Icon name="checkLine" size={18} className="mt-px flex-shrink-0 text-azure-strong" />{t}</li>)}</ul>
            </section>
          )}

          {/* The teacher, big */}
          <section className="keep-light mt-9 grid items-center gap-6 rounded-[22px] bg-[linear-gradient(135deg,#EAF0FF_0%,#DCE6FF_100%)] text-navy p-6 sm:grid-cols-[170px_minmax(0,1fr)] sm:p-8">
            <span className="flex h-[150px] w-[150px] -rotate-3 items-center justify-center overflow-hidden rounded-[26px] bg-[#FFFDF8] text-[48px] font-extrabold text-azure-strong shadow-[0_14px_30px_rgba(7,32,97,0.25)] sm:h-[170px] sm:w-[170px]">
              {teacher?.avatarUrl ? <img src={teacher.avatarUrl} alt={teacher.name ?? ''} className="h-full w-full object-cover" /> : teacher?.name ? initials(teacher.name) : 'c'}
            </span>
            <div className="min-w-0">
              <p className="text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-[#2F57C9]">{teacher ? 'About your teacher' : 'Who made this course'}</p>
              <p className="mt-1.5 text-[28px] font-extrabold leading-tight tracking-[-0.025em]">{teacher?.name ?? 'CareerPath Africa'}</p>
              <p className="mt-0.5 text-[14px] text-ink2">{teacher ? [teacher.subjects.slice(0, 3).join(' · '), teacher.yearsExperience ? `${teacher.yearsExperience} years teaching` : null, teacher.country].filter(Boolean).join(' · ') : 'Our team, until a teacher takes it on'}</p>
              {teacher?.bio && <p className="mt-3 line-clamp-4 text-[15px] leading-relaxed text-ink2">{teacher.bio}</p>}
              {teacher?.slug && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/teachers/${teacher.slug}`} className="inline-flex h-11 items-center rounded-lg border border-[#D5DDEC] bg-[#FFFFFF] px-4 text-[14.5px] font-extrabold text-navy hover:bg-subtle">See {teacher.name?.split(' ')[0]}’s profile →</Link>
                  {teacher.hasVideo && <Link href={`/teachers/${teacher.slug}`} className="inline-flex h-11 items-center gap-2 rounded-lg border border-[#D5DDEC] bg-[#FFFFFF] px-4 text-[14.5px] font-extrabold text-navy hover:bg-subtle"><Icon name="play" size={15} className="text-azure-strong" />Watch intro</Link>}
                </div>
              )}
            </div>
          </section>

          {c.modules.length > 0 && (
            <section className="mt-9 border-t border-line pt-8 lg:mx-6">
              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
                <h2 className="text-[26px] font-extrabold tracking-[-0.025em]">Course content</h2>
                <span className="text-[14px] text-muted">{[s(c.modules.length, 'module'), s(c.counts.lessons, 'lesson'), c.counts.questions ? s(c.counts.questions, 'practice question') : null, c.counts.minutes > 0 ? `${Math.round(c.counts.minutes / 6) / 10} hours of video` : null].filter(Boolean).join(' · ')}</span>
                <CourseContent modules={c.modules} start={start} />
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-muted"><Icon name="lock" size={13} />{c.selling === 'free' ? (portal ? 'Locked lessons open when you start the course.' : 'Locked lessons open with a free account.') : 'Locked lessons open once you have the course.'}</p>
            </section>
          )}

          {c.packages.length > 0 && (
            <section className="mt-9 border-t border-line pt-8 lg:mx-6">
              <h2 className="mb-3 text-[26px] font-extrabold tracking-[-0.025em]">Also in a package</h2>
              <div className="flex flex-col gap-3">
                {c.packages.map(p => (
                  <Link key={p.id} href={`/packages/${p.id}`} className="flex flex-wrap items-center gap-4 rounded-xl border-2 border-azure-strong bg-white p-4 hover:bg-subtle">
                    <Icon name="packages" size={28} className="text-azure-strong" />
                    <span className="min-w-0 flex-1"><b className="block text-[16px]">{p.name}</b><span className="text-[13.5px] text-muted">This course and {p.courses - 1} more{p.months ? ` · ${p.months} months` : ''} · {price(p.priceAmount, p.currency)}</span></span>
                    <span className="text-[14px] font-bold text-azure-strong">See the package →</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section className="mt-9 border-t border-line pt-8 lg:mx-6">
            <h2 className="mb-2 text-[26px] font-extrabold tracking-[-0.025em]">Frequently asked questions</h2>
            {[
              [c.selling === 'free' ? 'Is this course really free?' : 'How long can I use it?', c.selling === 'free' ? 'Yes. Create a free account and every lesson opens; no card needed.' : c.accessMonths ? `${c.accessMonths} months from the day you start, at your own pace.` : 'For as long as the course is on CareerPath.'],
              ['Do I get a certificate?', 'Yes, when you finish every lesson. Each certificate has a code anyone can check on our site.'],
              ['Can I study it on my phone?', 'Yes, in your phone’s browser or installed like an app. Data saver plays lighter videos on mobile data.'],
              ['How do I practise for the paper?', c.counts.questions ? `This course has ${s(c.counts.questions, 'practice question')}. Practise them lesson by lesson, or build a timed test in the Test Centre.` : 'Each lesson has practice, and the Test Centre lets you build timed tests and take mock exams.'],
              ['Can I pay with MTN or Orange Money?', 'Yes. Pay with MTN Mobile Money, Orange Money or a card, and you get a receipt by email.'],
            ].map(([q, a]) => (
              <details key={q} className="group border-t border-line first:border-t-0">
                <summary className="flex cursor-pointer list-none items-center gap-3 py-4 text-[16px] font-bold"><span className="flex-1">{q}</span><span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-azure-strong"><Icon name="chevronRight" size={15} className="transition-transform group-open:rotate-90" /></span></summary>
                <p className="pb-4 pr-12 text-[15px] leading-relaxed text-ink2">{a}</p>
              </details>
            ))}
          </section>
        </div>

        {/* The sidebar: stays in view on computers */}
        <aside className="order-first flex flex-col gap-[18px] lg:sticky lg:top-20 lg:order-last">
          <div className="flex flex-col gap-3.5 rounded-[20px] border border-line bg-white p-3.5 shadow-[0_18px_44px_rgba(7,32,97,0.12)]">
            {c.preview ? <LessonPreview p={c.preview} href={firstFree ? start : main_cta.href} /> : (
            <Link href={firstFree ? start : main_cta.href} className="group relative block h-[190px] overflow-hidden rounded-[14px]">
              <Cover src={c.coverUrl} label={[c.exam, c.subject].filter(Boolean).join(' · ') || c.title} seed={c.id} className="h-full w-full" />
              {firstFree && <>
                <span className="absolute inset-0 bg-[rgba(7,32,97,0.35)]" />
                <span className="absolute left-1/2 top-1/2 flex h-14 w-14 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[rgba(7,32,97,0.85)] text-[#FFFFFF] transition-transform group-hover:scale-105"><Icon name="play" size={22} /></span>
                <span className="absolute bottom-3 left-3 rounded-md bg-[#FFFFFF] px-2.5 py-1 text-[12px] font-extrabold text-navy">Preview “{firstFree.title.replace(/^\d+[.)]\s*/, '')}” free</span>
              </>}
            </Link>
            )}
            <div className="text-center"><b className="text-[30px] font-extrabold tracking-[-0.02em]">{priceLabel}</b><p className="mt-0.5 text-[13.5px] text-muted">{c.selling === 'free' ? 'with a free account · no card needed' : c.selling === 'package' && pack ? `in ${pack.name}` : c.accessMonths ? `${c.accessMonths} months access` : ''}</p></div>
            <Link href={main_cta.href} className="flex h-12 items-center justify-center rounded-lg bg-[#2F57C9] text-[15.5px] font-extrabold text-[#FFFFFF] hover:bg-[#2548AE]">{main_cta.label}</Link>
            {c.selling !== 'free' && firstFree && <Link href={start} className="flex h-11 items-center justify-center rounded-lg border border-line text-[14.5px] font-extrabold text-navy hover:bg-subtle">Try a free lesson first</Link>}
            {!portal && <p className="-mt-1 text-center text-[13px] text-muted">Already have an account? <Link href="/login" className="font-bold text-azure-strong hover:underline">Sign in</Link></p>}
            <div className="h-px bg-line" />
            <div className="grid grid-cols-2 gap-2">
              {tiles.map(([icon, label]) => (
                <div key={label} className="flex items-center gap-2.5 rounded-[10px] bg-subtle p-2.5 text-[13px] font-bold leading-tight text-navy">
                  <span className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-lg bg-accent-soft text-azure-strong"><Icon name={icon} size={16} /></span>{label}
                </div>
              ))}
            </div>
            {c.selling === 'paid' && pack && <p className="rounded-[10px] bg-accent-soft p-3 text-[13.5px]">Or get it in <Link href={`/packages/${pack.id}`} className="font-bold text-azure-strong hover:underline">{pack.name}</Link> with {s(pack.courses - 1, 'more course')}.</p>}
            {c.selling !== 'free' && <PayWith className="border-t border-line pt-3" />}
          </div>

          {c.exam && c.examMore.length > 0 && <div className="keep-light hidden text-navy lg:block"><ExamMore exam={c.exam} courses={c.examMore} /></div>}

          {teacher && c.teacherMore.length > 0 && (
            <div className="keep-light hidden flex-col gap-2.5 rounded-[20px] bg-[#EAF0FF] p-[18px] text-navy lg:flex">
              <div className="flex flex-col items-center gap-1.5">
                <span className="flex h-[60px] w-[60px] -rotate-3 items-center justify-center overflow-hidden rounded-[16px] bg-[#FFFDF8] font-extrabold text-azure-strong shadow-[0_10px_22px_rgba(7,32,97,0.2)]">{teacher.avatarUrl ? <img src={teacher.avatarUrl} alt="" className="h-full w-full object-cover" /> : initials(teacher.name ?? '')}</span>
                <b className="text-[16px]">More from {teacher.name}</b>
                {teacher.slug && <Link href={`/teachers/${teacher.slug}`} className="text-[13px] font-extrabold text-[#2F57C9] hover:underline">See profile</Link>}
              </div>
              {c.teacherMore.map(m => <CourseCard key={m.slug} c={m} />)}
              <AllCard href={teacher.slug ? `/teachers/${teacher.slug}` : '/courses'} />
            </div>
          )}
        </aside>

        {/* Phones: the more-courses lists move under the content */}
        {(c.examMore.length > 0 || c.teacherMore.length > 0) && (
          <div className="keep-light flex flex-col gap-4 text-navy lg:hidden">
            {c.exam && c.examMore.length > 0 && <ExamMore exam={c.exam} courses={c.examMore} />}
            {teacher && c.teacherMore.length > 0 && <div className="flex flex-col gap-2.5 rounded-[20px] bg-[#EAF0FF] p-[18px]"><b className="text-[17px]">More from {teacher.name}</b>{c.teacherMore.map(m => <CourseCard key={m.slug} c={m} />)}<AllCard href={teacher.slug ? `/teachers/${teacher.slug}` : '/courses'} /></div>}
          </div>
        )}
      </main>

      {/* Phones: the price and the button, always one tap away */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-line bg-white px-4 py-3 lg:hidden" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        <span className="min-w-0"><b className="block text-[18px] leading-tight">{priceLabel}</b><span className="text-[11.5px] text-muted">{c.selling === 'free' ? 'no card needed' : c.accessMonths ? `${c.accessMonths} months` : c.selling === 'package' ? 'in a package' : ''}</span></span>
        <Link href={main_cta.href} className="flex h-11 flex-1 items-center justify-center rounded-lg bg-[#2F57C9] text-[15px] font-extrabold text-[#FFFFFF]">{c.selling === 'free' ? 'Start free' : main_cta.label}</Link>
      </div>
    </>
  );
}
