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
/** A demo worksheet hand-in, served by the portal */
const DEMO_WORK = '/demo/quadratics-worksheet.svg';
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
        create: { assignmentId: a.id, studentId: c.id, status: 'PENDING_REVIEW', note: i === 0 ? 'I wasn’t sure about question 7.' : null, fileUrl: DEMO_WORK,
          submittedAt: i === 2 ? new Date(Date.now() - 2 * 3_600_000) : new Date(Date.now() - (i + 1) * DAY) },
      });
    }
    // Earlier runs left the seeded hand-ins without a file
    await prisma.submission.updateMany({ where: { assignmentId: quad.id, studentId: { in: classmates.map(c => c.id) }, fileUrl: null, grade: null }, data: { fileUrl: DEMO_WORK } });
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

  // ── Leaderboard: points this week, earlier this month, and before ──────
  const people = [student, ...classmates];
  const seeded = await prisma.xPEvent.count({ where: { userId: { in: people.map(x => x.id) }, meta: { path: ['seed'], equals: 'showcase' } } });
  if (!seeded) {
    // [days ago, type] per person: the demo student sits 4th this week, higher over the month
    const plans: [number, string][][] = [
      [[0, 'LESSON_COMPLETE'], [1, 'LESSON_COMPLETE'], [1, 'QUIZ_PASS'], [2, 'FORUM_POST'], [3, 'ASSIGNMENT_SUBMIT'], [12, 'QUIZ_PASS'], [15, 'ASSIGNMENT_PASS'], [20, 'LESSON_COMPLETE'], [40, 'CERTIFICATE_EARNED']],
      [[0, 'QUIZ_PASS'], [1, 'QUIZ_PASS'], [1, 'ASSIGNMENT_PASS'], [2, 'LESSON_COMPLETE'], [2, 'LESSON_COMPLETE'], [3, 'STREAK_BONUS'], [10, 'LESSON_COMPLETE'], [45, 'LESSON_COMPLETE']],
      [[0, 'ASSIGNMENT_PASS'], [1, 'QUIZ_PASS'], [2, 'LESSON_COMPLETE'], [4, 'LESSON_COMPLETE'], [5, 'FORUM_POST'], [9, 'QUIZ_PASS'], [18, 'ASSIGNMENT_PASS'], [25, 'QUIZ_PASS']],
      [[0, 'QUIZ_PASS'], [2, 'ASSIGNMENT_PASS'], [3, 'LESSON_COMPLETE'], [6, 'LESSON_COMPLETE'], [8, 'LESSON_COMPLETE'], [22, 'LESSON_COMPLETE']],
    ];
    const XP: Record<string, number> = { LESSON_COMPLETE: 10, QUIZ_PASS: 25, ASSIGNMENT_SUBMIT: 10, ASSIGNMENT_PASS: 30, FORUM_POST: 5, STREAK_BONUS: 15, CERTIFICATE_EARNED: 100 };
    for (const [i, who] of people.entries()) {
      const plan = plans[i] ?? plans[plans.length - 1];
      await prisma.xPEvent.createMany({
        data: plan.map(([d, type], j) => ({ userId: who.id, type: type as any, points: XP[type], meta: { seed: 'showcase', key: `showcase:${i}:${j}` }, createdAt: new Date(Date.now() - d * DAY - 3_600_000) })),
      });
      await prisma.userProfile.update({ where: { id: who.id }, data: { xpTotal: { increment: plan.reduce((n, [, t]) => n + XP[t], 0) }, streak: [6, 9, 4, 2][i] ?? 1, lastActiveDate: new Date() } });
    }
  }
  for (const badge of ['FIRST_LESSON', 'QUIZ_PERFECT', 'CERTIFICATE_FIRST'] as const) {
    await prisma.userBadge.upsert({ where: { userId_badge: { userId: student.id, badge } }, update: {}, create: { userId: student.id, badge } });
  }
  // A fuller cohort, so the board has a podium above the demo student
  if (pkg.cohortId) {
    const extra: [string, string, string, number, number[]][] = [
      ['student4@test.com', 'Joyce', 'Kuffour', 99_913, [0, 0, 1, 1, 2, 3, 3, 5, 6, 14]],
      ['student5@test.com', 'Yaw', 'Boateng', 99_914, [0, 1, 1, 2, 2, 4, 5, 6, 20]],
      ['student6@test.com', 'Nana', 'Adjei', 99_915, [0, 1, 2, 3, 4, 5, 6, 9]],
    ];
    for (const [i, [email, firstName, lastName, wpUserId, days]] of extra.entries()) {
      const u = await prisma.userProfile.upsert({
        where: { email }, update: {},
        create: { email, firstName, lastName, wpUserId, role: 'STUDENT', onboardingCompleted: true },
      });
      await prisma.cohortRoster.upsert({
        where: { studentId_cohortId: { studentId: u.id, cohortId: pkg.cohortId } }, update: {},
        create: { studentId: u.id, cohortId: pkg.cohortId },
      });
      if (!(await prisma.xPEvent.count({ where: { userId: u.id } }))) {
        // Mostly quiz passes (25) and lessons (10): about 300 points this week each, Joyce highest
        await prisma.xPEvent.createMany({
          data: days.map((d, j) => ({ userId: u.id, type: (j % 2 ? 'LESSON_COMPLETE' : 'QUIZ_PASS') as any, points: j % 2 ? 10 : 25, meta: { seed: 'showcase', key: `showcase:x${i}:${j}` }, createdAt: new Date(Date.now() - d * DAY - 3_600_000) })),
        });
        await prisma.xPEvent.createMany({
          data: [0, 1, 2, 3].slice(0, 3 - i).map(j => ({ userId: u.id, type: 'ASSIGNMENT_PASS' as any, points: 30, meta: { seed: 'showcase', key: `showcase:x${i}:a${j}` }, createdAt: new Date(Date.now() - j * DAY - 7_200_000) })),
        });
        const sum = await prisma.xPEvent.aggregate({ where: { userId: u.id }, _sum: { points: true } });
        await prisma.userProfile.update({ where: { id: u.id }, data: { xpTotal: sum._sum.points ?? 0, streak: [9, 7, 3][i], lastActiveDate: new Date() } });
      }
    }
  }
  // The demo student's display name was its login handle; show the real name instead
  if (!student.name || student.name === student.email.split('@')[0]) {
    await prisma.userProfile.update({ where: { id: student.id }, data: { name: [student.firstName ?? 'Demo', student.lastName ?? 'Student'].join(' ') } });
  }
  // Keep the demo student 4th this week, just behind the podium, whatever they've done themselves
  if (pkg.cohortId) {
    const weekAgo = new Date(Date.now() - 7 * DAY);
    const mine = (await prisma.xPEvent.aggregate({ where: { userId: student.id, createdAt: { gte: weekAgo } }, _sum: { points: true } }))._sum.points ?? 0;
    for (const [email, ahead] of [['student4@test.com', 190], ['student5@test.com', 110], ['student6@test.com', 40]] as const) {
      const u = await prisma.userProfile.findUnique({ where: { email } });
      if (!u) continue;
      const theirs = (await prisma.xPEvent.aggregate({ where: { userId: u.id, createdAt: { gte: weekAgo } }, _sum: { points: true } }))._sum.points ?? 0;
      const need = mine + ahead - theirs;
      if (need <= 0) continue;
      const n = Math.ceil(need / 25);
      await prisma.xPEvent.createMany({
        data: Array.from({ length: n }, (_, j) => ({ userId: u.id, type: 'QUIZ_PASS' as any, points: 25, meta: { seed: 'showcase', key: `showcase:top:${email}:${Date.now()}:${j}` }, createdAt: new Date(Date.now() - (j % 6) * DAY - 5_400_000) })),
      });
      await prisma.userProfile.update({ where: { id: u.id }, data: { xpTotal: { increment: n * 25 } } });
    }
  }
  // One classmate keeps their name private, to show how that looks
  if (classmates[2]) await prisma.userProfile.update({ where: { id: classmates[2].id }, data: { leaderboardVisible: false } });
  log('Leaderboard: a week, a month and more of points; three badges; one private classmate');

  // The package course this teacher teaches: its discussion and quiz belong to them
  const teachCourse = await prisma.platformCourse.findFirst({
    where: { id: { in: pkg.courseIds }, teacherId: teacher.id },
    include: { modules: { orderBy: { sortOrder: 'asc' }, include: { lessons: { orderBy: { sortOrder: 'asc' } } } } },
  });
  const teachLessons = teachCourse?.modules.flatMap(m => m.lessons).filter(l => l.type !== 'QUIZ') ?? [];

  // ── Community: questions, a teacher answer, upvotes, success stories ───
  if (teachCourse) {
    const lessonOf = (n: number) => teachLessons[n]?.id ?? null;
    const post = async (authorId: string, body: string, opts: { lessonId?: string | null; parentId?: string; hoursAgo: number; upvotes?: number; pinned?: boolean }) =>
      (await prisma.courseDiscussionPost.findFirst({ where: { courseId: teachCourse.id, body } }))
      ?? prisma.courseDiscussionPost.create({ data: {
        courseId: teachCourse.id, authorId, body, parentId: opts.parentId ?? null, lessonId: opts.parentId ? null : opts.lessonId ?? null,
        upvoteCount: opts.upvotes ?? 0, isPinned: !!opts.pinned, createdAt: new Date(Date.now() - opts.hoursAgo * 3_600_000),
      } });
    const [c0, c1, c2] = classmates;
    if (c0) await post(c0.id, 'Why do we flip the inequality sign when dividing by a negative?', { lessonId: lessonOf(0), hoursAgo: 2, upvotes: 3 });
    if (c1) {
      const q = await post(c1.id, 'How do I know when to use the formula instead of factorising?', { lessonId: lessonOf(1), hoursAgo: 26, upvotes: 12 });
      await post(teacher.id, 'Try factorising first; if no whole-number pair multiplies to ac and adds to b within a minute, use the formula. In the exam the formula is never wrong — factorising is just faster.', { parentId: q.id, hoursAgo: 22, upvotes: 6 });
      await post(student.id, 'This helped me — I was wasting time trying every pair.', { parentId: q.id, hoursAgo: 20, upvotes: 1 });
    }
    if (c2) {
      const q = await post(c2.id, 'Is question 7 on the Quadratics worksheet a typo? It says 3x but the answer key uses 3x².', { lessonId: lessonOf(2), hoursAgo: 50, upvotes: 5 });
      await post(teacher.id, 'Yes — it should be 3x². Thanks for spotting it; I’ve fixed the worksheet.', { parentId: q.id, hoursAgo: 46, upvotes: 4 });
    }
    await post(student.id, 'Does anyone have a trick for remembering the laws of indices?', { lessonId: lessonOf(0), hoursAgo: 5, upvotes: 2 });
    await post(teacher.id, 'Before Wednesday’s class: post the past-paper question you found hardest, and we’ll do the top three together.', { hoursAgo: 30, upvotes: 7, pinned: true });

    const stories: [typeof student | undefined, string, 'APPROVED' | 'PENDING'][] = [
      [c1, 'I went from a D7 to a B3 in Core Maths. The past-paper walkthroughs showed me where I was losing marks.', 'APPROVED'],
      [c0, 'The live classes made statistics finally click. Being able to rewatch the recording before the test helped a lot.', 'APPROVED'],
      [student, 'The study plan kept me revising every evening, even in exam week.', 'PENDING'],
    ];
    for (const [who, story, status] of stories) {
      if (!who) continue;
      if (!(await prisma.successStorySubmission.findFirst({ where: { studentId: who.id, story } }))) {
        await prisma.successStorySubmission.create({ data: { studentId: who.id, story, consentToPublish: true, status } });
      }
    }
    log('Community: four questions (two answered by the teacher, one pinned) and three success stories');
  }

  // ── Certificates: one earned, the main course on the way ───────────────
  const doneCourseId = pkg.courseIds.find(id => id !== mainCourse?.id);
  if (doneCourseId && !(await prisma.certificate.findFirst({ where: { studentId: student.id, courseId: doneCourseId } }))) {
    await prisma.certificate.create({ data: { studentId: student.id, courseId: doneCourseId, verifyCode: `CPA-${student.id.slice(0, 4).toUpperCase()}-91`, pdfUrl: '', issuedAt: at(-16, 10) } });
  }
  log(doneCourseId ? 'Certificate: one earned' : 'Certificate: skipped (the package has only one course)');

  // ── Settings: notification choices ─────────────────────────────────────
  await prisma.userProfile.update({
    where: { id: student.id },
    data: { notificationPrefs: { news: { inApp: true, email: false }, community: { inApp: true, email: false } }, displayPrefs: { language: 'en', textSize: 'normal', dataSaver: false } },
  });
  log('Settings: announcement emails off for the demo student');

  // ── Rubric for the Quadratics worksheet ────────────────────────────────
  if (pkg.cohortId) {
    const quad = await prisma.assignment.findFirst({ where: { cohortId: pkg.cohortId, title: 'Quadratics worksheet' } });
    if (quad && !(await prisma.assignmentRubric.findUnique({ where: { assignmentId: quad.id } }))) {
      const crit: [string, number, [number, string][]][] = [
        ['Correct method', 8, [[0, 'No method'], [3, 'Started'], [6, 'Small slip'], [8, 'All correct']]],
        ['Accurate answers', 8, [[0, 'None right'], [3, 'A few'], [6, 'Most'], [8, 'All']]],
        ['Working shown', 4, [[0, 'Answers only'], [1, 'Some steps'], [3, 'Most steps'], [4, 'Every step']]],
      ];
      await prisma.assignmentRubric.create({ data: {
        assignmentId: quad.id,
        criteria: { create: crit.map(([title, weight, levels], i) => ({ title, weight, sortOrder: i, descriptors: levels.map(([points, label]) => ({ points, label })) })) },
      } });
    }
    log('Rubric: Quadratics worksheet, three criteria out of 20');
  }

  // ── Quiz: a module quiz with every question type, and answers to mark ──
  if (teachCourse?.modules[0]) {
    let quiz = teachCourse.modules.flatMap(m => m.lessons).find(l => l.type === 'QUIZ');
    if (!quiz) {
      const m0 = teachCourse.modules[0];
      quiz = await prisma.lesson.create({ data: {
        moduleId: m0.id, title: 'Number & Algebra quiz', type: 'QUIZ', sortOrder: (m0.lessons.at(-1)?.sortOrder ?? 0) + 1,
        passMark: 60, timeLimitSecs: 900, maxAttempts: 3, shuffleQuestions: true,
      } });
    }
    const quizId = quiz.id;
    await prisma.lesson.update({ where: { id: quizId }, data: { passMark: quiz.passMark ?? 60, timeLimitSecs: quiz.timeLimitSecs ?? 900, maxAttempts: quiz.maxAttempts || 3, shuffleQuestions: true } });
    {
      const opts = (xs: string[]) => xs.map((text, i) => ({ id: 'abcd'[i], text }));
      const qs = [
        { type: 'MCQ', questionText: 'Simplify (2³ × 2⁴) ÷ 2⁵', options: opts(['2', '4', '8', '16']), correctAnswer: 'b', explanation: 'Add the powers when multiplying (3 + 4 = 7), subtract when dividing (7 − 5 = 2): 2² = 4.', points: 2, videoAtSec: 220 },
        { type: 'MCQ', questionText: 'True or false: a⁰ = 0', options: [{ id: 'a', text: 'True' }, { id: 'b', text: 'False' }], correctAnswer: 'b', explanation: 'Any non-zero number to the power 0 is 1.', points: 1, tags: ['true-false'] },
        { type: 'SHORT_ANSWER', questionText: 'Write √50 in simplest form', correctAnswer: '5√2|5 root 2|5sqrt2', explanation: '√50 = √(25 × 2) = 5√2.', points: 2 },
        { type: 'MCQ', questionText: 'Solve 2x + 3 = 11', options: opts(['x = 3', 'x = 4', 'x = 7', 'x = 8']), correctAnswer: 'b', explanation: 'Subtract 3 (2x = 8), then divide by 2.', points: 1 },
        { type: 'MCQ', questionText: 'Factorise x² + 5x + 6', options: opts(['(x + 1)(x + 6)', '(x + 2)(x + 3)', '(x − 2)(x − 3)', '(x + 5)(x + 1)']), correctAnswer: 'b', explanation: 'Find two numbers that multiply to 6 and add to 5: 2 and 3.', points: 2 },
        { type: 'WRITTEN', questionText: 'Explain why 2⁻¹ = ½', correctAnswer: 'Dividing powers: 2⁰ ÷ 2¹ = 2⁻¹, and 1 ÷ 2 = ½. A negative power means one over the positive power.', explanation: 'A negative power is the reciprocal: 2⁻¹ = 1/2¹.', points: 4 },
      ];
      // Add any of these the quiz doesn't have yet, after its own questions
      const have = await prisma.questionBank.findMany({ where: { lessonId: quizId }, select: { questionText: true, sortOrder: true } });
      const missing = qs.filter(q => !have.some(h => h.questionText === q.questionText));
      const start = Math.max(0, ...have.map(h => h.sortOrder));
      if (missing.length) await prisma.questionBank.createMany({ data: missing.map((q, i) => ({ courseId: teachCourse.id, lessonId: quizId, sortOrder: start + i + 1, difficulty: 'MEDIUM' as const, tags: [], ...q, type: q.type as any })) });
    }
    // Two classmates' attempts wait for their written answer to be marked
    const questions = await prisma.questionBank.findMany({ where: { lessonId: quizId }, orderBy: { sortOrder: 'asc' } });
    const written = questions.find(q => q.type === 'WRITTEN');
    // Each classmate's written answers, matched to the question's topic
    const writtenAnswer = (i: number, question: string) =>
      /2⁻¹/.test(question) ? ['Because 2⁻¹ means 1 over 2, so it is a half. Like 2² = 4 and 2⁻² = 1/4.', 'When you divide 2 by 2 squared you get 2 to the minus 1, which is the same as 2/4 = ½.'][i]
      : /percent/i.test(question) ? ['72 ÷ 120 = 0.6, and 0.6 × 100 = 60%.', '72/120 = 6/10 so it is 60 percent.'][i]
      : ['I showed my working on paper: first simplify, then substitute.', 'I am not sure but I think you rearrange first.'][i];
    for (const i of [0, 1]) {
      const c = classmates[i];
      if (!c || !written || (await prisma.quizAttempt.count({ where: { studentId: c.id, lessonId: quizId } }))) continue;
      const given: Record<string, string> = {};
      let auto = 0;
      for (const q of questions) {
        if (q.type === 'WRITTEN') { given[q.id] = writtenAnswer(i, q.questionText); continue; }
        const right = i === 0 || q.sortOrder % 2 === 1;
        given[q.id] = q.type === 'SHORT_ANSWER' ? (right ? '5√2' : '25√2') : right ? q.correctAnswer : (q.correctAnswer === 'a' ? 'b' : 'a');
        if (right) auto += q.points;
      }
      await prisma.quizAttempt.create({ data: {
        studentId: c.id, courseId: teachCourse.id, lessonId: quizId, answersJson: given, autoScore: auto, finalScore: auto,
        maxScore: questions.reduce((n, q) => n + q.points, 0), passed: false, isFullyGraded: false,
        submittedAt: new Date(Date.now() - (i === 0 ? 2 * DAY : 5 * 3_600_000)), timeTakenSecs: 600 + i * 120,
      } });
    }
    log('Quiz: Number & Algebra quiz with 6 questions of every type; two written answers to mark');
  }

  // ── Country rep: a demo rep for Ghana, sales and commission ────────────
  const ghana = student.countryId ? await prisma.country.findUnique({ where: { id: student.countryId } }) : null;
  const repUser = await prisma.userProfile.findUnique({ where: { email: 'rep@test.com' } });
  if (ghana && repUser) {
    await prisma.userProfile.update({
      where: { id: repUser.id },
      data: {
        countryId: repUser.countryId ?? ghana.id,
        firstName: repUser.firstName ?? 'Kwesi', lastName: repUser.lastName ?? 'Appiah', name: repUser.name ?? 'Kwesi Appiah',
        phone: repUser.phone ?? '+233 20 555 0142',
        bio: repUser.bio ?? 'I help schools and families in Ghana get started with CareerPath Africa. Call or WhatsApp me any weekday.',
      },
    });
    if (ghana.repCommissionPercent == null || ghana.perStudentBonus == null) {
      await prisma.country.update({ where: { id: ghana.id }, data: { repCommissionPercent: ghana.repCommissionPercent ?? 10, perStudentBonus: ghana.perStudentBonus ?? 2000 } });
    }
    const pct = ghana.repCommissionPercent ?? 10;
    const wallet = await prisma.wallet.upsert({ where: { userId: repUser.id }, update: {}, create: { userId: repUser.id, balance: 0, currency: ghana.currency } });
    const credit = async (amount: number, at: Date, link: { packagePurchaseId?: string; coursePurchaseId?: string }, description: string) => {
      await prisma.walletTransaction.create({ data: { walletId: wallet.id, type: 'CREDIT', source: 'COUNTRY_BONUS', amount, currency: ghana.currency, createdAt: at, description, ...link } });
      await prisma.wallet.update({ where: { id: wallet.id }, data: { balance: { increment: amount } } });
    };

    // Demo classmates live in Ghana and bought the package over the last two months
    const buyers = await prisma.userProfile.findMany({ where: { email: { in: ['student1@test.com', 'student2@test.com', 'student3@test.com', 'student4@test.com', 'student5@test.com', 'student6@test.com'] } } });
    await prisma.userProfile.updateMany({ where: { id: { in: buyers.map(b => b.id) }, countryId: null }, data: { countryId: ghana.id } });
    const daysAgo = [2, 4, 9, 16, 24, 38];
    for (const [i, b] of buyers.entries()) {
      if (await prisma.packagePurchase.findFirst({ where: { studentId: b.id, packageId: pkg.id } })) continue;
      const at = new Date(Date.now() - daysAgo[i] * DAY);
      // One older buyer's access runs out this week, so there's a renewal to chase
      const expiresAt = i === 5 ? new Date(Date.now() + 5 * DAY) : new Date(+at + 365 * DAY);
      const purchase = await prisma.packagePurchase.create({ data: { studentId: b.id, packageId: pkg.id, purchasedAt: at, expiresAt, amountPaid: pkg.priceAmount, currency: pkg.currency, gateway: i % 2 ? 'paystack' : 'tranzak' } });
      await credit(Math.floor(pkg.priceAmount * pct / 100), at, { packagePurchaseId: purchase.id }, 'Commission from package purchase');
    }
    // Two single-course sales
    const soloCourse = await prisma.platformCourse.findFirst({ where: { id: { in: pkg.courseIds }, isSoldIndividually: true, teacherId: teacher.id } });
    if (soloCourse?.priceAmount) {
      for (const [i, email] of ['student5@test.com', 'student6@test.com'].entries()) {
        const b = buyers.find(x => x.email === email);
        if (!b || await prisma.coursePurchase.findUnique({ where: { studentId_courseId: { studentId: b.id, courseId: soloCourse.id } } })) continue;
        const at = new Date(Date.now() - (i ? 11 : 1) * DAY);
        const purchase = await prisma.coursePurchase.create({ data: { studentId: b.id, courseId: soloCourse.id, amountPaid: soloCourse.priceAmount, currency: soloCourse.priceCurrency ?? ghana.currency, purchasedAt: at, expiresAt: new Date(+at + 365 * DAY), gateway: 'paystack' } });
        await credit(Math.floor(soloCourse.priceAmount * pct / 100), at, { coursePurchaseId: purchase.id }, 'Commission from course sale');
      }
    }
    // Last month's per-student bonus
    if (!(await prisma.walletTransaction.count({ where: { walletId: wallet.id, source: 'COUNTRY_BONUS', packagePurchaseId: null, coursePurchaseId: null } }))) {
      const first = new Date(new Date().getFullYear(), new Date().getMonth(), 1, 2);
      await credit((ghana.perStudentBonus ?? 2000) * 4, first, {}, `Per-student bonus: 4 active student(s) × ${ghana.perStudentBonus ?? 2000} ${ghana.currency}`);
    }

    // Teachers in Ghana: the demo teachers, and one application waiting
    await prisma.userProfile.updateMany({ where: { email: { in: [TEACHER, 'teacher.demo@cpa.test'] }, countryId: null }, data: { countryId: ghana.id } });
    const applicant = await prisma.userProfile.upsert({
      where: { email: 'teacher.applicant@test.com' }, update: {},
      create: { email: 'teacher.applicant@test.com', wpUserId: 99_920, role: 'TEACHER', approvalStatus: 'PENDING', countryId: ghana.id, firstName: 'Esi', lastName: 'Quaye', name: 'Esi Quaye' },
    });
    await prisma.teacherApplication.upsert({
      where: { userId: applicant.id }, update: {},
      create: { userId: applicant.id, subjectAreas: ['English Language'], yearsExperience: 6, bio: 'English teacher in Takoradi preparing students for WASSCE English for six years.', teachingProgrammeIds: [], teachingSubjectIds: [], submittedAt: new Date(Date.now() - 3 * DAY) },
    });
    log('Country rep: rep@test.com covers Ghana; 6 package and 2 course sales with commission; a teacher application');
  }

  // ── Subject reviewer: name, subjects and commission ────────────────────
  if (!reviewer.firstName) {
    const subjects = await prisma.subject.findMany({ where: { name: { in: ['Mathematics', 'Chemistry', 'Physics'] } }, select: { id: true } });
    await prisma.userProfile.update({
      where: { id: reviewer.id },
      data: {
        firstName: 'Sena', lastName: 'Rahman', name: 'Sena Rahman', phone: '+233 24 000 1182', countryId: reviewer.countryId ?? student.countryId,
        bio: 'Accurate content that matches the syllabus, clear explanations, quizzes that test the lesson, and good audio.',
        teachingSubjects: { connect: subjects.map(s => ({ id: s.id })) },
      },
    });
  }
  await prisma.courseAssignment.updateMany({ where: { reviewerId: reviewer.id, reviewerCommissionPct: null }, data: { reviewerCommissionPct: 10 } });
  log('Reviewer: Sena Rahman, subjects and a 10% share');

  // ── Flashcards: decks with some cards known and some due ───────────────
  if (teachCourse && !(await prisma.flashcardDeck.count({ where: { courseId: teachCourse.id } }))) {
    const algebra = await prisma.platformCourse.findFirst({ where: { title: { startsWith: 'Algebra Foundations' } }, select: { id: true } });
    const decks: [string | undefined, string, [string, string][], number][] = [
      [algebra?.id ?? teachCourse.id, 'Indices and surds', [
        ['What is a surd?', 'A root that can’t be simplified to a whole number, like √2 or √5.'], ['aᵐ × aⁿ = ?', 'aᵐ⁺ⁿ — add the powers.'], ['aᵐ ÷ aⁿ = ?', 'aᵐ⁻ⁿ — subtract the powers.'],
        ['(aᵐ)ⁿ = ?', 'aᵐⁿ — multiply the powers.'], ['a⁰ = ?', '1, for any a that isn’t 0.'], ['a⁻ⁿ = ?', '1 / aⁿ'], ['a^(1/2) = ?', '√a'], ['Simplify √50', '5√2'],
        ['Simplify √12 × √3', '6'], ['Rationalise 1/√2', '√2 / 2'], ['Simplify 2√3 + 5√3', '7√3'], ['Write 8^(2/3) as a whole number', '4'],
      ], 9],
      [teachCourse.id, 'Quadratic equations', [
        ['Standard form of a quadratic', 'ax² + bx + c = 0'], ['The quadratic formula', 'x = (−b ± √(b² − 4ac)) / 2a'], ['What is the discriminant?', 'b² − 4ac'],
        ['Discriminant > 0 means…', 'two different real roots'], ['Discriminant = 0 means…', 'one repeated root'], ['Discriminant < 0 means…', 'no real roots'],
        ['Factorise x² + 5x + 6', '(x + 2)(x + 3)'], ['Factorise x² − 9', '(x − 3)(x + 3)'], ['Sum of the roots', '−b / a'], ['Product of the roots', 'c / a'],
        ['Complete the square: x² + 6x', '(x + 3)² − 9'], ['Vertex of y = (x − 2)² + 1', '(2, 1)'], ['Solve x² = 16', 'x = ±4'], ['Solve (x − 1)(x + 4) = 0', 'x = 1 or x = −4'], ['When should you use the formula?', 'When no whole-number pair factorises it quickly.'],
      ], 6],
      [teachCourse.id, 'Statistics words', [
        ['Mean', 'Add the values and divide by how many there are.'], ['Median', 'The middle value when the data is in order.'], ['Mode', 'The value that appears most often.'],
        ['Range', 'Largest value minus smallest.'], ['Frequency', 'How many times a value occurs.'], ['Cumulative frequency', 'Running total of the frequencies.'],
        ['Interquartile range', 'Upper quartile minus lower quartile.'], ['Histogram', 'Bars whose area shows frequency.'], ['Outlier', 'A value far from the rest.'], ['Probability of an impossible event', '0'],
      ], 9],
    ];
    for (const [courseId, title, cards, known] of decks) {
      if (!courseId) continue;
      const deck = await prisma.flashcardDeck.create({ data: { courseId, title, cards: { create: cards.map(([front, back], i) => ({ front, back, order: i })) } }, include: { cards: { orderBy: { order: 'asc' } } } });
      // Reviewed over the last four days: the first `known` cards easy (due later), a few hard ones due now
      await prisma.flashcardReview.createMany({
        data: deck.cards.slice(0, Math.min(cards.length, known + 2)).map((c, i) => {
          const reviewedAt = new Date(Date.now() - ((i % 4) + 1) * DAY);
          const easy = i < known;
          return { deckId: deck.id, studentId: student.id, cardId: c.id, difficulty: easy ? 1 : 2, reviewedAt, nextReviewAt: new Date(+reviewedAt + (easy ? 6 : 1) * DAY) };
        }),
      });
    }
    // A deck not started yet
    const english = await prisma.platformCourse.findFirst({ where: { title: { contains: 'English' }, status: 'PUBLISHED' }, select: { id: true } });
    if (english) {
      const words: [string, string][] = [['However', 'Shows contrast'], ['Therefore', 'Shows a result'], ['Furthermore', 'Adds a point'], ['For instance', 'Introduces an example'], ['In conclusion', 'Sums up']];
      await prisma.flashcardDeck.create({ data: { courseId: english.id, title: 'Essay connectors', cards: { create: words.map(([front, back], i) => ({ front, back, order: i })) } } });
    }
    log('Flashcards: four decks, three part-learned with cards due, a four-day review streak');
  }

  // ── Quiz history for the demo student ──────────────────────────────────
  if (teachCourse && !(await prisma.quizAttempt.count({ where: { studentId: student.id } }))) {
    const quizLessons = teachCourse.modules.flatMap(m => m.lessons).filter(l => l.type === 'QUIZ');
    const attempt = async (lessonId: string, targetPct: number, daysBack: number, opts: { written?: boolean; secs?: number } = {}) => {
      const qs = await prisma.questionBank.findMany({ where: { lessonId }, orderBy: { sortOrder: 'asc' } });
      if (!qs.length) return;
      const auto = qs.filter(q => q.type !== 'WRITTEN');
      const total = qs.reduce((n, q) => n + q.points, 0);
      const answers: Record<string, string> = {};
      let score = 0;
      const autoTarget = Math.round((total * targetPct) / 100);
      for (const q of auto) {
        const right = score + q.points <= autoTarget;
        if (right) score += q.points;
        answers[q.id] = q.type === 'SHORT_ANSWER' ? (right ? q.correctAnswer.split('|')[0] : 'not sure') : right ? q.correctAnswer : (q.correctAnswer === 'a' ? 'b' : 'a');
      }
      const hasWritten = qs.some(q => q.type === 'WRITTEN');
      for (const q of qs.filter(q => q.type === 'WRITTEN')) answers[q.id] = /percent/i.test(q.questionText) ? '72 ÷ 120 × 100 = 60%' : 'A negative power means one over the positive power, so 2⁻¹ = 1/2.';
      const marking = hasWritten && !!opts.written;
      // Land on the target score: written marks make up the difference (capped by what the written questions are worth)
      const writtenMax = qs.filter(q => q.type === 'WRITTEN').reduce((n, q) => n + q.points, 0);
      const target = Math.round((total * targetPct) / 100);
      if (score > target) score = target;
      const manual = hasWritten && !marking ? Math.max(0, Math.min(writtenMax, target - score)) : 0;
      const final = score + manual;
      await prisma.quizAttempt.create({ data: {
        studentId: student.id, courseId: teachCourse.id, lessonId, answersJson: answers, autoScore: score, manualScore: manual, finalScore: final, maxScore: total,
        passed: !marking && final / total * 100 >= 60, isFullyGraded: !marking, submittedAt: new Date(Date.now() - daysBack * DAY - 3_600_000), timeTakenSecs: opts.secs ?? 720,
        feedback: !marking && hasWritten ? 'Good method on the written question — show the units in your final line.' : null, gradedAt: !marking && hasWritten ? new Date(Date.now() - (daysBack - 1) * DAY) : null,
      } });
    };
    const [q1, q2, q3] = quizLessons;
    if (q3) await attempt(q3.id, 54, 9, { secs: 840 });
    if (q3) await attempt(q3.id, 78, 6, { secs: 700 });
    if (q1) await attempt(q1.id, 82, 1, { secs: 720 });
    if (q2) await attempt(q2.id, 70, 3, { written: true, secs: 900 });
    if (q1) await attempt(q1.id, 58, 20, { secs: 960 });
    log('Quiz history: five attempts — passed, not yet, and one being marked');
  }

  // ── Messages: the teacher's inbox, and support ─────────────────────────
  const ensureThread = async (a: string, b: string, msgs: [string, string, number][]) => {
    const [x, y] = [a, b].sort();
    if (await prisma.messageThread.findUnique({ where: { participantAId_participantBId: { participantAId: x, participantBId: y } } })) return;
    const last = Math.min(...msgs.map(m => m[2]));
    const t = await prisma.messageThread.create({ data: { participantAId: x, participantBId: y, lastMessageAt: new Date(Date.now() - last * 60_000) } });
    await prisma.message.createMany({
      data: msgs.map(([from, body, minsAgo], i) => ({ threadId: t.id, senderId: from, body, createdAt: new Date(Date.now() - minsAgo * 60_000), readAt: i < msgs.length - 1 ? new Date() : null })),
    });
  };
  const [abena, kwame, efua] = classmates;
  if (abena) await ensureThread(abena.id, teacher.id, [
    [abena.id, 'Good evening sir. Is question 7 on the worksheet a typo? It says 3x.', 14 * 60], [teacher.id, 'Yes — it should be 3x². Well spotted, I’ve fixed it.', 13 * 60 + 40], [abena.id, 'Thank you! Can I hand in on Thursday instead?', 35],
  ]);
  if (kwame) await ensureThread(kwame.id, teacher.id, [[teacher.id, 'Kwame, the recording from Monday is up — watch it before Wednesday.', 26 * 60], [kwame.id, 'Thank you, I’ll watch it tonight', 25 * 60]]);
  if (efua) await ensureThread(efua.id, teacher.id, [[efua.id, 'Sorry my statistics work is late, I was ill on Monday.', 3 * 60]]);
  const support = await prisma.userProfile.findFirst({ where: { role: 'ADMIN', approvalStatus: 'APPROVED' }, orderBy: { createdAt: 'asc' } });
  if (support) await ensureThread(student.id, support.id, [[student.id, 'Hello, I paid with mobile money but the package didn’t show at first.', 5 * 24 * 60], [support.id, 'Sorry about that — your payment was received and the package is now on your account.', 5 * 24 * 60 - 90]]);
  log('Messages: three student threads for the teacher, support for the student');

  // ── Cohort group chat ──────────────────────────────────────────────────
  if (pkg.cohortId) {
    const group = await prisma.messageThread.upsert({ where: { cohortId: pkg.cohortId }, update: {}, create: { cohortId: pkg.cohortId } });
    if (!(await prisma.message.count({ where: { threadId: group.id } }))) {
      const posts: [string | undefined, string, number][] = [
        [teacher.id, 'Welcome to the WASSCE Maths group 👋 Ask questions here any time — someone usually answers within the hour.', 6 * 24 * 60],
        [classmates[0]?.id, 'Has anyone finished question 5 on the quadratics worksheet? I keep getting a negative under the root.', 26 * 60],
        [classmates[1]?.id, 'Check the sign of c — it should be −1, so b² − 4ac = 16 + 4 = 20.', 25 * 60 + 30],
        [classmates[0]?.id, 'Ahh I see it now, thank you!', 25 * 60],
        [teacher.id, 'Reminder: live class on Wednesday at 17:00 — we’ll do three past questions on quadratics. Bring your worksheet.', 3 * 60],
        [student.id, 'Will the recording be up after? I have church that evening.', 2 * 60],
        [teacher.id, 'Yes, it goes on the cohort page within an hour.', 100],
      ];
      for (const [from, body, minsAgo] of posts) {
        if (!from) continue;
        await prisma.message.create({ data: { threadId: group.id, senderId: from, body, createdAt: new Date(Date.now() - minsAgo * 60_000) } });
      }
      await prisma.messageThread.update({ where: { id: group.id }, data: { lastMessageAt: new Date(Date.now() - 100 * 60_000) } });
      // The teacher has read it all; the demo student hasn't seen the last answer
      await prisma.threadRead.upsert({ where: { threadId_userId: { threadId: group.id, userId: teacher.id } }, update: {}, create: { threadId: group.id, userId: teacher.id } });
      await prisma.threadRead.upsert({ where: { threadId_userId: { threadId: group.id, userId: student.id } }, update: {}, create: { threadId: group.id, userId: student.id, lastReadAt: new Date(Date.now() - 110 * 60_000) } });
    }
    log('Messages: a cohort group chat with the teacher and classmates');
  }

  // ── Messages and notifications ─────────────────────────────────────────
  const thread = await prisma.messageThread.findFirst({
    where: { OR: [{ participantAId: student.id, participantBId: teacher.id }, { participantAId: teacher.id, participantBId: student.id }] },
  });
  if (!thread) {
    const [pa, pb] = [student.id, teacher.id].sort(); // the API stores the smaller id first
    const t = await prisma.messageThread.create({ data: { participantAId: pa, participantBId: pb, lastMessageAt: new Date(Date.now() - 2 * 3_600_000) } });
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

  // ── Money: payout accounts, six months of earnings, paid and pending statements ─
  await seedMoney(teacher, reviewer, student, pkg.courseIds);

  // ── Admin pages: support, referrals, a coupon, an organisation, an announcement ─
  await seedAdminPages(student, pkg.id);
  console.log('Done.');
}

