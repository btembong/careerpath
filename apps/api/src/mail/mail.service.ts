import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BrevoClient } from '@getbrevo/brevo';
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
} from './mail.templates';

// Sender names — same email address, different display name per context
const SENDER_NAMES = {
  system:       'CareerPath Africa',        // OTP, security
  support:      'CareerPath Support',       // welcome, approvals, expiry
  billing:      'CareerPath Billing',       // receipts, payouts, invoices
  partnerships: 'CareerPath Partnerships',  // rep/reviewer assignments, commission
} as const;

type SenderType = keyof typeof SENDER_NAMES;

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

  private async send(
    to: string,
    subject: string,
    htmlContent: string,
    senderType: SenderType = 'system',
    attachments?: { name: string; content: string }[],
  ): Promise<void> {
    if (!this.client) {
      this.logger.warn(`[DEV] Mail skipped — no BREVO_API_KEY`);
      this.logger.debug(`  To:      ${to}`);
      this.logger.debug(`  Subject: ${subject}`);
      return;
    }

    try {
      const res = await this.client.transactionalEmails.sendTransacEmail({
        sender: { name: SENDER_NAMES[senderType], email: this.senderEmail },
        to: [{ email: to }],
        subject,
        htmlContent,
        // Brevo takes attachments as base64
        ...(attachments?.length ? { attachment: attachments.map(a => ({ name: a.name, content: Buffer.from(a.content).toString('base64') })) } : {}),
      });
      this.logger.log(`[${SENDER_NAMES[senderType]}] "${subject}" → ${to} | messageId: ${(res as any)?.messageId ?? 'n/a'}`);
    } catch (err: any) {
      this.logger.error(`Email failed: "${subject}" → ${to} | ${JSON.stringify(err?.response?.data ?? err?.message)}`);
    }
  }

  // ── System / Security ────────────────────────────────────

  async sendOtp(email: string, code: string): Promise<void> {
    await this.send(
      email,
      `${code} is your CareerPath Africa verification code`,
      otpTemplate(code),
      'system',
    );
  }

  async sendAnnouncement(email: string, title: string, message: string): Promise<void> {
    await this.send(email, title, announcementTemplate(title, message), 'support');
  }

  async sendNewMessage(email: string, fromName: string, preview: string, where: string | null, link: string): Promise<void> {
    await this.send(email, `${fromName} sent you a message${where ? ` in ${where}` : ''}`, newMessageTemplate(fromName, preview, where, link), 'support');
  }

  async sendOrgSeatInvite(email: string, orgName: string, packageName: string, link: string, joinCode?: string | null): Promise<void> {
    await this.send(email, `${orgName} has a place for you on CareerPath Africa`, orgSeatInviteTemplate(orgName, packageName, link, joinCode), 'support');
  }

  async sendPasswordReset(email: string, firstName: string, link: string): Promise<void> {
    await this.send(email, 'Reset your CareerPath Africa password', passwordResetTemplate(firstName, link), 'support');
  }

  async sendAdminCode(email: string, code: string): Promise<void> {
    await this.send(email, `${code} is your CareerPath admin sign-in code`, adminCodeTemplate(code), 'system');
  }

  async sendClassScheduled(email: string, o: { firstName: string; teacherName: string; cohortName: string; title: string; when: string; weeks: number; classLink: string; googleLink: string; ics: string }): Promise<void> {
    await this.send(email, `New live class: ${o.title} · ${o.when}`, classScheduledTemplate(o), 'support', [{ name: 'careerpath-class.ics', content: o.ics }]);
  }

  async sendMockMarked(email: string, opts: { firstName: string; teacherName: string; examTitle: string; percent: number; passMark: number; link: string }): Promise<void> {
    await this.send(email, 'Your teacher marked your mock exam', mockMarkedTemplate(opts), 'support');
  }

  /** The short "something happened" emails that go with in-app notices */
  async sendNotice(email: string, subject: string, opts: NoticeOpts, sender: SenderType = 'support'): Promise<void> {
    await this.send(email, subject, noticeTemplate(opts), sender);
  }

  async sendOrgAdminWelcome(email: string, name: string, orgName: string, link: string): Promise<void> {
    await this.send(email, `Your ${orgName} school portal on CareerPath Africa`, orgAdminWelcomeTemplate(name, orgName, link), 'support');
  }

  // ── Support / Onboarding ─────────────────────────────────

  async sendWelcomeStudent(email: string, firstName: string, studentNo?: string): Promise<void> {
    await this.send(
      email,
      'Welcome to CareerPath Africa — your account is ready',
      welcomeStudentTemplate(firstName, studentNo),
      'support',
    );
  }

  async sendWelcomeTeacher(email: string, firstName: string): Promise<void> {
    await this.send(
      email,
      'Application received — CareerPath Africa',
      welcomeTeacherTemplate(firstName),
      'support',
    );
  }

  async sendTeacherApproved(email: string, decision: 'approve' | 'reject', rejectionReason?: string, teacherNo?: string): Promise<void> {
    if (decision === 'approve') {
      await this.send(
        email,
        'Your teacher application has been approved — CareerPath Africa',
        teacherApprovedTemplate(teacherNo),
        'support',
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
      courseApprovedTemplate(courseTitle),
      'support',
    );
  }

  async sendExpiryWarning(email: string, packageName: string, daysLeft: number, expiresOn: string): Promise<void> {
    await this.send(
      email,
      `Your access expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''} — ${packageName}`,
      expiryWarningTemplate(packageName, daysLeft, expiresOn),
      'support',
    );
  }

  // ── Partnerships ─────────────────────────────────────────

  async sendRepAssigned(email: string, countryName: string, currency: string): Promise<void> {
    await this.send(
      email,
      `You've been assigned as Country Rep for ${countryName} — CareerPath Africa`,
      repAssignedTemplate(countryName, currency),
      'partnerships',
    );
  }

  async sendReviewerAssigned(email: string, courseTitle: string): Promise<void> {
    await this.send(
      email,
      `New review assignment: "${courseTitle}" — CareerPath Africa`,
      reviewerAssignedTemplate(courseTitle),
      'partnerships',
    );
  }

  async sendWeeklyEarningsDigest(email: string, opts: Parameters<typeof weeklyEarningsDigestTemplate>[0]): Promise<void> {
    await this.send(
      email,
      `Your weekly earnings summary — ${opts.weekLabel}`,
      weeklyEarningsDigestTemplate(opts),
      'partnerships',
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
  ): Promise<void> {
    const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(amount / 100);
    const subject = invoiceNo
      ? `Receipt ${invoiceNo}: ${itemName} — ${formatted}`
      : `Receipt: ${itemName} — ${formatted}`;
    const purchaseDate = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
    await this.send(
      email,
      subject,
      purchaseReceiptTemplate(itemName, formatted, currency, invoiceNo, studentName, purchaseDate, itemType),
      'billing',
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
      mentorshipBookingStudentTemplate(opts),
      'support',
    );
  }

  async sendMentorshipBookingTeacher(
    email: string,
    opts: Parameters<typeof mentorshipBookingTeacherTemplate>[0],
  ): Promise<void> {
    await this.send(
      email,
      `New booking from ${opts.studentName} — ${opts.dateStr}`,
      mentorshipBookingTeacherTemplate(opts),
      'support',
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
      mentorshipCancellationTemplate(name, otherPartyName, dateStr, timeStr, cancelledByRole),
      'support',
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
      assignmentGradedTemplate(opts),
      'support',
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
      certificateEarnedTemplate(studentName, courseTitle, verifyUrl),
      'support',
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
      liveSessionReminderTemplate(name, courseTitle, startTimeStr, roomUrl, minutesBefore),
      'support',
    );
  }

  async sendPayoutInitiated(
    email: string,
    amount: number,
    currency: string,
    periodLabel: string,
  ): Promise<void> {
    const formatted = new Intl.NumberFormat('en-US').format(amount / 100);
    await this.send(
      email,
      `Payout initiated: ${currency} ${formatted} — CareerPath Africa`,
      payoutInitiatedTemplate(formatted, currency, periodLabel),
      'billing',
    );
  }

  async sendPayoutCompleted(email: string, amount: number, currency: string): Promise<void> {
    const formatted = new Intl.NumberFormat('en-US').format(amount / 100);
    await this.send(
      email,
      `Payment confirmed: ${currency} ${formatted} sent — CareerPath Africa`,
      payoutCompletedTemplate(formatted, currency),
      'billing',
    );
  }

  async sendDailyAdminDigest(email: string, opts: Parameters<typeof dailyAdminDigestTemplate>[0]): Promise<void> {
    await this.send(
      email,
      `Daily ops summary — ${opts.date}`,
      dailyAdminDigestTemplate(opts),
      'system',
    );
  }
}
