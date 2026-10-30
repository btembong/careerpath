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
