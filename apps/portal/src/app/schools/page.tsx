import Link from 'next/link';
import type { Metadata } from 'next';
import { LandingNav } from '@/components/public/LandingNav';
import { SiteFooter } from '@/components/public/SiteFooter';
import { BrowserShot, Faq, FloatCard, H2, Kicker, PersonSlot, StatRow, btnLine, btnWhite, wrap } from '@/components/public/landing/Pieces';
import { SchoolQuote } from '@/components/public/landing/SchoolQuote';
import { peoplePhoto } from '@/components/public/landing/people';

export const metadata: Metadata = {
  title: 'For schools',
  description: 'Give a whole class the same head start: buy places in a CareerPath package, invite students with a link or a code, and see who is studying, who is stuck and who has not started.',
};

/** The page for schools, companies and NGOs buying places for their students */
export default function SchoolsPage() {
  return (
    <div className="keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy">
      <LandingNav />
      <section className="overflow-hidden bg-[#3F6FE8] pt-[112px] lg:pt-[128px]">
        <div className={`${wrap} grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_620px]`}>
          <div className="pb-14 lg:pb-16">
            <p className="text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-[#0B1F55]">For schools, companies and NGOs</p>
            <h1 className="mt-3 text-[44px] font-extrabold leading-[0.98] tracking-[-0.045em] sm:text-[62px]">Give your whole class<br /><span className="text-[#FFFFFF]">the same head start.</span></h1>
            <p className="mt-4 max-w-[520px] text-[16.5px] leading-relaxed text-[#0B1F55] sm:text-[17px]">Buy places in a package for your students, invite them with a link or a code, and see who’s studying, who’s stuck and who hasn’t started.</p>
            <div className="mt-6 flex flex-wrap gap-2.5"><a href="#quote" className={btnWhite}>Talk to us</a><Link href="/packages" className={btnLine}>See packages</Link></div>
          </div>
          <div className="relative translate-y-3 -rotate-[1.5deg]">
            <div className="overflow-hidden rounded-t-xl bg-[#FFFFFF] shadow-[0_-10px_50px_rgba(7,32,97,0.35)]">
              <div aria-hidden className="flex h-[30px] items-center gap-1.5 bg-[#EEF2FA] px-3"><i className="h-[9px] w-[9px] rounded-full bg-[#C9D3E8]" /><i className="h-[9px] w-[9px] rounded-full bg-[#C9D3E8]" /><i className="h-[9px] w-[9px] rounded-full bg-[#C9D3E8]" /></div>
              <img src="/landing/school-dashboard.jpg" alt="A school dashboard: seats used, invites waiting and who needs a nudge (sample school)" className="block w-full" width={1440} height={900} />
            </div>
            <FloatCard icon="✉" title="Remind 7 students" sub="One tap, one friendly email" className="-left-10 top-40 -rotate-3" />
            <PersonSlot src={peoplePhoto('school-1')} tone={2} className="absolute -right-4 -top-6 hidden h-24 w-24 rotate-6 lg:block" />
          </div>
        </div>
      </section>

      <StatRow items={[['1 link', 'students join with your code'], ['Per seat', 'price agreed with you'], ['Every week', 'who studied, who didn’t'], ['Invoice', 'by bank transfer or mobile money']]} />

      <section className={`${wrap} py-16`}>
        <Kicker>How it works for a school</Kicker>
        <H2>Seats in three steps, <span className="text-[#3F6FE8]">results every week.</span></H2>
        <div className="mt-8 grid gap-6 md:grid-cols-3">
          {[['/landing/school-invite.jpg', 'Invite', 'By email, or share your school’s join link and code. You can limit joining to your school’s email domain.'], ['/landing/school-students.jpg', 'They study', 'Each student gets the package: courses, the Test Centre, and live classes when they’re included.'], ['/landing/school-dashboard.jpg', 'You see it', 'Seats used, active this week, lessons done, quiz averages, and who needs a nudge.']].map(([img, t, d], i) => (
            <div key={t}><BrowserShot src={img} alt={t} /><b className="mt-3.5 block text-[17px]">{i + 1} · {t}</b><p className="mt-1 text-[14.5px] leading-relaxed text-[#3A4A6B]">{d}</p></div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-[#FFFFFF] py-16">
        <div className={wrap}>
          <Kicker>What your students get</Kicker>
          <H2>The full portal, <span className="text-[#3F6FE8]">for every seat.</span></H2>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[['/landing/student-player.jpg', 'Courses for their exam'], ['/landing/student-test.jpg', 'Test Centre and mock exams'], ['/landing/student-board.jpg', 'Live classes and the board'], ['/landing/student-progress.jpg', 'Their own progress']].map(([img, t]) => (
              <div key={t}><BrowserShot src={img} alt={t} /><b className="mt-2.5 block text-[15px]">{t}</b></div>
            ))}
          </div>
        </div>
      </section>

      <section id="quote" className="scroll-mt-24 bg-[#040D29] py-16 text-[#C9D4F2]">
        <div className={`${wrap} grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_440px]`}>
          <div>
            <Kicker dark>School packages</Kicker>
            <H2 className="text-[#FFFFFF]">Priced per seat,<br /><span className="text-[#7FA3FF]">agreed with you.</span></H2>
            <p className="mt-4 max-w-[520px] text-[16px] leading-relaxed">Tell us how many students and which exam. We suggest a package, agree a price per seat, and invoice you: bank transfer or mobile money. Then you invite your students.</p>
          </div>
          <SchoolQuote />
        </div>
      </section>

      <section className={`${wrap} py-16`}>
        <H2 className="text-[30px] sm:text-[34px]">School questions</H2>
        <Faq items={[
          ['How long do students keep access?', 'As long as the package you choose: each package has a length (for example three months from joining), shown on your quote.'],
          ['Can we limit joining to our email domain?', 'Yes. Set your school’s email domain, and only addresses ending in it can use your join link.'],
          ['Can our own teachers run live classes?', 'Yes. Your teachers can apply to teach on CareerPath and run classes for your students. Ask us when you request a quote.'],
          ['How do we pay?', 'We invoice you for the seats you agree: bank transfer or mobile money. Nothing is charged to your students.'],
        ]} />
      </section>
      <SiteFooter />
    </div>
  );
}
