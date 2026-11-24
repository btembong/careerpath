import Link from 'next/link';
import type { Metadata } from 'next';
import { LandingNav } from '@/components/public/LandingNav';
import { SiteFooter } from '@/components/public/SiteFooter';
import { BrowserShot, Faq, FloatCard, H2, Kicker, PersonSlot, StatRow, btnLine, btnWhite, wrap } from '@/components/public/landing/Pieces';
import { SchoolQuote } from '@/components/public/landing/SchoolQuote';
import { peoplePhoto } from '@/components/public/landing/people';
import { Icon, type IconName } from '@/components/ui/Icon';

export const metadata: Metadata = {
  title: 'For schools',
  description: 'CareerPath Africa partners with schools, colleges, universities and training institutions: curriculum-aligned lessons, revision, quizzes, exam practice, specialist tutors and live classes for students beyond the classroom, with teachers and schools at the centre.',
};

/** Why we work with schools: the three principles beside the opening text */
const PRINCIPLES: [IconName, string, string][] = [
  ['school', 'It complements the classroom', 'Blended learning: lessons, revision and practice that follow what’s taught in class.'],
  ['checkLine', 'It follows your curriculum', 'Courses organised by exam, subject and level, the way your students sit them.'],
  ['trending', 'It’s built for results', 'Higher success in class assessments, regional and national examinations.'],
];

/** What partner schools want, each with what the portal does for it today */
const TOGETHER: [string, string[]][] = [
  ['Strengthen classroom learning and revision', ['Structured lessons by topic, with videos and readings', 'Notes and flashcards for revision']],
  ['Improve examination readiness', ['The Test Centre: a test by subject and topic', 'Timed mock exams and past papers', 'A daily warm-up on each student’s weak topics']],
  ['Reach qualified subject specialists', ['Vetted teachers for each subject', 'Live virtual classes, with recordings', 'Mentoring sessions in some packages']],
  ['Fit into your existing programmes', ['Seats on the package that matches your classes', 'Students join with your link or code, limited to your email domain if you like', 'Your own teachers can teach on CareerPath']],
  ['Support learners who need more', ['See who joined but never started, and who has gone quiet', 'Remind them in one tap', 'Practice aimed at each student’s weak topics']],
  ['Explore blended education', ['Live classes with a shared board', 'A focus room for study at home', 'Works on phones and installs like an app']],
];

const STUDENTS_GET: [IconName, string, string][] = [
  ['play', 'Lessons and videos', 'Structured courses for their exam, topic by topic'],
  ['grade', 'Quizzes and exam practice', 'The Test Centre, mock exams and past papers'],
  ['live', 'Virtual classrooms', 'Live classes with a teacher, and the recordings'],
  ['teacher', 'Specialised tutors', 'Subject teachers and, in some packages, a mentor'],
  ['reports', 'Their own progress', 'A study map, weekly goal, streak and next certificate'],
  ['notebook', 'Revision tools', 'Notes, flashcards and a focus timer'],
];

/** The numbers on the school's dashboard */
const SCHOOL_SEES: [string, string][] = [
  ['Seats', 'Used and free, per package'],
  ['Active this week', 'How many studied in the last 7 days'],
  ['Lessons done', 'Across your students'],
  ['Quiz averages', 'This month and overall'],
  ['Not started', 'Joined but haven’t opened a lesson'],
  ['Gone quiet', 'Nothing for two weeks, with a one-tap reminder'],
];

