import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { MentorPayService } from './mentor-pay.service';

@ApiTags('mentorship')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/mentor-pay')
export class MentorPayController {
  constructor(private pay: MentorPayService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Mentor rates, and each mentor’s sessions held, not paid and earned this month' })
  overview() {
    return this.pay.overview();
  }

  @Put()
  @ApiOperation({ summary: '[Admin] Set the default fee per 30 minutes (per30), or one mentor’s (mentorId + rate; rate null = default)' })
  update(@CurrentUser() admin: UserProfile, @Body() dto: { per30?: number; mentorId?: string; rate?: number | null }) {
    return this.pay.update(admin, dto);
  }
}
