import { BadRequestException, Injectable } from '@nestjs/common';
import { CourseSource, CourseStatus, Prisma, UserProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WpPullService } from './wp-pull.service';

export interface ListQuery { q?: string; source?: string; status?: string; programmeId?: string; untagged?: string; noTeacher?: string; page?: string; pageSize?: string }
export interface BulkInput {
  courseIds: string[];
  action: 'tag' | 'teacher' | 'publish' | 'unpublish' | 'hide' | 'show' | 'archive' | 'accept';
  programmeId?: string | null; subjectId?: string | null; levelId?: string | null;
  /** A teacher's id, or null for "no teacher yet" */
  teacherId?: string | null;
}

const nameOf = (p: { name: string | null; firstName: string | null; lastName: string | null; email: string }) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
/** Untagged = not placed in the catalogue: no programme or no subject */
const UNTAGGED: Prisma.PlatformCourseWhereInput = { OR: [{ programmeId: null }, { subjectId: null }] };

/** The admin's view of every course: where it sits in the catalogue, who teaches it, and bulk changes */
@Injectable()
export class CourseManageService {
  constructor(private prisma: PrismaService, private pull: WpPullService) {}

  async list(query: ListQuery) {
    const where: Prisma.PlatformCourseWhereInput = { AND: [] };
    const and = where.AND as Prisma.PlatformCourseWhereInput[];
    if (query.q?.trim()) {
      const q = query.q.trim();
      and.push({ OR: [{ title: { contains: q, mode: 'insensitive' } }, { teacher: { OR: [{ name: { contains: q, mode: 'insensitive' } }, { firstName: { contains: q, mode: 'insensitive' } }, { lastName: { contains: q, mode: 'insensitive' } }] } }] });
    }
    if (query.source === 'NATIVE' || query.source === 'WORDPRESS') and.push({ source: query.source as CourseSource });
    if (query.status === 'HIDDEN') and.push({ catalogueHidden: true });
    else if (query.status && (Object.values(CourseStatus) as string[]).includes(query.status)) and.push({ status: query.status as CourseStatus });
    else and.push({ status: { not: CourseStatus.ARCHIVED } });
    if (query.programmeId) and.push({ programmeId: query.programmeId });
    if (query.untagged === '1') and.push(UNTAGGED);
    if (query.noTeacher === '1') and.push({ teacherPending: true });

    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize) || 25));
    const page = Math.max(1, Number(query.page) || 1);
    const [total, rows, maps] = await Promise.all([
      this.prisma.platformCourse.count({ where }),
      this.prisma.platformCourse.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          id: true, title: true, source: true, status: true, catalogueHidden: true, teacherPending: true, wpCourseUrl: true, wpCategoryIds: true, wpPulledAt: true, updatedAt: true,
          programme: { select: { id: true, name: true, shortName: true } }, subject: { select: { id: true, name: true } }, level: { select: { id: true, name: true } },
          teacher: { select: { id: true, name: true, firstName: true, lastName: true, email: true } },
          _count: { select: { enrollments: true, coursePurchases: true } },
        },
      }),
      this.pull.mapIndex(),
    ]);
    // Names for suggested tags
    const sugg = rows.map(r => (!r.programme || !r.subject) && r.wpCategoryIds.length ? this.pull.suggest(r.wpCategoryIds, maps) : null);
    const [progs, subjs, levels] = await Promise.all([
      this.prisma.programme.findMany({ where: { id: { in: sugg.map(s => s?.programmeId).filter((x): x is string => !!x) } }, select: { id: true, name: true, shortName: true } }),
      this.prisma.subject.findMany({ where: { id: { in: sugg.map(s => s?.subjectId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
      this.prisma.educationLevel.findMany({ where: { id: { in: sugg.map(s => s?.levelId).filter((x): x is string => !!x) } }, select: { id: true, name: true } }),
    ]);
    const label = (id: string | null, list: { id: string; name: string; shortName?: string | null }[]) => { const x = list.find(l => l.id === id); return x ? (x.shortName || x.name) : null; };

    return {
      total, page, pageSize,
      rows: rows.map((r, i) => {
        const s = sugg[i];
        const has = s && (s.programmeId || s.subjectId);
        return {
          id: r.id, title: r.title, source: r.source, status: r.status, hidden: r.catalogueHidden, wpCourseUrl: r.wpCourseUrl, pulledAt: r.wpPulledAt, updatedAt: r.updatedAt,
          programme: r.programme, subject: r.subject, level: r.level,
          teacher: r.teacherPending ? null : { id: r.teacher.id, name: nameOf(r.teacher) },
          students: r._count.enrollments + r._count.coursePurchases,
          suggestion: has ? {
            programmeId: s!.programmeId, subjectId: s!.subjectId, levelId: s!.levelId, from: s!.from,
            label: [label(s!.programmeId, progs), label(s!.subjectId, subjs), label(s!.levelId, levels)].filter(Boolean).join(' · '),
          } : null,
        };
      }),
    };
  }

  async stats() {
    const live = { status: { not: CourseStatus.ARCHIVED } };
    const [all, published, review, drafts, untagged, untaggedWithSuggestion, noTeacher, hidden] = await Promise.all([
      this.prisma.platformCourse.count({ where: live }),
      this.prisma.platformCourse.count({ where: { status: CourseStatus.PUBLISHED } }),
      this.prisma.platformCourse.count({ where: { status: CourseStatus.PENDING_REVIEW } }),
      this.prisma.platformCourse.count({ where: { status: CourseStatus.DRAFT } }),
      this.prisma.platformCourse.count({ where: { ...live, ...UNTAGGED } }),
      this.prisma.platformCourse.count({ where: { ...live, ...UNTAGGED, wpCategoryIds: { isEmpty: false } } }),
      this.prisma.platformCourse.count({ where: { ...live, teacherPending: true } }),
      this.prisma.platformCourse.count({ where: { ...live, catalogueHidden: true } }),
    ]);
    const lastPull = await this.prisma.wpPull.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true, kind: true } });
    return { all, published, review, drafts, untagged, untaggedWithSuggestion, noTeacher, hidden, lastPull };
  }

  async bulk(admin: UserProfile, dto: BulkInput) {
    const ids = [...new Set(dto.courseIds ?? [])];
    if (!ids.length) throw new BadRequestException('Choose at least one course');
    if (ids.length > 500) throw new BadRequestException('Up to 500 courses at a time');

    switch (dto.action) {
      case 'tag': {
        const data: Prisma.PlatformCourseUncheckedUpdateManyInput = {};
        if (dto.programmeId !== undefined) data.programmeId = await this.exists('programme', dto.programmeId);
        if (dto.subjectId !== undefined) data.subjectId = await this.exists('subject', dto.subjectId);
        if (dto.levelId !== undefined) data.levelId = await this.exists('educationLevel', dto.levelId);
        if (!Object.keys(data).length) throw new BadRequestException('Choose a programme, subject or level');
        const r = await this.prisma.platformCourse.updateMany({ where: { id: { in: ids } }, data });
        return { updated: r.count };
      }
      case 'accept': {
        const maps = await this.pull.mapIndex();
        const rows = await this.prisma.platformCourse.findMany({ where: { id: { in: ids } }, select: { id: true, programmeId: true, subjectId: true, levelId: true, wpCategoryIds: true } });
        let updated = 0;
        for (const r of rows) {
          const s = this.pull.suggest(r.wpCategoryIds, maps);
          // Fill what's missing; never replace a tag an admin already set
          const data = { programmeId: r.programmeId ?? s.programmeId, subjectId: r.subjectId ?? s.subjectId, levelId: r.levelId ?? s.levelId };
          if (data.programmeId !== r.programmeId || data.subjectId !== r.subjectId || data.levelId !== r.levelId) {
            await this.prisma.platformCourse.update({ where: { id: r.id }, data });
            updated++;
          }
        }
        return { updated };
      }
      case 'teacher': {
        if (dto.teacherId) {
          const t = await this.prisma.userProfile.findFirst({ where: { id: dto.teacherId, role: 'TEACHER' }, select: { id: true } });
          if (!t) throw new BadRequestException('That person isn’t a teacher');
          const r = await this.prisma.platformCourse.updateMany({ where: { id: { in: ids } }, data: { teacherId: t.id, teacherPending: false } });
          await this.syncAssignedTeacher(ids, t.id);
          return { updated: r.count };
        }
        // No teacher yet: CareerPath owns it through the admin making the change
        const r = await this.prisma.platformCourse.updateMany({ where: { id: { in: ids } }, data: { teacherId: admin.id, teacherPending: true } });
        // Nobody earns the teacher's share until a real teacher is assigned
        await this.syncAssignedTeacher(ids, null);
        return { updated: r.count };
      }
      case 'publish': {
        // Courses built on the portal go live through review; WordPress courses can be published directly
        const r = await this.prisma.platformCourse.updateMany({ where: { id: { in: ids }, OR: [{ source: CourseSource.WORDPRESS }, { status: { in: [CourseStatus.DRAFT, CourseStatus.PENDING_REVIEW] } }] }, data: { status: CourseStatus.PUBLISHED } });
        return { updated: r.count };
      }
      case 'unpublish': return { updated: (await this.prisma.platformCourse.updateMany({ where: { id: { in: ids } }, data: { status: CourseStatus.DRAFT } })).count };
      case 'hide': return { updated: (await this.prisma.platformCourse.updateMany({ where: { id: { in: ids } }, data: { catalogueHidden: true } })).count };
      case 'show': return { updated: (await this.prisma.platformCourse.updateMany({ where: { id: { in: ids } }, data: { catalogueHidden: false } })).count };
      case 'archive': return { updated: (await this.prisma.platformCourse.updateMany({ where: { id: { in: ids } }, data: { status: CourseStatus.ARCHIVED } })).count };
      default: throw new BadRequestException('Unknown action');
    }
  }

  private async exists(model: 'programme' | 'subject' | 'educationLevel', id: string | null) {
    if (!id) return null;
    const found = await (this.prisma[model] as any).findUnique({ where: { id }, select: { id: true } });
    if (!found) throw new BadRequestException(`That ${model === 'educationLevel' ? 'level' : model} doesn’t exist`);
    return id;
  }

  /** One course for the drawer */
  async detail(id: string) {
    const c = await this.prisma.platformCourse.findUnique({
      where: { id },
      select: {
        id: true, title: true, source: true, status: true, catalogueHidden: true, teacherPending: true, wpCourseUrl: true, wpCategoryIds: true, wpPulledAt: true, wpAuthorEmail: true,
        programmeId: true, subjectId: true, levelId: true, teacher: { select: { id: true, name: true, firstName: true, lastName: true, email: true } },
        _count: { select: { enrollments: true, coursePurchases: true, modules: true } },
      },
    });
    if (!c) throw new BadRequestException('Course not found');
    const maps = await this.pull.mapIndex();
    const s = c.wpCategoryIds.length ? this.pull.suggest(c.wpCategoryIds, maps) : null;
    const categories = c.wpCategoryIds.map(id => maps.get(id)?.name).filter(Boolean);
    return {
      ...c, teacher: c.teacherPending ? null : { id: c.teacher.id, name: nameOf(c.teacher) },
      students: c._count.enrollments + c._count.coursePurchases, modules: c._count.modules,
      wpCategories: categories, suggestion: s && (s.programmeId || s.subjectId || s.levelId) ? s : null,
    };
  }

  /**
   * Sales pay the teacher on the course assignment, so it must follow the course's teacher.
   * A new assignment gets the default commission; an existing one keeps its percentage.
   */
  private async syncAssignedTeacher(courseIds: string[], teacherId: string | null) {
    const row = await this.prisma.platformSetting.findUnique({ where: { key: 'pricing' } });
    const pct = ((row?.value ?? {}) as { defaultTeacherCommissionPct?: number | null }).defaultTeacherCommissionPct ?? null;
    await this.prisma.$transaction(courseIds.map(courseId => this.prisma.courseAssignment.upsert({
      where: { courseId },
      update: { teacherId },
      create: { courseId, teacherId, teacherCommissionPct: teacherId ? pct : null },
    })));
  }
}
