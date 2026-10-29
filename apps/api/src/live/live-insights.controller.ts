import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { LiveInsightsService } from './live-insights.service';

@ApiTags('live')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('live')
export class LiveInsightsController {
  constructor(private readonly svc: LiveInsightsService) {}

  @Get('student/overview')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Live now, coming up, past classes with attendance, and recordings to catch up on' })
  studentOverview(@CurrentUser() user: UserProfile) {
    return this.svc.studentOverview(user.id);
  }

  @Get('teacher/overview')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] Next class, week stats, classes coming up, missing recordings and past classes' })
  teacherOverview(@CurrentUser() user: UserProfile) {
    return this.svc.teacherOverview(user);
  }

  @Get('admin/classes')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Every class from the last 6 months and ahead, with attendance and recordings' })
  adminOverview() {
    return this.svc.adminOverview();
  }

  @Get('classes/:liveClassId/info')
  @Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Class details for the classroom page' })
  classInfo(@CurrentUser() user: UserProfile, @Param('liveClassId') id: string) {
    return this.svc.classInfo(user, id);
  }

  @Post('cohorts/:cohortId/classes/series')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Teacher] Schedule a class, optionally repeated every week' })
  scheduleSeries(
    @CurrentUser() user: UserProfile,
    @Param('cohortId') cohortId: string,
    @Body() dto: { title: string; description?: string; scheduledAt: string; durationMinutes?: number; weeks?: number },
  ) {
    return this.svc.scheduleSeries(user, cohortId, dto);
  }
}
