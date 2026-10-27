import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import * as crypto from 'crypto';
import {
  PaymentGateway,
  CreateCheckoutInput,
  CheckoutSession,
  WebhookEvent,
  PurchaseCompletedEvent,
} from './gateway.interface';

/**
 * Paystack gateway — for African rail (NG, GH, ZA, etc.)
 * Confirm student base split with client before going live (see PLAN.md §8).
 */
@Injectable()
export class PaystackGateway implements PaymentGateway {
  private readonly secret: string;
  private readonly webhookSecret: string;
  private readonly logger = new Logger(PaystackGateway.name);

  constructor(private config: ConfigService) {
    this.secret = config.getOrThrow<string>('PAYSTACK_SECRET_KEY');
    this.webhookSecret = config.getOrThrow<string>('PAYSTACK_WEBHOOK_SECRET');
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const res = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: input.studentEmail,
        amount: input.amount,
        currency: input.currency.toUpperCase(),
        callback_url: input.successUrl,
        metadata: {
          studentId: input.studentId,
          packageId: input.packageId ?? null,
          courseId: input.courseId ?? null,
          couponId: input.couponId ?? null,
          itemName: input.itemName,
          ...(input as any).metadata,
        },
      },
      { headers: { Authorization: `Bearer ${this.secret}` } },
    );

    const { reference, authorization_url, access_code } = res.data.data;
    return { sessionId: reference, url: authorization_url, gateway: 'paystack', accessCode: access_code };
  }

  verifyWebhookSignature(rawBody: Buffer, signature: string): WebhookEvent {
    const hash = crypto
      .createHmac('sha512', this.webhookSecret)
      .update(rawBody)
      .digest('hex');

    if (hash !== signature) {
      this.logger.warn('Paystack webhook signature mismatch');
      throw new BadRequestException('Invalid webhook signature');
    }

    const payload = JSON.parse(rawBody.toString()) as Record<string, unknown>;
    return { gateway: 'paystack', type: (payload as any).event as string, payload };
  }

  extractPurchaseCompleted(event: WebhookEvent): PurchaseCompletedEvent | null {
    if (event.type !== 'charge.success') return null;

    const data = (event.payload as any).data;
    const { studentId, packageId, courseId, couponId } = data.metadata ?? {};
    if (!studentId || (!packageId && !courseId)) return null;

    return {
      sessionId: data.reference,
      studentId,
      packageId: packageId || undefined,
      courseId: courseId || undefined,
      couponId: couponId || undefined,
      amountPaid: data.amount,
      currency: data.currency?.toUpperCase() ?? 'NGN',
      gateway: 'paystack',
    };
  }
}
