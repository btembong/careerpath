import Link from 'next/link';
import type { Metadata } from 'next';
import { LandingNav } from '@/components/public/LandingNav';
import { SiteFooter } from '@/components/public/SiteFooter';
import { loadTeachers } from '@/components/public/PublicTeachers';
import { Faq, FloatCard, H2, Kicker, PersonSlot, StatRow, btnBlue, btnLine, btnWhite, loadSiteStats, wrap } from '@/components/public/landing/Pieces';
import { ProductTour } from '@/components/public/landing/ProductTour';
import { peoplePhoto } from '@/components/public/landing/people';

export const metadata: Metadata = {
  title: 'Teach with us',
  description: 'Teach the exam you know best on CareerPath Africa: build courses, run live classes, mentor students, and earn a share of every sale, paid to MTN Mobile Money or Orange Money.',
};
export const revalidate = 600;

async function share(): Promise<number | null> {
  try {
    const r = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/catalogue/teacher-share`, { next: { revalidate: 600 } });
    return r.ok ? (await r.json()).pct ?? null : null;
  } catch { return null; }
}

/** The page for tutors: how teaching and earning work, shown with the real portal */
export default async function TeachPage() {
  const [s, teachers, pct] = await Promise.all([loadSiteStats(), loadTeachers(), share()]);
  const faces = teachers.filter(t => t.avatarUrl).slice(0, 4);
  const where = s.countries.slice(0, 4).map(c => c.name);
  const whereText = where.length > 1 ? `${where.slice(0, -1).join(', ')} and ${where[where.length - 1]}` : where[0] ?? 'Africa';
  return (
    <div className="keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy">
      <LandingNav />
      <section className="overflow-hidden bg-[#3F6FE8] pt-[112px] lg:pt-[128px]">
        <div className={`${wrap} grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_620px]`}>
          <div className="pb-14 lg:pb-16">
            <p className="text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-[#0B1F55]">For tutors · {s.teachers} teaching already</p>
            <h1 className="mt-3 text-[44px] font-extrabold leading-[0.98] tracking-[-0.045em] sm:text-[62px]">Teach the exam<br />you know best.<br /><span className="text-[#FFFFFF]">Get paid to your phone.</span></h1>
            <p className="mt-4 max-w-[520px] text-[16.5px] leading-relaxed text-[#0B1F55] sm:text-[17px]">Build courses, run live classes and mentor students one-to-one. You earn {pct ? `${pct}%` : 'a share'} of every sale of your courses, and your earnings are paid to MTN Mobile Money or Orange Money.</p>
            <div className="mt-6 flex flex-wrap gap-2.5"><Link href="/register?role=teacher" className={btnWhite}>Apply to teach</Link><a href="#earn" className={btnLine}>How earnings work</a></div>
          </div>
          <div className="relative translate-y-3 -rotate-[1.5deg]">
            <div className="overflow-hidden rounded-t-xl bg-[#FFFFFF] shadow-[0_-10px_50px_rgba(7,32,97,0.35)]">
              <div aria-hidden className="flex h-[30px] items-center gap-1.5 bg-[#EEF2FA] px-3"><i className="h-[9px] w-[9px] rounded-full bg-[#C9D3E8]" /><i className="h-[9px] w-[9px] rounded-full bg-[#C9D3E8]" /><i className="h-[9px] w-[9px] rounded-full bg-[#C9D3E8]" /></div>
              <img src="/landing/teacher-wallet.jpg" alt="A tutor’s earnings page, with earnings by month and where they came from (sample figures)" className="block w-full" width={1440} height={900} />
            </div>
            <FloatCard icon="₣" title="Paid to MTN Mobile Money" sub="or Orange Money · monthly statement" className="-left-10 top-36 -rotate-3" />
            <PersonSlot src={peoplePhoto('tutor-1')} tone={1} className="absolute -right-4 -top-6 hidden h-24 w-24 rotate-6 lg:block" />
          </div>
        </div>
      </section>

      <StatRow items={[[pct ? `${pct}%` : 'A share', 'of every sale of your course'], ['3 ways', 'to earn: courses, classes, mentoring'], ['Monthly', 'statements, every sale listed'], ['Free', 'to join, nothing to pay']]} />

      <section className={`${wrap} py-16`}>
        <Kicker>Everything you need to teach online</Kicker>
        <H2>Your classroom, <span className="text-[#3F6FE8]">without the admin.</span></H2>
        <ProductTour items={[
          { key: 'builder', icon: '▤', label: 'Course builder', title: 'Build a course in modules and lessons.', text: 'Put lessons in order, add notes, videos and quizzes, and attach practice to every lesson. Our reviewers check it before it goes live.', ticks: ['Notes, video and quiz lessons', 'Free preview lessons', 'Sold alone or in packages'], img: '/landing/tutor-builder.jpg', alt: 'The course builder' },
          { key: 'questions', icon: '?', label: 'Question bank', title: 'Write questions once, use them everywhere.', text: 'Questions with a mark scheme feed quizzes, practice, mock exams and the Test Centre.', ticks: ['Multiple choice to essays', 'Written answers marked against your scheme', 'See which questions students miss'], img: '/landing/teacher-questions.jpg', alt: 'The question bank' },
          { key: 'live', icon: '✐', label: 'Live classes & board', title: 'Teach live, draw together.', text: 'Schedule classes for your class, teach in the browser on a shared board; the recording and the board are saved for students.', ticks: ['Attendance taken for you', 'Board and notes saved after class', 'Paid per class hour'], img: '/landing/student-board.jpg', alt: 'A shared board from a session' },
          { key: 'dashboard', icon: '⌂', label: 'Your dashboard', title: 'Your day at a glance.', text: 'What’s waiting to grade, your next class, students to check on, and what you’ve earned this month.', ticks: ['Students who stopped studying', 'Your next class and its link', 'Profile tips that bring students'], img: '/landing/teacher-dashboard.jpg', alt: 'The tutor dashboard' },
          { key: 'earnings', icon: '₣', label: 'Earnings & payouts', title: 'See every franc you earn.', text: 'Earnings by month and by source: course sales, live classes, mentoring. Add your MTN or Orange number once; we check the name on it before paying.', ticks: ['A PIN for every withdrawal', 'A monthly statement of every sale', 'Paid by hand where mobile money isn’t available'], img: '/landing/teacher-wallet.jpg', alt: 'The earnings page (sample figures)' },
        ]} />
      </section>

      <section id="earn" className="scroll-mt-24 bg-[#040D29] py-16 text-[#C9D4F2]">
        <div className={wrap}>
          <Kicker dark>How you earn</Kicker>
          <H2 className="text-[#FFFFFF]">Three ways to earn, <span className="text-[#7FA3FF]">one wallet.</span></H2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {[['Course sales', `${pct ? `${pct}%` : 'A share'} of every sale of your course, alone or in a package.`], ['Live classes', 'Paid for each class hour you teach for a class.'], ['Mentoring', 'Paid for each 30-minute session students book with you.']].map(([t, d], i) => (
              <div key={t} className="rounded-xl border border-[rgba(255,255,255,0.1)] bg-[rgba(255,255,255,0.06)] p-5"><span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#3F6FE8] font-extrabold text-[#FFFFFF]">{i + 1}</span><b className="mt-2.5 block text-[17px] text-[#FFFFFF]">{t}</b><p className="mt-1.5 text-[14.5px] leading-relaxed">{d}</p></div>
            ))}
          </div>
          <p className="mt-4 text-[13px] text-[#9AA8D2]">Your exact rates are in your teacher agreement, which you read before you sign.</p>
        </div>
      </section>

      <section className={`${wrap} py-16`}>
        <Kicker>Getting started</Kicker>
        <H2>From application to <span className="text-[#3F6FE8]">first course.</span></H2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[['Apply', 'Your subjects, experience and a short bio. About ten minutes.'], ['We review', 'A real person reads every application.'], ['Sign and set up', 'Sign the teacher agreement, add your photo and payout number.'], ['Build and teach', 'Your first course, your first class, your first payout.']].map(([t, d], i) => (
            <div key={t} className="rounded-xl border border-line bg-[#FFFFFF] p-5"><span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#3F6FE8] font-extrabold text-[#FFFFFF]">{i + 1}</span><b className="mt-2.5 block text-[17px]">{t}</b><p className="mt-1.5 text-[14.5px] leading-relaxed text-[#3A4A6B]">{d}</p></div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-[#FFFFFF] py-10">
        <div className={`${wrap} flex flex-wrap items-center gap-6`}>
          <div className="flex">{faces.map((t, i) => (
            <Link key={t.slug} href={`/teachers/${t.slug}`} className={`relative h-[86px] w-[86px] overflow-hidden rounded-[22px] bg-[#FFFDF8] shadow-[0_12px_26px_rgba(7,32,97,0.22)] transition-transform hover:z-10 hover:rotate-0 ${i ? '-ml-3.5' : ''} ${['-rotate-[4deg]', 'rotate-3', '-rotate-2', 'rotate-[4deg]'][i]}`}>
              <img src={t.avatarUrl!} alt={t.name} loading="lazy" className="h-full w-full object-cover" />
            </Link>
          ))}</div>
          <div className="min-w-[240px] flex-1"><b className="text-[22px] tracking-[-0.02em]">Join {s.teachers} teachers across {whereText}.</b><p className="mt-1 text-[14px] text-[#637090]">Their profiles are public on <Link href="/teachers" className="font-bold text-[#2F57C9] hover:underline">/teachers</Link>: yours will be too.</p></div>
          <Link href="/register?role=teacher" className={btnBlue}>Apply to teach</Link>
        </div>
      </section>

      <section className={`${wrap} py-16`}>
        <H2 className="text-[30px] sm:text-[34px]">Tutor questions</H2>
        <Faq items={[
          ['How much can I earn?', `You earn ${pct ? `${pct}%` : 'a share'} of every sale of your courses, plus pay for each live class hour and each mentoring session. Your Earnings page shows every franc, by month and by source.`],
          ['Who owns my course?', 'Course materials you upload belong to CareerPath Africa, which can keep selling and updating them; materials you owned before and that we agree in writing stay yours. You remain free to teach your subject anywhere. The teacher agreement sets this out in full: read it before you sign.'],
          ['How do I get paid?', 'Add your MTN Mobile Money or Orange Money number and a PIN in your wallet; we check the name on the number first. Where mobile money isn’t available, our team pays you another way.'],
          ['Do I need to teach live?', 'No. You can sell recorded courses only, and add live classes or mentoring when you want to.'],
        ]} />
      </section>
      <SiteFooter />
    </div>
  );
}
