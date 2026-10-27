import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '@cpa/shared';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { UserProfile } from '@prisma/client';

/**
 * Must be used together with JwtAuthGuard.
 * Checks the JWT's role claim against the @Roles() decorator on the handler.
 * This is the real security boundary — the frontend's route-hiding is UX only.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) return true;

    const { user } = context.switchToHttp().getRequest<{ user: UserProfile }>();
    if (!user) throw new ForbiddenException();

    const hasRole = requiredRoles.includes(user.role as UserRole);
    if (!hasRole) throw new ForbiddenException('Insufficient role');

    return true;
  }
}
