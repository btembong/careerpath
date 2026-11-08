import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { MessagesService, AttachmentInput } from './messages.service';
import { GroupsService } from './groups.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// request.user is the UserProfile (see JwtStrategy.validate); it has `id`, not the token's `sub`
@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private svc: MessagesService, private groups: GroupsService) {}

  // ── Groups ───────────────────────────────────────────────

  /** Teachers and admins: a new group with the people chosen (or a whole cohort's students) */
  @Post('groups')
  createGroup(@CurrentUser() user: UserProfile, @Body() body: { name?: string; description?: string; memberIds?: string[]; cohortId?: string }) {
    return this.groups.create(user, body ?? {});
  }

  @Get('threads/:threadId/info')
  groupInfo(@Param('threadId') threadId: string, @CurrentUser() user: UserProfile) { return this.groups.info(user, threadId); }

  @Patch('threads/:threadId/info')
  updateGroup(@Param('threadId') threadId: string, @CurrentUser() user: UserProfile, @Body() body: Record<string, any>) { return this.groups.update(user, threadId, body ?? {}); }

  @Get('threads/:threadId/candidates')
  candidates(@Param('threadId') threadId: string, @CurrentUser() user: UserProfile, @Query('q') q?: string) { return this.groups.candidates(user, threadId, q); }

  @Post('threads/:threadId/members')
  addMembers(@Param('threadId') threadId: string, @CurrentUser() user: UserProfile, @Body('userIds') userIds: string[]) { return this.groups.add(user, threadId, userIds); }

  @Delete('threads/:threadId/members/:userId')
  removeMember(@Param('threadId') threadId: string, @Param('userId') userId: string, @CurrentUser() user: UserProfile) { return this.groups.remove(user, threadId, userId); }

  @Patch('threads/:threadId/members/:userId')
  setRole(@Param('threadId') threadId: string, @Param('userId') userId: string, @CurrentUser() user: UserProfile, @Body('role') role: string) { return this.groups.setRole(user, threadId, userId, role); }

  @Post('threads/:threadId/leave')
  leave(@Param('threadId') threadId: string, @CurrentUser() user: UserProfile) { return this.groups.leave(user, threadId); }

  @Post('threads/:threadId/mute')
  mute(@Param('threadId') threadId: string, @CurrentUser() user: UserProfile, @Body('muted') muted: boolean) { return this.groups.mute(user, threadId, muted); }

  @Get('threads/:threadId/media')
  media(@Param('threadId') threadId: string, @CurrentUser() user: UserProfile, @Query('kind') kind: string) { return this.groups.media(user, threadId, kind); }

  // ── Conversations ────────────────────────────────────────

  @Get('threads')
  listThreads(@CurrentUser() user: UserProfile, @Query('q') q?: string) {
    return this.svc.listThreads(user, q);
  }

  @Get('contacts')
  contacts(@CurrentUser() user: UserProfile, @Query('q') q?: string) {
    return this.svc.contacts(user, q);
  }

  @Post('threads')
  getOrCreate(@CurrentUser() user: UserProfile, @Body('recipientId') recipientId: string) {
    return this.svc.getOrCreateThread(user, recipientId);
  }

  @Get('threads/:threadId')
  getMessages(@Param('threadId') threadId: string, @CurrentUser() user: UserProfile, @Query('cursor') cursor?: string) {
    return this.svc.getMessages(threadId, user, cursor);
  }

  /** Text and/or one attachment uploaded first through POST /files/upload?folder=messages */
  @Post('threads/:threadId')
  sendMessage(@Param('threadId') threadId: string, @CurrentUser() user: UserProfile, @Body() body: { body?: string; attachment?: AttachmentInput | null }) {
    return this.svc.sendMessage(threadId, user, body ?? {});
  }

  @Post('threads/:threadId/read')
  markRead(@Param('threadId') threadId: string, @CurrentUser() user: UserProfile) {
    return this.svc.markThreadRead(threadId, user);
  }

  /** A fresh signed link to a message's file */
  @Get('attachments/:messageId')
  attachment(@Param('messageId') messageId: string, @CurrentUser() user: UserProfile) {
    return this.svc.attachmentLink(messageId, user);
  }

  @Get('unread')
  unreadCount(@CurrentUser() user: UserProfile) {
    return this.svc.unreadCount(user);
  }
}
