import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { resolvePrefs } from './notification-prefs';

export type NotificationType = 'live' | 'assignment' | 'grade' | 'certificate' | 'message' | 'community' | 'system';
const AUDIENCES = ['ALL', 'STUDENT', 'TEACHER', 'COUNTRY_REP', 'SUBJECT_REVIEWER'] as const;
const CHANNELS = ['IN_APP', 'EMAIL', 'BOTH'] as const;

interface NewNotification {
  type: NotificationType;
  title: string;
  body: string;
  href?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private prisma: PrismaService, private mail: MailService) {}

  /** Fire-and-forget from business flows: a failed notification must never fail the action that caused it. */
  notify(userIds: string | string[], n: NewNotification): void {
    const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])];
    if (!ids.length) return;
    // Respect Settings → Notifications; system notices always go through
    const recipients = n.type === 'system' ? Promise.resolve(ids) : this.prisma.userProfile
      .findMany({ where: { id: { in: ids } }, select: { id: true, notificationPrefs: true } })
      .then(users => users.filter(u => resolvePrefs(u.notificationPrefs)[n.type]?.inApp !== false).map(u => u.id));
    recipients
      .then(to => to.length ? this.prisma.notification.createMany({ data: to.map(userId => ({ userId, ...n })) }) : null)
      .catch(err => this.logger.warn(`Notification "${n.title}" failed: ${err.message}`));
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

  listBroadcasts() {
    return this.prisma.broadcast.findMany({
      orderBy: { sentAt: 'desc' },
      take: 50,
      select: { id: true, title: true, body: true, audience: true, channel: true, sentAt: true, recipientCount: true },
    });
  }
}
