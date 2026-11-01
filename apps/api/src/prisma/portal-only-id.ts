import { PrismaService } from './prisma.service';

/**
 * wpUserId for an account that has no WordPress user (Google sign-in, school admins). It must be
 * unique and fit Postgres's 32-bit integer, so it's a random negative number, checked against
 * what's already there. (-Date.now() used to be used and no longer fits.)
 */
export async function portalOnlyWpId(prisma: PrismaService): Promise<number> {
  for (let i = 0; i < 5; i++) {
    const id = -(1 + Math.floor(Math.random() * 2_000_000_000));
    if (!(await prisma.userProfile.findUnique({ where: { wpUserId: id }, select: { id: true } }))) return id;
  }
  throw new Error('Could not pick an account id');
}
