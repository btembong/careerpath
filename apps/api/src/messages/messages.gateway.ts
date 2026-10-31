import { Logger } from '@nestjs/common';
import { ConnectedSocket, MessageBody, OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Pushes messages to the people in a conversation the moment they're sent.
 * Each signed-in socket joins the room `user:<id>`; the REST API stays the only way to send.
 *
 * Server → client events:
 *   message:new   { threadId, message }   — a message in one of your conversations (yours from another tab too)
 *   thread:read   { threadId, readerId }   — the other person read a one-to-one conversation
 *   typing        { threadId, userId, name } — someone in the conversation is typing
 *
 * Client → server events:
 *   typing        { threadId }             — I am typing (sent at most every few seconds)
 */
@WebSocketGateway({
  namespace: '/messages',
  cors: { origin: process.env.PORTAL_URL || 'http://localhost:3000', credentials: true },
})
export class MessagesGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(MessagesGateway.name);
  /** Open sockets per user, so email is only sent to people who aren't online */
  private online = new Map<string, number>();

  constructor(private jwt: JwtService, private prisma: PrismaService) {}

  async handleConnection(socket: Socket) {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) { socket.disconnect(); return; }
      const payload = this.jwt.verify<{ sub: string }>(token);
      const user = await this.prisma.userProfile.findUnique({ where: { id: payload.sub }, select: { id: true, approvalStatus: true } });
      if (!user || user.approvalStatus === 'SUSPENDED') { socket.disconnect(); return; }
      socket.data.userId = user.id;
      await socket.join(`user:${user.id}`);
      this.online.set(user.id, (this.online.get(user.id) ?? 0) + 1);
    } catch {
      socket.disconnect();
    }
  }

  handleDisconnect(socket: Socket) {
    const id = socket.data?.userId as string | undefined;
    if (!id) return;
    const n = (this.online.get(id) ?? 1) - 1;
    if (n <= 0) this.online.delete(id); else this.online.set(id, n);
  }

  isOnline(userId: string) {
    return (this.online.get(userId) ?? 0) > 0;
  }

  emitTo(userIds: string[], event: string, payload: unknown) {
    if (!this.server || !userIds.length) return;
    this.server.to(userIds.map(id => `user:${id}`)).emit(event, payload);
  }

  @SubscribeMessage('typing')
  async onTyping(@ConnectedSocket() socket: Socket, @MessageBody() body: { threadId?: string }) {
    const userId = socket.data?.userId as string | undefined;
    if (!userId || typeof body?.threadId !== 'string') return;
    const thread = await this.prisma.messageThread.findUnique({
      where: { id: body.threadId },
      select: { participantAId: true, participantBId: true, cohort: { select: { teacherId: true, students: { select: { studentId: true } } } } },
    });
    if (!thread) return;
    const members = thread.cohort ? [thread.cohort.teacherId, ...thread.cohort.students.map(s => s.studentId)] : [thread.participantAId, thread.participantBId].filter((x): x is string => !!x);
    if (!members.includes(userId)) return;
    const u = await this.prisma.userProfile.findUnique({ where: { id: userId }, select: { name: true, firstName: true, email: true } });
    const name = (u?.firstName || u?.name || u?.email.split('@')[0] || '').split(' ')[0];
    this.emitTo(members.filter(m => m !== userId), 'typing', { threadId: body.threadId, userId, name });
  }
}
