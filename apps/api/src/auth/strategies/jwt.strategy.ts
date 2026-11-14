import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtPayload } from '@cpa/shared';
import { deviceOf } from '../device';
import { SessionsService } from '../sessions.service';

export { deviceOf };

const SEEN_EVERY = 5 * 60_000;

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
    private sessions: SessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: JwtPayload & { sid?: string }) {
    const user = await this.prisma.userProfile.findUnique({
      where: { id: payload.sub },
    });
    // Deleted accounts can’t keep using an old sign-in
    if (!user || user.deletedAt) throw new UnauthorizedException();
    // Settings → Sign out everywhere else, or Forget on one sign-in
    if (user.signedOutAt && payload.iat * 1000 < +user.signedOutAt) throw new UnauthorizedException();
    if (payload.sid && (await this.sessions.isEnded(payload.sid))) throw new UnauthorizedException();
    this.seen(user.id, user.lastSeenAt, req.headers['user-agent']);
    if (payload.sid) this.sessions.touch(payload.sid, user.id, req.headers['user-agent'], req.ip);
    return Object.assign(user, { sid: payload.sid }); // attached as request.user
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
