import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { CourseSource, CourseStatus, Prisma, UserProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WordPressService, WpPullCourse } from '../wordpress/wordpress.service';
import { NotificationsService } from '../notifications/notifications.service';
import { cleanDescription, cleanTitle, decodeEntities, looksLikeJunk, norm } from './wp-text';

export interface PullSettings { newStatus: 'DRAFT' | 'PUBLISHED'; nightly: boolean }
const DEFAULT_SETTINGS: PullSettings = { newStatus: 'DRAFT', nightly: false };
/** A fetch from WordPress is reused for a few minutes, so "Bring in" applies exactly what the admin reviewed */
const FETCH_TTL = 10 * 60_000;

export interface Suggestion { programmeId: string | null; subjectId: string | null; levelId: string | null; from: string | null }
export interface ApplyInput {
  new?: { wpId: number; programmeId?: string | null; subjectId?: string | null; levelId?: string | null; teacherId?: string | null }[];
  changed?: number[];
  gone?: { courseId: string; action: 'keep' | 'hide' | 'archive' }[];
}

type Term = { id: number; name: string; parent: number; count: number };
type MapRow = { wpTermId: number; name: string; parentId: number | null; programmeId: string | null; subjectId: string | null; levelId: string | null; ignored: boolean };

/**
 * Pull courses from WordPress in two steps: check (compare, suggest, nothing written)
 * then apply only what the admin ticked. Category mappings turn WordPress categories into catalogue tags.
 */
@Injectable()
export class WpPullService {
  private readonly logger = new Logger(WpPullService.name);
  private last: { at: number; courses: WpPullCourse[]; terms: Term[]; emails: Map<number, string> } | null = null;

  constructor(private prisma: PrismaService, private wp: WordPressService, private notifications: NotificationsService) {}

  // ── Settings ─────────────────────────────────────────────

  async settings(): Promise<PullSettings> {
    const row = await this.prisma.platformSetting.findUnique({ where: { key: 'wpPull' } });
    return { ...DEFAULT_SETTINGS, ...((row?.value ?? {}) as Partial<PullSettings>) };
  }

  async updateSettings(dto: Partial<PullSettings>) {
    const cur = await this.settings();
    const value: PullSettings = {
      newStatus: dto.newStatus === 'PUBLISHED' || dto.newStatus === 'DRAFT' ? dto.newStatus : cur.newStatus,
      nightly: typeof dto.nightly === 'boolean' ? dto.nightly : cur.nightly,
    };
    await this.prisma.platformSetting.upsert({ where: { key: 'wpPull' }, update: { value: value as any }, create: { key: 'wpPull', value: value as any } });
    return value;
  }

  // ── Reading WordPress ────────────────────────────────────

  private async fetch(fresh: boolean) {
    if (!fresh && this.last && Date.now() - this.last.at < FETCH_TTL) return this.last;
    let courses: WpPullCourse[], terms: Term[];
    try {
      [courses, terms] = await Promise.all([this.wp.getCoursesForPull(), this.wp.getCourseCategories()]);
    } catch (err: any) {
      this.logger.warn(`WordPress fetch failed: ${err.message}`);
      throw new BadRequestException('Could not reach WordPress. Check the site is up and try again.');
    }
    const authors = [...new Set(courses.map(c => c.author).filter(Boolean))];
    const emails = await this.wp.getUserEmails(authors).catch(() => new Map<number, string>());
    this.last = { at: Date.now(), courses, terms, emails };
    await this.syncCategories(terms);
    return this.last;
  }

