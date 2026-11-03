import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, UserProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { portalOnlyWpId } from '../prisma/portal-only-id';

const DAY = 86_400_000;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
type Who = { name: string | null; firstName: string | null; lastName: string | null; email: string };
const nameOf = (p: Who) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
const cleanEmails = (xs: unknown[]) => [...new Set(xs.map(x => String(x ?? '').trim().toLowerCase()).filter(e => EMAIL.test(e)))];

/** A short, readable join code like "ACH-7Q4K" (no 0/O or 1/I to mix up) */
function newJoinCode(name: string) {
  const letters = name.replace(/[^A-Za-z]/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return `${letters}-${Array.from({ length: 4 }, () => abc[Math.floor(Math.random() * abc.length)]).join('')}`;
}

/**
 * Schools and companies: CareerPath admins set them up with seats on a package; the school's own
 * admin (role ORG_ADMIN) invites students by email or with a join link and follows their progress.
 * A seat becomes a package purchase only when a student claims it.
 */
@Injectable()
export class SchoolService {
  constructor(private prisma: PrismaService, private mail: MailService, private config: ConfigService) {}

  private get portal() { return this.config.get<string>('PORTAL_URL', 'http://localhost:3000').replace(/\/$/, ''); }

  // ── CareerPath admin ─────────────────────────────────────

  async adminList() {
    const orgs = await this.prisma.organisation.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        admins: { select: { id: true, name: true, firstName: true, lastName: true, email: true } },
        enrollments: { include: { seats: { select: { claimedAt: true } } }, orderBy: { purchasedAt: 'desc' } },
      },
    });
    const packages = await this.prisma.package.findMany({ where: { id: { in: [...new Set(orgs.flatMap(o => o.enrollments.map(e => e.packageId)))] } }, select: { id: true, name: true, priceAmount: true, currency: true } });
    const countries = await this.prisma.country.findMany({ select: { id: true, name: true } });
    return orgs.map(o => ({
      id: o.id, name: o.name, contactEmail: o.contactEmail, joinCode: o.joinCode, joinEnabled: o.joinEnabled, emailDomain: o.emailDomain, createdAt: o.createdAt,
      country: countries.find(c => c.id === o.countryId)?.name ?? null,
      admins: o.admins.map(a => ({ id: a.id, name: nameOf(a), email: a.email })),
      packages: o.enrollments.map(e => {
        const p = packages.find(x => x.id === e.packageId);
        return { enrollmentId: e.id, packageId: e.packageId, name: p?.name ?? 'Package removed', seats: e.seatsPurchased, invited: e.seats.length, joined: e.seats.filter(s => s.claimedAt).length, pricePerSeat: e.pricePerSeat, currency: e.currency ?? p?.currency ?? null, purchasedAt: e.purchasedAt };
      }),
    }));
  }

  async adminCreate(dto: { name: string; countryId?: string | null; contactEmail: string; adminName: string; adminEmail: string; packageId: string; seats: number; pricePerSeat?: number | null; emailDomain?: string | null }) {
    const name = String(dto.name ?? '').trim();
    const adminEmail = String(dto.adminEmail ?? '').trim().toLowerCase();
    const contactEmail = String(dto.contactEmail ?? '').trim().toLowerCase() || adminEmail;
    if (!name) throw new BadRequestException('Give the school a name');
    if (!EMAIL.test(adminEmail)) throw new BadRequestException('Enter the school admin’s email');
    const pkg = await this.prisma.package.findUnique({ where: { id: dto.packageId } });
    if (!pkg) throw new BadRequestException('Choose a package');
    const seats = Math.round(Number(dto.seats));
    if (!Number.isFinite(seats) || seats < 1 || seats > 10_000) throw new BadRequestException('Seats must be 1 to 10,000');
    const existing = await this.prisma.userProfile.findUnique({ where: { email: adminEmail } });
    if (existing && existing.role !== 'ORG_ADMIN') throw new BadRequestException(`${adminEmail} already has a ${existing.role.toLowerCase().replace('_', ' ')} account. Use another email for the school admin.`);
    if (existing?.organisationId) throw new BadRequestException(`${adminEmail} already runs another organisation`);

    let joinCode = newJoinCode(name);
    while (await this.prisma.organisation.findUnique({ where: { joinCode } })) joinCode = newJoinCode(name);
    const domain = dto.emailDomain?.trim().toLowerCase().replace(/^@/, '') || null;
    const wpUserId = existing ? null : await portalOnlyWpId(this.prisma);

    const org = await this.prisma.$transaction(async tx => {
      const o = await tx.organisation.create({ data: { name, countryId: dto.countryId || null, contactEmail, joinCode, emailDomain: domain } });
      await tx.orgEnrollment.create({ data: { organisationId: o.id, organizationName: name, contactEmail, packageId: pkg.id, seatsPurchased: seats, pricePerSeat: dto.pricePerSeat ?? null, currency: pkg.currency } });
      if (existing) await tx.userProfile.update({ where: { id: existing.id }, data: { organisationId: o.id } });
      else {
        const [first, ...rest] = String(dto.adminName ?? '').trim().split(/\s+/);
        await tx.userProfile.create({ data: { wpUserId: wpUserId!, email: adminEmail, role: 'ORG_ADMIN', approvalStatus: 'APPROVED', onboardingCompleted: true, organisationId: o.id, name: String(dto.adminName ?? '').trim() || null, firstName: first || null, lastName: rest.join(' ') || null, countryId: dto.countryId || null } });
      }
      return o;
    });
    this.mail.sendOrgAdminWelcome(adminEmail, String(dto.adminName ?? '').trim() || name, name, `${this.portal}/login?with=code&email=${encodeURIComponent(adminEmail)}`).catch(() => {});
    return { id: org.id, joinCode };
  }

  /** Seats on another package, or more seats on one they already have */
  async adminAddPackage(orgId: string, dto: { packageId: string; seats: number; pricePerSeat?: number | null }) {
    const org = await this.prisma.organisation.findUnique({ where: { id: orgId }, include: { enrollments: true } });
    if (!org) throw new NotFoundException('Organisation not found');
    const pkg = await this.prisma.package.findUnique({ where: { id: dto.packageId } });
    if (!pkg) throw new BadRequestException('Choose a package');
    const seats = Math.round(Number(dto.seats));
    if (!Number.isFinite(seats) || seats < 1) throw new BadRequestException('Add at least one seat');
    const have = org.enrollments.find(e => e.packageId === pkg.id);
    if (have) await this.prisma.orgEnrollment.update({ where: { id: have.id }, data: { seatsPurchased: { increment: seats }, ...(dto.pricePerSeat != null && { pricePerSeat: dto.pricePerSeat }) } });
    else await this.prisma.orgEnrollment.create({ data: { organisationId: org.id, organizationName: org.name, contactEmail: org.contactEmail, packageId: pkg.id, seatsPurchased: seats, pricePerSeat: dto.pricePerSeat ?? null, currency: pkg.currency } });
    return { ok: true };
  }

  // ── School portal (ORG_ADMIN) ─────────────────────────────

  private async orgOf(user: UserProfile) {
    if (!user.organisationId) throw new ForbiddenException('Your account isn’t linked to a school yet');
    const org = await this.prisma.organisation.findUnique({ where: { id: user.organisationId }, include: { enrollments: { include: { seats: true }, orderBy: { purchasedAt: 'asc' } } } });
    if (!org) throw new ForbiddenException('Your school was removed');
    return org;
  }

  /** Lessons each student finished in their package's courses, and how many there are */
  private async progress(seats: { studentId: string | null; packageCourseIds: string[] }[]) {
    const courseIds = [...new Set(seats.flatMap(s => s.packageCourseIds))];
    const studentIds = seats.map(s => s.studentId).filter((x): x is string => !!x);
    const [lessons, done, quiz] = await Promise.all([
      courseIds.length ? this.prisma.lesson.findMany({ where: { module: { courseId: { in: courseIds } } }, select: { id: true, module: { select: { courseId: true } } } }) : [],
      studentIds.length ? this.prisma.lessonProgress.findMany({ where: { studentId: { in: studentIds }, completed: true, lesson: { module: { courseId: { in: courseIds } } } }, select: { studentId: true, lessonId: true, updatedAt: true } }) : [],
      studentIds.length ? this.prisma.quizAttempt.findMany({ where: { studentId: { in: studentIds }, courseId: { in: courseIds }, maxScore: { gt: 0 } }, select: { studentId: true, finalScore: true, autoScore: true, maxScore: true, submittedAt: true } }) : [],
    ]);
    return { lessons, done, quiz };
  }

  async dashboard(user: UserProfile) {
    const org = await this.orgOf(user);
    const pkgs = await this.prisma.package.findMany({ where: { id: { in: org.enrollments.map(e => e.packageId) } }, select: { id: true, name: true, courseIds: true, validityDays: true, cohortId: true, mentorship: true } });
    const seats = org.enrollments.flatMap(e => e.seats.map(s => ({ ...s, packageCourseIds: pkgs.find(p => p.id === e.packageId)?.courseIds ?? [] })));
    const joined = seats.filter(s => s.studentId);
    const students = joined.length ? await this.prisma.userProfile.findMany({ where: { id: { in: joined.map(s => s.studentId!) } }, select: { id: true, lastActiveDate: true } }) : [];
    const { done, quiz } = await this.progress(joined);
    const weekAgo = Date.now() - 7 * DAY, twoWeeks = Date.now() - 14 * DAY;
    const scores = quiz.map(q => (q.finalScore || q.autoScore) / q.maxScore);
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const monthScores = quiz.filter(q => q.submittedAt >= monthStart).map(q => (q.finalScore || q.autoScore) / q.maxScore);
    return {
      org: { id: org.id, name: org.name, joinCode: org.joinCode, joinEnabled: org.joinEnabled, emailDomain: org.emailDomain },
      packages: org.enrollments.map(e => {
        const p = pkgs.find(x => x.id === e.packageId);
        return {
          enrollmentId: e.id, name: p?.name ?? 'Package removed', courses: p?.courseIds.length ?? 0, liveClasses: !!p?.cohortId, mentorship: !!p?.mentorship,
          validityDays: p?.validityDays ?? null, seats: e.seatsPurchased, invited: e.seats.filter(s => !s.claimedAt).length, joined: e.seats.filter(s => s.claimedAt).length,
          free: Math.max(0, e.seatsPurchased - e.seats.length),
        };
      }),
      stats: {
        seats: org.enrollments.reduce((n, e) => n + e.seatsPurchased, 0), used: seats.length, joined: joined.length,
        activeWeek: students.filter(s => s.lastActiveDate && +s.lastActiveDate >= weekAgo).length,
        lessonsDone: done.length, avgQuiz: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) : null,
        avgQuizMonth: monthScores.length ? Math.round((monthScores.reduce((a, b) => a + b, 0) / monthScores.length) * 100) : null,
      },
      nudges: {
        invitedNotJoined: seats.filter(s => !s.claimedAt).length,
        joinedNotStarted: joined.filter(s => !done.some(d => d.studentId === s.studentId)).length,
        quietTwoWeeks: students.filter(s => !s.lastActiveDate || +s.lastActiveDate < twoWeeks).length,
      },
    };
  }

  async students(user: UserProfile) {
    const org = await this.orgOf(user);
    const pkgs = await this.prisma.package.findMany({ where: { id: { in: org.enrollments.map(e => e.packageId) } }, select: { id: true, name: true, courseIds: true } });
    const seats = org.enrollments.flatMap(e => e.seats.map(s => ({ ...s, enrollmentId: e.id, packageName: pkgs.find(p => p.id === e.packageId)?.name ?? '', packageCourseIds: pkgs.find(p => p.id === e.packageId)?.courseIds ?? [] })));
    const people = await this.prisma.userProfile.findMany({ where: { id: { in: seats.map(s => s.studentId).filter((x): x is string => !!x) } }, select: { id: true, name: true, firstName: true, lastName: true, email: true, lastActiveDate: true } });
    const { lessons, done, quiz } = await this.progress(seats);
    return seats.map(s => {
      const p = people.find(x => x.id === s.studentId);
      const total = lessons.filter(l => s.packageCourseIds.includes(l.module.courseId)).length;
      const mine = done.filter(d => d.studentId === s.studentId);
      const qs = quiz.filter(q => q.studentId === s.studentId).map(q => (q.finalScore || q.autoScore) / q.maxScore);
      const last = [p?.lastActiveDate, mine.sort((a, b) => +b.updatedAt - +a.updatedAt)[0]?.updatedAt].filter((x): x is Date => !!x).sort((a, b) => +b - +a)[0] ?? null;
      return {
        seatId: s.id, enrollmentId: s.enrollmentId, packageName: s.packageName, status: s.claimedAt ? 'joined' : 'invited', joinedVia: s.joinedVia,
        studentId: s.studentId, name: p ? nameOf(p) : null, email: p?.email ?? s.inviteEmail, invitedAt: s.invitedAt, joinedAt: s.claimedAt, remindedAt: s.remindedAt,
        lessons: { done: Math.min(mine.length, total), total }, avgQuiz: qs.length ? Math.round((qs.reduce((a, b) => a + b, 0) / qs.length) * 100) : null, lastActive: last,
      };
    }).sort((a, b) => (a.status === b.status ? +new Date(b.joinedAt ?? b.invitedAt) - +new Date(a.joinedAt ?? a.invitedAt) : a.status === 'joined' ? -1 : 1));
  }

  async invite(user: UserProfile, enrollmentId: string, emails: unknown[]) {
    const org = await this.orgOf(user);
    const e = org.enrollments.find(x => x.id === enrollmentId);
    if (!e) throw new NotFoundException('Choose one of your packages');
    const have = new Set(org.enrollments.flatMap(x => x.seats.map(s => s.inviteEmail).filter(Boolean)));
    const list = cleanEmails(Array.isArray(emails) ? emails.slice(0, 1000) : []).filter(x => !have.has(x));
    if (!list.length) return { invited: 0, skipped: Array.isArray(emails) ? emails.length : 0 };
    const free = e.seatsPurchased - e.seats.length;
    if (list.length > free) throw new BadRequestException(free ? `Only ${free} seat${free === 1 ? '' : 's'} left on this package — invite fewer, or ask CareerPath for more seats.` : 'No seats left on this package. Ask CareerPath for more.');
    if (org.emailDomain) {
      const outside = list.filter(x => !x.endsWith(`@${org.emailDomain}`));
      if (outside.length) throw new BadRequestException(`These don’t end in @${org.emailDomain}: ${outside.slice(0, 5).join(', ')}${outside.length > 5 ? '…' : ''}. Change the allowed domain in Settings to invite them.`);
    }
    await this.prisma.orgSeat.createMany({ data: list.map(inviteEmail => ({ orgEnrollmentId: e.id, inviteEmail, joinedVia: 'EMAIL' })) });
    const pkg = await this.prisma.package.findUnique({ where: { id: e.packageId }, select: { name: true } });
    for (const to of list) this.mail.sendOrgSeatInvite(to, org.name, pkg?.name ?? 'a package', `${this.portal}/student/org-invite`, org.joinEnabled ? org.joinCode : null).catch(() => {});
    return { invited: list.length, skipped: (Array.isArray(emails) ? emails.length : 0) - list.length };
  }

  private async seatOf(user: UserProfile, seatId: string) {
    const org = await this.orgOf(user);
    const seat = org.enrollments.flatMap(e => e.seats).find(s => s.id === seatId);
    if (!seat) throw new NotFoundException('Seat not found');
    return { org, seat };
  }

  async remind(user: UserProfile, seatId: string) {
    const { org, seat } = await this.seatOf(user, seatId);
    if (seat.claimedAt || !seat.inviteEmail) throw new BadRequestException('They’ve already joined');
    if (seat.remindedAt && Date.now() - +seat.remindedAt < DAY) throw new BadRequestException('Already reminded today');
    const e = org.enrollments.find(x => x.id === seat.orgEnrollmentId)!;
    const pkg = await this.prisma.package.findUnique({ where: { id: e.packageId }, select: { name: true } });
    await this.prisma.orgSeat.update({ where: { id: seat.id }, data: { remindedAt: new Date() } });
    this.mail.sendOrgSeatInvite(seat.inviteEmail, org.name, pkg?.name ?? 'a package', `${this.portal}/student/org-invite`, org.joinEnabled ? org.joinCode : null).catch(() => {});
    return { reminded: true };
  }

  /** Only an invite nobody has accepted can be removed; it frees the seat */
  async remove(user: UserProfile, seatId: string) {
    const { seat } = await this.seatOf(user, seatId);
    if (seat.claimedAt) throw new BadRequestException('They’ve joined, so their seat stays theirs until the package ends');
    await this.prisma.orgSeat.delete({ where: { id: seat.id } });
    return { removed: true };
  }

  async settings(user: UserProfile, dto: { joinEnabled?: boolean; emailDomain?: string | null; newCode?: boolean }) {
    const org = await this.orgOf(user);
    const data: Prisma.OrganisationUpdateInput = {};
    if (dto.joinEnabled !== undefined) data.joinEnabled = !!dto.joinEnabled;
    if (dto.emailDomain !== undefined) {
      const d = dto.emailDomain?.trim().toLowerCase().replace(/^@/, '') || null;
      if (d && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)) throw new BadRequestException('Enter a domain like achimota.edu.gh');
      data.emailDomain = d;
    }
    if (dto.newCode) {
      let code = newJoinCode(org.name);
      while (await this.prisma.organisation.findUnique({ where: { joinCode: code } })) code = newJoinCode(org.name);
      data.joinCode = code;
    }
    const o = await this.prisma.organisation.update({ where: { id: org.id }, data });
    return { joinCode: o.joinCode, joinEnabled: o.joinEnabled, emailDomain: o.emailDomain };
  }

  // ── Students ──────────────────────────────────────────────

  /** What a join link is for, shown before the student signs in */
  async linkInfo(code: string) {
    const org = await this.prisma.organisation.findUnique({ where: { joinCode: String(code ?? '').toUpperCase() }, include: { enrollments: { include: { _count: { select: { seats: true } } } } } });
    if (!org || !org.joinEnabled) return { valid: false as const };
    const free = org.enrollments.reduce((n, e) => n + Math.max(0, e.seatsPurchased - e._count.seats), 0);
    return { valid: true as const, name: org.name, open: free > 0, emailDomain: org.emailDomain };
  }

  /** A signed-in student takes a free seat with the school's join link */
  async joinWithLink(student: UserProfile, code: string) {
    const org = await this.prisma.organisation.findUnique({ where: { joinCode: String(code ?? '').toUpperCase() }, include: { enrollments: { include: { seats: true }, orderBy: { purchasedAt: 'asc' } } } });
    if (!org || !org.joinEnabled) throw new NotFoundException('This join link isn’t active. Ask your school for a new one.');
    if (org.emailDomain && !student.email.toLowerCase().endsWith(`@${org.emailDomain}`)) throw new ForbiddenException(`${org.name} only accepts emails ending in @${org.emailDomain}`);
    // An invite to their email counts first
    const invited = org.enrollments.flatMap(e => e.seats).find(s => !s.claimedAt && s.inviteEmail === student.email.toLowerCase());
    const target = invited ? org.enrollments.find(e => e.id === invited.orgEnrollmentId)! :
      org.enrollments.find(e => !e.seats.some(s => s.studentId === student.id) && e.seats.length < e.seatsPurchased);
    if (!target) {
      if (org.enrollments.some(e => e.seats.some(s => s.studentId === student.id))) return { claimed: [] as { organisation: string; packageName: string }[], already: true };
      throw new BadRequestException(`${org.name} has no free seats left. Ask your school.`);
    }
    const seat = invited ?? await this.prisma.orgSeat.create({ data: { orgEnrollmentId: target.id, inviteEmail: null, joinedVia: 'LINK' } });
    const pkg = await this.grant(student.id, target.packageId, seat.id);
    return { claimed: [{ organisation: org.name, packageName: pkg.name }], already: false };
  }

  /** The package purchase behind a claimed seat, and a place in its cohort */
  async grant(studentId: string, packageId: string, seatId: string) {
    const pkg = await this.prisma.package.findUnique({ where: { id: packageId } });
    if (!pkg) throw new NotFoundException('Package no longer exists');
    const expiresAt = pkg.validityDays ? new Date(Date.now() + pkg.validityDays * DAY) : null;
    await this.prisma.$transaction([
      this.prisma.packagePurchase.create({ data: { studentId, packageId: pkg.id, expiresAt } }),
      this.prisma.orgSeat.update({ where: { id: seatId }, data: { studentId, claimedAt: new Date() } }),
    ]);
    if (pkg.cohortId) {
      await this.prisma.cohortRoster.upsert({ where: { studentId_cohortId: { studentId, cohortId: pkg.cohortId } }, update: {}, create: { studentId, cohortId: pkg.cohortId, source: 'ORG' } }).catch(() => {});
    }
    return pkg;
  }
}
