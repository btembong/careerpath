import { PrismaService } from './prisma.service';

/**
 * Published courses a student can open: enrolled, bought on its own, or in an active package.
 * The same rule the Community and Flashcards pages use to decide what a student sees.
 */
export async function studentCourseIds(prisma: PrismaService, studentId: string): Promise<string[]> {
  const now = new Date();
  const active = { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] };
  const [enrolled, bought, packages] = await Promise.all([
    prisma.courseEnrollment.findMany({ where: { studentId }, select: { courseId: true } }),
    prisma.coursePurchase.findMany({ where: { studentId, ...active }, select: { courseId: true } }),
    prisma.packagePurchase.findMany({ where: { studentId, ...active }, select: { package: { select: { courseIds: true } } } }),
  ]);
  const ids = [...new Set([...enrolled.map(e => e.courseId), ...bought.map(b => b.courseId), ...packages.flatMap(p => p.package.courseIds)])];
  const published = await prisma.platformCourse.findMany({ where: { id: { in: ids }, status: 'PUBLISHED' }, select: { id: true } });
  return published.map(c => c.id);
}
