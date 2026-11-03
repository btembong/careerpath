import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiQuery } from '@nestjs/swagger';
import { CatalogueService } from './catalogue.service';
import { ProgrammeType } from '@prisma/client';
import { ParseBoolPipe } from '@nestjs/common';

@ApiTags('catalogue')
@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogueService: CatalogueService) {}

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
