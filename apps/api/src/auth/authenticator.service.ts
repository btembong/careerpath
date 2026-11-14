import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserProfile, UserRole } from '@prisma/client';
import * as QRCode from 'qrcode';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { MailService } from '../mail/mail.service';
import { AuditService } from '../audit/audit.service';
import { hashBackup, looksLikeBackup, matchStep, newBackupCodes, newSecret, otpauthUrl, seal, unseal } from './totp';

const DAY = 86_400_000;
/** Admins must have the app from this date (or 7 days after joining, if later) */
export const ADMIN_APP_REQUIRED_FROM = new Date('2026-11-21T00:00:00Z');
const setupKey = (userId: string) => `cpa:totp-setup:${userId}`;

/** Who can use an authenticator app: everyone but students. Admins must. */
export const canUseApp = (role: string) => role !== UserRole.STUDENT;
export const appDueAt = (u: { role: string; createdAt: Date }) =>
  u.role === UserRole.ADMIN ? new Date(Math.max(+ADMIN_APP_REQUIRED_FROM, +u.createdAt + 7 * DAY)) : null;

/**
 * Settings → Sign-in and security → Authenticator app. Setting up: a QR code to scan, then a code from the
 * app to prove it works, then 10 backup codes shown once. Signing in then asks for a code from the app;
 * a backup code or an emailed code also works.
 */
@Injectable()
export class AuthenticatorService {
  constructor(private prisma: PrismaService, private redis: RedisService, private mail: MailService, private audit: AuditService) {}

  async status(user: UserProfile) {
    const a = await this.prisma.userAuthenticator.findUnique({ where: { userId: user.id }, select: { backupCodes: true } });
    const due = appDueAt(user);
    return {
      available: canUseApp(user.role), enabled: !!user.totpEnabledAt && !!a, enabledAt: user.totpEnabledAt,
      backupLeft: a?.backupCodes.length ?? 0,
      required: user.role === UserRole.ADMIN, dueAt: due, overdue: !!due && !user.totpEnabledAt && Date.now() > +due,
    };
  }

  /** A new secret to scan. Nothing changes until a code from it is confirmed. */
  async start(user: UserProfile) {
    if (!canUseApp(user.role)) throw new ForbiddenException('Authenticator apps are for staff accounts.');
    const secret = newSecret();
    await this.redis.set(setupKey(user.id), seal(secret), 15 * 60);
    const url = otpauthUrl(secret, user.email);
    return { qr: await QRCode.toDataURL(url, { margin: 1, width: 220, errorCorrectionLevel: 'M' }), key: secret.match(/.{1,4}/g)!.join(' '), url };
  }

  /** The first code from the app: turns it on (or moves it to the new phone) and gives the backup codes */
  async confirm(user: UserProfile, code: string) {
    const sealed = await this.redis.get(setupKey(user.id));
    if (!sealed) throw new BadRequestException('That set-up has expired. Start again.');
    const step = matchStep(unseal(sealed), String(code ?? ''));
    if (step == null) throw new BadRequestException('That code isn’t right. Check the app shows CareerPath Africa and try the newest code.');
    const codes = newBackupCodes();
    const moved = !!user.totpEnabledAt;
    await this.prisma.$transaction([
      this.prisma.userAuthenticator.upsert({
        where: { userId: user.id },
        create: { userId: user.id, secret: sealed, backupCodes: codes.map(hashBackup), lastStep: step },
        update: { secret: sealed, backupCodes: codes.map(hashBackup), lastStep: step, createdAt: new Date() },
      }),
      this.prisma.userProfile.update({ where: { id: user.id }, data: { totpEnabledAt: new Date() } }),
    ]);
    await this.redis.del(setupKey(user.id));
    this.audit.log(user.id, moved ? 'authenticator.moved' : 'authenticator.on', 'UserProfile', user.id);
    this.alert(user, moved ? 'Your authenticator app was moved to a new phone' : 'Authenticator app turned on',
      moved ? 'Sign-in codes now come from the authenticator app on your new phone. The old one no longer works.' : 'From now on, after your password we’ll ask for a code from your authenticator app. You can still use a backup code, or ask for a code by email.');
    return { backupCodes: codes };
  }