  /** Keep the mapping table in step with WordPress; new categories are matched to the catalogue by name */
  private async syncCategories(terms: Term[]) {
    const [rows, programmes, subjects, levels] = await Promise.all([
      this.prisma.wpCategoryMap.findMany(),
      this.prisma.programme.findMany({ select: { id: true, name: true, shortName: true } }),
      this.prisma.subject.findMany({ select: { id: true, name: true } }),
      this.prisma.educationLevel.findMany({ select: { id: true, name: true } }),
    ]);
    const byId = new Map(rows.map(r => [r.wpTermId, r]));
    const progBy = new Map<string, string>();
    for (const p of programmes) { progBy.set(norm(p.name), p.id); if (p.shortName) progBy.set(norm(p.shortName), p.id); progBy.set(norm(p.name.split(/\s+[—–-]\s+/)[0]), p.id); }
    const subjBy = new Map<string, string>(); for (const s of subjects) if (!subjBy.has(norm(s.name))) subjBy.set(norm(s.name), s.id);
    const levelBy = new Map<string, string>(); for (const l of levels) if (!levelBy.has(norm(l.name))) levelBy.set(norm(l.name), l.id);

    for (const t of terms) {
      const existing = byId.get(t.id);
      const base = { name: t.name, parentId: t.parent || null, courseCount: t.count };
      if (existing?.setBy === 'ADMIN') {
        await this.prisma.wpCategoryMap.update({ where: { wpTermId: t.id }, data: base });
        continue;
      }
      const n = norm(t.name);
      const auto = { programmeId: progBy.get(n) ?? null, subjectId: progBy.has(n) ? null : subjBy.get(n) ?? null, levelId: levelBy.get(n) ?? null };
      if (existing) await this.prisma.wpCategoryMap.update({ where: { wpTermId: t.id }, data: { ...base, ...auto } });
      else await this.prisma.wpCategoryMap.create({ data: { wpTermId: t.id, ...base, ...auto } });
    }
  }

  // ── Suggestions ──────────────────────────────────────────

  async mapIndex() {
    const rows: MapRow[] = await this.prisma.wpCategoryMap.findMany();
    return new Map(rows.map(r => [r.wpTermId, r]));
  }

  /** Programme, subject and level for a course from its categories, looking up each category's parents too */
  suggest(categoryIds: number[], maps: Map<number, MapRow>): Suggestion {
    const out: Suggestion = { programmeId: null, subjectId: null, levelId: null, from: null };
    const used: string[] = [];
    for (const id of categoryIds) {
      // Walk from the category up to the top, nearest first
      let cur = maps.get(id); let guard = 0;
      while (cur && guard++ < 10) {
        if (!cur.ignored) {
          let hit = false;
          if (!out.programmeId && cur.programmeId) { out.programmeId = cur.programmeId; hit = true; }
          if (!out.subjectId && cur.subjectId) { out.subjectId = cur.subjectId; hit = true; }
          if (!out.levelId && cur.levelId) { out.levelId = cur.levelId; hit = true; }
          if (hit && !used.includes(cur.name)) used.push(cur.name);
        }
        cur = cur.parentId ? maps.get(cur.parentId) : undefined;
      }
    }
    out.from = used.length ? used.join(', ') : null;
    return out;
  }

  private path(id: number, maps: Map<number, MapRow>) {
    const names: string[] = []; let cur = maps.get(id); let guard = 0;
    while (cur && guard++ < 10) { names.unshift(cur.name); cur = cur.parentId ? maps.get(cur.parentId) : undefined; }
    return names.join(' › ');
  }

  // ── Check ────────────────────────────────────────────────

