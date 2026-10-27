/**
 * CareerPath Africa — Demo Seed
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a fully wired NATIVE course with:
 *   • 1 teacher  + 1 student  (demo accounts)
 *   • 1 course   (3 modules × 3 lessons = 9 lessons total)
 *   • 1 package  (contains the course, published, GHS 150)
 *   • 1 package purchase  (student buys the package — simulated payment)
 *   • 1 individual course purchase  (direct buy simulation)
 *   • Teacher wallet  + CREDIT transaction (70 % revenue share)
 *   • Course enrollment  (student enrolled)
 *   • Partial lesson progress  (5 / 9 lessons done → 55 %)
 *
 * Run:
 *   pnpm ts-node prisma/seed-demo.ts
 *
 * Safe to re-run — all writes use upsert / createIfNotExists patterns.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  PrismaClient,
  UserRole,
  ApprovalStatus,
  CourseStatus,
  CourseSource,
  LessonType,
  WalletTxType,
  WalletTxSource,
  QuestionType,
  QuestionDifficulty,
} from '@prisma/client';

const prisma = new PrismaClient();

// ─── Config ──────────────────────────────────────────────────────────────────

const TEACHER_EMAIL  = 'teacher@test.com';       // real teacher account
const STUDENT_EMAIL  = 'mogeugene@gmail.com';    // real student account
const COURSE_TITLE   = 'WASSCE Core Mathematics — Complete Revision';
const PACKAGE_NAME   = 'WASSCE Maths Prep Pack';
const PRICE_PESEWAS  = 15_000;   // GHS 150 stored as pesewas (integer)
const TEACHER_SHARE  = 10_500;   // 70 % of 15 000
const CURRENCY       = 'GHS';

// Fake WP user IDs — only used if the account doesn't exist yet
const DEMO_TEACHER_WP_ID = 99_901;
const DEMO_STUDENT_WP_ID = 99_902;

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n🌱  CareerPath Africa — Demo Seed\n');

  // ── Step 1: Users ────────────────────────────────────────────────────────

  // Use existing accounts if they exist, otherwise create demo accounts
  const teacher = await prisma.userProfile.findUnique({ where: { email: TEACHER_EMAIL } })
    ?? await prisma.userProfile.create({
      data: {
        wpUserId:       DEMO_TEACHER_WP_ID,
        email:          TEACHER_EMAIL,
        role:           UserRole.TEACHER,
        approvalStatus: ApprovalStatus.APPROVED,
        firstName:      'Demo',
        lastName:       'Teacher',
        name:           'Demo Teacher',
      },
    });

  const student = await prisma.userProfile.findUnique({ where: { email: STUDENT_EMAIL } })
    ?? await prisma.userProfile.create({
      data: {
        wpUserId:       DEMO_STUDENT_WP_ID,
        email:          STUDENT_EMAIL,
        role:           UserRole.STUDENT,
        approvalStatus: ApprovalStatus.APPROVED,
        firstName:      'Demo',
        lastName:       'Student',
        name:           'Demo Student',
      },
    });

  console.log(`✅  Users`);
  console.log(`     Teacher: ${teacher.email}  (id: ${teacher.id})`);
  console.log(`     Student: ${student.email}  (id: ${student.id})`);

  // ── Step 2: Course ───────────────────────────────────────────────────────

  // Resolve programme + subject (created by main seed — optional, skipped if not found)
  const programme = await prisma.programme.findFirst({ where: { shortName: 'WASSCE' } });
  const subject   = await prisma.subject.findFirst({ where: { name: 'Core Mathematics' } });

  // Upsert by title + teacherId (no unique constraint on title, so delete-then-create is safe for demo)
  let course = await prisma.platformCourse.findFirst({
    where: { title: COURSE_TITLE, teacherId: teacher.id },
  });

  if (!course) {
    course = await prisma.platformCourse.create({
      data: {
        title:             COURSE_TITLE,
        description:       'Comprehensive WASSCE Core Mathematics revision covering all examinable topics. Master number theory, algebra, geometry, trigonometry, statistics and probability through structured video lessons and graded quizzes.',
        shortDescription:  'Full WASSCE Core Maths revision — videos, quizzes & assignments.',
        teacherId:         teacher.id,
        source:            CourseSource.NATIVE,
        status:            CourseStatus.PUBLISHED,
        isSoldIndividually: true,
        priceAmount:       PRICE_PESEWAS,
        priceCurrency:     CURRENCY,
        programmeId:       programme?.id ?? null,
        subjectId:         subject?.id   ?? null,
      },
    });
  }

  console.log(`\n✅  Course`);
  console.log(`     "${course.title}"  (id: ${course.id})`);

  // ── Step 3: Modules & Lessons ────────────────────────────────────────────

  const moduleData = [
    {
      title: 'Module 1 — Number & Algebra',
      sortOrder: 1,
      lessons: [
        { title: 'Number Types & Operations',          type: LessonType.VIDEO, durationSecs: 840,  sortOrder: 1, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        { title: 'Algebraic Expressions & Equations',  type: LessonType.TEXT,  durationSecs: null, sortOrder: 2, content: '<h2>Algebraic Expressions</h2><p>An algebraic expression is a combination of variables, constants and arithmetic operations. For example: <strong>3x² + 2x − 5</strong>.</p><h3>Key rules</h3><ul><li>Combine like terms: 3x + 2x = 5x</li><li>Distributive law: a(b + c) = ab + ac</li></ul>' },
        { title: 'Number & Algebra Quiz',              type: LessonType.QUIZ,  durationSecs: null, sortOrder: 3, passMark: 60, timeLimitSecs: 900 },
      ],
    },
    {
      title: 'Module 2 — Geometry & Trigonometry',
      sortOrder: 2,
      lessons: [
        { title: 'Angles, Triangles & Circles',        type: LessonType.VIDEO, durationSecs: 1020, sortOrder: 1, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        { title: 'Trigonometric Ratios (SOH-CAH-TOA)', type: LessonType.TEXT,  durationSecs: null, sortOrder: 2, content: '<h2>Trigonometric Ratios</h2><p>For a right-angled triangle:</p><ul><li><strong>sin θ = Opposite / Hypotenuse</strong></li><li><strong>cos θ = Adjacent / Hypotenuse</strong></li><li><strong>tan θ = Opposite / Adjacent</strong></li></ul><p>Memory aid: <em>SOH–CAH–TOA</em></p>' },
        { title: 'Geometry & Trig Quiz',               type: LessonType.QUIZ,  durationSecs: null, sortOrder: 3, passMark: 60, timeLimitSecs: 900 },
      ],
    },
    {
      title: 'Module 3 — Statistics & Probability',
      sortOrder: 3,
      lessons: [
        { title: 'Measures of Central Tendency',       type: LessonType.VIDEO, durationSecs: 780,  sortOrder: 1, videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
        { title: 'Probability Fundamentals',           type: LessonType.TEXT,  durationSecs: null, sortOrder: 2, content: '<h2>Probability</h2><p>Probability measures the likelihood of an event occurring. It ranges from 0 (impossible) to 1 (certain).</p><p><strong>P(event) = Number of favourable outcomes / Total outcomes</strong></p><h3>Addition Rule</h3><p>P(A or B) = P(A) + P(B) − P(A and B)</p>' },
        { title: 'Statistics & Probability Quiz',      type: LessonType.QUIZ,  durationSecs: null, sortOrder: 3, passMark: 60, timeLimitSecs: 900 },
      ],
    },
  ];

  const allLessonIds: string[] = [];

  for (const mod of moduleData) {
    let module = await prisma.courseModule.findFirst({
      where: { courseId: course.id, sortOrder: mod.sortOrder },
    });
    if (!module) {
      module = await prisma.courseModule.create({
        data: { courseId: course.id, title: mod.title, sortOrder: mod.sortOrder },
      });
    }

    for (const l of mod.lessons) {
      let lesson = await prisma.lesson.findFirst({
        where: { moduleId: module.id, sortOrder: l.sortOrder },
      });
      if (!lesson) {
        lesson = await prisma.lesson.create({
          data: {
            moduleId:     module.id,
            title:        l.title,
            type:         l.type,
            sortOrder:    l.sortOrder,
            durationSecs: l.durationSecs ?? null,
            videoUrl:     (l as any).videoUrl ?? null,
            content:      (l as any).content  ?? null,
            passMark:     (l as any).passMark  ?? null,
            timeLimitSecs:(l as any).timeLimitSecs ?? null,
          },
        });
      }
      allLessonIds.push(lesson.id);
    }
  }

  console.log(`✅  3 modules · 9 lessons created`);

  // ── Step 4: Package ──────────────────────────────────────────────────────

  let pkg = await prisma.package.findFirst({ where: { name: PACKAGE_NAME } });
  if (!pkg) {
    pkg = await prisma.package.create({
      data: {
        name:        PACKAGE_NAME,
        description: 'Full access to the WASSCE Core Mathematics complete revision course, including video lessons, text notes and graded quizzes.',
        priceAmount: PRICE_PESEWAS,
        currency:    CURRENCY,
        courseIds:   [course.id],
        categoryTags:['WASSCE', 'Mathematics', 'Ghana', 'Senior Secondary'],
        validityDays: 365,
        isPublished:  true,
      },
    });
  } else {
    // Ensure course is in the package
    if (!pkg.courseIds.includes(course.id)) {
      pkg = await prisma.package.update({
        where: { id: pkg.id },
        data:  { courseIds: { push: course.id } },
      });
    }
  }

  console.log(`✅  Package "${pkg.name}"  (id: ${pkg.id})`);

  // ── Step 5: Package Purchase (simulated payment) ─────────────────────────

  const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
  const invoiceNo = `INV-DEMO-${Date.now()}`;

  let pkgPurchase = await prisma.packagePurchase.findFirst({
    where: { studentId: student.id, packageId: pkg.id },
  });

  if (!pkgPurchase) {
    pkgPurchase = await prisma.packagePurchase.create({
      data: {
        studentId:  student.id,
        packageId:  pkg.id,
        amountPaid: PRICE_PESEWAS,
        currency:   CURRENCY,
        gateway:    'DEMO',
        gatewayRef: `demo_pkg_${Date.now()}`,
        invoiceNo,
        expiresAt,
      },
    });
  }

  console.log(`✅  Package purchase  (invoice: ${pkgPurchase.invoiceNo ?? pkgPurchase.id})`);

  // ── Step 6: Individual course purchase (direct buy simulation) ───────────

  let coursePurchase = await prisma.coursePurchase.findUnique({
    where: { studentId_courseId: { studentId: student.id, courseId: course.id } },
  });

  if (!coursePurchase) {
    coursePurchase = await prisma.coursePurchase.create({
      data: {
        studentId:  student.id,
        courseId:   course.id,
        amountPaid: PRICE_PESEWAS,
        currency:   CURRENCY,
        gateway:    'DEMO',
        gatewayRef: `demo_course_${Date.now()}`,
        invoiceNo:  `INV-DEMO-COURSE-${Date.now()}`,
        expiresAt:  null,   // lifetime
      },
    });
  }

  console.log(`✅  Individual course purchase  (id: ${coursePurchase.id})`);

  // ── Step 7: Teacher wallet + credit transaction ──────────────────────────

  let wallet = await prisma.wallet.findUnique({ where: { userId: teacher.id } });
  if (!wallet) {
    wallet = await prisma.wallet.create({
      data: { userId: teacher.id, currency: CURRENCY, balance: 0 },
    });
  }

  // Credit the wallet (idempotent: skip if already credited for this purchase)
  const alreadyCredited = await prisma.walletTransaction.findFirst({
    where: { walletId: wallet.id, packagePurchaseId: pkgPurchase.id },
  });

  if (!alreadyCredited) {
    await prisma.walletTransaction.create({
      data: {
        walletId:         wallet.id,
        type:             WalletTxType.CREDIT,
        source:           WalletTxSource.COURSE_SALE,
        amount:           TEACHER_SHARE,
        currency:         CURRENCY,
        packagePurchaseId: pkgPurchase.id,
        description:      `70% revenue share — ${pkg.name}`,
      },
    });

    // Update wallet balance
    await prisma.wallet.update({
      where: { id: wallet.id },
      data:  { balance: { increment: TEACHER_SHARE } },
    });
  }

  console.log(`✅  Teacher wallet  balance: ${CURRENCY} ${(wallet.balance + TEACHER_SHARE) / 100}`);

  // ── Step 8: Course enrollment ────────────────────────────────────────────

  await prisma.courseEnrollment.upsert({
    where:  { studentId_courseId: { studentId: student.id, courseId: course.id } },
    update: {},
    create: { studentId: student.id, courseId: course.id },
  });

  console.log(`✅  Course enrollment`);

  // ── Step 9: Partial lesson progress (5 of 9 lessons done → ~55%) ─────────

  // Complete the first 5 lessons (VIDEO, TEXT, QUIZ of module 1 + VIDEO, TEXT of module 2)
  const completedLessonIds = allLessonIds.slice(0, 5);

  for (const lessonId of completedLessonIds) {
    await prisma.lessonProgress.upsert({
      where:  { studentId_lessonId: { studentId: student.id, lessonId } },
      update: { completed: true, watchedSecs: 840 },
      create: { studentId: student.id, lessonId, completed: true, watchedSecs: 840 },
    });
  }

  console.log(`✅  Lesson progress  5 / 9 lessons completed  (~55%)`);

  // ── Step 10: Quiz Questions ──────────────────────────────────────────────

  // Quiz lessons are index 2, 5, 8 (3rd lesson of each module)
  const [quizId1, quizId2, quizId3] = [allLessonIds[2], allLessonIds[5], allLessonIds[8]];

  const quizQuestions = [
    // ── Module 1 — Number & Algebra ──────────────────────────────────────
    {
      lessonId:     quizId1,
      questionText: 'Which of the following is a prime number?',
      type:         QuestionType.MCQ,
      difficulty:   QuestionDifficulty.EASY,
      sortOrder:    1,
      options:      [
        { id: 'a', text: '1'  },
        { id: 'b', text: '9'  },
        { id: 'c', text: '13' },
        { id: 'd', text: '21' },
      ],
      correctAnswer: 'c',
      explanation:   'A prime number has exactly two factors: 1 and itself. 13 is only divisible by 1 and 13.',
    },
    {
      lessonId:     quizId1,
      questionText: 'Simplify: 3x² + 2x − 5 + x² − 3x + 2',
      type:         QuestionType.MCQ,
      difficulty:   QuestionDifficulty.MEDIUM,
      sortOrder:    2,
      options:      [
        { id: 'a', text: '4x² − x − 3' },
        { id: 'b', text: '4x² + x − 3' },
        { id: 'c', text: '2x² − x − 3' },
        { id: 'd', text: '4x² − x + 3' },
      ],
      correctAnswer: 'a',
      explanation:   'Combine like terms: (3x² + x²) + (2x − 3x) + (−5 + 2) = 4x² − x − 3.',
    },
    {
      lessonId:     quizId1,
      questionText: 'What is the value of x if 2x + 7 = 15?',
      type:         QuestionType.MCQ,
      difficulty:   QuestionDifficulty.EASY,
      sortOrder:    3,
      options:      [
        { id: 'a', text: '3' },
        { id: 'b', text: '4' },
        { id: 'c', text: '5' },
        { id: 'd', text: '11' },
      ],
      correctAnswer: 'b',
      explanation:   '2x = 15 − 7 = 8, therefore x = 4.',
    },
    {
      lessonId:     quizId1,
      questionText: 'A student scored 72 out of 120 in a test. Express this score as a percentage. Show your working.',
      type:         QuestionType.WRITTEN,
      difficulty:   QuestionDifficulty.MEDIUM,
      sortOrder:    4,
      options:      null,
      correctAnswer: '60%',
      explanation:   '(72 ÷ 120) × 100 = 60%',
    },

    // ── Module 2 — Geometry & Trigonometry ───────────────────────────────
    {
      lessonId:     quizId2,
      questionText: 'The interior angles of a triangle add up to:',
      type:         QuestionType.MCQ,
      difficulty:   QuestionDifficulty.EASY,
      sortOrder:    1,
      options:      [
        { id: 'a', text: '90°'  },
        { id: 'b', text: '180°' },
        { id: 'c', text: '270°' },
        { id: 'd', text: '360°' },
      ],
      correctAnswer: 'b',
      explanation:   'The interior angles of any triangle always sum to exactly 180°.',
    },
    {
      lessonId:     quizId2,
      questionText: 'In a right-angled triangle, the side opposite the 90° angle is called the:',
      type:         QuestionType.MCQ,
      difficulty:   QuestionDifficulty.EASY,
      sortOrder:    2,
      options:      [
        { id: 'a', text: 'Adjacent'   },
        { id: 'b', text: 'Opposite'   },
        { id: 'c', text: 'Hypotenuse' },
        { id: 'd', text: 'Base'       },
      ],
      correctAnswer: 'c',
      explanation:   'The hypotenuse is always the longest side and is always opposite the right angle.',
    },
    {
      lessonId:     quizId2,
      questionText: 'If sin θ = 0.5, what is the value of θ?',
      type:         QuestionType.MCQ,
      difficulty:   QuestionDifficulty.MEDIUM,
      sortOrder:    3,
      options:      [
        { id: 'a', text: '30°' },
        { id: 'b', text: '45°' },
        { id: 'c', text: '60°' },
        { id: 'd', text: '90°' },
      ],
      correctAnswer: 'a',
      explanation:   'sin 30° = 0.5. This is a standard trigonometric value to memorise alongside sin 45° = √2/2 and sin 60° = √3/2.',
    },
    {
      lessonId:     quizId2,
      questionText: 'A ladder 5 m long leans against a wall. The foot of the ladder is 3 m from the base of the wall. How high up the wall does the ladder reach? Use Pythagoras\' theorem and show your working.',
      type:         QuestionType.WRITTEN,
      difficulty:   QuestionDifficulty.MEDIUM,
      sortOrder:    4,
      options:      null,
      correctAnswer: '4 m',
      explanation:   'h² + 3² = 5²  →  h² = 25 − 9 = 16  →  h = 4 m.',
    },

    // ── Module 3 — Statistics & Probability ──────────────────────────────
    {
      lessonId:     quizId3,
      questionText: 'What is the mean of the following values: 4, 7, 9, 10, 5?',
      type:         QuestionType.MCQ,
      difficulty:   QuestionDifficulty.EASY,
      sortOrder:    1,
      options:      [
        { id: 'a', text: '6' },
        { id: 'b', text: '7' },
        { id: 'c', text: '8' },
        { id: 'd', text: '9' },
      ],
      correctAnswer: 'b',
      explanation:   'Mean = (4 + 7 + 9 + 10 + 5) ÷ 5 = 35 ÷ 5 = 7.',
    },
    {
      lessonId:     quizId3,
      questionText: 'A bag contains 3 red balls and 7 blue balls. What is the probability of picking a red ball at random?',
      type:         QuestionType.MCQ,
      difficulty:   QuestionDifficulty.MEDIUM,
      sortOrder:    2,
      options:      [
        { id: 'a', text: '3/10' },
        { id: 'b', text: '7/10' },
        { id: 'c', text: '3/7'  },
        { id: 'd', text: '1/3'  },
      ],
      correctAnswer: 'a',
      explanation:   'P(red) = 3 ÷ (3 + 7) = 3/10.',
    },
    {
      lessonId:     quizId3,
      questionText: 'Which measure of central tendency is most affected by extreme values (outliers)?',
      type:         QuestionType.MCQ,
      difficulty:   QuestionDifficulty.MEDIUM,
      sortOrder:    3,
      options:      [
        { id: 'a', text: 'Mode'   },
        { id: 'b', text: 'Median' },
        { id: 'c', text: 'Mean'   },
        { id: 'd', text: 'Range'  },
      ],
      correctAnswer: 'c',
      explanation:   'The mean uses every value in its calculation, so a single very large or very small value can pull it significantly away from the centre of the data.',
    },
    {
      lessonId:     quizId3,
      questionText: 'The scores of 5 students in a test are: 65, 70, 80, 85, 75. Calculate the median score and explain your method.',
      type:         QuestionType.WRITTEN,
      difficulty:   QuestionDifficulty.MEDIUM,
      sortOrder:    4,
      options:      null,
      correctAnswer: '75',
      explanation:   'Arrange in order: 65, 70, 75, 80, 85. The middle value (3rd of 5) is 75.',
    },
  ];

  let questionsCreated = 0;
  for (const q of quizQuestions) {
    const exists = await prisma.questionBank.findFirst({
      where: { courseId: course.id, lessonId: q.lessonId, questionText: q.questionText },
    });
    if (!exists) {
      await prisma.questionBank.create({
        data: {
          courseId:     course.id,
          lessonId:     q.lessonId,
          questionText: q.questionText,
          type:         q.type,
          difficulty:   q.difficulty,
          sortOrder:    q.sortOrder,
          options:      q.options ?? undefined,
          correctAnswer: q.correctAnswer,
          explanation:  q.explanation ?? null,
          points:       q.type === QuestionType.WRITTEN ? 5 : 2,
        },
      });
      questionsCreated++;
    }
  }

  console.log(`✅  Quiz questions  ${questionsCreated} created  (3 modules × 4 questions = 12 total)`);

  // ── Summary ──────────────────────────────────────────────────────────────

  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║           DEMO SEED COMPLETE — Test Credentials                  ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  STUDENT (to test the course player & purchase flow)             ║
║    Email : ${STUDENT_EMAIL.padEnd(42)}║
║    Note  : Use this account's WP password to log in             ║
║                                                                  ║
║  TEACHER (to test wallet & course management)                    ║
║    Email : ${TEACHER_EMAIL.padEnd(42)}║
║    Note  : Use this account's WP password to log in             ║
║                                                                  ║
║  COURSE                                                          ║
║    ID    : ${course.id.padEnd(42)}║
║    URL   : /student/learn/${course.id.slice(0, 16)}...                ║
║                                                                  ║
║  PACKAGE                                                         ║
║    ID    : ${pkg.id.padEnd(42)}║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`);
}

// ── Runner ────────────────────────────────────────────────────────────────────

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
