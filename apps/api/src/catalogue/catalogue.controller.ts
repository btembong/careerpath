import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { MailService } from '../mail/mail.service';
import { PrismaService } from '../prisma/prisma.service';
import { defaultTeacherShare } from '../course-admin/default-share';
import type { Request } from 'express';
import { GeoService } from '../audit/geo.service';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CatalogueService } from './catalogue.service';
import { PublicPagesService } from './public-pages.service';
import { ProgrammeType } from '@prisma/client';
import { ParseBoolPipe } from '@nestjs/common';

@ApiTags('catalogue')
@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogueService: CatalogueService, private readonly pages: PublicPagesService, private readonly geo: GeoService, private readonly mail: MailService, private readonly prisma: PrismaService) {}

  @Get('teacher-share')
  @ApiOperation({ summary: 'The teacher’s default share of a course sale, for the tutors page' })
  async teacherShare() {
    return { pct: await defaultTeacherShare(this.prisma) };
  }

  @Post('school-enquiry')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'A school asking for a quote on places (the For schools page): emailed to the partnerships inbox' })
  async schoolEnquiry(@Req() req: Request, @Body() b: { organisation?: string; name?: string; email?: string; phone?: string; students?: string | number; exam?: string; message?: string; website?: string }) {
    // A filled hidden field means a bot: say thanks and send nothing
    if (b?.website) return { ok: true };
    const t = (v: unknown, n: number) => String(v ?? '').trim().slice(0, n);
    const organisation = t(b?.organisation, 140), email = t(b?.email, 160).toLowerCase(), students = t(b?.students, 20), exam = t(b?.exam, 120);
    if (organisation.length < 2) throw new BadRequestException('Tell us the name of your school or organisation');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Enter a valid email address');
    if (!students) throw new BadRequestException('About how many students?');
    const place = this.geo.place(req.ip);
    await this.mail.sendSchoolEnquiry({ organisation, name: t(b?.name, 100) || null, email, phone: t(b?.phone, 40) || null, students, exam: exam || 'Not said', country: place?.country ?? null, message: t(b?.message, 1500) || null });
    return { ok: true };
  }

  @Get('my-country')
  @ApiOperation({ summary: 'The country of the visitor’s IP address (from the database on our server), so the course list can start there' })
  myCountry(@Req() req: Request) {
    const place = this.geo.place(req.ip);
    return { code: place?.countryCode ?? null, name: place?.country ?? null };
  }

  @Get('course-page/:slug')
  @ApiOperation({ summary: 'Public course page: outline, teacher, counts, price, packages that include it, related courses' })
  coursePage(@Param('slug') slug: string) {
    return this.pages.course(slug);
  }

  @Get('course-preview/:slug')
  @ApiOperation({ summary: 'A course’s first lesson, drawn like the player, for the preview on a course card' })
  coursePreview(@Param('slug') slug: string) {
    return this.pages.preview(slug);
  }

  @Get('package-page/:id')
  @ApiOperation({ summary: 'Public package page: every course inside, teachers, totals, add-ons, FAQ (published packages only)' })
  packagePage(@Param('id') id: string) {
    return this.pages.package(id);
  }

  @Get('course-list')
  @ApiOperation({ summary: 'Public course list: every catalogue course with what a card needs, the suggested first course, and the best package' })
  courseList() {
    return this.pages.list();
  }

  @Get('teacher-list')
  @ApiOperation({ summary: 'Public teachers list: approved teachers with photo, country, subjects, courses and rating (nothing private)' })
  teacherList() {
    return this.pages.teachers();
  }

  @Get('teacher-page/:slug')
  @ApiOperation({ summary: 'Public teacher profile: bio, courses in the catalogue, reviews (first names only), others in the same subject' })
  teacherPage(@Param('slug') slug: string) {
    return this.pages.teacher(slug);
  }

  @Get('package-list')
  @ApiOperation({ summary: 'Public packages list: each published package with what is in it, cheapest first' })
  packageList() {
    return this.pages.packages();
  }

  @Get('programmes')
  @ApiOperation({ summary: 'List all programmes, optionally filtered by type and/or country' })
  @ApiQuery({ name: 'type', enum: ProgrammeType, required: false })
  @ApiQuery({ name: 'countryId', required: false })
  listProgrammes(
    @Query('type') type?: ProgrammeType,
    @Query('countryId') countryId?: string,
  ) {
    return this.catalogueService.listProgrammes({ type, countryId });
  }

  @Get('home')
  @ApiOperation({ summary: 'Public home page: programme and course counts' })
  home() {
    return this.catalogueService.homeCounts();
  }

  @Get('summary')
  @ApiOperation({ summary: 'Programme counts by type (for tab badges)' })
  @ApiQuery({ name: 'countryId', required: false })
  getSummary(@Query('countryId') countryId?: string) {
    return this.catalogueService.getSummary(countryId);
  }

  @Get('education-systems')
  @ApiOperation({ summary: 'All education systems with levels and countries' })
  listEducationSystems() {
    return this.catalogueService.listEducationSystems();
  }

  @Get('programmes/:id')
  @ApiOperation({ summary: 'Full detail for one programme' })
  getProgramme(@Param('id') id: string) {
    return this.catalogueService.getProgramme(id);
  }

  @Get('programmes/:id/subjects')
  @ApiOperation({ summary: 'Subjects grouped by category for a programme' })
  getProgrammeSubjects(@Param('id') id: string) {
    return this.catalogueService.getProgrammeSubjects(id);
  }

  @Get('courses')
  @ApiOperation({ summary: 'Public course catalogue — published courses with pricing' })
  @ApiQuery({ name: 'programmeId', required: false })
  @ApiQuery({ name: 'subjectId', required: false })
  @ApiQuery({ name: 'isSoldIndividually', required: false, type: Boolean })
  listPublicCourses(
    @Query('programmeId') programmeId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('isSoldIndividually') isSoldIndividually?: string,
  ) {
    return this.catalogueService.listPublicCourses({
      programmeId,
      subjectId,
      isSoldIndividually: isSoldIndividually === 'true',
    });
  }
}