type Person = { id: string; email: string };
const monthStart = (back: number) => { const n = new Date(); return new Date(n.getFullYear(), n.getMonth() - back, 1); };

async function seedMoney(teacher: Person, reviewer: Person, student: Person, packageCourseIds: string[]) {
  const rep = await prisma.userProfile.findUnique({ where: { email: 'rep@test.com' } });
  const other = await prisma.userProfile.findUnique({ where: { email: 'teacher.demo@cpa.test' } });
  if (await prisma.payoutStatement.count({ where: { recipientId: teacher.id } })) { log('Money: already seeded'); return; }
  const currency = 'GHS';
  const courses = await prisma.platformCourse.findMany({ where: { OR: [{ id: { in: packageCourseIds } }, { teacherId: teacher.id }] }, select: { id: true, title: true, teacherId: true }, take: 6 });
  const mine = courses.filter(c => c.teacherId === teacher.id);
  const names = ['Abena M.', 'Kofi O.', 'Yaw B.', 'Akosua D.', 'Kwame A.', 'Efua T.', 'Nana K.', 'Ama S.'];

  // Payout accounts: verified MoMo for the teacher and rep, a bank account the reviewer just changed
  const account = (userId: string, bankName: string, accountNumber: string, verified: boolean, verifiedDaysAgo: number | null) =>
    prisma.payoutAccount.upsert({
      where: { userId }, update: {},
      create: { userId, bankName, accountNumber, country: 'Ghana', isVerified: verified, verifiedAt: verifiedDaysAgo == null ? null : new Date(Date.now() - verifiedDaysAgo * DAY) },
    });
  await account(teacher.id, 'MTN Mobile Money', '024 555 1182', true, 28);
  if (rep) await account(rep.id, 'MTN Mobile Money', '020 555 0142', true, 60);
  await account(reviewer.id, 'GCB Bank', '1021 3300 4402', false, 95);

  const walletOf = async (userId: string) => prisma.wallet.upsert({ where: { userId }, update: {}, create: { userId, balance: 0, currency } });
  // Credits spread over a month: n sales of roughly `each`, on random-looking but fixed days
  const credits = async (walletId: string, back: number, n: number, each: number, source: 'COURSE_SALE' | 'REVIEW_COMMISSION' | 'COUNTRY_BONUS', label: (i: number) => { description: string; courseId?: string }) => {
    const start = monthStart(back), end = back === 0 ? new Date() : monthStart(back - 1);
    const span = +end - +start;
    for (let i = 0; i < n; i++) {
      const createdAt = new Date(+start + ((i * 7919) % 97) / 97 * span * 0.98 + 3_600_000);
      await prisma.walletTransaction.create({ data: { walletId, type: 'CREDIT', source, amount: each + ((i * 37) % 5) * 500, currency, createdAt, ...label(i) } });
    }
  };
  // Statements: older months paid on the 1st with a reference, last month waiting
  const statements = async (userId: string, walletId: string, type: 'TEACHER' | 'SUBJECT_REVIEWER' | 'COUNTRY_REP', paidTo: string | null, tag: string) => {
    for (let back = 5; back >= 1; back--) {
      const periodStart = monthStart(back), periodEnd = new Date(+monthStart(back - 1) - 1);
      const sum = (await prisma.walletTransaction.aggregate({ where: { walletId, type: 'CREDIT', source: { not: 'PAYOUT' }, createdAt: { gte: periodStart, lte: periodEnd } }, _sum: { amount: true } }))._sum.amount ?? 0;
      if (!sum) continue;
      const paid = back >= 2 && paidTo;
      const paidAt = new Date(+monthStart(back - 1) + 9 * 3_600_000);
      const reference = paid ? `MP${String(paidAt.getFullYear()).slice(2)}${String(paidAt.getMonth() + 1).padStart(2, '0')}01.${tag}` : null;
      await prisma.payoutStatement.create({ data: { recipientId: userId, recipientType: type, periodStart, periodEnd, amount: sum, currency, status: paid ? 'PAID' : 'PENDING', paidAt: paid ? paidAt : null, reference, paidTo: paid ? paidTo : null } });
      if (paid) await prisma.walletTransaction.create({ data: { walletId, type: 'DEBIT', source: 'PAYOUT', amount: sum, currency, createdAt: paidAt, description: `Payout for ${periodStart.toISOString().slice(0, 10)} – ${periodEnd.toISOString().slice(0, 10)} to ${paidTo} · ref ${reference}` } });
    }
  };
  const settle = async (walletId: string) => {
    const [c, d] = await Promise.all(['CREDIT', 'DEBIT'].map(type => prisma.walletTransaction.aggregate({ where: { walletId, type: type as 'CREDIT' }, _sum: { amount: true } })));
    await prisma.wallet.update({ where: { id: walletId }, data: { balance: (c._sum.amount ?? 0) - (d._sum.amount ?? 0) } });
  };

  // Teacher: course sales growing month by month
  const tw = await walletOf(teacher.id);
  const sales = [9, 12, 11, 15, 17, 14];
  for (let back = 5; back >= 0; back--) {
    await credits(tw.id, back, sales[5 - back], 6000, 'COURSE_SALE', i => {
      const c = mine[i % Math.max(1, mine.length)];
      return { courseId: c?.id, description: `${names[(i + back) % names.length]} · ${i % 3 ? 'package' : 'single course'}` };
    });
  }
  await statements(teacher.id, tw.id, 'TEACHER', 'MTN Mobile Money ·· 1182', 'C1182');
  await settle(tw.id);

  // Reviewer: a share of approved courses' sales; the account was changed, so last month can't be paid yet
  const rw = await walletOf(reviewer.id);
  for (let back = 4; back >= 0; back--) {
    await credits(rw.id, back, 5 + back, 1500, 'REVIEW_COMMISSION', i => ({ courseId: courses[i % courses.length]?.id, description: `${names[(i + 3) % names.length]} · review share` }));
  }
  await statements(reviewer.id, rw.id, 'SUBJECT_REVIEWER', 'GCB Bank ·· 4402', 'B4402');
  await settle(rw.id);

  // Rep: older months of commission (this month's come from the rep section above)
  if (rep) {
    const pw = await walletOf(rep.id);
    for (let back = 5; back >= 2; back--) {
      await credits(pw.id, back, 4 + (5 - back) * 2, 4500, 'COUNTRY_BONUS', i => ({ description: `Commission · ${names[i % names.length]}` }));
    }
    await statements(rep.id, pw.id, 'COUNTRY_REP', 'MTN Mobile Money ·· 0142', 'R0142');
    await settle(pw.id);
  }

  // A second teacher owed money with no payout account yet
  if (other) {
    // Two "Demo Teacher"s on the payouts list would look like one person paid twice
    if (other.name === 'Demo Teacher' || !other.name) await prisma.userProfile.update({ where: { id: other.id }, data: { name: 'Ama Owusu', firstName: 'Ama', lastName: 'Owusu' } });
    const ow = await walletOf(other.id);
    await credits(ow.id, 1, 6, 5000, 'COURSE_SALE', i => ({ description: `${names[(i + 5) % names.length]} · single course` }));
    await statements(other.id, ow.id, 'TEACHER', null, 'X');
    await settle(ow.id);
  }

  // Demo student: a single course paid by card, so billing has a real receipt
  const solo = await prisma.platformCourse.findFirst({ where: { id: { in: packageCourseIds }, isSoldIndividually: true, priceAmount: { gt: 0 } } });
  if (solo?.priceAmount && !(await prisma.coursePurchase.findUnique({ where: { studentId_courseId: { studentId: student.id, courseId: solo.id } } }))) {
    const at = new Date(Date.now() - 88 * DAY);
    await prisma.coursePurchase.create({ data: { studentId: student.id, courseId: solo.id, amountPaid: solo.priceAmount, currency: solo.priceCurrency ?? currency, purchasedAt: at, expiresAt: new Date(+at + 365 * DAY), gateway: 'paystack', gatewayRef: 'T418820937', invoiceNo: 'CPA-2026-00288' } });
  }
  log('Money: payout accounts, six months of earnings, paid and pending statements, a card purchase for the student');
}

