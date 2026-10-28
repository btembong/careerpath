import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StudentInsightsService } from './student-insights.service';

@ApiTags('portals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.STUDENT)
@Controller('portals/student')
export class StudentInsightsController {
  constructor(private readonly insights: StudentInsightsService) {}

  @Get('stats')
  @ApiOperation({ summary: '[Student] Course, lesson, quiz, study-time, streak and certificate totals' })
  stats(@CurrentUser() user: UserProfile) { return this.insights.getStats(user.id); }

  @Get('quiz-scores')
  @ApiOperation({ summary: '[Student] Average best quiz score per course' })
  quizScores(@CurrentUser() user: UserProfile) { return this.insights.getQuizScores(user.id); }

  @Get('weekly-hours')
  @ApiOperation({ summary: '[Student] Study hours and lessons completed over the last 8 weeks' })
  weeklyHours(@CurrentUser() user: UserProfile) { return this.insights.getWeeklyHours(user.id); }

  @Get('study-activity')
  @ApiOperation({ summary: '[Student] Lessons, practice and quizzes per course per month, for the progress heatmap' })
  studyActivity(@CurrentUser() user: UserProfile, @Query('months') months?: string) {
    return this.insights.getStudyActivity(user.id, Number(months) || 12);
  }

  @Get('last-lesson')
  @ApiOperation({ summary: '[Student] Most recently studied lesson, for "Continue learning"' })
  lastLesson(@CurrentUser() user: UserProfile) { return this.insights.getLastLesson(user.id); }

  @Get('certificate-progress')
  @ApiOperation({ summary: '[Student] Per-course progress towards a certificate' })
  certificateProgress(@CurrentUser() user: UserProfile) { return this.insights.getCertificateProgress(user.id); }

  @Get('enrollments')
  @ApiOperation({ summary: '[Student] Accessible courses with completion %' })
  enrollments(@CurrentUser() user: UserProfile) { return this.insights.getEnrollments(user.id); }

  @Get('activity-feed')
  @ApiOperation({ summary: "[Student] Classmates' recent achievements (first names only)" })
  activityFeed(@CurrentUser() user: UserProfile) { return this.insights.getActivityFeed(user.id); }
}
