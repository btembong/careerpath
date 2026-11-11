import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { WordPressService } from '../wordpress/wordpress.service';
import { CouponsService } from '../coupons/coupons.service';
import { MailService } from '../mail/mail.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GamificationService } from '../gamification/gamification.service';
import { PaystackGateway } from './gateways/paystack.gateway';
import { TranzakGateway } from './gateways/tranzak.gateway';
import { StripeGateway } from './gateways/stripe.gateway';
import { BillingService } from './billing.service';
import {
  PaymentGateway,
  PurchaseCompletedEvent,
  WebhookEvent,
  PAYSTACK_CURRENCIES,
  TRANZAK_CURRENCIES,
  STRIPE_CURRENCIES,
} from './gateways/gateway.interface';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { UserProfile } from '@prisma/client';

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private wp: WordPressService,
    private coupons: CouponsService,
    private paystack: PaystackGateway,
    private tranzak: TranzakGateway,
    private stripeGw: StripeGateway,
    private mail: MailService,
    private notifications: NotificationsService,
    private gamification: GamificationService,
    private billing: BillingService,
  ) {}

  /** The PDF receipt for a purchase, to attach to the receipt email (null if it can't be made) */
  private receiptPdf(studentId: string, kind: 'package' | 'course', id?: string) {
    if (!id) return Promise.resolve(null);
    return this.billing.receipt(studentId, kind, id).catch(err => {
      this.logger.warn(`Receipt PDF for ${kind} ${id} failed: ${err?.message}`);
      return null;
    });
  }

  // ── Checkout session ─────────────────────────────────────

  async createCheckoutSession(student: UserProfile, dto: CreateCheckoutDto) {
    const pkg = await this.prisma.package.findUnique({ where: { id: dto.packageId } });
    if (!pkg || !pkg.isPublished) throw new NotFoundException('Package not found or not available');

    let finalAmount = pkg.priceAmount;
    let couponId: string | undefined;

    // Coupon is always applied server-side — never trust a client-calculated total
    if (dto.couponCode) {
      const applied = await this.coupons.applyToPackage(dto.couponCode, pkg);
      finalAmount = applied.discountedPrice;
      couponId = applied.couponId;
    }

    // Gateway is selected automatically by the package's currency
    const gateway = this.gatewayForCurrency(pkg.currency);
    const portalUrl = this.config.get<string>('PORTAL_URL', 'http://localhost:3000');

    // ── Tranzak: pre-create a TranzakSession to carry metadata ──────────────
    // Tranzak has no customData field — we store studentId/packageId/couponId
    // keyed by a UUID that we send as mchTransactionRef.
    let tranzakSessionId: string | undefined;
    if (TRANZAK_CURRENCIES.has(pkg.currency.toUpperCase())) {
      const tzSession = await this.prisma.tranzakSession.create({
        data: { studentId: student.id, packageId: pkg.id, couponId: couponId ?? null, amount: finalAmount, currency: pkg.currency },
      });
      tranzakSessionId = tzSession.id;
    }

    const session = await gateway.createCheckoutSession({
      packageId: pkg.id,
      itemName: pkg.name,
      amount: finalAmount,
      currency: pkg.currency,
      studentEmail: student.email,
      studentId: student.id,
      couponId,
      successUrl: `${portalUrl}/packages/success`,
      cancelUrl: `${portalUrl}/packages?purchase=cancelled`,
      mobileWalletNumber: dto.mobileWalletNumber,
      tranzakSessionId,
    });

    // Save Tranzak requestId back to the session record (non-critical)
    if (tranzakSessionId && session.sessionId) {
      await this.prisma.tranzakSession
        .update({ where: { id: tranzakSessionId }, data: { requestId: session.sessionId } })
        .catch(err => this.logger.warn('Failed to update TranzakSession.requestId', err?.message));
    }
    await this.recordAttempt({ studentId: student.id, kind: 'package', packageId: pkg.id, title: pkg.name, amount: finalAmount, currency: pkg.currency, gateway: session.gateway, sessionId: session.sessionId, tranzakSessionId, couponId });

    return {
      url: session.url,
      sessionId: session.sessionId,
      gateway: session.gateway,
      accessCode: session.accessCode,
      ussdPush: session.ussdPush ?? false,
    };
  }

  // ── Individual course checkout ────────────────────────────

  async createCourseCheckoutSession(
    student: UserProfile,
    courseId: string,
    couponCode?: string,
    mobileWalletNumber?: string,
  ) {
    const course = await this.prisma.platformCourse.findUnique({ where: { id: courseId } });
    if (!course || course.status !== 'PUBLISHED') throw new NotFoundException('Course not found or not available');
    if (!course.isSoldIndividually || !course.priceAmount || !course.priceCurrency) {
      throw new BadRequestException('This course is not available for individual purchase');
    }

    // Prevent double purchase — an expired purchase can be renewed
    const already = await this.prisma.coursePurchase.findUnique({
      where: { studentId_courseId: { studentId: student.id, courseId } },
    });
    if (already && (!already.expiresAt || already.expiresAt > new Date())) throw new BadRequestException('You already have access to this course');

    let finalAmount = course.priceAmount;
    let couponId: string | undefined;

    if (couponCode) {
      const applied = await this.coupons.applyToCourse(couponCode, course);
      finalAmount = applied.discountedPrice;
      couponId = applied.couponId;
    }

    const gateway = this.gatewayForCurrency(course.priceCurrency);
    const portalUrl = this.config.get<string>('PORTAL_URL', 'http://localhost:3000');

    // ── Tranzak: pre-create a TranzakSession for course checkout ────────────
    let tranzakSessionId: string | undefined;
    if (TRANZAK_CURRENCIES.has(course.priceCurrency.toUpperCase())) {
      const tzSession = await this.prisma.tranzakSession.create({
        data: { studentId: student.id, courseId: course.id, couponId: couponId ?? null, amount: finalAmount, currency: course.priceCurrency },
      });
      tranzakSessionId = tzSession.id;
    }

    const session = await gateway.createCheckoutSession({
      courseId: course.id,
      itemName: course.title,
      amount: finalAmount,
      currency: course.priceCurrency,
      studentEmail: student.email,
      studentId: student.id,
      couponId,
      successUrl: `${portalUrl}/student/courses/success?courseId=${course.id}`,
      cancelUrl: `${portalUrl}/student/catalogue`,
      mobileWalletNumber,
      tranzakSessionId,
    });

    if (tranzakSessionId && session.sessionId) {
      await this.prisma.tranzakSession
        .update({ where: { id: tranzakSessionId }, data: { requestId: session.sessionId } })
        .catch(err => this.logger.warn('Failed to update TranzakSession.requestId', err?.message));
    }
    await this.recordAttempt({ studentId: student.id, kind: 'course', courseId: course.id, title: course.title, amount: finalAmount, currency: course.priceCurrency, gateway: session.gateway, sessionId: session.sessionId, tranzakSessionId, couponId });

    return {
      url: session.url,
      sessionId: session.sessionId,
      gateway: session.gateway,
      accessCode: session.accessCode,
      ussdPush: session.ussdPush ?? false,
    };
  }

  // ── Webhooks ─────────────────────────────────────────────

  async handlePaystackWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const event = this.paystack.verifyWebhookSignature(rawBody, signature);
    await this.processWebhookEvent(event, this.paystack);
  }

  async handleTranzakWebhook(rawBody: Buffer): Promise<void> {
    const event = this.tranzak.verifyWebhookSignature(rawBody);
    await this.processWebhookEvent(event, this.tranzak);
  }

  async handleStripeWebhook(rawBody: Buffer, signature: string): Promise<void> {
    const event = this.stripeGw.verifyWebhookSignature(rawBody, signature);
    await this.processWebhookEvent(event, this.stripeGw);
  }

  private async processWebhookEvent(event: WebhookEvent, gateway: PaymentGateway): Promise<void> {
    await this.completeFromEvent(event, gateway);
  }

  /**
   * Turn a confirmed payment (from a webhook, or from asking the gateway directly) into access.
   * Safe to call twice for the same payment: the second call changes nothing.
   * Returns false when the event isn't a completed purchase.
   */
  async completeFromEvent(event: WebhookEvent, gateway: PaymentGateway): Promise<boolean> {
    let purchase = gateway.extractPurchaseCompleted(event);
    if (!purchase) return false;

    // ── Tranzak: resolve purchase metadata from TranzakSession ───────────────
    // Tranzak has no customData — we stored studentId/packageId/courseId/couponId
    // in a TranzakSession keyed by mchTransactionRef (= purchase.tranzakSessionId).
    if (event.gateway === 'tranzak' && purchase.tranzakSessionId) {
      const tzSession = await this.prisma.tranzakSession.findUnique({
        where: { id: purchase.tranzakSessionId },
      });
      if (!tzSession) {
        this.logger.error(
          'Tranzak webhook: TranzakSession not found for mchTransactionRef',
          purchase.tranzakSessionId,
        );
        return false;
      }
      purchase = {
        ...purchase,
        studentId:  tzSession.studentId,
        packageId:  tzSession.packageId  ?? undefined,
        courseId:   tzSession.courseId   ?? undefined,
        couponId:   tzSession.couponId   ?? undefined,
        amountPaid: tzSession.amount,  // use stored amount (authoritative)
        currency:   tzSession.currency,
      };
    }

    // ── Webhook idempotency guard ─────────────────────────────────────────────
    // Gateways retry on network failure — deduplicate using the event's unique ID.
    const eventId = purchase.sessionId;
    if (eventId) {
      const gatewayName = event.gateway;
      try {
        await this.prisma.webhookEvent.create({
          data: { gateway: gatewayName, eventId },
        });
      } catch {
        // Unique constraint violation → already processed → skip
        this.logger.warn(`Duplicate webhook ignored: ${gatewayName}/${eventId}`);
        await this.markAttemptPaid(purchase.sessionId, purchase.tranzakSessionId);
        return true;
      }
    }

    if (purchase.courseId) {
      await this.fulfillCoursePurchase(purchase);
    } else {
      await this.fulfillPurchase(purchase);
    }
    await this.markAttemptPaid(purchase.sessionId, purchase.tranzakSessionId);
    return true;
  }

  // ── Payment attempts ─────────────────────────────────────

  private async recordAttempt(a: { studentId: string; kind: 'package' | 'course'; packageId?: string; courseId?: string; title: string; amount: number; currency: string; gateway: string; sessionId?: string | null; tranzakSessionId?: string; couponId?: string }) {
    await this.prisma.paymentAttempt.create({
      data: { ...a, sessionId: a.sessionId || null, tranzakSessionId: a.tranzakSessionId ?? null, couponId: a.couponId ?? null },
    }).catch(err => this.logger.warn('Could not record payment attempt', err?.message));
  }

  /** Link the attempt to the purchase it became */
  private async markAttemptPaid(sessionId?: string, tranzakSessionId?: string) {
    const ors = [sessionId ? { sessionId } : null, tranzakSessionId ? { tranzakSessionId } : null].filter(Boolean) as object[];
    if (!ors.length) return;
    const attempt = await this.prisma.paymentAttempt.findFirst({ where: { OR: ors } });
    if (!attempt || attempt.status === 'PAID' || attempt.status === 'REFUNDED') return;
    const ref = sessionId ?? '';
    const [pp, cp] = await Promise.all([
      this.prisma.packagePurchase.findFirst({ where: { studentId: attempt.studentId, gatewayRef: ref }, select: { id: true } }),
      this.prisma.coursePurchase.findFirst({ where: { studentId: attempt.studentId, gatewayRef: ref }, select: { id: true } }),
    ]);
    await this.prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'PAID', paidAt: new Date(), failureReason: null, packagePurchaseId: pp?.id ?? null, coursePurchaseId: cp?.id ?? null } });
  }

  /** The gateway client for a stored attempt */
  gatewayByName(name: string): PaymentGateway {
    return name === 'paystack' ? this.paystack : name === 'tranzak' ? this.tranzak : this.stripeGw;
  }

  // ── Invoice number generation ────────────────────────────

  private async nextInvoiceNo(): Promise<string> {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;

    // Atomic increment — safe under concurrent requests
    const result = await this.prisma.$queryRaw<{ lastval: bigint }[]>`
      INSERT INTO "InvoiceCounter" (id, year, month, "lastVal")
      VALUES (gen_random_uuid(), ${year}, ${month}, 1)
      ON CONFLICT (year, month)
      DO UPDATE SET "lastVal" = "InvoiceCounter"."lastVal" + 1
      RETURNING "lastVal"
    `;
    const seq = Number(result[0]?.lastval ?? 1);
    return `INV-${year}${String(month).padStart(2, '0')}-${String(seq).padStart(5, '0')}`;
  }

  // ── Purchase verification (Tranzak popup polling) ────────

  /**
   * Called by the portal after the Tranzak popup window closes.
   * Returns { completed: true } if the webhook already fulfilled the purchase
   * for this exact gateway session, so the portal can navigate to /success.
   * Scoped to the authenticated student — prevents checking other users' sessions.
   */
  async verifyPurchase(studentId: string, sessionId: string): Promise<{ completed: boolean }> {
    if (!sessionId) return { completed: false };

    const [pkg, course] = await Promise.all([
      this.prisma.packagePurchase.findFirst({
        where: { studentId, gatewayRef: sessionId },
        select: { id: true },
      }),
      this.prisma.coursePurchase.findFirst({
        where: { studentId, gatewayRef: sessionId },
        select: { id: true },
      }),
    ]);

    return { completed: !!(pkg ?? course) };
  }

  // ── Free enrollment ──────────────────────────────────────

  async enrollFree(student: UserProfile, courseId: string): Promise<{ enrolled: boolean }> {
    const course = await this.prisma.platformCourse.findUnique({ where: { id: courseId } });
    if (!course || course.status !== 'PUBLISHED') throw new NotFoundException('Course not found or not available');
    // Free means sold on its own at no charge. A course with no price that isn't sold on its own is
    // package-only (or not on sale yet), so it can't be taken for free here.
    if (!course.isSoldIndividually || (course.priceAmount ?? 0) > 0) {
      throw new BadRequestException('This course is not free');
    }

    const already = await this.prisma.coursePurchase.findUnique({
      where: { studentId_courseId: { studentId: student.id, courseId } },
    });
    if (already) return { enrolled: true }; // idempotent

    await this.prisma.coursePurchase.create({
      data: {
        studentId: student.id,
        courseId,
        amountPaid: 0,
        currency: 'USD',
        gateway: null,
        gatewayRef: null,
        invoiceNo: null,
      },
    });
    await this.gamification.awardOnce(student.id, 'ENROLLMENT', courseId);
    return { enrolled: true };
  }

  // ── Student: own purchases ────────────────────────────────

  async getMyPurchases(studentId: string) {
    const [packages, courses] = await Promise.all([
      this.prisma.packagePurchase.findMany({
        where: { studentId },
        include: { package: { select: { name: true } } },
        orderBy: { purchasedAt: 'desc' },
      }),
      this.prisma.coursePurchase.findMany({
        where: { studentId },
        include: { course: { select: { title: true } } },
        orderBy: { purchasedAt: 'desc' },
      }),
    ]);

    return [
      ...packages.map(p => ({
        id: p.id,
        type: 'package' as const,
        name: p.package.name,
        amount: p.amountPaid,
        currency: p.currency,
        gateway: p.gateway,
        invoiceNo: p.invoiceNo,
        purchasedAt: p.purchasedAt,
        expiresAt: p.expiresAt,
        status: p.expiresAt && p.expiresAt < new Date() ? 'EXPIRED' : 'ACTIVE',
      })),
      ...courses.map(c => ({
        id: c.id,
        type: 'course' as const,
        name: c.course.title,
        amount: c.amountPaid,
        currency: c.currency,
        gateway: c.gateway,
        invoiceNo: c.invoiceNo,
        purchasedAt: c.purchasedAt,
        expiresAt: c.expiresAt,
        status: c.expiresAt && c.expiresAt < new Date() ? 'EXPIRED' : 'ACTIVE',
      })),
    ].sort((a, b) => b.purchasedAt.getTime() - a.purchasedAt.getTime());
  }

  // ── Fulfillment ──────────────────────────────────────────

  /**
   * Called after a verified payment webhook.
   * 1. Creates PackagePurchase
   * 2. Splits revenue across courses → credits teacher + reviewer wallets
   * 3. Credits country rep wallet
   * 4. Updates WordPress user-meta
   * 5. Increments coupon redemption count
   */
  private async fulfillPurchase(event: PurchaseCompletedEvent): Promise<void> {
    const [student, pkg] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { id: event.studentId } }),
      this.prisma.package.findUnique({
        where: { id: event.packageId },
        include: { cohort: { select: { id: true } } },
      }),
    ]);

    if (!student || !pkg) {
      this.logger.error('fulfillPurchase: student or package not found', event);
      return;
    }

    // Idempotency guard — skip if this exact gateway session was already fulfilled.
    // Using gatewayRef (sessionId) so a student can legitimately re-purchase the same
    // package after their previous access expires (different session = different ref).
    const alreadyFulfilled = event.sessionId
      ? await this.prisma.packagePurchase.findFirst({ where: { gatewayRef: event.sessionId } })
      : null;
    if (alreadyFulfilled) {
      this.logger.warn('fulfillPurchase: duplicate webhook, skipping', event.sessionId);
      return;
    }

    await this.prisma.$transaction(async (tx) => {
      // 1. Create PackagePurchase — a renewal adds its days after the current access ends, so none are lost
      const current = await tx.packagePurchase.findFirst({
        where: { studentId: event.studentId, packageId: pkg.id, expiresAt: { gt: new Date() } },
        orderBy: { expiresAt: 'desc' }, select: { expiresAt: true },
      });
      const from = Math.max(Date.now(), current?.expiresAt?.getTime() ?? 0);
      const expiresAt = pkg.validityDays
        ? new Date(from + pkg.validityDays * 86_400_000)
        : null;

      const invoiceNo = await this.nextInvoiceNo();

      const purchase = await tx.packagePurchase.create({
        data: {
          studentId:  event.studentId,
          packageId:  event.packageId,
          couponId:   event.couponId ?? null,
          amountPaid: event.amountPaid,
          currency:   event.currency,
          gateway:    event.gateway,
          gatewayRef: event.sessionId ?? null,
          invoiceNo,
          expiresAt,
        },
      });

      // 2. Revenue split: courses → teacher + reviewer wallets
      await this.creditCourseCommissions(
        tx,
        purchase.id,
        pkg.courseIds,
        event.amountPaid,
        event.currency,
      );

      // 3. Country rep commission
      if (student.countryId) {
        await this.creditCountryRep(tx, student.countryId, event.amountPaid, event.currency, purchase.id);
      }
    });

    // 4. Auto-enroll student into the package's linked cohort (non-critical)
    if (pkg.cohortId) {
      try {
        const existing = await this.prisma.cohortRoster.findUnique({
          where: { studentId_cohortId: { studentId: event.studentId, cohortId: pkg.cohortId } },
        });
        if (!existing) {
          await this.prisma.cohortRoster.create({
            data: { studentId: event.studentId, cohortId: pkg.cohortId, source: 'PACKAGE' },
          });
        }
        this.logger.log(`Auto-enrolled student=${event.studentId} into cohort=${pkg.cohortId}`);
      } catch (err: any) {
        this.logger.warn(`Cohort auto-enroll failed: ${err.message}`);
      }
    }

    // 5. Increment coupon redemption count
    if (event.couponId) {
      await this.coupons.incrementRedemption(event.couponId);
    }

    this.logger.log(`Purchase fulfilled: student=${event.studentId} package=${event.packageId} via ${event.gateway}`);

    // Send receipt email with invoice number (non-critical)
    const invoice = await this.prisma.packagePurchase.findFirst({
      where: { studentId: event.studentId, packageId: event.packageId },
      orderBy: { purchasedAt: 'desc' },
      select: { id: true, invoiceNo: true },
    });
    const pkgStudentName = [student.firstName, student.lastName].filter(Boolean).join(' ') || student.email;
    this.receiptPdf(event.studentId, 'package', invoice?.id).then(pdf => this.mail.sendPurchaseReceipt(
      student.email, pkg.name, event.amountPaid, event.currency,
      invoice?.invoiceNo ?? undefined, pkgStudentName, 'package', pdf,
    )).catch(() => {});
    this.notifications.notify(event.studentId, {
      type: 'system',
      title: 'Payment confirmed',
      body: `You now have access to "${pkg.name}".`,
      href: '/student/courses',
    });
  }

  /**
   * Fulfillment for individual course purchases:
   * 1. Creates CoursePurchase
   * 2. Enrolls student in the course (CourseEnrollment upsert)
   * 3. Credits teacher wallet commission
   * 4. Credits country rep wallet
   */
  private async fulfillCoursePurchase(event: PurchaseCompletedEvent): Promise<void> {
    const courseId = event.courseId!;
    const [student, course] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { id: event.studentId } }),
      this.prisma.platformCourse.findUnique({ where: { id: courseId } }),
    ]);
    if (!student || !course) {
      this.logger.error('fulfillCoursePurchase: student or course not found', event);
      return;
    }

    // Idempotency — skip a repeated webhook, or a purchase that still gives access.
    // An expired purchase is renewed in place (one row per student and course).
    const already = await this.prisma.coursePurchase.findUnique({
      where: { studentId_courseId: { studentId: event.studentId, courseId } },
    });
    const stillActive = already && (!already.expiresAt || already.expiresAt > new Date());
    if (already && (stillActive || (event.sessionId && already.gatewayRef === event.sessionId))) {
      this.logger.warn('fulfillCoursePurchase: duplicate webhook or still active, skipping', event.sessionId);
      return;
    }

    // Access runs for the course's access length from today; null = no time limit
    const expiresAt = course.accessMonths ? addMonths(new Date(), course.accessMonths) : null;

    await this.prisma.$transaction(async (tx) => {
      // 1. Create (or renew) the CoursePurchase
      const courseInvoiceNo = await this.nextInvoiceNo();
      const fields = {
        amountPaid: event.amountPaid,
        currency:   event.currency,
        gateway:    event.gateway,
        gatewayRef: event.sessionId ?? null,
        invoiceNo:  courseInvoiceNo,
        expiresAt,
      };
      const purchase = already
        ? await tx.coursePurchase.update({ where: { id: already.id }, data: { ...fields, purchasedAt: new Date() } })
        : await tx.coursePurchase.create({ data: { studentId: event.studentId, courseId, ...fields } });

      // 2. Enroll student in course
      await tx.courseEnrollment.upsert({
        where: { studentId_courseId: { studentId: event.studentId, courseId } },
        update: {},
        create: { studentId: event.studentId, courseId },
      });

      // 3. Credit teacher commission (same logic as package — full commission on single course sale)
      const assignment = await tx.courseAssignment.findUnique({ where: { courseId } });
      if (assignment?.teacherId && assignment.teacherCommissionPct !== null) {
        const credit = Math.floor(event.amountPaid * ((assignment.teacherCommissionPct ?? 0) / 100));
        if (credit > 0) {
          await this.ensureWalletAndCredit(
            tx, assignment.teacherId, credit, event.currency,
            purchase.id, courseId, 'COURSE_SALE', 'course',
          );
        }
      }

      // 4. Country rep commission
      if (student.countryId) {
        await this.creditCountryRepForCourse(tx, student.countryId, event.amountPaid, event.currency, purchase.id);
      }
    });

    // Increment coupon redemption count (non-critical)
    if (event.couponId) {
      await this.coupons.incrementRedemption(event.couponId).catch(() => {});
    }

    const courseStudentName = [student.firstName, student.lastName].filter(Boolean).join(' ') || student.email;
    const latestCoursePurchase = await this.prisma.coursePurchase.findUnique({
      where: { studentId_courseId: { studentId: event.studentId, courseId } },
      select: { id: true, invoiceNo: true },
    });
    this.receiptPdf(event.studentId, 'course', latestCoursePurchase?.id).then(pdf => this.mail.sendPurchaseReceipt(
      student.email, course.title, event.amountPaid, event.currency,
      latestCoursePurchase?.invoiceNo ?? undefined, courseStudentName, 'course', pdf,
    )).catch(() => {});
    this.notifications.notify(event.studentId, {
      type: 'system',
      title: 'Payment confirmed',
      body: expiresAt
        ? `You now have access to "${course.title}" until ${expiresAt.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
        : `You now have access to "${course.title}".`,
      href: `/student/learn/${courseId}`,
    });
    this.logger.log(`Course purchase fulfilled: student=${event.studentId} course=${courseId}`);
  }

  /**
   * Split the sale amount evenly across the package's courseIds, then write
   * WalletTransaction credits for each course's teacher and reviewer.
   * null commission = paid outside the platform → no transaction generated.
   */
  private async creditCourseCommissions(
    tx: any,
    purchaseId: string,
    courseIds: string[],
    totalAmount: number,
    currency: string,
  ): Promise<void> {
    if (courseIds.length === 0) return;

    const perCourse = Math.floor(totalAmount / courseIds.length);

    const assignments = await tx.courseAssignment.findMany({
      where: { courseId: { in: courseIds } },
    });

    for (const assignment of assignments) {
      if (assignment.teacherId && assignment.teacherCommissionPct !== null) {
        const credit = Math.floor(perCourse * (assignment.teacherCommissionPct / 100));
        if (credit > 0) {
          await this.ensureWalletAndCredit(
            tx, assignment.teacherId, credit, currency,
            purchaseId, assignment.courseId, 'COURSE_SALE',
          );
        }
      }

      if (assignment.reviewerId && assignment.reviewerCommissionPct !== null) {
        const credit = Math.floor(perCourse * (assignment.reviewerCommissionPct / 100));
        if (credit > 0) {
          await this.ensureWalletAndCredit(
            tx, assignment.reviewerId, credit, currency,
            purchaseId, assignment.courseId, 'REVIEW_COMMISSION',
          );
        }
      }
    }
  }

  private async creditCountryRep(
    tx: any,
    countryId: string,
    amount: number,
    currency: string,
    purchaseId: string,
  ): Promise<void> {
    const country = await tx.country.findUnique({ where: { id: countryId } });
    if (!country?.repCommissionPercent) return;

    const rep = await tx.userProfile.findFirst({
      where: { countryId, role: 'COUNTRY_REP' },
    });
    if (!rep) return;

    const credit = Math.floor(amount * (country.repCommissionPercent / 100));
    if (credit > 0) {
      await this.ensureWalletAndCredit(tx, rep.id, credit, currency, purchaseId, null, 'COUNTRY_BONUS');
    }
  }

  private async ensureWalletAndCredit(
    tx: any,
    userId: string,
    amount: number,
    currency: string,
    purchaseId: string,
    courseId: string | null,
    source: string,
    purchaseType: 'package' | 'course' = 'package',
  ): Promise<void> {
    const wallet = await tx.wallet.upsert({
      where: { userId },
      update: { balance: { increment: amount } },
      create: { userId, balance: amount, currency },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'CREDIT',
        source,
        amount,
        currency,
        packagePurchaseId: purchaseType === 'package' ? purchaseId : null,
        coursePurchaseId:  purchaseType === 'course'  ? purchaseId : null,
        courseId,
        description: purchaseType === 'course' ? 'Commission from course sale' : 'Commission from package purchase',
      },
    });
  }

  private async creditCountryRepForCourse(
    tx: any,
    countryId: string,
    amount: number,
    currency: string,
    coursePurchaseId: string,
  ): Promise<void> {
    const country = await tx.country.findUnique({ where: { id: countryId } });
    if (!country?.repCommissionPercent) return;
    const rep = await tx.userProfile.findFirst({ where: { countryId, role: 'COUNTRY_REP' } });
    if (!rep) return;
    const credit = Math.floor(amount * (country.repCommissionPercent / 100));
    if (credit > 0) {
      await this.ensureWalletAndCredit(tx, rep.id, credit, currency, coursePurchaseId, null, 'COUNTRY_BONUS', 'course');
    }
  }

  // ── Gateway routing ──────────────────────────────────────

  /**
   * Routes to the correct gateway based on the package's currency.
   * Paystack: NGN, GHS, ZAR, KES, EGP
   * Tranzak:  XAF, XOF, RWF, UGX, TZS, MZN
   * Stripe:   USD, EUR, GBP, CAD, AUD, JPY, CHF
   */
  private gatewayForCurrency(currency: string): PaymentGateway {
    const upper = currency.toUpperCase();
    if (TRANZAK_CURRENCIES.has(upper)) return this.tranzak;
    if (PAYSTACK_CURRENCIES.has(upper)) return this.paystack;
    if (STRIPE_CURRENCIES.has(upper)) return this.stripeGw;
    throw new BadRequestException(
      `No payment gateway configured for currency ${currency}. Contact support.`,
    );
  }
}

/** The same day n months later, clamped to the month's last day (31 Jan + 1 month = 28/29 Feb). */
function addMonths(d: Date, n: number): Date {
  const r = new Date(d);
  const day = r.getDate();
  r.setDate(1);
  r.setMonth(r.getMonth() + n);
  r.setDate(Math.min(day, new Date(r.getFullYear(), r.getMonth() + 1, 0).getDate()));
  return r;
}
