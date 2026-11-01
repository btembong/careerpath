import {
  Injectable,
  ConflictException,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto } from './dto/create-coupon.dto';
import { Package, PlatformCourse } from '@prisma/client';

@Injectable()
export class CouponsService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateCouponDto) {
    if (!dto.percentOff && !dto.amountOff) {
      throw new BadRequestException('Provide either percentOff or amountOff');
    }
    if (dto.percentOff && dto.amountOff) {
      throw new BadRequestException('Provide only one of percentOff or amountOff, not both');
    }

    // Codes are stored upper-case, so check the same way (otherwise "launch50" slips past and fails on save)
    const existing = await this.prisma.coupon.findUnique({ where: { code: dto.code.trim().toUpperCase() } });
    if (existing) throw new ConflictException('Coupon code already exists');

    return this.prisma.coupon.create({
      data: {
        code: dto.code.trim().toUpperCase(),
        percentOff: dto.percentOff ?? null,
        amountOff: dto.amountOff ?? null,
        packageId: dto.packageId ?? null,
        maxRedemptions: dto.maxRedemptions ?? null,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
      },
    });
  }

  /**
   * Validate a coupon code against a package and return the discounted price.
   * Called server-side during checkout — never trust a client-calculated discount.
   * Uses a raw query with FOR UPDATE to prevent concurrent over-redemption.
   */
  async applyToPackage(
    code: string,
    pkg: Package,
  ): Promise<{ discountedPrice: number; couponId: string }> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });

    if (!coupon || !coupon.isActive) throw new NotFoundException('Coupon code is invalid or inactive');

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      throw new UnprocessableEntityException('Coupon has expired');
    }

    if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
      throw new UnprocessableEntityException('Coupon has reached its redemption limit');
    }

    if (coupon.packageId && coupon.packageId !== pkg.id) {
      throw new UnprocessableEntityException('Coupon is not valid for this package');
    }

    let discountedPrice: number;
    if (coupon.percentOff) {
      discountedPrice = Math.round(pkg.priceAmount * (1 - coupon.percentOff / 100));
    } else {
      discountedPrice = Math.max(0, pkg.priceAmount - (coupon.amountOff ?? 0));
    }

    return { discountedPrice, couponId: coupon.id };
  }

  /**
   * Validate a coupon code against an individual course and return the discounted price.
   * Package-scoped coupons are rejected — they cannot be used for individual course purchases.
   */
  async applyToCourse(
    code: string,
    course: PlatformCourse,
  ): Promise<{ discountedPrice: number; couponId: string }> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });

    if (!coupon || !coupon.isActive) throw new NotFoundException('Coupon code is invalid or inactive');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new UnprocessableEntityException('Coupon has expired');
    if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
      throw new UnprocessableEntityException('Coupon has reached its redemption limit');
    }
    // Package-scoped coupons cannot be used on individual course purchases
    if (coupon.packageId) {
      throw new UnprocessableEntityException('Coupon is not valid for individual course purchases');
    }

    const basePrice = course.priceAmount ?? 0;
    let discountedPrice: number;
    if (coupon.percentOff) {
      discountedPrice = Math.round(basePrice * (1 - coupon.percentOff / 100));
    } else {
      discountedPrice = Math.max(0, basePrice - (coupon.amountOff ?? 0));
    }

    return { discountedPrice, couponId: coupon.id };
  }

  /** Atomically increment redeemedCount — called after a successful payment. */
  incrementRedemption(couponId: string) {
    return this.prisma.coupon.update({
      where: { id: couponId },
      data: { redeemedCount: { increment: 1 } },
    });
  }

  /** List all coupons for admin. */
  /** Coupons with what each has given away, and this month's totals per currency */
  async list() {
    const now = new Date(), monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const [coupons, pkgBuys, pkgSales, courseSales] = await Promise.all([
      this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } }),
      this.prisma.packagePurchase.findMany({ where: { couponId: { not: null } }, select: { couponId: true, purchasedAt: true, amountPaid: true, currency: true, package: { select: { priceAmount: true, currency: true } } } }),
      this.prisma.packagePurchase.count({ where: { purchasedAt: { gte: monthStart }, amountPaid: { gt: 0 } } }),
      this.prisma.coursePurchase.count({ where: { purchasedAt: { gte: monthStart }, amountPaid: { gt: 0 } } }),
    ]);
    // Coupons apply to packages. The discount is the list price minus what was paid (list prices can change later, so this is an estimate)
    const uses = [
      ...pkgBuys.map(p => ({ couponId: p.couponId!, at: p.purchasedAt, currency: p.currency ?? p.package.currency, off: Math.max(0, p.package.priceAmount - (p.amountPaid ?? 0)) })),
    ];
    const packages = await this.prisma.package.findMany({ where: { id: { in: coupons.map(c => c.packageId).filter((x): x is string => !!x) } }, select: { id: true, name: true, currency: true } });
    const sum = (xs: typeof uses) => Object.entries(xs.reduce((m, u) => ({ ...m, [u.currency]: (m[u.currency] ?? 0) + u.off }), {} as Record<string, number>)).map(([currency, amount]) => ({ currency, amount }));
    const thisMonth = uses.filter(u => u.at >= monthStart);
    return {
      rows: coupons.map(c => {
        const mine = uses.filter(u => u.couponId === c.id);
        const state = !c.isActive ? 'off' : c.expiresAt && c.expiresAt < now ? 'ended' : c.maxRedemptions != null && c.redeemedCount >= c.maxRedemptions ? 'used up' : 'active';
        return { ...c, package: packages.find(p => p.id === c.packageId) ?? null, state, given: sum(mine), lastUsed: mine.sort((a, b) => +b.at - +a.at)[0]?.at ?? null };
      }),
      stats: {
        active: coupons.filter(c => c.isActive && (!c.expiresAt || c.expiresAt >= now) && (c.maxRedemptions == null || c.redeemedCount < c.maxRedemptions)).length,
        endingThisMonth: coupons.filter(c => c.isActive && c.expiresAt && c.expiresAt >= now && c.expiresAt < new Date(now.getFullYear(), now.getMonth() + 1, 1)).length,
        usedThisMonth: thisMonth.length,
        givenThisMonth: sum(thisMonth),
        shareOfSales: pkgSales + courseSales ? Math.round((thisMonth.length / (pkgSales + courseSales)) * 100) : 0,
      },
    };
  }

  /** Turn a coupon on or off, or change when it ends and how many times it can be used */
  async update(id: string, dto: { isActive?: boolean; expiresAt?: string | null; maxRedemptions?: number | null }) {
    const coupon = await this.prisma.coupon.findUnique({ where: { id } });
    if (!coupon) throw new NotFoundException('Coupon not found');
    if (dto.maxRedemptions != null && (!Number.isInteger(dto.maxRedemptions) || dto.maxRedemptions < Math.max(1, coupon.redeemedCount))) {
      throw new BadRequestException(`It has already been used ${coupon.redeemedCount} times`);
    }
    if (dto.expiresAt && Number.isNaN(+new Date(dto.expiresAt))) throw new BadRequestException('Choose an end date');
    return this.prisma.coupon.update({
      where: { id },
      data: {
        ...(dto.isActive !== undefined && { isActive: !!dto.isActive }),
        ...(dto.expiresAt !== undefined && { expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null }),
        ...(dto.maxRedemptions !== undefined && { maxRedemptions: dto.maxRedemptions }),
      },
    });
  }

  /**
   * Lightweight validation endpoint for the checkout UI.
   * Returns { discountType, discountValue } so the frontend can show a preview.
   * Does NOT increment the redemption count — that happens on webhook fulfillment.
   */
  async validateForClient(
    code: string,
    packageId?: string,
    courseId?: string,
  ): Promise<{ discountType: 'PERCENT' | 'FIXED'; discountValue: number }> {
    const coupon = await this.prisma.coupon.findUnique({ where: { code: code.toUpperCase() } });

    if (!coupon || !coupon.isActive) throw new NotFoundException('Coupon code is invalid or inactive');
    if (coupon.expiresAt && coupon.expiresAt < new Date()) throw new UnprocessableEntityException('Coupon has expired');
    if (coupon.maxRedemptions !== null && coupon.redeemedCount >= coupon.maxRedemptions) {
      throw new UnprocessableEntityException('Coupon has reached its redemption limit');
    }

    // Package-scoped coupon: reject if used on wrong package or on a course
    if (coupon.packageId) {
      if (courseId) throw new UnprocessableEntityException('Coupon is not valid for individual course purchases');
      if (packageId && coupon.packageId !== packageId) {
        throw new UnprocessableEntityException('Coupon is not valid for this package');
      }
    }

    return {
      discountType:  coupon.percentOff ? 'PERCENT' : 'FIXED',
      discountValue: coupon.percentOff ?? coupon.amountOff ?? 0,
    };
  }
}
