import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StudentCalendarService } from './student-calendar.service';
import { AdminTeachersService, Nudge } from './admin-teachers.service';
import { StudentProgressService } from './student-progress.service';

@ApiTags('portals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('portals')
export class PeopleController {
  constructor(
    private readonly calendar: StudentCalendarService,
    private readonly teachers: AdminTeachersService,
    private readonly progress: StudentProgressService,
  ) {}

  // ── Student quiz history and roadmap ─────────────────────

  @Get('student/quiz-history')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Every quiz attempt, scores over time and the questions missed most' })
  quizHistory(@CurrentUser() user: UserProfile) {
    return this.progress.quizHistory(user.id);
  }

  @Get('student/quiz-history/:attemptId')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] One attempt question by question' })
  quizAttempt(@CurrentUser() user: UserProfile, @Param('attemptId') attemptId: string) {
    return this.progress.quizAttempt(user.id, attemptId);
  }

  @Get('student/roadmap')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Path through a programme to its exam, with pace and this week' })
  roadmap(@CurrentUser() user: UserProfile, @Query('packageId') packageId?: string) {
    return this.progress.roadmap(user.id, packageId);
  }

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
  @ApiOperation({ summary: '[Admin] Suspend (with a reason) or reinstate a teacher' })
  suspend(@Param('id') id: string, @Body() dto: { suspended: boolean; reason?: string }) {
    return this.teachers.setSuspended(id, !!dto?.suspended, dto?.reason);
  }

  @Get('admin/teacher-applications')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Applications waiting and turned down, oldest first, with subject coverage in their country' })
  applications() {
    return this.teachers.applications();
  }

  @Post('admin/teachers/:id/ask')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Email an applicant a question before deciding' })
  ask(@CurrentUser() admin: UserProfile, @Param('id') id: string, @Body() dto: { question: string }) {
    return this.teachers.ask(admin, id, dto?.question);
  }

  @Post('admin/teachers-nudge')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Send the same reminder to several teachers: agreement, welcome, course or photo' })
  nudge(@Body() dto: { kind: Nudge; ids: string[] }) {
    return this.teachers.nudge(dto?.kind, dto?.ids);
  }

  @Post('admin/teachers-invite')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Invite someone by email to apply as a teacher' })
  invite(@Body() dto: { email: string; name?: string; note?: string }) {
    return this.teachers.invite(dto?.email, dto?.name, dto?.note);
  }
}
