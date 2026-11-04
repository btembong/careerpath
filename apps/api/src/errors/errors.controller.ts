import { Body, Controller, Get, Headers, HttpCode, HttpStatus, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { JwtService } from '@nestjs/jwt';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { ErrorsService } from './errors.service';

@ApiTags('errors')
@Controller('errors')
export class ErrorsController {
  constructor(private readonly errors: ErrorsService, private readonly jwt: JwtService) {}

  /** The portal reports a crash. Works signed out too; a valid sign-in just adds who it happened to. */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle({ default: { ttl: 60_000, limit: 20 } })
  @ApiOperation({ summary: 'Report a crash in the portal' })
  async report(@Body() body: { message?: string; stack?: string; where?: string }, @Headers('authorization') auth?: string, @Headers('user-agent') ua?: string) {
    let userId: string | null = null;
    try { userId = auth ? this.jwt.verify<{ sub: string }>(auth.replace(/^Bearer /, '')).sub : null; } catch { userId = null; }
    if (!body?.message) return;
    await this.errors.record({ source: 'PORTAL', message: String(body.message), where: String(body.where ?? ''), stack: body.stack ? String(body.stack) : null, userId, userAgent: ua });
  }

  @Get('admin')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Errors grouped by cause, with counts' })
  list(@Query('status') status?: string) { return this.errors.list(status || 'OPEN'); }

  @Patch('admin/:id')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Mark fixed, ignore, or open again' })
  setStatus(@Param('id') id: string, @Body() body: { status: string }) { return this.errors.setStatus(id, body?.status); }
}
