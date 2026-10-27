import { Controller, Get, Post, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { AiService } from './ai.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@Controller('ai')
@UseGuards(JwtAuthGuard)
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post('study-assistant')
  studyAssistant(@Body() body: { courseId: string; lessonId?: string; question: string }) {
    return this.aiService.studyAssistant(body.courseId, body.lessonId, body.question);
  }

  @Post('generate-quiz/:lessonId')
  generateQuiz(@Param('lessonId') lessonId: string, @Body() body: { count?: number }) {
    return this.aiService.generateQuizQuestions(lessonId, body.count);
  }

  @Post('grade-submission/:submissionId')
  gradeSubmission(@Param('submissionId') submissionId: string) {
    return this.aiService.gradeShortAnswer(submissionId);
  }

  @Get('recommendations')
  recommendations(@Req() req: any) {
    return this.aiService.getRecommendations(req.user.id);
  }
}