  async preview(fresh = true) {
    const { courses: wpCourses, emails, at } = await this.fetch(fresh);
    const maps = await this.mapIndex();
    const portal = await this.prisma.platformCourse.findMany({
      where: { source: CourseSource.WORDPRESS, wpCourseId: { not: null } },
      select: {
        id: true, title: true, description: true, status: true, catalogueHidden: true, wpCourseId: true, wpTitle: true, wpDescription: true,
        _count: { select: { enrollments: true, coursePurchases: true } },
      },
    });
    const portalBy = new Map(portal.map(c => [c.wpCourseId!, c]));
    const wpBy = new Map(wpCourses.map(c => [c.id, c]));
    const teachers = await this.prisma.userProfile.findMany({ where: { role: 'TEACHER', email: { in: [...new Set(emails.values())] } }, select: { id: true, email: true, name: true, firstName: true, lastName: true } });
    const teacherBy = new Map(teachers.map(t => [t.email.toLowerCase(), t]));
    const nameOf = (t: { name: string | null; firstName: string | null; lastName: string | null; email: string }) => t.name || [t.firstName, t.lastName].filter(Boolean).join(' ') || t.email;

    const fresh_: any[] = [], changed: any[] = [], gone: any[] = [];
    let same = 0;
    const sameTitles: string[] = [];

    for (const w of wpCourses) {
      const c = portalBy.get(w.id);
      const title = cleanTitle(w.title);
      const email = emails.get(w.author) ?? null;
      const categories = w.categoryIds.map(id => this.path(id, maps)).filter(Boolean);
      if (!c) {
        if (w.status !== 'publish' && w.status !== 'draft' && w.status !== 'private') continue;
        const t = email ? teacherBy.get(email) : undefined;
        const junk = w.status !== 'publish' ? `${w.status} on WordPress` : looksLikeJunk(title) ? 'looks like a test course' : null;
        fresh_.push({
          wpId: w.id, title, status: w.status, link: w.link, categories, authorEmail: email,
          suggestion: this.suggest(w.categoryIds, maps),
          teacher: t ? { id: t.id, name: nameOf(t), matchedBy: 'email' } : null,
          ticked: !junk, note: junk,
        });
        continue;
      }
      // On the portal: is it gone (unpublished on WordPress), changed, or the same?
      if (w.status !== 'publish') {
        if (c.status !== 'ARCHIVED' && !c.catalogueHidden) {
          const enrolled = c._count.enrollments + c._count.coursePurchases;
          gone.push({ courseId: c.id, wpId: w.id, title: c.title, reason: `set to ${w.status} on WordPress`, enrolled, suggested: enrolled ? 'hide' : 'archive' });
        }
        continue;
      }
      const desc = cleanDescription(w.content);
      const changes: { field: string; kind: string; from: string | null; to: string | null }[] = [];
      const prevTitle = c.wpTitle ?? c.title;
      // Renamed on WordPress, or only cleaned up here (e.g. &#038; stored by an earlier sync)
      if (cleanTitle(prevTitle) !== title) changes.push({ field: 'title', kind: 'renamed', from: prevTitle, to: title });
      else if (c.title !== title && c.title === prevTitle) changes.push({ field: 'title', kind: 'cleaned', from: c.title, to: title });
      const prevDesc = c.wpDescription ?? c.description;
      // Earlier syncs stripped HTML without spaces and cut at 500 characters, so compare the letters only
      const letters = (x: string | null) => decodeEntities(x ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, '').slice(0, 300);
      if (letters(desc) !== letters(prevDesc)) changes.push({ field: 'description', kind: 'rewritten', from: prevDesc, to: desc });
      if (changes.length) changed.push({ courseId: c.id, wpId: w.id, title: c.title, changes, ticked: true });
      else { same++; if (sameTitles.length < 30) sameTitles.push(c.title); }
    }
    for (const c of portal) {
      if (wpBy.has(c.wpCourseId!) || c.status === 'ARCHIVED' || c.catalogueHidden) continue;
      const enrolled = c._count.enrollments + c._count.coursePurchases;
      gone.push({ courseId: c.id, wpId: c.wpCourseId, title: c.title, reason: 'deleted on WordPress', enrolled, suggested: enrolled ? 'hide' : 'archive' });
    }

    // Remember categories and authors on existing courses (not their text), so Course management can suggest tags
    for (const w of wpCourses) {
      const c = portalBy.get(w.id);
      if (c) await this.prisma.platformCourse.update({ where: { id: c.id }, data: { wpCategoryIds: w.categoryIds, wpAuthorEmail: emails.get(w.author) ?? null } });
    }

    const unmapped = [...maps.values()].filter(m => !m.ignored && !m.programmeId && !m.subjectId && !m.levelId).length;
    return {
      checkedAt: new Date(at), site: process.env.WP_BASE_URL ?? null,
      counts: { new: fresh_.length, changed: changed.length, same, gone: gone.length },
      new: fresh_, changed, gone, sameTitles,
      unmappedCategories: unmapped, settings: await this.settings(),
    };
  }

  // ── Apply ────────────────────────────────────────────────

