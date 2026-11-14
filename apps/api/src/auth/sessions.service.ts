import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { deviceOf } from './device';

const DAY = 86_400_000;
const TOUCH_EVERY = 5 * 60_000;
/** Longer than any token lives (7 days), so an ended sign-in never comes back */
const ENDED_TTL = 31 * 24 * 3600;
const endedKey = (sid: string) => `cpa:sid-end:${sid}`;

/** The sid in a signed-in request's token, which JwtStrategy puts on request.user */
export const sidOf = (user: unknown): string | undefined => (user as { sid?: string } | null)?.sid;

/**
 * Settings → Where you're signed in. Each sign-in gets an id (sid) in its token; the first request from it
 * records the browser, and later requests keep "last active" fresh. Forgetting one ends it straight away;
 * "Sign out everywhere else" ends all but the current one, including tokens from before sids existed.
 */
@Injectable()
export class SessionsService {
  private touched = new Map<string, number>();

  constructor(private prisma: PrismaService, private redis: RedisService) {}

  newSid(): string { return randomUUID(); }

  /** Called on signed-in requests; writes at most every 5 minutes per sign-in */
  touch(sid: string, userId: string, userAgent: string | undefined, ip: string | undefined) {
    const now = Date.now();
    if (now - (this.touched.get(sid) ?? 0) < TOUCH_EVERY) return;
    this.touched.set(sid, now);
    if (this.touched.size > 20_000) this.touched.clear();
    const ua = userAgent?.slice(0, 300) ?? null;
    this.prisma.userSession.upsert({
      where: { id: sid },
      create: { id: sid, userId, userAgent: ua, device: deviceOf(userAgent), ip: ip?.slice(0, 64) ?? null },
      update: { lastSeenAt: new Date(), userAgent: ua, device: deviceOf(userAgent), ip: ip?.slice(0, 64) ?? null },
    }).catch(() => {});
  }

  async isEnded(sid: string) { return !!(await this.redis.get(endedKey(sid))); }

  /** Admin two-step: remember this computer for 30 days */
  async trust(sid: string, userId: string) {
    const trustedUntil = new Date(Date.now() + 30 * DAY);
    await this.prisma.userSession.upsert({ where: { id: sid }, create: { id: sid, userId, trustedUntil }, update: { trustedUntil, endedAt: null } });
  }

  async isTrusted(sid: string, userId: string) {
    const s = await this.prisma.userSession.findUnique({ where: { id: sid }, select: { userId: true, trustedUntil: true, endedAt: true } });
    return !!s && s.userId === userId && !s.endedAt && !!s.trustedUntil && s.trustedUntil > new Date();
  }

  async list(userId: string, current?: string) {
    const rows = await this.prisma.userSession.findMany({
      where: { userId, endedAt: null, OR: [{ lastSeenAt: { gte: new Date(Date.now() - 8 * DAY) } }, { trustedUntil: { gt: new Date() } }] },
      orderBy: { lastSeenAt: 'desc' }, take: 30,
      select: { id: true, userAgent: true, device: true, createdAt: true, lastSeenAt: true, trustedUntil: true },
    });
    const user = await this.prisma.userProfile.findUnique({ where: { id: userId }, select: { signedOutAt: true } });
    return {
      current: current ?? null,
      sessions: rows.map(r => ({ ...r, current: r.id === current })).sort((a, b) => Number(b.current) - Number(a.current)),
      signedOutAt: user?.signedOutAt ?? null,
    };
  }

  /** Forget one sign-in: it stops working now, and a trusted computer asks for the code again */
  async end(userId: string, sid: string, current?: string) {
    if (sid === current) throw new BadRequestException('That’s this browser. Use Sign out instead.');
    const s = await this.prisma.userSession.findUnique({ where: { id: sid }, select: { userId: true } });
    if (!s || s.userId !== userId) throw new NotFoundException('Sign-in not found');
    await this.endMany([sid]);
    return { ended: true };
  }

  /** Signing out of this browser */
  async endCurrent(current?: string) {
    if (current) await this.endMany([current]);
    return { ended: true };
  }

  /** Every other sign-in stops working; the caller gets a fresh token for this one */
  async endOthers(userId: string, current?: string) {
    const others = await this.prisma.userSession.findMany({ where: { userId, endedAt: null, ...(current && { id: { not: current } }) }, select: { id: true } });
    await this.endMany(others.map(o => o.id));
    // Tokens issued before sids existed have nothing to end, so anything signed before now stops too.
    // A second's grace: the fresh token for this browser is signed within the same second.
    await this.prisma.userProfile.update({ where: { id: userId }, data: { signedOutAt: new Date(Date.now() - 1000) } });
    return others.length;
  }

  private async endMany(ids: string[]) {
    if (!ids.length) return;
    await this.prisma.userSession.updateMany({ where: { id: { in: ids } }, data: { endedAt: new Date(), trustedUntil: null } });
    await Promise.all(ids.map(id => this.redis.set(endedKey(id), '1', ENDED_TTL)));
  }
}
