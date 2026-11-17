import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Cover, Face, PayWith, PublicFooter, PublicHeader, price } from '@/components/public/PublicChrome';

export const revalidate = 300;

interface Lesson { title: string; type: 'VIDEO' | 'TEXT' | 'QUIZ' | 'LIVE'; free: boolean; minutes: number | null }
interface CoursePage {
  id: string; slug: string; title: string; shortDescription: string | null; description: string | null; outcomes: string[]; coverUrl: string | null;
  language: string; accessMonths: number | null; updatedAt: string; exam: string | null; subject: string | null; level: string | null;
  selling: 'free' | 'paid' | 'package' | 'notsale'; price: { amount: number; currency: string } | null; students: number;
  teacher: { name: string | null; avatarUrl: string | null; bio: string | null; subjects: string[]; country: string | null; courses: number } | null;
  modules: { title: string; lessons: Lesson[] }[];
  counts: { lessons: number; videos: number; notes: number; quizzes: number; live: number; questions: number; minutes: number };
  packages: { id: string; name: string; priceAmount: number; currency: string; courses: number; months: number | null }[];
  related: { slug: string; title: string; coverUrl: string | null; exam: string | null; subject: string | null; teacher: string | null; selling: string; price: { amount: number; currency: string } | null }[];
}

async function load(slug: string): Promise<CoursePage | null> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/catalogue/course-page/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const c = await load((await params).slug);
  if (!c) return { title: 'Course' };
  const where = [c.exam, c.subject].filter(Boolean).join(' · ');
  return {
    title: `${c.title}${where ? ` · ${where}` : ''}`,
    description: c.shortDescription ?? c.description?.slice(0, 160) ?? undefined,
    openGraph: { title: c.title, description: c.shortDescription ?? undefined, images: c.coverUrl ? [c.coverUrl] : undefined },
  };
}

const s = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const ICON: Record<Lesson['type'], [string, string]> = { VIDEO: ['▶', 'bg-[#EAF0FF] text-[#2F57C9]'], TEXT: ['≡', 'bg-[#F1F4FA] text-[#3A4A6B]'], QUIZ: ['?', 'bg-[#FFF1D6] text-[#8A5A00]'], LIVE: ['●', 'bg-[#FDEBF3] text-[#A0306A]'] };

