import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { FilesService } from '../files/files.service';
import { MessagesService, isGroupThread, nameOf, personSelect } from './messages.service';
import { MessagesGateway } from './messages.gateway';

/** Edit your own message for this long */
const EDIT_MINS = 15;
/** Delete your own message for everyone for this long (group admins: any time, in their group) */
const DELETE_MINS = 60;
/** Any single emoji (including flags and skin tones); no words or other characters */
const ONE_EMOJI = /^(?:\p{Regional_Indicator}{2}|[\p{Extended_Pictographic}\p{Emoji_Presentation}](?:[\u{1F3FB}-\u{1F3FF}️⃣]|‍[\p{Extended_Pictographic}\p{Emoji_Presentation}]️?)*)$/u;

/**
 * What you can do to a message: edit, delete for everyone, react, star, see who read it, search.
 * Nothing is erased: deleting hides a message and editing keeps every earlier version, so admins can see the record.
 */
@Injectable()
export class MessageActionsService {
  constructor(
    private prisma: PrismaService,
    private messages: MessagesService,
    private gateway: MessagesGateway,
    private files: FilesService,
  ) {}

  private async messageFor(me: UserProfile, id: string) {
    const msg = await this.prisma.message.findUnique({ where: { id } });
    if (!msg) throw new NotFoundException('Message not found');
    const { thread, members } = await this.messages.threadFor(me, msg.threadId);
    return { msg, thread, members };
  }

  /** Tell everyone in the chat a message changed (edited, deleted, reactions) */
  private async broadcast(threadId: string, members: string[], messageId: string) {
    for (const m of members) {
      const user = { id: m } as UserProfile;
      const [one] = await this.messages.shape(threadId, [messageId], user);
      if (one) this.gateway.emitTo([m], 'message:updated', { threadId, message: one });
    }
  }

  async edit(me: UserProfile, id: string, body: string) {
    const { msg, members } = await this.messageFor(me, id);
    if (msg.senderId !== me.id || msg.kind !== 'TEXT') throw new ForbiddenException('You can only edit your own messages');
    if (msg.deletedAt) throw new BadRequestException('This message was deleted');
    if (Date.now() - +msg.createdAt > EDIT_MINS * 60_000) throw new BadRequestException(`Messages can be edited for ${EDIT_MINS} minutes after sending`);
    if (!msg.body) throw new BadRequestException('Only text can be edited');
    const text = String(body ?? '').trim();
    if (!text) throw new BadRequestException('Write something, or delete the message instead');
    if (text.length > 4000) throw new BadRequestException('Messages can be up to 4000 characters');
    if (text === msg.body) return { unchanged: true };
    await this.prisma.$transaction([
      this.prisma.messageEdit.create({ data: { messageId: id, body: msg.body, editedById: me.id } }),
      this.prisma.message.update({ where: { id }, data: { body: text, editedAt: new Date() } }),
    ]);
    await this.broadcast(msg.threadId, members, id);
    return { edited: true };
  }

  async remove(me: UserProfile, id: string) {
    const { msg, thread, members } = await this.messageFor(me, id);
    if (msg.kind !== 'TEXT') throw new BadRequestException('Notes in the chat can’t be deleted');
    if (msg.deletedAt) return { deleted: true };
    const own = msg.senderId === me.id;
    const moderator = isGroupThread(thread) && (await this.messages.isGroupAdmin(thread, me));
    if (!moderator && !(own && Date.now() - +msg.createdAt <= DELETE_MINS * 60_000)) {
      throw new ForbiddenException(own ? 'Messages can be deleted for everyone within an hour of sending' : 'You can only delete your own messages');
    }
    // Hidden, never erased: the content stays for the record
    await this.prisma.message.update({ where: { id }, data: { deletedAt: new Date(), deletedById: me.id } });
    if (thread.pinnedMessageId === id) await this.prisma.messageThread.update({ where: { id: thread.id }, data: { pinnedMessageId: null } });
    await this.broadcast(msg.threadId, members, id);
    return { deleted: true };
  }

  async react(me: UserProfile, id: string, emoji: string) {
    const { msg, members } = await this.messageFor(me, id);
    if (!members.includes(me.id)) throw new ForbiddenException('Only people in the chat can react');
    if (msg.kind !== 'TEXT' || msg.deletedAt) throw new BadRequestException('You can’t react to this');
    if (typeof emoji !== 'string' || emoji.length > 16 || !ONE_EMOJI.test(emoji)) throw new BadRequestException('React with one emoji');
    const mine = await this.prisma.messageReaction.findUnique({ where: { messageId_userId: { messageId: id, userId: me.id } } });
    if (mine?.emoji === emoji) await this.prisma.messageReaction.delete({ where: { id: mine.id } }); // the same again takes it off
    else await this.prisma.messageReaction.upsert({ where: { messageId_userId: { messageId: id, userId: me.id } }, update: { emoji, createdAt: new Date() }, create: { messageId: id, userId: me.id, emoji } });
    await this.broadcast(msg.threadId, members, id);
    return { ok: true };
  }

