import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';

export const REQUIRED_PACKAGE_KEY = 'requiredPackage';

/**
 * Decorator to declare which package a route requires.
 * Usage: @RequirePackage('wp-category-tag') or @RequirePackage('wp-course-id')
 */
export const RequirePackage = (courseIdOrTag: string) =>
  SetMetadata(REQUIRED_PACKAGE_KEY, courseIdOrTag);

/**
 * Checks that the authenticated student holds an unexpired PackagePurchase
 * that covers the required course or category tag.
 *
 * Must be used after JwtAuthGuard. Never trusts a client-sent flag —
 * always queries PackagePurchase rows directly.
 *
 * Admins and Teachers bypass this guard (they have platform-level access).
 */
@Injectable()
export class PackageGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string>(REQUIRED_PACKAGE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required) return true;

    const { user } = context.switchToHttp().getRequest<{ user: UserProfile }>();
    if (!user) throw new ForbiddenException();

    // Admins and teachers have platform-level access — no purchase required
    if ([UserRole.ADMIN, UserRole.TEACHER].includes(user.role as UserRole)) return true;

    const now = new Date();
    const activePurchases = await this.prisma.packagePurchase.findMany({
      where: {
        studentId: user.id,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      include: {
        package: {
          select: { courseIds: true, categoryTags: true },
        },
      },
    });

    const hasAccess = activePurchases.some(
      (p) =>
        p.package.courseIds.includes(required) ||
        p.package.categoryTags.includes(required),
    );

    if (!hasAccess) {
      throw new ForbiddenException('You do not have an active package that covers this content.');
    }

    return true;
  }
}
