import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { PayoutAccountsService, UpsertPayoutAccountDto } from './payout-accounts.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@cpa/shared';
import { UserProfile } from '@prisma/client';

@ApiTags('payout-accounts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payout-accounts')
export class PayoutAccountsController {
  constructor(private readonly service: PayoutAccountsService) {}

  @Get('me')
  @Roles(UserRole.TEACHER, UserRole.SUBJECT_REVIEWER, UserRole.COUNTRY_REP)
  @ApiOperation({ summary: 'Get my bank/payout account details' })
  getMyAccount(@CurrentUser() user: UserProfile) {
    return this.service.getMyAccount(user);
  }

  @Post('me')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.TEACHER, UserRole.SUBJECT_REVIEWER, UserRole.COUNTRY_REP)
  @ApiOperation({ summary: 'Submit or update my bank/payout account details' })
  upsertMyAccount(@CurrentUser() user: UserProfile, @Body() dto: UpsertPayoutAccountDto) {
    return this.service.upsertMyAccount(user, dto);
  }

  @Get('admin/all')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] List all submitted payout accounts' })
  getAllAccounts() {
    return this.service.getAllAccounts();
  }

  @Post('admin/:id/verify')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Mark a payout account as verified' })
  verifyAccount(@Param('id') id: string) {
    return this.service.verifyAccount(id);
  }
}
