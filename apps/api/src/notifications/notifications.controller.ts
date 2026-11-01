import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService) {}

  // Admin routes first so 'admin' isn't captured by ':id'
  @Get('admin/broadcasts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Recent broadcasts' })
  listBroadcasts() { return this.svc.listBroadcasts(); }

  @Get('admin/broadcasts/reach')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] How many people an announcement would reach' })
  reach(@Query('audience') audience?: string, @Query('countryId') countryId?: string) { return this.svc.reach(audience, countryId); }

  @Post('admin/broadcasts')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: '[Admin] Send an announcement to an audience (in-app, email, or both)' })
  broadcast(
    @CurrentUser() user: UserProfile,
    @Body() dto: { title?: string; body?: string; audience?: string; channel?: string; countryId?: string },
  ) {
    return this.svc.broadcast(user.id, dto);
  }

  @Get()
  @ApiOperation({ summary: 'My notifications (latest 100)' })
  list(@CurrentUser() user: UserProfile) { return this.svc.list(user.id); }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  markAllRead(@CurrentUser() user: UserProfile) { return this.svc.markAllRead(user.id); }

  @Patch(':id/read')
  markRead(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.svc.markRead(user.id, id); }

  @Delete(':id')
  remove(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.svc.remove(user.id, id); }
}