  async apply(admin: UserProfile, dto: ApplyInput) {
    const { courses: wpCourses, emails } = await this.fetch(false);
    const wpBy = new Map(wpCourses.map(c => [c.id, c]));
    const settings = await this.settings();
    const counts = { created: 0, updated: 0, hidden: 0, archived: 0 };

    // Validate tags and teachers once
    const ids = (k: 'programmeId' | 'subjectId' | 'levelId') => [...new Set((dto.new ?? []).map(n => n[k]).filter((x): x is string => !!x))];
    const [progs, subjs, levels, teachers] = await Promise.all([
      this.prisma.programme.findMany({ where: { id: { in: ids('programmeId') } }, select: { id: true } }),
      this.prisma.subject.findMany({ where: { id: { in: ids('subjectId') } }, select: { id: true } }),
      this.prisma.educationLevel.findMany({ where: { id: { in: ids('levelId') } }, select: { id: true } }),
      this.prisma.userProfile.findMany({ where: { id: { in: [...new Set((dto.new ?? []).map(n => n.teacherId).filter((x): x is string => !!x))] }, role: 'TEACHER' }, select: { id: true } }),
    ]);
    const ok = (set: { id: string }[], id?: string | null) => (id && set.some(x => x.id === id) ? id : null);

    for (const n of dto.new ?? []) {
      const w = wpBy.get(n.wpId);
      if (!w) continue;
      if (await this.prisma.platformCourse.findUnique({ where: { wpCourseId: w.id }, select: { id: true } })) continue;
      const teacherId = ok(teachers, n.teacherId);
      await this.prisma.platformCourse.create({
        data: {
          title: cleanTitle(w.title), description: cleanDescription(w.content), source: CourseSource.WORDPRESS,
          wpCourseId: w.id, wpCourseUrl: w.link,
          status: settings.newStatus === 'PUBLISHED' && w.status === 'publish' ? CourseStatus.PUBLISHED : CourseStatus.DRAFT,
          programmeId: ok(progs, n.programmeId), subjectId: ok(subjs, n.subjectId), levelId: ok(levels, n.levelId),
          // No matching teacher: CareerPath owns it (through the admin) until one is assigned
          teacherId: teacherId ?? admin.id, teacherPending: !teacherId,
          ...this.snapshot(w, emails),
        },
      });
      counts.created++;
    }

    for (const wpId of dto.changed ?? []) {
      const w = wpBy.get(wpId);
      if (!w) continue;
      const c = await this.prisma.platformCourse.findUnique({ where: { wpCourseId: wpId }, select: { id: true } });
      if (!c) continue;
      // Text only: tags, prices, teacher and status set on the portal stay as they are
      await this.prisma.platformCourse.update({ where: { id: c.id }, data: { title: cleanTitle(w.title), description: cleanDescription(w.content), wpCourseUrl: w.link, ...this.snapshot(w, emails) } });
      counts.updated++;
    }

    for (const g of dto.gone ?? []) {
      const c = await this.prisma.platformCourse.findUnique({ where: { id: g.courseId }, select: { id: true, source: true } });
      if (!c || c.source !== CourseSource.WORDPRESS) continue;
      if (g.action === 'hide') { await this.prisma.platformCourse.update({ where: { id: c.id }, data: { catalogueHidden: true } }); counts.hidden++; }
      if (g.action === 'archive') { await this.prisma.platformCourse.update({ where: { id: c.id }, data: { status: CourseStatus.ARCHIVED } }); counts.archived++; }
    }

    // Unchanged courses get a snapshot too, so the next check compares against what WordPress has now
    const known = await this.prisma.platformCourse.findMany({ where: { source: CourseSource.WORDPRESS, wpCourseId: { in: wpCourses.map(w => w.id) }, wpTitle: null }, select: { id: true, wpCourseId: true, title: true, description: true } });
    for (const c of known) {
      const w = wpBy.get(c.wpCourseId!)!;
      const letters = (x: string | null) => decodeEntities(x ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, '').slice(0, 300);
      if (cleanTitle(w.title) === cleanTitle(c.title) && letters(cleanDescription(w.content)) === letters(c.description)) {
        await this.prisma.platformCourse.update({ where: { id: c.id }, data: this.snapshot(w, emails) });
      }
    }

    await this.wp.invalidateCourseCache().catch(() => {});
    const pull = await this.prisma.wpPull.create({ data: { byId: admin.id, kind: 'IMPORT', ...counts } });
    this.last = null;
    return { ...counts, pullId: pull.id };
  }

