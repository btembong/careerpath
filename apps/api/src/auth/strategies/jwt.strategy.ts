import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '@cpa/shared';

const SEEN_EVERY = 5 * 60_000;

/** phone, tablet or computer, from the browser's user agent */
export function deviceOf(ua: string | undefined): string {
  const s = ua ?? '';
  if (/iPad|Tablet|Nexus (7|9|10)|SM-T|Kindle|Silk/i.test(s) || (/Android/i.test(s) && !/Mobile/i.test(s))) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Opera Mini|IEMobile/i.test(s)) return 'phone';
  return 'computer';
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload) {
    const user = await this.prisma.userProfile.findUnique({
      where: { id: payload.sub },
    });
    // Deleted accounts can’t keep using an old sign-in
    if (!user || user.deletedAt) throw new UnauthorizedException();
    this.seen(user.id, user.lastSeenAt, req.headers['user-agent']);
    return user; // attached as request.user
  }

  /** When they last used the portal and on what, and a row for each day they did (never slows the request) */
  private seen(userId: string, last: Date | null, ua: string | undefined) {
    const now = new Date();
    if (last && +now - +last < SEEN_EVERY && last.toDateString() === now.toDateString()) return;
    const device = deviceOf(ua);
    const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    Promise.all([
      this.prisma.userProfile.update({ where: { id: userId }, data: { lastSeenAt: now, lastDevice: device } }),
      this.prisma.activeDay.upsert({ where: { userId_day: { userId, day } }, create: { userId, day, device }, update: { device } }),
    ]).catch(() => {});
  }
}
