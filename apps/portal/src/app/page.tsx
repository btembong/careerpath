import Link from 'next/link';
import type { Metadata } from 'next';
import { LandingNav } from '@/components/public/LandingNav';
import { SiteFooter } from '@/components/public/SiteFooter';
import { TeacherFaces, loadTeachers, pickFaces } from '@/components/public/PublicTeachers';
import { BrowserShot, Faq, H2, Kicker, PayWithChips, PersonSlot, StatRow, btnLine, btnWhite, loadSiteStats, wrap } from '@/components/public/landing/Pieces';
import { PortalStack, type PortalCard } from '@/components/public/landing/PortalStack';
import { peoplePhoto } from '@/components/public/landing/people';

export const metadata: Metadata = {
  title: 'CareerPath Africa · Exam prep with real teachers',
  description: 'Exam prep for GCE, WASSCE, NCLEX, IELTS and more: courses, a Test Centre, live classes and mentors from real teachers across Africa. For students, tutors and schools.',
};
export const revalidate = 600;

const PORTALS: PortalCard[] = [
  { key: 'students', tone: 'blue', kicker: 'Student portal', title: 'Learn the way your exam is set.', text: 'Courses in the order your syllabus teaches them, notes and quizzes on every lesson, and a player that remembers where you stopped.', ticks: ['Courses for your exact exam', 'Test Centre, mocks and past papers', 'Live classes and mentoring'], img: '/landing/student-player.jpg', alt: 'A Biology lesson open in the course player', href: '/students', cta: 'For students' },
  { key: 'tests', tone: 'white', kicker: 'Test Centre', title: 'Practise like it’s the real thing.', text: 'Build a test from any topic, take timed mocks set by teachers, and see your readiness rise.', ticks: ['Up to 150 questions, your filters', 'Answers straight away in practice', 'Readiness: your chance of passing'], img: '/landing/student-test.jpg', alt: 'A practice question in the Test Centre', href: '/students', cta: 'See the Test Centre' },
  { key: 'tutors', tone: 'navy', kicker: 'Tutor portal', title: 'Teach, grade and get paid in one place.', text: 'Build courses in modules and lessons, teach live on a shared board, grade in one queue, and follow every franc you earn.', ticks: ['Course builder and question bank', 'Live classes with a shared board', 'Earnings by month, paid to mobile money'], img: '/landing/tutor-builder.jpg', alt: 'The course builder with a Biology course', href: '/teach', cta: 'For tutors' },
  { key: 'schools', tone: 'soft', kicker: 'School portal', title: 'Seats for your class, and see who’s working.', text: 'Invite students with a link or a code, see who joined, who studied this week and who needs a nudge.', ticks: ['Invite by email or join link', 'Progress for every student', 'Remind the ones who stopped'], img: '/landing/school-dashboard.jpg', alt: 'A school dashboard with seats used and invites', href: '/schools', cta: 'For schools' },
];

