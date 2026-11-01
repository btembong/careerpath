import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrgService } from './org.service';
import { CreateOrgEnrollmentDto } from './dto/create-org-enrollment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@cpa/shared';
import { UserProfile } from '@prisma/client';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('org')
@Controller('org')
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Post('admin/org-enrollments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: '[Admin] Record a bulk org purchase — creates one invite seat per email',
  })
  create(@Body() dto: CreateOrgEnrollmentDto) {
    return this.orgService.createEnrollment(dto);
  }

  @Get('admin/org-enrollments')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] List all org enrollments' })
  listAll() {
    return this.orgService.listEnrollments();
  }

  @Get('admin/org-enrollments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Get enrollment details with seat claim status' })
  getOne(@Param('id') id: string) {
    return this.orgService.getEnrollment(id);
  }

  @Post('admin/org-enrollments/:id/seats')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Invite more people to an organisation (one seat per new email)' })
  addSeats(@Param('id') id: string, @Body('emails') emails: string[]) {
    return this.orgService.addSeats(id, Array.isArray(emails) ? emails.slice(0, 500) : []);
  }

  @Post('org-enrollments/claim-mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.STUDENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: '[Student] Claim every seat an organisation bought for my email' })
  claimMine(@CurrentUser() user: UserProfile) {
    return this.orgService.claimMine(user);
  }
}
