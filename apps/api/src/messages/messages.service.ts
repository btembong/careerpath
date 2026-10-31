import { BadRequestException, Injectable, NotFoundException, ForbiddenException, Logger } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MailService } from '../mail/mail.service';
import { FilesService } from '../files/files.service';
import { studentCourseIds } from '../prisma/student-courses';
import { MessagesGateway } from './messages.gateway';

type Person = { id: string; name: string | null; firstName: string | null; lastName: string | null; email: string; avatarUrl: string | null; role: string; lastActiveDate?: Date | null };
const nameOf = (p: Pick<Person, 'name' | 'firstName' | 'lastName' | 'email'>) => p.name || [p.firstName, p.lastName].filter(Boolean).join(' ') || p.email.split('@')[0];
const personSelect = { id: true, name: true, firstName: true, lastName: true, email: true, avatarUrl: true, role: true, lastActiveDate: true } as const;
const msgSelect = { id: true, body: true, senderId: true, createdAt: true, readAt: true, attachmentKey: true, attachmentName: true, attachmentType: true, attachmentSize: true } as const;
const ATTACHMENT_TYPES = /^(application\/pdf|image\/(jpeg|png|webp)|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;
/** Signed links to attachments last this long; the page asks again when it reloads the conversation */
const LINK_SECS = 60 * 60;

export interface AttachmentInput { key: string; name: string; type: string; size: number }

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

  /** Everyone in a conversation (two people, or a cohort's teacher and students) */
  async members(thread: { participantAId: string | null; participantBId: string | null; cohortId: string | null }) {
    if (thread.cohortId) return this.cohortMembers(thread.cohortId);
    return [thread.participantAId, thread.participantBId].filter((x): x is string => !!x);
  }

  private async threadFor(me: UserProfile, threadId: string) {
    const thread = await this.prisma.messageThread.findUnique({ where: { id: threadId } });
    if (!thread) throw new NotFoundException('Conversation not found');
    const members = await this.members(thread);
    // Admins can read cohort groups (moderation); one-to-one conversations stay private
    if (!members.includes(me.id) && !(thread.cohortId && me.role === 'ADMIN')) throw new ForbiddenException('Not part of this conversation');
    return { thread, members };
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

  private async withLinks<T extends { attachmentKey: string | null }>(rows: T[]) {
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
      where: { OR: [{ participantAId: me.id }, { participantBId: me.id }, { cohortId: { in: cohorts.map(c => c.id) } }] },
      include: {
        participantA: { select: personSelect },
        participantB: { select: personSelect },
        cohort: { select: { id: true, name: true, _count: { select: { students: true } } } },
        reads: { where: { userId: me.id }, select: { lastReadAt: true } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { body: true, createdAt: true, senderId: true, readAt: true, attachmentName: true, attachmentType: true, sender: { select: { name: true, firstName: true, lastName: true, email: true } } } },
      },
      orderBy: { lastMessageAt: 'desc' },
    });

    // Unread: one-to-one by readAt; groups by my read marker
    const dmIds = threads.filter(t => !t.cohortId).map(t => t.id);
    const dmUnread = dmIds.length ? await this.prisma.message.groupBy({ by: ['threadId'], where: { threadId: { in: dmIds }, senderId: { not: me.id }, readAt: null }, _count: { _all: true } }) : [];
    const unread = new Map(dmUnread.map(u => [u.threadId, u._count._all]));
    for (const t of threads.filter(x => x.cohortId)) {
      const since = t.reads[0]?.lastReadAt;
      unread.set(t.id, await this.prisma.message.count({ where: { threadId: t.id, senderId: { not: me.id }, ...(since && { createdAt: { gt: since } }) } }));
    }

    const others = threads.filter(t => !t.cohortId).map(t => (t.participantAId === me.id ? t.participantB : t.participantA)).filter((p): p is NonNullable<typeof p> => !!p);
    const ctx = await this.contextFor(me, others);
    const term = q?.trim().toLowerCase();

    return threads
      // Group chats with no messages yet still show; empty one-to-one threads only for the person who opened them
      .map(t => {
        const last = t.messages[0] ?? null;
        const preview = last ? (last.body || (last.attachmentType?.startsWith('image/') ? '📷 Photo' : `📎 ${last.attachmentName ?? 'File'}`)) : null;
        if (t.cohortId && t.cohort) {
          return {
            id: t.id, kind: 'group' as const,
            other: { id: t.cohort.id, name: t.cohort.name, avatarUrl: null, role: 'GROUP', context: `Cohort group · ${t.cohort._count.students + 1} members`, online: false, lastSeen: null },
            lastMessage: last ? { body: preview!, createdAt: last.createdAt, isOwn: last.senderId === me.id, sender: last.senderId === me.id ? 'You' : nameOf(last.sender).split(' ')[0], readAt: null } : null,
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

  /** Messages, newest first, 40 at a time; marks them read and tells the sender. */
  async getMessages(threadId: string, me: UserProfile, cursor?: string) {
    const { thread, members } = await this.threadFor(me, threadId);
    const rows = await this.prisma.message.findMany({
      where: { threadId, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 40,
      select: { ...msgSelect, sender: { select: { id: true, name: true, firstName: true, lastName: true, email: true, avatarUrl: true, role: true } } },
    });
    await this.markRead(thread, members, me.id);
    const linked = await this.withLinks(rows);
    return linked.map(({ sender, ...m }) => ({ ...m, isOwn: m.senderId === me.id, senderName: sender.role === 'ADMIN' && !thread.cohortId ? 'CareerPath support' : nameOf(sender), senderRole: sender.role }));
  }

  private async markRead(thread: { id: string; cohortId: string | null }, members: string[], readerId: string) {
    if (thread.cohortId) {
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
  async sendMessage(threadId: string, sender: UserProfile, input: { body?: string; attachment?: AttachmentInput | null }) {
    const text = String(input.body ?? '').trim();
    const att = input.attachment ?? null;
    if (!text && !att) throw new BadRequestException('Write a message or add a file');
    if (text.length > 4000) throw new BadRequestException('Messages can be up to 4000 characters');
    if (att) {
      if (typeof att.key !== 'string' || !/^messages\/[0-9a-f-]{36}\.[a-z0-9]{1,5}$/i.test(att.key)) throw new BadRequestException('Upload the file first');
      if (!ATTACHMENT_TYPES.test(att.type ?? '')) throw new BadRequestException('Send photos (JPG, PNG, WebP), PDFs or Word documents');
    }
    const { thread, members } = await this.threadFor(sender, threadId);
    if (!members.includes(sender.id)) throw new ForbiddenException('Only members can write here');

    const [created] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { threadId, senderId: sender.id, body: text, ...(att && { attachmentKey: att.key, attachmentName: String(att.name ?? 'file').slice(0, 200), attachmentType: att.type, attachmentSize: Math.max(0, Math.round(Number(att.size) || 0)) }) },
        select: msgSelect,
      }),
      this.prisma.messageThread.update({ where: { id: threadId }, data: { lastMessageAt: new Date() } }),
    ]);
    if (thread.cohortId) await this.prisma.threadRead.upsert({ where: { threadId_userId: { threadId, userId: sender.id } }, update: { lastReadAt: new Date() }, create: { threadId, userId: sender.id } });

    const [linked] = await this.withLinks([created]);
    const senderName = nameOf(sender);
    const message = { ...linked, senderName, senderRole: sender.role };
    const others = members.filter(m => m !== sender.id);
    // Everyone in the conversation (and the sender's other tabs) sees it now
    this.gateway.emitTo(others, 'message:new', { threadId, message: { ...message, isOwn: false } });
    this.gateway.emitTo([sender.id], 'message:new', { threadId, message: { ...message, isOwn: true } });

    this.alertOffline(thread, others, sender, senderName, text || (att?.type.startsWith('image/') ? '📷 Photo' : `📎 ${att?.name ?? 'File'}`), created.createdAt)
      .catch(err => this.logger.warn(`Message alerts failed: ${err.message}`));
    return { ...message, isOwn: true };
  }

  /** In-app notification and email, once per conversation until it's read, and email only if they aren't online */
  private async alertOffline(thread: { id: string; cohortId: string | null }, recipients: string[], sender: UserProfile, senderName: string, preview: string, sentAt: Date) {
    if (!recipients.length) return;
    const cohort = thread.cohortId ? await this.prisma.cohort.findUnique({ where: { id: thread.cohortId }, select: { name: true } }) : null;
    const people = await this.prisma.userProfile.findMany({ where: { id: { in: recipients } }, select: { id: true, email: true, role: true } });
    const reads = thread.cohortId ? await this.prisma.threadRead.findMany({ where: { threadId: thread.id, userId: { in: recipients } } }) : [];
    for (const p of people) {
      // Only the first unread message in a conversation alerts; the rest wait until they've read it
      const since = thread.cohortId ? reads.find(r => r.userId === p.id)?.lastReadAt : undefined;
      const earlierUnread = await this.prisma.message.count({
        where: { threadId: thread.id, senderId: { not: p.id }, createdAt: { lt: sentAt }, ...(thread.cohortId ? (since ? { createdAt: { lt: sentAt, gt: since } } : {}) : { readAt: null }) },
      });
      if (earlierUnread > 0) continue;
      const home = p.role === 'TEACHER' ? '/teacher' : p.role === 'ADMIN' ? '/admin' : p.role === 'COUNTRY_REP' ? '/country-rep' : p.role === 'SUBJECT_REVIEWER' ? '/reviewer' : '/student';
      const href = `${home}/messages?thread=${thread.id}`;
      this.notifications.notify(p.id, {
        type: 'message', title: cohort ? `${senderName} in ${cohort.name}` : `New message from ${senderName}`, body: preview.slice(0, 140), href,
      });
      if (!this.gateway.isOnline(p.id) && await this.notifications.wantsEmail(p.id, 'message')) {
        const base = process.env.PORTAL_URL || 'http://localhost:3000';
        await this.mail.sendNewMessage(p.email, senderName, preview.slice(0, 600), cohort?.name ?? null, `${base}${href}`);
      }
    }
  }

  /** Unread messages across all conversations. */
  async unreadCount(me: UserProfile): Promise<{ count: number }> {
    const threads = await this.listThreads(me);
    return { count: threads.reduce((n, t) => n + t.unread, 0) };
  }
}
