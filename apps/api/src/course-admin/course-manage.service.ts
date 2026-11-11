import { BadRequestException, Injectable } from '@nestjs/common';
import { CourseSource, CourseStatus, Prisma, UserProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WpPullService } from './wp-pull.service';
import { TutorImportService, ImportSummary } from './tutor-import.service';
import { NotificationsService } from '../notifications/notifications.service';
import { priceEmail } from '../notifications/price-email';
import { minorToMajor } from '@cpa/shared';

export interface ListQuery { q?: string; source?: string; status?: string; programmeId?: string; untagged?: string; noTeacher?: string; price?: string; content?: string; page?: string; pageSize?: string }
export interface BulkInput {
  courseIds: string[];
  action: 'tag' | 'teacher' | 'publish' | 'unpublish' | 'hide' | 'show' | 'archive' | 'accept'
    | 'price' | 'free' | 'unsell' | 'approvePrice' | 'declinePrice' | 'addToPackage' | 'import';
  programmeId?: string | null; subjectId?: string | null; levelId?: string | null;
  /** A teacher's id, or null for "no teacher yet" */
  teacherId?: string | null;
  /** price: minor units, a 3-letter currency, and months of access (null = no limit) */
  amount?: number; currency?: string; accessMonths?: number | null;
  /** addToPackage */
  packageId?: string;
}

/** How a course is sold, as students see it in the catalogue */
type Selling = 'paid' | 'free' | 'package' | 'notsale';
const sellingOf = (c: { source: string; isSoldIndividually: boolean; priceAmount: number | null }, inPackage: boolean): Selling =>
  c.isSoldIndividually ? ((c.priceAmount ?? 0) > 0 ? 'paid' : 'free')
  : c.source === 'WORDPRESS' ? 'free'
  : inPackage ? 'package' : 'notsale';

const nameOf = (p: { name: string | null; firstName: string | null; lastName: string | null; email: string }) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
/** Untagged = not placed in the catalogue: no programme or no subject */
const UNTAGGED: Prisma.PlatformCourseWhereInput = { OR: [{ programmeId: null }, { subjectId: null }] };

/** The admin's view of every course: where it sits in the catalogue, who teaches it, and bulk changes */
@Injectable()
export class CourseManageService {
  constructor(private prisma: PrismaService, private pull: WpPullService, private tutor: TutorImportService, private notifications: NotificationsService) {}

  /** Course ids that are in at least one package */
  private async packagedIds() {
    return new Set((await this.prisma.package.findMany({ select: { courseIds: true } })).flatMap(p => p.courseIds));
  }

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
    if (query.price) {
      const packaged = [...await this.packagedIds()];
      const paid: Prisma.PlatformCourseWhereInput = { isSoldIndividually: true, priceAmount: { gt: 0 } };
      const notSold: Prisma.PlatformCourseWhereInput = { isSoldIndividually: false, source: CourseSource.NATIVE };
      if (query.price === 'paid') and.push(paid);
      else if (query.price === 'free') and.push({ OR: [{ isSoldIndividually: true, OR: [{ priceAmount: null }, { priceAmount: 0 }] }, { isSoldIndividually: false, source: CourseSource.WORDPRESS }] });
      else if (query.price === 'package') and.push({ ...notSold, id: { in: packaged } });
      else if (query.price === 'notsale') and.push({ ...notSold, id: { notIn: packaged } });
      else if (query.price === 'proposed') and.push({ proposedPriceAmount: { not: null } });
    }
    if (query.content === 'website') and.push({ source: CourseSource.WORDPRESS, contentImportedAt: null });
    else if (query.content === 'imported') and.push({ source: CourseSource.WORDPRESS, contentImportedAt: { not: null } });
    else if (query.content === 'nolessons') and.push({ modules: { none: { lessons: { some: {} } } } });

