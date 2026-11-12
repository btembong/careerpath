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
import { cohortRates, shareFor } from '../live/cohort-rates';
import { AddOnConfig, AddOnLine, addOnLabel, addOnTotal, asLines, pickAddOns } from './add-ons';
import { majorToMinor } from '@cpa/shared';
import {
  PaymentGateway,
  PurchaseCompletedEvent,
  WebhookEvent,
  PAYSTACK_CURRENCIES,
  TRANZAK_CURRENCIES,
  STRIPE_CURRENCIES,
} from './gateways/gateway.interface';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import { Prisma, UserProfile } from '@prisma/client';

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
  private receiptPdf(studentId: string, kind: 'package' | 'course' | 'addon', id?: string) {
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

    // Extras chosen at checkout go on top; coupons never discount them
    const addOns = pickAddOns(pkg.addOns, dto.addOns);
    finalAmount += addOnTotal(addOns);

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
      itemName: addOns.length ? `${pkg.name} + ${addOnLabel(addOns)}` : pkg.name,
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
    await this.recordAttempt({ studentId: student.id, kind: 'package', packageId: pkg.id, title: addOns.length ? `${pkg.name} + ${addOnLabel(addOns)}` : pkg.name, amount: finalAmount, currency: pkg.currency, gateway: session.gateway, sessionId: session.sessionId, tranzakSessionId, couponId, addOns });

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
    requestedAddOns?: string[],
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

    // Extras chosen at checkout go on top; coupons never discount them
    const addOns = pickAddOns(course.addOns, requestedAddOns);
    finalAmount += addOnTotal(addOns);

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
      itemName: addOns.length ? `${course.title} + ${addOnLabel(addOns)}` : course.title,
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
    await this.recordAttempt({ studentId: student.id, kind: 'course', courseId: course.id, title: addOns.length ? `${course.title} + ${addOnLabel(addOns)}` : course.title, amount: finalAmount, currency: course.priceCurrency, gateway: session.gateway, sessionId: session.sessionId, tranzakSessionId, couponId, addOns });

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

    // An extra bought after the course or package is added to it; anything else is a purchase
    const attempt = await this.attemptFor(purchase.sessionId, purchase.tranzakSessionId);
    if (attempt?.kind === 'addon') {
      await this.fulfillAddOnLater(purchase, attempt);
    } else if (purchase.courseId) {
      await this.fulfillCoursePurchase(purchase);
    } else {
      await this.fulfillPurchase(purchase);
    }
    await this.markAttemptPaid(purchase.sessionId, purchase.tranzakSessionId);
    return true;
  }

  // ── Payment attempts ─────────────────────────────────────

  private async recordAttempt(a: { studentId: string; kind: 'package' | 'course' | 'addon'; packageId?: string; courseId?: string; title: string; amount: number; currency: string; gateway: string; sessionId?: string | null; tranzakSessionId?: string; couponId?: string; addOns?: AddOnLine[] }) {
    const { addOns, ...rest } = a;
    await this.prisma.paymentAttempt.create({
      data: { ...rest, sessionId: a.sessionId || null, tranzakSessionId: a.tranzakSessionId ?? null, couponId: a.couponId ?? null, addOns: addOns?.length ? (addOns as any) : undefined },
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
    await this.prisma.paymentAttempt.update({ where: { id: attempt.id }, data: { status: 'PAID', paidAt: new Date(), failureReason: null, packagePurchaseId: pp?.id ?? attempt.packagePurchaseId ?? null, coursePurchaseId: cp?.id ?? attempt.coursePurchaseId ?? null } });
  }

  private attemptFor(sessionId?: string, tranzakSessionId?: string) {
    const ors = [sessionId ? { sessionId } : null, tranzakSessionId ? { tranzakSessionId } : null].filter(Boolean) as object[];
    return ors.length ? this.prisma.paymentAttempt.findFirst({ where: { OR: ors } }) : Promise.resolve(null);
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
    const result = await this.prisma.$queryRaw<{ lastVal: bigint | number }[]>`
      INSERT INTO "InvoiceCounter" (id, year, month, "lastVal")
      VALUES (gen_random_uuid(), ${year}, ${month}, 1)
      ON CONFLICT (year, month)
      DO UPDATE SET "lastVal" = "InvoiceCounter"."lastVal" + 1
      RETURNING "lastVal" AS "lastVal"
    `;
    // The column comes back as "lastVal" (quoted names keep their case); reading "lastval" gave 1 every time
    const seq = Number(result[0]?.lastVal);
    if (!Number.isFinite(seq) || seq < 1) throw new Error('Could not get the next invoice number');
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

    if (pkg ?? course) return { completed: true };
    // An extra bought later has no purchase of its own: its payment record says
    const addOn = await this.prisma.paymentAttempt.findFirst({ where: { studentId, sessionId, kind: 'addon', status: 'PAID' }, select: { id: true } });
    return { completed: !!addOn };
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

    // Extras bought at checkout: the package's own split uses its price only
    const addOns = await this.addOnsPaid(event);
    const base = Math.max(0, event.amountPaid - addOnTotal(addOns));

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
          ...(addOns.length && { addOns: addOns as any }),
        },
      });

      // 2. Revenue split. A package linked to a cohort pays the cohort teacher's share off the top;
      //    the rest is split across the courses → teacher + reviewer wallets
      let forCourses = base;
      if (pkg.cohortId) {
        const cohort = await tx.cohort.findUnique({ where: { id: pkg.cohortId }, select: { teacherId: true } });
        const share = cohort ? Math.floor((base * shareFor(await cohortRates(this.prisma), pkg.cohortId)) / 100) : 0;
        if (cohort && share > 0) {
          await this.ensureWalletAndCredit(tx, cohort.teacherId, share, event.currency, purchase.id, null, 'COHORT_SHARE');
          forCourses -= share;
        }
      }
      await this.creditCourseCommissions(
        tx,
        purchase.id,
        pkg.courseIds,
        forCourses,
        event.currency,
      );
      await this.applyAddOns(tx, addOns, event, purchase.id, 'package');

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
      student.email, addOns.length ? `${pkg.name} + ${addOnLabel(addOns)}` : pkg.name, event.amountPaid, event.currency,
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
    // Extras bought at checkout: the teacher's share is of the course's price only
    const addOns = await this.addOnsPaid(event);
    const base = Math.max(0, event.amountPaid - addOnTotal(addOns));

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
        addOns:     addOns.length ? (addOns as any) : null,
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
        const credit = Math.floor(base * ((assignment.teacherCommissionPct ?? 0) / 100));
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

      // 5. Extras: a place in the cohort, and the cohort teacher's share of it
      await this.applyAddOns(tx, addOns, event, purchase.id, 'course');
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
      student.email, addOns.length ? `${course.title} + ${addOnLabel(addOns)}` : course.title, event.amountPaid, event.currency,
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

  /** The extras the student chose at checkout for this payment (kept on its payment attempt) */
  private async addOnsPaid(event: PurchaseCompletedEvent): Promise<AddOnLine[]> {
    const ors = [event.sessionId ? { sessionId: event.sessionId } : null, event.tranzakSessionId ? { tranzakSessionId: event.tranzakSessionId } : null].filter(Boolean) as object[];
    if (!ors.length) return [];
    const attempt = await this.prisma.paymentAttempt.findFirst({ where: { OR: ors }, select: { addOns: true } });
    return asLines(attempt?.addOns);
  }

  /**
   * What extras do once paid. Live classes: the student joins the cohort and its teacher gets the cohort
   * share of the extra. Mentorship needs nothing here: it adds to the student's monthly allowance, and
   * mentors are paid per session held.
   */
  private async applyAddOns(tx: any, lines: AddOnLine[], event: PurchaseCompletedEvent, purchaseId: string, purchaseType: 'package' | 'course') {
    for (const l of lines) {
      if (l.kind !== 'live' || !l.cohortId) continue;
      const cohort = await tx.cohort.findUnique({ where: { id: l.cohortId }, select: { teacherId: true } });
      if (!cohort) { this.logger.error(`Live classes add-on: cohort ${l.cohortId} not found`); continue; }
      await tx.cohortRoster.upsert({
        where: { studentId_cohortId: { studentId: event.studentId, cohortId: l.cohortId } },
        update: {},
        create: { studentId: event.studentId, cohortId: l.cohortId, source: 'ADDON' },
      });
      const share = Math.floor((l.price * shareFor(await cohortRates(this.prisma), l.cohortId)) / 100);
      if (share > 0) await this.ensureWalletAndCredit(tx, cohort.teacherId, share, event.currency, purchaseId, null, 'COHORT_SHARE', purchaseType);
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

  // ── Add-ons offered at checkout ──────────────────────────

  private async addOnItem(kind: string, id: string) {
    if (kind === 'course') {
      const c = await this.prisma.platformCourse.findUnique({ where: { id }, select: { id: true, title: true, priceCurrency: true, accessMonths: true, addOns: true } });
      if (!c) throw new NotFoundException('Course not found');
      return { kind, id, title: c.title, currency: c.priceCurrency ?? 'XAF', months: c.accessMonths, config: (c.addOns ?? {}) as AddOnConfig, ownCohort: null as string | null, ownMentorship: false };
    }
    if (kind === 'package') {
      const p = await this.prisma.package.findUnique({ where: { id }, select: { id: true, name: true, currency: true, validityDays: true, addOns: true, cohortId: true, mentorship: true, mentorshipSessionsPerMonth: true } });
      if (!p) throw new NotFoundException('Package not found');
      return { kind, id, title: p.name, currency: p.currency, months: p.validityDays ? Math.round(p.validityDays / 30.44) : null, config: (p.addOns ?? {}) as AddOnConfig, ownCohort: p.cohortId, ownMentorship: !!p.mentorship || p.mentorshipSessionsPerMonth != null };
    }
    throw new BadRequestException('Add-ons are for courses and packages');
  }

  /** The student's active purchase of a course or package (the latest, for a package) */
  private activePurchase(kind: string, id: string, studentId: string) {
    const active = { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] };
    return kind === 'course'
      ? this.prisma.coursePurchase.findFirst({ where: { studentId, courseId: id, ...active }, select: { id: true, addOns: true, expiresAt: true } })
      : this.prisma.packagePurchase.findFirst({ where: { studentId, packageId: id, ...active }, orderBy: { expiresAt: 'desc' }, select: { id: true, addOns: true, expiresAt: true } });
  }

  /**
   * Add an extra to a course or package the student already has: priced as set, lasting until that
   * access ends. Paid like any checkout; once paid it's added to the purchase (see fulfillAddOnLater).
   */
  async createAddOnCheckout(student: UserProfile, kind: string, id: string, dto: { addOns?: string[]; mobileWalletNumber?: string }) {
    const it = await this.addOnItem(kind, id);
    const active = await this.activePurchase(kind, id, student.id);
    if (!active) throw new BadRequestException(`Extras are added to a ${kind} you have. Buy it first, with the extras at checkout.`);
    const have = new Set(asLines(active.addOns).map(l => l.kind));
    if ((dto.addOns ?? []).some(k => have.has(k as AddOnLine['kind']))) throw new BadRequestException('You already have that');
    const lines = pickAddOns(it.config, dto.addOns);
    if (!lines.length) throw new BadRequestException('Choose what to add');
    const amount = addOnTotal(lines);
    const title = `${lines.map(l => (l.kind === 'live' ? 'Live classes' : 'Mentorship')).join(' and ')} for ${it.title}`;
    const gateway = this.gatewayForCurrency(it.currency);
    const portalUrl = this.config.get<string>('PORTAL_URL', 'http://localhost:3000');
    const back = kind === 'course' ? `${portalUrl}/student/courses/${id}` : `${portalUrl}/packages/${id}`;
    const ids = kind === 'course' ? { courseId: id } : { packageId: id };

    let tranzakSessionId: string | undefined;
    if (TRANZAK_CURRENCIES.has(it.currency.toUpperCase())) {
      tranzakSessionId = (await this.prisma.tranzakSession.create({ data: { studentId: student.id, ...ids, amount, currency: it.currency } })).id;
    }
    const session = await gateway.createCheckoutSession({
      ...ids, itemName: title, amount, currency: it.currency, studentEmail: student.email, studentId: student.id,
      successUrl: `${back}?added=1`, cancelUrl: back, mobileWalletNumber: dto.mobileWalletNumber, tranzakSessionId,
    });
    if (tranzakSessionId && session.sessionId) {
      await this.prisma.tranzakSession.update({ where: { id: tranzakSessionId }, data: { requestId: session.sessionId } }).catch(() => {});
    }
    await this.recordAttempt({ studentId: student.id, kind: 'addon', ...ids, title, amount, currency: it.currency, gateway: session.gateway, sessionId: session.sessionId, tranzakSessionId, addOns: lines });
    return { url: session.url, sessionId: session.sessionId, gateway: session.gateway, accessCode: session.accessCode, ussdPush: session.ussdPush ?? false };
  }

  /** A paid extra joins the purchase it was bought for, with its own invoice and receipt */
  private async fulfillAddOnLater(event: PurchaseCompletedEvent, attempt: { id: string; title: string; courseId: string | null; packageId: string | null; addOns: unknown }) {
    const kind: 'course' | 'package' = attempt.courseId ? 'course' : 'package';
    const id = (attempt.courseId ?? attempt.packageId)!;
    const lines = asLines(attempt.addOns).map(l => ({ ...l, later: true }));
    const [active, student] = await Promise.all([
      this.activePurchase(kind, id, event.studentId),
      this.prisma.userProfile.findUnique({ where: { id: event.studentId }, select: { email: true, countryId: true, firstName: true, lastName: true } }),
    ]);
    if (!active || !student) {
      this.logger.error(`Add-on paid but there's nothing active to add it to (attempt ${attempt.id}): check it by hand`);
      return;
    }
    const invoiceNo = await this.nextInvoiceNo();
    const had = asLines(active.addOns);
    await this.prisma.$transaction(async (tx) => {
      const merged = [...had, ...lines.filter(l => !had.some(x => x.kind === l.kind))];
      if (kind === 'course') await tx.coursePurchase.update({ where: { id: active.id }, data: { addOns: merged as any } });
      else await tx.packagePurchase.update({ where: { id: active.id }, data: { addOns: merged as any } });
      await this.applyAddOns(tx, lines, event, active.id, kind);
      if (student.countryId) {
        if (kind === 'course') await this.creditCountryRepForCourse(tx, student.countryId, event.amountPaid, event.currency, active.id);
        else await this.creditCountryRep(tx, student.countryId, event.amountPaid, event.currency, active.id);
      }
      await tx.paymentAttempt.update({ where: { id: attempt.id }, data: { invoiceNo, ...(kind === 'course' ? { coursePurchaseId: active.id } : { packagePurchaseId: active.id }) } });
    });
    const name = [student.firstName, student.lastName].filter(Boolean).join(' ') || student.email;
    this.receiptPdf(event.studentId, 'addon', attempt.id).then(pdf => this.mail.sendPurchaseReceipt(
      student.email, attempt.title, event.amountPaid, event.currency, invoiceNo, name, kind, pdf,
    )).catch(() => {});
    this.notifications.notify(event.studentId, {
      type: 'system', title: 'Added to your ' + kind,
      body: `${attempt.title} is ready.${lines.some(l => l.kind === 'live') ? ' You’re in the class now.' : ''}${lines.some(l => l.kind === 'mentorship') ? ' You can book your first mentor session.' : ''}`,
      href: kind === 'course' ? `/student/courses/${id}` : `/packages/${id}`,
    });
    this.logger.log(`Add-on fulfilled: student=${event.studentId} ${kind}=${id} (${lines.map(l => l.kind).join(', ')})`);
  }

  /** What a course or package offers at checkout, ready to show: price, the class it joins, sessions in all */
  async offeredAddOns(kind: string, id: string, viewerId?: string) {
    const it = await this.addOnItem(kind, id);
    const active = viewerId ? await this.activePurchase(kind, id, viewerId) : null;
    const live = it.config.live ? await this.prisma.cohort.findUnique({
      where: { id: it.config.live.cohortId },
      select: { id: true, name: true, teacher: { select: { name: true, firstName: true, lastName: true } }, liveClasses: { where: { status: 'SCHEDULED', scheduledAt: { gt: new Date() } }, orderBy: { scheduledAt: 'asc' }, take: 6, select: { scheduledAt: true } } },
    }) : null;
    const t = live?.teacher;
    return {
      currency: it.currency, months: it.months,
      // For a student who has it: which extras they already have, and until when
      owned: !!active, accessUntil: active?.expiresAt ?? null, bought: asLines(active?.addOns).map(l => l.kind),
      live: it.config.live && live ? { price: it.config.live.price, cohortId: live.id, cohortName: live.name, teacher: t ? t.name || [t.firstName, t.lastName].filter(Boolean).join(' ') || null : null, next: live.liveClasses.map(c => c.scheduledAt) } : null,
      mentorship: it.config.mentorship ? { price: it.config.mentorship.price, perMonth: it.config.mentorship.perMonth, sessions: it.months ? it.config.mentorship.perMonth * it.months : null } : null,
    };
  }

  /** Admin: switch the add-ons for a course or package on or off, with their prices (normal units) */
  async setAddOns(kind: string, id: string, dto: { live?: { cohortId?: string; price?: number } | null; mentorship?: { perMonth?: number; price?: number } | null }) {
    const it = await this.addOnItem(kind, id);
    const price = (v: unknown) => { const n = Number(v); if (!Number.isFinite(n) || n <= 0) throw new BadRequestException('Enter a price above zero'); return majorToMinor(n, it.currency); };
    const next: AddOnConfig = { ...it.config };
    if (dto.live !== undefined) {
      if (dto.live === null) next.live = null;
      else {
        if (it.ownCohort) throw new BadRequestException('This package already includes live classes');
        if (!dto.live.cohortId || !(await this.prisma.cohort.findUnique({ where: { id: dto.live.cohortId }, select: { id: true } }))) throw new BadRequestException('Choose the class it joins');
        next.live = { cohortId: dto.live.cohortId, price: price(dto.live.price) };
      }
    }
    if (dto.mentorship !== undefined) {
      if (dto.mentorship === null) next.mentorship = null;
      else {
        if (it.ownMentorship) throw new BadRequestException('This package already includes mentorship');
        const perMonth = Math.round(Number(dto.mentorship.perMonth));
        if (!(perMonth >= 1 && perMonth <= 31)) throw new BadRequestException('Sessions a month must be 1 to 31');
        next.mentorship = { perMonth, price: price(dto.mentorship.price) };
      }
    }
    const value = (next.live || next.mentorship ? next : null) as any;
    if (kind === 'course') await this.prisma.platformCourse.update({ where: { id }, data: { addOns: value ?? Prisma.DbNull } });
    else await this.prisma.package.update({ where: { id }, data: { addOns: value ?? Prisma.DbNull } });
    return this.offeredAddOns(kind, id);
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
