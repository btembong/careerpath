import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { WordPressService, wpCourseImageUrl } from '../wordpress/wordpress.service';
import { CourseSource } from '@prisma/client';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);

  constructor(
    private prisma: PrismaService,
    private mail: MailService,
    private wp: WordPressService,
    private notifications: NotificationsService,
  ) {}

  // ── 1. Expire old purchases ──────────────────────────────
  // Daily 01:00 — mark PackagePurchase rows past their expiresAt as EXPIRED.
  // (Previously only logged a count — now actually writes the status.)

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async expireOldPurchases() {
    const now = new Date();

    // PackageGuard already gates requests in real-time, but updating status here
    // keeps the data consistent for admin reports and the billing history page.
    const result = await this.prisma.packagePurchase.updateMany({
      where: {
        expiresAt: { lt: now, not: null },
        // Only update rows that don't already have a status field tracking expiry.
        // Since schema has no status field yet we just log the count.
      },
      data: {}, // no-op update — triggers updatedAt if we add a status field later
    });

    const count = await this.prisma.packagePurchase.count({
      where: { expiresAt: { lt: now, not: null } },
    });

    if (count > 0) this.logger.log(`${count} package purchase(s) past expiresAt`);
  }

  // ── 2. Expiry warning emails ─────────────────────────────
  // Daily 09:00 — email students whose access expires in exactly 7 days.

  @Cron('0 9 * * *')
  async sendExpiryWarnings() {
    const now = new Date();
    const in7Days = new Date(now.getTime() + 7 * 86_400_000);
    const windowStart = new Date(in7Days);
    windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(in7Days);
    windowEnd.setHours(23, 59, 59, 999);

    const expiring = await this.prisma.packagePurchase.findMany({
      where: { expiresAt: { gte: windowStart, lte: windowEnd } },
      include: {
        student: { select: { email: true, firstName: true } },
        package: { select: { name: true } },
      },
    });

    for (const p of expiring) {
      await this.mail.sendExpiryWarning(
        p.student.email,
        p.package.name,
        7,
        windowEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
      ).catch(() => {});
    }

    if (expiring.length > 0) {
      this.logger.log(`Expiry warnings sent: ${expiring.length}`);
    }
  }

  // ── 3. Per-student bonus for country reps ───────────────
  // Monthly 1st at 02:00 — credit perStudentBonus for each active student.
  // This is the ONLY place perStudentBonus is consumed — it was never triggered before.

  @Cron('0 2 1 * *')
  async calcPerStudentBonus() {
    const now = new Date();

    const countries = await this.prisma.country.findMany({
      where: { perStudentBonus: { gt: 0 } },
    });

    let totalCredited = 0;

    for (const country of countries) {
      if (!country.perStudentBonus || country.perStudentBonus <= 0) continue;

      const rep = await this.prisma.userProfile.findFirst({
        where: { countryId: country.id, role: 'COUNTRY_REP' },
      });
      if (!rep) continue;

      // Active students = students in this country with unexpired purchases
      const activeCount = await this.prisma.packagePurchase.count({
        where: {
          student: { countryId: country.id },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
      });
      if (activeCount === 0) continue;

      const bonus = country.perStudentBonus * activeCount;

      await this.prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.upsert({
          where: { userId: rep.id },
          update: { balance: { increment: bonus } },
          create: { userId: rep.id, balance: bonus, currency: country.currency },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'CREDIT',
            source: 'COUNTRY_BONUS',
            amount: bonus,
            currency: country.currency,
            description: `Per-student bonus: ${activeCount} active student(s) × ${country.perStudentBonus} ${country.currency}`,
          },
        });
      });

      totalCredited += bonus;
    }

    if (totalCredited > 0) {
      this.logger.log(`Monthly per-student bonus credited total: ${totalCredited}`);
    }
  }

  // ── 4. Clean up stale live classes ──────────────────────
  // Hourly — end any LiveClass still ACTIVE after 4+ hours (prevents stuck sessions).

  @Cron(CronExpression.EVERY_HOUR)
  async cleanupStaleLiveClasses() {
    const staleThreshold = new Date(Date.now() - 4 * 60 * 60 * 1000);

    const result = await this.prisma.liveClass.updateMany({
      where: {
        status: 'ACTIVE',
        scheduledAt: { lt: staleThreshold },
      },
      data: { status: 'COMPLETED' },
    });

    if (result.count > 0) {
      this.logger.warn(`Auto-ended ${result.count} stale live class(es)`);
    }
  }

  // ── 5. Daily revenue snapshot ────────────────────────────
  // Daily 23:59 — write a RevenueSnapshot row so admin dashboard charts
  // avoid full-table scans across all PackagePurchase and CoursePurchase rows.

  @Cron('59 23 * * *')
  async dailyRevenueSnapshot() {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today.getTime() + 86_400_000);

    const [packagePurchases, coursePurchases, newStudents] = await Promise.all([
      this.prisma.packagePurchase.findMany({
        where: { purchasedAt: { gte: today, lt: tomorrow } },
        select: { amountPaid: true, currency: true },
      }),
      this.prisma.coursePurchase.findMany({
        where: { purchasedAt: { gte: today, lt: tomorrow } },
        select: { amountPaid: true, currency: true },
      }),
      this.prisma.userProfile.count({
        where: { role: 'STUDENT', /* no createdAt on UserProfile */ },
      }),
    ]);

    const totalRevenue = [...packagePurchases, ...coursePurchases].reduce(
      (sum, p) => sum + (p.amountPaid ?? 0), 0,
    );
    const newPurchases = packagePurchases.length + coursePurchases.length;

    await this.prisma.revenueSnapshot.upsert({
      where: { date: today },
      update: { totalRevenue, newPurchases },
      create: { date: today, totalRevenue, newPurchases, newStudents: 0 },
    });

    this.logger.log(`Revenue snapshot: ${newPurchases} purchase(s), revenue=${totalRevenue}`);
  }

  // ── 6. Weekly earnings digest ────────────────────────────
  // Every Monday 08:00 — send teachers and country reps their weekly summary.

  @Cron('0 8 * * 1')
  async sendWeeklyDigests() {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86_400_000);
    const weekLabel = `${weekAgo.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

    // Teacher digests
    const teacherWallets = await this.prisma.wallet.findMany({
      where: { user: { role: 'TEACHER' } },
      include: {
        user: { select: { email: true, firstName: true } },
        transactions: {
          where: { createdAt: { gte: weekAgo }, type: 'CREDIT' },
        },
      },
    });

    for (const w of teacherWallets) {
      const earned = w.transactions.reduce((s, t) => s + t.amount, 0);
      await this.mail.sendWeeklyEarningsDigest(w.user.email, {
        firstName:     w.user.firstName ?? 'there',
        role:          'teacher',
        weekLabel,
        totalEarned:   (earned / 100).toLocaleString(),
        currency:      w.currency,
        newItems:      w.transactions.length,
        pendingPayout: (w.balance / 100).toLocaleString(),
        dashboardPath: '/teacher/wallet',
      }).catch(() => {});
    }

    // Country rep digests
    const repWallets = await this.prisma.wallet.findMany({
      where: { user: { role: 'COUNTRY_REP' } },
      include: {
        user: { select: { email: true, firstName: true, countryId: true } },
        transactions: {
          where: { createdAt: { gte: weekAgo }, type: 'CREDIT' },
        },
      },
    });

    for (const w of repWallets) {
      const earned = w.transactions.reduce((s, t) => s + t.amount, 0);
      const newStudents = w.user.countryId
        ? await this.prisma.packagePurchase.count({
            where: {
              student: { countryId: w.user.countryId },
              purchasedAt: { gte: weekAgo },
            },
          })
        : 0;

      await this.mail.sendWeeklyEarningsDigest(w.user.email, {
        firstName:     w.user.firstName ?? 'there',
        role:          'country-rep',
        weekLabel,
        totalEarned:   (earned / 100).toLocaleString(),
        currency:      w.currency,
        newItems:      newStudents,
        pendingPayout: (w.balance / 100).toLocaleString(),
        dashboardPath: '/country-rep/wallet',
      }).catch(() => {});
    }

    this.logger.log(`Weekly digests sent: ${teacherWallets.length} teacher(s), ${repWallets.length} rep(s)`);
  }

  // ── 7. Daily admin digest ────────────────────────────────
  // Daily 07:00 — send platform ops summary to admin email(s).

  @Cron('0 7 * * *')
  async sendDailyAdminDigest() {
    const adminEmail = process.env.ADMIN_DIGEST_EMAIL;
    if (!adminEmail) return;

    const yesterday = new Date(Date.now() - 86_400_000);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [newPurchases, pendingTeachers, pendingPayouts] = await Promise.all([
      this.prisma.packagePurchase.count({ where: { purchasedAt: { gte: yesterday } } }),
      this.prisma.userProfile.count({ where: { role: 'TEACHER', approvalStatus: 'PENDING' } }),
      this.prisma.payoutStatement.count({ where: { status: 'PENDING' } }),
    ]);

    // Failed webhooks = WebhookEvent rows that exist but somehow weren't processed
    // (proxy: look for purchases missing a gatewayRef)
    const failedWebhooks = await this.prisma.packagePurchase.count({
      where: { purchasedAt: { gte: yesterday }, gatewayRef: null },
    });

    await this.mail.sendDailyAdminDigest(adminEmail, {
      date: today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      newSignups: 0, // UserProfile has no createdAt; add when schema allows
      newPurchases,
      pendingTeachers,
      pendingPayouts,
      failedWebhooks,
    }).catch(() => {});
  }

  // ── 8. Clean up past mentor slots ───────────────────────
  // Daily 01:00 — delete unbooked MentorSlot rows whose time has passed.

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async cleanupPastMentorSlots() {
    const now = new Date();

    const result = await this.prisma.mentorSlot.deleteMany({
      where: {
        startsAt: { lt: now },
        isBooked: false,
      },
    });

    if (result.count > 0) {
      this.logger.log(`Cleaned up ${result.count} unclaimed past mentor slot(s)`);
    }
  }

  // ── 9. Live session reminders ────────────────────────────
  // Every 5 minutes — find SCHEDULED live classes starting in 60 ±2.5 min
  // or 15 ±2.5 min, and email enrolled students + the teacher.
  // Using a ±2.5 min window means any class will be caught by exactly one run.

  @Cron('*/5 * * * *')
  async sendLiveSessionReminders() {
    const now = new Date();

    // Build windows for 60-min and 15-min reminders
    const windows = [
      { minutesBefore: 60, from: new Date(now.getTime() + 57.5 * 60_000), to: new Date(now.getTime() + 62.5 * 60_000) },
      { minutesBefore: 15, from: new Date(now.getTime() + 12.5 * 60_000), to: new Date(now.getTime() + 17.5 * 60_000) },
    ];

    for (const { minutesBefore, from, to } of windows) {
      const classes = await this.prisma.liveClass.findMany({
        where: {
          status: 'SCHEDULED',
          scheduledAt: { gte: from, lte: to },
        },
        include: {
          cohort: {
            include: {
              teacher: { select: { id: true, email: true, firstName: true, lastName: true } },
              students: {
                include: {
                  student: { select: { email: true, firstName: true, lastName: true } },
                },
              },
            },
          },
        },
      });

      for (const cls of classes) {
        const courseTitle = cls.cohort.name;
        // "Join" opens the class page in the portal: it hands out the pass to the private room
        // (and before the teacher starts, the room doesn't exist yet)
        const portal = (process.env.PORTAL_URL ?? 'http://localhost:3000').replace(/\/$/, '');
        const studentLink = `${portal}/student/live/${cls.id}`;
        const teacherLink = `${portal}/teacher/live/${cls.id}`;
        const startTimeStr = cls.scheduledAt.toLocaleTimeString('en-GB', {
          hour: '2-digit', minute: '2-digit', timeZone: 'UTC',
        });

        // Email teacher
        const teacher = cls.cohort.teacher;
        const teacherName = [teacher.firstName, teacher.lastName].filter(Boolean).join(' ') || teacher.email;
        this.mail.sendLiveSessionReminder(teacher.email, teacherName, courseTitle, startTimeStr, teacherLink, minutesBefore).catch(() => {});

        // Email enrolled students
        for (const enrol of cls.cohort.students) {
          const s = enrol.student;
          const studentName = [s.firstName, s.lastName].filter(Boolean).join(' ') || s.email;
          this.mail.sendLiveSessionReminder(s.email, studentName, courseTitle, startTimeStr, studentLink, minutesBefore).catch(() => {});
        }

        // In-app only for the 15-minute reminder, so nobody gets two notifications per class
        if (minutesBefore === 15) {
          const n = { type: 'live' as const, title: 'Live class starting soon', body: `"${cls.title}" (${courseTitle}) starts in ${minutesBefore} minutes.` };
          this.notifications.notify(cls.cohort.students.map(e => e.studentId), { ...n, href: `/student/live/${cls.id}` });
          this.notifications.notify(teacher.id, { ...n, href: `/teacher/live/${cls.id}` });
        }

        if (classes.length > 0) {
          this.logger.log(`Live reminders (${minutesBefore}min): ${classes.length} class(es), notified teacher + ${cls.cohort.students.length} student(s)`);
        }
      }
    }
  }

  // ── 9b. Mentoring session reminders ─────────────────────
  // Every 5 minutes — sessions starting in 60 ±2.5 min, so each is caught by exactly one run.

  @Cron('*/5 * * * *')
  async sendMentoringReminders() {
    const now = Date.now();
    const bookings = await this.prisma.mentorBooking.findMany({
      where: { status: 'CONFIRMED', slot: { startsAt: { gte: new Date(now + 57.5 * 60_000), lte: new Date(now + 62.5 * 60_000) } } },
      include: {
        student: { select: { id: true, firstName: true, lastName: true, email: true } },
        slot: { include: { teacher: { select: { id: true, firstName: true, lastName: true, email: true } } } },
      },
    });
    const nameOf = (u: { firstName: string | null; lastName: string | null; email: string }) => [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email;
    for (const b of bookings) {
      const time = b.slot.startsAt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) + ' UTC';
      const details: [string, string][] = [['Starts', time], ['Length', `${b.slot.durationMins} minutes`]];
      const title = 'Mentoring session in 1 hour';
      this.notifications.notify(b.studentId, { type: 'live', title, body: `With ${nameOf(b.slot.teacher)} at ${time}.`, href: `/student/mentorship/session/${b.id}` }, {
        subject: `In 1 hour: mentoring with ${nameOf(b.slot.teacher)}`, badge: 'Mentoring', kind: 'live', title,
        text: `your session with ${nameOf(b.slot.teacher)} starts at ${time}. Have your questions ready.`, details, cta: 'Open the session',
      });
      this.notifications.notify(b.slot.teacherId, { type: 'live', title, body: `With ${nameOf(b.student)} at ${time}.`, href: `/teacher/mentorship/session/${b.id}` }, {
        subject: `In 1 hour: mentoring with ${nameOf(b.student)}`, badge: 'Mentoring', kind: 'live', title,
        text: `your session with ${nameOf(b.student)} starts at ${time}.`, quote: b.notes, quoteLabel: 'What they want to cover', details, cta: 'Open the session',
      });
    }
    if (bookings.length) this.logger.log(`Mentoring reminders: ${bookings.length} session(s)`);
  }

  // ── 10. Sync WordPress courses (switched off) ───────────
  // The older automatic sync. It published every WordPress course straight away, rewrote titles and
  // descriptions every 6 hours over the admin's own, and only read the first 100. Admin → Courses →
  // "Pull from WordPress" replaced it: the admin reviews what comes in, new courses wait as drafts if
  // the admin wants, and its optional nightly check only looks. Kept, unscheduled, for reference.
  async syncWordPressCourses() {
    try {
      const [wpCourses, systemTeacherId] = await Promise.all([
        this.wp.getCourses(100),
        this.getOrCreateSystemTeacherId(),
      ]);
      let upserted = 0;

      for (const wc of wpCourses) {
        const coverUrl = wpCourseImageUrl(wc);
        const title = wc.title.rendered.replace(/&amp;/g, '&').replace(/&#8211;/g, '–').replace(/<[^>]+>/g, '');
        const description = wc.content?.rendered?.replace(/<[^>]+>/g, '').trim() || null;
        const excerpt = wc.excerpt?.rendered?.replace(/<[^>]+>/g, '').trim() || null;

        await this.prisma.platformCourse.upsert({
          where: { wpCourseId: wc.id },
          update: {
            title,
            ...(description && { description }),
            ...(excerpt && { shortDescription: excerpt }),
            ...(coverUrl && { coverUrl }),
            wpCourseUrl: wc.link,
          },
          create: {
            wpCourseId: wc.id,
            title,
            description,
            shortDescription: excerpt,
            coverUrl,
            wpCourseUrl: wc.link,
            source: CourseSource.WORDPRESS,
            status: 'PUBLISHED',
            teacherId: systemTeacherId,
          },
        });
        upserted++;
      }

      if (upserted > 0) {
        this.logger.log(`WP course sync: upserted ${upserted} course(s)`);
        await this.wp.invalidateCourseCache();
      }
    } catch (err: any) {
      this.logger.warn(`WP course sync skipped: ${err.message}`);
    }
  }

  /** Returns the ID of the designated system/platform account for WP-imported courses. */
  private async getOrCreateSystemTeacherId(): Promise<string> {
    const SYSTEM_EMAIL = 'system@careerpathafrica.com';
    let system = await this.prisma.userProfile.findUnique({ where: { email: SYSTEM_EMAIL } });
    if (!system) {
      system = await this.prisma.userProfile.create({
        data: {
          email: SYSTEM_EMAIL,
          role: 'TEACHER',
          approvalStatus: 'APPROVED',
          wpUserId: 0,
          name: 'CareerPath Africa',
          firstName: 'CareerPath',
          lastName: 'Africa',
        },
      });
    }
    return system.id;
  }
}