/** The public course page: what a visitor sees before signing in. Signed-in students are sent to their own course page. */
export default async function PublicCoursePage({ params }: { params: Promise<{ slug: string }> }) {
  const c = await load((await params).slug);
  if (!c) notFound();
  const start = `/register?next=${encodeURIComponent(`/student/courses/${c.id}`)}`;
  const buy = `/register?next=${encodeURIComponent(`/student/courses/${c.id}/checkout`)}`;
  const pack = c.packages[0];
  const facts = [
    c.counts.videos && s(c.counts.videos, 'video'),
    c.counts.notes && s(c.counts.notes, 'set of notes', 'sets of notes'),
    c.counts.quizzes && s(c.counts.quizzes, 'quiz', 'quizzes'),
    c.counts.questions && s(c.counts.questions, 'practice question'),
    c.accessMonths && `${c.accessMonths} months access`,
  ].filter(Boolean) as string[];
  const firstFree = c.modules.flatMap(m => m.lessons).find(l => l.free);
  const updated = new Date(c.updatedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });

  const buyCard = (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-[0_22px_44px_rgba(7,32,97,0.16)]">
      <div className="relative">
        <Cover src={c.coverUrl} label={[c.exam, c.subject].filter(Boolean).join(' · ') || c.title} seed={c.id} className="h-[190px] w-full" />
        {firstFree && <Link href={start} className="absolute inset-0 grid place-items-center bg-[#072061]/35 text-white"><span className="flex flex-col items-center gap-2"><span className="grid h-14 w-14 place-items-center rounded-full bg-white text-xl text-[#2F57C9]">▶</span><span className="text-[13px] font-bold">Try the free lesson: {firstFree.title}</span></span></Link>}
      </div>
      <div className="flex flex-col gap-3 p-5">
        <div className="flex items-baseline gap-2">
          <b className="text-[32px] font-extrabold tracking-[-0.02em] text-navy">{c.selling === 'paid' && c.price ? price(c.price.amount, c.price.currency) : c.selling === 'free' ? 'Free' : pack ? price(pack.priceAmount, pack.currency) : 'Coming soon'}</b>
          <span className="text-[13.5px] text-muted">{c.selling === 'free' ? 'for everyone' : c.selling === 'package' && pack ? `in ${pack.name}` : c.accessMonths ? `${c.accessMonths} months` : ''}</span>
        </div>
        {c.selling === 'free' && <Link href={start} className="flex h-12 items-center justify-center rounded-md bg-[#2F57C9] text-[15.5px] font-extrabold text-white hover:bg-[#2548AE]">Start the course</Link>}
        {c.selling === 'paid' && <Link href={buy} className="flex h-12 items-center justify-center rounded-md bg-[#2F57C9] text-[15.5px] font-extrabold text-white hover:bg-[#2548AE]">Buy the course</Link>}
        {c.selling === 'package' && pack && <Link href={`/packages/${pack.id}`} className="flex h-12 items-center justify-center rounded-md bg-[#2F57C9] text-[15.5px] font-extrabold text-white hover:bg-[#2548AE]">See {pack.name}</Link>}
        {c.selling !== 'free' && firstFree && <Link href={start} className="flex h-11 items-center justify-center rounded-md border border-line text-[14.5px] font-bold text-navy hover:bg-subtle">Try a free lesson first</Link>}
        {c.selling === 'paid' && pack && <p className="text-[13px] text-ink2">Or get it in <Link href={`/packages/${pack.id}`} className="font-bold text-azure-strong hover:underline">{pack.name}</Link> with {pack.courses - 1} more course{pack.courses - 1 === 1 ? '' : 's'}.</p>}
        <ul className="mt-1 flex flex-col gap-1.5 text-[13.5px] text-ink2">
          {facts.map(f => <li key={f} className="flex gap-2"><span className="text-[#17703A]">✓</span>{f}</li>)}
          <li className="flex gap-2"><span className="text-[#17703A]">✓</span>On your phone, with data saver</li>
          <li className="flex gap-2"><span className="text-[#17703A]">✓</span>A certificate when you finish</li>
        </ul>
        {c.selling !== 'free' && <PayWith className="border-t border-line pt-3" />}
      </div>
    </div>
  );

  return (
    <div className="keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy">
      <PublicHeader />
      {/* Hero */}
      <section className="bg-[#3F6FE8]">
        <div className="mx-auto grid max-w-[1240px] gap-8 px-4 pb-10 pt-8 sm:px-8 lg:grid-cols-[minmax(0,1fr)_370px] lg:pb-12">
          <div className="flex min-w-0 flex-col gap-3 lg:pr-4">
            <nav className="flex flex-wrap gap-1.5 text-[13px] font-bold text-[#0B1F55]" aria-label="Where it sits">
              <Link href="/courses" className="hover:underline">Courses</Link>{c.exam && <><span>›</span><span>{c.exam}</span></>}{c.subject && <><span>›</span><span>{c.subject}</span></>}
            </nav>
            <h1 className="text-[32px] font-extrabold leading-[1.05] tracking-[-0.03em] text-navy sm:text-[42px]">{c.title}</h1>
            {(c.shortDescription || c.description) && <p className="max-w-[640px] text-[16.5px] leading-relaxed text-[#0B1F55]">{c.shortDescription ?? c.description!.slice(0, 220)}</p>}
            <div className="mt-1 flex items-center gap-2.5 text-[14px] text-[#0B1F55]">
              <Face name={c.teacher?.name ?? 'CareerPath Africa'} src={c.teacher?.avatarUrl} size={34} />
              <span>By <b className="text-navy">{c.teacher?.name ?? 'CareerPath Africa'}</b> · {c.language}{c.level ? ` · ${c.level}` : ''} · Updated {updated}{c.students > 4 ? ` · ${c.students} students` : ''}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {facts.map(f => <span key={f} className="inline-flex h-8 items-center rounded-md bg-white/25 px-3 text-[13px] font-bold text-navy">{f}</span>)}
            </div>
          </div>
        </div>
      </section>

      <main className="mx-auto grid w-full max-w-[1240px] gap-8 px-4 pb-24 sm:px-8 lg:grid-cols-[minmax(0,1fr)_370px] lg:pb-14">
        {/* Buying card: under the hero on phones, beside the page (and following it) on computers */}
        <div className="order-first -mt-6 lg:order-last lg:-mt-[260px]"><div className="lg:sticky lg:top-20">{buyCard}</div></div>

        <div className="flex min-w-0 flex-col gap-8 lg:pt-8">
          {c.outcomes.length > 0 && (
            <section className="rounded-xl border border-line bg-white p-6">
              <h2 className="mb-3 text-[22px] font-extrabold tracking-[-0.01em]">What you’ll be able to do</h2>
              <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">{c.outcomes.map(o => <li key={o} className="flex gap-2.5 text-[14.5px] leading-snug text-ink2"><span className="font-extrabold text-[#17703A]">✓</span>{o}</li>)}</ul>
            </section>
          )}

          {c.modules.length > 0 && (
            <section>
              <div className="mb-3 flex flex-wrap items-baseline gap-2"><h2 className="flex-1 text-[22px] font-extrabold tracking-[-0.01em]">Course content</h2><span className="text-[13.5px] text-muted">{s(c.modules.length, 'module')} · {s(c.counts.lessons, 'lesson')}{c.counts.minutes > 0 ? ` · ${Math.round(c.counts.minutes / 6) / 10} hours of video` : ''}</span></div>
              <div className="overflow-hidden rounded-xl border border-line bg-white">
                {c.modules.map((m, i) => (
                  <details key={m.title + i} open={i === 0} className="group border-t border-line first:border-t-0">
                    <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-[15px] font-extrabold hover:bg-[#FAFBFE]">
                      <span className="text-muted transition group-open:rotate-90">▸</span><span className="min-w-0 flex-1">{m.title}</span><span className="text-[13px] font-semibold text-muted">{s(m.lessons.length, 'lesson')}</span>
                    </summary>
                    <ul className="pb-3">
                      {m.lessons.map(l => (
                        <li key={l.title} className="flex items-center gap-3 px-5 py-2 pl-12 text-[14px] text-ink2">
                          <span className={`grid h-6 w-6 flex-shrink-0 place-items-center rounded-md text-[11px] font-extrabold ${ICON[l.type][1]}`}>{ICON[l.type][0]}</span>
                          <span className="min-w-0 flex-1">{l.title}</span>
                          {l.free && <Link href={start} className="text-[12px] font-extrabold text-[#17703A] hover:underline">Free preview</Link>}
                          {l.minutes ? <span className="text-xs text-muted">{l.minutes} min</span> : null}
                        </li>
                      ))}
                    </ul>
                  </details>
                ))}
              </div>
            </section>
          )}

          <section className="grid gap-4 rounded-xl border border-line bg-white p-6 sm:grid-cols-3">
            <div><p className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-muted">Practice</p><p className="mt-1 text-[22px] font-extrabold">{c.counts.questions ? s(c.counts.questions, 'question') : `${s(c.counts.quizzes, 'quiz', 'quizzes')}`}</p><p className="text-[13px] text-muted">{c.counts.questions ? 'with worked explanations' : 'to check yourself as you go'}</p></div>
            <div><p className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-muted">Test Centre</p><p className="mt-1 text-[22px] font-extrabold">Mock exams</p><p className="text-[13px] text-muted">timed, like the real paper</p></div>
            <div><p className="text-[11.5px] font-extrabold uppercase tracking-[0.06em] text-muted">Help</p><p className="mt-1 text-[22px] font-extrabold">Ask AI · notes</p><p className="text-[13px] text-muted">in every lesson</p></div>
          </section>

          {c.description && c.description !== c.shortDescription && (
            <section>
              <h2 className="mb-3 text-[22px] font-extrabold tracking-[-0.01em]">About this course</h2>
              <p className="whitespace-pre-line text-[15px] leading-relaxed text-ink2">{c.description}</p>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-[22px] font-extrabold tracking-[-0.01em]">Your teacher</h2>
            <div className="flex gap-4 rounded-xl border border-line bg-white p-5">
              <Face name={c.teacher?.name ?? 'CareerPath Africa'} src={c.teacher?.avatarUrl} size={64} />
              <div className="min-w-0">
                <b className="text-[17px]">{c.teacher?.name ?? 'CareerPath Africa'}</b>
                <p className="mt-0.5 text-[13.5px] text-muted">{c.teacher ? [c.teacher.subjects.slice(0, 3).join(' · '), c.teacher.country].filter(Boolean).join(' · ') : 'Made by the CareerPath Africa team'}</p>
                {c.teacher?.bio && <p className="mt-2 text-[14px] leading-relaxed text-ink2">{c.teacher.bio}</p>}
                {c.teacher && c.teacher.courses > 1 && <p className="mt-2 text-[13px] font-semibold text-navy">{s(c.teacher.courses, 'course')} on CareerPath</p>}
              </div>
            </div>
          </section>

          {c.packages.length > 0 && (
            <section>
              <h2 className="mb-3 text-[22px] font-extrabold tracking-[-0.01em]">Also in a package</h2>
              <div className="flex flex-col gap-3">
                {c.packages.map(p => (
                  <Link key={p.id} href={`/packages/${p.id}`} className="flex flex-wrap items-center gap-4 rounded-xl border-2 border-[#3F6FE8] bg-white p-4 hover:bg-[#F7F9FF]">
                    <span className="relative h-12 w-16 flex-shrink-0" aria-hidden><span className="absolute left-0 top-2 h-10 w-11 rounded-md bg-[#17703A]" /><span className="absolute left-2.5 top-1 h-10 w-11 rounded-md bg-[#6B3FB8]" /><span className="absolute left-5 top-0 h-10 w-11 rounded-md bg-[#3F6FE8]" /></span>
                    <span className="min-w-0 flex-1"><b className="block text-[16px]">{p.name}</b><span className="text-[13.5px] text-muted">This course and {p.courses - 1} more{p.months ? ` · ${p.months} months` : ''} · {price(p.priceAmount, p.currency)}</span></span>
                    <span className="text-[14px] font-bold text-azure-strong">See the package →</span>
                  </Link>
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="mb-3 text-[22px] font-extrabold tracking-[-0.01em]">Questions</h2>
            <div className="overflow-hidden rounded-xl border border-line bg-white">
              {[
                ['How long can I use it?', c.accessMonths ? `${c.accessMonths} months from the day you start, at your own pace.` : 'For as long as the course is on CareerPath.'],
                ['Can I pay with MTN or Orange Money?', 'Yes. Pay with MTN Mobile Money, Orange Money or a card. You get a receipt by email.'],
                ['Does it work on my phone?', 'Yes, in your phone’s browser or installed like an app. Data saver plays smaller videos on mobile data.'],
                ['Do I get a certificate?', 'Yes, when you finish every lesson. Each certificate has a code anyone can check.'],
              ].map(([q, a]) => (
                <details key={q} className="group border-t border-line first:border-t-0">
                  <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-[15px] font-bold hover:bg-[#FAFBFE]"><span className="flex-1">{q}</span><span className="text-lg text-muted group-open:rotate-45">+</span></summary>
                  <p className="px-5 pb-4 text-[14px] leading-relaxed text-ink2">{a}</p>
                </details>
              ))}
            </div>
          </section>

          {c.related.length > 0 && (
            <section>
              <h2 className="mb-3 text-[22px] font-extrabold tracking-[-0.01em]">More{c.exam ? ` for ${c.exam}` : ''}</h2>
              <div className="grid gap-3 sm:grid-cols-3">
                {c.related.map(r => (
                  <Link key={r.slug} href={`/courses/${r.slug}`} className="overflow-hidden rounded-xl border border-line bg-white hover:border-[#5889FA]">
                    <Cover src={r.coverUrl} label={[r.exam, r.subject].filter(Boolean).join(' · ') || r.title} seed={r.slug} className="h-24 w-full" />
                    <span className="block p-3"><b className="line-clamp-2 text-[14px] leading-snug">{r.title}</b><span className="mt-1 block text-[12.5px] text-muted">{r.teacher ?? 'CareerPath Africa'} · {r.price ? price(r.price.amount, r.price.currency) : r.selling === 'free' ? 'Free' : 'In a package'}</span></span>
                  </Link>
                ))}
              </div>
            </section>
          )}
        </div>
      </main>

      {/* Phones: the price and the button, always one tap away */}
      <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-3 border-t border-line bg-white px-4 py-3 lg:hidden" style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom, 0px))' }}>
        <span className="min-w-0"><b className="block text-[18px] leading-tight">{c.selling === 'paid' && c.price ? price(c.price.amount, c.price.currency) : c.selling === 'free' ? 'Free' : pack ? price(pack.priceAmount, pack.currency) : 'Soon'}</b><span className="text-[11.5px] text-muted">{c.accessMonths ? `${c.accessMonths} months` : c.selling === 'package' ? 'in a package' : ''}</span></span>
        <Link href={c.selling === 'paid' ? buy : c.selling === 'package' && pack ? `/packages/${pack.id}` : start} className="flex h-11 flex-1 items-center justify-center rounded-md bg-[#2F57C9] text-[15px] font-extrabold text-white">{c.selling === 'paid' ? 'Buy the course' : c.selling === 'package' ? 'See the package' : 'Start the course'}</Link>
      </div>
      <PublicFooter />
    </div>
  );
}
