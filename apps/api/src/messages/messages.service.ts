import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class MessagesService {
  constructor(private prisma: PrismaService) {}

  /** List all threads for a user, most recent first. */
  async listThreads(userId: string) {
    const threads = await this.prisma.messageThread.findMany({
      where: {
        OR: [{ participantAId: userId }, { participantBId: userId }],
      },
      include: {
        participantA: { select: { id: true, name: true, firstName: true, lastName: true, avatarUrl: true, role: true } },
        participantB: { select: { id: true, name: true, firstName: true, lastName: true, avatarUrl: true, role: true } },
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { body: true, createdAt: true, senderId: true, readAt: true },
        },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    return threads.map(t => {
      const other = t.participantAId === userId ? t.participantB : t.participantA;
      const last = t.messages[0] ?? null;
      const unread = last && last.senderId !== userId && !last.readAt;
      return {
        id: t.id,
        other: {
          id: other.id,
          name: other.name ?? ([other.firstName, other.lastName].filter(Boolean).join(' ') || 'User'),
          avatarUrl: other.avatarUrl,
          role: other.role,
        },
        lastMessage: last ? { body: last.body, createdAt: last.createdAt, isOwn: last.senderId === userId } : null,
        unread,
        lastMessageAt: t.lastMessageAt,
      };
    });
  }

  /** Get or create a thread between two users. */
  async getOrCreateThread(userAId: string, userBId: string) {
    if (userAId === userBId) throw new ForbiddenException('Cannot message yourself');

    // Canonical order: smaller ID as participantA
    const [a, b] = [userAId, userBId].sort();

    const thread = await this.prisma.messageThread.upsert({
      where: { participantAId_participantBId: { participantAId: a, participantBId: b } },
      create: { participantAId: a, participantBId: b },
      update: {},
      select: { id: true },
    });

    return { threadId: thread.id };
  }

  /** Get messages in a thread (paginated, newest first). */
  async getMessages(threadId: string, userId: string, cursor?: string) {
    const thread = await this.prisma.messageThread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Thread not found');
    if (thread.participantAId !== userId && thread.participantBId !== userId) {
      throw new ForbiddenException('Not a participant');
    }

    const messages = await this.prisma.message.findMany({
      where: { threadId, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { id: true, body: true, senderId: true, createdAt: true, readAt: true },
    });

    // Mark unread messages from the other side as read
    await this.prisma.message.updateMany({
      where: { threadId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });

    return messages.map(m => ({ ...m, isOwn: m.senderId === userId }));
  }

  /** Send a message in a thread. */
  async sendMessage(threadId: string, senderId: string, body: string) {
    const thread = await this.prisma.messageThread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Thread not found');
    if (thread.participantAId !== senderId && thread.participantBId !== senderId) {
      throw new ForbiddenException('Not a participant');
    }

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { threadId, senderId, body: body.trim() },
        select: { id: true, body: true, senderId: true, createdAt: true },
      }),
      this.prisma.messageThread.update({
        where: { id: threadId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return { ...message, isOwn: true };
  }

  /** Unread message count for a user. */
  async unreadCount(userId: string): Promise<{ count: number }> {
    const threads = await this.prisma.messageThread.findMany({
      where: { OR: [{ participantAId: userId }, { participantBId: userId }] },
      select: { id: true },
    });

    const count = await this.prisma.message.count({
      where: {
        threadId: { in: threads.map(t => t.id) },
        senderId: { not: userId },
        readAt: null,
      },
    });

    return { count };
  }
}
