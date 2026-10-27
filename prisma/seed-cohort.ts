/**
 * CareerPath Africa — Cohort Simulation Seed
 * ─────────────────────────────────────────────────────────────────────────────
 * Simulates a complete live-teaching cohort end-to-end:
 *
 *   1  Cohort         WASSCE Maths — Nov 2026 Sitting
 *   2  Teacher        teacher@test.com  (from seed-demo)
 *   3  Students       3 students (student@test.com + 2 extras)
 *   4  Live classes   2 COMPLETED (past) + 1 SCHEDULED (upcoming)
 *   5  Attendance     records for both completed classes
 *   6  Assignments    1 closed (graded) + 1 open (pending submissions)
 *   7  Submissions    mixed: graded / pending / missing
 *
 * Run:
 *   pnpm ts-node prisma/seed-cohort.ts
 *
 * Safe to re-run — all writes are idempotent (findFirst-or-create / upsert).
 * Requires seed-demo.ts to have been run first (needs teacher@test.com + package).
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  PrismaClient,
  UserRole,
  ApprovalStatus,
  ClassStatus,
  SubmissionStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

// ─── Config ───────────────────────────────────────────────────────────────────

const TEACHER_EMAIL = 'teacher@test.com';

const DEMO_STUDENTS = [
  { email: 'student1@test.com', firstName: 'Abena',   lastName: 'Mensah',   wpUserId: 99_910 },
  { email: 'student2@test.com', firstName: 'Kwame',   lastName: 'Asante',   wpUserId: 99_911 },
  { email: 'student3@test.com', firstName: 'Efua',    lastName: 'Boateng',  wpUserId: 99_912 },
];

const now     = new Date();
const past1   = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000); // 2 weeks ago
const past2   = new Date(now.getTime() -  7 * 24 * 60 * 60 * 1000); // 1 week ago
const future1 = new Date(now.getTime() +  3 * 24 * 60 * 60 * 1000); // 3 days from now

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱  CareerPath Africa — Cohort Seed\n');

  // ── Step 1: Resolve teacher ──────────────────────────────────────────────

  const teacher = await prisma.userProfile.findUnique({ where: { email: TEACHER_EMAIL } });
  if (!teacher) {
    console.error(`ERROR: teacher@test.com not found. Run seed-demo.ts first.\n`);
    process.exit(1);
  }
  console.log(`✅  Teacher: ${teacher.email}  (id: ${teacher.id})`);

  // ── Step 2: Create / resolve 3 students ──────────────────────────────────

  const students = await Promise.all(
    DEMO_STUDENTS.map(async s => {
      return (
        (await prisma.userProfile.findUnique({ where: { email: s.email } })) ??
        (await prisma.userProfile.create({
          data: {
            wpUserId:       s.wpUserId,
            email:          s.email,
            role:           UserRole.STUDENT,
            approvalStatus: ApprovalStatus.APPROVED,
            firstName:      s.firstName,
            lastName:       s.lastName,
            name:           `${s.firstName} ${s.lastName}`,
          },
        }))
      );
    }),
  );

  console.log(`✅  Students: ${students.map(s => s.email).join(', ')}`);

  // ── Step 3: Resolve package (from seed-demo) ─────────────────────────────

  const pkg = await prisma.package.findFirst({ where: { name: 'WASSCE Maths Prep Pack' } });
  if (!pkg) {
    console.warn(`WARN: "WASSCE Maths Prep Pack" not found — cohort will have no package link.`);
  }

  // ── Step 4: Create cohort ────────────────────────────────────────────────

  let cohort = await prisma.cohort.findFirst({
    where: { name: 'WASSCE Maths — Nov 2026 Sitting', teacherId: teacher.id },
  });

  if (!cohort) {
    cohort = await prisma.cohort.create({
      data: {
        name:         'WASSCE Maths — Nov 2026 Sitting',
        teacherId:    teacher.id,
        examDate:     new Date('2026-11-12T08:00:00.000Z'),
        sittingLabel: 'WASSCE November 2026',
        startDate:    new Date('2026-06-01T00:00:00.000Z'),
        ...(pkg ? { packages: { connect: { id: pkg.id } } } : {}),
      },
    });
  }

  console.log(`\n✅  Cohort: "${cohort.name}"  (id: ${cohort.id})`);

  // ── Step 5: Enroll students in cohort ────────────────────────────────────

  for (const student of students) {
    await prisma.cohortRoster.upsert({
      where:  { studentId_cohortId: { studentId: student.id, cohortId: cohort.id } },
      update: {},
      create: { studentId: student.id, cohortId: cohort.id },
    });
  }
  console.log(`✅  ${students.length} students enrolled in cohort`);

  // ── Step 6: Create live classes ──────────────────────────────────────────

  // Class 1 — COMPLETED (2 weeks ago)
  let class1 = await prisma.liveClass.findFirst({
    where: { cohortId: cohort.id, title: 'Session 1 — Number Theory & Algebra Basics' },
  });
  if (!class1) {
    class1 = await prisma.liveClass.create({
      data: {
        cohortId:     cohort.id,
        title:        'Session 1 — Number Theory & Algebra Basics',
        dailyRoomUrl: 'https://careerpathafrica.daily.co/demo-class-1',
        scheduledAt:  past1,
        status:       ClassStatus.COMPLETED,
        durationMins: 90,
        description:  'Covered number types, prime factorisation and algebraic simplification.',
      },
    });
  }

  // Class 2 — COMPLETED (1 week ago)
  let class2 = await prisma.liveClass.findFirst({
    where: { cohortId: cohort.id, title: 'Session 2 — Geometry & Trigonometry' },
  });
  if (!class2) {
    class2 = await prisma.liveClass.create({
      data: {
        cohortId:     cohort.id,
        title:        'Session 2 — Geometry & Trigonometry',
        dailyRoomUrl: 'https://careerpathafrica.daily.co/demo-class-2',
        scheduledAt:  past2,
        status:       ClassStatus.COMPLETED,
        durationMins: 90,
        description:  'Covered angles, triangles, circles and SOH-CAH-TOA.',
      },
    });
  }

  // Class 3 — SCHEDULED (upcoming, 3 days from now)
  let class3 = await prisma.liveClass.findFirst({
    where: { cohortId: cohort.id, title: 'Session 3 — Statistics & Probability' },
  });
  if (!class3) {
    class3 = await prisma.liveClass.create({
      data: {
        cohortId:     cohort.id,
        title:        'Session 3 — Statistics & Probability',
        dailyRoomUrl: 'https://careerpathafrica.daily.co/demo-class-3',
        scheduledAt:  future1,
        status:       ClassStatus.SCHEDULED,
        durationMins: 90,
        description:  'Will cover mean/median/mode, frequency tables and basic probability.',
      },
    });
  }

  console.log(`✅  3 live classes: 2 COMPLETED + 1 SCHEDULED`);

  // ── Step 7: Attendance for completed classes ─────────────────────────────

  // Class 1 — all 3 students attended
  for (const student of students) {
    const joinedAt = new Date(past1.getTime() + 2 * 60 * 1000);          // joined 2 min after start
    const leftAt   = new Date(past1.getTime() + 88 * 60 * 1000);         // left at 88 min
    await prisma.liveAttendance.upsert({
      where:  { liveClassId_studentId: { liveClassId: class1.id, studentId: student.id } },
      update: {},
      create: { liveClassId: class1.id, studentId: student.id, joinedAt, leftAt },
    });
  }

  // Class 2 — only 2 students attended (student3 missed it)
  const class2Attendees = students.slice(0, 2);
  for (const student of class2Attendees) {
    const joinedAt = new Date(past2.getTime() + 5 * 60 * 1000);
    const leftAt   = new Date(past2.getTime() + 91 * 60 * 1000);
    await prisma.liveAttendance.upsert({
      where:  { liveClassId_studentId: { liveClassId: class2.id, studentId: student.id } },
      update: {},
      create: { liveClassId: class2.id, studentId: student.id, joinedAt, leftAt },
    });
  }

  console.log(`✅  Attendance: Session 1 = 3/3 students · Session 2 = 2/3 students`);

  // ── Step 8: Assignments ───────────────────────────────────────────────────

  // Assignment 1 — CLOSED (due 5 days ago)
  let asgn1 = await prisma.assignment.findFirst({
    where: { cohortId: cohort.id, title: 'Assignment 1 — Algebraic Proofs & Problem Solving' },
  });
  if (!asgn1) {
    asgn1 = await prisma.assignment.create({
      data: {
        cohortId:    cohort.id,
        title:       'Assignment 1 — Algebraic Proofs & Problem Solving',
        description: 'Solve 5 algebraic proof questions and show all working. Submit as a PDF scan of handwritten work.',
        maxPoints:   100,
        dueDate:     new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000),
      },
    });
  }

  // Assignment 2 — OPEN (due 10 days from now)
  let asgn2 = await prisma.assignment.findFirst({
    where: { cohortId: cohort.id, title: 'Assignment 2 — Trigonometry & Circle Theorems' },
  });
  if (!asgn2) {
    asgn2 = await prisma.assignment.create({
      data: {
        cohortId:    cohort.id,
        title:       'Assignment 2 — Trigonometry & Circle Theorems',
        description: 'Answer all 6 questions on trigonometric ratios and circle theorems. Show diagrams where applicable.',
        maxPoints:   100,
        dueDate:     new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000),
      },
    });
  }

  console.log(`✅  2 assignments: 1 CLOSED + 1 OPEN`);

  // ── Step 9: Submissions ───────────────────────────────────────────────────

  // Assignment 1 submissions:
  //   student1 → GRADED (85/100)
  //   student2 → GRADED (72/100)
  //   student3 → PENDING (submitted, not yet graded)

  await prisma.submission.upsert({
    where:  { studentId_assignmentId: { studentId: students[0].id, assignmentId: asgn1.id } },
    update: {},
    create: {
      studentId:    students[0].id,
      assignmentId: asgn1.id,
      fileUrl:      'https://demo.r2.dev/submissions/student1-asgn1.pdf',
      grade:        85,
      feedback:     'Excellent working shown. Minor error in Q3 factorisation — watch sign changes.',
      status:       SubmissionStatus.GRADED,
    },
  });

  await prisma.submission.upsert({
    where:  { studentId_assignmentId: { studentId: students[1].id, assignmentId: asgn1.id } },
    update: {},
    create: {
      studentId:    students[1].id,
      assignmentId: asgn1.id,
      fileUrl:      'https://demo.r2.dev/submissions/student2-asgn1.pdf',
      grade:        72,
      feedback:     'Good attempt. Q4 and Q5 incomplete — revisit quadratic equations.',
      status:       SubmissionStatus.GRADED,
    },
  });

  await prisma.submission.upsert({
    where:  { studentId_assignmentId: { studentId: students[2].id, assignmentId: asgn1.id } },
    update: {},
    create: {
      studentId:    students[2].id,
      assignmentId: asgn1.id,
      fileUrl:      'https://demo.r2.dev/submissions/student3-asgn1.pdf',
      grade:        null,
      feedback:     null,
      status:       SubmissionStatus.PENDING_REVIEW,
    },
  });

  // Assignment 2 submissions:
  //   student1 → PENDING (just submitted)
  //   student2 → not submitted yet (no row)
  //   student3 → not submitted yet (no row)

  await prisma.submission.upsert({
    where:  { studentId_assignmentId: { studentId: students[0].id, assignmentId: asgn2.id } },
    update: {},
    create: {
      studentId:    students[0].id,
      assignmentId: asgn2.id,
      fileUrl:      'https://demo.r2.dev/submissions/student1-asgn2.pdf',
      status:       SubmissionStatus.PENDING_REVIEW,
    },
  });

  console.log(`✅  Submissions: Asgn1 = 2 graded + 1 pending · Asgn2 = 1 pending (2 missing)`);

  // ── Summary ──────────────────────────────────────────────────────────────

  console.log(`
╔═══════════════════════════════════════════════════════════════════╗
║          COHORT SEED COMPLETE                                      ║
╠═══════════════════════════════════════════════════════════════════╣
║                                                                   ║
║  COHORT                                                           ║
║    Name : WASSCE Maths — Nov 2026 Sitting                         ║
║    ID   : ${cohort.id.padEnd(43)}║
║    Exam : 12 Nov 2026                                             ║
║                                                                   ║
║  TEACHER                                                          ║
║    Login: teacher@test.com                                        ║
║    URL  : /teacher/cohorts/${cohort.id.slice(0, 16)}...               ║
║                                                                   ║
║  STUDENTS (login with password from seeded WP accounts)           ║
║    student1@test.com  — Abena Mensah                              ║
║    student2@test.com  — Kwame Asante                              ║
║    student3@test.com  — Efua Boateng                              ║
║                                                                   ║
║  LIVE CLASSES                                                     ║
║    Session 1  COMPLETED  (2 weeks ago) — full attendance          ║
║    Session 2  COMPLETED  (1 week ago)  — 2/3 attended             ║
║    Session 3  SCHEDULED  (3 days ahead)                           ║
║                                                                   ║
║  ASSIGNMENTS                                                      ║
║    Asgn 1  CLOSED  — 2 graded, 1 pending                          ║
║    Asgn 2  OPEN    — 1 submitted, 2 missing                       ║
║                                                                   ║
╚═══════════════════════════════════════════════════════════════════╝
`);
}

// ── Runner ─────────────────────────────────────────────────────────────────────

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
