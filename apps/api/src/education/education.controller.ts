import { Controller, Post, Patch, Get, Body, Param, UseGuards, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { EducationService } from './education.service';
import { SubmitQuizDto } from './dto/submit-quiz.dto';
import { SubmitAssignmentDto } from './dto/submit-assignment.dto';
import { GradeSubmissionDto } from './dto/grade-submission.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@cpa/shared';
import { UserProfile } from '@prisma/client';

@ApiTags('education')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('education')
export class EducationController {
  constructor(private readonly educationService: EducationService) {}

  // ── Student: quiz ────────────────────────────────────────

  @Get('courses/:courseId/questions')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Get quiz questions for a course (correctAnswer never sent)' })
  getQuizQuestions(@Param('courseId') courseId: string) {
    return this.educationService.getQuizQuestions(courseId);
  }

  @Post('quizzes/submit')
  @Roles(UserRole.STUDENT)
  @ApiOperation({
    summary: '[Student] Submit quiz answers. MCQs auto-graded; written answers queued for review.',
  })
  submitQuiz(@CurrentUser() user: UserProfile, @Body() dto: SubmitQuizDto) {
    return this.educationService.submitQuiz(user, dto);
  }

  // ── Student: assignments ─────────────────────────────────

  @Get('assignments/mine')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] All assignments in their cohorts with submission status' })
  getStudentAssignments(@CurrentUser() user: UserProfile) {
    return this.educationService.getStudentAssignments(user.id);
  }

  @Get('student/assignments-overview')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Assignments with state, grades and stats' })
  studentOverview(@CurrentUser() user: UserProfile) {
    return this.educationService.studentAssignmentOverview(user.id);
  }

  @Get('teacher/assignments-overview')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] What to grade, assignments set and recent grades across cohorts' })
  teacherOverview(@CurrentUser() user: UserProfile) {
    return this.educationService.teacherAssignmentOverview(user);
  }

  @Post('assignments/:assignmentId/submit')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Submit an assignment (optional file URL from /files/upload)' })
  submitAssignment(
    @CurrentUser() user: UserProfile,
    @Param('assignmentId') assignmentId: string,
    @Body() dto: SubmitAssignmentDto,
  ) {
    return this.educationService.submitAssignment(user, assignmentId, dto.fileUrl, dto.note);
  }

  // ── Teacher: grading queues ──────────────────────────────

  @Post('cohorts/:cohortId/assignments')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] Create an assignment for a cohort' })
  createAssignment(
    @CurrentUser() user: UserProfile,
    @Param('cohortId') cohortId: string,
    @Body() dto: { title: string; description: string; maxPoints: number; dueDate: string },
  ) {
    return this.educationService.createAssignment(user, cohortId, dto);
  }

  @Get('assignments/:assignmentId/submissions')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] All submissions (and non-submitters) for one assignment' })
  getAssignmentSubmissions(
    @CurrentUser() user: UserProfile,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.educationService.getAssignmentSubmissions(user, assignmentId);
  }

  @Patch('quizzes/:attemptId/grade')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] Grade a written quiz attempt with a manual score' })
  gradeQuizAttempt(
    @CurrentUser() user: UserProfile,
    @Param('attemptId') attemptId: string,
    @Body('manualScore') manualScore: number,
  ) {
    return this.educationService.gradeQuizAttempt(user, attemptId, Number(manualScore));
  }

  @Get('submissions/queue')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] All PENDING_REVIEW assignment submissions across their cohorts' })
  getGradingQueue(@CurrentUser() user: UserProfile) {
    return this.educationService.getGradingQueue(user.id);
  }

  @Get('quizzes/written-queue')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] Quiz attempts with ungraded written answers' })
  getWrittenQuizQueue(@CurrentUser() user: UserProfile) {
    return this.educationService.getWrittenQuizQueue(user.id);
  }

  @Patch('submissions/:id/grade')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] Grade an assignment submission with score and feedback' })
  gradeSubmission(
    @CurrentUser() user: UserProfile,
    @Param('id') id: string,
    @Body() dto: GradeSubmissionDto,
  ) {
    return this.educationService.gradeSubmission(user, id, dto);
  }
}
