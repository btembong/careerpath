import { PrismaService } from '../prisma/prisma.service';

/**
 * The default teacher share (percent of each sale), set by admins in the pricing settings. A course gets it
 * when it first has a teacher and no share yet. An empty share set on purpose means the teacher is paid
 * outside the platform, so a share is never filled in once a teacher already has the course.
 */
export async function defaultTeacherShare(prisma: PrismaService): Promise<number | null> {
  const row = await prisma.platformSetting.findUnique({ where: { key: 'pricing' } });
  return ((row?.value ?? {}) as { defaultTeacherCommissionPct?: number | null }).defaultTeacherCommissionPct ?? null;
}
