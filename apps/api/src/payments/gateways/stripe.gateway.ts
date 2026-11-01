import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe = require('stripe');
import {
  PaymentGateway,
  CreateCheckoutInput,
  CheckoutSession,
  WebhookEvent,
  PurchaseCompletedEvent,
  GatewayLookup,
} from './gateway.interface';

@Injectable()
export class StripeGateway implements PaymentGateway {
  private readonly stripe: Stripe;
  private readonly webhookSecret: string;
  private readonly logger = new Logger(StripeGateway.name);

  static readonly ZERO_DECIMAL = new Set([
    'BIF', 'CLP', 'DJF', 'GNF', 'JPY', 'KMF', 'KRW', 'MGA',
    'PYG', 'RWF', 'UGX', 'VND', 'VUV', 'XAF', 'XOF', 'XPF',
  ]);

  constructor(private config: ConfigService) {
    this.stripe = new Stripe(config.get<string>('STRIPE_SECRET_KEY', 'sk_test_placeholder'));
    this.webhookSecret = config.get<string>('STRIPE_WEBHOOK_SECRET', 'whsec_placeholder');
  }

  async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession> {
    try {
      const currency = input.currency.toLowerCase();
      const amount = this.toStripeAmount(input.amount, input.currency.toUpperCase());

      const session = await this.stripe.checkout.sessions.create({
        mode: 'payment',
        line_items: [
          {
            price_data: {
              currency,
              product_data: { name: input.itemName },
              unit_amount: amount,
            },
            quantity: 1,
          },
        ],
        metadata: {
          studentId: input.studentId,
          packageId: input.packageId ?? '',
          courseId: input.courseId ?? '',
          couponId: input.couponId ?? '',
        },
        customer_email: input.studentEmail,
        success_url: input.successUrl,
        cancel_url: input.cancelUrl,
      });

      return {
        sessionId: session.id,
        url: session.url,
        gateway: 'stripe',
      };
    } catch (err: any) {
      const msg = err?.message ?? 'Stripe API error';
      this.logger.error('Stripe createCheckoutSession failed', msg);
      throw new BadRequestException(`Payment initiation failed: ${msg}`);
    }
  }

  verifyWebhookSignature(rawBody: Buffer, signature?: string): WebhookEvent {
    if (!signature) {
      throw new BadRequestException('Missing Stripe webhook signature');
    }

    let event: Stripe.Event;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    } catch (err: any) {
      this.logger.warn('Stripe webhook signature verification failed', err?.message);
      throw new BadRequestException('Invalid webhook signature');
    }

    return {
      gateway: 'stripe',
      type: event.type,
      payload: event as unknown as Record<string, unknown>,
    };
  }

  extractPurchaseCompleted(event: WebhookEvent): PurchaseCompletedEvent | null {
    if (event.type !== 'checkout.session.completed') return null;

    const session = (event.payload as any).data?.object as Stripe.Checkout.Session;
    if (!session || session.payment_status !== 'paid') return null;

    const { studentId, packageId, courseId, couponId } = session.metadata ?? {};
    if (!studentId || (!packageId && !courseId)) return null;

    const currency = (session.currency ?? 'usd').toUpperCase();
    const amountPaid = this.toMinorUnits(session.amount_total ?? 0, currency);

    return {
      sessionId: session.id,
      studentId,
      packageId: packageId || undefined,
      courseId: courseId || undefined,
      couponId: couponId || undefined,
      amountPaid,
      currency,
      gateway: 'stripe',
    };
  }

  /**
   * Convert internal minor-unit amount to what Stripe expects.
   * Stripe uses the smallest currency unit (cents) for most currencies,
   * and integer amounts for zero-decimal currencies.
   * Our internal representation is already minor units, so for most currencies
   * we pass through directly. For zero-decimal currencies, we also pass through
   * since our internal "minor units" for XAF etc. are already integers.
   */
  private toStripeAmount(amount: number, currency: string): number {
    return Math.round(amount);
  }

  private toMinorUnits(amount: number, currency: string): number {
    return Math.round(amount);
  }

  async lookup(sessionId: string): Promise<GatewayLookup> {
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId);
      if (session.payment_status === 'paid') return { status: 'paid', event: { gateway: 'stripe', type: 'checkout.session.completed', payload: { data: { object: session } } as any } };
      if (session.status === 'expired') return { status: 'abandoned', reason: 'The checkout expired before payment' };
      return { status: 'pending' };
    } catch (err: any) {
      if (err?.statusCode === 404) return { status: 'abandoned', reason: 'Stripe has no checkout with this id' };
      return { status: 'unknown', reason: 'Couldn’t reach Stripe' };
    }
  }
}
