import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from '../mail/mail.service';
import { CreateCountryDto } from './dto/create-country.dto';
import { UpdateCountryDto } from './dto/update-country.dto';
import { UserRole } from '@cpa/shared';
import { UserProfile } from '@prisma/client';

@Injectable()
export class CountriesService {
  constructor(
    private prisma: PrismaService,
    private mail: MailService,
  ) {}

  // ── Public ───────────────────────────────────────────────

  listPublic() {
    return this.prisma.country.findMany({
      select: { id: true, name: true, code: true, currency: true },
      orderBy: { name: 'asc' },
    });
  }

  // ── Admin ────────────────────────────────────────────────

  async findAll() {
    const [countries, reps] = await Promise.all([
      this.prisma.country.findMany({ orderBy: { name: 'asc' } }),
      this.prisma.userProfile.findMany({
        where: { role: UserRole.COUNTRY_REP },
        select: { id: true, email: true, countryId: true },
      }),
    ]);
    const repByCountry = new Map(reps.filter(r => r.countryId).map(r => [r.countryId!, r]));
    return countries.map(c => ({ ...c, rep: repByCountry.get(c.id) ?? null }));
  }

  async create(dto: CreateCountryDto) {
    return this.prisma.country.create({
      data: {
        code: dto.code.toUpperCase(),
        name: dto.name,
        currency: dto.currency.toUpperCase(),
        repCommissionPercent: dto.repCommissionPercent ?? null,
        perStudentBonus: dto.perStudentBonus ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateCountryDto) {
    const country = await this.prisma.country.findUnique({ where: { id } });
    if (!country) throw new NotFoundException('Country not found');

    // If assigning a rep: auto-promote to COUNTRY_REP, set countryId, create wallet
    if (dto.repId) {
      const rep = await this.prisma.userProfile.findUnique({ where: { id: dto.repId } });
      if (!rep) throw new BadRequestException('Specified user not found');

      // Promote role if not already a rep
      await this.prisma.userProfile.update({
        where: { id: dto.repId },
        data: {
          role: UserRole.COUNTRY_REP,
          countryId: id,
          approvalStatus: 'APPROVED',
        },
      });

      // Ensure they have a wallet in the country's currency
      const existing = await this.prisma.wallet.findUnique({ where: { userId: dto.repId } });
      if (!existing) {
        await this.prisma.wallet.create({
          data: { userId: dto.repId, currency: country.currency, balance: 0 },
        });
      } else if (existing.currency !== country.currency) {
        await this.prisma.wallet.update({
          where: { userId: dto.repId },
          data: { currency: country.currency },
        });
      }

      // Non-critical — notify the new rep by email
      this.mail.sendRepAssigned(rep.email, country.name, country.currency).catch(() => {});
    }

    return this.prisma.country.update({
      where: { id },
      data: {
        ...(dto.repCommissionPercent !== undefined && { repCommissionPercent: dto.repCommissionPercent }),
        ...(dto.perStudentBonus !== undefined && { perStudentBonus: dto.perStudentBonus }),
      },
    });
  }

  // ── Country rep dashboard ────────────────────────────────

  async getRepDashboard(rep: UserProfile) {
    if (!rep.countryId) {
      throw new BadRequestException('You are not assigned to a country yet');
    }

    const country = await this.prisma.country.findUnique({ where: { id: rep.countryId } });
    if (!country) throw new NotFoundException('Country not found');

    const now = new Date();

    // Active students in this country = students with countryId + unexpired purchase
    const activeStudents = await this.prisma.userProfile.count({
      where: {
        countryId: rep.countryId,
        role: UserRole.STUDENT,
        purchases: {
          some: {
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
        },
      },
    });

    // Rep's wallet
    const wallet = await this.prisma.wallet.findUnique({
      where: { userId: rep.id },
      include: {
        transactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });

    // Recent purchases from students in this country
    const recentPurchases = await this.prisma.packagePurchase.findMany({
      where: {
        student: { countryId: rep.countryId },
      },
      include: {
        package: { select: { name: true, priceAmount: true, currency: true } },
      },
      orderBy: { purchasedAt: 'desc' },
      take: 10,
    });

    return {
      country,
      activeStudents,
      wallet: wallet ?? { balance: 0, currency: country.currency, transactions: [] },
      recentPurchases,
    };
  }
}
