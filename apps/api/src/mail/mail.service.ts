import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';
import { minorToMajor } from '@cpa/shared';
import {
  otpTemplate,
  teacherApprovedTemplate,
  teacherRejectedTemplate,
  repAssignedTemplate,
  purchaseReceiptTemplate,
  welcomeStudentTemplate,
  welcomeTeacherTemplate,
  courseApprovedTemplate,
  reviewerAssignedTemplate,
  payoutInitiatedTemplate,
  payoutCompletedTemplate,
  expiryWarningTemplate,
  weeklyEarningsDigestTemplate,
  dailyAdminDigestTemplate,
  mentorshipBookingStudentTemplate,
  mentorshipBookingTeacherTemplate,
  mentorshipCancellationTemplate,
  assignmentGradedTemplate,
  certificateEarnedTemplate,
  liveSessionReminderTemplate,
  announcementTemplate,
  newMessageTemplate,
  orgSeatInviteTemplate,
  mockMarkedTemplate,
  classScheduledTemplate,
  passwordResetTemplate,
  adminCodeTemplate,
  orgAdminWelcomeTemplate,
  noticeTemplate,
  NoticeOpts,
  FOOTER_NOTE_SLOT,
} from './mail.templates';

/**
 * Who each kind of email comes from. Every address is a server setting (MAIL_FROM_…); one that isn't set falls back to
 * BREVO_SENDER_EMAIL (hello@), so a sender can be switched on once its mailbox exists. Replies go to `reply`.
 */
const SENDERS = {
  security:      { name: 'CareerPath Africa',        from: 'MAIL_FROM_NOREPLY',       reply: 'MAIL_FROM_HELLO',         note: 'You’re receiving this because a code or a change was requested on your CareerPath Africa account. If it wasn’t you, reply to this email.' },
  hello:         { name: 'CareerPath Africa',        from: 'MAIL_FROM_HELLO',         reply: 'MAIL_FROM_HELLO',         note: 'You’re receiving this because you have a CareerPath Africa account. Reply to this email with any questions.' },
  classes:       { name: 'CareerPath Classes',       from: 'MAIL_FROM_CLASSES',       reply: 'MAIL_FROM_CLASSES',       note: 'You’re receiving this because of a CareerPath class or mentoring session. Reply to reach our classes team.' },
  learning:      { name: 'CareerPath Learning',      from: 'MAIL_FROM_LEARNING',      reply: 'MAIL_FROM_LEARNING',      note: 'You’re receiving this because you’re studying on CareerPath Africa. Reply to reach our learning team.' },
  study:         { name: 'CareerPath Study',         from: 'MAIL_FROM_STUDY',         reply: 'MAIL_FROM_STUDY',         note: 'You’re receiving this because you’re preparing for an exam on CareerPath Africa. Reply to reach our study team.' },
  notifications: { name: 'CareerPath Notifications', from: 'MAIL_FROM_NOTIFICATIONS', reply: 'MAIL_FROM_NOTIFICATIONS', note: 'You’re receiving this because of activity on your CareerPath Africa account. Choose which emails you get in Email settings.' },
  teachers:      { name: 'CareerPath Teachers',      from: 'MAIL_FROM_TEACHERS',      reply: 'MAIL_FROM_TEACHERS',      note: 'You’re receiving this because you teach with CareerPath Africa. Reply to reach our teachers team.' },
  billing:       { name: 'CareerPath Billing',       from: 'MAIL_FROM_BILLING',       reply: 'MAIL_FROM_BILLING',       note: 'You’re receiving this because of a payment or payout on your CareerPath Africa account. Reply with any billing questions.' },
  payouts:       { name: 'CareerPath Africa Payouts', from: 'MAIL_FROM_PAYOUTS',     reply: 'MAIL_FROM_PAYOUTS',       note: 'You’re receiving this because of money paid out from your CareerPath Africa earnings. Reply with any payout questions.' },
  partnerships:  { name: 'CareerPath Partnerships',  from: 'MAIL_FROM_PARTNERS',      reply: 'MAIL_FROM_PARTNERS',      note: 'You’re receiving this because you partner with CareerPath Africa. Reply to reach our partnerships team.' },
  support:       { name: 'CareerPath Support',       from: 'MAIL_FROM_SUPPORT',       reply: 'MAIL_FROM_SUPPORT',       note: 'You’re receiving this about your CareerPath Africa account. Reply to reach our support team.' },
  reports:       { name: 'CareerPath Reports',       from: 'MAIL_FROM_NOREPLY',       reply: 'MAIL_FROM_HELLO',         note: 'Sent to CareerPath Africa administrators.' },
} as const;

