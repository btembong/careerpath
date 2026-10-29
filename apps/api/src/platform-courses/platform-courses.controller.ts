import {
  Controller, Get, Post, Patch, Delete, Body, Param, Query,
  UseGuards, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PlatformCoursesService } from './platform-courses.service';
import { WordPressService } from '../wordpress/wordpress.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserProfile, CourseSource } from '@prisma/client';
import { UserRole } from '@cpa/shared';

@ApiTags('platform-courses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('platform-courses')
export class PlatformCoursesController {
  constructor(
    private readonly svc: PlatformCoursesService,
    private readonly wp: WordPressService,
  ) {}

  // ── Course CRUD ───────────────────────────────────────────

  @Post()
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Create a new platform course (admin or teacher)' })
  createCourse(@CurrentUser() user: UserProfile, @Body() dto: any) {
    return this.svc.createCourse(user, dto);
  }

  @Get()
  @ApiOperation({ summary: 'List courses — teachers see own, students see published, admins see all' })
  @ApiQuery({ name: 'programmeId', required: false })
  @ApiQuery({ name: 'subjectId', required: false })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'source', enum: CourseSource, required: false })
  listCourses(
    @CurrentUser() user: UserProfile,
    @Query('programmeId') programmeId?: string,
    @Query('subjectId') subjectId?: string,
    @Query('status') status?: any,
    @Query('source') source?: CourseSource,
  ) {
    return this.svc.listCourses({
      actorId: user.id, role: user.role, programmeId, subjectId, status, source,
    });
  }

  @Post('wp-sync')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Pull published courses from WordPress and upsert into PlatformCourse' })
  syncWpCourses(@CurrentUser() user: UserProfile) {
    return this.svc.syncWpCourses(this.wp, user.id);
  }

  @Patch('bulk-assign')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Bulk-assign programme / subject / level to multiple courses' })
  bulkAssignCourses(@Body() dto: { courseIds: string[]; programmeId?: string; subjectId?: string; levelId?: string }) {
    return this.svc.bulkAssignCourses(dto);
  }

  // ── Single-course pricing ──

  @Patch('bulk-price')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Put many courses on sale at one price, or take them off sale' })
  bulkPrice(@Body() dto: { courseIds: string[]; sell: boolean; amount?: number; currency?: string }) {
    return this.svc.bulkPrice(dto);
  }

  @Get('price-defaults')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Default single-course prices per programme and currency' })
  listPriceDefaults() {
    return this.svc.listPriceDefaults();
  }

  @Patch('price-defaults')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Replace the default price table' })
  setPriceDefaults(@Body() dto: { rows: { programmeId?: string | null; currency: string; amount: number }[] }) {
    return this.svc.setPriceDefaults(dto?.rows);
  }

  @Post('price-defaults/apply')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Put package-only courses on sale at their programme default price' })
  applyPriceDefaults(@Body() dto: { currency: string; courseIds?: string[] }) {
    return this.svc.applyPriceDefaults(dto?.currency, dto?.courseIds);
  }

  @Post(':id/price-proposal')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Teacher] Propose a single-course price for admin approval' })
  proposePrice(@Param('id') id: string, @CurrentUser() user: UserProfile, @Body() dto: { amount: number; currency: string }) {
    return this.svc.proposePrice(id, user, dto);
  }

  @Post(':id/price-proposal/decision')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Approve (optionally at another price) or reject a proposed price' })
  decidePrice(@Param('id') id: string, @Body() dto: { approve: boolean; amount?: number; currency?: string }) {
    return this.svc.decidePrice(id, dto);
  }

  @Get(':id/price-guide')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] Default prices, similar-course prices, commission and packages for this course' })
  priceGuide(@Param('id') id: string, @CurrentUser() user: UserProfile) {
    return this.svc.priceGuide(id, user);
  }

  @Get(':id/teacher-share')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] Commission the teacher earns on sales of this course' })
  teacherShare(@Param('id') id: string, @CurrentUser() user: UserProfile) {
    return this.svc.teacherShare(id, user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get full course with modules and lessons' })
  getCourse(@CurrentUser() user: UserProfile, @Param('id') id: string) {
    return this.svc.getCourse(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Update course metadata' })
  updateCourse(@Param('id') id: string, @CurrentUser() user: UserProfile, @Body() dto: any) {
    return this.svc.updateCourse(id, user, dto);
  }

  @Post(':id/submit')
  @Roles(UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Submit course for admin review' })
  submitForReview(@Param('id') id: string, @CurrentUser() user: UserProfile) {
    return this.svc.submitForReview(id, user);
  }

  @Get(':id/checklist')
  @Roles(UserRole.ADMIN, UserRole.TEACHER, UserRole.SUBJECT_REVIEWER)
  @ApiOperation({ summary: 'Course readiness checklist (required items block submit-for-review)' })
  getChecklist(@Param('id') id: string, @CurrentUser() user: UserProfile) {
    return this.svc.getChecklist(id, user);
  }

  @Post(':id/apply-template')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Fill an empty course with the standard module/lesson template' })
  applyTemplate(@Param('id') id: string, @CurrentUser() user: UserProfile) {
    return this.svc.applyTemplate(id, user);
  }

  @Post(':id/publish')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Publish a course' })
  publishCourse(@Param('id') id: string) {
    return this.svc.publishCourse(id);
  }

  @Post(':id/reject')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Send a course under review back to its teacher as a draft' })
  rejectCourse(@Param('id') id: string, @Body() dto: { notes?: string }) {
    return this.svc.rejectCourse(id, dto?.notes);
  }

  @Post(':id/archive')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Archive a course' })
  archiveCourse(@Param('id') id: string) {
    return this.svc.archiveCourse(id);
  }

  // ── Modules ───────────────────────────────────────────────

  @Post(':id/modules')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Add a module to a course' })
  addModule(
    @Param('id') id: string,
    @CurrentUser() user: UserProfile,
    @Body('title') title: string,
  ) {
    return this.svc.addModule(id, user, title);
  }

  @Patch(':id/modules/:moduleId')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Rename a module' })
  updateModule(
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @CurrentUser() user: UserProfile,
    @Body('title') title: string,
  ) {
    return this.svc.updateModule(id, moduleId, user, title);
  }

  @Post(':id/modules/reorder')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder modules by providing ordered IDs array' })
  reorderModules(
    @Param('id') id: string,
    @CurrentUser() user: UserProfile,
    @Body('orderedIds') orderedIds: string[],
  ) {
    return this.svc.reorderModules(id, user, orderedIds);
  }

  @Delete(':id/modules/:moduleId')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Delete a module (cascades to lessons)' })
  deleteModule(
    @Param('id') id: string,
    @Param('moduleId') moduleId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.svc.deleteModule(id, moduleId, user);
  }

  // ── Lessons ───────────────────────────────────────────────

  @Post(':id/modules/:moduleId/lessons')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Add a lesson to a module' })
  addLesson(
    @Param('id') courseId: string,
    @Param('moduleId') moduleId: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: any,
  ) {
    return this.svc.addLesson(courseId, moduleId, user, dto);
  }

  @Patch(':id/modules/:moduleId/lessons/:lessonId')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Update a lesson' })
  updateLesson(
    @Param('id') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: any,
  ) {
    return this.svc.updateLesson(courseId, lessonId, user, dto);
  }

  @Post(':id/modules/:moduleId/lessons/reorder')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reorder lessons within a module' })
  reorderLessons(
    @Param('id') courseId: string,
    @Param('moduleId') moduleId: string,
    @CurrentUser() user: UserProfile,
    @Body('orderedIds') orderedIds: string[],
  ) {
    return this.svc.reorderLessons(courseId, moduleId, user, orderedIds);
  }

  @Delete(':id/modules/:moduleId/lessons/:lessonId')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Delete a lesson' })
  deleteLesson(
    @Param('id') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.svc.deleteLesson(courseId, lessonId, user);
  }

  @Post(':id/modules/:moduleId/lessons/:lessonId/attachments')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Add a file attachment to a lesson' })
  addAttachment(@Param('lessonId') lessonId: string, @Body() dto: any) {
    return this.svc.addAttachment(lessonId, dto);
  }

  @Delete('attachments/:attachmentId')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: 'Delete an attachment' })
  deleteAttachment(@Param('attachmentId') id: string) {
    return this.svc.deleteAttachment(id);
  }

  // ── Signed video URL ──────────────────────────────────────

  @Get(':id/lessons/:lessonId/signed-video')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Get a short-lived signed URL for a video lesson (2 h window)' })
  getSignedVideo(
    @Param('id') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.svc.getSignedVideoUrl(courseId, lessonId, user.id);
  }

  // ── Student Progress ──────────────────────────────────────

  @Post(':id/progress/:lessonId/complete')
  @Roles(UserRole.STUDENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Student] Mark lesson as complete' })
  markComplete(
    @Param('id') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: UserProfile,
    @Body('watchedSecs') watchedSecs?: number,
  ) {
    return this.svc.completeLesson(user.id, courseId, lessonId, watchedSecs);
  }

  @Post(':id/progress/:lessonId/watch')
  @Roles(UserRole.STUDENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Student] Report playback: positionSecs (resume point) and deltaSecs (seconds played since last report)' })
  updateWatchProgress(
    @Param('id') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: UserProfile,
    @Body('positionSecs') positionSecs: number,
    @Body('deltaSecs') deltaSecs: number,
  ) {
    return this.svc.recordWatch(user.id, courseId, lessonId, positionSecs, deltaSecs);
  }

  @Get(':id/progress')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Get full course progress' })
  getCourseProgress(@Param('id') courseId: string, @CurrentUser() user: UserProfile) {
    return this.svc.getCourseProgress(user.id, courseId);
  }

  @Post(':id/enroll')
  @Roles(UserRole.STUDENT, UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enroll a student in a platform course (also enrolls in WP LMS for WP courses)' })
  enrollStudent(@Param('id') courseId: string, @CurrentUser() user: UserProfile) {
    return this.svc.enrollStudent(user.id, courseId, user.wpUserId);
  }

  // ── Quiz: Questions (teacher) ─────────────────────────────

  @Get(':id/lessons/:lessonId/questions')
  @ApiOperation({ summary: 'Questions for a lesson (course teacher/admin = with answers; students with access = without)' })
  getQuestions(
    @Param('id') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.svc.getQuestions(courseId, lessonId, user);
  }

  @Post(':id/lessons/:lessonId/questions')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] Add a question to a quiz lesson' })
  addQuestion(
    @Param('id') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: any,
  ) {
    return this.svc.addQuestion(courseId, lessonId, user, dto);
  }

  @Patch(':id/lessons/:lessonId/questions/:questionId')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] Update a quiz question' })
  updateQuestion(
    @Param('id') courseId: string,
    @Param('lessonId') lessonId: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: any,
  ) {
    return this.svc.updateQuestion(courseId, lessonId, questionId, user, dto);
  }

  @Delete(':id/lessons/:lessonId/questions/:questionId')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] Delete a quiz question' })
  deleteQuestion(
    @Param('id') courseId: string,
    @Param('lessonId') lessonId: string,
    @Param('questionId') questionId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.svc.deleteQuestion(courseId, lessonId, questionId, user);
  }

  // ── Practice on video/text lessons ────────────────────────

  @Get(':id/lessons/:lessonId/practice')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Practice questions for a lesson (no answers) and best score so far' })
  getPractice(
    @Param('id') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.svc.getPractice(user.id, courseId, lessonId);
  }

  @Post(':id/lessons/:lessonId/practice/submit')
  @Roles(UserRole.STUDENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Student] Mark practice answers; returns worked solutions and the video moment for each' })
  submitPractice(
    @Param('id') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: UserProfile,
    @Body('answers') answers: Record<string, string>,
  ) {
    return this.svc.submitPractice(user.id, courseId, lessonId, answers ?? {});
  }

  @Patch(':id/lessons/:lessonId/quiz-config')
  @Roles(UserRole.ADMIN, UserRole.TEACHER)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Teacher] Update quiz settings (pass mark, time limit, attempts)' })
  updateQuizConfig(
    @Param('id') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: any,
  ) {
    return this.svc.updateQuizConfig(courseId, lessonId, user, dto);
  }

  // ── Quiz: Student submit ──────────────────────────────────

  @Post(':id/lessons/:lessonId/quiz/submit')
  @Roles(UserRole.STUDENT)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Student] Submit quiz answers' })
  submitQuiz(
    @Param('id') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: UserProfile,
    @Body('answers') answers: Record<string, string>,
  ) {
    return this.svc.submitQuizAttempt(user.id, courseId, lessonId, answers);
  }

  @Get(':id/lessons/:lessonId/quiz/attempts')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Get past quiz attempts' })
  getQuizAttempts(
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.svc.getQuizAttempts(user.id, lessonId);
  }

  // ── Discussion ────────────────────────────────────────────

  @Get(':id/lessons/:lessonId/discussions')
  @ApiOperation({ summary: 'Get threaded discussion posts for a lesson' })
  getDiscussions(
    @Param('id') courseId: string,
    @Param('lessonId') lessonId: string,
  ) {
    return this.svc.getDiscussions(courseId, lessonId);
  }

  @Post(':id/lessons/:lessonId/discussions')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Post or reply in lesson discussion' })
  postDiscussion(
    @Param('id') courseId: string,
    @Param('lessonId') lessonId: string,
    @CurrentUser() user: UserProfile,
    @Body('body') body: string,
    @Body('parentId') parentId?: string,
  ) {
    return this.svc.postDiscussion(courseId, lessonId, user.id, body, parentId);
  }

  @Delete(':id/lessons/:lessonId/discussions/:postId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a discussion post (author, teacher, or admin)' })
  deleteDiscussionPost(
    @Param('postId') postId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.svc.deleteDiscussionPost(postId, user.id, user.role as string);
  }
}
