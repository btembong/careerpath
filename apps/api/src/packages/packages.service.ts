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
