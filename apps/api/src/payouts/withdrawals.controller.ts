import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PayoutRules, WithdrawalsService } from './withdrawals.service';

const EARNERS = [UserRole.TEACHER, UserRole.SUBJECT_REVIEWER, UserRole.COUNTRY_REP];

@ApiTags('payouts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class WithdrawalsController {
  constructor(private readonly w: WithdrawalsService) {}

  // ── Earners: Get paid ───────────────────────────────────
  @Get('me/get-paid')
  @Roles(...EARNERS)
  @ApiOperation({ summary: 'Balance (ready, clearing, being sent), payout account, PIN state and withdrawals' })
  mine(@CurrentUser() u: UserProfile) { return this.w.mine(u); }

  @Post('me/get-paid/code')
  @HttpCode(HttpStatus.OK)
  @Roles(...EARNERS)
  @ApiOperation({ summary: 'Email a one-time code to change the payout account or PIN, or to withdraw without the PIN' })
  code(@CurrentUser() u: UserProfile, @Body() b: { purpose?: 'account' | 'withdraw' }) { return this.w.sendCode(u, b?.purpose === 'withdraw' ? 'withdraw' : 'account'); }

  @Post('me/get-paid/account')
  @HttpCode(HttpStatus.OK)
  @Roles(...EARNERS)
  @ApiOperation({ summary: 'Save the payout account (MTN, Orange or other) and optionally the PIN, with a code' })
  account(@CurrentUser() u: UserProfile, @Body() b: { provider?: string; number?: string; country?: string; bankName?: string; pin?: string; code?: string }) { return this.w.setAccount(u, b); }

  @Post('me/get-paid/pin')
  @HttpCode(HttpStatus.OK)
  @Roles(...EARNERS)
  @ApiOperation({ summary: 'Set or change the 4-digit withdrawal PIN, with a code' })
  pin(@CurrentUser() u: UserProfile, @Body() b: { pin?: string; code?: string }) { return this.w.setPin(u, b); }

  @Post('me/get-paid/withdraw')
  @HttpCode(HttpStatus.OK)
  @Roles(...EARNERS)
  @ApiOperation({ summary: 'Withdraw: with the PIN or a code. Sent through Tranzak, or queued for approval' })
  withdraw(@CurrentUser() u: UserProfile, @Body() b: { amount?: number; pin?: string; code?: string }) { return this.w.withdraw(u, b); }

  @Post('me/get-paid/auto')
  @HttpCode(HttpStatus.OK)
  @Roles(...EARNERS)
  @ApiOperation({ summary: 'Automatic payouts: weekly, monthly or at a threshold (turning on needs a code), or off' })
  auto(@CurrentUser() u: UserProfile, @Body() b: { mode?: string | null; threshold?: number; code?: string }) { return this.w.setAuto(u, b); }

  @Post('me/get-paid/lock')
  @HttpCode(HttpStatus.OK)
  @Roles(...EARNERS)
  @ApiOperation({ summary: 'Lock withdrawals (lost phone), or unlock with a code' })
  lock(@CurrentUser() u: UserProfile, @Body() b: { locked?: boolean; code?: string }) { return this.w.setLock(u, b); }

  // ── Admin: Settlements ──────────────────────────────────
  @Get('admin/settlements')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Tranzak balances, owed, waiting for approval, today, rules' })
  overview(@CurrentUser() u: UserProfile) { return this.w.overview(u); }

  @Get('admin/settlements/withdrawals')
  @Roles(UserRole.ADMIN)
  list(@Query('status') status?: string, @Query('q') q?: string) { return this.w.list({ status, search: q }); }

  @Get('admin/settlements/history')
  @Roles(UserRole.ADMIN)
  history() { return this.w.history(); }

  @Get('admin/settlements/accounts')
  @Roles(UserRole.ADMIN)
  accounts() { return this.w.accountsToCheck(); }

  @Post('admin/settlements/code')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Email the admin a code for approving, paying, top-ups and rule changes' })
  adminCode(@CurrentUser() u: UserProfile) { return this.w.sendCode(u, 'admin'); }

  @Post('admin/settlements/withdrawals/:id/approve')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  approve(@CurrentUser() u: UserProfile, @Param('id') id: string, @Body() b: { code?: string }) { return this.w.approve(u, id, b?.code); }

  @Post('admin/settlements/withdrawals/:id/reject')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  reject(@CurrentUser() u: UserProfile, @Param('id') id: string, @Body() b: { reason?: string }) { return this.w.reject(u, id, b?.reason); }

  @Post('admin/settlements/withdrawals/:id/paid')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  paid(@CurrentUser() u: UserProfile, @Param('id') id: string, @Body() b: { reference?: string; code?: string }) { return this.w.markPaid(u, id, b ?? {}); }

  @Post('admin/settlements/withdrawals/:id/refresh')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  refresh(@Param('id') id: string) { return this.w.refresh(id); }

  @Patch('admin/settlements/rules')
  @Roles(UserRole.ADMIN)
  rules(@CurrentUser() u: UserProfile, @Body() b: Partial<PayoutRules> & { code?: string }) { return this.w.setRules(u, b); }

  @Post('admin/settlements/topup')
  @HttpCode(HttpStatus.OK)
  @Roles(UserRole.ADMIN)
  topUp(@CurrentUser() u: UserProfile, @Body() b: { amount?: number; code?: string }) { return this.w.topUp(u, b); }
}