async function seedAdminPages(student: Person, packageId: string) {
  const admin = await prisma.userProfile.findFirst({ where: { email: 'admin@test.com' } });
  // Classmates who joined with the demo student's link
  const friends = await prisma.userProfile.findMany({ where: { email: { in: ['student1@test.com', 'student2@test.com', 'student3@test.com'] }, referredById: null } });
  if (friends.length) await prisma.userProfile.updateMany({ where: { id: { in: friends.map(f => f.id) } }, data: { referredById: student.id } });

  if (!(await prisma.supportTicket.count({ where: { studentId: student.id } }))) {
    await prisma.supportTicket.createMany({
      data: [
        { studentId: student.id, category: 'Payment', subject: 'Charged twice for the Maths pack', message: 'I paid with MoMo and was charged GHS 150 twice, a minute apart. Receipt CPA-2026-00288.', status: 'RESOLVED', adminNote: 'Sorry about that — the second charge has been refunded to your MoMo. It shows within 2 days.', createdAt: new Date(Date.now() - 4 * DAY) },
        { studentId: student.id, category: 'Technical problem', subject: 'Video won’t play on my phone', message: 'The Quadratics video stays black on my Tecno phone. Audio works.', status: 'OPEN', createdAt: new Date(Date.now() - 3 * 3_600_000) },
      ],
    });
  }
  const pkg = await prisma.package.findUnique({ where: { id: packageId }, select: { priceAmount: true } });
  await prisma.coupon.upsert({ where: { code: 'WASSCE20' }, update: {}, create: { code: 'WASSCE20', percentOff: 20, packageId, maxRedemptions: 100, expiresAt: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 30) } });
  await prisma.coupon.upsert({ where: { code: 'SCHOOLGH' }, update: {}, create: { code: 'SCHOOLGH', amountOff: Math.round((pkg?.priceAmount ?? 15000) / 10), packageId } });

  if (!(await prisma.orgEnrollment.count({ where: { organizationName: 'Achimota School' } }))) {
    const emails = ['ama.k@achimota.edu.gh', 'kojo.b@achimota.edu.gh', 'esi.d@achimota.edu.gh', 'yaw.m@achimota.edu.gh', 'adwoa.s@achimota.edu.gh'];
    const org = await prisma.orgEnrollment.create({ data: { organizationName: 'Achimota School', contactEmail: 'head.maths@achimota.edu.gh', packageId, seatsPurchased: emails.length, purchasedAt: new Date(Date.now() - 20 * DAY) } });
    await prisma.orgSeat.createMany({ data: emails.map(inviteEmail => ({ orgEnrollmentId: org.id, inviteEmail })) });
  }
  if (admin && !(await prisma.broadcast.count())) {
    await prisma.broadcast.create({ data: { title: 'Payouts on the 1st', body: 'October earnings are paid on 1 November to verified payout accounts.', audience: 'TEACHER', channel: 'IN_APP', sentById: admin.id, recipientCount: 4, sentAt: new Date(Date.now() - 6 * DAY) } });
  }
  log('Admin pages: 3 referred friends, 2 support requests, 2 coupons, a school with 5 seats, an announcement');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
