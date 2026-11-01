import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserProfile } from '@prisma/client';
import { UserRole } from '@cpa/shared';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StaffRoomService } from './staff-room.service';

@ApiTags('staff room')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.TEACHER, UserRole.SUBJECT_REVIEWER, UserRole.ADMIN)
@Controller('staff-room')
export class StaffRoomController {
  constructor(private readonly staff: StaffRoomService) {}

  @Get()
  @ApiOperation({ summary: 'Posts in the staff room (teachers, reviewers and CareerPath only)' })
  list(@CurrentUser() user: UserProfile, @Query('room') room?: string) { return this.staff.list(user, room); }

  @Post()
  @ApiOperation({ summary: 'Post in a room, or reply with parentId' })
  post(@CurrentUser() user: UserProfile, @Body() body: { room?: string; body?: string; parentId?: string }) { return this.staff.post(user, body ?? {}); }

  @Post(':id/upvote')
  upvote(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.staff.upvote(user, id); }

  @Post(':id/pin')
  pin(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.staff.pin(user, id); }

  @Delete(':id')
  remove(@CurrentUser() user: UserProfile, @Param('id') id: string) { return this.staff.remove(user, id); }
}
