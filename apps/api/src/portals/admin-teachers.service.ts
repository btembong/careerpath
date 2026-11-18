import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';

const DAY = 86_400_000;
type Person = { name: string | null; firstName: string | null; lastName: string | null; email: string };
const nameOf = (p: Person) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
const firstOf = (p: Person) => p.firstName || (p.name ?? '').split(/\s+/)[0] || null;
type Money = { currency: string; amount: number }[];
// The system account (website user 0) only holds courses waiting for a teacher
const REAL = { wpUserId: { not: 0 } };

export type Nudge = 'agreement' | 'welcome' | 'course' | 'photo';
const NUDGES: Record<Nudge, { subject: string; badge: string; title: string; text: string; cta: string; href: string; done: string }> = {
  agreement: {
    subject: 'Please sign your teacher agreement · CareerPath Africa', badge: 'Teacher agreement', title: 'One step left: your agreement',
    text: 'You’re approved to teach on CareerPath Africa. Before you can publish courses or take classes, please read and sign the teacher agreement. It takes two minutes.',
    cta: 'Read and sign', href: '/teacher', done: 'Reminded {n} to sign the teacher agreement',
  },
  welcome: {
    subject: 'Your CareerPath teacher portal is ready', badge: 'Welcome', title: 'Your teacher portal is ready',
    text: 'Your CareerPath Africa teacher account is waiting for you. Sign in with the same email and password you use on careerpathafrica.com. If you don’t remember it, choose “Forgot password” on the sign-in page.\n\nFrom your portal you build courses, run live classes, mentor students and see what you earn.',
    cta: 'Sign in', href: '/login', done: 'Resent the welcome email to {n}',
  },
  course: {
    subject: 'Start your first course on CareerPath Africa', badge: 'Your courses', title: 'Students are waiting for your first course',
    text: 'You’re set up to teach, but you don’t have a course yet. Start with one topic you know well: the course builder walks you through modules, lessons and quizzes, and you can save as you go.\n\nYou earn a share of every sale of your course.',
    cta: 'Build a course', href: '/teacher/courses', done: 'Asked {n} to build a first course',
  },
  photo: {
    subject: 'Add your photo so students know who’s teaching', badge: 'Your profile', title: 'Add a photo to your profile',
    text: 'Your photo is the biggest thing on your card when students choose a teacher, and right now they see your initials. A clear, friendly photo of your face works best.\n\nA short intro video helps too: students can book you for mentoring once you have one.',
    cta: 'Add my photo', href: '/teacher/profile', done: 'Asked {n} to add a photo',
  },
};

@Injectable()
export class AdminTeachersService {
  constructor(private prisma: PrismaService, private mail: MailService, private audit: AuditService) {}

