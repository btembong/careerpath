import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { createHash } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';

const DAY = 24 * 3600 * 1000;
/** Emails, phone numbers and long digit runs never get stored with an error */
const scrub = (s: string) => s
  .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
  .replace(/\+?\d[\d\s-]{7,}\d/g, '[number]');
/** Same cause, same group: ids, numbers and quoted values don't split a group */
const normal = (s: string) => s
  .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, ':id')
  .replace(/\b\d+\b/g, 'N')
  .replace(/(["'`]).{0,80}?\1/g, '"…"')
  .trim();

export function browserOf(ua?: string | null): string {
  if (!ua) return 'Unknown';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iPhone' : /Windows/i.test(ua) ? 'Windows' : /Mac OS/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'other';
  const b = /OPR\/|Opera Mini/i.test(ua) ? (/Opera Mini/i.test(ua) ? 'Opera Mini' : 'Opera') : /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/i.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${b} on ${os}`;
}

/** Catches what breaks in the portal and the API, groups it by cause, and tells admins about new kinds once. */
@Injectable()
export class ErrorsService {
  private readonly logger = new Logger(ErrorsService.name);
  constructor(private prisma: PrismaService, private mail: MailService) {}

  async record(e: { source: 'PORTAL' | 'API'; message: string; where: string; stack?: string | null; userId?: string | null; userAgent?: string | null }) {
    try {
      const message = scrub(String(e.message ?? 'Unknown error')).slice(0, 500);
      const where = scrub(String(e.where ?? '')).slice(0, 200);
      const fingerprint = createHash('sha1').update(`${e.source}|${normal(where)}|${normal(message)}`).digest('hex');
      const browser = e.source === 'PORTAL' ? browserOf(e.userAgent) : null;
      const existing = await this.prisma.errorEvent.findUnique({ where: { fingerprint } });
      let id: string;
      if (!existing) {
        const created = await this.prisma.errorEvent.create({ data: {
          fingerprint, source: e.source, message, where: normal(where), stack: e.stack ? scrub(e.stack).slice(0, 4000) : null,
          userIds: e.userId ? [e.userId] : [], browsers: browser ? { [browser]: 1 } : Prisma.JsonNull,
        } });
        id = created.id;
        this.tellAdmins(created.id).catch(() => {});
      } else {
        const browsers = (existing.browsers && typeof existing.browsers === 'object' ? existing.browsers : {}) as Record<string, number>;
        if (browser) browsers[browser] = (browsers[browser] ?? 0) + 1;
        const userIds = e.userId && !existing.userIds.includes(e.userId) && existing.userIds.length < 50 ? [...existing.userIds, e.userId] : existing.userIds;
        await this.prisma.errorEvent.update({ where: { id: existing.id }, data: {
          count: { increment: 1 }, lastSeen: new Date(), userIds, browsers,
          // Marked fixed but it happened again: it's open again
          ...(existing.status === 'FIXED' ? { status: 'OPEN' } : {}),
          ...(e.stack && !existing.stack ? { stack: scrub(e.stack).slice(0, 4000) } : {}),
        } });
        id = existing.id;
      }
      await this.prisma.errorHit.create({ data: { errorId: id, userId: e.userId ?? null } });
    } catch (err: any) {
      // Never let error tracking cause an error
      this.logger.warn(`Could not record an error: ${err.message}`);
    }
  }

  /** A new kind of error emails the admins once */
  private async tellAdmins(id: string) {
    const e = await this.prisma.errorEvent.findUnique({ where: { id } });
    if (!e || e.notifiedAt) return;
    await this.prisma.errorEvent.update({ where: { id }, data: { notifiedAt: new Date() } });
    const admins = await this.prisma.userProfile.findMany({ where: { role: 'ADMIN', deletedAt: null }, select: { email: true } });
    const portal = (process.env.PORTAL_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    for (const a of admins) {
      this.mail.sendAnnouncement(a.email, `New error in the ${e.source === 'API' ? 'API' : 'portal'}: ${e.message.slice(0, 80)}`,
        `Where: ${e.where}\n\nSee how often it happens and who it affects: ${portal}/admin/errors`).catch(() => {});
    }
  }

  async list(status = 'OPEN') {
    if (!['OPEN', 'FIXED', 'IGNORED'].includes(status)) throw new BadRequestException('Unknown status');
    const since = new Date(Date.now() - DAY), before = new Date(Date.now() - 2 * DAY);
    const [rows, hits24, hitsPrev, people, newToday] = await Promise.all([
      this.prisma.errorEvent.findMany({ where: { status }, orderBy: { lastSeen: 'desc' }, take: 200 }),
      this.prisma.errorHit.count({ where: { at: { gte: since } } }),
      this.prisma.errorHit.count({ where: { at: { gte: before, lt: since } } }),
      this.prisma.errorHit.findMany({ where: { at: { gte: since }, userId: { not: null } }, distinct: ['userId'], select: { userId: true } }),
      this.prisma.errorEvent.count({ where: { firstSeen: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    ]);
    return {
      tiles: { last24: hits24, dayBefore: hitsPrev, people: people.length, newToday },
      rows: rows.map(r => ({
        id: r.id, source: r.source, message: r.message, where: r.where, stack: r.stack, count: r.count,
        people: r.userIds.length, userIds: r.userIds.slice(0, 10), browsers: r.browsers, status: r.status,
        firstSeen: r.firstSeen, lastSeen: r.lastSeen, isNew: Date.now() - +r.firstSeen < DAY,
      })),
    };
  }

  async setStatus(id: string, status: string) {
    if (!['OPEN', 'FIXED', 'IGNORED'].includes(status)) throw new BadRequestException('Unknown status');
    const r = await this.prisma.errorEvent.updateMany({ where: { id }, data: { status } });
    if (!r.count) throw new NotFoundException('Error not found');
    return { status };
  }

  /** Occurrences are kept 30 days */
  @Cron('40 3 * * *')
  async prune() {
    await this.prisma.errorHit.deleteMany({ where: { at: { lt: new Date(Date.now() - 30 * DAY) } } });
  }
}
