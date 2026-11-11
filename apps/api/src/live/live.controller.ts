import {
  Controller,
  Post,
  Patch,
  Get,
  Delete,
  Body,
  Headers,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  RawBodyRequest,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { LiveService } from './live.service';
import { CreateCohortDto } from './dto/create-cohort.dto';
import { AddStudentDto } from './dto/add-student.dto';
import { ScheduleClassDto } from './dto/schedule-class.dto';
import { RequestTokenDto } from './dto/request-token.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@cpa/shared';
import { UserProfile } from '@prisma/client';

@ApiTags('live')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('live')
export class LiveController {
  constructor(private readonly liveService: LiveService) {}

  // ── Upcoming (portal dashboards) ─────────────────────────

  @Get('student/upcoming')
  @Roles(UserRole.STUDENT, UserRole.ADMIN)
  @ApiOperation({ summary: '[Student] All upcoming live classes across enrolled cohorts' })
  getStudentUpcoming(@CurrentUser() user: UserProfile) {
    return this.liveService.getStudentUpcoming(user.id);
  }

  @Get('teacher/upcoming')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Teacher] All upcoming live classes across own cohorts' })
  getTeacherUpcoming(@CurrentUser() user: UserProfile) {
    return this.liveService.getTeacherUpcoming(user.id);
  }

  // ── Cohort management (teacher) ──────────────────────────

  @Post('cohorts')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Teacher] Create a new cohort' })
  createCohort(@CurrentUser() user: UserProfile, @Body() dto: CreateCohortDto) {
    return this.liveService.createCohort(user, dto);
  }

  @Post('cohorts/:cohortId/students')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Teacher] Enroll a student in a cohort' })
  addStudent(
    @CurrentUser() user: UserProfile,
    @Param('cohortId') cohortId: string,
    @Body() dto: AddStudentDto,
  ) {
    return this.liveService.addStudent(user, cohortId, dto);
  }

  @Delete('cohorts/:cohortId/students/:studentId')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Teacher] Remove a student from a cohort' })
  removeStudent(
    @CurrentUser() user: UserProfile,
    @Param('cohortId') cohortId: string,
    @Param('studentId') studentId: string,
  ) {
    return this.liveService.removeStudent(user, cohortId, studentId);
  }

  // ── Class scheduling ─────────────────────────────────────

  @Post('cohorts/:cohortId/classes')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Teacher] Schedule a live class for a cohort' })
  scheduleClass(
    @CurrentUser() user: UserProfile,
    @Param('cohortId') cohortId: string,
    @Body() dto: ScheduleClassDto,
  ) {
    return this.liveService.scheduleClass(user, cohortId, dto);
  }

  @Get('cohorts/:cohortId/classes')
  @Roles(UserRole.TEACHER, UserRole.STUDENT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Upcoming and active classes for a cohort' })
  getUpcomingClasses(@Param('cohortId') cohortId: string) {
    return this.liveService.getUpcomingClasses(cohortId);
  }

  // ── Class lifecycle ──────────────────────────────────────

  @Patch('classes/:liveClassId/start')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Teacher] Start the class — creates Daily.co room and marks ACTIVE' })
  startClass(
    @CurrentUser() user: UserProfile,
    @Param('liveClassId') liveClassId: string,
  ) {
    return this.liveService.startClass(user, liveClassId);
  }

  @Patch('classes/:liveClassId/end')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Teacher] End the class — closes room and marks COMPLETED' })
  endClass(
    @CurrentUser() user: UserProfile,
    @Param('liveClassId') liveClassId: string,
  ) {
    return this.liveService.endClass(user, liveClassId);
  }

  @Patch('classes/:liveClassId')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Teacher] Edit a class — title, time, length or recording link' })
  updateClass(
    @CurrentUser() user: UserProfile,
    @Param('liveClassId') liveClassId: string,
    @Body() dto: { title?: string; description?: string | null; scheduledAt?: string; durationMins?: number; recordingUrl?: string | null },
  ) {
    return this.liveService.updateClass(user, liveClassId, dto);
  }

  @Delete('classes/:liveClassId')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Teacher] Cancel a scheduled class' })
  cancelClass(
    @CurrentUser() user: UserProfile,
    @Param('liveClassId') liveClassId: string,
  ) {
    return this.liveService.cancelClass(user, liveClassId);
  }

  // ── Attendance ───────────────────────────────────────────

  @Post('classes/:liveClassId/attend')
  @Roles(UserRole.STUDENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Student] Record joining an active class' })
  recordAttendance(
    @CurrentUser() user: UserProfile,
    @Param('liveClassId') liveClassId: string,
  ) {
    return this.liveService.recordAttendance(user, liveClassId);
  }

  @Patch('classes/:liveClassId/leave')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Record leaving an active class' })
  leaveClass(
    @CurrentUser() user: UserProfile,
    @Param('liveClassId') liveClassId: string,
  ) {
    return this.liveService.leaveClass(user, liveClassId);
  }

  @Get('classes/:liveClassId/recording-page')
  @Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'The recording page: class, viewer (for the name over the picture), download rights, board, other recordings' })
  getRecordingPage(@CurrentUser() user: UserProfile, @Param('liveClassId') liveClassId: string) {
    return this.liveService.recordingPage(user, liveClassId);
  }

  @Get('classes/:liveClassId/recording')
  @Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: 'A short-lived link to watch a class recording (students in the class, its teacher, admins)' })
  getRecording(@CurrentUser() user: UserProfile, @Param('liveClassId') liveClassId: string) {
    return this.liveService.recordingLink(user, liveClassId);
  }

  @Get('classes/:liveClassId/attendance')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Teacher] Attendance list for a class' })
  getClassAttendance(
    @CurrentUser() user: UserProfile,
    @Param('liveClassId') liveClassId: string,
  ) {
    return this.liveService.getClassAttendance(user, liveClassId);
  }

  // ── Token issuance ───────────────────────────────────────

  @Post('rooms/token')
  @Roles(UserRole.TEACHER, UserRole.STUDENT, UserRole.ADMIN)
  @ApiOperation({ summary: 'Request a scoped join token for a live class' })
  requestToken(@CurrentUser() user: UserProfile, @Body() dto: RequestTokenDto) {
    return this.liveService.requestToken(user, dto);
  }

  // ── Admin overview ───────────────────────────────────────

  @Get('admin/overview')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] All live classes with stats' })
  getAdminOverview() {
    return this.liveService.getAdminOverview();
  }

  // ── Daily.co webhook (no auth — called by Daily.co servers) ─

  @Post('webhooks/daily')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Daily.co webhook: recording ready, participant events' })
  handleDailyWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Body() payload: any,
    @Headers('x-webhook-signature') signature?: string,
    @Headers('x-webhook-timestamp') timestamp?: string,
  ) {
    return this.liveService.handleDailyWebhook(payload, req.rawBody, { signature, timestamp });
  }
}
