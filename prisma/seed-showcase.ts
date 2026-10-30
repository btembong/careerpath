/**
 * CareerPath Africa — Showcase Seed
 * ─────────────────────────────────────────────────────────────────────────────
 * Fills every module with believable demo data so each portal can be presented:
 *   • Teacher profile: bio + intro video (mentors need one to be visible)
 *   • Courses: learning outcomes, language, free previews, commission, a price request
 *   • Review: a course waiting for the demo reviewer + one approved review in history
 *   • Packages: mentorship text, sessions per month, 12-month access for the demo student
 *   • Cohort: weekly upcoming live classes, recordings and attendance on past ones
 *   • Assignments: a graded submission for the demo student
 *   • Mentorship: free times for 3 weeks, an upcoming booking, a past rated session
 *   • Learning: lesson progress so "pick up where you left off" shows
 *   • Teacher subjects and reviews, assignments to hand in and grade, a study plan, flag rules
 *   • Messages + notifications for the demo student
 *
 * Needs the demo accounts and WASSCE package from seed-demo.ts / seed-cohort.ts.
 * Run:  pnpm db:seed-showcase      Safe to re-run — it checks before it adds.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { PrismaClient, CourseStatus, LessonType } from '@prisma/client';

const prisma = new PrismaClient();
const DAY = 86_400_000;
const SAMPLE_VIDEO = 'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4';

const TEACHER = 'teacher@test.com';
const REVIEWER = 'reviewer@test.com';
const STUDENT = 'demo.student@careerpathafrica.test';
const CLASSMATES = ['student1@test.com', 'student2@test.com', 'student3@test.com'];
const PACKAGE = 'WASSCE Maths Prep Pack';
const REVIEW_COURSE = 'Physics · Forces and Motion';

const at = (days: number, h = 17, m = 0) => { const d = new Date(Date.now() + days * DAY); d.setHours(h, m, 0, 0); return d; };
const log = (s: string) => console.log('  ✓ ' + s);

async function main() {
  console.log('Showcase seed');
  const [teacher, reviewer, student] = await Promise.all([TEACHER, REVIEWER, STUDENT].map(email => prisma.userProfile.findUnique({ where: { email } })));
  if (!teacher || !reviewer || !student) throw new Error('Run the demo seeds first: teacher, reviewer and demo student accounts are missing');
  const classmates = (await Promise.all(CLASSMATES.map(email => prisma.userProfile.findUnique({ where: { email } })))).filter(Boolean) as NonNullable<typeof teacher>[];
  const pkg = await prisma.package.findFirst({ where: { name: PACKAGE } });
  if (!pkg) throw new Error(`Package "${PACKAGE}" not found — run seed-demo.ts first`);

  // ── Teacher profile ────────────────────────────────────────────────────
  await prisma.userProfile.update({
    where: { id: teacher.id },
    data: {
      videoIntroUrl: teacher.videoIntroUrl ?? SAMPLE_VIDEO,
      bio: teacher.bio ?? 'Mathematics teacher with 9 years of WASSCE and GCE exam preparation. I focus on exam technique and the topics students lose most marks on.',
    },
  });
  log('Teacher intro video and bio');

  // ── Courses in the package: outcomes, language, free preview, commission ─
  await prisma.platformSetting.upsert({
    where: { key: 'pricing' }, update: {}, create: { key: 'pricing', value: { defaultTeacherCommissionPct: 40 } },
  });
  const outcomes = [
    'Apply the laws of indices and simplify surds',
    'Solve linear, quadratic and simultaneous equations',
    'Use geometry and trigonometry in exam questions',
    'Read statistics and work out probabilities',
  ];
  for (const courseId of pkg.courseIds) {
    const c = await prisma.platformCourse.findUnique({ where: { id: courseId }, include: { modules: { orderBy: { sortOrder: 'asc' }, include: { lessons: { orderBy: { sortOrder: 'asc' } } } } } });
    if (!c) continue;
    await prisma.platformCourse.update({ where: { id: c.id }, data: { outcomes: c.outcomes.length ? c.outcomes : outcomes, language: c.language ?? 'English' } });
    const first = c.modules[0]?.lessons[0];
    if (first && !first.isFree) await prisma.lesson.update({ where: { id: first.id }, data: { isFree: true } });
    await prisma.courseAssignment.upsert({
      where: { courseId: c.id },
      update: {},
      create: { courseId: c.id, teacherId: c.teacherId, teacherCommissionPct: 40, reviewStatus: 'APPROVED' },
    });
    const a = await prisma.courseAssignment.findUnique({ where: { courseId: c.id } });
    if (a && a.teacherCommissionPct == null) await prisma.courseAssignment.update({ where: { courseId: c.id }, data: { teacherCommissionPct: 40 } });
  }
  log('Package courses: outcomes, language, free preview, 40% commission');

  // One approved review in the reviewer's history
  const reviewedId = pkg.courseIds[0];
  const ra = await prisma.courseAssignment.findUnique({ where: { courseId: reviewedId } });
  if (ra && !ra.reviewerId) {
    await prisma.courseAssignment.update({
      where: { courseId: reviewedId },
      data: {
        reviewerId: reviewer.id, reviewerCommissionPct: 5, reviewStatus: 'APPROVED',
        submittedAt: new Date(Date.now() - 40 * DAY), reviewedAt: new Date(Date.now() - 38 * DAY),
        reviewNotes: 'Clear explanations and good exam practice. Approved.',
        reviewChecklist: { accuracy: 'good', syllabus: 'good', media: 'good', quizzes: 'good', preview: 'good' },
      },
    });
  }
  log('Reviewer history: one approved course');

  // A course waiting for review
  let rc = await prisma.platformCourse.findFirst({ where: { title: REVIEW_COURSE, teacherId: teacher.id } });
  if (!rc) {
    const programmeId = (await prisma.platformCourse.findUnique({ where: { id: reviewedId }, select: { programmeId: true } }))?.programmeId ?? null;
    rc = await prisma.platformCourse.create({
      data: {
        title: REVIEW_COURSE, teacherId: teacher.id, programmeId, status: CourseStatus.PENDING_REVIEW, language: 'English',
        shortDescription: 'Newton’s laws, motion graphs and moments — with worked WASSCE questions.',
        description: 'Understand forces and motion from first principles: Newton’s three laws, reading distance–time and velocity–time graphs, and solving problems with moments. Every module ends with exam-style practice.',
        outcomes: ['Apply Newton’s three laws to everyday problems', 'Read and draw motion graphs', 'Solve problems with moments and equilibrium'],
        modules: {
          create: [
            { title: 'Newton’s laws', sortOrder: 0, lessons: { create: [
              { title: 'What is a force?', type: LessonType.VIDEO, sortOrder: 0, isFree: true, videoUrl: SAMPLE_VIDEO, durationSecs: 420 },
              { title: 'The three laws, with examples', type: LessonType.TEXT, sortOrder: 1, content: 'First law: an object stays at rest or keeps moving unless a resultant force acts. Second law: F = ma. Third law: every action has an equal and opposite reaction.' },
              { title: 'Newton’s laws check', type: LessonType.QUIZ, sortOrder: 2, passMark: 60 },
            ] } },
            { title: 'Motion graphs and moments', sortOrder: 1, lessons: { create: [
              { title: 'Distance–time and velocity–time graphs', type: LessonType.VIDEO, sortOrder: 0, videoUrl: SAMPLE_VIDEO, durationSecs: 540 },
              { title: 'Moments and equilibrium', type: LessonType.TEXT, sortOrder: 1, content: 'Moment = force × perpendicular distance from the pivot. In equilibrium, clockwise moments equal anticlockwise moments.' },
            ] } },
          ],
        },
      },
    });
  }
  await prisma.courseAssignment.upsert({
    where: { courseId: rc.id },
    update: { reviewerId: reviewer.id, reviewStatus: 'PENDING', submittedAt: new Date(Date.now() - 3 * DAY) },
    create: { courseId: rc.id, teacherId: teacher.id, reviewerId: reviewer.id, reviewerCommissionPct: 5, teacherCommissionPct: 40, reviewStatus: 'PENDING', submittedAt: new Date(Date.now() - 3 * DAY) },
  });
  if (rc.status !== CourseStatus.PENDING_REVIEW) await prisma.platformCourse.update({ where: { id: rc.id }, data: { status: CourseStatus.PENDING_REVIEW } });
  log(`Review queue: "${REVIEW_COURSE}" waiting 3 days`);

  // A teacher price request for the admin to approve
  const priced = await prisma.platformCourse.findFirst({ where: { teacherId: teacher.id, status: CourseStatus.PUBLISHED, isSoldIndividually: false, id: { notIn: pkg.courseIds } } });
  if (priced && priced.proposedPriceAmount == null) {
    await prisma.platformCourse.update({ where: { id: priced.id }, data: { proposedPriceAmount: 6500, proposedPriceCurrency: 'XAF', priceProposedAt: new Date(Date.now() - DAY) } });
    log(`Price request: "${priced.title}" at XAF 6,500`);
  }

  // ── Package: mentorship and access length ──────────────────────────────
  await prisma.package.update({
    where: { id: pkg.id },
    data: {
      mentorship: pkg.mentorship ?? 'Monthly 1-to-1 session with your teacher',
      mentorshipSessionsPerMonth: pkg.mentorshipSessionsPerMonth ?? 4,
      validityDays: pkg.validityDays ?? 365,
    },
  });
  const purchase = await prisma.packagePurchase.findFirst({ where: { studentId: student.id, packageId: pkg.id } });
  if (purchase && !purchase.expiresAt) await prisma.packagePurchase.update({ where: { id: purchase.id }, data: { expiresAt: new Date(purchase.purchasedAt.getTime() + 365 * DAY) } });
  log('Package: monthly mentorship (4 sessions), 12-month access');

  // ── Cohort: live classes, recordings, attendance, assignments ──────────
  if (pkg.cohortId) {
    const cohortId = pkg.cohortId;
    const future = await prisma.liveClass.count({ where: { cohortId, scheduledAt: { gt: new Date() }, status: { not: 'CANCELLED' } } });
    if (!future) {
      const topics = ['Quadratic equations: exam questions', 'Statistics: reading the data', 'Probability in past papers', 'Mock paper walkthrough'];
      await prisma.liveClass.createMany({
        data: topics.map((title, i) => ({
          cohortId, title, dailyRoomUrl: '', status: 'SCHEDULED' as const, durationMins: 90,
          scheduledAt: at(2 + i * 7), description: i === 0 ? 'Solving by factorising and by the formula, then three past WASSCE questions.' : null,
        })),
      });
    }
    log('Live classes: 4 weekly classes ahead');

    const past = await prisma.liveClass.findMany({ where: { cohortId, scheduledAt: { lt: new Date() }, status: { not: 'CANCELLED' } }, orderBy: { scheduledAt: 'asc' } });
    for (const [i, c] of past.entries()) {
      if (c.status === 'SCHEDULED') await prisma.liveClass.update({ where: { id: c.id }, data: { status: 'COMPLETED' } });
      if (!c.recordingUrl && i < past.length - 1) await prisma.liveClass.update({ where: { id: c.id }, data: { recordingUrl: SAMPLE_VIDEO } });
      for (const [j, s] of classmates.entries()) {
        if ((i + j) % 3 === 2) continue; // not everyone comes to every class
        const joinedAt = new Date(c.scheduledAt.getTime() + j * 120_000);
        await prisma.liveAttendance.upsert({
          where: { liveClassId_studentId: { liveClassId: c.id, studentId: s.id } },
          update: {},
          create: { liveClassId: c.id, studentId: s.id, joinedAt, leftAt: new Date(joinedAt.getTime() + (80 - j * 10) * 60_000) },
        });
      }
    }
    log('Past classes: recordings and classmates’ attendance');

    const firstAssignment = await prisma.assignment.findFirst({ where: { cohortId }, orderBy: { dueDate: 'asc' } });
    if (firstAssignment) {
      await prisma.submission.upsert({
        where: { studentId_assignmentId: { studentId: student.id, assignmentId: firstAssignment.id } },
        update: {},
        create: {
          assignmentId: firstAssignment.id, studentId: student.id, status: 'GRADED',
          grade: Math.round(firstAssignment.maxPoints * 0.72), feedback: 'Good working. Show every step in question 3 to get the method marks.',
          submittedAt: new Date(Date.now() - 4 * DAY),
        },
      });
      log('Assignment: graded submission for the demo student');
    }
  }

  // ── Mentorship ─────────────────────────────────────────────────────────
  const wanted: Date[] = [];
  for (let d = 1; d <= 21; d++) {
    const day = new Date(Date.now() + d * DAY).getDay();
    if (day === 2 || day === 4) wanted.push(at(d, 18, 0), at(d, 18, 30));
    if (day === 6) wanted.push(at(d, 10, 0));
  }
  const existing = await prisma.mentorSlot.findMany({ where: { teacherId: teacher.id, startsAt: { gte: new Date() } }, select: { startsAt: true } });
  const have = new Set(existing.map(s => s.startsAt.getTime()));
  const newSlots = wanted.filter(w => !have.has(w.getTime()));
  if (newSlots.length) await prisma.mentorSlot.createMany({ data: newSlots.map(s => ({ teacherId: teacher.id, startsAt: s, endsAt: new Date(s.getTime() + 30 * 60_000), durationMins: 30 })) });
  log(`Mentorship: ${newSlots.length} new free times over 3 weeks`);

  const upcomingBooking = await prisma.mentorBooking.findFirst({ where: { studentId: student.id, status: { not: 'CANCELLED' }, slot: { startsAt: { gt: new Date() } } } });
  if (!upcomingBooking) {
    const slot = await prisma.mentorSlot.findFirst({ where: { teacherId: teacher.id, isBooked: false, startsAt: { gt: new Date(Date.now() + DAY) } }, orderBy: { startsAt: 'asc' } });
    if (slot) {
      await prisma.$transaction([
        prisma.mentorBooking.create({ data: { slotId: slot.id, studentId: student.id, notes: 'Quadratics — I keep losing marks on word problems.', status: 'CONFIRMED' } }),
        prisma.mentorSlot.update({ where: { id: slot.id }, data: { isBooked: true } }),
      ]);
    }
  }
  const classmate = classmates[0];
  if (classmate) {
    const theirs = await prisma.mentorBooking.findFirst({ where: { studentId: classmate.id, slot: { teacherId: teacher.id, startsAt: { gt: new Date() } } } });
    if (!theirs) {
      const slot = await prisma.mentorSlot.findFirst({ where: { teacherId: teacher.id, isBooked: false, startsAt: { gt: new Date() } }, orderBy: { startsAt: 'asc' } });
      if (slot) await prisma.$transaction([
        prisma.mentorBooking.create({ data: { slotId: slot.id, studentId: classmate.id, notes: 'Go through my Paper 2 mock.', status: 'CONFIRMED' } }),
        prisma.mentorSlot.update({ where: { id: slot.id }, data: { isBooked: true } }),
      ]);
    }
  }
  const pastBooking = await prisma.mentorBooking.findFirst({ where: { studentId: student.id, slot: { startsAt: { lt: new Date() } } } });
  if (!pastBooking) {
    const s = at(-7, 18, 0);
    const slot = await prisma.mentorSlot.create({ data: { teacherId: teacher.id, startsAt: s, endsAt: new Date(s.getTime() + 30 * 60_000), durationMins: 30, isBooked: true } });
    const b = await prisma.mentorBooking.create({ data: { slotId: slot.id, studentId: student.id, notes: 'Planning my revision for the last month.', status: 'COMPLETED' } });
    await prisma.mentorReview.create({ data: { bookingId: b.id, studentId: student.id, teacherId: teacher.id, rating: 5, comment: 'Very helpful — I have a clear plan now.' } });
  }
  log('Mentorship bookings: an upcoming one, a classmate’s, and a past rated session');

  // ── Learning progress ──────────────────────────────────────────────────
  const mainCourse = await prisma.platformCourse.findUnique({
    where: { id: pkg.courseIds[0] },
    include: { modules: { orderBy: { sortOrder: 'asc' }, include: { lessons: { orderBy: { sortOrder: 'asc' } } } } },
  });
  const lessons = mainCourse?.modules.flatMap(m => m.lessons) ?? [];
  for (const [i, l] of lessons.slice(0, 4).entries()) {
    await prisma.lessonProgress.upsert({
      where: { studentId_lessonId: { studentId: student.id, lessonId: l.id } },
      update: {},
      create: { studentId: student.id, lessonId: l.id, completed: i < 3, watchedSecs: l.durationSecs ?? 480, positionSecs: i < 3 ? 0 : 120 },
    });
  }
  log('Learning: 3 lessons done, the 4th started');

  // ── Teachers, assignments, study plan, flag rules ──────────────────────
  await prisma.teacherApplication.upsert({
    where: { userId: teacher.id },
    update: { subjectAreas: ['Mathematics'], yearsExperience: 9 },
    create: { userId: teacher.id, subjectAreas: ['Mathematics'], yearsExperience: 9, bio: 'Mathematics teacher with 9 years of WASSCE and GCE exam preparation.', teachingProgrammeIds: [], teachingSubjectIds: [] },
  });
  for (const [who, rating, comment] of [[student, 5, 'Explains slowly and checks we understand.'], [classmates[0], 4, 'Great exam tips. Classes can run a little long.']] as const) {
    if (!who) continue;
    await prisma.teacherReview.upsert({
      where: { teacherId_studentId: { teacherId: teacher.id, studentId: who.id } },
      update: {},
      create: { teacherId: teacher.id, studentId: who.id, rating, comment },
    });
  }
  log('Teacher: Mathematics, 9 years, two student reviews');

  if (pkg.cohortId) {
    const cohortId = pkg.cohortId;
    const ensure = async (title: string, description: string, dueDays: number, maxPoints: number) =>
      (await prisma.assignment.findFirst({ where: { cohortId, title } }))
      ?? prisma.assignment.create({ data: { cohortId, title, description, maxPoints, dueDate: at(dueDays, 23, 59) } });
    const quad = await ensure('Quadratics worksheet', 'Solve questions 1–10 on the worksheet. Show every step — method marks count.', 5, 20);
    const stats = await ensure('Statistics reading questions', 'Answer the five questions on the frequency table from Monday’s class.', -1, 10);
    // Classmates have handed in work for the teacher to grade; one is late
    for (const [i, c] of classmates.entries()) {
      const a = i === 2 ? stats : quad;
      await prisma.submission.upsert({
        where: { studentId_assignmentId: { studentId: c.id, assignmentId: a.id } },
        update: {},
        create: { assignmentId: a.id, studentId: c.id, status: 'PENDING_REVIEW', note: i === 0 ? 'I wasn’t sure about question 7.' : null,
          submittedAt: i === 2 ? new Date(Date.now() - 2 * 3_600_000) : new Date(Date.now() - (i + 1) * DAY) },
      });
    }
    if (!(await prisma.progressAlert.findFirst({ where: { cohortId, teacherId: teacher.id, type: 'INACTIVE' } }))) {
      await prisma.progressAlert.create({ data: { cohortId, teacherId: teacher.id, type: 'INACTIVE', thresholdDays: 7, enabled: true } });
    }
    log('Assignments: one due in 5 days, one overdue, three hand-ins to grade; inactivity rule');
  }

  const today = new Date(new Date().toDateString());
  const monday = new Date(today.getTime() - ((today.getDay() + 6) % 7) * DAY);
  const planned = await prisma.studyBlock.count({ where: { studentId: student.id, startsAt: { gte: monday } } });
  if (!planned) {
    const plan: [number, number, string, number, boolean][] = [
      [0, 18, 'Statistics notes and 10 questions', 60, true],
      [2, 18, 'Quadratics worksheet', 90, true],
      [4, 17, 'Past paper: Section A', 60, false],
      [7, 18, 'Probability in past papers', 60, false],
      [9, 18, 'Mock test revision', 90, false],
    ];
    await prisma.studyBlock.createMany({
      data: plan.map(([d, h, topic, mins, done]) => {
        const s = new Date(monday.getTime() + d * DAY); s.setHours(h, 0, 0, 0);
        return { studentId: student.id, startsAt: s, durationMins: mins, topic, courseId: pkg.courseIds[0] ?? null, done };
      }),
    });
  }
  log('Study plan: five study sessions over two weeks');

  // ── Messages and notifications ─────────────────────────────────────────
  const thread = await prisma.messageThread.findFirst({
    where: { OR: [{ participantAId: student.id, participantBId: teacher.id }, { participantAId: teacher.id, participantBId: student.id }] },
  });
  if (!thread) {
    const t = await prisma.messageThread.create({ data: { participantAId: student.id, participantBId: teacher.id, lastMessageAt: new Date(Date.now() - 2 * 3_600_000) } });
    await prisma.message.createMany({
      data: [
        { threadId: t.id, senderId: student.id, body: 'Good evening sir, I missed Monday’s class. Is the recording up?', createdAt: new Date(Date.now() - 26 * 3_600_000), readAt: new Date() },
        { threadId: t.id, senderId: teacher.id, body: 'Yes — it’s on your cohort page. Watch it before Wednesday and try questions 4 to 7.', createdAt: new Date(Date.now() - 2 * 3_600_000) },
      ],
    });
  }
  if ((await prisma.notification.count({ where: { userId: student.id } })) < 3) {
    await prisma.notification.createMany({
      data: [
        { userId: student.id, type: 'system', title: 'Assignment graded', body: 'Your teacher graded your first assignment.', href: '/student/cohorts' },
        { userId: student.id, type: 'system', title: 'Live class on Wednesday', body: 'Quadratic equations: exam questions, 17:00.', href: '/student/live' },
        { userId: student.id, type: 'system', title: 'Mentorship session booked', body: 'Your session with your teacher is confirmed.', href: '/student/mentorship' },
      ],
    });
  }
  log('Messages and notifications for the demo student');
  console.log('Done.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
