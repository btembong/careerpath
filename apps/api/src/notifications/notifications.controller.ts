import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly svc: NotificationsService, private readonly push: PushService) {}

  // ── This device: phone and computer notifications ──

  @Get('push/key')
  @ApiOperation({ summary: 'The public key a browser needs to subscribe to push notifications' })
  pushKey() { return this.push.publicKey(); }

  @Get('push/devices')
  @ApiOperation({ summary: 'My devices that get push notifications' })
  pushDevices(@CurrentUser() user: UserProfile) { return this.push.devices(user.id); }

  @Post('push/subscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'This device gets push notifications (calls, messages, every notice) when the portal is closed' })
  pushSubscribe(@CurrentUser() user: UserProfile, @Body() body: { subscription: any; device?: string }) { return this.push.subscribe(user.id, body?.subscription, body?.device); }

  @Post('push/unsubscribe')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop push notifications on this device' })
  pushUnsubscribe(@CurrentUser() user: UserProfile, @Body('endpoint') endpoint: string) { return this.push.unsubscribe(user.id, endpoint); }

  @Post('push/test')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Send myself a test notification' })
  pushTest(@CurrentUser() user: UserProfile) {
    this.push.send([user.id], { title: 'Notifications are on', body: 'This is how CareerPath Africa reaches you when the portal is closed.', url: '/settings', tag: 'test' });
    return { sent: true };
  }

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
