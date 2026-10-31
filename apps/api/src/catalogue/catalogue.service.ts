import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProgrammeType, ProgrammeScope } from '@prisma/client';

@Injectable()
export class CatalogueService {
  constructor(private prisma: PrismaService) {}

  /**
   * List all active programmes, optionally filtered by type and/or countryId.
   * Global/regional programmes always show; country-scoped programmes only show
   * when the country is in their countries list.
   */
  async listProgrammes(opts: { type?: ProgrammeType; countryId?: string }) {
    const { type, countryId } = opts;

    const programmes = await this.prisma.programme.findMany({
      where: {
        isActive: true,
        ...(type ? { type } : {}),
        ...(countryId
          ? {
              OR: [
                { scope: { in: [ProgrammeScope.GLOBAL, ProgrammeScope.REGIONAL] } },
                { countries: { some: { id: countryId } } },
              ],
            }
          : {}),
      },
      include: {
        countries: { select: { id: true, code: true, name: true } },
        levels: { select: { id: true, name: true, tier: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
        subjects: { select: { id: true, name: true, category: true, isPractical: true }, orderBy: { name: 'asc' } },
        educationSystem: { select: { id: true, name: true } },
        _count: { select: { subjects: true } },
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });

    return programmes;
  }

  /** Get a single programme with full details */
  async getProgramme(id: string) {
    return this.prisma.programme.findUniqueOrThrow({
      where: { id },
      include: {
        countries: { select: { id: true, code: true, name: true, currency: true } },
        levels: { orderBy: { sortOrder: 'asc' } },
        subjects: { orderBy: [{ category: 'asc' }, { name: 'asc' }] },
        educationSystem: true,
      },
    });
  }

  /** Get all subjects for a programme, grouped by category */
  async getProgrammeSubjects(id: string) {
    const subjects = await this.prisma.subject.findMany({
      where: { programmes: { some: { id } } },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    // Group by category
    const grouped: Record<string, typeof subjects> = {};
    for (const s of subjects) {
      if (!grouped[s.category]) grouped[s.category] = [];
      grouped[s.category].push(s);
    }
    return grouped;
  }

  /** Summary counts by programme type (for tabs) */
  async getSummary(countryId?: string) {
    const types = Object.values(ProgrammeType);
    const counts: Record<string, number> = {};

    for (const type of types) {
      counts[type] = await this.prisma.programme.count({
        where: {
          isActive: true,
          type,
          ...(countryId
            ? {
                OR: [
                  { scope: { in: [ProgrammeScope.GLOBAL, ProgrammeScope.REGIONAL] } },
                  { countries: { some: { id: countryId } } },
                ],
              }
            : {}),
        },
      });
    }

    return counts;
  }

  /** Public course catalogue — published courses with pricing info */
  async listPublicCourses(opts: { programmeId?: string; subjectId?: string; isSoldIndividually?: boolean }) {
    // Hidden courses stay open to students who have them, but aren't listed
    const where: any = { status: 'PUBLISHED', catalogueHidden: false };
    if (opts.programmeId) where.programmeId = opts.programmeId;
    if (opts.subjectId) where.subjectId = opts.subjectId;
    if (opts.isSoldIndividually) where.isSoldIndividually = true;

    return this.prisma.platformCourse.findMany({
      where,
      select: {
        id: true, title: true, description: true, coverUrl: true,
        source: true, priceAmount: true, priceCurrency: true, isSoldIndividually: true,
        programme: { select: { id: true, name: true, shortName: true } },
        subject:   { select: { id: true, name: true } },
        level:     { select: { id: true, name: true } },
        teacher:   { select: { id: true, email: true, name: true } },
        _count:    { select: { modules: true, enrollments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** All education systems with their levels */
  async listEducationSystems() {
    return this.prisma.educationSystem.findMany({
      include: {
        levels: { orderBy: { sortOrder: 'asc' } },
        countries: { select: { id: true, code: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }
}
