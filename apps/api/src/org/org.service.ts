import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WordPressService } from '../wordpress/wordpress.service';
import { CreateOrgEnrollmentDto } from './dto/create-org-enrollment.dto';
import { ClaimSeatDto } from './dto/claim-seat.dto';
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

  async getEnrollment(id: string) {
    const enrollment = await this.prisma.orgEnrollment.findUnique({
      where: { id },
      include: { seats: true },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');
    return enrollment;
  }

  // ── Public: claim a seat ──────────────────────────────────

  /**
   * An invited person claims their seat:
   * 1. Validate the invite email matches an unclaimed seat
   * 2. Create or link their WordPress + UserProfile account
   * 3. Create the PackagePurchase (making them an enrolled student)
   * 4. Mark the OrgSeat as claimed
   */
  async claimSeat(enrollmentId: string, dto: ClaimSeatDto) {
    const seat = await this.prisma.orgSeat.findFirst({
      where: {
        orgEnrollmentId: enrollmentId,
        inviteEmail: dto.inviteEmail.toLowerCase(),
        claimedAt: null,
      },
      include: {
        orgEnrollment: {
          include: { seats: true },
        },
      },
    });

    if (!seat) {
      throw new NotFoundException(
        'No unclaimed seat found for this email in this enrollment. Check the invite link.',
      );
    }

    const pkg = await this.prisma.package.findUnique({
      where: { id: seat.orgEnrollment.packageId },
    });
    if (!pkg) throw new NotFoundException('Package no longer exists');

    // Create or find the student account
    let profile = await this.prisma.userProfile.findUnique({
      where: { email: dto.inviteEmail.toLowerCase() },
    });

    if (!profile) {
      const wpUserId = await this.wp.createUser({
        username: dto.inviteEmail.toLowerCase(),
        email: dto.inviteEmail.toLowerCase(),
        password: dto.password,
        firstName: dto.firstName,
        lastName: dto.lastName,
        wpRole: 'subscriber',
      });

      profile = await this.prisma.userProfile.create({
        data: {
          wpUserId,
          email: dto.inviteEmail.toLowerCase(),
          role: UserRole.STUDENT,
          approvalStatus: ApprovalStatus.APPROVED,
        },
      });
    }

    // Check seat not already claimed by this student
    const alreadyClaimed = await this.prisma.orgSeat.findFirst({
      where: { orgEnrollmentId: enrollmentId, studentId: profile.id },
    });
    if (alreadyClaimed) throw new ConflictException('You have already claimed a seat in this enrollment');

    const expiresAt = pkg.validityDays
      ? new Date(Date.now() + pkg.validityDays * 86_400_000)
      : null;

    await this.prisma.$transaction([
      this.prisma.packagePurchase.create({
        data: {
          studentId: profile.id,
          packageId: pkg.id,
          expiresAt,
        },
      }),
      this.prisma.orgSeat.update({
        where: { id: seat.id },
        data: { studentId: profile.id, claimedAt: new Date() },
      }),
    ]);

    return {
      message: 'Seat claimed successfully. You now have access to your package.',
      packageName: pkg.name,
      expiresAt,
    };
  }
}
