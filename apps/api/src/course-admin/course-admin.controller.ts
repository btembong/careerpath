import { Body, Controller, Delete, Get, Param, ParseIntPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CourseManageService, BulkInput, ListQuery } from './course-manage.service';
import { WpPullService, ApplyInput, PullSettings } from './wp-pull.service';
import { TaxonomyService } from './taxonomy.service';

@ApiTags('admin course management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class CourseAdminController {
  constructor(private courses: CourseManageService, private pull: WpPullService, private taxonomy: TaxonomyService) {}

  // ── Course management ────────────────────────────────────

  @Get('course-manage')
  @ApiOperation({ summary: 'Courses with their tags, teacher and students; filters for untagged and no teacher' })
  list(@Query() q: ListQuery) { return this.courses.list(q); }

  @Get('course-manage/stats')
  stats() { return this.courses.stats(); }

  @Get('course-manage/:id')
  detail(@Param('id') id: string) { return this.courses.detail(id); }

  @Post('course-manage/bulk')
  @ApiOperation({ summary: 'Tag, accept suggestions, change teacher, publish, unpublish, hide, show or archive many courses' })
  bulk(@CurrentUser() user: UserProfile, @Body() body: BulkInput) { return this.courses.bulk(user, body); }

  // ── WordPress pull ───────────────────────────────────────

  @Get('wp-pull/preview')
  @ApiOperation({ summary: 'Check WordPress: new, changed, same and gone courses with suggested tags. Writes nothing.' })
  preview(@Query('fresh') fresh?: string) { return this.pull.preview(fresh !== '0'); }

  @Post('wp-pull/apply')
  @ApiOperation({ summary: 'Bring in the ticked changes from the last check' })
  apply(@CurrentUser() user: UserProfile, @Body() body: ApplyInput) { return this.pull.apply(user, body ?? {}); }

  @Get('wp-pull/history')
  history() { return this.pull.history(); }

  @Get('wp-pull/settings')
  settings() { return this.pull.settings(); }

  @Patch('wp-pull/settings')
  saveSettings(@Body() body: Partial<PullSettings>) { return this.pull.updateSettings(body ?? {}); }

  @Get('wp-pull/categories')
  @ApiOperation({ summary: 'WordPress course categories and what they mean on the portal' })
  categories(@Query('refresh') refresh?: string) { return this.pull.categories(refresh === '1'); }

  @Put('wp-pull/categories/:termId')
  setCategory(@Param('termId', ParseIntPipe) termId: number, @Body() body: { programmeId?: string | null; subjectId?: string | null; levelId?: string | null; ignored?: boolean }) {
    return this.pull.setCategory(termId, body ?? {});
  }

  // ── Taxonomy ─────────────────────────────────────────────

  @Get('taxonomy/options')
  options() { return this.taxonomy.options(); }

  @Get('taxonomy/countries')
  countries() { return this.taxonomy.countries(); }

  @Get('taxonomy/programmes')
  programmes() { return this.taxonomy.programmes(); }

  @Get('taxonomy/programmes/:id')
  programme(@Param('id') id: string) { return this.taxonomy.programme(id); }

  @Post('taxonomy/programmes')
  createProgramme(@Body() body: any) { return this.taxonomy.saveProgramme(null, body ?? {}); }

  @Patch('taxonomy/programmes/:id')
  updateProgramme(@Param('id') id: string, @Body() body: any) { return this.taxonomy.saveProgramme(id, body ?? {}); }

  @Get('taxonomy/subjects')
  subjects() { return this.taxonomy.subjects(); }

  @Get('taxonomy/subjects/:id')
  subject(@Param('id') id: string) { return this.taxonomy.subject(id); }

  @Post('taxonomy/subjects')
  createSubject(@Body() body: any) { return this.taxonomy.saveSubject(null, body ?? {}); }

  @Patch('taxonomy/subjects/:id')
  updateSubject(@Param('id') id: string, @Body() body: any) { return this.taxonomy.saveSubject(id, body ?? {}); }

  @Post('taxonomy/subjects/:id/merge')
  @ApiOperation({ summary: 'Merge this subject into another: courses, programmes, teachers and WordPress mappings move across' })
  merge(@Param('id') id: string, @Body('intoId') intoId: string) { return this.taxonomy.mergeSubject(id, intoId); }

  @Delete('taxonomy/subjects/:id')
  deleteSubject(@Param('id') id: string) { return this.taxonomy.deleteSubject(id); }

  @Get('taxonomy/systems')
  systems() { return this.taxonomy.systems(); }

  @Post('taxonomy/systems')
  createSystem(@Body() body: any) { return this.taxonomy.saveSystem(null, body ?? {}); }

  @Patch('taxonomy/systems/:id')
  updateSystem(@Param('id') id: string, @Body() body: any) { return this.taxonomy.saveSystem(id, body ?? {}); }

  @Post('taxonomy/systems/:id/levels')
  addLevel(@Param('id') id: string, @Body() body: any) { return this.taxonomy.addLevel(id, body ?? {}); }

  @Put('taxonomy/systems/:id/levels/order')
  orderLevels(@Param('id') id: string, @Body('ids') ids: string[]) { return this.taxonomy.orderLevels(id, ids ?? []); }

  @Patch('taxonomy/levels/:id')
  updateLevel(@Param('id') id: string, @Body() body: any) { return this.taxonomy.saveLevel(id, body ?? {}); }

  @Delete('taxonomy/levels/:id')
  deleteLevel(@Param('id') id: string) { return this.taxonomy.deleteLevel(id); }
}
