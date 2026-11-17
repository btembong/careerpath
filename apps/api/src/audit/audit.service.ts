import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { browserOn, currentRequest } from './context';
import { GeoService } from './geo.service';

export type Area = 'People' | 'Courses' | 'Money' | 'Selling' | 'Sign-in' | 'Settings';
export const AREAS: Area[] = ['People', 'Courses', 'Money', 'Selling', 'Sign-in', 'Settings'];

/** Which area an action belongs to, from its name */
export function areaOf(action: string): Area {
  if (/^(signin|session|password|authenticator)\b/.test(action)) return 'Sign-in';
  if (/^(payout|payouts|payment|wallet|commission|course\.commission|cohort\.rates|mentorship\.rates|refund|settlement)/.test(action)) return 'Money';
  if (/^(package|coupon|addon|org)/.test(action)) return 'Selling';
  if (/^(course|courses|wp-pull|tutor-import|question|mock|lesson|module|classify)/.test(action)) return 'Courses';
  if (/^(teacher|user|role|account|tutor-agreement|people|cohort|live)/.test(action)) return 'People';
  return 'Settings';
}

export interface AuditEntry {
  action: string;
  summary?: string;
  area?: Area;
  actorId?: string | null;
  targetType?: string;
  targetId?: string;
  targetLabel?: string | null;
  before?: object;
  after?: object;
  metadata?: object;
}

const nameOf = (u: { name: string | null; firstName: string | null; lastName: string | null; email: string }) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email;

/**
 * The activity log. Every entry gets who (the signed-in person unless given), their role, the device, the IP
 * address and the city and country it's in. Writes never block or fail the action they record.
 */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService, private geo: GeoService, private mail: MailService) {}

  log(
    actorId: string | null,
    action: string,
    targetType?: string,
    targetId?: string,
    before?: object,
    after?: object,
    metadata?: object,
  ): void {
    this.record({ action, actorId, targetType, targetId, before, after, metadata });
  }

  /** An entry with a plain sentence for the Activity log */
  record(e: AuditEntry): void {
    const ctx = currentRequest();
    if (ctx) ctx.audited = true;
    // A missing actor is whoever is signed in; with nobody signed in (a nightly job) it stays empty: "system"
    const actorId = e.actorId ?? ctx?.user?.id ?? null;
    const role = ctx?.user && ctx.user.id === actorId ? ctx.user.role : null;
    const place = this.geo.place(ctx?.ip);
    void (async () => {
      const actorRole = role ?? (actorId ? (await this.prisma.userProfile.findUnique({ where: { id: actorId }, select: { role: true } }))?.role ?? null : null);
      // An admin signing in from a country they've never signed in from: flag it and tell the admins
      let metadata = e.metadata;
      if (e.action === 'signin' && actorRole === 'ADMIN' && actorId && place?.countryCode) {
        const before = await this.prisma.auditLog.findMany({ where: { actorId, action: 'signin', countryCode: { not: null } }, select: { countryCode: true }, distinct: ['countryCode'] });
        if (before.length && !before.some(b => b.countryCode === place.countryCode)) {
          metadata = { ...(metadata ?? {}), newCountry: true, usual: before.map(b => b.countryCode) };
          this.newCountryAlert(actorId, place, browserOn(ctx?.userAgent)).catch(() => {});
        }
      }
      await this.prisma.auditLog.create({
        data: {
          actorId, actorRole, action: e.action, area: e.area ?? areaOf(e.action), summary: e.summary?.slice(0, 500) ?? null,
          targetType: e.targetType, targetId: e.targetId, targetLabel: e.targetLabel?.slice(0, 200) ?? null,
          before: e.before ?? undefined, after: e.after ?? undefined, metadata: metadata ?? undefined,
          ip: ctx?.ip ?? null, device: browserOn(ctx?.userAgent),
          city: place?.city ?? null, country: place?.country ?? null, countryCode: place?.countryCode ?? null,
        },
      });
    })().catch(() => {});
  }

  /** Every admin is emailed when an admin signs in from a new country */
  private async newCountryAlert(actorId: string, place: { city: string | null; country: string | null }, device: string | null) {
    const [who, usual, admins] = await Promise.all([
      this.prisma.userProfile.findUnique({ where: { id: actorId }, select: { name: true, firstName: true, lastName: true, email: true } }),
      this.prisma.auditLog.groupBy({ by: ['city', 'country'], where: { actorId, action: 'signin', country: { not: null } }, _count: { _all: true }, orderBy: { _count: { country: 'desc' } }, take: 1 }),
      this.prisma.userProfile.findMany({ where: { role: 'ADMIN', deletedAt: null }, select: { email: true, firstName: true } }),
    ]);
    if (!who) return;
    const where = [place.city, place.country].filter(Boolean).join(', ');
    const was = usual[0] ? [usual[0].city, usual[0].country].filter(Boolean).join(', ') : null;
    const time = new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Douala' });
    for (const a of admins) {
      await this.mail.sendNotice(a.email, `New sign-in to an admin account from ${where}`, {
        badge: 'Security', title: `New sign-in to an admin account from ${where}`, firstName: a.firstName,
        text: `${nameOf(who)} signed in at ${time} (West Africa Time) from ${where}${device ? ` (${device})` : ''}.${was ? ` They usually sign in from ${was}.` : ''}\n\nIf this wasn’t them, sign their account out everywhere and reset their authenticator app from People.`,
        cta: 'Open the Activity log', href: '/admin/activity?area=Sign-in',
      }, 'security').catch(() => {});
    }
  }
}
