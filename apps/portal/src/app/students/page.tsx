import Link from 'next/link';
import type { Metadata } from 'next';
import { LandingNav } from '@/components/public/LandingNav';
import { SiteFooter } from '@/components/public/SiteFooter';
import { TeacherFaces, loadTeachers, pickFaces } from '@/components/public/PublicTeachers';
import { BrowserShot, Faq, FloatCard, H2, Kicker, PayWithChips, PersonSlot, PhoneShot, StatRow, btnBlue, btnLine, btnWhite, loadSiteStats, wrap } from '@/components/public/landing/Pieces';
import { ProductTour } from '@/components/public/landing/ProductTour';
import { peoplePhoto } from '@/components/public/landing/people';

export const metadata: Metadata = {
  title: 'For students',
  description: 'Prepare for GCE, WASSCE, NCLEX, IELTS and more: courses by real teachers, a Test Centre like the real exam, live classes with a shared board and one-to-one mentors. Free to start.',
};
export const revalidate = 600;

/** The page for students: what learning on CareerPath is like, shown with the real portal */
export default async function StudentsPage() {
  const [s, teachers] = await Promise.all([loadSiteStats(), loadTeachers()]);
  const faces = pickFaces(teachers);
  return (
    <div className="keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy">
      <LandingNav />
      <section className="overflow-hidden bg-[#3F6FE8] pt-[112px] lg:pt-[128px]">
        <div className={`${wrap} grid items-end gap-10 lg:grid-cols-[minmax(0,1fr)_620px]`}>
          <div className="pb-14 lg:pb-16">
            <p className="text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-[#0B1F55]">For students · GCE · WASSCE · NCLEX · IELTS · and more</p>
            <h1 className="mt-3 text-[44px] font-extrabold leading-[0.98] tracking-[-0.045em] sm:text-[62px]">Every pass starts<br />with <span className="text-[#FFFFFF]">one question.</span></h1>
            <p className="mt-4 max-w-[520px] text-[16.5px] leading-relaxed text-[#0B1F55] sm:text-[17px]">Courses by real teachers, a Test Centre that feels like the exam, live classes with a shared board, and a mentor when you’re stuck. In English or French, on your phone or computer.</p>
            <div className="mt-6 flex flex-wrap gap-2.5"><Link href="/register" className={btnWhite}>Start free</Link><Link href="/register#school-code" className={btnLine}>I have a school code</Link></div>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-[13px] text-[#0B1F55]">Pay with <PayWithChips onBlue /></div>
          </div>
          <div className="relative translate-y-3 -rotate-[1.5deg]">
            <div className="overflow-hidden rounded-t-xl bg-[#FFFFFF] shadow-[0_-10px_50px_rgba(7,32,97,0.35)]">
              <div aria-hidden className="flex h-[30px] items-center gap-1.5 bg-[#EEF2FA] px-3"><i className="h-[9px] w-[9px] rounded-full bg-[#C9D3E8]" /><i className="h-[9px] w-[9px] rounded-full bg-[#C9D3E8]" /><i className="h-[9px] w-[9px] rounded-full bg-[#C9D3E8]" /></div>
              <img src="/landing/student-player.jpg" alt="A Biology lesson, The Neuron, open in the course player" className="block w-full" width={1440} height={900} />
            </div>
            <FloatCard icon="?" title="Question 4 of 10" sub="A bundle of axons in the CNS is a…" className="-left-11 top-28 -rotate-3" />
            <FloatCard icon="◷" title="42 min this week" sub="Keep your streak going" className="-right-5 top-[300px] rotate-2" />
            <PersonSlot src={peoplePhoto('student-1')} tone={0} className="absolute -left-8 bottom-8 hidden h-24 w-24 -rotate-6 lg:block" />
          </div>
        </div>
      </section>

      <StatRow items={[[String(s.courses), `courses, ${s.freeCourses} free to start`], [String(s.teachers), 'teachers you can meet'], [String(s.programmes), 'exams and programmes'], [String(s.countries.length), s.countries.map(c => c.code).join(' ')]]} />

      {s.exams.length > 0 && (
        <section className={`${wrap} pt-14`}>
          <Kicker>Pick what you’re preparing for</Kicker>
          <div className="mt-4 flex flex-wrap gap-2">
            {s.exams.map(p => <Link key={p.id} href={`/courses?programme=${p.id}`} className="inline-flex h-10 items-center gap-1.5 rounded-[7px] border border-line bg-[#FFFFFF] px-4 text-[15px] font-bold hover:border-[#5889FA]">{p.name}<span className="text-[13px] font-medium text-[#637090]">{p.courses}</span></Link>)}
            <Link href="/courses" className="inline-flex h-10 items-center rounded-[7px] border border-line bg-[#FFFFFF] px-4 text-[15px] font-extrabold hover:border-[#5889FA]">All {s.programmes} programmes →</Link>
          </div>
        </section>
      )}

      <section className={`${wrap} py-16`}>
        <Kicker>Everything to pass, in one place</Kicker>
        <H2>See it before you <span className="text-[#3F6FE8]">sign up.</span></H2>
        <ProductTour items={[
          { key: 'courses', icon: '▶', label: 'Courses', title: 'Courses built for your exact syllabus.', text: 'Modules and lessons in the order your exam board teaches them, with notes, videos, quizzes and practice on every lesson.', ticks: ['Start where you left off', 'Data saver for slow connections', 'A certificate when you finish'], img: '/landing/student-player.jpg', alt: 'A Biology lesson in the course player' },
          { key: 'modules', icon: '▤', label: 'Modules', title: 'See the whole course at a glance.', text: 'Every module and lesson, what you’ve finished, and what’s next. Practise any lesson on its own.', ticks: ['Progress for every lesson', 'Practice questions per lesson', 'Who teaches it, and how to reach them'], img: '/landing/student-learn.jpg', alt: 'A course with its modules and lessons' },
          { key: 'tests', icon: '◎', label: 'Test Centre', title: 'A Test Centre that feels like the real exam.', text: 'Build your own test from any topic, take timed mock exams set by teachers, past papers, a daily warm-up, and adaptive exams for NCLEX.', ticks: ['Up to 150 questions, your filters', 'See the answer straight away in practice', 'Readiness: your chance of passing'], img: '/landing/student-test.jpg', alt: 'A practice question in the Test Centre' },
          { key: 'quiz', icon: '✎', label: 'Quizzes', title: 'Quizzes that mark written answers too.', text: 'Multiple choice, short answers and essays. Written answers are marked against the teacher’s mark scheme, and you see where you lost marks.', ticks: ['Questions from your teacher', 'Flashcards from what you got wrong', 'Your quiz history, topic by topic'], img: '/landing/student-quiz.jpg', alt: 'A written-answer quiz question' },
          { key: 'live', icon: '✐', label: 'Live classes & board', title: 'Live classes with a board you both draw on.', text: 'Join your class from the browser, ask questions, and work through problems on a shared board. The board, notes and recording stay with the class.', ticks: ['Recordings when you miss a class', 'The board saved after every class', 'Reminders by email and on your phone'], img: '/landing/student-board.jpg', alt: 'A shared board from a session' },
          { key: 'mentor', icon: '●', label: 'Mentoring', title: 'Thirty minutes with a teacher you choose.', text: 'Book a mentor for a hard topic, a mock result, or how to plan your last weeks. Comes with packages.', ticks: ['Pick the teacher, day and time', 'The board from your session, saved', 'Rate it afterwards'], img: '/landing/student-mentor.jpg', alt: 'Mentoring sessions' },
          { key: 'progress', icon: '↗', label: 'Progress', title: 'Know exactly how close you are.', text: 'How much you’ve done, how well, and when you’ll finish at your pace. A study calendar, streaks and badges keep you going.', ticks: ['Finish date at your pace', 'Mock and readiness over time', 'Leaderboard with your class'], img: '/landing/student-progress.jpg', alt: 'My progress' },
        ]} />
      </section>

      {faces.length > 0 && (
        <section className="border-y border-line bg-[#FFFFFF] py-16">
          <div className={wrap}>
            <div className="flex flex-wrap items-end gap-4">
              <div><Kicker>Our teachers · {teachers.length}</Kicker><H2>Learn from teachers who’ve<br className="hidden sm:block" /> sat the same exams.</H2></div>
              <span className="hidden flex-1 sm:block" />
              <Link href="/teachers" className="hidden h-11 items-center rounded-md border border-line bg-[#FFFFFF] px-4 text-[15px] font-bold hover:bg-subtle sm:inline-flex">See all {teachers.length} teachers →</Link>
            </div>
            <div className="mt-7"><TeacherFaces list={faces} /></div>
          </div>
        </section>
      )}

      <section className={`${wrap} py-16`}>
        <Kicker>How it works</Kicker>
        <H2>Free to start. <span className="text-[#3F6FE8]">Pay when you’re sure.</span></H2>
        <div className="mt-8 grid gap-4 md:grid-cols-3">
          {[['Pick your exam', 'Tell us what you’re preparing for. Your courses, tests and teachers follow from that.'], ['Start with free courses', `${s.freeCourses} of ${s.courses} courses are free to start. Try the Test Centre’s daily warm-up.`], ['Add a package when you’re ready', 'Mock exams, live classes and mentoring together, paid by mobile money or card.']].map(([t, d], i) => (
            <div key={t} className="rounded-xl border border-line bg-[#FFFFFF] p-5"><span className="flex h-9 w-9 items-center justify-center rounded-[9px] bg-[#3F6FE8] font-extrabold text-[#FFFFFF]">{i + 1}</span><b className="mt-2.5 block text-[17px]">{t}</b><p className="mt-1.5 text-[14.5px] leading-relaxed text-[#3A4A6B]">{d}</p></div>
          ))}
        </div>
      </section>

      <section className="overflow-hidden bg-[#040D29] py-16 text-[#C9D4F2]">
        <div className={`${wrap} grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_560px]`}>
          <div>
            <Kicker dark>On your phone</Kicker>
            <H2 className="text-[#FFFFFF]">Install it like an app.<br /><span className="text-[#7FA3FF]">Study on any data plan.</span></H2>
            <p className="mt-4 max-w-[520px] text-[16px] leading-relaxed">Add CareerPath to your home screen from the browser: no app store, a few MB. Data saver plays lighter videos, and lessons open where you stopped.</p>
            <Link href="/register" className={`${btnBlue} mt-6`}>Start free</Link>
          </div>
          <div className="flex justify-center gap-5 pb-10"><PhoneShot src="/landing/student-player-phone.jpg" alt="A lesson on a phone" className="-rotate-[4deg]" /><PhoneShot src="/landing/student-phone.jpg" alt="The dashboard on a phone" className="hidden translate-y-10 rotate-3 sm:block" /></div>
        </div>
      </section>

      <section className={`${wrap} grid gap-[18px] py-16 md:grid-cols-2`}>
        <Link href="/teach" className="group flex flex-col gap-3 rounded-[14px] bg-[#EAF0FF] p-6 sm:p-7">
          <Kicker>For tutors</Kicker><b className="text-[28px] leading-[1.08] tracking-[-0.03em]">Teach what you know.<br />Get paid to your phone.</b>
          <BrowserShot src="/landing/teacher-wallet.jpg" alt="" className="mt-2 transition-transform group-hover:-translate-y-1" />
        </Link>
        <Link href="/schools" className="group flex flex-col gap-3 rounded-[14px] bg-[#072061] p-6 text-[#FFFFFF] sm:p-7">
          <Kicker dark>For schools</Kicker><b className="text-[28px] leading-[1.08] tracking-[-0.03em]">Seats for your whole class,<br />and see who’s working.</b>
          <BrowserShot src="/landing/school-dashboard.jpg" alt="" className="mt-2 transition-transform group-hover:-translate-y-1" />
        </Link>
      </section>

      <section className={`${wrap} pb-16`}>
        <H2 className="text-[30px] sm:text-[34px]">What students ask first</H2>
        <Faq items={[
          ['Is it really free to start?', `Yes. ${s.freeCourses} of our ${s.courses} courses are free, and so is the Test Centre’s daily warm-up. You only pay for packages or paid courses.`],
          ['How do I pay with mobile money?', 'At checkout choose MTN Mobile Money or Orange Money, enter your number, and confirm on your phone. Cards work too.'],
          ['Do I get a certificate?', 'Yes: finish every lesson of a course and your certificate is ready to download, with a code anyone can check on our site.'],
          ['Can I use it in French?', 'Yes. Switch between English and French at the top of any page.'],
          ['What if my internet is slow?', 'Turn on data saver: videos play at a lighter quality, and lessons open where you stopped. Notes and quizzes use very little data.'],
        ]} />
      </section>
      <SiteFooter />
    </div>
  );
}