  /** New backup codes; the old ones stop working */
  async newBackupCodes(user: UserProfile, code: string) {
    await this.check(user, code, false);
    const codes = newBackupCodes();
    await this.prisma.userAuthenticator.update({ where: { userId: user.id }, data: { backupCodes: codes.map(hashBackup) } });
    this.audit.log(user.id, 'authenticator.backup-codes', 'UserProfile', user.id);
    return { backupCodes: codes };
  }

  /** Switch it off (not for admins: they must have it) */
  async disable(user: UserProfile, code: string) {
    if (user.role === UserRole.ADMIN) throw new ForbiddenException('Admins must keep an authenticator app. To use a new phone, choose Move to a new phone.');
    await this.check(user, code, true);
    await this.prisma.$transaction([
      this.prisma.userAuthenticator.deleteMany({ where: { userId: user.id } }),
      this.prisma.userProfile.update({ where: { id: user.id }, data: { totpEnabledAt: null } }),
    ]);
    this.audit.log(user.id, 'authenticator.off', 'UserProfile', user.id);
    this.alert(user, 'Authenticator app turned off', 'Signing in no longer asks for a code from your authenticator app. If this wasn’t you, change your password and contact support.');
    return { enabled: false };
  }

  /** An admin clears someone's app (a lost phone). They set it up again at their next sign-in. */
  async reset(admin: UserProfile, userId: string) {
    const u = await this.prisma.userProfile.findUnique({ where: { id: userId } });
    if (!u) throw new NotFoundException('Person not found');
    if (u.id === admin.id) throw new BadRequestException('Ask another admin to reset your own app.');
    await this.prisma.$transaction([
      this.prisma.userAuthenticator.deleteMany({ where: { userId } }),
      this.prisma.userProfile.update({ where: { id: userId }, data: { totpEnabledAt: null } }),
    ]);
    this.audit.log(admin.id, 'authenticator.reset', 'UserProfile', userId);
    this.alert(u, 'Your authenticator app was reset', 'An admin reset your authenticator app. Signing in will email you a code until you set the app up again in Settings → Sign-in and security.');
    return { reset: true };
  }

  /**
   * A code from the app, or a backup code (used up). For signing in and for changes in Settings.
   * Returns how it matched, or null.
   */
  async verify(userId: string, code: string): Promise<'app' | 'backup' | null> {
    const a = await this.prisma.userAuthenticator.findUnique({ where: { userId } });
    if (!a) return null;
    const c = String(code ?? '').trim();
    const step = matchStep(unseal(a.secret), c, a.lastStep);
    if (step != null) {
      // Only one sign-in per code: the step is claimed atomically
      const r = await this.prisma.userAuthenticator.updateMany({ where: { userId, OR: [{ lastStep: null }, { lastStep: { lt: step } }] }, data: { lastStep: step } });
      return r.count ? 'app' : null;
    }
    if (looksLikeBackup(c)) {
      const h = hashBackup(c);
      if (!a.backupCodes.includes(h)) return null;
      await this.prisma.userAuthenticator.update({ where: { userId }, data: { backupCodes: a.backupCodes.filter(x => x !== h) } });
      return 'backup';
    }
    return null;
  }

  async hasApp(userId: string) {
    return !!(await this.prisma.userAuthenticator.findUnique({ where: { userId }, select: { userId: true } }));
  }

  private async check(user: UserProfile, code: string, allowBackup: boolean) {
    if (!user.totpEnabledAt) throw new BadRequestException('The authenticator app isn’t on.');
    const how = await this.verify(user.id, code);
    if (!how || (how === 'backup' && !allowBackup)) throw new BadRequestException('That code isn’t right. Use the newest code from the app.');
  }

  private alert(u: { email: string; firstName?: string | null }, title: string, text: string) {
    this.mail.sendNotice(u.email, title, { badge: 'Security', title, firstName: u.firstName, text, href: '/settings#security', cta: 'Open Settings' }, 'security').catch(() => {});
  }
}
