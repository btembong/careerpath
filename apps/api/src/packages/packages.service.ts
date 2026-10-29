import { Prisma } from '@prisma/client';
import {
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePackageDto } from './dto/create-package.dto';
import { UpdatePackageDto } from './dto/update-package.dto';

const PUBLISHED_CACHE_KEY = 'packages:published';
const PUBLISHED_TTL = 10 * 60 * 1000; // 10 min

@Injectable()
export class PackagesService {
  constructor(
    private prisma: PrismaService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  // ── Student-facing ───────────────────────────────────────

  /** Published packages only — cached 10 min for the student browse screen. */
  async findPublished() {
    const cached = await this.cache.get(PUBLISHED_CACHE_KEY);
    if (cached) return cached;

    const packages = await this.prisma.package.findMany({
      where: { isPublished: true },
      include: { cohort: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    await this.cache.set(PUBLISHED_CACHE_KEY, packages, PUBLISHED_TTL);
    return packages;
  }

  // ── Admin ────────────────────────────────────────────────

  findAll() {
    return this.prisma.package.findMany({
      include: { cohort: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const pkg = await this.prisma.package.findUnique({
      where: { id },
      include: { cohort: { select: { id: true, name: true } } },
    });
    if (!pkg) throw new NotFoundException('Package not found');
    return pkg;
  }

  async create(dto: CreatePackageDto) {
    const pkg = await this.prisma.package.create({
      data: {
        name: dto.name,
        description: dto.description,
        priceAmount: dto.priceAmount,
        currency: dto.currency,
        courseIds: dto.courseIds ?? [],
        categoryTags: dto.categoryTags ?? [],
        validityDays: dto.validityDays ?? null,
        cohortId: dto.cohortId ?? null,
        mentorship: dto.mentorship?.trim() || null,
        faq: cleanFaq(dto.faq) ?? undefined,
        isPublished: false,
      },
      include: { cohort: { select: { id: true, name: true } } },
    });
    return pkg;
  }

  async update(id: string, dto: UpdatePackageDto) {
    const pkg = await this.findOne(id);

    // Publishing gate: every included course must have an APPROVED CourseAssignment
    if (dto.isPublished === true && !pkg.isPublished) {
      await this.assertAllCoursesApproved(pkg.courseIds);
    }

    const updated = await this.prisma.package.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.priceAmount !== undefined && { priceAmount: dto.priceAmount }),
        ...(dto.currency !== undefined && { currency: dto.currency }),
        ...(dto.courseIds !== undefined && { courseIds: dto.courseIds }),
        ...(dto.categoryTags !== undefined && { categoryTags: dto.categoryTags }),
        ...(dto.validityDays !== undefined && { validityDays: dto.validityDays }),
        ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }),
        ...('cohortId' in dto && { cohortId: dto.cohortId ?? null }),
        ...(dto.mentorship !== undefined && { mentorship: dto.mentorship?.trim() || null }),
        ...(dto.faq !== undefined && { faq: cleanFaq(dto.faq) ?? Prisma.DbNull }),
      },
      include: { cohort: { select: { id: true, name: true } } },
    });

    // Invalidate published cache whenever a package is mutated
    await this.cache.del(PUBLISHED_CACHE_KEY);
    return updated;
  }

  /** Sales stats for one package — feeds the admin Financial dashboard. */
  /**
   * The package page: courses with their size and single price, the linked cohort's teacher and next
   * classes, the questions, and — for a student who bought it — their access and progress.
   */
  async details(id: string, viewer: { id: string; role: string }) {
    const pkg = await this.prisma.package.findUnique({ where: { id } });
    if (!pkg || (!pkg.isPublished && viewer.role !== 'ADMIN')) throw new NotFoundException('Package not found');
    const now = new Date();
    const nameOf = (p: { name: string | null; firstName: string | null; lastName: string | null }) =>
      p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || null;

    const [courses, cohort, purchase] = await Promise.all([
      this.prisma.platformCourse.findMany({
        where: { id: { in: pkg.courseIds }, status: 'PUBLISHED' },
        select: {
          id: true, title: true, isSoldIndividually: true, priceAmount: true, priceCurrency: true, language: true,
          teacher: { select: { name: true, firstName: true, lastName: true } },
          modules: { select: { lessons: { select: { id: true, durationSecs: true } } } },
        },
      }),
      pkg.cohortId ? this.prisma.cohort.findUnique({
        where: { id: pkg.cohortId },
        select: {
          id: true, name: true, examDate: true, sittingLabel: true,
          teacher: { select: { name: true, firstName: true, lastName: true } },
          _count: { select: { students: true } },
          liveClasses: { where: { status: { not: 'CANCELLED' } }, orderBy: { scheduledAt: 'asc' }, select: { title: true, scheduledAt: true, durationMins: true, status: true, recordingUrl: true } },
        },
      }) : null,
      this.prisma.packagePurchase.findFirst({
        where: { studentId: viewer.id, packageId: id },
        orderBy: { purchasedAt: 'desc' },
        select: { purchasedAt: true, expiresAt: true, invoiceNo: true },
      }),
    ]);
    const ordered = pkg.courseIds.map(cid => courses.find(c => c.id === cid)).filter(Boolean) as typeof courses;
    const lessonIds = ordered.flatMap(c => c.modules.flatMap(m => m.lessons.map(l => l.id)));

    // Progress only for a student whose purchase is still active
    const active = purchase && (!purchase.expiresAt || purchase.expiresAt > now);
    const done = active && lessonIds.length
      ? await this.prisma.lessonProgress.count({ where: { studentId: viewer.id, completed: true, lessonId: { in: lessonIds } } })
      : 0;

    // Upcoming classes; the page works out the weekly pattern in the student's own time zone
    const upcoming = cohort?.liveClasses.filter(c => c.scheduledAt.getTime() + c.durationMins * 60_000 > now.getTime()) ?? [];

    const single = ordered.every(c => c.isSoldIndividually && c.priceAmount != null && c.priceCurrency === pkg.currency);
    const separateTotal = ordered.length && single ? ordered.reduce((n, c) => n + (c.priceAmount ?? 0), 0) : null;
    const months = pkg.validityDays ? Math.round(pkg.validityDays / 30.44) : null;
    const accessText = !pkg.validityDays ? 'with no time limit' : months && Math.abs(months * 30.44 - pkg.validityDays) <= 3 ? `for ${months} months` : `for ${pkg.validityDays} days`;
    const standardFaq = [
      { q: 'What happens when my access ends?', a: `You get access ${accessText}. After that you keep your certificates and progress report; lessons${cohort ? ' and live classes' : ''} lock until you buy the package again.` },
      ...(cohort ? [{ q: 'Can I join the live classes late?', a: 'Yes. You join the cohort straight after paying, and recordings of earlier classes are on your cohort page once the teacher adds them.' }] : []),
      { q: 'I already bought one of these courses.', a: 'The package still includes it, and your progress carries over.' },
      { q: 'How do I pay?', a: 'Mobile money, card or Paystack, depending on your country. You can add a coupon at checkout.' },
    ];

    return {
      id: pkg.id, name: pkg.name, description: pkg.description, priceAmount: pkg.priceAmount, currency: pkg.currency,
      validityDays: pkg.validityDays, categoryTags: pkg.categoryTags, mentorship: pkg.mentorship,
      faq: Array.isArray(pkg.faq) && (pkg.faq as unknown[]).length ? pkg.faq : standardFaq,
      separateTotal,
      lessons: lessonIds.length,
      courses: ordered.map(c => {
        const lessons = c.modules.flatMap(m => m.lessons);
        return {
          id: c.id, title: c.title, teacher: nameOf(c.teacher), language: c.language,
          modules: c.modules.length, lessons: lessons.length,
          minutes: Math.round(lessons.reduce((n, l) => n + (l.durationSecs ?? 0), 0) / 60),
          price: c.isSoldIndividually && c.priceAmount != null && c.priceCurrency ? { amount: c.priceAmount, currency: c.priceCurrency } : null,
        };
      }),
      cohort: cohort ? {
        id: cohort.id, name: cohort.name, teacher: nameOf(cohort.teacher), students: cohort._count.students,
        examDate: cohort.examDate, sittingLabel: cohort.sittingLabel,
        recordings: cohort.liveClasses.some(c => c.recordingUrl),
        next: upcoming.slice(0, 6).map(c => ({ title: c.title, scheduledAt: c.scheduledAt, durationMins: c.durationMins })),
      } : null,
      mine: purchase ? {
        purchasedAt: purchase.purchasedAt, expiresAt: purchase.expiresAt, invoiceNo: purchase.invoiceNo, active: !!active,
        progressPct: active && lessonIds.length ? Math.round((done / lessonIds.length) * 100) : null,
      } : null,
    };
  }

  async getSales(id: string) {
    await this.findOne(id);

    const purchases = await this.prisma.packagePurchase.findMany({
      where: { packageId: id },
      include: { package: { select: { priceAmount: true, currency: true } } },
    });

    const totalRevenue = purchases.reduce((sum, p) => sum + p.package.priceAmount, 0);

    return {
      packageId: id,
      purchaseCount: purchases.length,
      totalRevenue,
      currency: purchases[0]?.package.currency ?? null,
    };
  }

  // ── Helpers ──────────────────────────────────────────────

  private async assertAllCoursesApproved(courseIds: string[]): Promise<void> {
    if (courseIds.length === 0) return;

    const assignments = await this.prisma.courseAssignment.findMany({
      where: { courseId: { in: courseIds } },
      select: { courseId: true, reviewStatus: true },
    });

    const approvedIds = new Set(
      assignments.filter((a) => a.reviewStatus === 'APPROVED').map((a) => a.courseId),
    );

    const blocked = courseIds.filter((id) => !approvedIds.has(id));

    if (blocked.length > 0) {
      throw new UnprocessableEntityException(
        `Cannot publish: the following courses are not yet approved: ${blocked.join(', ')}`,
      );
    }
  }
}

/** Keep only questions with both a question and an answer; null when none are left */
function cleanFaq(faq: { q: string; a: string }[] | null | undefined) {
  if (!Array.isArray(faq)) return null;
  const rows = faq
    .map(r => ({ q: String(r?.q ?? '').trim().slice(0, 200), a: String(r?.a ?? '').trim().slice(0, 1000) }))
    .filter(r => r.q && r.a)
    .slice(0, 12);
  return rows.length ? rows : null;
}
