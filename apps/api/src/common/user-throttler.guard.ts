import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Rate limits count per signed-in person, not per internet address. A school lab, an office or a mobile network
 * often puts many people behind one address, and counting them together would lock everyone out at once.
 * People who aren't signed in (sign-in, sign-up, public pages) are still counted by address.
 *
 * The token's signature is checked before it is trusted, so a made-up token can't be used to dodge the limit.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected async getTracker(req: Record<string, any>): Promise<string> {
    const address = req.ips?.length ? req.ips[0] : req.ip;
    // Sign-in, sign-up, codes and password resets always count by address, so extra accounts can't buy extra tries
    if (String(req.originalUrl ?? req.url ?? '').includes('/auth/')) return address;
    const user = signedInUser(req.headers?.authorization);
    return user ? `user:${user}` : address;
  }
}

function signedInUser(header: unknown): string | null {
  const secret = process.env.JWT_SECRET;
  if (!secret || typeof header !== 'string' || !header.startsWith('Bearer ')) return null;
  const parts = header.slice(7).split('.');
  if (parts.length !== 3) return null;
  try {
    const expected = createHmac('sha256', secret).update(`${parts[0]}.${parts[1]}`).digest();
    const given = Buffer.from(parts[2], 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (typeof payload?.sub !== 'string' || (payload.exp && payload.exp * 1000 < Date.now())) return null;
    return payload.sub;
  } catch {
    return null;
  }
}
