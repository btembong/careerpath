import { BadRequestException, Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { FilesService } from '../files/files.service';
import { studentCourseIds } from '../prisma/student-courses';
import { MessagesGateway } from './messages.gateway';

type Person = { id: string; name: string | null; firstName: string | null; lastName: string | null; email: string; avatarUrl: string | null; role: string; lastActiveDate?: Date | null };
const nameOf = (p: Pick<Person, 'name' | 'firstName' | 'lastName' | 'email'>) => p.email.endsWith('@deleted.invalid') ? 'Deleted account' : p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
const personSelect = { id: true, name: true, firstName: true, lastName: true, email: true, avatarUrl: true, role: true, lastActiveDate: true } as const;
const msgSelect = { id: true, body: true, kind: true, senderId: true, createdAt: true, readAt: true, attachmentKey: true, attachmentName: true, attachmentType: true, attachmentSize: true, attachmentDuration: true, attachmentWave: true } as const;
type ThreadShape = { id: string; participantAId: string | null; participantBId: string | null; cohortId: string | null; isGroup: boolean };
/** Cohort groups and groups a teacher or admin made */
export const isGroupThread = (t: { cohortId: string | null; isGroup: boolean }) => !!t.cohortId || t.isGroup;
const VOICE_TYPES = /^audio\/(webm|ogg|mp4|mpeg|aac|x-m4a)$/;
/** Longest voice note, in seconds (5 minutes, with a little slack for the recorder stopping) */
const VOICE_MAX_SECS = 305;
const clock = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
/** What a chat list, notification or email shows for a message with no text */
function attachmentPreview(a: { attachmentType?: string | null; attachmentName?: string | null; attachmentDuration?: number | null }) {
  if (a.attachmentType?.startsWith('audio/')) return `🎤 Voice note (${clock(a.attachmentDuration ?? 0)})`;
  if (a.attachmentType?.startsWith('image/')) return '📷 Photo';
  return `📎 ${a.attachmentName ?? 'File'}`;
}
const ATTACHMENT_TYPES = /^(application\/pdf|image\/(jpeg|png|webp)|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;
/** Signed links to attachments last this long; the page asks again when it reloads the conversation */
const LINK_SECS = 60 * 60;

export { nameOf, personSelect };
export interface AttachmentInput { key: string; name: string; type: string; size: number; duration?: number; wave?: string }

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private mail: MailService,
    private files: FilesService,
    private gateway: MessagesGateway,
  ) {}

  // ── Who belongs where ────────────────────────────────────

  /** Cohorts a user is in: as a student on the roster, or as its teacher */
  private async cohortsOf(userId: string) {
    const [taught, joined] = await Promise.all([
      this.prisma.cohort.findMany({ where: { teacherId: userId }, select: { id: true, name: true, teacherId: true } }),
      this.prisma.cohortRoster.findMany({ where: { studentId: userId }, select: { cohort: { select: { id: true, name: true, teacherId: true } } } }),
    ]);
    return [...taught, ...joined.map(j => j.cohort)];
  }

  private async cohortMembers(cohortId: string) {
    const cohort = await this.prisma.cohort.findUnique({ where: { id: cohortId }, select: { teacherId: true, students: { select: { studentId: true } } } });
    return cohort ? [cohort.teacherId, ...cohort.students.map(s => s.studentId)] : [];
  }

  /** Everyone in a conversation: two people, a cohort's teacher and students, or a group's current members */
  async members(thread: ThreadShape) {
    if (thread.cohortId) return this.cohortMembers(thread.cohortId);
    if (thread.isGroup) return (await this.prisma.threadMember.findMany({ where: { threadId: thread.id, leftAt: null }, select: { userId: true } })).map(m => m.userId);
    return [thread.participantAId, thread.participantBId].filter((x): x is string => !!x);
  }

  async threadFor(me: UserProfile, threadId: string) {
    const thread = await this.prisma.messageThread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Conversation not found');
    const members = await this.members(thread);
    // Admins can read groups (moderation); one-to-one conversations stay private
    if (!members.includes(me.id) && !(isGroupThread(thread) && me.role === 'ADMIN')) throw new ForbiddenException('Not part of this conversation');
    return { thread, members };
  }

  /** Group admins: platform admins, a cohort's teacher, and members made admins of the group */
  async isGroupAdmin(thread: { id: string; cohortId: string | null }, user: Pick<UserProfile, 'id' | 'role'>) {
    if (user.role === 'ADMIN') return true;
    if (thread.cohortId && (await this.prisma.cohort.count({ where: { id: thread.cohortId, teacherId: user.id } }))) return true;
    return !!(await this.prisma.threadMember.count({ where: { threadId: thread.id, userId: user.id, role: 'ADMIN', leftAt: null } }));
  }

  /** A note in the chat ("Kofi added Ama"), sent live to everyone in it */
  async postSystem(thread: ThreadShape, actorId: string, text: string) {
    const created = await this.prisma.message.create({ data: { threadId: thread.id, senderId: actorId, body: text.slice(0, 500), kind: 'SYSTEM' }, select: msgSelect });
    await this.prisma.messageThread.update({ where: { id: thread.id }, data: { lastMessageAt: new Date() } });
    const members = await this.members(thread);
    const [linked] = await this.withLinks([created]);
    for (const m of members) this.gateway.emitTo([m], 'message:new', { threadId: thread.id, message: { ...linked, senderName: '', senderRole: '', isOwn: m === actorId } });
    return created;
  }

  /** How the other person relates to me, e.g. "Your teacher · WASSCE Maths" or "Student · WASSCE Maths" */
  private async contextFor(me: UserProfile, others: Person[]) {
    const mine = await this.cohortsOf(me.id);
    const ids = mine.map(c => c.id);
    const rosters = ids.length ? await this.prisma.cohortRoster.findMany({ where: { cohortId: { in: ids }, studentId: { in: others.map(o => o.id) } }, select: { cohortId: true, studentId: true } }) : [];
    const out = new Map<string, string>();
    for (const o of others) {
      const shared = mine.filter(c => c.teacherId === o.id || rosters.some(r => r.cohortId === c.id && r.studentId === o.id));
      const where = shared[0]?.name;
      out.set(o.id,
        o.role === 'ADMIN' ? 'CareerPath support'
        : o.role === 'SUBJECT_REVIEWER' ? 'Subject reviewer'
        : o.role === 'COUNTRY_REP' ? 'Country representative'
        : o.role === 'TEACHER' ? (where && shared[0].teacherId === o.id ? `Your teacher · ${where}` : 'Teacher')
        : me.role === 'TEACHER' ? (where ? `Student · ${where}` : 'Student')
        : where ? `Classmate · ${where}` : 'Student');
    }
    return out;
  }

  /** Each cohort has one group chat, created the first time someone opens their messages */
  private async ensureCohortChats(cohortIds: string[]) {
    if (!cohortIds.length) return;
    const have = await this.prisma.messageThread.findMany({ where: { cohortId: { in: cohortIds } }, select: { cohortId: true } });
    const missing = cohortIds.filter(id => !have.some(h => h.cohortId === id));
    if (missing.length) await this.prisma.messageThread.createMany({ data: missing.map(cohortId => ({ cohortId })), skipDuplicates: true });
  }

  async withLinks<T extends { attachmentKey: string | null }>(rows: T[]) {
    return Promise.all(rows.map(async ({ attachmentKey, ...m }) => ({
      ...m,
      attachmentUrl: attachmentKey ? await this.files.presignedDownload(attachmentKey, LINK_SECS).catch(() => null) : null,
    })));
  }

  // ── Inbox ────────────────────────────────────────────────

  /** One-to-one conversations and cohort group chats, most recent first, with unread counts. */
  async listThreads(me: UserProfile, q?: string) {
    const cohorts = await this.cohortsOf(me.id);
    await this.ensureCohortChats(cohorts.map(c => c.id));
    const threads = await this.prisma.messageThread.findMany({
      where: { OR: [{ participantAId: me.id }, { participantBId: me.id }, { cohortId: { in: cohorts.map(c => c.id) } }, { isGroup: true, groupMembers: { some: { userId: me.id, leftAt: null } } }] },
      include: {
        participantA: { select: personSelect },
        participantB: { select: personSelect },
        cohort: { select: { id: true, name: true, _count: { select: { students: true } } } },
        reads: { where: { userId: me.id }, select: { lastReadAt: true } },
        groupMembers: { where: { userId: me.id }, select: { muted: true } },
        _count: { select: { groupMembers: { where: { leftAt: null } } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, kind: true, deletedAt: true, createdAt: true, senderId: true, readAt: true, attachmentName: true, attachmentType: true, attachmentDuration: true, sender: { select: { name: true, firstName: true, lastName: true, email: true } } } },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    // Unread: one-to-one by readAt; groups by my read marker
    const dmIds = threads.filter(t => !isGroupThread(t)).map(t => t.id);
    const dmUnread = dmIds.length ? await this.prisma.message.groupBy({ by: ['threadId'], where: { threadId: { in: dmIds }, senderId: { not: me.id }, readAt: null }, _count: { _all: true } }) : [];
    const unread = new Map(dmUnread.map(u => [u.threadId, u._count._all]));
    for (const t of threads.filter(x => isGroupThread(x))) {
      const since = t.reads[0]?.lastReadAt;
      unread.set(t.id, await this.prisma.message.count({ where: { threadId: t.id, senderId: { not: me.id }, ...(since && { createdAt: { gt: since } }) } }));
    }

    const others = threads.filter(t => !isGroupThread(t)).map(t => (t.participantAId === me.id ? t.participantB : t.participantA)).filter((p): p is NonNullable<typeof p> => !!p);
    const ctx = await this.contextFor(me, others);
    const term = q?.trim().toLowerCase();

    return threads
      // Group chats with no messages yet still show; empty one-to-one threads only for the person who opened them
      .map(t => {
        const last = t.messages[0] ?? null;
        const preview = last ? (last.deletedAt ? 'This message was deleted' : last.kind === 'CALL' ? `📞 ${last.body}` : last.body || attachmentPreview(last)) : null;
        if (isGroupThread(t)) {
          const count = t.cohort ? t.cohort._count.students + 1 : t._count.groupMembers;
          return {
            id: t.id, kind: 'group' as const, muted: !!t.groupMembers[0]?.muted, cohortGroup: !!t.cohortId,
            other: { id: t.cohort?.id ?? t.id, name: t.name ?? t.cohort?.name ?? 'Group', avatarUrl: t.photoUrl, role: 'GROUP', context: `${t.cohortId ? 'Cohort group' : 'Group'} · ${count} members`, online: false, lastSeen: null },
            lastMessage: last ? { body: preview!, createdAt: last.createdAt, isOwn: last.senderId === me.id, sender: last.kind !== 'TEXT' ? null : last.senderId === me.id ? 'You' : nameOf(last.sender).split(' ')[0], readAt: null } : null,
            unread: unread.get(t.id) ?? 0, lastMessageAt: t.lastMessageAt,
          };
        }
        const other = (t.participantAId === me.id ? t.participantB : t.participantA)!;
        return {
          id: t.id, kind: 'direct' as const,
          other: { id: other.id, name: other.role === 'ADMIN' ? 'CareerPath support' : nameOf(other), avatarUrl: other.avatarUrl, role: other.role, context: ctx.get(other.id) ?? '', online: this.gateway.isOnline(other.id), lastSeen: other.lastActiveDate ?? null },
          lastMessage: last ? { body: preview!, createdAt: last.createdAt, isOwn: last.senderId === me.id, sender: null, readAt: last.readAt } : null,
          unread: unread.get(t.id) ?? 0, lastMessageAt: t.lastMessageAt,
        };
      })
      .filter(t => !term || t.other.name.toLowerCase().includes(term) || (t.lastMessage?.body ?? '').toLowerCase().includes(term));
  }

  /** People this user can start a conversation with. */
  async contacts(me: UserProfile, q?: string) {
    const term = q?.trim().toLowerCase();
    if (me.role === 'ADMIN') {
      // Admins can reach anyone: recent people first, or search by name or email
      const people = await this.prisma.userProfile.findMany({
        where: { id: { not: me.id }, ...(term && { OR: [{ name: { contains: term, mode: 'insensitive' } }, { firstName: { contains: term, mode: 'insensitive' } }, { lastName: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }] }) },
        select: personSelect, orderBy: { lastActiveDate: { sort: 'desc', nulls: 'last' } }, take: 40,
      });
      const label: Record<string, string> = { STUDENT: 'Student', TEACHER: 'Teacher', ADMIN: 'Admin', COUNTRY_REP: 'Country representative', SUBJECT_REVIEWER: 'Subject reviewer' };
      return people.map(p => ({ id: p.id, name: nameOf(p), avatarUrl: p.avatarUrl, role: p.role, context: `${label[p.role] ?? p.role} · ${p.email}` }));
    }

    const cohorts = await this.cohortsOf(me.id);
    const ids = new Set<string>();
    if (me.role === 'STUDENT') {
      cohorts.forEach(c => ids.add(c.teacherId));
      const courseIds = await studentCourseIds(this.prisma, me.id);
      (await this.prisma.platformCourse.findMany({ where: { id: { in: courseIds } }, select: { teacherId: true } })).forEach(t => ids.add(t.teacherId));
      (await this.prisma.cohortRoster.findMany({ where: { cohortId: { in: cohorts.map(c => c.id) } }, select: { studentId: true } })).forEach(m => ids.add(m.studentId));
    } else if (me.role === 'TEACHER') {
      (await this.prisma.cohortRoster.findMany({ where: { cohortId: { in: cohorts.map(c => c.id) } }, select: { studentId: true } })).forEach(r => ids.add(r.studentId));
      (await this.prisma.courseEnrollment.findMany({ where: { course: { teacherId: me.id } }, select: { studentId: true }, take: 300 })).forEach(e => ids.add(e.studentId));
    } else if (me.role === 'COUNTRY_REP' && me.countryId) {
      // Teachers and students in their country (reps follow up on renewals)
      (await this.prisma.userProfile.findMany({ where: { countryId: me.countryId, role: { in: ['TEACHER', 'STUDENT'] } }, select: { id: true } })).forEach(t => ids.add(t.id));
    } else if (me.role === 'SUBJECT_REVIEWER') {
      const assigned = await this.prisma.courseAssignment.findMany({ where: { reviewerId: me.id }, select: { courseId: true } });
      (await this.prisma.platformCourse.findMany({ where: { id: { in: assigned.map(a => a.courseId) } }, select: { teacherId: true } })).forEach(c => ids.add(c.teacherId));
    }
    ids.delete(me.id);
    const support = await this.prisma.userProfile.findFirst({ where: { role: 'ADMIN', approvalStatus: 'APPROVED' }, orderBy: { createdAt: 'asc' }, select: { id: true } });
    if (support) ids.add(support.id);

    const people = await this.prisma.userProfile.findMany({ where: { id: { in: [...ids] } }, select: personSelect });
    const ctx = await this.contextFor(me, people);
    const order = (r: string) => (r === 'TEACHER' ? 0 : r === 'ADMIN' ? 2 : 1);
    return people
      .map(p => ({ id: p.id, name: p.role === 'ADMIN' ? 'CareerPath support' : nameOf(p), avatarUrl: p.avatarUrl, role: p.role, context: ctx.get(p.id) ?? '' }))
      .filter(p => !term || `${p.name} ${p.context}`.toLowerCase().includes(term))
      .sort((a, b) => order(a.role) - order(b.role) || a.name.localeCompare(b.name));
  }

  /** Get or create a one-to-one thread. */
  async getOrCreateThread(me: UserProfile, otherId: string) {
    if (!otherId) throw new BadRequestException('recipientId is required');
    if (me.id === otherId) throw new ForbiddenException('Cannot message yourself');
    const other = await this.prisma.userProfile.findUnique({ where: { id: otherId }, select: { id: true } });
    if (!other) throw new NotFoundException('Person not found');
    // Older threads weren't always stored in sorted order, so look both ways before creating one
    const existing = await this.prisma.messageThread.findFirst({
      where: { OR: [{ participantAId: me.id, participantBId: otherId }, { participantAId: otherId, participantBId: me.id }] },
      select: { id: true }, orderBy: { lastMessageAt: 'desc' },
    });
    if (existing) return { threadId: existing.id };
    // A new conversation only with someone they're allowed to reach (admins can reach anyone)
    if (me.role !== 'ADMIN' && !(await this.contacts(me)).some(c => c.id === otherId)) {
      throw new ForbiddenException('You can’t start a conversation with this person');
    }
    const [a, b] = [me.id, otherId].sort();
    const thread = await this.prisma.messageThread.upsert({
      where: { participantAId_participantBId: { participantAId: a, participantBId: b } },
      create: { participantAId: a, participantBId: b },
      update: {},
      select: { id: true },
    });
    return { threadId: thread.id };
  }

  // ── Reading ──────────────────────────────────────────────

  private fullSelect(viewerId: string) {
    return {
      ...msgSelect, replyToId: true, mentions: true, mentionsAll: true, editedAt: true, deletedAt: true,
      sender: { select: { id: true, name: true, firstName: true, lastName: true, email: true, avatarUrl: true, role: true } },
      replyTo: { select: { id: true, body: true, deletedAt: true, attachmentType: true, attachmentName: true, attachmentDuration: true, sender: { select: { name: true, firstName: true, lastName: true, email: true, role: true } } } },
      reactions: { select: { emoji: true, userId: true } },
      stars: { where: { userId: viewerId }, select: { userId: true } },
      call: { select: { id: true, kind: true, status: true, startedById: true, participants: { where: { joinedAt: { not: null }, leftAt: null }, select: { userId: true } } } },
    } as const;
  }

  /** Messages as a person sees them: a deleted one shows only that it was deleted (its content stays stored, for the record) */
  private async present(thread: { cohortId: string | null; isGroup: boolean }, rows: any[], viewerId: string) {
    const linked = await this.withLinks(rows.map(r => (r.deletedAt ? { ...r, attachmentKey: null } : r)));
    const label = (s: { role: string } & Parameters<typeof nameOf>[0]) => (s.role === 'ADMIN' && !isGroupThread(thread) ? 'CareerPath support' : nameOf(s));
    return linked.map(({ sender, replyTo, reactions, stars, call, ...m }: any) => {
      const gone = !!m.deletedAt;
      const counts = new Map<string, { emoji: string; count: number; mine: boolean }>();
      for (const r of reactions ?? []) { const c = counts.get(r.emoji) ?? { emoji: r.emoji, count: 0, mine: false }; c.count++; if (r.userId === viewerId) c.mine = true; counts.set(r.emoji, c); }
      return {
        ...m,
        body: gone ? '' : m.body,
        ...(gone && { attachmentName: null, attachmentType: null, attachmentSize: null, attachmentDuration: null, attachmentWave: null, attachmentUrl: null, mentions: [], mentionsAll: false }),
        deleted: gone, deletedAt: undefined,
        isOwn: m.senderId === viewerId, senderName: label(sender), senderRole: sender.role, senderAvatarUrl: sender.avatarUrl ?? null,
        replyTo: replyTo ? { id: replyTo.id, senderName: label(replyTo.sender), body: replyTo.deletedAt ? '' : replyTo.body, deleted: !!replyTo.deletedAt, attachmentType: replyTo.deletedAt ? null : replyTo.attachmentType, attachmentName: replyTo.deletedAt ? null : replyTo.attachmentName, attachmentDuration: replyTo.attachmentDuration } : null,
        reactions: [...counts.values()].sort((a, b) => b.count - a.count),
        starred: !!stars?.length,
        call: call ? { id: call.id, kind: call.kind, status: call.status, startedByMe: call.startedById === viewerId, inCall: call.participants.length, joined: call.participants.some((p: { userId: string }) => p.userId === viewerId) } : null,
      };
    });
  }

  /** Some messages of a chat as one person sees them (for live updates) */
  async shape(threadId: string, ids: string[], viewer: Pick<UserProfile, 'id'>) {
    const thread = await this.prisma.messageThread.findUnique({ where: { id: threadId }, select: { cohortId: true, isGroup: true } });
    if (!thread) return [];
    const rows = await this.prisma.message.findMany({ where: { id: { in: ids }, threadId }, select: this.fullSelect(viewer.id) });
    return this.present(thread, rows, viewer.id);
  }

  /** Messages, newest first, 40 at a time (or the ones around a message, to jump to it); marks them read and tells the sender. */
  async getMessages(threadId: string, me: UserProfile, cursor?: string, around?: string) {
    const { thread, members } = await this.threadFor(me, threadId);
    let rows: any[];
    const anchor = around ? await this.prisma.message.findFirst({ where: { id: around, threadId }, select: { createdAt: true } }) : null;
    if (anchor) {
      const [before, after] = await Promise.all([
        this.prisma.message.findMany({ where: { threadId, createdAt: { lte: anchor.createdAt } }, orderBy: { createdAt: 'desc' }, take: 25, select: this.fullSelect(me.id) }),
        this.prisma.message.findMany({ where: { threadId, createdAt: { gt: anchor.createdAt } }, orderBy: { createdAt: 'asc' }, take: 25, select: this.fullSelect(me.id) }),
      ]);
      rows = [...after.reverse(), ...before];
    } else {
      rows = await this.prisma.message.findMany({
        where: { threadId, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
        orderBy: { createdAt: 'desc' }, take: 40, select: this.fullSelect(me.id),
      });
    }
    await this.markRead(thread, members, me.id);
    return this.present(thread, rows, me.id);
  }

  private async markRead(thread: { id: string; cohortId: string | null; isGroup: boolean }, members: string[], readerId: string) {
    if (isGroupThread(thread)) {
      if (!members.includes(readerId)) return;
      await this.prisma.threadRead.upsert({ where: { threadId_userId: { threadId: thread.id, userId: readerId } }, update: { lastReadAt: new Date() }, create: { threadId: thread.id, userId: readerId } });
      return;
    }
    const { count } = await this.prisma.message.updateMany({ where: { threadId: thread.id, senderId: { not: readerId }, readAt: null }, data: { readAt: new Date() } });
    if (count) this.gateway.emitTo(members.filter(m => m !== readerId), 'thread:read', { threadId: thread.id, readerId });
  }

  async markThreadRead(threadId: string, me: UserProfile) {
    const { thread, members } = await this.threadFor(me, threadId);
    await this.markRead(thread, members, me.id);
    return { ok: true };
  }

  async attachmentLink(messageId: string, me: UserProfile) {
    const msg = await this.prisma.message.findUnique({ where: { id: messageId }, select: { threadId: true, attachmentKey: true } });
    if (!msg?.attachmentKey) throw new NotFoundException('No attachment');
    await this.threadFor(me, msg.threadId);
    return { url: await this.files.presignedDownload(msg.attachmentKey, LINK_SECS) };
  }

  // ── Sending ──────────────────────────────────────────────

  /** Send text and/or one attachment. Members get it instantly; those not online get a notification and, if they want, an email. */
  async sendMessage(threadId: string, sender: UserProfile, input: { body?: string; attachment?: AttachmentInput | null; replyToId?: string | null; mentions?: string[]; mentionAll?: boolean }) {
    const text = String(input.body ?? '').trim();
    const att = input.attachment ?? null;
    if (!text && !att) throw new BadRequestException('Write a message or add a file');
    if (text.length > 4000) throw new BadRequestException('Messages can be up to 4000 characters');
    let voice: { duration: number; wave: string | null } | null = null;
    if (att) {
      if (typeof att.key !== 'string' || !/^messages\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/i.test(att.key)) throw new BadRequestException('Upload the file first');
      att.type = String(att.type ?? '').split(';')[0].trim().toLowerCase(); // "audio/webm;codecs=opus" → "audio/webm"
      if (VOICE_TYPES.test(att.type)) {
        const duration = Math.round(Number(att.duration));
        if (!Number.isFinite(duration) || duration < 1) throw new BadRequestException('That voice note is too short');
        if (duration > VOICE_MAX_SECS) throw new BadRequestException('Voice notes can be up to 5 minutes');
        voice = { duration, wave: typeof att.wave === 'string' && /^[0-9]{10,64}$/.test(att.wave) ? att.wave : null };
      } else if (!ATTACHMENT_TYPES.test(att.type)) throw new BadRequestException('Send photos (JPG, PNG, WebP), PDFs, Word documents or voice notes');
    }
    const { thread, members } = await this.threadFor(sender, threadId);
    if (!members.includes(sender.id)) throw new ForbiddenException('Only members can write here');
    const groupAdmin = isGroupThread(thread) && (await this.isGroupAdmin(thread, sender));
    if (isGroupThread(thread) && thread.onlyAdminsSend && !groupAdmin) throw new ForbiddenException('Only group admins can send messages here');
    const replyTo = input.replyToId ? await this.prisma.message.findFirst({ where: { id: input.replyToId, threadId, kind: 'TEXT' }, select: { id: true } }) : null;
    if (input.replyToId && !replyTo) throw new BadRequestException('The message you’re replying to isn’t in this chat');
    // Tags: only people in the chat; @everyone only from group admins
    const mentions = isGroupThread(thread) ? [...new Set((Array.isArray(input.mentions) ? input.mentions : []).map(String))].filter(id => id !== sender.id && members.includes(id)) : [];
    const mentionsAll = isGroupThread(thread) && !!input.mentionAll && groupAdmin;

    const [created] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { threadId, senderId: sender.id, body: text, replyToId: replyTo?.id ?? null, mentions, mentionsAll, ...(att && { attachmentKey: att.key, attachmentName: String(att.name ?? 'file').slice(0, 200), attachmentType: att.type, attachmentSize: Math.max(0, Math.round(Number(att.size) || 0)), ...(voice && { attachmentDuration: voice.duration, attachmentWave: voice.wave }) }) },
        select: { id: true, createdAt: true },
      }),
      this.prisma.messageThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } }),
    ]);
    if (isGroupThread(thread)) await this.prisma.threadRead.upsert({ where: { threadId_userId: { threadId, userId: sender.id } }, update: { lastReadAt: new Date() }, create: { threadId, userId: sender.id } });

    const senderName = nameOf(sender);
    const [mine] = await this.shape(threadId, [created.id], sender);
    const [theirs] = await this.shape(threadId, [created.id], { id: '' });
    const others = members.filter(m => m !== sender.id);
    // Everyone in the conversation (and the sender's other tabs) sees it now
    this.gateway.emitTo(others, 'message:new', { threadId, message: { ...theirs, isOwn: false } });
    this.gateway.emitTo([sender.id], 'message:new', { threadId, message: mine });
    // Tagged people hear about it even if they muted the group
    const tagged = mentionsAll ? others : mentions;
    if (tagged.length) {
      const where = thread.name ?? (thread.cohortId ? (await this.prisma.cohort.findUnique({ where: { id: thread.cohortId }, select: { name: true } }))?.name : null) ?? 'a group';
      const people = await this.prisma.userProfile.findMany({ where: { id: { in: tagged } }, select: { id: true, role: true } });
      const home: Record<string, string> = { TEACHER: '/teacher', ADMIN: '/admin', COUNTRY_REP: '/country-rep', SUBJECT_REVIEWER: '/reviewer' };
      for (const p of people) this.notifications.notify(p.id, { type: 'message', title: `${senderName} mentioned ${mentionsAll ? 'everyone' : 'you'} in ${where}`, body: (text || 'an attachment').slice(0, 140), href: `${home[p.role] ?? '/student'}/messages?thread=${threadId}&message=${created.id}` });
    }

    this.alertOffline(thread, others, sender, senderName, text || attachmentPreview({ attachmentType: att?.type, attachmentName: att?.name, attachmentDuration: voice?.duration }), created.createdAt, !text && !!voice)
      .catch(err => this.logger.warn(`Message alerts failed: ${err.message}`));
    return mine;
  }

  /** In-app notification and email, once per conversation until it's read, and email only if they aren't online */
  private async alertOffline(thread: { id: string; cohortId: string | null; isGroup: boolean; name: string | null }, recipients: string[], sender: UserProfile, senderName: string, preview: string, sentAt: Date, isVoice = false) {
    if (!recipients.length) return;
    const group = isGroupThread(thread);
    const cohort = thread.cohortId ? await this.prisma.cohort.findUnique({ where: { id: thread.cohortId }, select: { name: true } }) : null;
    const groupName = group ? thread.name ?? cohort?.name ?? 'your group' : null;
    // People who muted the group get no alert
    const muted = group ? new Set((await this.prisma.threadMember.findMany({ where: { threadId: thread.id, muted: true }, select: { userId: true } })).map(m => m.userId)) : new Set<string>();
    const people = await this.prisma.userProfile.findMany({ where: { id: { in: recipients.filter(r => !muted.has(r)) } }, select: { id: true, email: true, role: true } });
    const reads = group ? await this.prisma.threadRead.findMany({ where: { threadId: thread.id, userId: { in: recipients } } }) : [];
    for (const p of people) {
      // Only the first unread message in a conversation alerts; the rest wait until they've read it
      const since = group ? reads.find(r => r.userId === p.id)?.lastReadAt : undefined;
      const earlierUnread = await this.prisma.message.count({
        where: { threadId: thread.id, senderId: { not: p.id }, kind: 'TEXT', createdAt: { lt: sentAt }, ...(group ? (since ? { createdAt: { lt: sentAt, gt: since } } : {}) : { readAt: null }) },
      });
      if (earlierUnread > 0) continue;
      const home = p.role === 'TEACHER' ? '/teacher' : p.role === 'ADMIN' ? '/admin' : p.role === 'COUNTRY_REP' ? '/country-rep' : p.role === 'SUBJECT_REVIEWER' ? '/reviewer' : '/student';
      const href = `${home}/messages?thread=${thread.id}`;
      this.notifications.notify(p.id, {
        type: 'message', title: groupName ? `${senderName} in ${groupName}` : isVoice ? `${senderName} sent you a voice note` : `New message from ${senderName}`, body: preview.slice(0, 140), href,
      });
      if (!this.gateway.isOnline(p.id) && await this.notifications.wantsEmail(p.id, 'message')) {
        const base = process.env.PORTAL_URL || 'http://localhost:3000';
        await this.mail.sendNewMessage(p.email, senderName, preview.slice(0, 600), groupName, `${base}${href}`, isVoice);
      }
    }
  }

  /** Unread messages across all conversations. */
  async unreadCount(me: UserProfile): Promise<{ count: number }> {
    const threads = await this.listThreads(me);
    return { count: threads.reduce((n, t) => n + t.unread, 0) };
  }
}
