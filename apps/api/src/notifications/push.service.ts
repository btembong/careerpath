import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as webpush from 'web-push';
import { PrismaService } from '../prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
  /** A portal path to open when tapped */
  url: string;
  /** Notifications with the same tag replace each other (a missed call replaces its ringing) */
  tag?: string;
  kind?: 'call' | 'notice';
  /** Stays on screen until tapped or dismissed (incoming calls) */
  requireInteraction?: boolean;
}

/**
 * Phone and computer notifications for people who don't have the portal open: every notice in the bell,
 * and incoming calls. Each device subscribes once (Settings, or the prompt); devices that unsubscribe or
 * uninstall are forgotten the first time a send to them fails.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private readonly key: string | null;

  constructor(private prisma: PrismaService, config: ConfigService) {
    const pub = config.get<string>('VAPID_PUBLIC_KEY'), priv = config.get<string>('VAPID_PRIVATE_KEY');
    this.key = pub && priv ? pub : null;
    if (pub && priv) webpush.setVapidDetails(config.get<string>('VAPID_SUBJECT') || 'mailto:support@careerpathafrica.com', pub, priv);
    else this.logger.warn('Push notifications are off: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set');
  }

  publicKey() { return { key: this.key }; }

  async subscribe(userId: string, sub: { endpoint?: string; keys?: { p256dh?: string; auth?: string } }, device?: string) {
    const endpoint = String(sub?.endpoint ?? '');
    if (!/^https:\/\//.test(endpoint) || !sub.keys?.p256dh || !sub.keys?.auth) throw new BadRequestException('That isn’t a push subscription');
    await this.prisma.pushSubscription.upsert({
      where: { endpoint },
      update: { userId, p256dh: sub.keys.p256dh, auth: sub.keys.auth, device: device?.slice(0, 120) ?? null },
      create: { userId, endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, device: device?.slice(0, 120) ?? null },
    });
    return { subscribed: true };
  }

  async unsubscribe(userId: string, endpoint: string) {
    await this.prisma.pushSubscription.deleteMany({ where: { userId, endpoint: String(endpoint ?? '') } });
    return { subscribed: false };
  }

  async devices(userId: string) {
    return this.prisma.pushSubscription.findMany({ where: { userId }, select: { device: true, createdAt: true, lastUsedAt: true }, orderBy: { createdAt: 'desc' } });
  }

  /** Fire-and-forget: a failed push must never fail what caused it */
  send(userIds: string[], payload: PushPayload) {
    if (!this.key || !userIds.length) return;
    this.deliver([...new Set(userIds)], payload).catch(err => this.logger.warn(`Push failed: ${err.message}`));
  }

  private async deliver(userIds: string[], payload: PushPayload) {
    const subs = await this.prisma.pushSubscription.findMany({ where: { userId: { in: userIds } } });
    const body = JSON.stringify({ ...payload, title: payload.title.slice(0, 120), body: payload.body.slice(0, 240) });
    const call = payload.kind === 'call';
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body, { TTL: call ? 45 : 24 * 3600, urgency: call ? 'high' : 'normal' });
        await this.prisma.pushSubscription.update({ where: { id: s.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
      } catch (err: any) {
        // Gone or no longer allowed: forget this device
        if ([404, 410].includes(err?.statusCode)) await this.prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
        else this.logger.warn(`Push to a device failed: ${err?.statusCode ?? err?.message}`);
      }
    }
  }
}
