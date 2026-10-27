import {
  Controller, Get, Post, Patch, Param, Query, Body,
  UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { TeachersService } from './teachers.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@cpa/shared';

@Controller('teachers')
export class TeachersController {
  constructor(private readonly svc: TeachersService) {}

  // ── Public endpoints ────────────────────────────────────

  @Get()
  list(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(12), ParseIntPipe) limit: number,
  ) {
    return this.svc.listTeachers(page, Math.min(limit, 50));
  }

  @Get(':id')
  getOne(@Param('id') id: string) {
    return this.svc.getTeacher(id);
  }

  // ── Student: submit review ──────────────────────────────

  @Post(':id/reviews')
  @UseGuards(JwtAuthGuard)
  submitReview(
    @Param('id') teacherId: string,
    @CurrentUser() user: UserProfile,
    @Body('rating', ParseIntPipe) rating: number,
    @Body('comment') comment?: string,
  ) {
    return this.svc.submitReview(teacherId, user.id, rating, comment);
  }

  // ── Teacher: own profile ────────────────────────────────

  @Get('me/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  getOwnProfile(@CurrentUser() user: UserProfile) {
    return this.svc.getOwnProfile(user.id);
  }

  @Patch('me/profile')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TEACHER)
  updateOwnProfile(
    @CurrentUser() user: UserProfile,
    @Body() dto: {
      bio?: string;
      avatarUrl?: string;
      videoIntroUrl?: string | null;
      linkedinUrl?: string;
      websiteUrl?: string;
      firstName?: string;
      lastName?: string;
      timezone?: string;
    },
  ) {
    return this.svc.updateOwnProfile(user.id, dto);
  }

  // ── Admin: set a teacher's intro video ──────────────────

  @Patch('admin/:id/video')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  setIntroVideo(@Param('id') teacherId: string, @Body('videoIntroUrl') videoIntroUrl: string | null) {
    return this.svc.adminSetIntroVideo(teacherId, videoIntroUrl);
  }
}
