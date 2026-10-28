import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DashboardInsightsService } from './dashboard-insights.service';

@ApiTags('portals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('portals')
export class DashboardInsightsController {
  constructor(private readonly insights: DashboardInsightsService) {}

  @Get('teacher/overview')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Teacher] Cohort activity by student and week, course progress, and quiet students' })
  teacherOverview(@CurrentUser() user: UserProfile, @Query('cohortId') cohortId?: string) {
    return this.insights.getTeacherOverview(user, cohortId || undefined);
  }

  @Get('admin/overview')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Revenue (USD), students, purchases, countries, today and pending decisions' })
  adminOverview(@Query('range') range?: string) {
    return this.insights.getAdminOverview(['7d', 'month', 'year'].includes(range ?? '') ? range : 'month');
  }
}
