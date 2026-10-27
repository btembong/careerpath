import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  log(
    actorId: string | null,
    action: string,
    targetType?: string,
    targetId?: string,
    before?: object,
    after?: object,
    metadata?: object,
  ): void {
    // Fire-and-forget — audit failures must never block the main request
    this.prisma.auditLog
      .create({
        data: {
          actorId,
          action,
          targetType,
          targetId,
          before: before ?? undefined,
          after: after ?? undefined,
          metadata: metadata ?? undefined,
        },
      })
      .catch(() => {});
  }
}
