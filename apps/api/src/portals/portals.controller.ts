import { Controller, Get, Post, Delete, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PortalsService } from './portals.service';
import { AdminPeopleService } from './admin-people.service';
import { ApproveTeacherDto } from './dto/approve-teacher.dto';
import { SetUserRoleDto } from './dto/set-user-role.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole, ApprovalStatus } from '@cpa/shared';
import { UserProfile } from '@prisma/client';

@ApiTags('portals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('portals')
export class PortalsController {
  constructor(private readonly portalsService: PortalsService, private readonly people: AdminPeopleService) {}

  @Get('admin/people')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Everyone, filtered by role, status or a search, 50 a page, with counts by role' })
  listPeople(@Query() q: { role?: string; search?: string; status?: string; page?: string }) {
    return this.people.list(q);
  }

  @Get('admin/people/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] One person: details, access, payments, courses and payout account' })
  person(@Param('id') id: string) {
    return this.people.detail(id);
  }

  // ── Student ──────────────────────────────────────────────

  @Get('student/courses')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Course IDs and category tags unlocked by active purchases' })
  getStudentCourses(@CurrentUser() user: UserProfile) {
    return this.portalsService.getStudentCourses(user.id);
  }

  // ── Student ─────────────────────────────────────────────

  @Get('student/cohorts')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Cohorts the student is enrolled in, with embedded teacher' })
  getStudentCohorts(@CurrentUser() user: UserProfile) {
    return this.portalsService.getStudentCohorts(user.id);
  }

  @Get('student/course-purchases')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Individually purchased courses (not via package)' })
  getCoursePurchases(@CurrentUser() user: UserProfile) {
    return this.portalsService.getStudentCoursePurchases(user.id);
  }

  @Get('student/purchase-history')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] Full purchase history (packages + individual courses)' })
  getPurchaseHistory(@CurrentUser() user: UserProfile) {
    return this.portalsService.getStudentPurchaseHistory(user.id);
  }

  @Get('student/cohorts/:cohortId/members')
  @Roles(UserRole.STUDENT)
  @ApiOperation({ summary: '[Student] List classmates in a cohort the student belongs to' })
  getStudentCohortMembers(
    @CurrentUser() user: UserProfile,
    @Param('cohortId') cohortId: string,
  ) {
    return this.portalsService.getStudentCohortMembers(user.id, cohortId);
  }

  // ── Teacher ──────────────────────────────────────────────

  @Get('teacher/cohorts')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] List all cohorts the teacher manages' })
  getTeacherCohorts(@CurrentUser() user: UserProfile) {
    return this.portalsService.getTeacherCohorts(user.id);
  }

  @Get('teacher/rosters/:cohortId')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] Student roster, upcoming classes, and assignments for a cohort' })
  getTeacherRoster(
    @Param('cohortId') cohortId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.portalsService.getTeacherRoster(cohortId, user.id);
  }

  @Get('teacher/students/:studentId/progress')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: '[Teacher] Overall course progress for a student in your cohort' })
  getStudentProgress(
    @Param('studentId') studentId: string,
    @CurrentUser() user: UserProfile,
  ) {
    return this.portalsService.getStudentProgress(studentId, user.id);
  }

  // ── Admin ────────────────────────────────────────────────

  @Get('admin/billing/stats')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Total purchases, active packages, recent sales' })
  getBillingStats() {
    return this.portalsService.getBillingStats();
  }

  @Get('admin/analytics')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Deep analytics: course completion rates, teacher revenue, enrollment trends' })
  getAnalytics() {
    return this.portalsService.getAdminAnalytics();
  }

  @Get('admin/teachers/pending')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Teacher applications awaiting approval' })
  getPendingTeachers() {
    return this.portalsService.getTeachersByStatus(ApprovalStatus.PENDING);
  }

  @Get('admin/teachers')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] List teachers by approval status' })
  getTeachers(@Query('status') status?: ApprovalStatus) {
    return this.portalsService.getTeachersByStatus(status);
  }

  @Patch('admin/teachers/:id/approve')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Approve or reject a teacher application' })
  approveTeacher(
    @Param('id') id: string,
    @Body() dto: ApproveTeacherDto,
  ) {
    return this.portalsService.approveOrRejectTeacher(id, dto.decision, dto.rejectionReason);
  }

  @Get('admin/users')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] List all users, optionally filtered by role' })
  listUsers(@Query('role') role?: UserRole) {
    return this.portalsService.listUsers(role);
  }

  @Get('admin/users/search')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Search users by email fragment' })
  searchUsers(@Query('email') email: string) {
    return this.portalsService.searchUsers(email ?? '');
  }

  @Patch('admin/users/:id/role')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Promote or change a user role; supply payoutCurrency for SUBJECT_REVIEWER' })
  setUserRole(@Param('id') id: string, @Body() dto: SetUserRoleDto) {
    return this.portalsService.setUserRole(id, dto.role, dto.payoutCurrency);
  }

  @Post('admin/sync/wp-users')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Bulk-import WordPress users who have never logged into this portal' })
  syncWpUsers() {
    return this.portalsService.syncWpUsers();
  }

  // ── Admin cohort management ──────────────────────────────

  @Get('admin/cohorts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] List all cohorts with teacher info and counts' })
  getAllCohorts() {
    return this.portalsService.getAllCohorts();
  }

  @Post('admin/cohorts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Create a cohort and assign it to a teacher' })
  createCohort(@Body() dto: { name: string; teacherId: string; sittingLabel?: string; examDate?: string; startDate?: string }) {
    return this.portalsService.createCohortForTeacher(dto);
  }

  @Patch('admin/cohorts/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Update exam date, sitting label, or start date for a cohort' })
  updateCohort(
    @Param('id') id: string,
    @Body() dto: { name?: string; teacherId?: string; sittingLabel?: string; examDate?: string; startDate?: string },
  ) {
    return this.portalsService.updateCohort(id, dto);
  }

  @Get('admin/cohorts/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Get cohort roster + classes' })
  getCohortRoster(@Param('id') id: string) {
    return this.portalsService.getCohortRoster(id);
  }

  @Post('admin/cohorts/:id/students')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Add a student to a cohort by email' })
  addStudent(@Param('id') id: string, @Body() dto: { email: string }) {
    return this.portalsService.addStudentToCohort(id, dto.email);
  }

  @Delete('admin/cohorts/:id/students/:studentId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Remove a student from a cohort' })
  removeStudent(@Param('id') id: string, @Param('studentId') studentId: string) {
    return this.portalsService.removeStudentFromCohort(id, studentId);
  }
}