/** The page for schools, colleges, universities and training institutions partnering with CareerPath */
export default function SchoolsPage() {
  return (
    <div className="keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy">
      <LandingNav />
      <section className="overflow-hidden bg-[#3F6FE8] pt-[112px] lg:pt-[128px]">
        <div className={`${wrap} grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_620px]`}>
          <div className="pb-14 lg:pb-16">
            <p className="text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-[#0B1F55]">For schools, colleges, universities and training institutions</p>
            <h1 className="mt-3 text-[44px] font-extrabold leading-[0.98] tracking-[-0.045em] sm:text-[62px]">Digital learning that<br /><span className="text-[#FFFFFF]">strengthens your school.</span></h1>
            <p className="mt-4 max-w-[540px] text-[16.5px] leading-relaxed text-[#0B1F55] sm:text-[17px]">Curriculum-aligned lessons, revision, quizzes and exam practice your students use beyond the classroom, while your teachers stay at the centre of their learning.</p>
            <div className="mt-6 flex flex-wrap gap-2.5"><a href="#quote" className={btnWhite}>Become a partner school</a><Link href="/packages" className={btnLine}>See packages</Link></div>
          </div>
          <div className="relative translate-y-3 -rotate-[1.5deg]">
            <div className="overflow-hidden rounded-t-xl bg-[#FFFFFF] shadow-[0_-10px_50px_rgba(7,32,97,0.35)]">
              <div aria-hidden className="flex h-[30px] items-center gap-1.5 bg-[#EEF2FA] px-3"><i className="h-[9px] w-[9px] rounded-full bg-[#C9D3E8]" /><i className="h-[9px] w-[9px] rounded-full bg-[#C9D3E8]" /><i className="h-[9px] w-[9px] rounded-full bg-[#C9D3E8]" /></div>
              <img src="/landing/school-dashboard.jpg" alt="A school dashboard: seats used, invites waiting and who needs a nudge (sample school)" className="block w-full" width={1440} height={900} />
            </div>
            <FloatCard icon={<Icon name="mail" size={16} />} title="Remind 7 students" sub="One tap, one friendly email" className="-left-10 top-40 -rotate-3" />
            <PersonSlot src={peoplePhoto('school-1')} tone={2} className="absolute -right-4 -top-6 hidden h-24 w-24 rotate-6 lg:block" />
          </div>
        </div>
      </section>

      <StatRow items={[['Curriculum-aligned', 'by exam, subject and level'], ['Every week', 'who studied, who didn’t'], ['Per seat', 'a price agreed with your school'], ['Invoice', 'by bank transfer or mobile money']]} />

      <section className={`${wrap} grid items-start gap-10 py-16 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]`}>
        <div>
          <Kicker>Why we work with schools</Kicker>
          <H2>Digital education works best when it <span className="text-[#3F6FE8]">strengthens institutions,</span> not competes with them.</H2>
          <p className="mt-4 max-w-[620px] text-[16px] leading-relaxed text-[#3A4A6B]">Schools, colleges, universities, training institutions and other educational organisations are essential partners in expanding access to quality education across Africa. CareerPath Africa gives your school an additional layer of academic support that students can reach beyond the classroom, while your teachers and your institution remain at the centre of the learning process.</p>
          <p className="mt-3 max-w-[620px] text-[16px] leading-relaxed text-[#3A4A6B]">For partner schools our focus is clear: stronger academic performance, and high success rates in class assessments, regional examinations and national examinations.</p>
        </div>
        <div className="flex flex-col gap-3">
          {PRINCIPLES.map(([icon, t, d]) => (
            <div key={t} className="flex gap-3.5 rounded-[14px] border border-line bg-[#FFFFFF] p-4">
              <span className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#EAF0FF] text-[#2F57C9]"><Icon name={icon} size={19} /></span>
              <span><b className="block text-[16px]">{t}</b><span className="text-[14.5px] leading-relaxed text-[#3A4A6B]">{d}</span></span>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-[#FFFFFF] py-16">
        <div className={wrap}>
          <Kicker>Partner schools</Kicker>
          <H2>What we can do <span className="text-[#3F6FE8]">together.</span></H2>
          <p className="mt-3 max-w-[640px] text-[16px] leading-relaxed text-[#3A4A6B]">We welcome collaboration with educational institutions that want to:</p>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {TOGETHER.map(([t, items]) => (
              <div key={t} className="flex flex-col gap-2.5 rounded-2xl border border-line bg-[#F8F9FC] p-5">
                <b className="text-[17.5px] leading-snug">{t}</b>
                <ul className="flex flex-col gap-1.5">
                  {items.map(x => <li key={x} className="flex gap-2 text-[14px] leading-snug text-[#3A4A6B]"><span aria-hidden className="mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#3F6FE8]" />{x}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

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
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {STUDENTS_GET.map(([icon, t, d]) => (
              <div key={t} className="flex items-start gap-3 rounded-[14px] bg-[#F8F9FC] p-4">
                <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#EAF0FF] text-[#2F57C9]"><Icon name={icon} size={18} /></span>
                <span><b className="block text-[15.5px]">{t}</b><span className="text-[13.5px] leading-snug text-[#3A4A6B]">{d}</span></span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={`${wrap} grid items-center gap-10 py-16 lg:grid-cols-2`}>
        <div>
          <Kicker>What your school sees</Kicker>
          <H2>Know who’s learning, <span className="text-[#3F6FE8]">and who needs help.</span></H2>
          <dl className="mt-6 grid gap-2.5 sm:grid-cols-2">
            {SCHOOL_SEES.map(([t, d]) => (
              <div key={t} className="rounded-xl border border-line bg-[#FFFFFF] px-4 py-3"><dt className="text-[15px] font-bold">{t}</dt><dd className="text-[13.5px] text-[#3A4A6B]">{d}</dd></div>
            ))}
          </dl>
        </div>
        <BrowserShot src="/landing/school-dashboard.jpg" alt="The school dashboard (sample school)" />
      </section>

      <section id="quote" className="scroll-mt-24 bg-[#040D29] py-16 text-[#C9D4F2]">
        <div className={`${wrap} grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_440px]`}>
          <div>
            <Kicker dark>Become a partner school</Kicker>
            <H2 className="text-[#FFFFFF]">Tell us about your students.<br /><span className="text-[#7FA3FF]">We’ll suggest a plan.</span></H2>
            <p className="mt-4 max-w-[520px] text-[16px] leading-relaxed">How many students, which classes and which exams. We suggest a package, agree a price per seat, and invoice your school by bank transfer or mobile money. Nothing is charged to your students.</p>
          </div>
          <SchoolQuote />
        </div>
      </section>

      <section className={`${wrap} py-16`}>
        <H2 className="text-[30px] sm:text-[34px]">School questions</H2>
        <Faq items={[
          ['Does CareerPath replace our teachers?', 'No. It adds digital lessons, revision and practice your students use beyond class; your teachers and your school stay at the centre of their learning.'],
          ['Which exams and subjects do you cover?', 'Courses are organised by exam, subject and level (for example GCE O-Level and A-Level, and WASSCE). Tell us yours and we’ll show you what’s available.'],
          ['Can students use it on their phones?', 'Yes. The portal works in a phone’s browser and installs like an app.'],
          ['How long do students keep access?', 'As long as the package you choose: each package has a length (for example three months from joining), shown on your quote.'],
          ['Can we limit joining to our email domain?', 'Yes. Set your school’s email domain, and only addresses ending in it can use your join link.'],
          ['Can our own teachers run live classes?', 'Yes. Your teachers can apply to teach on CareerPath and run classes for your students. Ask us when you request a partnership.'],
          ['How do we pay?', 'We invoice you for the seats you agree: bank transfer or mobile money. Nothing is charged to your students.'],
        ]} />
      </section>
      <SiteFooter />
    </div>
  );
}
