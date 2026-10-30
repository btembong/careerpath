import { Controller, Delete, Get, Post, Put, Body, Param, UseGuards, Req } from '@nestjs/common';
import { RubricsService } from './rubrics.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@Controller('rubrics')
@UseGuards(JwtAuthGuard)
export class RubricsController {
  constructor(private readonly rubricsService: RubricsService) {}

  // Static paths first so they aren't read as an assignment id
  @Post('grade/:submissionId')
  gradeWithRubric(@Param('submissionId') submissionId: string, @Req() req: any, @Body() body: { scores: any[]; feedback?: string }) {
    return this.rubricsService.gradeWithRubric(req.user, submissionId, body ?? { scores: [] });
  }

  @Get('scores/:submissionId')
  getScores(@Param('submissionId') submissionId: string, @Req() req: any) {
    return this.rubricsService.getSubmissionScores(req.user, submissionId);
  }

  @Get('peer/mine')
  myPeerReviews(@Req() req: any) {
    return this.rubricsService.getMyPeerReviews(req.user.id);
  }

  @Put(':assignmentId')
  saveRubric(@Param('assignmentId') assignmentId: string, @Req() req: any, @Body() body: { criteria: any[] }) {
    return this.rubricsService.saveRubric(req.user, assignmentId, body?.criteria ?? []);
  }

  @Post(':assignmentId')
  createRubric(@Param('assignmentId') assignmentId: string, @Req() req: any, @Body() body: { criteria: any[] }) {
    return this.rubricsService.saveRubric(req.user, assignmentId, body?.criteria ?? []);
  }

  @Delete(':assignmentId')
  deleteRubric(@Param('assignmentId') assignmentId: string, @Req() req: any) {
    return this.rubricsService.deleteRubric(req.user, assignmentId);
  }

  @Get(':assignmentId')
  getRubric(@Param('assignmentId') assignmentId: string, @Req() req: any) {
    return this.rubricsService.getRubric(req.user, assignmentId);
  }

  @Post('peer/assign/:assignmentId')
  assignPeerReviews(@Param('assignmentId') assignmentId: string) {
    return this.rubricsService.assignPeerReviews(assignmentId);
  }

  @Post('peer/submit/:reviewId')
  submitPeerReview(@Param('reviewId') reviewId: string, @Req() req: any, @Body() body: { grade: number; feedback: string }) {
    return this.rubricsService.submitPeerReview(reviewId, req.user.id, body);
  }

}
