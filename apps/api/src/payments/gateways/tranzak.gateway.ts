import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  PaymentGateway,
  CreateCheckoutInput,
  CheckoutSession,
  WebhookEvent,
  PurchaseCompletedEvent,
  GatewayLookup,
} from './gateway.interface';

/**
 * Tranzak gateway — Central/West Africa (XAF, XOF, RWF, UGX, TZS, MZN).
 * Official docs: https://docs.developer.tranzak.me
 *
 * ── Auth ──────────────────────────────────────────────────────────────────
 * POST /auth/token  { appId, appKey }  →  { data: { token, expiresIn } }
 * Token is cached until 60 s before expiry (expiresIn is typically 7200 s).
 *
 * ── Payment creation (web redirect) ──────────────────────────────────────
 * POST /xp021/v1/request/create
 * Response: { data: { requestId, links: { paymentAuthUrl } } }
 * Redirect user to paymentAuthUrl (opened as a popup window in the portal).
 *
 * ── Payment creation (USSD / direct mobile-wallet push) ──────────────────
 * POST /xp021/v1/request/create-mobile-wallet-charge
 * No redirect URL — Tranzak pushes a payment prompt to the user's phone.
 * Response: { data: { requestId } }
 *
 * ── Webhooks ──────────────────────────────────────────────────────────────
 * Event type: REQUEST.COMPLETED
 * Authenticity: compare payload.authKey with TRANZAK_WEBHOOK_AUTH_KEY env var.
 * Payload.resource.mchTransactionRef = the TranzakSession.id we set at creation.
 *
 * ── Currency note ─────────────────────────────────────────────────────────
 * XAF, XOF, RWF, UGX are zero-decimal (ISO 4217 exponent = 0).
 * Amounts for these currencies are integers — no /100 division.
 * TZS and MZN have 2 decimal places and use the standard /100 convention.
 */
export interface TranzakTransfer { transferId: string; status: string; amount: number; fee?: number; currencyCode: string; customTransactionRef?: string; errorMessage?: string; payeeAccountName?: string; destinationServiceName?: string; transactionId?: string }
export interface TranzakAccount { accountId: string; currencyCode: string; totalBalance?: number; availableBalance?: number }

@Injectable()
export class TranzakGateway implements PaymentGateway {
  private readonly logger = new Logger(TranzakGateway.name);
  private readonly appId: string;
  private readonly appKey: string;
  private readonly webhookAuthKey: string;
  private readonly client: AxiosInstance;

  /** ISO 4217 zero-decimal currencies supported by Tranzak */
  static readonly ZERO_DECIMAL = new Set(['XAF', 'XOF', 'RWF', 'UGX']);

