import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { EducationTier, ProgrammeScope, ProgrammeType, SubjectCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { norm } from './wp-text';

const TYPES = Object.values(ProgrammeType) as string[];
const SCOPES = Object.values(ProgrammeScope) as string[];
const CATEGORIES = Object.values(SubjectCategory) as string[];
const TIERS = Object.values(EducationTier) as string[];
const text = (v: unknown, max = 160) => { const s = String(v ?? '').trim(); if (!s) throw new BadRequestException('A name is required'); return s.slice(0, max); };

/** Common short forms that mean the same subject */
const ALIASES: Record<string, string> = { maths: 'mathematics', math: 'mathematics', english: 'englishlanguage', ict: 'informationandcommunicationtechnology', bio: 'biology', chem: 'chemistry', econ: 'economics' };

/** Programmes, subjects, education systems and levels: what courses are tagged with */
@Injectable()
export class TaxonomyService {
  constructor(private prisma: PrismaService) {}

  /** Everything a tagging dropdown needs */
  async options() {
    const [programmes, subjects, levels] = await Promise.all([
      this.prisma.programme.findMany({ where: { isActive: true }, select: { id: true, name: true, shortName: true, type: true, subjects: { select: { id: true } }, levels: { select: { id: true } } }, orderBy: { name: 'asc' } }),
      this.prisma.subject.findMany({ select: { id: true, name: true, category: true }, orderBy: { name: 'asc' } }),
      this.prisma.educationLevel.findMany({ select: { id: true, name: true, tier: true, sortOrder: true, educationSystem: { select: { id: true, name: true } } }, orderBy: [{ educationSystem: { name: 'asc' } }, { sortOrder: 'asc' }] }),
    ]);
    const teachers = await this.prisma.userProfile.findMany({ where: { role: 'TEACHER', approvalStatus: 'APPROVED' }, select: { id: true, name: true, firstName: true, lastName: true, email: true }, orderBy: { firstName: 'asc' } });
    return {
      programmes: programmes.map(p => ({ id: p.id, name: p.name, shortName: p.shortName, type: p.type, subjectIds: p.subjects.map(s => s.id), levelIds: p.levels.map(l => l.id) })),
      subjects, levels: levels.map(l => ({ id: l.id, name: l.name, tier: l.tier, system: l.educationSystem })),
      teachers: teachers.map(t => ({ id: t.id, name: t.name || [t.firstName, t.lastName].filter(Boolean).join(' ') || t.email })),
      types: TYPES, scopes: SCOPES, categories: CATEGORIES, tiers: TIERS,
    };
  }

  // ── Programmes ───────────────────────────────────────────

  async programmes() {
    const rows = await this.prisma.programme.findMany({
      select: {
        id: true, name: true, shortName: true, type: true, scope: true, isActive: true, description: true,
        educationSystem: { select: { id: true, name: true } }, countries: { select: { id: true, name: true } },
        _count: { select: { subjects: true, levels: true, platformCourses: true } },
      },
      orderBy: { name: 'asc' },
    });
    return rows.map(({ _count, ...p }) => ({ ...p, subjects: _count.subjects, levels: _count.levels, courses: _count.platformCourses }));
  }

  async programme(id: string) {
    const p = await this.prisma.programme.findUnique({
      where: { id },
      include: {
        educationSystem: { select: { id: true, name: true } }, countries: { select: { id: true, name: true } },
        subjects: { select: { id: true, name: true }, orderBy: { name: 'asc' } }, levels: { select: { id: true, name: true, sortOrder: true }, orderBy: { sortOrder: 'asc' } },
        _count: { select: { platformCourses: true } },
      },
    });
    if (!p) throw new NotFoundException('Programme not found');
    const perSubject = await this.prisma.platformCourse.groupBy({ by: ['subjectId'], where: { programmeId: id }, _count: { _all: true } });
    return { ...p, courses: p._count.platformCourses, subjects: p.subjects.map(s => ({ ...s, courses: perSubject.find(x => x.subjectId === s.id)?._count._all ?? 0 })) };
  }

  async saveProgramme(id: string | null, dto: any) {
    const data: any = {};
    if (!id || dto.name !== undefined) data.name = text(dto.name);
    if (dto.shortName !== undefined) data.shortName = dto.shortName ? String(dto.shortName).trim().slice(0, 40) : null;
    if (dto.description !== undefined) data.description = dto.description ? String(dto.description).slice(0, 2000) : null;
    if (!id || dto.type !== undefined) { if (!TYPES.includes(dto.type)) throw new BadRequestException('Choose a programme type'); data.type = dto.type; }
    if (dto.scope !== undefined) { if (!SCOPES.includes(dto.scope)) throw new BadRequestException('Choose where it applies'); data.scope = dto.scope; }
    if (dto.isActive !== undefined) data.isActive = !!dto.isActive;
    if (dto.educationSystemId !== undefined) data.educationSystemId = dto.educationSystemId || null;
    const set = (k: string) => Array.isArray(dto[k]) ? { set: dto[k].map((x: string) => ({ id: String(x) })) } : undefined;
    if (dto.countryIds !== undefined) data.countries = set('countryIds');
    if (dto.subjectIds !== undefined) data.subjects = set('subjectIds');
    if (dto.levelIds !== undefined) data.levels = set('levelIds');
    try {
      return id ? await this.prisma.programme.update({ where: { id }, data }) : await this.prisma.programme.create({ data: { ...data, countries: data.countries ? { connect: data.countries.set } : undefined, subjects: data.subjects ? { connect: data.subjects.set } : undefined, levels: data.levels ? { connect: data.levels.set } : undefined } });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('A programme with that name already exists');
      throw e;
    }
  }

  // ── Subjects ─────────────────────────────────────────────

  async subjects() {
    const rows = await this.prisma.subject.findMany({
      select: { id: true, name: true, category: true, isPractical: true, _count: { select: { programmes: true, platformCourses: true, teacherProfiles: true } } },
      orderBy: { name: 'asc' },
    });
    // Likely duplicates: same name ignoring punctuation, or a known short form
    const key = (n: string) => { const k = norm(n); return ALIASES[k] ?? k; };
    const groups = new Map<string, string[]>();
    for (const s of rows) groups.set(key(s.name), [...(groups.get(key(s.name)) ?? []), s.id]);
    return rows.map(({ _count, ...s }) => {
      const twins = (groups.get(key(s.name)) ?? []).filter(x => x !== s.id);
      return { ...s, programmes: _count.programmes, courses: _count.platformCourses, teachers: _count.teacherProfiles, duplicateOf: twins };
    });
  }

  async subject(id: string) {
    const s = await this.prisma.subject.findUnique({ where: { id }, include: { programmes: { select: { id: true, name: true, shortName: true }, orderBy: { name: 'asc' } }, _count: { select: { platformCourses: true, teacherProfiles: true } } } });
    if (!s) throw new NotFoundException('Subject not found');
    return { ...s, courses: s._count.platformCourses, teachers: s._count.teacherProfiles };
  }

  async saveSubject(id: string | null, dto: any) {
    const data: any = {};
    if (!id || dto.name !== undefined) data.name = text(dto.name, 120);
    if (!id || dto.category !== undefined) { if (!CATEGORIES.includes(dto.category)) throw new BadRequestException('Choose a category'); data.category = dto.category; }
    if (dto.isPractical !== undefined) data.isPractical = !!dto.isPractical;
    if (Array.isArray(dto.programmeIds)) data.programmes = id ? { set: dto.programmeIds.map((x: string) => ({ id: x })) } : { connect: dto.programmeIds.map((x: string) => ({ id: x })) };
    try {
      return id ? await this.prisma.subject.update({ where: { id }, data }) : await this.prisma.subject.create({ data });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('That subject already exists in this category');
      throw e;
    }
  }

  /** Move courses, programmes, teachers and WordPress mappings from one subject to another, then remove it */
  async mergeSubject(fromId: string, intoId: string) {
    if (fromId === intoId) throw new BadRequestException('Choose a different subject to merge into');
    const [from, into] = await Promise.all([
      this.prisma.subject.findUnique({ where: { id: fromId }, include: { programmes: { select: { id: true } }, teacherProfiles: { select: { id: true } } } }),
      this.prisma.subject.findUnique({ where: { id: intoId }, select: { id: true } }),
    ]);
    if (!from || !into) throw new NotFoundException('Subject not found');
    await this.prisma.$transaction(async tx => {
      const moved = await tx.platformCourse.updateMany({ where: { subjectId: fromId }, data: { subjectId: intoId } });
      await tx.wpCategoryMap.updateMany({ where: { subjectId: fromId }, data: { subjectId: intoId } });
      await tx.subject.update({ where: { id: intoId }, data: { programmes: { connect: from.programmes.map(p => ({ id: p.id })) }, teacherProfiles: { connect: from.teacherProfiles.map(t => ({ id: t.id })) } } });
      await tx.subject.delete({ where: { id: fromId } });
      return moved;
    });
    return { merged: true };
  }

  async deleteSubject(id: string) {
    const s = await this.prisma.subject.findUnique({ where: { id }, select: { _count: { select: { platformCourses: true } } } });
    if (!s) throw new NotFoundException('Subject not found');
    if (s._count.platformCourses) throw new BadRequestException('Courses use this subject — merge it into another instead');
    await this.prisma.subject.delete({ where: { id } });
    return { deleted: true };
  }

  // ── Education systems and levels ─────────────────────────

  async systems() {
    const rows = await this.prisma.educationSystem.findMany({
      include: { countries: { select: { id: true, name: true } }, levels: { select: { id: true, name: true, tier: true, sortOrder: true, _count: { select: { platformCourses: true } } }, orderBy: { sortOrder: 'asc' } }, programmes: { select: { id: true, name: true, shortName: true } } },
      orderBy: { name: 'asc' },
    });
    return rows.map(s => ({ ...s, levels: s.levels.map(({ _count, ...l }) => ({ ...l, courses: _count.platformCourses })) }));
  }

  async saveSystem(id: string | null, dto: any) {
    const data: any = {};
    if (!id || dto.name !== undefined) data.name = text(dto.name);
    if (Array.isArray(dto.countryIds)) data.countries = id ? { set: dto.countryIds.map((x: string) => ({ id: x })) } : { connect: dto.countryIds.map((x: string) => ({ id: x })) };
    try {
      return id ? await this.prisma.educationSystem.update({ where: { id }, data }) : await this.prisma.educationSystem.create({ data });
    } catch (e: any) {
      if (e?.code === 'P2002') throw new BadRequestException('An education system with that name already exists');
      throw e;
    }
  }

  async addLevel(systemId: string, dto: any) {
    if (!TIERS.includes(dto.tier)) throw new BadRequestException('Choose a stage (primary, secondary…)');
    const last = await this.prisma.educationLevel.findFirst({ where: { educationSystemId: systemId }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });
    return this.prisma.educationLevel.create({ data: { educationSystemId: systemId, name: text(dto.name, 80), tier: dto.tier, sortOrder: (last?.sortOrder ?? 0) + 1 } });
  }

  async saveLevel(id: string, dto: any) {
    const data: any = {};
    if (dto.name !== undefined) data.name = text(dto.name, 80);
    if (dto.tier !== undefined) { if (!TIERS.includes(dto.tier)) throw new BadRequestException('Unknown stage'); data.tier = dto.tier; }
    return this.prisma.educationLevel.update({ where: { id }, data });
  }

  /** Put a system's levels in a new order (sortOrder is unique per system, so move them out of the way first) */
  async orderLevels(systemId: string, ids: string[]) {
    const levels = await this.prisma.educationLevel.findMany({ where: { educationSystemId: systemId }, select: { id: true } });
    if (ids.length !== levels.length || !levels.every(l => ids.includes(l.id))) throw new BadRequestException('Send every level of this system once');
    await this.prisma.$transaction([
      ...ids.map((id, i) => this.prisma.educationLevel.update({ where: { id }, data: { sortOrder: 10_000 + i } })),
      ...ids.map((id, i) => this.prisma.educationLevel.update({ where: { id }, data: { sortOrder: i + 1 } })),
    ]);
    return { ordered: true };
  }

  async deleteLevel(id: string) {
    const l = await this.prisma.educationLevel.findUnique({ where: { id }, select: { _count: { select: { platformCourses: true } } } });
    if (!l) throw new NotFoundException('Level not found');
    if (l._count.platformCourses) throw new BadRequestException('Courses use this level');
    await this.prisma.educationLevel.delete({ where: { id } });
    return { deleted: true };
  }

  countries() {
    return this.prisma.country.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  }
}