export type SenderType = keyof typeof SENDERS;

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private client: BrevoClient | null = null;
  private senderEmail: string;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('BREVO_API_KEY', '');
    if (apiKey) {
      this.client = new BrevoClient({ apiKey });
    }
    this.senderEmail = this.config.getOrThrow<string>('BREVO_SENDER_EMAIL');
  }

  // ── Core send helper ─────────────────────────────────────

  /** A sender's address: its own setting, else the main sender (hello@) */
  // Payouts use their own address when one is set up, and the billing address until then
  private address(key: string) { return this.config.get<string>(key) || (key === 'MAIL_FROM_PAYOUTS' ? this.config.get<string>('MAIL_FROM_BILLING') : null) || this.senderEmail; }

  private async send(
    to: string,
    subject: string,
    htmlContent: string,
    senderType: SenderType = 'hello',
    attachments?: { name: string; content: string | Uint8Array }[],
  ): Promise<void> {
    // Reserved domains can never receive mail (test accounts, deleted accounts): sending only bounces
    if (/\.(test|invalid|example)$/i.test(to.trim())) { this.logger.log(`Mail to a reserved domain skipped: ${subject}`); return; }
    if (!this.client) {
      this.logger.warn(`[DEV] Mail skipped — no BREVO_API_KEY (${senderType})`);
      this.logger.debug(`  To:      ${to}`);
      this.logger.debug(`  Subject: ${subject}`);
      return;
    }

    try {
      const who = SENDERS[senderType] ?? SENDERS.hello;
      const res = await this.client.transactionalEmails.sendTransacEmail({
        sender: { name: who.name, email: this.address(who.from) },
        replyTo: { email: this.address(who.reply), name: who.name },
        to: [{ email: to }],
        subject,
        htmlContent: htmlContent.split(FOOTER_NOTE_SLOT).join(who.note),
        // Brevo takes attachments as base64
        ...(attachments?.length ? { attachment: attachments.map(a => ({ name: a.name, content: Buffer.from(a.content).toString('base64') })) } : {}),
      });
      this.logger.log(`[${who.name}] "${subject}" → ${to} | messageId: ${(res as any)?.messageId ?? 'n/a'}`);
    } catch (err: any) {
      this.logger.error(`Email failed: "${subject}" → ${to} | ${JSON.stringify(err?.response?.data ?? err?.message)}`);
    }
  }

  // ── System / Security ────────────────────────────────────

  async sendOtp(email: string, code: string): Promise<void> {
    await this.send(
      email,
      `${code} is your CareerPath Africa verification code`,
      otpTemplate(code), 'security',
    );
  }

  async sendAnnouncement(email: string, title: string, message: string): Promise<void> {
    await this.send(email, title, announcementTemplate(title, message), 'hello');
  }

  async sendNewMessage(email: string, fromName: string, preview: string, where: string | null, link: string, isVoice = false): Promise<void> {
    await this.send(email, `${fromName} sent you a ${isVoice ? 'voice note' : 'message'}${where ? ` in ${where}` : ''}`, newMessageTemplate(fromName, preview, where, link, isVoice), 'notifications');
  }

  async sendOrgSeatInvite(email: string, orgName: string, packageName: string, link: string, joinCode?: string | null): Promise<void> {
    await this.send(email, `${orgName} has a place for you on CareerPath Africa`, orgSeatInviteTemplate(orgName, packageName, link, joinCode), 'hello');
  }

  async sendPasswordReset(email: string, firstName: string, link: string): Promise<void> {
    // A code in the subject keeps each request its own email; otherwise Gmail stacks them into one
    // conversation and hides the newest button, so people open an older, expired link
    const code = Array.from({ length: 4 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    await this.send(email, `Reset your CareerPath Africa password · ${code}`, passwordResetTemplate(firstName, link, code), 'security');
  }

  async sendAdminCode(email: string, code: string): Promise<void> {
    await this.send(email, `${code} is your CareerPath admin sign-in code`, adminCodeTemplate(code), 'security');
  }

  async sendClassScheduled(email: string, o: { firstName: string; teacherName: string; cohortName: string; title: string; when: string; weeks: number; classLink: string; googleLink: string; ics: string }): Promise<void> {
    await this.send(email, `New live class: ${o.title} · ${o.when}`, classScheduledTemplate(o), 'classes', [{ name: 'careerpath-class.ics', content: o.ics }]);
  }

  async sendMockMarked(email: string, opts: { firstName: string; teacherName: string; examTitle: string; percent: number; passMark: number; link: string }): Promise<void> {
    await this.send(email, 'Your teacher marked your mock exam', mockMarkedTemplate(opts), 'study');
  }

  /** The short "something happened" emails that go with in-app notices */
  async sendNotice(email: string, subject: string, opts: NoticeOpts, sender: SenderType = 'notifications'): Promise<void> {
    await this.send(email, subject, noticeTemplate(opts), sender);
  }

  async sendOrgAdminWelcome(email: string, name: string, orgName: string, link: string): Promise<void> {
    await this.send(email, `Your ${orgName} school portal on CareerPath Africa`, orgAdminWelcomeTemplate(name, orgName, link), 'hello');
  }

  // ── Support / Onboarding ─────────────────────────────────

  async sendWelcomeStudent(email: string, firstName: string, studentNo?: string): Promise<void> {
    await this.send(
      email,
      'Welcome to CareerPath Africa, your account is ready',
      welcomeStudentTemplate(firstName, studentNo), 'hello',
    );
  }

  async sendWelcomeTeacher(email: string, firstName: string): Promise<void> {
    await this.send(
      email,
      'We’ve received your teacher application · CareerPath Africa',
      welcomeTeacherTemplate(firstName), 'hello',
    );
  }

  async sendTeacherApproved(email: string, decision: 'approve' | 'reject', rejectionReason?: string, teacherNo?: string): Promise<void> {
    if (decision === 'approve') {
      await this.send(
        email,
        'Your teacher application has been approved — CareerPath Africa',
        teacherApprovedTemplate(teacherNo), 'teachers',
      );
    } else {
      await this.send(
        email,
        'Update on your CareerPath Africa teacher application',
        teacherRejectedTemplate(rejectionReason),
        'support',
      );
    }
  }

  async sendCourseApproved(email: string, courseTitle: string): Promise<void> {
    await this.send(
      email,
      `Your course "${courseTitle}" is now live — CareerPath Africa`,
      courseApprovedTemplate(courseTitle), 'teachers',
    );
  }

  async sendExpiryWarning(email: string, packageName: string, daysLeft: number, expiresOn: string): Promise<void> {
    await this.send(
      email,
      `Your access expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} — ${packageName}`,
      expiryWarningTemplate(packageName, daysLeft, expiresOn), 'billing',
    );
  }

  // ── Partnerships ─────────────────────────────────────────

  async sendRepAssigned(email: string, countryName: string, currency: string): Promise<void> {
    await this.send(
      email,
      `You've been assigned as Country Rep for ${countryName} — CareerPath Africa`,
      repAssignedTemplate(countryName, currency), 'partnerships',
    );
  }

  async sendReviewerAssigned(email: string, courseTitle: string): Promise<void> {
    await this.send(
      email,
      `New review assignment: "${courseTitle}" — CareerPath Africa`,
      reviewerAssignedTemplate(courseTitle), 'partnerships',
    );
  }

  async sendWeeklyEarningsDigest(email: string, opts: Parameters<typeof weeklyEarningsDigestTemplate>[0]): Promise<void> {
    await this.send(
      email,
      `Your weekly earnings summary — ${opts.weekLabel}`,
      weeklyEarningsDigestTemplate(opts), 'partnerships',
    );
  }

  // ── Billing ──────────────────────────────────────────────

  async sendPurchaseReceipt(
    email: string,
    itemName: string,
    amount: number,
    currency: string,
    invoiceNo?: string,
    studentName?: string,
    itemType: 'package' | 'course' = 'package',
    receipt?: { filename: string; pdf: Uint8Array } | null,
  ): Promise<void> {
    const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minorToMajor(amount, currency));
    const subject = invoiceNo
      ? `Receipt ${invoiceNo}: ${itemName} — ${formatted}`
      : `Receipt: ${itemName} — ${formatted}`;
    const purchaseDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    await this.send(
      email,
      subject,
      purchaseReceiptTemplate(itemName, formatted, currency, invoiceNo, studentName, purchaseDate, itemType), 'billing',
      receipt ? [{ name: receipt.filename, content: receipt.pdf }] : undefined,
    );
  }

  // ── Mentorship ────────────────────────────────────────────

  async sendMentorshipBookingStudent(
    email: string,
    opts: Parameters<typeof mentorshipBookingStudentTemplate>[0],
  ): Promise<void> {
    await this.send(
      email,
      `Session confirmed with ${opts.teacherName} — ${opts.dateStr}`,
      mentorshipBookingStudentTemplate(opts), 'classes',
    );
  }

  async sendMentorshipBookingTeacher(
    email: string,
    opts: Parameters<typeof mentorshipBookingTeacherTemplate>[0],
  ): Promise<void> {
    await this.send(
      email,
      `New booking from ${opts.studentName} — ${opts.dateStr}`,
      mentorshipBookingTeacherTemplate(opts), 'classes',
    );
  }

  async sendMentorshipCancellation(
    email: string,
    name: string,
    otherPartyName: string,
    dateStr: string,
    timeStr: string,
    cancelledByRole: 'student' | 'teacher',
  ): Promise<void> {
    await this.send(
      email,
      `Mentorship session cancelled — ${dateStr}`,
      mentorshipCancellationTemplate(name, otherPartyName, dateStr, timeStr, cancelledByRole), 'classes',
    );
  }

  // ── Education ─────────────────────────────────────────────

  async sendAssignmentGraded(
    email: string,
    opts: Parameters<typeof assignmentGradedTemplate>[0],
  ): Promise<void> {
    const pct = Math.round((opts.grade / opts.maxPoints) * 100);
    await this.send(
      email,
      `Your assignment "${opts.assignmentTitle}" has been graded — ${pct}%`,
      assignmentGradedTemplate(opts), 'learning',
    );
  }

  async sendCertificateEarned(
    email: string,
    studentName: string,
    courseTitle: string,
    verifyUrl: string,
  ): Promise<void> {
    await this.send(
      email,
      `Certificate earned: ${courseTitle} — CareerPath Africa`,
      certificateEarnedTemplate(studentName, courseTitle, verifyUrl), 'learning',
    );
  }

  async sendLiveSessionReminder(
    email: string,
    name: string,
    courseTitle: string,
    startTimeStr: string,
    roomUrl: string,
    minutesBefore: number,
  ): Promise<void> {
    await this.send(
      email,
      `Reminder: "${courseTitle}" live class starts in ${minutesBefore} minutes`,
      liveSessionReminderTemplate(name, courseTitle, startTimeStr, roomUrl, minutesBefore), 'classes',
    );
  }

  async sendPayoutInitiated(
    email: string,
    amount: number,
    currency: string,
    periodLabel: string,
  ): Promise<void> {
    const formatted = new Intl.NumberFormat('en-US').format(minorToMajor(amount, currency));
    await this.send(
      email,
      `Payout initiated: ${currency} ${formatted} — CareerPath Africa`,
      payoutInitiatedTemplate(formatted, currency, periodLabel), 'payouts',
    );
  }

  async sendPayoutCompleted(email: string, amount: number, currency: string): Promise<void> {
    const formatted = new Intl.NumberFormat('en-US').format(minorToMajor(amount, currency));
    await this.send(
      email,
      `Payment confirmed: ${currency} ${formatted} sent — CareerPath Africa`,
      payoutCompletedTemplate(formatted, currency), 'payouts',
    );
  }

  async sendDailyAdminDigest(email: string, opts: Parameters<typeof dailyAdminDigestTemplate>[0]): Promise<void> {
    await this.send(
      email,
      `Daily ops summary — ${opts.date}`,
      dailyAdminDigestTemplate(opts), 'reports',
    );
  }
}
