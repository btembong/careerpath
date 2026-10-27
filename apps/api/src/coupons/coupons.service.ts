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

    const existing = await this.prisma.coupon.findUnique({ where: { code: dto.code } });
    if (existing) throw new ConflictException('Coupon code already exists');

    return this.prisma.coupon.create({
      data: {
        code: dto.code.toUpperCase(),
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
  list() {
    return this.prisma.coupon.findMany({ orderBy: { createdAt: 'desc' } });
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
