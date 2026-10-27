import { Controller, Get, Post, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { OrgService } from './org.service';
import { CreateOrgEnrollmentDto } from './dto/create-org-enrollment.dto';
import { ClaimSeatDto } from './dto/claim-seat.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '@cpa/shared';

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

  @Post('org-enrollments/:id/claim')
  @ApiOperation({
    summary:
      'Claim an org seat — creates account if needed, then issues a PackagePurchase. No auth required (invite link flow).',
  })
  claimSeat(@Param('id') id: string, @Body() dto: ClaimSeatDto) {
    return this.orgService.claimSeat(id, dto);
  }
}
