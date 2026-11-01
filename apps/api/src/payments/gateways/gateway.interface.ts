/**
 * Common interface for all payment gateways (Paystack, Tranzak, Stripe).
 * PaymentsService works against this interface — swap the gateway without
 * touching business logic.
 *
 * Gateway routing by currency:
 *  - NGN / GHS / ZAR / KES / EGP          → Paystack  (Nigeria, Ghana, South Africa…)
 *  - XAF / XOF / RWF / UGX / TZS / MZN   → Tranzak   (Cameroon, Central/West Africa…)
 *  - USD / EUR / GBP / CAD / AUD / JPY / CHF → Stripe (International)
 */

export interface CreateCheckoutInput {
  /** One of packageId or courseId must be set */
  packageId?: string;
  courseId?: string;
  itemName: string;
  /** Price in minor currency units (kobo, pesewas) or absolute units for zero-decimal currencies (XAF) */
  amount: number;
  currency: string;
  studentEmail: string;
  studentId: string;
  couponId?: string;
  successUrl: string;
  cancelUrl: string;
  /**
   * Tranzak only — direct mobile wallet charge (MTN MoMo / Orange Money USSD push).
   * Must include country prefix, e.g. "237680657567" for Cameroon.
   * When provided, Tranzak pushes a payment request to the phone; no redirect URL returned.
   */
  mobileWalletNumber?: string;
  /**
   * Tranzak only — the TranzakSession.id to use as mchTransactionRef.
   * Created by PaymentsService before calling the gateway.
   */
  tranzakSessionId?: string;
}

export interface CheckoutSession {
  sessionId: string;
  /** Redirect URL — null for Tranzak USSD push (no redirect needed) */
  url: string | null;
  gateway: 'paystack' | 'tranzak' | 'stripe';
  /**
   * Paystack only: access_code for the inline popup SDK.
   */
  accessCode?: string;
  /**
   * Tranzak only: true when a direct mobile-wallet charge was initiated.
   * Portal should show "Approve on your phone" instead of opening a popup.
   */
  ussdPush?: boolean;
}

export interface WebhookEvent {
  gateway: 'paystack' | 'tranzak' | 'stripe';
  type: string;
  /** Raw payload — authenticity must already be verified before this is constructed */
  payload: Record<string, unknown>;
}

export interface PurchaseCompletedEvent {
  /** Gateway session/request ID — stored as gatewayRef on purchase records */
  sessionId: string;
  studentId: string;
  packageId?: string;
  courseId?: string;
  couponId?: string;
  amountPaid: number;
  currency: string;
  gateway: 'paystack' | 'tranzak' | 'stripe';
  /**
   * Tranzak only: the mchTransactionRef (= TranzakSession.id).
   * PaymentsService uses this to look up the TranzakSession for purchase metadata.
   */
  tranzakSessionId?: string;
}

export interface PaymentGateway {
  createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession>;
  /**
   * Verify webhook authenticity and parse the payload.
   * signatureHeader is used by Paystack (x-paystack-signature HMAC).
   * Tranzak uses an authKey field inside the body — signatureHeader is ignored.
   */
  verifyWebhookSignature(rawBody: Buffer, signatureHeader?: string): WebhookEvent;
  extractPurchaseCompleted(event: WebhookEvent): PurchaseCompletedEvent | null;
  /** Ask the gateway about one checkout */
  lookup(sessionId: string): Promise<GatewayLookup>;
}

/**
 * What the gateway says about one checkout when we ask it directly (a missed webhook, a student
 * who paid but has no access). When paid, `event` is shaped like the gateway's own webhook so the
 * usual extract-and-fulfil path handles it.
 */
export interface GatewayLookup {
  status: 'paid' | 'pending' | 'failed' | 'abandoned' | 'unknown';
  reason?: string;
  event?: WebhookEvent;
}


/** Currencies routed to each gateway */
export const PAYSTACK_CURRENCIES = new Set(['NGN', 'GHS', 'ZAR', 'KES', 'EGP']);
export const TRANZAK_CURRENCIES  = new Set(['XAF', 'XOF', 'RWF', 'UGX', 'TZS', 'MZN']);
export const STRIPE_CURRENCIES   = new Set(['USD', 'EUR', 'GBP', 'CAD', 'AUD', 'JPY', 'CHF']);

export type GatewayName = 'paystack' | 'tranzak' | 'stripe';
