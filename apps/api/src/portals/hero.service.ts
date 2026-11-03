import { Injectable } from '@nestjs/common';
import { ExamKind, ExamStatus, PayoutStatus, QuestionStatus, ReviewStatus, SubmissionStatus, TestMode, TestStatus, UserProfile, UserRole, WalletTxType } from '@prisma/client';
import { minorToMajor } from '@cpa/shared';
import { PrismaService } from '../prisma/prisma.service';

/** The top of every dashboard: one line about today, and up to three real next things. */
export interface HeroCard { icon: string; title: string; body: string; when?: string; pill?: string; href?: string }
export interface Hero {
  greeting: string; headline: string; sub: string;
  cta: { label: string; href: string }; cta2?: { label: string; href: string };
  cards: HeroCard[];
}

const DAY = 86_400_000;
const plural = (n: number, w: string, ws = `${w}s`) => `${n} ${n === 1 ? w : ws}`;
const money = (minor: number, cur: string) => `${cur} ${minorToMajor(minor, cur).toLocaleString('en-GB', { maximumFractionDigits: 0 })}`;
const ago = (d: Date) => {
  const days = Math.floor((Date.now() - d.getTime()) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
};
const until = (d: Date) => {
  const days = Math.ceil((d.getTime() - Date.now()) / DAY);
  return days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`;
};
const words = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const count = (n: number) => words[n] ?? String(n);
const monthStart = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); };

@Injectable()
export class HeroService {
  constructor(private prisma: PrismaService) {}

  private greeting(u: UserProfile) {
    const h = new Date().getHours();
    const part = h < 12 ? 'Morning' : h < 17 ? 'Afternoon' : 'Evening';
    return u.firstName ? `${part}, ${u.firstName}.` : `Good ${part.toLowerCase()}.`;
  }

  /** Money credited to this person's wallet since the 1st of the month */
  private async earnedThisMonth(userId: string) {
    const w = await this.prisma.wallet.findUnique({ where: { userId }, select: { id: true, currency: true } });
    if (!w) return null;
    // Nothing earned yet: no card, rather than a zero
    const { _sum } = await this.prisma.walletTransaction.aggregate({ where: { walletId: w.id, type: WalletTxType.CREDIT, createdAt: { gte: monthStart() } }, _sum: { amount: true } });
    return _sum.amount ? { amount: _sum.amount, currency: w.currency } : null;
  }

  async forUser(u: UserProfile): Promise<Hero> {
    switch (u.role as UserRole) {
      case UserRole.TEACHER: return this.teacher(u);
      case UserRole.ADMIN: return this.admin(u);
      case UserRole.COUNTRY_REP: return this.rep(u);
      case UserRole.SUBJECT_REVIEWER: return this.reviewer(u);
      case 'ORG_ADMIN' as UserRole: return this.school(u);
      default: return this.student(u);
    }
  }

  // ── Student ──────────────────────────────────────────────
  private async student(u: UserProfile): Promise<Hero> {
    const enrolments = await this.prisma.courseEnrollment.findMany({ where: { studentId: u.id, completedAt: null }, select: { courseId: true, enrolledAt: true } });
    const courseIds = enrolments.map(e => e.courseId);
    const [lessons, done, recent] = await Promise.all([
      this.prisma.lesson.findMany({ where: { module: { courseId: { in: courseIds }, course: { status: 'PUBLISHED' } } }, orderBy: [{ module: { sortOrder: 'asc' } }, { sortOrder: 'asc' }], select: { id: true, title: true, durationSecs: true, moduleId: true, module: { select: { title: true, courseId: true, course: { select: { title: true } } } } } }),
      this.prisma.lessonProgress.findMany({ where: { studentId: u.id, completed: true }, select: { lessonId: true } }),
      this.prisma.lessonProgress.findFirst({ where: { studentId: u.id, lesson: { module: { courseId: { in: courseIds } } } }, orderBy: { updatedAt: 'desc' }, select: { lesson: { select: { moduleId: true, module: { select: { courseId: true } } } } } }),
    ]);
    const finished = new Set(done.map(d => d.lessonId));
    // The course and module they were last in, else the first course they joined
    const courseId = recent?.lesson.module.courseId ?? enrolments.sort((a, b) => a.enrolledAt.getTime() - b.enrolledAt.getTime())[0]?.courseId;
    const inCourse = lessons.filter(l => l.module.courseId === courseId);
    const next = inCourse.find(l => !finished.has(l.id));
    const moduleLeft = next ? inCourse.filter(l => l.moduleId === next.moduleId && !finished.has(l.id)).length : 0;

    // Test Centre: a mock or CAT they can take and haven't, and the study streak
    const exams = await this.prisma.mockExam.findMany({ where: { status: ExamStatus.PUBLISHED, kind: { in: [ExamKind.MOCK, ExamKind.CAT] }, courseIds: { hasSome: courseIds } }, select: { id: true, title: true, kind: true, passMark: true } });
    const taken = new Set((await this.prisma.testSession.findMany({ where: { studentId: u.id, mockExamId: { in: exams.map(e => e.id) } }, select: { mockExamId: true } })).map(t => t.mockExamId));
    const exam = exams.find(e => !taken.has(e.id));
    const live = await this.prisma.liveClass.findFirst({ where: { scheduledAt: { gte: new Date() }, status: 'SCHEDULED', cohort: { students: { some: { studentId: u.id } } } }, orderBy: { scheduledAt: 'asc' }, select: { title: true, scheduledAt: true } });
    const activity = await this.prisma.lessonProgress.findMany({ where: { studentId: u.id, updatedAt: { gte: new Date(Date.now() - 60 * DAY) } }, select: { updatedAt: true } });
    const tests = await this.prisma.testSession.findMany({ where: { studentId: u.id, startedAt: { gte: new Date(Date.now() - 60 * DAY) } }, select: { startedAt: true } });
    const days = new Set([...activity.map(a => a.updatedAt), ...tests.map(t => t.startedAt)].map(d => d.toISOString().slice(0, 10)));
    let streak = 0;
    const c = new Date();
    if (!days.has(c.toISOString().slice(0, 10))) c.setDate(c.getDate() - 1);
    while (days.has(c.toISOString().slice(0, 10))) { streak++; c.setDate(c.getDate() - 1); }

    const cards: HeroCard[] = [];
    if (next) cards.push({ icon: '▶', title: 'Next lesson', body: `${next.title}${next.durationSecs ? ` · ${Math.max(1, Math.round(next.durationSecs / 60))} min` : ''}`, when: next.module.course.title, href: `/student/learn/${next.module.courseId}/lesson/${next.id}` });
    if (exam) cards.push({ icon: '◎', title: exam.kind === ExamKind.CAT ? 'Readiness test' : 'Mock exam', body: exam.title, when: 'ready to take', pill: exam.kind === ExamKind.CAT ? 'Adaptive' : `Pass mark ${exam.passMark}%`, href: exam.kind === ExamKind.CAT ? '/student/tests/cat' : '/student/tests/mocks' });
    else if (live) cards.push({ icon: '●', title: 'Live class', body: live.title, when: until(live.scheduledAt), href: '/student/live' });
    if (streak > 0) cards.push({ icon: '🔥', title: 'Your streak', body: `${plural(streak, 'day')} of study in a row`, when: 'keep it going' });

    let headline = 'Ready when you are.';
    let sub = 'Pick a course from the catalogue, or test yourself in the Test Centre.';
    if (next && moduleLeft <= 10) {
      headline = moduleLeft === 1 ? 'One lesson to go.' : `${count(moduleLeft)} lessons to go.`;
      sub = `You’re ${plural(moduleLeft, 'lesson')} from finishing ${next.module.title}.${exam ? ` ${exam.title} is ready when you are.` : ''}`;
    } else if (next) {
      headline = 'Pick up where you left off.';
      sub = `Next up: ${next.title}, in ${next.module.course.title}.`;
    } else if (exam) {
      headline = 'A mock exam is waiting.';
      sub = `${exam.title} is ready. It’s timed like the real thing.`;
    }
    return {
      greeting: this.greeting(u), headline, sub,
      cta: next ? { label: 'Resume lesson', href: `/student/learn/${next.module.courseId}/lesson/${next.id}` } : { label: 'Browse courses', href: '/student/catalogue' },
      cta2: { label: 'Test Centre', href: '/student/tests' }, cards: cards.slice(0, 3),
    };
  }

  // ── Teacher ──────────────────────────────────────────────
  private async teacher(u: UserProfile): Promise<Hero> {
    const courseIds = (await this.prisma.platformCourse.findMany({ where: { teacherId: u.id }, select: { id: true } })).map(c => c.id);
    const [mockToMark, quizToMark, subsToMark, sentBack, earned] = await Promise.all([
      this.prisma.testAnswer.count({ where: { score: null, answer: { not: undefined }, session: { status: TestStatus.SUBMITTED, mockExam: { createdById: u.id, kind: ExamKind.MOCK } } } }),
      this.prisma.quizAttempt.count({ where: { courseId: { in: courseIds }, isFullyGraded: false } }),
      this.prisma.submission.count({ where: { status: SubmissionStatus.PENDING_REVIEW, assignment: { cohort: { teacherId: u.id } } } }),
      this.prisma.questionBank.count({ where: { createdById: u.id, status: QuestionStatus.DRAFT, reviewNote: { not: null } } }),
      this.earnedThisMonth(u.id),
    ]);
    const latest = await this.prisma.testSession.findFirst({ where: { status: TestStatus.SUBMITTED, answers: { some: { score: null } }, mockExam: { createdById: u.id, kind: ExamKind.MOCK } }, orderBy: { submittedAt: 'desc' }, select: { submittedAt: true, mockExam: { select: { title: true } }, student: { select: { firstName: true, lastName: true } } } });
    const toMark = mockToMark + quizToMark + subsToMark;
    const cards: HeroCard[] = [];
    if (latest) cards.push({ icon: '✎', title: 'Mock exam', body: `${[latest.student.firstName, latest.student.lastName?.[0] ? `${latest.student.lastName[0]}.` : ''].filter(Boolean).join(' ') || 'A student'} finished ${latest.mockExam?.title ?? 'your mock'}`, when: latest.submittedAt ? ago(latest.submittedAt) : '', pill: `${plural(mockToMark, 'answer')} to mark`, href: '/teacher/mocks' });
    if (subsToMark + quizToMark) cards.push({ icon: '☰', title: 'Grading', body: `${plural(subsToMark, 'assignment')} and ${plural(quizToMark, 'quiz', 'quizzes')} waiting`, when: 'now', href: '/teacher/grading' });
    if (sentBack) cards.push({ icon: '?', title: 'Question bank', body: `${plural(sentBack, 'question')} came back from review`, when: 'to fix', href: '/teacher/questions' });
    if (earned) cards.push({ icon: '₵', title: 'Earnings', body: `${money(earned.amount, earned.currency)} this month`, when: 'this month', href: '/teacher/wallet' });
    const students = await this.prisma.courseEnrollment.count({ where: { courseId: { in: courseIds } } });
    return {
      greeting: this.greeting(u),
      headline: toMark ? (toMark === 1 ? 'One thing to mark.' : toMark <= 10 ? `${count(toMark)} things to mark.` : `${toMark} things to mark.`) : 'Nothing waiting. Enjoy the quiet.',
      sub: toMark ? (mockToMark ? 'Students are waiting for their mock exam results. Marking them first gets results out today.' : 'Students hear back faster when work is marked within a few days.') : `${plural(students, 'student')} on your courses. A good day to add questions or plan a mock exam.`,
      cta: toMark ? { label: 'Start marking', href: mockToMark ? '/teacher/mocks' : '/teacher/grading' } : { label: 'Question bank', href: '/teacher/questions' },
      cta2: toMark ? { label: 'Question bank', href: '/teacher/questions' } : { label: 'My courses', href: '/teacher/courses' },
      cards: cards.slice(0, 3),
    };
  }

  // ── Admin ────────────────────────────────────────────────
  private async admin(u: UserProfile): Promise<Hero> {
    const weekAgo = new Date(Date.now() - 5 * DAY);
    const [inReview, oldReview, unlocked, questions, tickets, payouts] = await Promise.all([
      this.prisma.courseAssignment.count({ where: { reviewStatus: ReviewStatus.PENDING, submittedAt: { not: null } } }),
      this.prisma.courseAssignment.count({ where: { reviewStatus: ReviewStatus.PENDING, submittedAt: { lt: weekAgo } } }),
      // Paid at the gateway but the purchase never opened: the student is waiting
      this.prisma.paymentAttempt.count({ where: { status: 'PAID', packagePurchaseId: null, coursePurchaseId: null } }),
      this.prisma.questionBank.count({ where: { status: QuestionStatus.IN_REVIEW } }),
      this.prisma.supportTicket.count({ where: { status: 'OPEN' } }),
      this.prisma.payoutStatement.aggregate({ where: { status: PayoutStatus.PENDING }, _count: true, _sum: { amount: true } }),
    ]);
    const items = [inReview, unlocked, questions, tickets, payouts._count].filter(n => n > 0).length;
    const cards: HeroCard[] = [];
    if (unlocked) cards.push({ icon: '!', title: 'Payments', body: `${plural(unlocked, 'payment')} paid but not unlocked`, when: 'check now', pill: 'Check', href: '/admin/payments' });
    if (inReview) cards.push({ icon: '▣', title: 'Courses', body: `${plural(inReview, 'course')} waiting for a review decision${oldReview ? `, ${oldReview} for over 5 days` : ''}`, when: 'waiting', href: '/admin/courses/manage' });
    if (payouts._count) cards.push({ icon: '₵', title: 'Payouts', body: `${plural(payouts._count, 'statement')} not paid yet`, when: 'pending', href: '/admin/payouts' });
    if (questions) cards.push({ icon: '?', title: 'Questions', body: `${plural(questions, 'question')} waiting for approval`, when: 'in review', href: '/admin/questions' });
    if (tickets) cards.push({ icon: '✉', title: 'Support', body: `${plural(tickets, 'open ticket')}`, when: 'open', href: '/admin/support' });
    return {
      greeting: this.greeting(u),
      headline: items ? (items === 1 ? 'One thing needs you.' : `${count(items)} things need you.`) : 'All clear today.',
      sub: items ? [unlocked && 'Students paid and are waiting for access.', inReview && 'Teachers are waiting on course decisions.'].filter(Boolean).join(' ') || 'Here’s what’s waiting.' : 'Nothing is waiting on you. Reports are a good place to look today.',
      cta: cards[0] ? { label: 'See what’s waiting', href: cards[0].href! } : { label: 'Reports', href: '/admin/reports' },
      cta2: { label: 'Reports', href: '/admin/reports' }, cards: cards.slice(0, 3),
    };
  }

  // ── Country rep ──────────────────────────────────────────
  private async rep(u: UserProfile): Promise<Hero> {
    const country = u.countryId ? await this.prisma.country.findUnique({ where: { id: u.countryId }, select: { id: true, name: true } }) : null;
    if (!country) return { greeting: this.greeting(u), headline: 'Your country isn’t set yet.', sub: 'Ask CareerPath Africa to link your account to your country.', cta: { label: 'Help', href: '/country-rep/dashboard' }, cards: [] };
    const start = monthStart();
    const lastStart = new Date(start.getFullYear(), start.getMonth() - 1, 1);
    const [thisMonth, lastMonth, earned, schools] = await Promise.all([
      this.prisma.userProfile.count({ where: { role: UserRole.STUDENT, countryId: country.id, createdAt: { gte: start } } }),
      this.prisma.userProfile.count({ where: { role: UserRole.STUDENT, countryId: country.id, createdAt: { gte: lastStart, lt: start } } }),
      this.earnedThisMonth(u.id),
      this.prisma.organisation.findMany({ where: { countryId: country.id }, select: { name: true, enrollments: { select: { seatsPurchased: true, seats: { select: { studentId: true, claimedAt: true } } } } } }),
    ]);
    const viaSchools = schools.flatMap(s => s.enrollments.flatMap(e => e.seats)).filter(x => x.claimedAt && x.claimedAt >= start).length;
    const busiest = schools.map(s => ({ name: s.name, used: s.enrollments.flatMap(e => e.seats).filter(x => x.studentId).length, total: s.enrollments.reduce((n, e) => n + e.seatsPurchased, 0) })).sort((a, b) => b.used - a.used)[0];
    const cards: HeroCard[] = [];
    if (busiest) cards.push({ icon: '🏫', title: busiest.name, body: `${busiest.used} of ${busiest.total} places used`, when: 'school', href: '/country-rep/students' });
    if (earned) cards.push({ icon: '₵', title: 'Your commission', body: `${money(earned.amount, earned.currency)} so far this month`, when: 'this month', href: '/country-rep/wallet' });
    cards.push({ icon: '↗', title: 'Last month', body: `${plural(lastMonth, 'new student')} in ${country.name}`, when: 'for comparison' });
    return {
      greeting: `${country.name} this month:`, headline: thisMonth ? `${plural(thisMonth, 'new student')}.` : 'No new students yet.',
      sub: lastMonth ? `${thisMonth >= lastMonth ? 'Up' : 'Down'} from ${lastMonth} last month.${viaSchools ? ` ${count(viaSchools)} came through schools.` : ''}` : 'The first full month of numbers will show here.',
      cta: { label: 'See my students', href: '/country-rep/students' }, cta2: { label: 'My earnings', href: '/country-rep/wallet' }, cards: cards.slice(0, 3),
    };
  }

  // ── Subject reviewer ─────────────────────────────────────
  private async reviewer(u: UserProfile): Promise<Hero> {
    const assigned = await this.prisma.courseAssignment.findMany({ where: { reviewerId: u.id }, select: { courseId: true, reviewStatus: true, submittedAt: true } });
    const waiting = assigned.filter(a => a.reviewStatus === ReviewStatus.PENDING && a.submittedAt).sort((a, b) => a.submittedAt!.getTime() - b.submittedAt!.getTime());
    const [oldest, questions, earned] = await Promise.all([
      waiting[0] ? this.prisma.platformCourse.findUnique({ where: { id: waiting[0].courseId }, select: { title: true, teacher: { select: { firstName: true, lastName: true } }, modules: { select: { _count: { select: { lessons: true } } } } } }) : null,
      this.prisma.questionBank.count({ where: { status: QuestionStatus.IN_REVIEW, courseId: { in: assigned.map(a => a.courseId) } } }),
      this.earnedThisMonth(u.id),
    ]);
    const cards: HeroCard[] = [];
    if (oldest && waiting[0].submittedAt) cards.push({ icon: '▣', title: oldest.title, body: `Sent by ${[oldest.teacher?.firstName, oldest.teacher?.lastName?.[0] && `${oldest.teacher.lastName[0]}.`].filter(Boolean).join(' ') || 'a teacher'} · ${plural(oldest.modules.reduce((n, m) => n + m._count.lessons, 0), 'lesson')}`, when: ago(waiting[0].submittedAt), pill: 'Oldest', href: '/reviewer/dashboard' });
    if (questions) cards.push({ icon: '?', title: 'Questions', body: `${plural(questions, 'question')} waiting for approval`, when: 'in review', href: '/reviewer/questions' });
    if (earned) cards.push({ icon: '₵', title: 'Your share', body: `${money(earned.amount, earned.currency)} from reviews this month`, when: 'this month', href: '/reviewer/wallet' });
    const days = waiting[0]?.submittedAt ? Math.floor((Date.now() - waiting[0].submittedAt.getTime()) / DAY) : 0;
    return {
      greeting: this.greeting(u),
      headline: waiting.length ? (waiting.length === 1 ? 'One course is waiting for you.' : `${count(waiting.length)} courses are waiting for you.`) : questions ? `${plural(questions, 'question')} to check.` : 'Your queue is clear.',
      sub: waiting.length ? `The oldest has waited ${plural(days, 'day')}. Teachers hear back faster when reviews land within a week.` : 'New courses and questions for your subjects will appear here.',
      cta: { label: 'Open the queue', href: '/reviewer/dashboard' }, cta2: { label: 'Question reviews', href: '/reviewer/questions' }, cards: cards.slice(0, 3),
    };
  }

  // ── School admin ─────────────────────────────────────────
  private async school(u: UserProfile): Promise<Hero> {
    const org = u.organisationId ? await this.prisma.organisation.findUnique({ where: { id: u.organisationId }, select: { name: true, enrollments: { select: { seatsPurchased: true, seats: { select: { studentId: true, inviteEmail: true, invitedAt: true } } } } } }) : null;
    if (!org) return { greeting: this.greeting(u), headline: 'Your school isn’t linked yet.', sub: 'Ask CareerPath Africa to link your account to your school.', cta: { label: 'Settings', href: '/school/settings' }, cards: [] };
    const seats = org.enrollments.flatMap(e => e.seats);
    const total = org.enrollments.reduce((n, e) => n + e.seatsPurchased, 0);
    // Same count as the school dashboard: a place is used once it’s given to someone, joined or invited
    const used = seats.length;
    const pending = seats.filter(s => !s.studentId && s.inviteEmail);
    const studentIds = seats.map(s => s.studentId).filter((x): x is string => !!x);
    const weekAgo = new Date(Date.now() - 7 * DAY);
    const [watched, mock] = await Promise.all([
      this.prisma.lessonProgress.aggregate({ where: { studentId: { in: studentIds }, updatedAt: { gte: weekAgo } }, _sum: { watchedSecs: true } }),
      this.prisma.testSession.findMany({ where: { studentId: { in: studentIds }, status: TestStatus.SUBMITTED, mode: TestMode.EXAM, mockExamId: { not: null }, submittedAt: { gte: new Date(Date.now() - 30 * DAY) } }, select: { score: true, maxScore: true, mockExam: { select: { title: true } } } }),
    ]);
    const hours = Math.round((watched._sum.watchedSecs ?? 0) / 3600);
    const cards: HeroCard[] = [];
    if (pending.length) { const oldest = pending.reduce((a, b) => (a.invitedAt < b.invitedAt ? a : b)); cards.push({ icon: '✉', title: 'Invites', body: `${plural(pending.length, 'student')} invited, not joined yet`, when: ago(oldest.invitedAt), pill: 'Remind', href: '/school/students' }); }
    if (studentIds.length) cards.push({ icon: '▤', title: 'This week', body: `Your students studied ${plural(hours, 'hour')}`, when: 'last 7 days', href: '/school/students' });
    if (mock.length) { const avg = Math.round(mock.reduce((n, m) => n + (m.maxScore ? (m.score ?? 0) / m.maxScore : 0), 0) / mock.length * 100); cards.push({ icon: '◎', title: 'Mock exams', body: `Average ${avg}% across ${plural(mock.length, 'attempt')}`, when: 'last 30 days', href: '/school/students' }); }
    return {
      greeting: `${org.name}.`, headline: `${used} of ${total} places used.`,
      sub: pending.length ? `${plural(pending.length, 'invited student')} ${pending.length === 1 ? 'hasn’t' : 'haven’t'} joined yet. A reminder usually brings most of them in.` : used < total ? `${plural(total - used, 'place')} still free. Invite students or share your join link.` : 'Every place is taken. Ask CareerPath Africa for more.',
      cta: pending.length ? { label: 'Remind them', href: '/school/students' } : { label: 'Invite students', href: '/school/invite' },
      cta2: { label: pending.length ? 'Invite students' : 'See students', href: pending.length ? '/school/invite' : '/school/students' }, cards: cards.slice(0, 3),
    };
  }
}
