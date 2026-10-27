import { Body, Controller, Get, HttpCode, HttpStatus, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { OnboardingVideoService } from './onboarding-video.service';
import { ReportProgressDto, UpsertOnboardingVideoDto } from './onboarding-video.dto';

@ApiTags('onboarding-video')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('onboarding-video')
export class OnboardingVideoController {
  constructor(private readonly svc: OnboardingVideoService) {}

  @Get('me')
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Teacher: active orientation video and own watch progress' })
  getMine(@CurrentUser() user: UserProfile) {
    return this.svc.getForUser(user);
  }

  @Post('progress')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.TEACHER)
  @ApiOperation({ summary: 'Teacher: report playback position (server caps progress to real time)' })
  report(@CurrentUser() user: UserProfile, @Body() dto: ReportProgressDto) {
    return this.svc.reportProgress(user, dto);
  }

  @Get('admin')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: teacher orientation video settings and completion stats' })
  getAdmin() {
    return this.svc.getAdmin();
  }

  @Put('admin')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: set/replace the teacher orientation video' })
  upsert(@Body() dto: UpsertOnboardingVideoDto) {
    return this.svc.upsert(dto);
  }
}
