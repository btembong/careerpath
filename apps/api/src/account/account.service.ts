import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserProfile } from '@prisma/client';
import { randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';

const DAY = 24 * 3600 * 1000;
const WAIT_DAYS = 7;
const codeKey = (id: string) => `cpa:delete-code:${id}`;
/** Staff accounts can have students, courses or money attached: an admin finishes those deletions */
const NEEDS_ADMIN = ['TEACHER', 'COUNTRY_REP', 'SUBJECT_REVIEWER', 'ORG_ADMIN'];

/** Settings → Your data: download everything, or delete the account after a 7-day wait. */
@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);
  constructor(private prisma: PrismaService, private redis: RedisService, private mail: MailService) {}

  // ── Download ─────────────────────────────────────────────

  async exportData(user: UserProfile) {
    const id = user.id;
    const [purchases, packages, enrollments, lessons, tests, quizzes, certificates, payments, messages, posts, notes, tickets, xp, badges, submissions] = await Promise.all([
      this.prisma.coursePurchase.findMany({ where: { studentId: id }, include: { course: { select: { title: true } } } }),
      this.prisma.packagePurchase.findMany({ where: { studentId: id }, include: { package: { select: { name: true } } } }),
      this.prisma.courseEnrollment.findMany({ where: { studentId: id }, include: { course: { select: { title: true } } } }),
      this.prisma.lessonProgress.findMany({ where: { studentId: id } }),
      this.prisma.testSession.findMany({ where: { studentId: id }, include: { answers: true } }),
      this.prisma.quizAttempt.findMany({ where: { studentId: id } }),
      this.prisma.certificate.findMany({ where: { studentId: id } }),
      this.prisma.paymentAttempt.findMany({ where: { studentId: id } }),
      this.prisma.message.findMany({ where: { senderId: id }, select: { id: true, threadId: true, body: true, attachmentName: true, createdAt: true } }),
      this.prisma.courseDiscussionPost.findMany({ where: { authorId: id } }),
      this.prisma.lessonNote.findMany({ where: { studentId: id } }),
      this.prisma.supportTicket.findMany({ where: { studentId: id } }),
      this.prisma.xPEvent.findMany({ where: { userId: id } }),
      this.prisma.userBadge.findMany({ where: { userId: id } }),
      this.prisma.submission.findMany({ where: { studentId: id } }),
    ]);
    // Never hand out secrets, even to their owner
    const { passwordHash: _p, googleId: _g, microsoftId: _m, agreementIp: _ip, ...profile } = user as UserProfile & Record<string, unknown>;
    return {
      exportedAt: new Date().toISOString(),
      about: 'Everything CareerPath Africa holds about you. Questions: support@careerpathafrica.com',
      profile,
      courses: { purchases, packages, enrollments },
      progress: { lessons, quizzes, tests, submissions, xp, badges },
      certificates, payments, messagesYouSent: messages, communityPosts: posts, notes, supportTickets: tickets,
    };
  }

  // ── Delete ───────────────────────────────────────────────

  async deletionStatus(user: UserProfile) {
    return {
      dueAt: user.deletionDueAt, requestedAt: user.deletionRequestedAt,
      needsAdmin: NEEDS_ADMIN.includes(user.role),
      email: user.email,
    };
  }

  async sendDeletionCode(user: UserProfile) {
    if (user.role === 'ADMIN') throw new ForbiddenException('Admin accounts are removed by another admin, not from Settings.');
    const code = String(randomInt(100000, 1000000));
    await this.redis.set(codeKey(user.id), code, 600);
    await this.mail.sendOtp(user.email, code);
    return { sent: true };
  }

  async requestDeletion(user: UserProfile, code: string) {
    if (user.role === 'ADMIN') throw new ForbiddenException('Admin accounts are removed by another admin, not from Settings.');
    const stored = await this.redis.get(codeKey(user.id));
    if (!stored) throw new UnauthorizedException('That code has expired. Ask for a new one.');
    if (stored !== String(code ?? '').trim()) throw new UnauthorizedException('That code isn’t right.');
    await this.redis.del(codeKey(user.id));
    const dueAt = new Date(Date.now() + WAIT_DAYS * DAY);
    await this.prisma.userProfile.update({ where: { id: user.id }, data: { deletionRequestedAt: new Date(), deletionDueAt: dueAt } });
    this.logger.log(`Deletion requested for ${user.id}, due ${dueAt.toISOString()}`);
    // Always sent: if someone else asked for this, the owner finds out in time to stop it
    const needsAdmin = NEEDS_ADMIN.includes(user.role);
    const day = dueAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    this.mail.sendNotice(user.email, 'Your CareerPath Africa account is set to be deleted', {
      badge: 'Account security', title: 'Your account will be deleted', firstName: user.firstName,
      text: needsAdmin
        ? `you asked us to delete your CareerPath Africa account. From ${day}, our team will finish it once anything you're owed is paid out.\n\nChanged your mind? Keep your account from Settings before then.`
        : `you asked us to delete your CareerPath Africa account. It will be deleted on ${day}, with your progress, notes and messages.\n\nChanged your mind? Keep your account from Settings before then.`,
      details: [['Deleted on', day], ['Account', user.email]],
      cta: 'Keep my account', href: '/settings',
      footnote: 'Didn’t ask for this? Sign in, keep your account, then change your password.',
    }, 'system').catch(() => {});
    return { dueAt, needsAdmin: NEEDS_ADMIN.includes(user.role) };
  }

  async cancelDeletion(user: UserProfile) {
    await this.prisma.userProfile.update({ where: { id: user.id }, data: { deletionRequestedAt: null, deletionDueAt: null } });
    return { cancelled: true };
  }

  // ── Admin ────────────────────────────────────────────────

  async pending() {
    const rows = await this.prisma.userProfile.findMany({
      where: { deletionDueAt: { not: null }, deletedAt: null }, orderBy: { deletionDueAt: 'asc' },
      select: { id: true, email: true, name: true, firstName: true, lastName: true, role: true, deletionRequestedAt: true, deletionDueAt: true, wallet: { select: { balance: true, currency: true } } },
    });
    return rows.map(r => ({
      id: r.id, email: r.email, name: r.name || [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email, role: r.role,
      requestedAt: r.deletionRequestedAt, dueAt: r.deletionDueAt, needsAdmin: NEEDS_ADMIN.includes(r.role),
      balance: r.wallet ? { amount: r.wallet.balance, currency: r.wallet.currency } : null,
    }));
  }

  async finishByAdmin(id: string) {
    const u = await this.prisma.userProfile.findUnique({ where: { id }, include: { wallet: true } });
    if (!u || !u.deletionDueAt || u.deletedAt) throw new NotFoundException('No deletion request for this account');
    if (u.wallet && u.wallet.balance > 0) throw new BadRequestException('Pay out what they’re owed first, then delete.');
    await this.anonymise(id);
    return { deleted: true };
  }

  /** Every hour: delete student accounts whose 7 days are up. Staff accounts wait for an admin. */
  @Cron('15 * * * *')
  async runDue() {
    const due = await this.prisma.userProfile.findMany({
      where: { deletionDueAt: { lte: new Date() }, deletedAt: null, role: { notIn: [...NEEDS_ADMIN, 'ADMIN'] as any } }, select: { id: true },
    });
    for (const u of due) await this.anonymise(u.id).catch(err => this.logger.error(`Deletion of ${u.id} failed: ${err.message}`));
  }

  /**
   * Removes the person: name, contact details, photo, sign-in, progress, notes and community posts.
   * Payments, certificate records and messages stay (tax law, certificate checks and the message record need them), with no name attached.
   */
  async anonymise(id: string) {
    await this.prisma.$transaction(async tx => {
      await tx.lessonNote.deleteMany({ where: { studentId: id } });
      await tx.lessonBookmark.deleteMany({ where: { studentId: id } });
      await tx.studyBlock.deleteMany({ where: { studentId: id } });
      await tx.notification.deleteMany({ where: { userId: id } });
      await tx.questionProgress.deleteMany({ where: { studentId: id } });
      await tx.flashcardReview.deleteMany({ where: { studentId: id } });
      await tx.threadRead.deleteMany({ where: { userId: id } });
      await tx.lessonProgress.deleteMany({ where: { studentId: id } });
      await tx.testSession.deleteMany({ where: { studentId: id } });
      // Messages they sent stay, for the record; with the name gone below they read as from a deleted account
      await tx.courseDiscussionPost.updateMany({ where: { authorId: id }, data: { body: '(post deleted)' } });
      await tx.userProfile.update({
        where: { id },
        data: {
          email: `deleted-${id}@deleted.invalid`, name: null, firstName: null, lastName: null, phone: null, avatarUrl: null, bio: null,
          linkedinUrl: null, websiteUrl: null, videoIntroUrl: null, passwordHash: null, googleId: null, microsoftId: null, agreementIp: null,
          deletedAt: new Date(), deletionDueAt: null,
        },
      });
    }, { timeout: 30_000 });
    this.logger.log(`Account ${id} deleted`);
  }
}
