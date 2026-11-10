import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CallsService } from './calls.service';

/** Voice calls in Messages. Each answer returns the room and a token for this person only. */
@Controller('calls')
@UseGuards(JwtAuthGuard)
export class CallsController {
  constructor(private calls: CallsService) {}

  /** Call the other person in a one-to-one chat, or start (or join) a group call */
  @Post()
  start(@CurrentUser() user: UserProfile, @Body('threadId') threadId: string) { return this.calls.start(user, threadId); }

  /** A call ringing for me, or one I'm in */
  @Get('current')
  current(@CurrentUser() user: UserProfile) { return this.calls.current(user); }

  @Get(':id')
  get(@Param('id') id: string, @CurrentUser() user: UserProfile) { return this.calls.get(user, id); }

  @Post(':id/accept')
  accept(@Param('id') id: string, @CurrentUser() user: UserProfile) { return this.calls.accept(user, id); }

  @Post(':id/decline')
  decline(@Param('id') id: string, @CurrentUser() user: UserProfile, @Body('message') message?: string) { return this.calls.decline(user, id, message); }

  @Post(':id/join')
  join(@Param('id') id: string, @CurrentUser() user: UserProfile) { return this.calls.join(user, id); }

  @Post(':id/leave')
  leave(@Param('id') id: string, @CurrentUser() user: UserProfile) { return this.calls.leave(user, id); }

  /** Group host: end the call for everyone */
  @Post(':id/end')
  end(@Param('id') id: string, @CurrentUser() user: UserProfile) { return this.calls.end(user, id); }
}
