import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WordPressService } from '../wordpress/wordpress.service';
import { CreateOrgEnrollmentDto } from './dto/create-org-enrollment.dto';
import { ApprovalStatus, UserRole } from '@cpa/shared';

@Injectable()
export class OrgService {
  constructor(
    private prisma: PrismaService,
    private wp: WordPressService,
  ) {}

  // ── Admin: create bulk enrollment ────────────────────────

  /**
   * Records an org purchase and creates one OrgSeat per invite email.
   * No PackagePurchase rows are created yet — only when a seat is claimed.
   * An unclaimed seat must never count as an enrolled student.
   */
  async createEnrollment(dto: CreateOrgEnrollmentDto) {
    const pkg = await this.prisma.package.findUnique({ where: { id: dto.packageId } });
    if (!pkg || !pkg.isPublished) {
      throw new NotFoundException('Package not found or not published');
    }

    const seatsPurchased = dto.inviteEmails.length;

    return this.prisma.$transaction(async (tx) => {
      const enrollment = await tx.orgEnrollment.create({
        data: {
          organizationName: dto.organizationName,
          contactEmail: dto.contactEmail,
          packageId: dto.packageId,
          seatsPurchased,
        },
      });

      await tx.orgSeat.createMany({
        data: dto.inviteEmails.map((email) => ({
          orgEnrollmentId: enrollment.id,
          inviteEmail: email.toLowerCase(),
        })),
      });

      return { enrollmentId: enrollment.id, seatsPurchased, seats: dto.inviteEmails };
    });
  }

  async listEnrollments() {
    const enrollments = await this.prisma.orgEnrollment.findMany({
      include: {
        _count: { select: { seats: true } },
        seats: { select: { claimedAt: true } },
      },
      orderBy: { purchasedAt: 'desc' },
    });

    // Attach package name separately (no foreign key relation on the model)
    const packageIds = [...new Set(enrollments.map(e => e.packageId))];
    const packages = await this.prisma.package.findMany({
      where: { id: { in: packageIds } },
      select: { id: true, name: true },
    });
    const pkgMap = new Map(packages.map(p => [p.id, p]));

    return enrollments.map(e => ({
      ...e,
      createdAt: e.purchasedAt,
      package: pkgMap.get(e.packageId) ?? null,
    }));
  }

  /** More invites for an organisation that already bought seats */
  async addSeats(id: string, emails: string[]) {
    const enrollment = await this.prisma.orgEnrollment.findUnique({ where: { id }, include: { seats: { select: { inviteEmail: true } } } });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    const have = new Set(enrollment.seats.map(s => s.inviteEmail));
    const fresh = [...new Set(emails.map(e => String(e).trim().toLowerCase()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && !have.has(e)))];
    if (!fresh.length) return { added: 0 };
    await this.prisma.$transaction([
      this.prisma.orgSeat.createMany({ data: fresh.map(inviteEmail => ({ orgEnrollmentId: id, inviteEmail })) }),
      this.prisma.orgEnrollment.update({ where: { id }, data: { seatsPurchased: { increment: fresh.length } } }),
    ]);
    return { added: fresh.length };
  }

  async getEnrollment(id: string) {
    const enrollment = await this.prisma.orgEnrollment.findUnique({
      where: { id },
      include: { seats: true },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    return enrollment;
  }

  // ── Student: claim seats bought for them ──────────────────

  /**
   * Gives a signed-in student every unclaimed seat invited to their email: one package purchase
   * per seat, and a place in the package's cohort. The email must match their account, so nobody
   * can claim someone else's seat, and no WordPress account is created.
   */
  async claimMine(student: { id: string; email: string }) {
    const seats = await this.prisma.orgSeat.findMany({
      where: { inviteEmail: student.email.toLowerCase(), claimedAt: null },
      include: { orgEnrollment: { select: { id: true, organizationName: true, packageId: true } } },
    });
    const claimed: { organisation: string; packageName: string }[] = [];
    for (const seat of seats) {
      // One seat per organisation purchase
      if (await this.prisma.orgSeat.findFirst({ where: { orgEnrollmentId: seat.orgEnrollmentId, studentId: student.id } })) continue;
      const pkg = await this.prisma.package.findUnique({ where: { id: seat.orgEnrollment.packageId } });
      if (!pkg) continue;
      const expiresAt = pkg.validityDays ? new Date(Date.now() + pkg.validityDays * 86_400_000) : null;
      await this.prisma.$transaction([
        this.prisma.packagePurchase.create({ data: { studentId: student.id, packageId: pkg.id, expiresAt } }),
        this.prisma.orgSeat.update({ where: { id: seat.id }, data: { studentId: student.id, claimedAt: new Date() } }),
      ]);
      // School seats join the package's cohort like a bought package does
      if (pkg.cohortId) {
        await this.prisma.cohortRoster.upsert({
          where: { studentId_cohortId: { studentId: student.id, cohortId: pkg.cohortId } },
          update: {}, create: { studentId: student.id, cohortId: pkg.cohortId, source: 'ORG' },
        }).catch(() => {});
      }
      claimed.push({ organisation: seat.orgEnrollment.organizationName, packageName: pkg.name });
    }
    return { claimed };
  }
}
