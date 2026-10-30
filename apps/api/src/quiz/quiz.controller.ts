import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { QuizService } from './quiz.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@Controller('quiz')
@UseGuards(JwtAuthGuard)
export class QuizController {
  constructor(private readonly quizService: QuizService) {}

  // ── Question Bank ──────────────────────────────────────────
  @Get('questions')
  listQuestions(@Req() req: any, @Query('courseId') courseId: string, @Query('lessonId') lessonId?: string) {
    return this.quizService.listQuestions(req.user, courseId, lessonId);
  }

  @Post('questions')
  createQuestion(@Req() req: any, @Body() body: any) {
    return this.quizService.createQuestion(req.user, body.courseId, body);
  }

  @Patch('questions/:id')
  updateQuestion(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    return this.quizService.updateQuestion(req.user, id, body);
  }

  @Delete('questions/:id')
  deleteQuestion(@Req() req: any, @Param('id') id: string) {
    return this.quizService.deleteQuestion(req.user, id);
  }

  // ── Attempts ──────────────────────────────────────────────
  @Get('start')
  startAttempt(@Req() req: any, @Query('courseId') courseId: string, @Query('lessonId') lessonId: string) {
    return this.quizService.startAttempt(req.user.id, courseId, lessonId);
  }

  @Post('submit')
  submitAttempt(@Req() req: any, @Body() body: any) {
    return this.quizService.submitAttempt(req.user.id, body);
  }

  @Get('history')
  attemptHistory(@Req() req: any, @Query('lessonId') lessonId: string) {
    return this.quizService.getAttemptHistory(req.user.id, lessonId);
  }

  @Get('analytics/:lessonId')
  analytics(@Param('lessonId') lessonId: string) {
    return this.quizService.getQuizAnalytics(lessonId);
  }
}
