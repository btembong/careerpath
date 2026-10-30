import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CohortInsightsService } from './cohort-insights.service';

@ApiTags('portals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('portals')
export class CohortInsightsController {
  constructor(private readonly svc: CohortInsightsService) {}

  @Get('student/cohort-overview')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] My cohort: next class, attendance, assignments, group and package' })
  studentOverview(@CurrentUser() user: UserProfile, @Query('cohortId') cohortId?: string) {
    return this.svc.studentOverview(user, cohortId || undefined);
  }

  @Get('teacher/my-students')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] Students across all cohorts with progress and attention flags' })
  teacherStudents(@CurrentUser() user: UserProfile) {
    return this.svc.teacherStudents(user);
  }

  @Get('teacher/cohorts/:id/overview')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Teacher] Cohort students with progress and attention flags, classes and assignments' })
  teacherOverview(@CurrentUser() user: UserProfile, @Param('id') id: string) {
    return this.svc.teacherOverview(user, id);
  }

  @Get('teacher/cohorts/:id/students/:studentId')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Teacher] One student in a cohort: courses, classes and assignments' })
  teacherStudent(@CurrentUser() user: UserProfile, @Param('id') id: string, @Param('studentId') studentId: string) {
    return this.svc.teacherStudent(user, id, studentId);
  }

  @Get('admin/cohort-list')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Cohorts with status, next class and linked packages' })
  adminList() {
    return this.svc.adminList();
  }

  @Get('admin/cohorts/:id/overview')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] One cohort: attendance, progress, revenue, students and how they joined' })
  adminDetail(@Param('id') id: string) {
    return this.svc.adminDetail(id);
  }
}
