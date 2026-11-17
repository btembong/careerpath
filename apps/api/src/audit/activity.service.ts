import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AREAS, areaOf } from './audit.service';

const DAY = 86_400_000;
export interface ActivityQuery { q?: string; actorId?: string; area?: string; from?: string; to?: string; targetType?: string; targetId?: string; person?: string; cursor?: string; limit?: string | number; unnamed?: string }

const nameOf = (u: { name: string | null; firstName: string | null; lastName: string | null; email: string }) =>
  [u.firstName, u.lastName].filter(Boolean).join(' ') || u.name || u.email;

/** "102.244.x.x": enough to tell places apart in a list; the full address is in the entry's details */
const shortIp = (ip: string | null) => !ip ? null : ip.includes('.') ? ip.replace(/^(?:::ffff:)?(\d+\.\d+)\.\d+\.\d+$/, '$1.x.x') : ip.split(':').slice(0, 2).join(':') + ':…';

/** Sentences for entries written before they had one, and for explicit actions that don't write one */
const LEGACY: Record<string, (label: string, e: { metadata: any; after: any }) => string> = {
  'teacher.approved': l => `Approved ${l}’s tutor application`,
  'teacher.rejected': l => `Turned down ${l}’s tutor application`,
  'payout.account': () => 'Changed their payout account',
  'payout.pin': () => 'Set or changed their payout PIN',
  'payout.generated': () => 'Worked out the month’s payouts',
  'payout.approve': () => 'Approved a payout',
  'payout.paid': () => 'Marked a payout as paid',
  'payout.manual': () => 'Recorded a payout made by hand',
  'payout.auto-setting': () => 'Changed automatic payouts',
  'payouts.rules': () => 'Changed the withdrawal rules',
  'payouts.topup': () => 'Topped up the payout account',
  'payment.refunded': () => 'Refunded a payment',
  'payment.recovered': () => 'Recovered a payment that hadn’t gone through',
  'wallet.manual_credit': () => 'Added money to a wallet by hand',
  'course.assigned': l => `Assigned a teacher to ${l}`,
  'course.commission': (_l, e) => `Changed teachers, reviewers or shares${e.metadata?.courseIds ? ` on ${e.metadata.courseIds.length} courses` : ''}`,
  'cohort.rates': () => 'Changed a cohort’s rates',
  'mentorship.rates': () => 'Changed mentoring rates',
  'courses.classify': (_l, e) => `Set the exam and subject on ${e.after?.updated ?? e.metadata?.updated ?? 'several'} courses`,
  'courses.archive-duplicates': (_l, e) => `Archived ${e.metadata?.courses?.length ?? 'the'} empty duplicate courses from WordPress`,
  'tutor-agreement.copies-sent': (_l, e) => `Emailed ${e.after?.sent ?? e.metadata?.sent ?? 'all'} tutors their signed agreement`,
  'authenticator.on': () => 'Switched on an authenticator app',
  'authenticator.moved': () => 'Moved their authenticator app to a new phone',
  'authenticator.off': () => 'Switched off their authenticator app',
  'authenticator.backup-codes': () => 'Made new backup codes',
  'authenticator.reset': l => `Reset ${l}’s authenticator app`,
};

/** Admin → Activity log: read-only. There is no way to edit or delete an entry. */
@Injectable()
export class ActivityService {
  constructor(private prisma: PrismaService) {}

  private where(q: ActivityQuery): Prisma.AuditLogWhereInput {
    const and: Prisma.AuditLogWhereInput[] = [];
    if (q.actorId) and.push({ actorId: q.actorId });
    if (q.area && AREAS.includes(q.area as any)) and.push({ area: q.area });
    if (q.from) and.push({ createdAt: { gte: new Date(q.from) } });
    if (q.to) and.push({ createdAt: { lt: new Date(+new Date(q.to) + DAY) } });
    if (q.targetType && q.targetId) and.push({ targetType: q.targetType, targetId: q.targetId });
    // A person's page: what they did and what was done to them
    if (q.person) and.push({ OR: [{ actorId: q.person }, { targetType: 'UserProfile', targetId: q.person }] });
    if (q.unnamed === '1') and.push({ actorId: null, action: { startsWith: 'teacher.' } });
    if (q.q?.trim()) {
      const s = q.q.trim();
      and.push({ OR: [{ summary: { contains: s, mode: 'insensitive' } }, { targetLabel: { contains: s, mode: 'insensitive' } }, { action: { contains: s, mode: 'insensitive' } }, { ip: { startsWith: s } }] });
    }
    return and.length ? { AND: and } : {};
  }

