import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { browserOn, currentRequest } from './context';

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

/**
 * The activity log. Every entry gets who (the signed-in person unless given), their role, the device and the IP
 * address from the request. Writes never block or fail the action they record.
 */
@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

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
    void (async () => {
      const actorRole = role ?? (actorId ? (await this.prisma.userProfile.findUnique({ where: { id: actorId }, select: { role: true } }))?.role ?? null : null);
      await this.prisma.auditLog.create({
        data: {
          actorId, actorRole, action: e.action, area: e.area ?? areaOf(e.action), summary: e.summary?.slice(0, 500) ?? null,
          targetType: e.targetType, targetId: e.targetId, targetLabel: e.targetLabel?.slice(0, 200) ?? null,
          before: e.before ?? undefined, after: e.after ?? undefined, metadata: e.metadata ?? undefined,
          ip: ctx?.ip ?? null, device: browserOn(ctx?.userAgent),
        },
      });
    })().catch(() => {});
  }
}
