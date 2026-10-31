import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { MessagesService, AttachmentInput } from './messages.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

// request.user is the UserProfile (see JwtStrategy.validate); it has `id`, not the token's `sub`
@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private svc: MessagesService) {}

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
