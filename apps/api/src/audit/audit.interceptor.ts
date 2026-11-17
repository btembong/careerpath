import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { Observable, tap } from 'rxjs';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { AuditService } from './audit.service';
import { currentRequest } from './context';
import { areaOfPath, ROUTE_RULES, SKIP } from './routes';

/** Whose changes are recorded automatically. Teachers' own course editing isn't (their explicit events still are). */
const STAFF = new Set(['ADMIN', 'COUNTRY_REP', 'SUBJECT_REVIEWER', 'ORG_ADMIN']);
const WRITES = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Every change a staff member makes goes into the activity log, even where no one wrote a log line: after a
 * successful write, if the request didn't log anything itself, an entry is made from ROUTE_RULES (a plain sentence
 * and the item) or, for a route not in the map, a generic one. The request body is never stored, only its field names.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private audit: AuditService, private prisma: PrismaService, private redis: RedisService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<Request & { user?: { id: string; role: string } }>();
    const ctx = currentRequest();
    if (ctx && req.user?.id) ctx.user = { id: req.user.id, role: req.user.role };
    if (!WRITES.has(req.method) || !req.user || !STAFF.has(req.user.role)) return next.handle();
    const path = (req.route?.path ?? req.path).replace(/^\/api\/v1/, '').replace(/\/+/g, '/');
    if (SKIP.some(re => re.test(path))) return next.handle();
    const user = req.user;
    return next.handle().pipe(tap(result => {
      if (currentRequest()?.audited) return;
      this.write(user, req.method, path, req.params ?? {}, req.body, result).catch(() => {});
    }));
  }

  private async write(user: { id: string; role: string }, method: string, path: string, params: Record<string, string>, body: any, result: any) {
    const key = `${method} ${path}`;
    const rule = ROUTE_RULES[key];
    const t = rule?.target;
    const targetId = t ? (t.fromResult ? result?.id : params[t.param ?? 'id']) : undefined;
    if (rule?.dedupe) {
      const k = `cpa:audit-dedupe:${user.id}:${key}:${targetId ?? ''}`;
      if (await this.redis.get(k)) return;
      await this.redis.set(k, '1', 15 * 60);
    }
    const label = t && targetId ? await this.labelOf(t.type, targetId, result) : null;
    const quoted = label ? `“${label}”` : t ? 'an item' : '';
    this.audit.record({
      actorId: user.id,
      action: rule ? `route:${key}` : `route:${key}`,
      area: rule?.area ?? areaOfPath(path),
      summary: rule ? rule.say({ label: quoted, body: body ?? {}, result }) : `Made a change (${method} ${path})`,
      targetType: t?.type, targetId: typeof targetId === 'string' ? targetId : undefined, targetLabel: label,
      metadata: { method, route: path, params, fields: body && typeof body === 'object' ? Object.keys(body).slice(0, 30) : [] },
    });
  }

  private async labelOf(type: string, id: string, result: any): Promise<string | null> {
    try {
      switch (type) {
        case 'PlatformCourse': return (await this.prisma.platformCourse.findUnique({ where: { id }, select: { title: true } }))?.title ?? null;
        case 'Package': return result?.name ?? (await this.prisma.package.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
        case 'Coupon': return result?.code ?? (await this.prisma.coupon.findUnique({ where: { id }, select: { code: true } }))?.code ?? null;
        case 'Cohort': return (await this.prisma.cohort.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
        case 'Country': return (await this.prisma.country.findUnique({ where: { id }, select: { name: true } }))?.name ?? null;
        case 'UserProfile': {
          const u = await this.prisma.userProfile.findUnique({ where: { id }, select: { name: true, firstName: true, lastName: true, email: true } });
          return u ? [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email : null;
        }
      }
    } catch { /* a missing item just has no name */ }
    return null;
  }
}
