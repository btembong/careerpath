import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { PaymentOpsService } from './payment-ops.service';

@ApiTags('payments')
@Controller()
export class PaymentOpsController {
  constructor(private readonly ops: PaymentOpsService) {}

  // ── Admin ────────────────────────────────────────────────

  @Get('admin/payments')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN) @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Every payment started: paid, waiting, failed, refunded' })
  list(@Query() q: { status?: string; search?: string; page?: string }) { return this.ops.list(q); }

  @Get('admin/payments/:id')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN) @ApiBearerAuth()
  detail(@Param('id') id: string) { return this.ops.detail(id); }

  @Post('admin/payments/check-all')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN) @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Ask the gateways about every waiting payment; gives access to the ones that were paid' })
  checkAll() { return this.ops.checkAll(); }

  @Post('admin/payments/:id/check')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN) @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Ask the gateway about one payment' })
  check(@Param('id') id: string) { return this.ops.check(id); }

  @Post('admin/payments/:id/refund')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.ADMIN) @ApiBearerAuth()
  @ApiOperation({ summary: '[Admin] Record a refund sent through the gateway; can end access and takes back unpaid commission' })
  refund(@CurrentUser() user: UserProfile, @Param('id') id: string, @Body() body: { amount: number; reason: string; endAccess?: boolean }) { return this.ops.refund(user, id, body ?? ({} as any)); }

  // ── Student ──────────────────────────────────────────────

  @Post('payments/me/check')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles(UserRole.STUDENT) @ApiBearerAuth()
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @ApiOperation({ summary: '[Student] Paid but no access? Ask the gateways about my recent payments' })
  checkMine(@CurrentUser() user: UserProfile) { return this.ops.checkMine(user); }

  // ── Public ───────────────────────────────────────────────

  @Get('verify/receipt/:number')
  @Throttle({ default: { ttl: 60_000, limit: 10 } })
  @ApiOperation({ summary: 'Public: is this CareerPath receipt genuine? (initials only, no email)' })
  verifyReceipt(@Param('number') number: string) { return this.ops.verifyReceipt(number); }
}