  private snapshot(w: WpPullCourse, emails: Map<number, string>): Prisma.PlatformCourseUncheckedUpdateInput & Prisma.PlatformCourseUncheckedCreateInput {
    return {
      wpTitle: cleanTitle(w.title), wpDescription: cleanDescription(w.content), wpStatus: w.status,
      wpModifiedAt: w.modifiedGmt ? new Date(w.modifiedGmt + 'Z') : null, wpCategoryIds: w.categoryIds,
      wpAuthorEmail: emails.get(w.author) ?? null, wpPulledAt: new Date(),
    } as any;
  }

  // ── History and mapping ──────────────────────────────────

  async history() {
    const rows = await this.prisma.wpPull.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { by: { select: { name: true, firstName: true, lastName: true, email: true } } } });
    return rows.map(r => ({
      id: r.id, at: r.createdAt, kind: r.kind, created: r.created, updated: r.updated, hidden: r.hidden, archived: r.archived, found: r.found,
      by: r.kind === 'NIGHTLY' ? 'Nightly check' : r.by ? (r.by.name || [r.by.firstName, r.by.lastName].filter(Boolean).join(' ') || r.by.email) : 'Admin',
    }));
  }

  async categories(refresh = false) {
    if (refresh || !(await this.prisma.wpCategoryMap.count())) await this.fetch(true);
    const maps = await this.mapIndex();
    const rows = await this.prisma.wpCategoryMap.findMany({
      include: { programme: { select: { id: true, name: true, shortName: true } }, subject: { select: { id: true, name: true } }, level: { select: { id: true, name: true } } },
      orderBy: [{ courseCount: 'desc' }, { name: 'asc' }],
    });
    return rows.map(r => ({
      wpTermId: r.wpTermId, name: r.name, path: this.path(r.wpTermId, maps), courseCount: r.courseCount,
      programme: r.programme, subject: r.subject, level: r.level, ignored: r.ignored, setBy: r.setBy,
      mapped: r.ignored || !!(r.programmeId || r.subjectId || r.levelId),
    }));
  }

  async setCategory(wpTermId: number, dto: { programmeId?: string | null; subjectId?: string | null; levelId?: string | null; ignored?: boolean }) {
    const row = await this.prisma.wpCategoryMap.findUnique({ where: { wpTermId } });
    if (!row) throw new BadRequestException('Unknown WordPress category');
    return this.prisma.wpCategoryMap.update({
      where: { wpTermId },
      data: {
        ...(dto.programmeId !== undefined && { programmeId: dto.programmeId || null }),
        ...(dto.subjectId !== undefined && { subjectId: dto.subjectId || null }),
        ...(dto.levelId !== undefined && { levelId: dto.levelId || null }),
        ...(dto.ignored !== undefined && { ignored: !!dto.ignored }),
        setBy: 'ADMIN',
      },
    });
  }

  // ── Nightly check ────────────────────────────────────────

  @Cron('0 2 * * *')
  async nightly() {
    if (!(await this.settings()).nightly) return;
    try {
      const p = await this.preview(true);
      await this.prisma.wpPull.create({ data: { kind: 'NIGHTLY', found: p.counts } });
      const todo = p.counts.new + p.counts.changed + p.counts.gone;
      if (todo) {
        const admins = await this.prisma.userProfile.findMany({ where: { role: 'ADMIN', approvalStatus: 'APPROVED' }, select: { id: true } });
        this.notifications.notify(admins.map(a => a.id), {
          type: 'system', title: 'WordPress has course changes to review',
          body: `${p.counts.new} new, ${p.counts.changed} changed, ${p.counts.gone} gone`, href: '/admin/courses/wordpress',
        });
      }
    } catch (err: any) {
      this.logger.warn(`Nightly WordPress check failed: ${err.message}`);
    }
  }
}
