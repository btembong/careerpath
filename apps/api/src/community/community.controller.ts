import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CommunityService } from './community.service';
import { CreatePostDto } from './dto/create-post.dto';
import { SubmitStoryDto } from './dto/submit-story.dto';
import { ReviewStoryDto } from './dto/review-story.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@cpa/shared';
import { UserProfile } from '@prisma/client';

@ApiTags('community')
@Controller('community')
export class CommunityController {
  constructor(private readonly communityService: CommunityService) {}

  // ── Course discussion (auth required) ────────────────────

  @Get('courses/:courseId/discussion')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get top-level posts + replies for a course' })
  getDiscussion(@Param('courseId') courseId: string) {
    return this.communityService.getDiscussion(courseId);
  }

  @Post('courses/:courseId/discussion')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT, UserRole.TEACHER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Post a question or reply in a course discussion' })
  createPost(
    @Param('courseId') courseId: string,
    @CurrentUser() user: UserProfile,
    @Body() dto: CreatePostDto,
  ) {
    return this.communityService.createPost(courseId, user, dto);
  }

  // ── Success stories ───────────────────────────────────────

  @Post('success-stories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Student] Submit a success story for admin review' })
  submitStory(@CurrentUser() user: UserProfile, @Body() dto: SubmitStoryDto) {
    return this.communityService.submitStory(user, dto);
  }

  @Get('success-stories/published')
  @ApiOperation({ summary: 'Public — list approved, consent-given success stories' })
  getPublished() {
    return this.communityService.getPublishedStories();
  }

  @Get('admin/success-stories')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Queue of PENDING success stories to review' })
  getQueue() {
    return this.communityService.getStoryQueue();
  }

  @Patch('admin/success-stories/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Approve or reject a success story submission' })
  reviewStory(@Param('id') id: string, @Body() dto: ReviewStoryDto) {
    return this.communityService.reviewStory(id, dto);
  }
}