  /** In-memory token cache — re-used until 60 s before expiry */
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private config: ConfigService) {
    this.appId = config.getOrThrow<string>('TRANZAK_APP_ID');
    this.appKey = config.getOrThrow<string>('TRANZAK_APP_KEY');
    this.webhookAuthKey = config.getOrThrow<string>('TRANZAK_WEBHOOK_AUTH_KEY');

    const baseURL = config.get<string>('TRANZAK_BASE_URL', 'https://dsapi.tranzak.me');
    this.client = axios.create({
      baseURL,
      headers: { 'Content-Type': 'application/json' },
      timeout: 20_000,
    });
  }

  // ── Checkout session ────────────────────────────────────────────────────

  async createCheckoutSession(input: CreateCheckoutInput): Promise<CheckoutSession> {
    const token = await this.getAccessToken();
    const currency = input.currency.toUpperCase();
    const amount = this.toApiAmount(input.amount, currency);

    if (input.mobileWalletNumber) {
      return this.createMobileWalletCharge(token, input, currency, amount);
    }
    return this.createWebRedirect(token, input, currency, amount);
  }

  // ── Web redirect (popup window) ─────────────────────────────────────────

  private async createWebRedirect(
    token: string,
    input: CreateCheckoutInput,
    currency: string,
    amount: number,
  ): Promise<CheckoutSession> {
    try {
      const res = await this.client.post(
        '/xp021/v1/request/create',
        {
          amount,
          currencyCode: currency,
          description: input.itemName.slice(0, 255),
          mchTransactionRef: input.tranzakSessionId, // TranzakSession.id ≤ 36 chars (UUID)
          returnUrl: input.successUrl,
          cancelUrl: input.cancelUrl,
          customization: {
            title: 'CareerPath Africa',
          },
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!res.data?.success) {
        const msg = res.data?.errorMsg ?? 'Tranzak payment creation failed';
        this.logger.error('Tranzak create request failed', res.data);
        throw new BadRequestException(msg);
      }

      const data = res.data.data;
      const requestId: string = data.requestId;
      const paymentAuthUrl: string = data.links?.paymentAuthUrl;

      if (!paymentAuthUrl) {
        this.logger.error('Tranzak did not return paymentAuthUrl', data);
        throw new BadRequestException('Tranzak did not return a checkout URL');
      }

      return { sessionId: requestId, url: paymentAuthUrl, gateway: 'tranzak' };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      const msg = err?.response?.data?.errorMsg ?? err?.message ?? 'Tranzak API error';
      this.logger.error('Tranzak createWebRedirect failed', msg);
      throw new BadRequestException(`Payment initiation failed: ${msg}`);
    }
  }

  // ── Direct mobile-wallet / USSD push ────────────────────────────────────

  private async createMobileWalletCharge(
    token: string,
    input: CreateCheckoutInput,
    currency: string,
    amount: number,
  ): Promise<CheckoutSession> {
    try {
      const res = await this.client.post(
        '/xp021/v1/request/create-mobile-wallet-charge',
        {
          amount,
          currencyCode: currency,
          description: input.itemName.slice(0, 255),
          mobileWalletNumber: input.mobileWalletNumber,
          mchTransactionRef: input.tranzakSessionId,
        },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      if (!res.data?.success) {
        const msg = res.data?.errorMsg ?? 'Tranzak mobile wallet charge failed';
        this.logger.error('Tranzak create-mobile-wallet-charge failed', res.data);
        throw new BadRequestException(msg);
      }

      const requestId: string = res.data.data.requestId;
      return { sessionId: requestId, url: null, gateway: 'tranzak', ussdPush: true };
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      const msg = err?.response?.data?.errorMsg ?? err?.message ?? 'Tranzak API error';
      this.logger.error('Tranzak createMobileWalletCharge failed', msg);
      throw new BadRequestException(`Mobile payment initiation failed: ${msg}`);
    }
  }

  // ── Webhook ─────────────────────────────────────────────────────────────

  /**
   * Tranzak authenticates webhooks via an `authKey` field inside the JSON body.
   * Compare it to TRANZAK_WEBHOOK_AUTH_KEY (set in dashboard → Webhooks → Auth Key).
   * The signatureHeader parameter is present for interface compatibility but ignored.
   */
  verifyWebhookSignature(rawBody: Buffer, _signatureHeader?: string): WebhookEvent {
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody.toString()) as Record<string, unknown>;
    } catch {
      throw new BadRequestException('Tranzak webhook: invalid JSON body');
    }

    const authKey = (payload as any).authKey as string | undefined;
    if (!authKey || authKey !== this.webhookAuthKey) {
      this.logger.warn('Tranzak webhook authKey mismatch — request rejected');
      throw new BadRequestException('Tranzak webhook: invalid authKey');
    }

    const eventType = (payload as any).eventType as string;
    return { gateway: 'tranzak', type: eventType, payload };
  }

  extractPurchaseCompleted(event: WebhookEvent): PurchaseCompletedEvent | null {
    // Only REQUEST.COMPLETED indicates a finalised payment
    if (event.type !== 'REQUEST.COMPLETED') return null;

    const resource = (event.payload as any).resource;
    if (!resource || resource.status !== 'SUCCESSFUL') return null;

    // mchTransactionRef = TranzakSession.id set at checkout creation
    const tranzakSessionId: string | undefined = resource.mchTransactionRef;
    if (!tranzakSessionId) {
      this.logger.warn('Tranzak webhook missing mchTransactionRef — cannot fulfill', resource.requestId);
      return null;
    }

    // resourceId is the Tranzak requestId — used as our sessionId / gatewayRef
    const sessionId: string = (event.payload as any).resourceId ?? resource.requestId;

    // Amount comes from payer.netAmountPaid (what the payer actually sent)
    const rawAmount: number = resource.payer?.netAmountPaid ?? resource.amount ?? 0;
    const currency: string = (resource.currencyCode ?? 'XAF').toUpperCase();
    const amountPaid = this.toMinorUnits(rawAmount, currency);

    return {
      sessionId,
      // studentId / packageId / courseId resolved by PaymentsService via TranzakSession lookup
      studentId: '',   // filled in by PaymentsService
      amountPaid,
      currency,
      gateway: 'tranzak',
      tranzakSessionId,
    };
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  /**
   * Convert internal minor-unit amount to the integer/decimal the Tranzak API expects.
   * Zero-decimal currencies (XAF, XOF, RWF, UGX): send as integer, no division.
   * Two-decimal currencies (TZS, MZN): divide by 100.
   */
  toApiAmount(amount: number, currency: string): number {
    if (TranzakGateway.ZERO_DECIMAL.has(currency)) return Math.round(amount);
    return Math.round(amount) / 100; // e.g. 50000 TZS cents → 500.00
  }

  /**
   * Convert Tranzak API amount back to internal minor units.
   */
  private toMinorUnits(amount: number, currency: string): number {
    if (TranzakGateway.ZERO_DECIMAL.has(currency)) return Math.round(amount);
    return Math.round(amount * 100);
  }

  private async getAccessToken(): Promise<string> {
    const now = Date.now();
    if (this.tokenCache && this.tokenCache.expiresAt > now + 60_000) {
      return this.tokenCache.token;
    }

    try {
      const res = await this.client.post('/auth/token', {
        appId: this.appId,
        appKey: this.appKey,
      });

      if (!res.data?.success) {
        throw new Error(res.data?.errorMsg ?? 'Auth failed');
      }

      const token: string = res.data.data.token;
      const expiresIn: number = res.data.data.expiresIn ?? 7200; // seconds

      this.tokenCache = { token, expiresAt: now + expiresIn * 1000 };
      return token;
    } catch (err: any) {
      this.tokenCache = null;
      const msg = err?.response?.data?.errorMsg ?? err?.message ?? 'unknown error';
      this.logger.error('Tranzak auth failed', msg);
      throw new BadRequestException(
        'Tranzak authentication failed — check TRANZAK_APP_ID / TRANZAK_APP_KEY',
      );
    }
  }

  // ── Payouts (disbursement scope) ────────────────────────────────────────

  private async call<T = any>(method: 'get' | 'post', path: string, body?: Record<string, unknown>): Promise<T> {
    const token = await this.getAccessToken();
    const res = method === 'get'
      ? await this.client.get(path, { params: body, headers: { Authorization: `Bearer ${token}` } })
      : await this.client.post(path, body ?? {}, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.data?.success) {
      const err: any = new Error(res.data?.errorMsg ?? res.data?.message ?? 'Tranzak refused the request');
      err.code = res.data?.errorCode;
      throw err;
    }
    return res.data.data as T;
  }

  /**
   * POST /xp021/v1/transfer/to-mobile-wallet — MTN Mobile Money or Orange Money in Cameroon, from the payout account.
   * customTransactionRef stops a retry from paying twice (unique for 30 days at Tranzak).
   */
  async transferToMobileWallet(o: { amount: number; currency: string; number: string; name?: string | null; verifyName: boolean; ref: string; description: string; note?: string; payeePaysFee: boolean }) {
    return this.call<TranzakTransfer>('post', '/xp021/v1/transfer/to-mobile-wallet', {
      amount: o.amount, currencyCode: o.currency, description: o.description.slice(0, 255), customTransactionRef: o.ref,
      payeeAccountId: o.number, ...(o.name ? { payeeAccountName: o.name } : {}), verifyPayeeName: o.verifyName && !!o.name,
      payeeNote: (o.note ?? 'CareerPath Africa earnings').slice(0, 100), payeeFeePercentage: o.payeePaysFee ? 100 : 0,
    });
  }

  /** GET /xp021/v1/transfer/details */
  transferDetails(transferId: string) { return this.call<TranzakTransfer>('get', '/xp021/v1/transfer/details', { transferId }); }

  /** GET /xp021/v1/transfer/history, filtered by our reference: finds a transfer whose reply never reached us */
  async transferByRef(ref: string): Promise<TranzakTransfer | null> {
    const d = await this.call<{ data?: TranzakTransfer[] } | TranzakTransfer[]>('get', '/xp021/v1/transfer/history', { customTransactionRef: ref });
    const list = Array.isArray(d) ? d : d?.data ?? [];
    return list.find(t => t.customTransactionRef === ref) ?? null;
  }

  /** Balances of the payout account (what transfers are paid from) and the collection account (what students paid) */
  async balances() {
    const [payout, collection] = await Promise.all([
      this.call<TranzakAccount>('post', '/xp021/v1/account/payout-account-details'),
      this.call<TranzakAccount>('post', '/xp021/v1/account/collection-account-details'),
    ]);
    const pick = (a: TranzakAccount) => ({ currency: a.currencyCode, total: a.totalBalance ?? 0, available: a.availableBalance ?? a.totalBalance ?? 0 });
    return { payout: pick(payout), collection: pick(collection) };
  }

  /** POST /xp021/v1/transfer/payout-account-topup — move money from the collection account into the payout account */
  topUpPayoutAccount(amount: number, currency: string, ref: string) {
    return this.call('post', '/xp021/v1/transfer/payout-account-topup', { amount, currencyCode: currency, description: 'Top up for earner payouts', customTransactionRef: ref });
  }

  /** POST /xp021/v1/name-verification/create — the name on an MTN or Orange number (restricted in production until Tranzak turns it on) */
  async checkName(number: string): Promise<{ status: 'match-ready' | 'pending' | 'failed'; name: string | null; requestId: string | null }> {
    const d = await this.call<{ requestId: string; status: string; verifiedName?: string }>('post', '/xp021/v1/name-verification/create', { accountHolderId: `+${number.replace(/^\+/, '')}` });
    let r = d;
    for (let i = 0; i < 4 && r.status === 'PENDING'; i++) {
      await new Promise(res => setTimeout(res, 1500));
      r = await this.call('get', '/xp021/v1/name-verification/details', { requestId: d.requestId });
    }
    return { status: r.status === 'COMPLETED' ? 'match-ready' : r.status === 'PENDING' ? 'pending' : 'failed', name: r.verifiedName ?? null, requestId: d.requestId };
  }

  /** GET /xp021/v1/request/details — Tranzak's record of a payment request */
  async lookup(requestId: string): Promise<GatewayLookup> {
    try {
      const token = await this.getAccessToken();
      const res = await this.client.get('/xp021/v1/request/details', { params: { requestId }, headers: { Authorization: `Bearer ${token}` }, timeout: 20_000 });
      const resource = res.data?.data;
      const s = String(resource?.status ?? '').toUpperCase();
      if (s === 'SUCCESSFUL') return { status: 'paid', event: { gateway: 'tranzak', type: 'REQUEST.COMPLETED', payload: { resourceId: requestId, resource } } };
      if (s === 'FAILED') return { status: 'failed', reason: resource?.errorMessage || 'Payment failed' };
      if (s === 'CANCELLED' || s === 'CANCELLED_BY_PAYER' || s === 'EXPIRED') return { status: 'abandoned', reason: 'The payer cancelled or let it expire' };
      return { status: 'pending' };
    } catch (err: any) {
      this.logger.warn(`Tranzak lookup failed for ${requestId}: ${err?.message}`);
      return { status: 'unknown', reason: 'Couldn’t reach Tranzak' };
    }
  }
}
