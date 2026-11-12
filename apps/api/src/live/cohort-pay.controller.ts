import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CohortPayService } from './cohort-pay.service';

@ApiTags('live')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/cohort-pay')
export class CohortPayController {
  constructor(private pay: CohortPayService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Cohort teacher rates (per class hour, share of sales) and what each cohort paid this month' })
  overview() {
    return this.pay.overview();
  }

  @Put()
  @ApiOperation({ summary: '[Admin] Set the defaults (perHour, share) or one cohort’s (cohortId + cohortPerHour / cohortShare; null = default)' })
  update(@CurrentUser() admin: UserProfile, @Body() dto: { perHour?: number; share?: number; cohortId?: string; cohortPerHour?: number | null; cohortShare?: number | null }) {
    return this.pay.update(admin, dto);
  }
}
