import { Controller, Get, Post, Body, Param, UseGuards, Req } from '@nestjs/common';
import { RubricsService } from './rubrics.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@Controller('rubrics')
@UseGuards(JwtAuthGuard)
export class RubricsController {
  constructor(private readonly rubricsService: RubricsService) {}

  @Post(':assignmentId')
  createRubric(@Param('assignmentId') assignmentId: string, @Body() body: { criteria: any[] }) {
    return this.rubricsService.createRubric(assignmentId, body.criteria);
  }

  @Get(':assignmentId')
  getRubric(@Param('assignmentId') assignmentId: string) {
    return this.rubricsService.getRubric(assignmentId);
  }

  @Post('grade/:submissionId')
  gradeWithRubric(@Param('submissionId') submissionId: string, @Req() req: any, @Body() body: { scores: any[] }) {
    return this.rubricsService.gradeWithRubric(submissionId, req.user.id, body.scores);
  }

  @Get('scores/:submissionId')
  getScores(@Param('submissionId') submissionId: string) {
    return this.rubricsService.getSubmissionScores(submissionId);
  }

  @Post('peer/assign/:assignmentId')
  assignPeerReviews(@Param('assignmentId') assignmentId: string) {
    return this.rubricsService.assignPeerReviews(assignmentId);
  }

  @Post('peer/submit/:reviewId')
  submitPeerReview(@Param('reviewId') reviewId: string, @Req() req: any, @Body() body: { grade: number; feedback: string }) {
    return this.rubricsService.submitPeerReview(reviewId, req.user.id, body);
  }

  @Get('peer/mine')
  myPeerReviews(@Req() req: any) {
    return this.rubricsService.getMyPeerReviews(req.user.id);
  }
}
