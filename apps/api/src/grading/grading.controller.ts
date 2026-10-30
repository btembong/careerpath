import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { GradingService } from './grading.service';

@ApiTags('grading')
@ApiBearerAuth()
@Controller('grading')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TEACHER, UserRole.ADMIN)
export class GradingController {
  constructor(private readonly grading: GradingService) {}

  @Get('queue')
  @ApiOperation({ summary: '[Teacher] Everything waiting to be graded: assignment hand-ins and written quiz answers' })
  queue(@CurrentUser() user: UserProfile) {
    return this.grading.queue(user);
  }

  @Get('quiz/:attemptId')
  @ApiOperation({ summary: "[Teacher] A quiz attempt's questions with the student's answers" })
  quizAttempt(@CurrentUser() user: UserProfile, @Param('attemptId') attemptId: string) {
    return this.grading.quizAttempt(user, attemptId);
  }

  @Post('quiz/:attemptId')
  @ApiOperation({ summary: '[Teacher] Mark the written answers of a quiz attempt' })
  gradeQuiz(@CurrentUser() user: UserProfile, @Param('attemptId') attemptId: string, @Body() body: { marks: Record<string, number>; feedback?: string }) {
    return this.grading.gradeQuizAttempt(user, attemptId, body ?? { marks: {} });
  }
}
