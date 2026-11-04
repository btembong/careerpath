import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AccountService } from './account.service';

@ApiTags('account')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('account')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Get('data-export')
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'Everything we hold about you, as one JSON file' })
  exportData(@CurrentUser() user: UserProfile) { return this.account.exportData(user); }

  @Get('deletion')
  @ApiOperation({ summary: 'Whether your account is waiting to be deleted' })
  status(@CurrentUser() user: UserProfile) { return this.account.deletionStatus(user); }

  @Post('deletion/code')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: 'Email a code to confirm deleting your account' })
  sendCode(@CurrentUser() user: UserProfile) { return this.account.sendDeletionCode(user); }

  @Post('deletion')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Delete your account in 7 days (needs the emailed code)' })
  request(@CurrentUser() user: UserProfile, @Body() body: { code: string }) { return this.account.requestDeletion(user, body?.code); }

  @Delete('deletion')
  @ApiOperation({ summary: 'Keep your account: cancel a deletion that is waiting' })
  cancel(@CurrentUser() user: UserProfile) { return this.account.cancelDeletion(user); }

  @Get('admin/deletions')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Accounts waiting to be deleted' })
  pending() { return this.account.pending(); }

  @Post('admin/deletions/:id')
  @Roles(UserRole.ADMIN)
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '[Admin] Finish deleting an account (after any payout)' })
  finish(@Param('id') id: string) { return this.account.finishByAdmin(id); }
}