/** The public home page: what CareerPath is, and a door for each visitor. Signed-in people go to their dashboard (middleware). */
export default async function HomePage() {
  const [s, teachers] = await Promise.all([loadSiteStats(), loadTeachers()]);
  const faces = pickFaces(teachers);
  const where = s.countries.slice(0, 4).map(c => c.name).join(' · ');
  const doors = [
    { kicker: 'For students', title: 'Prepare for your exam, free to start.', text: 'Courses for your syllabus, practice that feels like the real exam, live classes and mentors.', img: '/landing/student-learn.jpg', href: '/students', cta: 'For students', cls: 'bg-[#FFFFFF] border border-line', photo: peoplePhoto('student-1'), tone: 0, dark: false },
    { kicker: 'For tutors', title: 'Teach what you know. Get paid to your phone.', text: 'Build courses, teach live and mentor; your earnings are paid to MTN or Orange Money.', img: '/landing/tutor-builder.jpg', href: '/teach', cta: 'For tutors', cls: 'bg-[#EAF0FF]', photo: peoplePhoto('tutor-1'), tone: 1, dark: false },
    { kicker: 'For schools', title: 'Seats for your class, and see who’s working.', text: 'Invite by link or code, watch progress, nudge the ones who stopped.', img: '/landing/school-dashboard.jpg', href: '/schools', cta: 'For schools', cls: 'bg-[#072061] text-[#FFFFFF]', photo: peoplePhoto('school-1'), tone: 2, dark: true },
  ];

  return (
    <div className="keep-light flex min-h-screen flex-col bg-[#F8F9FC] text-navy">
      <LandingNav />
      <section className="overflow-hidden bg-[#3F6FE8] pt-[112px] lg:pt-[128px]">
        <div className={`${wrap} flex flex-col items-center text-center`}>
          <p className="text-[12.5px] font-extrabold uppercase tracking-[0.08em] text-[#0B1F55]">Exam prep for Africa{where ? ` · ${where}` : ''}</p>
          <h1 className="mt-3 text-[46px] font-extrabold leading-[0.98] tracking-[-0.045em] sm:text-[66px] lg:text-[80px]">Every pass starts<br />with <span className="text-[#FFFFFF]">one question.</span></h1>
          <p className="mt-4 max-w-[640px] text-[16.5px] leading-relaxed text-[#0B1F55] sm:text-[17px]">Courses, a Test Centre, live classes and mentors from real teachers, for students preparing for GCE, WASSCE, NCLEX, IELTS and more. Tutors teach and get paid here; schools give whole classes a head start.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2.5"><Link href="/register" className={btnWhite}>Start free</Link><Link href="/courses" className={btnLine}>Explore courses</Link></div>
          <div className="relative mt-12 w-full max-w-[1000px]">
            <div className="translate-y-3 overflow-hidden rounded-t-xl bg-[#FFFFFF] shadow-[0_-10px_50px_rgba(7,32,97,0.35)]">
              <div aria-hidden className="flex h-[30px] items-center gap-1.5 bg-[#EEF2FA] px-3"><i className="h-[9px] w-[9px] rounded-full bg-[#C9D3E8]" /><i className="h-[9px] w-[9px] rounded-full bg-[#C9D3E8]" /><i className="h-[9px] w-[9px] rounded-full bg-[#C9D3E8]" /></div>
              <img src="/landing/student-dashboard.jpg" alt="The student dashboard: next lesson, study time and the Test Centre" className="block w-full" width={1440} height={900} />
            </div>
            <BrowserShot src="/landing/student-test.jpg" alt="" className="absolute -left-[70px] top-[90px] hidden w-[330px] -rotate-[5deg] lg:block" eager />
            <BrowserShot src="/landing/teacher-wallet.jpg" alt="" className="absolute -right-[70px] top-[130px] hidden w-[330px] rotate-[4deg] lg:block" eager />
          </div>
        </div>
      </section>

      <StatRow items={[[String(s.courses), 'courses'], [String(s.teachers), 'teachers'], [String(s.programmes), 'exams and programmes'], [String(s.countries.length), s.countries.length === 1 ? 'country' : 'countries']]} note={<PayWithChips />} />

      <section className={`${wrap} py-16`}>
        <Kicker center>Who it’s for</Kicker>
        <H2 className="text-center">Pick your <span className="text-[#3F6FE8]">door.</span></H2>
        <div className="mt-8 grid gap-[18px] md:grid-cols-3">
          {doors.map(d => (
            <Link key={d.href} href={d.href} className={`group relative flex flex-col overflow-hidden rounded-[14px] ${d.cls}`}>
              <PersonSlot src={d.photo} tone={d.tone} className="absolute right-4 top-4 h-16 w-16 rotate-3 transition-transform group-hover:rotate-0" />
              <div className="flex flex-col gap-1.5 p-[22px] pb-0 pr-24">
                <span className={`text-[12.5px] font-extrabold uppercase tracking-[0.08em] ${d.dark ? 'text-[#7FA3FF]' : 'text-[#3F6FE8]'}`}>{d.kicker}</span>
                <b className="text-[22px] leading-tight tracking-[-0.02em]">{d.title}</b>
                <span className={`text-[14.5px] leading-relaxed ${d.dark ? 'text-[#C9D4F2]' : 'text-[#3A4A6B]'}`}>{d.text}</span>
                <span className={`my-4 inline-flex h-11 w-fit items-center rounded-[7px] px-[18px] text-[15px] font-extrabold ${d.dark ? 'bg-[#FFFFFF] text-[#072061]' : 'bg-[#2F57C9] text-[#FFFFFF]'}`}>{d.cta} →</span>
              </div>
              <div className="mt-auto pl-[22px]"><img src={d.img} alt="" loading="lazy" className="block w-full rounded-tl-[10px] shadow-[0_18px_44px_rgba(7,32,97,0.18)] transition-transform duration-300 group-hover:-translate-y-1" width={1440} height={900} /></div>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-[#FFFFFF] py-16">
        <div className={wrap}>
          <Kicker>Every portal, one place</Kicker>
          <H2>Everything happens <span className="text-[#3F6FE8]">in one place.</span></H2>
          <p className="mt-3 max-w-[620px] text-[16px] leading-relaxed text-[#3A4A6B]">Students, tutors and schools each get their own portal, built on the same courses, tests and classes.</p>
          <div className="mt-8"><PortalStack cards={PORTALS} /></div>
        </div>
      </section>

      {s.exams.length > 0 && (
        <section className={`${wrap} py-14`}>
          <Kicker>Pick what you’re preparing for</Kicker>
          <div className="mt-4 flex flex-wrap gap-2">
            {s.exams.map(p => <Link key={p.id} href={`/courses?programme=${p.id}`} className="inline-flex h-10 items-center gap-1.5 rounded-[7px] border border-line bg-[#FFFFFF] px-4 text-[15px] font-bold hover:border-[#5889FA]">{p.name}<span className="text-[13px] font-medium text-[#637090]">{p.courses} course{p.courses === 1 ? '' : 's'}</span></Link>)}
            <Link href="/courses" className="inline-flex h-10 items-center rounded-[7px] border border-line bg-[#FFFFFF] px-4 text-[15px] font-extrabold hover:border-[#5889FA]">All {s.programmes} programmes →</Link>
          </div>
        </section>
      )}

      {faces.length > 0 && (
        <section id="teachers" className="scroll-mt-24 border-y border-line bg-[#FFFFFF] py-16">
          <div className={wrap}>
            <div className="flex flex-wrap items-end gap-4">
              <div><Kicker>Our teachers · {teachers.length}{where ? ` · ${where.split(' · ').join(', ')}` : ''}</Kicker><H2>Learn from teachers who’ve<br className="hidden sm:block" /> sat the same exams.</H2></div>
              <span className="hidden flex-1 sm:block" />
              <Link href="/teachers" className="hidden h-11 items-center rounded-md border border-line bg-[#FFFFFF] px-4 text-[15px] font-bold hover:bg-subtle sm:inline-flex">See all {teachers.length} teachers →</Link>
            </div>
            <div className="mt-7"><TeacherFaces list={faces} /></div>
            <Link href="/teachers" className="mt-5 inline-flex h-11 w-full items-center justify-center rounded-md border border-line bg-[#FFFFFF] px-4 text-[15px] font-bold sm:hidden">See all {teachers.length} teachers →</Link>
          </div>
        </section>
      )}

      <section className={`${wrap} py-16`}>
        <H2 className="text-[30px] sm:text-[34px]">Questions</H2>
        <Faq items={[
          ['What is CareerPath Africa?', 'An exam-prep platform for students across Africa: courses by real teachers, a Test Centre with mock exams and past papers, live classes and one-to-one mentoring. Tutors teach and earn on it, and schools buy places for their students.'],
          ['Is it free?', `Yes, to start: ${s.freeCourses} of our ${s.courses} courses are free. Packages add mock exams, live classes and mentoring when you’re ready.`],
          ['Which exams do you cover?', `${s.programmes} exams and programmes, including GCE O and A Level, WASSCE, NCLEX, IELTS and TOEFL. See them all on the course list.`],
          ['How do I pay?', 'With MTN Mobile Money, Orange Money or a card. You only pay for packages or paid courses; free courses stay free.'],
        ]} />
      </section>
      <SiteFooter />
    </div>
  );
}
