import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StudentCalendarService } from './student-calendar.service';
import { AdminTeachersService } from './admin-teachers.service';

@ApiTags('portals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('portals')
export class PeopleController {
  constructor(private readonly calendar: StudentCalendarService, private readonly teachers: AdminTeachersService) {}

  // ── Student study calendar ───────────────────────────────

  @Get('student/calendar')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Classes, deadlines, mentorship and study time between two dates' })
  getCalendar(@CurrentUser() user: UserProfile, @Query('from') from?: string, @Query('to') to?: string) {
    return this.calendar.calendar(user.id, from, to);
  }

  @Post('student/study-blocks')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Plan study time (optionally every week)' })
  addBlock(@CurrentUser() user: UserProfile, @Body() dto: { startsAt: string; durationMins?: number; topic: string; courseId?: string; repeatWeeks?: number }) {
    return this.calendar.addBlock(user.id, dto);
  }

  @Patch('student/study-blocks/:id')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Mark study time done, or move it' })
  updateBlock(@CurrentUser() user: UserProfile, @Param('id') id: string, @Body() dto: { done?: boolean; startsAt?: string; durationMins?: number; topic?: string }) {
    return this.calendar.updateBlock(user.id, id, dto);
  }

  @Delete('student/study-blocks/:id')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Remove planned study time' })
  deleteBlock(@CurrentUser() user: UserProfile, @Param('id') id: string) {
    return this.calendar.deleteBlock(user.id, id);
  }

  // ── Admin: teachers ──────────────────────────────────────

  @Get('admin/teachers-overview')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Teachers with courses, students, rating, earnings and profile completeness' })
  teachersOverview() {
    return this.teachers.overview();
  }

  @Get('admin/teachers/:id/overview')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] One teacher: courses, cohorts, mentorship and earnings' })
  teacherDetail(@Param('id') id: string) {
    return this.teachers.detail(id);
  }

  @Patch('admin/teachers/:id/suspend')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Suspend or reinstate a teacher' })
  suspend(@Param('id') id: string, @Body() dto: { suspended: boolean }) {
    return this.teachers.setSuspended(id, !!dto?.suspended);
  }
}
