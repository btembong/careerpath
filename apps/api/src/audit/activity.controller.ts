import { Controller, Get, Header, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ActivityQuery, ActivityService } from './activity.service';

/** Admin → Activity log. Read-only on purpose: there is no route to edit or delete an entry. */
@ApiTags('Activity log')
@ApiBearerAuth()
@Controller('admin/activity')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class ActivityController {
  constructor(private svc: ActivityService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Who changed what and when: filter by search, person, area, dates or item (newest first, 50 at a time)' })
  list(@Query() q: ActivityQuery) {
    return this.svc.list(q);
  }

  @Get('summary')
  @ApiOperation({ summary: '[Admin] This week in numbers, and what needs a look' })
  summary() {
    return this.svc.summary();
  }

  @Get('people')
  @ApiOperation({ summary: '[Admin] Everyone who appears in the log, for the Person filter' })
  people() {
    return this.svc.actors();
  }

  @Get('export.csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="careerpath-activity-log.csv"')
  @ApiOperation({ summary: '[Admin] The filtered log as a CSV file (up to 10,000 entries)' })
  csv(@Query() q: ActivityQuery) {
    return this.svc.csv(q);
  }
}
