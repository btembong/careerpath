import Link from 'next/link';
import type { Metadata } from 'next';
import { BrandLogo } from '@/components/brand/BrandLogo';

export const metadata: Metadata = {
  title: 'CareerPath Africa · Exam prep with real teachers',
  description: 'Exam prep for GCE, WASSCE, BAC, NCLEX, IELTS, ACCA and more. Courses, mock exams and live classes from real teachers across Africa.',
};
export const revalidate = 600;

interface Home { programmeCount: number; courseCount: number; programmes: { id: string; name: string; courses: number }[] }

async function counts(): Promise<Home | null> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/catalogue/home`, { next: { revalidate: 600 } });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

const PILLARS = [
  { i: '▶', t: 'Courses by real teachers', d: 'Lessons, notes and quizzes for your exact programme and level, in English or French.' },
  { i: '◎', t: 'A Test Centre like the real exam', d: 'Practice, timed mock exams, past papers and adaptive readiness tests.' },
  { i: '●', t: 'Live classes and mentors', d: 'Ask questions in class, or book a mentor for one-to-one help.' },
];

const CARDS = [
  { i: 'Q', t: 'Question 12', d: 'Solve 2x + 3 = 11  →  x = 4  ✓', cls: 'left-0 top-2.5 -rotate-3' },
  { i: '◎', t: 'CAT readiness', d: 'Stopped at 92 questions: Ready', cls: 'left-6 top-[110px] rotate-2 sm:left-[50px]' },
  { i: '●', t: 'Live class', d: 'Statistics: reading the data · Sun 17:00', cls: 'left-2 top-[212px] -rotate-1 sm:left-3.5' },
];

/** Public home page at "/". Signed-in people are sent to their dashboard by the middleware. */
export default async function HomePage() {
  const data = await counts();
  const nav = 'hidden text-sm text-[#072061]/85 hover:text-[#072061] md:inline';
  return (
    <div className="keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy">
      <div className="bg-[#3F6FE8]">
        <header className="mx-auto flex max-w-[1240px] items-center gap-5 px-4 py-4 sm:px-8 lg:px-14">
          <BrandLogo tone="onBlue" size="lg" href="/" />
          <span className="flex-1" />
          <Link href="/courses" className={nav}>Courses</Link>
          <a href="#test-centre" className={nav}>Test Centre</a>
          <a href="#schools" className={nav}>For schools</a>
          <Link href="/register?role=teacher" className={nav}>Teach</Link>
          <Link href="/login" className="text-sm font-bold text-white hover:underline">Sign in</Link>
          <Link href="/register" className="inline-flex h-[38px] items-center rounded-md bg-white px-4 text-sm font-bold text-[#2F57C9] hover:bg-[#F4F7FF]">Start free</Link>
        </header>
        <section className="mx-auto grid max-w-[1240px] items-center gap-8 px-4 pb-16 pt-8 sm:px-8 lg:grid-cols-[1.2fr_1fr] lg:px-14 lg:pb-[70px] lg:pt-12">
          <div className="flex flex-col gap-5">
            <h1 className="text-[46px] font-extrabold leading-none tracking-[-0.04em] text-navy sm:text-[64px] lg:text-[80px]">
              Every pass<br />starts with <span className="text-white">one question.</span>
            </h1>
            <p className="max-w-[520px] text-[17px] leading-relaxed text-[#072061]/80 sm:text-lg">Exam prep for GCE, WASSCE, BAC, NCLEX, IELTS, ACCA and more. Courses, mock exams and live classes from real teachers across Africa.</p>
            <div className="flex flex-wrap gap-2.5">
              <Link href="/register" className="inline-flex h-[50px] items-center rounded-md bg-white px-[22px] text-base font-bold text-[#2F57C9] hover:bg-[#F4F7FF]">Start free</Link>
              <Link href="/register#school-code" className="inline-flex h-[50px] items-center rounded-md border border-white/70 px-5 text-base font-semibold text-white hover:bg-white/10">I have a school code</Link>
            </div>
            <span className="text-[13.5px] text-[#072061]/75">Free to join · pay by mobile money or card{data?.programmeCount ? ` · ${data.programmeCount} programmes` : ''}</span>
          </div>
          <div className="relative hidden h-[340px] sm:block" aria-hidden>
            {CARDS.map(c => (
              <div key={c.t} className={`absolute flex w-[min(400px,90%)] gap-3 rounded-[10px] bg-[#FFFDF8] p-4 shadow-[0_12px_26px_rgba(7,32,97,0.2)] ${c.cls}`}>
                <span className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-lg bg-[#EAF0FF] font-extrabold text-[#3F6FE8]">{c.i}</span>
                <span className="text-sm text-[#072061]"><strong>{c.t}</strong><br /><span className="text-[#3A4A70]">{c.d}</span></span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <main className="mx-auto w-full max-w-[1240px]">
        <section className="flex flex-col gap-[18px] px-4 py-12 sm:px-8 lg:px-14">
          <h2 className="text-[28px] font-extrabold tracking-[-0.02em] sm:text-[34px]">Pick what you’re preparing for.</h2>
          <div className="flex flex-wrap gap-2">
            {(data?.programmes ?? []).map(p => (
              <Link key={p.id} href={`/courses?programme=${p.id}`} className="rounded-lg border border-line bg-white px-4 py-2.5 text-[15px] hover:border-[#5889FA]">
                <strong>{p.name}</strong> {p.courses > 0 && <span className="text-[13px] text-muted">{p.courses} course{p.courses === 1 ? '' : 's'}</span>}
              </Link>
            ))}
            <Link href="/courses" className="rounded-lg border border-line bg-white px-4 py-2.5 text-[15px] font-bold hover:border-[#5889FA]">
              {data?.programmeCount ? `All ${data.programmeCount} programmes →` : 'See every programme →'}
            </Link>
          </div>
        </section>

        <section id="test-centre" className="grid scroll-mt-6 gap-4 px-4 pb-12 sm:px-8 md:grid-cols-3 lg:px-14">
          {PILLARS.map(x => (
            <div key={x.t} className="flex flex-col gap-2.5 rounded-[10px] border border-line bg-white p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-[9px] bg-[#3F6FE8] font-extrabold text-white">{x.i}</span>
              <strong className="text-[19px]">{x.t}</strong>
              <span className="text-[14.5px] leading-relaxed text-ink2">{x.d}</span>
            </div>
          ))}
        </section>

        <section id="schools" className="grid scroll-mt-6 gap-4 px-4 pb-12 sm:px-8 md:grid-cols-2 lg:px-14">
          <div className="flex flex-col gap-2.5 rounded-xl bg-[#072061] p-[30px] text-white">
            <strong className="text-2xl">For schools</strong>
            <span className="text-[15px] text-[#C9D6FF]">Buy places for your students, invite them with a link or a code, and see how they’re doing.</span>
            <a href="mailto:support@careerpathafrica.com?subject=School%20places" className="mt-1.5 inline-flex h-[42px] self-start items-center rounded-md bg-white px-4 font-bold text-[#072061]">Talk to us</a>
          </div>
          <div className="flex flex-col gap-2.5 rounded-xl bg-[#EAF0FF] p-[30px] text-[#072061]">
            <strong className="text-2xl">Teach with us</strong>
            <span className="text-[15px] text-[#3A4A70]">Build courses, set your price, run live classes and get paid monthly to mobile money or bank.</span>
            <Link href="/register?role=teacher" className="mt-1.5 inline-flex h-[42px] self-start items-center rounded-md bg-[#3F6FE8] px-4 font-bold text-white hover:bg-[#2F57C9]">Apply to teach</Link>
          </div>
        </section>
      </main>

      <footer className="mt-auto border-t border-line">
        <div className="mx-auto flex max-w-[1240px] flex-wrap gap-5 px-4 py-6 text-[13px] text-muted sm:px-8 lg:px-14">
          <span>© {new Date().getFullYear()} CareerPath Africa</span>
          <Link href="/verify" className="hover:text-navy">Check a certificate</Link>
          <Link href="/packages" className="hover:text-navy">Packages</Link>
          <Link href="/legal/tutor-agreement" className="hover:text-navy">Tutor agreement</Link>
        </div>
      </footer>
    </div>
  );
}