  async star(me: UserProfile, id: string, starred: boolean) {
    const { msg } = await this.messageFor(me, id);
    if (msg.kind !== 'TEXT') throw new BadRequestException('Notes can’t be starred');
    if (starred) await this.prisma.messageStar.upsert({ where: { messageId_userId: { messageId: id, userId: me.id } }, update: {}, create: { messageId: id, userId: me.id } });
    else await this.prisma.messageStar.deleteMany({ where: { messageId: id, userId: me.id } });
    return { starred: !!starred };
  }

  /** Messages I starred, in chats I can still open */
  async starred(me: UserProfile) {
    const rows = await this.prisma.messageStar.findMany({
      where: { userId: me.id, message: { deletedAt: null } }, orderBy: { createdAt: 'desc' }, take: 100,
      select: { createdAt: true, message: { select: { id: true, threadId: true, body: true, createdAt: true, attachmentName: true, attachmentType: true, attachmentDuration: true, sender: { select: personSelect }, thread: { select: { id: true, participantAId: true, participantBId: true, cohortId: true, isGroup: true, name: true, cohort: { select: { name: true } } } } } } },
    });
    const out = [];
    for (const r of rows) {
      const t = r.message.thread;
      const members = await this.messages.members(t);
      if (!members.includes(me.id)) continue;
      const where = isGroupThread(t) ? t.name ?? t.cohort?.name ?? 'Group' : null;
      out.push({ id: r.message.id, threadId: t.id, body: r.message.body, attachmentName: r.message.attachmentName, attachmentType: r.message.attachmentType, attachmentDuration: r.message.attachmentDuration, createdAt: r.message.createdAt, sender: r.message.sender.id === me.id ? 'You' : nameOf(r.message.sender), where });
    }
    return out;
  }

  /** Who has read a message: only its sender (or an admin) can see this */
  async info(me: UserProfile, id: string) {
    const { msg, thread, members } = await this.messageFor(me, id);
    if (msg.senderId !== me.id && me.role !== 'ADMIN') throw new ForbiddenException('Only the sender can see who read a message');
    const others = members.filter(m => m !== msg.senderId);
    const people = await this.prisma.userProfile.findMany({ where: { id: { in: others } }, select: personSelect });
    let readAt: Map<string, Date>;
    if (isGroupThread(thread)) {
      const reads = await this.prisma.threadRead.findMany({ where: { threadId: thread.id, userId: { in: others }, lastReadAt: { gte: msg.createdAt } } });
      readAt = new Map(reads.map(r => [r.userId, r.lastReadAt]));
    } else readAt = new Map(msg.readAt ? others.map(o => [o, msg.readAt!]) : []);
    const readBy = people.filter(p => readAt.has(p.id)).map(p => ({ id: p.id, name: nameOf(p), at: readAt.get(p.id) })).sort((a, b) => +a.at! - +b.at!);
    const notYet = people.filter(p => !readAt.has(p.id)).map(p => ({ id: p.id, name: nameOf(p) }));
    return { id, sentAt: msg.createdAt, editedAt: msg.editedAt, readBy, notYet };
  }

  /** Search one chat's messages (deleted ones are left out) */
  async search(me: UserProfile, threadId: string, q: string) {
    await this.messages.threadFor(me, threadId);
    const term = String(q ?? '').trim();
    if (term.length < 2) return [];
    const rows = await this.prisma.message.findMany({
      where: { threadId, kind: 'TEXT', deletedAt: null, body: { contains: term, mode: 'insensitive' } },
      orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, body: true, createdAt: true, sender: { select: personSelect } },
    });
    return rows.map(r => ({ id: r.id, body: r.body, createdAt: r.createdAt, sender: nameOf(r.sender) }));
  }

  /** Admins only: the full record of a message, including deleted content and every earlier version */
  async record(me: UserProfile, id: string) {
    if (me.role !== 'ADMIN') throw new ForbiddenException('Only administrators can see message records');
    const msg = await this.prisma.message.findUnique({
      where: { id },
      include: { sender: { select: personSelect }, edits: { orderBy: { editedAt: 'asc' } }, thread: { select: { id: true, name: true, cohortId: true, isGroup: true } } },
    });
    if (!msg) throw new NotFoundException('Message not found');
    const deletedBy = msg.deletedById ? await this.prisma.userProfile.findUnique({ where: { id: msg.deletedById }, select: personSelect }) : null;
    return {
      id: msg.id, threadId: msg.threadId, sentAt: msg.createdAt, sender: { id: msg.sender.id, name: nameOf(msg.sender), email: msg.sender.email },
      body: msg.body, attachmentName: msg.attachmentName, attachmentType: msg.attachmentType,
      attachmentUrl: msg.attachmentKey ? await this.files.presignedDownload(msg.attachmentKey, 3600).catch(() => null) : null,
      versions: [...msg.edits.map(e => ({ body: e.body, until: e.editedAt })), { body: msg.body, until: null }],
      editedAt: msg.editedAt, deletedAt: msg.deletedAt, deletedBy: deletedBy ? nameOf(deletedBy) : null,
    };
  }
}