  /** Approved and suspended teachers with what they teach, how many students, rating, recent earnings and what's missing */
  async overview() {
    const now = Date.now();
    const teachers = await this.prisma.userProfile.findMany({
      where: { role: 'TEACHER', approvalStatus: { in: ['APPROVED', 'SUSPENDED'] }, ...REAL },
      select: {
        id: true, name: true, firstName: true, lastName: true, email: true, approvalStatus: true, bio: true, videoIntroUrl: true, avatarUrl: true,
        lastActiveDate: true, lastSeenAt: true, agreementAcceptedAt: true, createdAt: true,
        country: { select: { code: true, name: true } },
        teacherApplication: { select: { subjectAreas: true } },
        platformCourses: { select: { id: true, status: true } },
        teacherCohorts: { select: { students: { select: { studentId: true } } } },
        teacherReviews: { select: { rating: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const ids = teachers.map(t => t.id);
    const courseIds = teachers.flatMap(t => t.platformCourses.map(c => c.id));
    const [enrol, mentorRatings, earned, paidMonth, pending, unassigned] = await Promise.all([
      this.prisma.courseEnrollment.findMany({ where: { courseId: { in: courseIds } }, select: { courseId: true, studentId: true } }),
      this.prisma.mentorReview.groupBy({ by: ['teacherId'], where: { teacherId: { in: ids } }, _avg: { rating: true }, _count: { rating: true } }),
      this.prisma.walletTransaction.findMany({
        where: { wallet: { userId: { in: ids } }, type: 'CREDIT', createdAt: { gte: new Date(now - 30 * DAY) } },
        select: { amount: true, currency: true, wallet: { select: { userId: true } } },
      }),
      this.prisma.walletTransaction.groupBy({
        by: ['currency'],
        where: { wallet: { userId: { in: ids } }, type: 'CREDIT', createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) } },
        _sum: { amount: true },
      }),
      this.prisma.userProfile.count({ where: { role: 'TEACHER', approvalStatus: 'PENDING', ...REAL } }),
      this.prisma.platformCourse.count({ where: { status: { not: 'ARCHIVED' }, OR: [{ teacherPending: true }, { teacher: { wpUserId: 0 } }] } }),
    ]);
    const courseOwner = new Map(teachers.flatMap(t => t.platformCourses.map(c => [c.id, t.id] as const)));
    const studentsOf = new Map<string, Set<string>>();
    const add = (t: string, s: string) => { if (!studentsOf.has(t)) studentsOf.set(t, new Set()); studentsOf.get(t)!.add(s); };
    enrol.forEach(e => add(courseOwner.get(e.courseId)!, e.studentId));
    teachers.forEach(t => t.teacherCohorts.forEach(c => c.students.forEach(s => add(t.id, s.studentId))));
    const mentorMap = new Map(mentorRatings.map(m => [m.teacherId, m]));

    const rows = teachers.map(t => {
      const m = mentorMap.get(t.id);
      const ratings = [...t.teacherReviews.map(r => r.rating)];
      const count = ratings.length + (m?._count.rating ?? 0);
      const sum = ratings.reduce((a, b) => a + b, 0) + (m?._avg.rating ?? 0) * (m?._count.rating ?? 0);
      const money = new Map<string, number>();
      earned.filter(e => e.wallet.userId === t.id).forEach(e => money.set(e.currency, (money.get(e.currency) ?? 0) + e.amount));
      const lastSeen = [t.lastSeenAt, t.lastActiveDate].filter(Boolean).sort((a, b) => +b! - +a!)[0] ?? null;
      return {
        id: t.id, name: nameOf(t), email: t.email, status: t.approvalStatus, avatarUrl: t.avatarUrl, country: t.country,
        subjects: t.teacherApplication?.subjectAreas ?? [],
        courses: t.platformCourses.filter(c => c.status !== 'ARCHIVED').length,
        published: t.platformCourses.filter(c => c.status === 'PUBLISHED').length,
        students: studentsOf.get(t.id)?.size ?? 0,
        rating: count ? Math.round((sum / count) * 10) / 10 : null, ratings: count,
        earned30d: [...money].map(([currency, amount]) => ({ currency, amount })) as Money,
        checks: { photo: !!t.avatarUrl, bio: !!t.bio, video: !!t.videoIntroUrl, agreement: !!t.agreementAcceptedAt },
        profileComplete: !!t.videoIntroUrl && !!t.bio,
        missing: [!t.videoIntroUrl && 'intro video', !t.bio && 'bio'].filter(Boolean) as string[],
        lastActive: lastSeen, joinedAt: t.createdAt,
      };
    });
    const active = rows.filter(r => r.status === 'APPROVED');
    const rated = rows.filter(r => r.rating != null);
    return {
      stats: {
        active: active.length,
        suspended: rows.filter(r => r.status === 'SUSPENDED').length,
        applications: pending,
        students: new Set([...studentsOf.values()].flatMap(s => [...s])).size,
        courses: rows.reduce((n, r) => n + r.published, 0),
        avgRating: rated.length ? Math.round((rated.reduce((n, r) => n + r.rating! * r.ratings, 0) / rated.reduce((n, r) => n + r.ratings, 0)) * 10) / 10 : null,
        ratings: rows.reduce((n, r) => n + r.ratings, 0),
        paidThisMonth: paidMonth.map(p => ({ currency: p.currency, amount: p._sum.amount ?? 0 })) as Money,
        countries: new Set(active.filter(r => r.country).map(r => r.country!.code)).size,
        noCountry: active.filter(r => !r.country).length,
        signed: active.filter(r => r.checks.agreement).length,
        withPhoto: active.filter(r => r.checks.photo).length,
        withCourses: active.filter(r => r.courses > 0).length,
        teaching: active.filter(r => r.students > 0).length,
        complete: active.filter(r => r.checks.photo && r.checks.bio && r.checks.video && r.checks.agreement).length,
        unassignedCourses: unassigned,
      },
      teachers: rows,
    };
  }

  /** Applications waiting (and turned down), oldest first, with how many approved teachers already cover each subject in their country */
  async applications() {
    const apps = await this.prisma.userProfile.findMany({
      where: { role: 'TEACHER', approvalStatus: { in: ['PENDING', 'REJECTED'] }, ...REAL },
      select: {
        id: true, name: true, firstName: true, lastName: true, email: true, phone: true, approvalStatus: true, avatarUrl: true, createdAt: true,
        country: { select: { id: true, code: true, name: true } },
        teacherApplication: {
          select: {
            firstName: true, lastName: true, phone: true, subjectAreas: true, yearsExperience: true, qualification: true, teachingModality: true,
            bio: true, documentUrl: true, linkedinUrl: true, websiteUrl: true, rejectionReason: true, submittedAt: true, question: true, questionAskedAt: true,
          },
        },
      },
    });
    const approved = await this.prisma.userProfile.findMany({
      where: { role: 'TEACHER', approvalStatus: 'APPROVED', ...REAL },
      select: { countryId: true, teacherApplication: { select: { subjectAreas: true } } },
    });
    const now = Date.now();
    return apps.map(t => {
      const a = t.teacherApplication;
      const since = a?.submittedAt ?? t.createdAt;
      const subjects = (a?.subjectAreas ?? []).filter(s => !/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(s));
      return {
        id: t.id, email: t.email, status: t.approvalStatus, avatarUrl: t.avatarUrl, country: t.country,
        name: [a?.firstName, a?.lastName].filter(Boolean).join(' ') || nameOf(t),
        phone: a?.phone || t.phone || null,
        subjects, yearsExperience: a?.yearsExperience ?? null, qualification: a?.qualification ?? null, modality: a?.teachingModality ?? null,
        bio: a?.bio ?? null, cv: a?.documentUrl ?? null, linkedin: a?.linkedinUrl ?? null, website: a?.websiteUrl ?? null,
        rejectionReason: a?.rejectionReason ?? null, submittedAt: since, daysWaiting: Math.floor((now - +since) / DAY),
        question: a?.question ?? null, questionAskedAt: a?.questionAskedAt ?? null,
        // Approved teachers in the same country who teach each subject
        coverage: t.country ? subjects.map(s => ({ subject: s, teachers: approved.filter(x => x.countryId === t.country!.id && x.teacherApplication?.subjectAreas.includes(s)).length })) : [],
      };
    }).sort((x, y) => +new Date(x.submittedAt) - +new Date(y.submittedAt));
  }

  /** Email an applicant a question before deciding; the application then shows "Waiting for them" */
  async ask(admin: UserProfile, teacherId: string, question: string) {
    const q = (question ?? '').trim();
    if (q.length < 5) throw new BadRequestException('Write your question first');
    if (q.length > 1500) throw new BadRequestException('Keep the question under 1,500 characters');
    const t = await this.prisma.userProfile.findFirst({ where: { id: teacherId, role: 'TEACHER', approvalStatus: 'PENDING' }, select: { id: true, email: true, name: true, firstName: true, lastName: true } });
    if (!t) throw new NotFoundException('Application not found');
    await this.prisma.teacherApplication.updateMany({ where: { userId: t.id }, data: { question: q, questionAskedAt: new Date() } });
    await this.mail.sendNotice(t.email, 'A question about your teacher application · CareerPath Africa', {
      badge: 'Your application', title: 'A question before we decide', firstName: firstOf(t),
      text: 'Thank you for applying to teach on CareerPath Africa. Before we make a decision, we’d like to know a little more.\n\nJust reply to this email with your answer.',
      quote: q, quoteLabel: `From ${firstOf(admin as unknown as Person) ?? 'our team'} at CareerPath Africa`,
      cta: 'Open CareerPath Africa', href: '/login',
    }, 'teachers');
    const who = nameOf(t);
    this.audit.record({ action: 'teacher.asked', area: 'People', targetType: 'UserProfile', targetId: t.id, targetLabel: who, summary: `Asked ${who} a question about their tutor application: “${q.slice(0, 120)}”` });
    return { ok: true, questionAskedAt: new Date() };
  }

  /** The same reminder email to several teachers at once */
  async nudge(kind: Nudge, ids: string[]) {
    const n = NUDGES[kind];
    if (!n) throw new BadRequestException('Unknown reminder');
    if (!Array.isArray(ids) || !ids.length) throw new BadRequestException('Choose at least one teacher');
    if (ids.length > 200) throw new BadRequestException('Up to 200 teachers at a time');
    const people = await this.prisma.userProfile.findMany({
      where: { id: { in: ids }, role: 'TEACHER', approvalStatus: 'APPROVED', ...REAL },
      select: { id: true, email: true, name: true, firstName: true, lastName: true },
    });
    let sent = 0;
    for (const p of people) {
      try { await this.mail.sendNotice(p.email, n.subject, { badge: n.badge, title: n.title, firstName: firstOf(p), text: n.text, cta: n.cta, href: n.href }, 'teachers'); sent++; } catch { /* keep going */ }
    }
    this.audit.record({ action: `teacher.nudge.${kind}`, area: 'People', summary: n.done.replace('{n}', `${sent} teacher${sent === 1 ? '' : 's'}`), metadata: { ids: people.map(p => p.id), sent } });
    return { sent, skipped: ids.length - sent };
  }

  /** Invite someone to apply as a teacher */
  async invite(email: string, name?: string, note?: string) {
    const e = (email ?? '').trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new BadRequestException('Enter a valid email address');
    const existing = await this.prisma.userProfile.findUnique({ where: { email: e }, select: { role: true, approvalStatus: true } });
    if (existing?.role === 'TEACHER') throw new BadRequestException(existing.approvalStatus === 'PENDING' ? 'They’ve already applied: see Applications' : 'They’re already a teacher');
    const first = (name ?? '').trim().split(/\s+/)[0] || null;
    await this.mail.sendNotice(e, 'You’re invited to teach on CareerPath Africa', {
      badge: 'Teach with us', title: 'Teach exam prep with CareerPath Africa', firstName: first,
      text: 'We’d love you to teach on CareerPath Africa. Students across Africa use our courses, live classes and mentoring to prepare for their exams, and teachers earn a share of every sale.\n\nApplying takes about ten minutes: your subjects, your experience and a short bio. We review every application by hand.',
      quote: note?.trim() || null, quoteLabel: 'A note from our team',
      cta: 'Apply to teach', href: '/register?role=teacher',
    }, 'teachers');
    this.audit.record({ action: 'teacher.invited', area: 'People', summary: `Invited ${e} to apply as a teacher` });
    return { ok: true };
  }

  /** Everything the teacher drawer shows: courses, cohorts, mentorship, money, profile and their application */
  async detail(teacherId: string) {
    const now = new Date();
    const t = await this.prisma.userProfile.findFirst({
      where: { id: teacherId, role: 'TEACHER' },
      select: {
        id: true, name: true, firstName: true, lastName: true, email: true, phone: true, approvalStatus: true, bio: true, videoIntroUrl: true, avatarUrl: true,
        lastActiveDate: true, lastSeenAt: true, lastDevice: true, createdAt: true, agreementAcceptedAt: true, agreementVersion: true,
        country: { select: { code: true, name: true } },
        teacherApplication: {
          select: {
            subjectAreas: true, yearsExperience: true, qualification: true, teachingModality: true, bio: true, documentUrl: true,
            linkedinUrl: true, websiteUrl: true, submittedAt: true, phone: true,
          },
        },
        platformCourses: { select: { id: true, title: true, status: true, _count: { select: { enrollments: true } } }, orderBy: { title: 'asc' } },
        teacherCohorts: {
          select: {
            id: true, name: true, _count: { select: { students: true } },
            liveClasses: { where: { status: { not: 'CANCELLED' } }, select: { scheduledAt: true, durationMins: true, status: true, recordingUrl: true, _count: { select: { attendance: true } } } },
          },
        },
        mentorSlots: { where: { startsAt: { gte: now } }, select: { isBooked: true } },
        wallet: { select: { balance: true, currency: true } },
        payoutAccount: { select: { provider: true, bankName: true, accountNumber: true, isVerified: true } },
      },
    });
    if (!t) throw new NotFoundException('Teacher not found');
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1), lastStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const credits = (from: Date, to?: Date) => this.prisma.walletTransaction.groupBy({
      by: ['currency'], where: { wallet: { userId: teacherId }, type: 'CREDIT', createdAt: { gte: from, ...(to && { lt: to }) } }, _sum: { amount: true },
    }).then(r => r.map(e => ({ currency: e.currency, amount: e._sum.amount ?? 0 })));
    const [assignments, mentor, reviews, earned, thisMonth, lastMonth, pendingPay, paidOut] = await Promise.all([
      this.prisma.courseAssignment.findMany({ where: { courseId: { in: t.platformCourses.map(c => c.id) } }, select: { courseId: true, teacherCommissionPct: true } }),
      this.prisma.mentorReview.aggregate({ where: { teacherId }, _avg: { rating: true }, _count: { rating: true } }),
      this.prisma.teacherReview.aggregate({ where: { teacherId }, _avg: { rating: true }, _count: { rating: true } }),
      credits(new Date(+now - 30 * DAY)),
      credits(monthStart),
      credits(lastStart, monthStart),
      this.prisma.payoutStatement.groupBy({ by: ['currency'], where: { recipientId: teacherId, status: 'PENDING' }, _sum: { amount: true } }),
      this.prisma.payoutStatement.findFirst({ where: { recipientId: teacherId, status: 'PAID' }, orderBy: { paidAt: 'desc' }, select: { amount: true, currency: true, paidAt: true } }),
    ]);
    const pct = new Map(assignments.map(a => [a.courseId, a.teacherCommissionPct]));
    const ended = (c: { scheduledAt: Date; durationMins: number; status: string }) => c.status === 'COMPLETED' || (c.status === 'SCHEDULED' && c.scheduledAt.getTime() + c.durationMins * 60_000 < +now);
    const count = reviews._count.rating + mentor._count.rating;
    const sum = (reviews._avg.rating ?? 0) * reviews._count.rating + (mentor._avg.rating ?? 0) * mentor._count.rating;
    const a = t.teacherApplication;
    const acct = t.payoutAccount;
    return {
      id: t.id, name: nameOf(t), email: t.email, status: t.approvalStatus, joinedAt: t.createdAt, avatarUrl: t.avatarUrl, country: t.country,
      lastActive: [t.lastSeenAt, t.lastActiveDate].filter(Boolean).sort((x, y) => +y! - +x!)[0] ?? null, lastDevice: t.lastDevice,
      subjects: a?.subjectAreas ?? [], yearsExperience: a?.yearsExperience ?? null,
      profile: { video: !!t.videoIntroUrl, bio: !!t.bio, photo: !!t.avatarUrl, videoUrl: t.videoIntroUrl },
      agreement: t.agreementAcceptedAt ? { at: t.agreementAcceptedAt, version: t.agreementVersion } : null,
      rating: count ? Math.round((sum / count) * 10) / 10 : null, ratings: count,
      courses: t.platformCourses.map(c => ({ id: c.id, title: c.title, status: c.status, students: c._count.enrollments, commissionPct: pct.get(c.id) ?? null })),
      cohorts: t.teacherCohorts.map(c => {
        const held = c.liveClasses.filter(ended);
        const possible = held.length * c._count.students;
        return {
          id: c.id, name: c.name, students: c._count.students, classesHeld: held.length,
          attendancePct: possible ? Math.round((held.reduce((n, x) => n + x._count.attendance, 0) / possible) * 100) : null,
          missingRecordings: held.filter(x => !x.recordingUrl && x.scheduledAt.getTime() < +now - 2 * DAY).length,
        };
      }),
      mentorship: {
        freeSlots: t.mentorSlots.filter(s => !s.isBooked).length, booked: t.mentorSlots.filter(s => s.isBooked).length,
        rating: mentor._avg.rating ? Math.round(mentor._avg.rating * 10) / 10 : null, ratings: mentor._count.rating,
      },
      earned30d: earned,
      money: {
        thisMonth, lastMonth, balance: t.wallet ? { currency: t.wallet.currency, amount: t.wallet.balance } : null,
        pending: pendingPay.map(p => ({ currency: p.currency, amount: p._sum.amount ?? 0 })),
        lastPaid: paidOut ? { currency: paidOut.currency, amount: paidOut.amount, at: paidOut.paidAt } : null,
        account: acct ? { label: `${acct.provider ?? acct.bankName} ·· ${acct.accountNumber.slice(-4)}`, verified: acct.isVerified } : null,
      },
      application: a ? {
        submittedAt: a.submittedAt, qualification: a.qualification, modality: a.teachingModality, bio: a.bio, cv: a.documentUrl,
        linkedin: a.linkedinUrl, website: a.websiteUrl, phone: a.phone || t.phone || null, yearsExperience: a.yearsExperience,
      } : null,
    };
  }

  /** Pause a teacher (no sign-in, hidden from students) or bring them back; the reason goes in the Activity log */
  async setSuspended(teacherId: string, suspended: boolean, reason?: string) {
    const t = await this.prisma.userProfile.findFirst({ where: { id: teacherId, role: 'TEACHER' }, select: { approvalStatus: true, name: true, firstName: true, lastName: true, email: true } });
    if (!t) throw new NotFoundException('Teacher not found');
    if (suspended && t.approvalStatus !== 'APPROVED') throw new BadRequestException('Only approved teachers can be suspended');
    if (!suspended && t.approvalStatus !== 'SUSPENDED') throw new BadRequestException('This teacher isn’t suspended');
    const why = (reason ?? '').trim().slice(0, 500);
    if (suspended && why.length < 3) throw new BadRequestException('Say why you’re suspending them');
    await this.prisma.userProfile.update({ where: { id: teacherId }, data: { approvalStatus: suspended ? 'SUSPENDED' : 'APPROVED' } });
    const who = nameOf(t);
    this.audit.record({
      action: suspended ? 'teacher.suspended' : 'teacher.reinstated', area: 'People', targetType: 'UserProfile', targetId: teacherId, targetLabel: who,
      summary: suspended ? `Suspended ${who}: “${why}”` : `Reinstated ${who}${why ? `: “${why}”` : ''}`,
      before: { status: t.approvalStatus }, after: { status: suspended ? 'SUSPENDED' : 'APPROVED' },
    });
    return { status: suspended ? 'SUSPENDED' : 'APPROVED' };
  }
}