    const pageSize = Math.min(100, Math.max(10, Number(query.pageSize) || 25));
    const page = Math.max(1, Number(query.page) || 1);
    const [total, rows, maps] = await Promise.all([
      this.prisma.platformCourse.count({ where }),
      this.prisma.platformCourse.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        orderBy: [{ updatedAt: 'desc' }],
        select: {
          id: true, title: true, source: true, status: true, catalogueHidden: true, teacherPending: true, wpCourseUrl: true, wpCategoryIds: true, wpPulledAt: true, updatedAt: true,
          isSoldIndividually: true, priceAmount: true, priceCurrency: true, proposedPriceAmount: true, proposedPriceCurrency: true, contentImportedAt: true,
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
    // Selling, packages and content for the rows on this page
    const ids = rows.map(r => r.id);
    const [packages, lessons, runs] = await Promise.all([
      this.prisma.package.findMany({ where: { courseIds: { hasSome: ids } }, select: { name: true, courseIds: true } }),
      this.prisma.lesson.findMany({ where: { module: { courseId: { in: ids } } }, select: { type: true, module: { select: { courseId: true } } } }),
      this.prisma.tutorImport.findMany({ where: { courseId: { in: ids } }, orderBy: { createdAt: 'desc' }, select: { courseId: true, status: true, summary: true } }),
    ]);
    const content = (r: (typeof rows)[number]) => {
      const mine = lessons.filter(l => l.module.courseId === r.id);
      const run = runs.find(x => x.courseId === r.id);
      const empty = !!(run?.status === 'DONE' && (run.summary as unknown as ImportSummary | null)?.empty);
      return {
        lessons: mine.filter(l => l.type !== 'QUIZ').length, quizzes: mine.filter(l => l.type === 'QUIZ').length,
        state: r.source === 'NATIVE' ? 'built' : r.contentImportedAt ? 'imported' : empty ? 'empty' : run && ['QUEUED', 'RUNNING'].includes(run.status) ? 'importing' : 'website',
      };
    };

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
          selling: sellingOf(r, packages.some(p => p.courseIds.includes(r.id))),
          price: r.isSoldIndividually && (r.priceAmount ?? 0) > 0 ? { amount: r.priceAmount!, currency: r.priceCurrency! } : null,
          proposed: r.proposedPriceAmount != null ? { amount: r.proposedPriceAmount, currency: r.proposedPriceCurrency! } : null,
          packages: packages.filter(p => p.courseIds.includes(r.id)).map(p => p.name),
          content: content(r),
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
    const packaged = [...await this.packagedIds()];
    const [onSale, notOnSale, proposed, websiteOnly] = await Promise.all([
      this.prisma.platformCourse.count({ where: { ...live, isSoldIndividually: true, priceAmount: { gt: 0 } } }),
      this.prisma.platformCourse.count({ where: { ...live, isSoldIndividually: false, source: CourseSource.NATIVE, id: { notIn: packaged } } }),
      this.prisma.platformCourse.count({ where: { ...live, proposedPriceAmount: { not: null } } }),
      this.prisma.platformCourse.count({ where: { ...live, source: CourseSource.WORDPRESS, contentImportedAt: null } }),
    ]);
    return { all, published, review, drafts, untagged, untaggedWithSuggestion, noTeacher, hidden, lastPull, onSale, notOnSale, proposed, websiteOnly };
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

      // ── Selling ──
      case 'price': {
        const amount = Number(dto.amount), currency = String(dto.currency ?? '').trim().toUpperCase();
        if (!Number.isInteger(amount) || amount <= 0) throw new BadRequestException('Enter a price above zero');
        if (!/^[A-Z]{3}$/.test(currency)) throw new BadRequestException('Choose a currency');
        const months = dto.accessMonths === null ? null : dto.accessMonths === undefined ? undefined : Math.round(Number(dto.accessMonths));
        if (months !== undefined && months !== null && (!Number.isFinite(months) || months < 1 || months > 60)) throw new BadRequestException('Access is 1 to 60 months, or no limit');
        const r = await this.prisma.platformCourse.updateMany({ where: { id: { in: ids } }, data: { isSoldIndividually: true, priceAmount: amount, priceCurrency: currency, ...(months !== undefined && { accessMonths: months }) } });
        return { updated: r.count };
      }
      case 'free': {
        // Built here: sold on its own at no charge. From WordPress: free to join (not sold on its own)
        const a = await this.prisma.platformCourse.updateMany({ where: { id: { in: ids }, source: CourseSource.NATIVE }, data: { isSoldIndividually: true, priceAmount: null, priceCurrency: null } });
        const b = await this.prisma.platformCourse.updateMany({ where: { id: { in: ids }, source: CourseSource.WORDPRESS }, data: { isSoldIndividually: false, priceAmount: null, priceCurrency: null } });
        return { updated: a.count + b.count };
      }
      case 'unsell': {
        const r = await this.prisma.platformCourse.updateMany({ where: { id: { in: ids } }, data: { isSoldIndividually: false } });
        return { updated: r.count };
      }
      case 'approvePrice':
      case 'declinePrice': {
        const rows = await this.prisma.platformCourse.findMany({ where: { id: { in: ids }, proposedPriceAmount: { not: null } }, select: { id: true, title: true, teacherId: true, teacherPending: true, proposedPriceAmount: true, proposedPriceCurrency: true } });
        const clear = { proposedPriceAmount: null, proposedPriceCurrency: null, priceProposedAt: null };
        for (const c of rows) {
          const approve = dto.action === 'approvePrice';
          await this.prisma.platformCourse.update({ where: { id: c.id }, data: approve ? { ...clear, isSoldIndividually: true, priceAmount: c.proposedPriceAmount, priceCurrency: c.proposedPriceCurrency } : clear });
          if (!c.teacherPending) this.notifications.notify(c.teacherId, approve
            ? { type: 'system', title: 'Course price approved', body: `"${c.title}" can now be bought on its own.`, href: `/teacher/courses/${c.id}/pricing` }
            : { type: 'system', title: 'Price not approved', body: `Your proposed price for "${c.title}" was not approved.`, href: `/teacher/courses/${c.id}/pricing` },
            priceEmail(c.title, approve, approve && c.proposedPriceAmount ? `${c.proposedPriceCurrency} ${minorToMajor(c.proposedPriceAmount, c.proposedPriceCurrency).toLocaleString('en-GB')}` : undefined));
        }
        return { updated: rows.length };
      }
      case 'addToPackage': {
        const pkg = dto.packageId ? await this.prisma.package.findUnique({ where: { id: dto.packageId }, select: { id: true, courseIds: true } }) : null;
        if (!pkg) throw new BadRequestException('Choose a package');
        const add = ids.filter(id => !pkg.courseIds.includes(id));
        if (add.length) await this.prisma.package.update({ where: { id: pkg.id }, data: { courseIds: [...pkg.courseIds, ...add] } });
        return { updated: add.length };
      }
      case 'import': {
        const r = await this.tutor.queue(admin.id, ids);
        return { updated: r.queued };
      }
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
        language: true, isSoldIndividually: true, priceAmount: true, priceCurrency: true, accessMonths: true, proposedPriceAmount: true, proposedPriceCurrency: true, priceProposedAt: true, contentImportedAt: true,
        _count: { select: { enrollments: true, coursePurchases: true, modules: true } },
      },
    });
    if (!c) throw new BadRequestException('Course not found');
    const maps = await this.pull.mapIndex();
    const s = c.wpCategoryIds.length ? this.pull.suggest(c.wpCategoryIds, maps) : null;
    const categories = c.wpCategoryIds.map(id => maps.get(id)?.name).filter(Boolean);
    const [packages, lessons, run, assignment] = await Promise.all([
      this.prisma.package.findMany({ where: { courseIds: { has: id } }, select: { id: true, name: true, priceAmount: true, currency: true } }),
      this.prisma.lesson.findMany({ where: { module: { courseId: id } }, select: { type: true } }),
      this.prisma.tutorImport.findFirst({ where: { courseId: id }, orderBy: { createdAt: 'desc' }, select: { status: true, summary: true, finishedAt: true } }),
      this.prisma.courseAssignment.findUnique({ where: { courseId: id }, select: { reviewerId: true, reviewerCommissionPct: true, reviewStatus: true, reviewedAt: true, submittedAt: true } }),
    ]);
    const questions = await this.prisma.questionBank.count({ where: { courseId: id } });
    const reviewer = assignment?.reviewerId ? await this.prisma.userProfile.findUnique({ where: { id: assignment.reviewerId }, select: { name: true, firstName: true, lastName: true, email: true } }) : null;
    const empty = !!(run?.status === 'DONE' && (run.summary as unknown as ImportSummary | null)?.empty);
    return {
      selling: sellingOf(c, packages.length > 0),
      price: c.isSoldIndividually && (c.priceAmount ?? 0) > 0 ? { amount: c.priceAmount!, currency: c.priceCurrency! } : null,
      accessMonths: c.accessMonths,
      proposed: c.proposedPriceAmount != null ? { amount: c.proposedPriceAmount, currency: c.proposedPriceCurrency!, at: c.priceProposedAt } : null,
      packages,
      content: {
        lessons: lessons.filter(l => l.type !== 'QUIZ').length, quizzes: lessons.filter(l => l.type === 'QUIZ').length, questions,
        state: c.source === 'NATIVE' ? 'built' : c.contentImportedAt ? 'imported' : empty ? 'empty' : run && ['QUEUED', 'RUNNING'].includes(run.status) ? 'importing' : 'website',
        importedAt: c.contentImportedAt, lastImport: run ? { status: run.status, at: run.finishedAt } : null,
      },
      review: { reviewer: reviewer ? nameOf(reviewer) : null, sharePct: assignment?.reviewerCommissionPct ?? null, status: assignment?.reviewStatus ?? null, reviewedAt: assignment?.reviewedAt ?? null, submittedAt: assignment?.submittedAt ?? null },
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
