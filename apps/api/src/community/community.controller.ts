import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards, Delete } from '@nestjs/common';
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

  // ── Community page ───────────────────────────────────────

  @Get('feed')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Questions across my courses with teacher answers, plus success stories' })
  feed(@CurrentUser() user: UserProfile, @Query('courseId') courseId?: string, @Query('show') show?: string) {
    return this.communityService.feed(user, { courseId, show });
  }

  @Get('pulse')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Who is on CareerPath right now (seen in the last 15 minutes), for the Community hero' })
  pulse() {
    return this.communityService.pulse();
  }

  @Post('posts')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Ask a question (optionally about a lesson) or reply to one' })
  ask(@CurrentUser() user: UserProfile, @Body() body: { courseId: string; body: string; lessonId?: string; parentId?: string }) {
    return this.communityService.ask(user, body);
  }

  @Post('posts/:id/upvote')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Toggle my upvote on a question or reply' })
  upvote(@CurrentUser() user: UserProfile, @Param('id') id: string) {
    return this.communityService.toggleUpvote(user, id);
  }

  @Post('posts/:id/pin')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Teacher] Pin or unpin a question in my course' })
  pin(@CurrentUser() user: UserProfile, @Param('id') id: string) {
    return this.communityService.togglePin(user, id);
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

  @Get('admin/discussions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Questions across every course, for moderation' })
  adminDiscussions(@Query('q') q?: string) {
    return this.communityService.adminDiscussions(q);
  }

  @Delete('admin/discussions/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Remove a question or reply, with its replies' })
  adminRemove(@Param('id') id: string) {
    return this.communityService.adminRemovePost(id);
  }
}
