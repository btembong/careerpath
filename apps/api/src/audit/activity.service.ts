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
        place: r.country ? { city: r.city, country: r.country, code: r.countryCode } : null,
        newCountry: !!(r.metadata as any)?.newCountry,
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
    const rows: string[][] = [['When (UTC)', 'Who', 'Role', 'Area', 'What', 'Item', 'Item id', 'Device', 'City', 'Country', 'IP address', 'Action']];
    let cursor: string | undefined;
    for (let i = 0; i < 50; i++) {
      const page = await this.list({ ...q, cursor, limit: 200 });
      for (const e of page.entries) rows.push([new Date(e.at).toISOString().replace('T', ' ').slice(0, 19), e.actor?.name ?? 'System', e.actor?.role ?? '', e.area, e.summary, e.target?.label ?? '', e.target?.id ?? '', e.device ?? '', e.place?.city ?? '', e.place?.country ?? '', e.fullIp ?? '', e.action]);
      if (!page.next) break;
      cursor = page.next;
    }
    return rows.map(r => r.map(c => /[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c).join(',')).join('\n');
  }

  /** People → a person → Signs in from: their places, most used first, and their profile country */
  async placesOf(userId: string) {
    const [rows, u] = await Promise.all([
      this.prisma.userSession.groupBy({ by: ['city', 'country', 'countryCode'], where: { userId, country: { not: null } }, _count: { _all: true }, _max: { lastSeenAt: true }, orderBy: { _count: { country: 'desc' } }, take: 8 }),
      this.prisma.userProfile.findUnique({ where: { id: userId }, select: { country: { select: { name: true } } } }),
    ]);
    const places = rows.map(r => ({ city: r.city, country: r.country, code: r.countryCode, signIns: r._count._all, last: r._max.lastSeenAt }));
    const profile = u?.country?.name ?? null;
    return { places, profileCountry: profile, matches: profile && places[0] ? places[0].country === profile : null };
  }

  /**
   * Insights → Where your users are. People, not visits: each person counts once, at the place of their most
   * recent sign-in in the last 30 days. Beside it, the country on their profile.
   */
  async whereUsersAre(role?: string) {
    const roleWhere = role && role !== 'ALL' ? { role: role as any } : {};
    const since = new Date(Date.now() - 30 * DAY);
    const [profiles, countries, sessions, active] = await Promise.all([
      this.prisma.userProfile.groupBy({ by: ['countryId'], where: { deletedAt: null, ...roleWhere }, _count: { _all: true } }),
      this.prisma.country.findMany({ select: { id: true, name: true, code: true } }),
      this.prisma.userSession.findMany({
        where: { lastSeenAt: { gte: since }, countryCode: { not: null }, user: { deletedAt: null, ...roleWhere } },
        orderBy: { lastSeenAt: 'desc' }, select: { userId: true, city: true, country: true, countryCode: true },
      }),
      this.prisma.userProfile.count({ where: { deletedAt: null, lastSeenAt: { gte: new Date(Date.now() - 7 * DAY) }, ...roleWhere } }),
    ]);
    const latest = new Map<string, (typeof sessions)[number]>();
    for (const s of sessions) if (!latest.has(s.userId)) latest.set(s.userId, s);
    const signIn = new Map<string, { country: string; code: string; n: number }>();
    const cities = new Map<string, { city: string; country: string; code: string; n: number }>();
    for (const s of latest.values()) {
      const c = signIn.get(s.countryCode!) ?? { country: s.country!, code: s.countryCode!, n: 0 }; c.n++; signIn.set(s.countryCode!, c);
      if (s.city) { const k = `${s.city}|${s.countryCode}`; const x = cities.get(k) ?? { city: s.city, country: s.country!, code: s.countryCode!, n: 0 }; x.n++; cities.set(k, x); }
    }
    const byName = new Map(countries.map(c => [c.id, c.name]));
    const profile = profiles.map(p => ({ country: p.countryId ? byName.get(p.countryId) ?? 'Unknown' : null, n: p._count._all }));
    // One row per country: profile count and sign-in count side by side
    const rows = new Map<string, { country: string; code: string | null; profile: number; signIn: number }>();
    for (const p of profile) if (p.country) rows.set(p.country, { country: p.country, code: null, profile: p.n, signIn: 0 });
    for (const s of signIn.values()) { const r = rows.get(s.country) ?? { country: s.country, code: s.code, profile: 0, signIn: 0 }; r.code = s.code; r.signIn = s.n; rows.set(s.country, r); }
    return {
      people: profiles.reduce((t, p) => t + p._count._all, 0), active, located: latest.size,
      notSet: profile.find(p => !p.country)?.n ?? 0,
      countries: [...rows.values()].sort((a, b) => Math.max(b.profile, b.signIn) - Math.max(a.profile, a.signIn)),
      cities: [...cities.values()].sort((a, b) => b.n - a.n).slice(0, 8),
    };
  }

  private async people(ids: (string | null)[]) {
    const unique = [...new Set(ids.filter((x): x is string => !!x))];
    const rows = unique.length ? await this.prisma.userProfile.findMany({ where: { id: { in: unique } }, select: { id: true, name: true, firstName: true, lastName: true, email: true, role: true, avatarUrl: true } }) : [];
    return new Map(rows.map(r => [r.id, { name: nameOf(r), role: r.role as string, avatarUrl: r.avatarUrl }]));
  }
}