  async list(q: ActivityQuery) {
    const limit = Math.min(Math.max(Number(q.limit) || 50, 1), 200);
    const where = this.where(q);
    const cursor = q.cursor ? await this.prisma.auditLog.findUnique({ where: { id: q.cursor }, select: { createdAt: true } }) : null;
    const rows = await this.prisma.auditLog.findMany({
      where: cursor ? { AND: [where, { createdAt: { lt: cursor.createdAt } }] } : where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: limit + 1,
    });
    const page = rows.slice(0, limit);
    const people = await this.people([...page.map(r => r.actorId), ...page.filter(r => r.targetType === 'UserProfile').map(r => r.targetId)]);
    const entries = page.map(r => {
      const label = r.targetLabel ?? (r.targetType === 'UserProfile' && r.targetId ? people.get(r.targetId)?.name ?? null : null);
      const legacy = LEGACY[r.action];
      const a = r.actorId ? people.get(r.actorId) : null;
      return {
        id: r.id, at: r.createdAt, action: r.action, area: r.area ?? areaOf(r.action),
        summary: r.summary ?? (legacy ? legacy(label ? (r.targetType === 'UserProfile' ? label : `“${label}”`) : 'someone', { metadata: r.metadata, after: r.after }) : r.action),
        actor: r.actorId ? { id: r.actorId, name: a?.name ?? 'A deleted account', role: r.actorRole ?? a?.role ?? null, avatarUrl: a?.avatarUrl ?? null } : null,
        target: r.targetType ? { type: r.targetType, id: r.targetId, label } : null,
        before: r.before, after: r.after, metadata: r.metadata,
        device: r.device, ip: shortIp(r.ip), fullIp: r.ip,
      };
    });
    return { entries, next: rows.length > limit ? page[page.length - 1].id : null, total: await this.prisma.auditLog.count({ where }) };
  }

  /** The hero: this week's numbers, and what needs a look */
  async summary() {
    const since = new Date(Date.now() - 7 * DAY);
    const [week, byArea, people, all, first, unnamed, failed, admins] = await Promise.all([
      this.prisma.auditLog.count({ where: { createdAt: { gte: since } } }),
      this.prisma.auditLog.groupBy({ by: ['area'], where: { createdAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.auditLog.groupBy({ by: ['actorId'], where: { createdAt: { gte: since }, actorId: { not: null } } }),
      this.prisma.auditLog.count(),
      this.prisma.auditLog.findFirst({ orderBy: { createdAt: 'asc' }, select: { createdAt: true } }),
      this.prisma.auditLog.findMany({ where: { actorId: null, action: { startsWith: 'teacher.' } }, select: { createdAt: true }, orderBy: { createdAt: 'asc' } }),
      this.prisma.auditLog.count({ where: { action: { in: ['signin.failed', 'signin.locked'] }, createdAt: { gte: since } } }),
      this.prisma.userProfile.findMany({ where: { role: 'ADMIN', deletedAt: null, totpEnabledAt: null, NOT: { email: { endsWith: '.test' } } }, select: { id: true, name: true, firstName: true, lastName: true, email: true } }),
    ]);
    // Older rows have no area: count them by their action
    const areas: Record<string, number> = Object.fromEntries(AREAS.map(a => [a, 0]));
    for (const b of byArea) if (b.area) areas[b.area] = (areas[b.area] ?? 0) + b._count._all;
    const noArea = await this.prisma.auditLog.findMany({ where: { createdAt: { gte: since }, area: null }, select: { action: true } });
    for (const r of noArea) areas[areaOf(r.action)]++;
    return {
      week, all, since: first?.createdAt ?? null, people: people.length, areas,
      unnamed: { count: unnamed.length, from: unnamed[0]?.createdAt ?? null, to: unnamed[unnamed.length - 1]?.createdAt ?? null },
      failedSignIns: failed,
      adminsWithoutApp: admins.map(a => ({ id: a.id, name: nameOf(a) })),
    };
  }

  /** Everyone who appears in the log, for the Person filter */
  async actors() {
    const ids = await this.prisma.auditLog.groupBy({ by: ['actorId'], where: { actorId: { not: null } }, _count: { _all: true } });
    const people = await this.people(ids.map(i => i.actorId));
    return ids.map(i => ({ id: i.actorId!, name: people.get(i.actorId!)?.name ?? 'A deleted account', role: people.get(i.actorId!)?.role ?? null, n: i._count._all }))
      .sort((a, b) => b.n - a.n);
  }

  async csv(q: ActivityQuery) {
    const rows: string[][] = [['When (UTC)', 'Who', 'Role', 'Area', 'What', 'Item', 'Item id', 'Device', 'IP address', 'Action']];
    let cursor: string | undefined;
    for (let i = 0; i < 50; i++) {
      const page = await this.list({ ...q, cursor, limit: 200 });
      for (const e of page.entries) rows.push([new Date(e.at).toISOString().replace('T', ' ').slice(0, 19), e.actor?.name ?? 'System', e.actor?.role ?? '', e.area, e.summary, e.target?.label ?? '', e.target?.id ?? '', e.device ?? '', e.fullIp ?? '', e.action]);
      if (!page.next) break;
      cursor = page.next;
    }
    return rows.map(r => r.map(c => /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(',')).join('\n');
  }

  private async people(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    const rows = unique.length ? await this.prisma.userProfile.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, firstName: true, lastName: true, email: true, role: true, avatarUrl: true } }) : [];
    return new Map(rows.map(r => [r.id, { name: nameOf(r), role: r.role as string, avatarUrl: r.avatarUrl }]));
  }
}
