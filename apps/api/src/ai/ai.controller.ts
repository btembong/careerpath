import { Controller, Get, Post, Body, Param, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { AiService, TutorTurn } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('ai')
@UseGuards(JwtAuthGuard, RolesGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  /** Lesson-scoped tutor. Students need access to the lesson; teachers can try it on their own courses. */
  @Post('tutor')
  @Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
  @Throttle({ default: { ttl: 60_000, limit: 8 } })
  tutor(
    @CurrentUser() user: UserProfile,
    @Body() body: { courseId: string; lessonId: string; question: string; history?: TutorTurn[] },
  ) {
    return this.aiService.tutor(user, body.courseId, body.lessonId, body.question, body.history);
  }

  @Post('generate-quiz/:lessonId')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  generateQuiz(@CurrentUser() user: UserProfile, @Param('lessonId') lessonId: string, @Body() body: { count?: number }) {
    return this.aiService.generateQuizQuestions(user, lessonId, body?.count);
  }

  @Post('grade-submission/:submissionId')
  @Roles(UserRole.TEACHER, UserRole.ADMIN)
  gradeSubmission(@CurrentUser() user: UserProfile, @Param('submissionId') submissionId: string) {
    return this.aiService.gradeShortAnswer(user, submissionId);
  }

  @Get('recommendations')
  @Roles(UserRole.STUDENT)
  recommendations(@CurrentUser() user: UserProfile) {
    return this.aiService.getRecommendations(user.id);
  }
}
