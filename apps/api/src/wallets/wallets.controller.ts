import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { WalletsService } from './wallets.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { UserRole } from '@cpa/shared';
import { UserProfile } from '@prisma/client';

@ApiTags('wallets')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('wallets')
export class WalletsController {
  constructor(private readonly walletsService: WalletsService) {}

  @Get('me/wallet')
  @Roles(UserRole.TEACHER, UserRole.SUBJECT_REVIEWER, UserRole.COUNTRY_REP)
  @ApiOperation({ summary: 'Own wallet balance and transactions (cursor-paginated, default 50 per page)' })
  getMyWallet(
    @CurrentUser() user: UserProfile,
    @Query('cursor') cursor?: string,
    @Query('take') take?: string,
  ) {
    return this.walletsService.getMyWallet(user, cursor, take ? Math.min(Number(take), 100) : 50);
  }

  @Get('admin/wallets')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] All wallets — balances and transaction counts' })
  getAllWallets() {
    return this.walletsService.getAllWallets();
  }

  @Get('admin/wallets/:id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Full transaction history for one wallet' })
  getWallet(@Param('id') id: string) {
    return this.walletsService.getWalletById(id);
  }
}
