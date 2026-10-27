import {
  Controller, Get, Post, Body, Param, Query,
  UseGuards, Request,
} from '@nestjs/common';
import { MessagesService } from './messages.service';
import { JwtAuthGuard } from '../auth/guards/jwt.guard';

@Controller('messages')
@UseGuards(JwtAuthGuard)
export class MessagesController {
  constructor(private svc: MessagesService) {}

  @Get('threads')
  listThreads(@Request() req: any) {
    return this.svc.listThreads(req.user.sub);
  }

  @Post('threads')
  getOrCreate(@Request() req: any, @Body('recipientId') recipientId: string) {
    return this.svc.getOrCreateThread(req.user.sub, recipientId);
  }

  @Get('threads/:threadId')
  getMessages(
    @Param('threadId') threadId: string,
    @Request() req: any,
    @Query('cursor') cursor?: string,
  ) {
    return this.svc.getMessages(threadId, req.user.sub, cursor);
  }

  @Post('threads/:threadId')
  sendMessage(
    @Param('threadId') threadId: string,
    @Request() req: any,
    @Body('body') body: string,
  ) {
    return this.svc.sendMessage(threadId, req.user.sub, body);
  }

  @Get('unread')
  unreadCount(@Request() req: any) {
    return this.svc.unreadCount(req.user.sub);
  }
}
