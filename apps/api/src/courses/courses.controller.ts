import { Controller, Post, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CoursesService } from './courses.service';
import { AssignCourseDto } from './dto/assign-course.dto';
import { ReviewCourseDto } from './dto/review-course.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@cpa/shared';
import { UserProfile } from '@prisma/client';

@ApiTags('courses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class CoursesController {
  constructor(private readonly coursesService: CoursesService) {}

  @Get('admin/courses')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] List all course assignments' })
  listAssignments() {
    return this.coursesService.listAssignments();
  }

  @Post('admin/courses/:courseId/assign')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Assign teacher and/or reviewer to a course, set commission %' })
  assign(@Param('courseId') courseId: string, @Body() dto: AssignCourseDto) {
    return this.coursesService.assignCourse(courseId, dto);
  }

  @Get('reviewer/queue')
  @Roles(UserRole.SUBJECT_REVIEWER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Reviewer] Courses awaiting their review' })
  getQueue(@CurrentUser() user: UserProfile) {
    return this.coursesService.getReviewerQueue(user.id);
  }

  @Get('reviewer/overview')
  @Roles(UserRole.SUBJECT_REVIEWER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Reviewer] Queue, past reviews, average review time and earnings' })
  getOverview(@CurrentUser() user: UserProfile) {
    return this.coursesService.getReviewerOverview(user.id);
  }

  @Patch('reviewer/courses/:courseId/review')
  @Roles(UserRole.SUBJECT_REVIEWER, UserRole.ADMIN)
  @ApiOperation({ summary: '[Reviewer] Approve or reject a course, with notes' })
  review(
    @Param('courseId') courseId: string,
    @Body() dto: ReviewCourseDto,
    @CurrentUser() user: UserProfile,
  ) {
    return this.coursesService.reviewCourse(courseId, user, dto);
  }
}
