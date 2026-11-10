import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import type { NoticeOpts } from '../mail/mail.templates';
import { resolvePrefs } from './notification-prefs';
import { PushService } from './push.service';
import { PresenceService } from './presence.service';

export type NotificationType = 'live' | 'assignment' | 'grade' | 'certificate' | 'message' | 'community' | 'system';
const AUDIENCES = ['ALL', 'STUDENT', 'TEACHER', 'COUNTRY_REP', 'SUBJECT_REVIEWER'] as const;
const CHANNELS = ['IN_APP', 'EMAIL', 'BOTH'] as const;

interface NewNotification {
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
  /** Push only: notifications with the same tag replace each other on the phone (a missed call replaces its ringing) */
  pushTag?: string;
}

/** An email to send with the notice. The button goes to the notice's link unless `href` says otherwise. */
export interface NoticeEmail extends Omit<NoticeOpts, 'firstName' | 'href'> {
  subject: string;
  href?: string;
  /** Settings → Notifications kind that can switch this email off; left out = always sent (account, money, reviews) */
  kind?: string;
  /** Only email people for whom this is true (e.g. not online right now) */
  onlyIf?: (userId: string) => boolean;
  sender?: 'system' | 'support' | 'billing' | 'partnerships';
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService, private mail: MailService, private push: PushService, private presence: PresenceService) {}

  /** Fire-and-forget from business flows: a failed notification must never fail the action that caused it. */
  notify(userIds: string | string[], n: NewNotification, email?: NoticeEmail): void {
    const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])];
    if (!ids.length) return;
    if (email) this.emailNotice(ids, n, email).catch(err => this.logger.warn(`Email "${email.subject}" failed: ${err.message}`));
    // Respect Settings → Notifications; system notices always go through
    const recipients = n.type === 'system' ? Promise.resolve(ids) : this.prisma.userProfile
      .findMany({ where: { id: { in: ids } }, select: { id: true, notificationPrefs: true } })
      .then(users => users.filter(u => resolvePrefs(u.notificationPrefs)[n.type]?.inApp !== false).map(u => u.id));
    const { pushTag, ...row } = n;
    recipients
      .then(async to => {
        if (!to.length) return;
        await this.prisma.notification.createMany({ data: to.map(userId => ({ userId, ...row })) });
        // Anyone without the portal open also gets it on their phone or computer
        this.push.send(to.filter(id => !this.presence.isOnline(id)), { title: n.title, body: n.body, url: n.href || '/', tag: pushTag ?? n.type });
      })
      .catch(err => this.logger.warn(`Notification "${n.title}" failed: ${err.message}`));
  }

  /** One by one on purpose: Brevo rate-limits bursts */
  private async emailNotice(ids: string[], n: NewNotification, e: NoticeEmail) {
    const href = e.href ?? n.href ?? '/';
    const users = await this.prisma.userProfile.findMany({
      where: { id: { in: ids }, deletedAt: null }, select: { id: true, email: true, firstName: true, notificationPrefs: true },
    });
    const { subject, kind, onlyIf, sender, ...opts } = e;
    for (const u of users) {
      if (kind && resolvePrefs(u.notificationPrefs)[kind]?.email === false) continue;
      if (onlyIf && !onlyIf(u.id)) continue;
      await this.mail.sendNotice(u.email, subject, { ...opts, href, firstName: u.firstName }, sender);
    }
  }

  /** Whether a user wants emails of this kind (Settings → Notifications). */
  async wantsEmail(userId: string, kind: string): Promise<boolean> {
    const u = await this.prisma.userProfile.findUnique({ where: { id: userId }, select: { notificationPrefs: true } });
    return resolvePrefs(u?.notificationPrefs)[kind]?.email !== false;
  }

  // ── Inbox ────────────────────────────────────────────────

  list(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, type: true, title: true, body: true, href: true, readAt: true, createdAt: true },
    });
  }

  async unreadCount(userId: string) {
    return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  async markRead(userId: string, id: string) {
    const { count } = await this.prisma.notification.updateMany({ where: { id, userId, readAt: null }, data: { readAt: new Date() } });
    if (!count && !(await this.prisma.notification.count({ where: { id, userId } }))) throw new NotFoundException('Notification not found');
    return { read: true };
  }

  async markAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } });
    return { updated: count };
  }

  async remove(userId: string, id: string) {
    const { count } = await this.prisma.notification.deleteMany({ where: { id, userId } });
    if (!count) throw new NotFoundException('Notification not found');
    return { deleted: true };
  }

  // ── Admin broadcasts ─────────────────────────────────────

  async broadcast(adminId: string, dto: { title?: string; body?: string; audience?: string; channel?: string; countryId?: string }) {
    const title = dto.title?.trim() ?? '';
    const body = dto.body?.trim() ?? '';
    if (title.length < 3 || title.length > 120) throw new BadRequestException('Title must be 3–120 characters.');
    if (body.length < 3 || body.length > 2000) throw new BadRequestException('Message must be 3–2000 characters.');
    const audience = (dto.audience ?? 'ALL') as (typeof AUDIENCES)[number];
    const channel = (dto.channel ?? 'IN_APP') as (typeof CHANNELS)[number];
    if (!AUDIENCES.includes(audience)) throw new BadRequestException('Unknown audience.');
    if (!CHANNELS.includes(channel)) throw new BadRequestException('Unknown channel.');

    const where: Prisma.UserProfileWhereInput = {
      approvalStatus: 'APPROVED',
      ...(audience !== 'ALL' && { role: audience as UserRole }),
      ...(dto.countryId && { countryId: dto.countryId }),
    };
    const recipients = await this.prisma.userProfile.findMany({ where, select: { id: true, email: true, notificationPrefs: true } });

    const sent = await this.prisma.broadcast.create({
      data: { title, body, audience, channel, countryId: dto.countryId ?? null, sentById: adminId, recipientCount: recipients.length },
    });

    if (channel !== 'EMAIL' && recipients.length) {
      await this.prisma.notification.createMany({
        data: recipients.map(r => ({ userId: r.id, type: 'system', title, body, broadcastId: sent.id })),
      });
      this.push.send(recipients.filter(r => resolvePrefs(r.notificationPrefs).news?.inApp !== false && !this.presence.isOnline(r.id)).map(r => r.id), { title, body, url: '/', tag: `news-${sent.id}` });
    }
    if (channel !== 'IN_APP') {
      // Sequential on purpose: Brevo rate-limits bursts. Runs after the response is sent.
      void (async () => {
        for (const r of recipients) {
          if (resolvePrefs(r.notificationPrefs).news.email) await this.mail.sendAnnouncement(r.email, title, body);
        }
      })();
    }
    return { id: sent.id, recipientCount: recipients.length };
  }

  /** How many people an announcement to this audience would reach, before sending it */
  async reach(audience?: string, countryId?: string) {
    const a = (audience ?? 'ALL') as (typeof AUDIENCES)[number];
    if (!AUDIENCES.includes(a)) throw new BadRequestException('Unknown audience.');
    const count = await this.prisma.userProfile.count({ where: { approvalStatus: 'APPROVED', ...(a !== 'ALL' && { role: a as UserRole }), ...(countryId && { countryId }) } });
    return { count };
  }

  listBroadcasts() {
    return this.prisma.broadcast.findMany({
      orderBy: { sentAt: 'desc' },
      take: 50,
      select: { id: true, title: true, body: true, audience: true, channel: true, sentAt: true, recipientCount: true, countryId: true },
    });
  }
}
