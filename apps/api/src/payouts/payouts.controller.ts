import { Controller, Get, Post, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PayoutsService } from './payouts.service';
import { GeneratePayoutsDto } from './dto/generate-payouts.dto';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@cpa/shared';
import { UserProfile } from '@prisma/client';

@ApiTags('payouts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payouts')
export class PayoutsController {
  constructor(private readonly payoutsService: PayoutsService) {}

  @Post('admin/payouts/generate')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      '[Admin] Generate payout statements for a period. Totals each wallet\'s unsettled credits into one statement per recipient.',
  })
  generate(@Body() dto: GeneratePayoutsDto) {
    return this.payoutsService.generatePayouts(dto);
  }

  @Get('admin/payouts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] List all payout statements' })
  getAll() {
    return this.payoutsService.getAllStatements();
  }

  @Patch('admin/payouts/:id/mark-paid')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary:
      '[Admin] Confirm a payout was sent. Writes a DEBIT transaction so the wallet balance reflects what\'s still owed.',
  })
  markPaid(@Param('id') id: string) {
    return this.payoutsService.markPaid(id);
  }

  @Get('me/payouts')
  @Roles(UserRole.TEACHER, UserRole.SUBJECT_REVIEWER, UserRole.COUNTRY_REP)
  @ApiOperation({ summary: 'Own payout statements' })
  getMyPayouts(@CurrentUser() user: UserProfile) {
    return this.payoutsService.getMyPayouts(user);
  }
}
