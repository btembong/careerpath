import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserProfile } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MessagesService, isGroupThread, nameOf, personSelect } from './messages.service';
import { MessagesGateway } from './messages.gateway';

const MAX_MEMBERS = 256;
/** "Ama", "Ama and Kofi", "Ama, Kofi and 3 others" */
function people(names: string[]) {
  if (names.length <= 2) return names.join(' and ');
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} other${names.length === 3 ? '' : 's'}`;
}

/**
 * Groups in Messages: teachers and admins make them; group admins add and remove people, make other admins and
 * change the settings. Cohort groups take their members from the cohort, so people are added there, not here.
 */
@Injectable()
export class GroupsService {
  constructor(
    private prisma: PrismaService,
    private messages: MessagesService,
    private notifications: NotificationsService,
    private gateway: MessagesGateway,
  ) {}

  private async groupFor(me: UserProfile, threadId: string) {
    const { thread, members } = await this.messages.threadFor(me, threadId);
    if (!isGroupThread(thread)) throw new BadRequestException('This is a one-to-one chat, not a group');
    const admin = await this.messages.isGroupAdmin(thread, me);
    return { thread, members, admin, member: members.includes(me.id) };
  }

  /** Who this person may put in a group: anyone for admins; for others, the people they can already message */
  private async allowed(me: UserProfile, ids: string[]) {
    if (me.role === 'ADMIN') return (await this.prisma.userProfile.findMany({ where: { id: { in: ids }, deletedAt: null }, select: { id: true } })).map(p => p.id);
    const reach = new Set((await this.messages.contacts(me)).map(c => c.id));
    return ids.filter(id => reach.has(id));
  }

  /** Tell people they were added, with a link into their own area's Messages */
  private async tellAdded(ids: string[], title: string, body: string, threadId: string) {
    const rows = await this.prisma.userProfile.findMany({ where: { id: { in: ids } }, select: { id: true, role: true } });
    const home: Record<string, string> = { TEACHER: '/teacher', ADMIN: '/admin', COUNTRY_REP: '/country-rep', SUBJECT_REVIEWER: '/reviewer' };
    for (const r of rows) this.notifications.notify(r.id, { type: 'message', title, body, href: `${home[r.role] ?? '/student'}/messages?thread=${threadId}` });
  }

  private async names(ids: string[]) {
    const rows = await this.prisma.userProfile.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, firstName: true, lastName: true, email: true } });
    return ids.map(id => rows.find(r => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r).map(r => nameOf(r));
  }

  // ── Making a group ───────────────────────────────────────

  async create(me: UserProfile, dto: { name?: string; description?: string; memberIds?: string[]; cohortId?: string }) {
    if (me.role !== 'TEACHER' && me.role !== 'ADMIN') throw new ForbiddenException('Only teachers and admins can make groups');
    const name = String(dto.name ?? '').trim();
    if (name.length < 2 || name.length > 80) throw new BadRequestException('Give the group a name (2 to 80 characters)');
    const description = String(dto.description ?? '').trim().slice(0, 500) || null;
    let ids = [...new Set((Array.isArray(dto.memberIds) ? dto.memberIds : []).map(String))];
    if (dto.cohortId) {
      // Start from a whole cohort: its students (teachers only from their own cohorts)
      const cohort = await this.prisma.cohort.findUnique({ where: { id: dto.cohortId }, select: { teacherId: true, students: { select: { studentId: true } } } });
      if (!cohort || (me.role !== 'ADMIN' && cohort.teacherId !== me.id)) throw new ForbiddenException('Choose one of your own cohorts');
      ids = [...new Set([...ids, ...cohort.students.map(s => s.studentId), ...(cohort.teacherId !== me.id ? [cohort.teacherId] : [])])];
    }
    ids = ids.filter(id => id !== me.id);
    const ok = await this.allowed(me, ids);
    if (!ok.length) throw new BadRequestException('Add at least one person');
    if (ok.length + 1 > MAX_MEMBERS) throw new BadRequestException(`Groups can have up to ${MAX_MEMBERS} people`);

    const thread = await this.prisma.messageThread.create({
      data: {
        isGroup: true, name, description, createdById: me.id,
        groupMembers: { create: [{ userId: me.id, role: 'ADMIN', addedById: me.id }, ...ok.map(userId => ({ userId, addedById: me.id }))] },
      },
    });
    const who = nameOf(me);
    await this.messages.postSystem(thread, me.id, `${who} created the group “${name}”`);
    await this.messages.postSystem(thread, me.id, `${who} added ${people(await this.names(ok))}`);
    await this.tellAdded(ok, `${nameOf(me)} added you to ${name}`, description ?? 'A new group in Messages', thread.id);
    return { threadId: thread.id, added: ok.length, skipped: ids.length - ok.length };
  }

  // ── Group info ───────────────────────────────────────────

  async info(me: UserProfile, threadId: string) {
    const { thread, members, admin } = await this.groupFor(me, threadId);
    const cohort = thread.cohortId ? await this.prisma.cohort.findUnique({ where: { id: thread.cohortId }, select: { name: true, teacherId: true } }) : null;
    const rows = await this.prisma.threadMember.findMany({ where: { threadId, leftAt: null }, select: { userId: true, role: true, muted: true, joinedAt: true } });
    const persons = await this.prisma.userProfile.findMany({ where: { id: { in: members } }, select: personSelect });
    const isAdmin = (id: string) => id === cohort?.teacherId || rows.some(r => r.userId === id && r.role === 'ADMIN');
    const list = persons.map(p => ({
      id: p.id, name: nameOf(p), avatarUrl: p.avatarUrl, role: p.role,
      groupRole: isAdmin(p.id) ? 'ADMIN' : 'MEMBER', isCohortTeacher: p.id === cohort?.teacherId,
      online: this.gateway.isOnline(p.id), lastSeen: p.lastActiveDate ?? null, isMe: p.id === me.id,
    })).sort((a, b) => (+(b.groupRole === 'ADMIN') - +(a.groupRole === 'ADMIN')) || (+b.isMe - +a.isMe) || a.name.localeCompare(b.name));
    const pinned = thread.pinnedMessageId ? await this.prisma.message.findFirst({ where: { id: thread.pinnedMessageId, threadId }, select: { id: true, body: true, attachmentName: true, attachmentType: true, attachmentDuration: true, sender: { select: personSelect } } }) : null;
    const creator = thread.createdById ? await this.prisma.userProfile.findUnique({ where: { id: thread.createdById }, select: personSelect }) : null;
    const counts = await this.prisma.message.groupBy({ by: ['attachmentType'], where: { threadId, kind: 'TEXT', attachmentType: { not: null } }, _count: { _all: true } });
    const count = (pre: string) => counts.filter(c => c.attachmentType?.startsWith(pre)).reduce((n, c) => n + c._count._all, 0);
    return {
      id: thread.id, kind: thread.cohortId ? 'cohort' : 'group',
      name: thread.name ?? cohort?.name ?? 'Group', description: thread.description, photoUrl: thread.photoUrl,
      createdBy: creator ? nameOf(creator) : null, createdAt: thread.createdAt,
      settings: { onlyAdminsSend: thread.onlyAdminsSend, onlyAdminsEdit: thread.onlyAdminsEdit, membersCanAdd: thread.membersCanAdd },
      pinned: pinned ? { id: pinned.id, text: pinned.body || (pinned.attachmentName ?? 'Attachment'), by: nameOf(pinned.sender) } : null,
      members: list, me: { admin, muted: rows.find(r => r.userId === me.id)?.muted ?? false, member: members.includes(me.id) },
      can: {
        edit: admin || (!thread.onlyAdminsEdit && members.includes(me.id)),
        add: !thread.cohortId && (admin || (thread.membersCanAdd && members.includes(me.id))),
        manage: admin, leave: !thread.cohortId && members.includes(me.id),
      },
      media: { photos: count('image/'), voice: count('audio/'), files: count('application/') },
    };
  }

  async update(me: UserProfile, threadId: string, dto: { name?: string; description?: string | null; photoUrl?: string | null; onlyAdminsSend?: boolean; onlyAdminsEdit?: boolean; membersCanAdd?: boolean; pinnedMessageId?: string | null }) {
    const { thread, members, admin } = await this.groupFor(me, threadId);
    const who = nameOf(me);
    const data: Record<string, unknown> = {};
    const notes: string[] = [];
    const editsInfo = dto.name !== undefined || dto.description !== undefined || dto.photoUrl !== undefined;
    if (editsInfo && !(admin || (!thread.onlyAdminsEdit && members.includes(me.id)))) throw new ForbiddenException('Only group admins can change the group’s name, photo and description');
    if (dto.name !== undefined) {
      const name = String(dto.name ?? '').trim();
      if (name.length < 2 || name.length > 80) throw new BadRequestException('Give the group a name (2 to 80 characters)');
      data.name = name; notes.push(`${who} renamed the group “${name}”`);
    }
    if (dto.description !== undefined) { data.description = String(dto.description ?? '').trim().slice(0, 500) || null; notes.push(`${who} changed the group description`); }
    if (dto.photoUrl !== undefined) {
      const url = dto.photoUrl ? String(dto.photoUrl) : null;
      if (url && !/^https:\/\//.test(url)) throw new BadRequestException('Upload the photo first');
      data.photoUrl = url; notes.push(url ? `${who} changed the group photo` : `${who} removed the group photo`);
    }
    const settings = (['onlyAdminsSend', 'onlyAdminsEdit', 'membersCanAdd'] as const).filter(k => dto[k] !== undefined);
    if ((settings.length || dto.pinnedMessageId !== undefined) && !admin) throw new ForbiddenException('Only group admins can change the group settings');
    for (const k of settings) {
      if (k === 'membersCanAdd' && thread.cohortId) continue; // cohort members come from the cohort
      data[k] = !!dto[k];
      if (k === 'onlyAdminsSend' && !!dto[k] !== thread.onlyAdminsSend) notes.push(dto[k] ? `${who} changed the group so only admins can send messages` : `${who} changed the group so everyone can send messages`);
    }
    if (dto.pinnedMessageId !== undefined) {
      if (dto.pinnedMessageId) {
        const m = await this.prisma.message.findFirst({ where: { id: dto.pinnedMessageId, threadId, kind: 'TEXT' }, select: { id: true } });
        if (!m) throw new NotFoundException('Message not found in this group');
        data.pinnedMessageId = m.id; notes.push(`${who} pinned a message`);
      } else { data.pinnedMessageId = null; notes.push(`${who} unpinned the message`); }
    }
    if (!Object.keys(data).length) return this.info(me, threadId);
    await this.prisma.messageThread.update({ where: { id: threadId }, data });
    for (const n of notes) await this.messages.postSystem(thread, me.id, n);
    this.gateway.emitTo(members, 'thread:updated', { threadId });
    return this.info(me, threadId);
  }

  // ── Members ──────────────────────────────────────────────

  /** People who could be added: those you can message, not already in the group */
  async candidates(me: UserProfile, threadId: string, q?: string) {
    const { thread, members, admin } = await this.groupFor(me, threadId);
    if (thread.cohortId) return [];
    if (!admin && !(thread.membersCanAdd && members.includes(me.id))) throw new ForbiddenException('Only group admins can add people');
    return (await this.messages.contacts(me, q)).filter(c => !members.includes(c.id)).slice(0, 60);
  }

  async add(me: UserProfile, threadId: string, userIds: string[]) {
    const { thread, members, admin } = await this.groupFor(me, threadId);
    if (thread.cohortId) throw new BadRequestException('People in a cohort group come from the cohort. Add them to the cohort instead.');
    if (!admin && !(thread.membersCanAdd && members.includes(me.id))) throw new ForbiddenException('Only group admins can add people');
    const wanted = [...new Set((Array.isArray(userIds) ? userIds : []).map(String))].filter(id => !members.includes(id));
    const ok = await this.allowed(me, wanted);
    if (!ok.length) throw new BadRequestException('Choose at least one person who isn’t in the group yet');
    if (members.length + ok.length > MAX_MEMBERS) throw new BadRequestException(`Groups can have up to ${MAX_MEMBERS} people`);
    for (const userId of ok) {
      await this.prisma.threadMember.upsert({
        where: { threadId_userId: { threadId, userId } },
        update: { leftAt: null, role: 'MEMBER', addedById: me.id, joinedAt: new Date(), muted: false },
        create: { threadId, userId, addedById: me.id },
      });
    }
    await this.messages.postSystem(thread, me.id, `${nameOf(me)} added ${people(await this.names(ok))}`);
    await this.tellAdded(ok, `${nameOf(me)} added you to ${thread.name ?? 'a group'}`, thread.description ?? 'A group in Messages', threadId);
    return { added: ok.length };
  }

  async remove(me: UserProfile, threadId: string, userId: string) {
    const { thread, members, admin } = await this.groupFor(me, threadId);
    if (thread.cohortId) throw new BadRequestException('People in a cohort group come from the cohort. Take them out of the cohort instead.');
    if (!admin) throw new ForbiddenException('Only group admins can remove people');
    if (userId === me.id) throw new BadRequestException('To leave, use Leave group');
    if (!members.includes(userId)) throw new NotFoundException('They aren’t in this group');
    await this.prisma.threadMember.update({ where: { threadId_userId: { threadId, userId } }, data: { leftAt: new Date(), role: 'MEMBER' } });
    const [n] = await this.names([userId]);
    await this.messages.postSystem(thread, me.id, `${nameOf(me)} removed ${(n ?? 'someone')}`);
    this.gateway.emitTo([userId], 'thread:updated', { threadId, removed: true });
    return { removed: true };
  }

  async leave(me: UserProfile, threadId: string) {
    const { thread, members } = await this.groupFor(me, threadId);
    if (thread.cohortId) throw new BadRequestException('You’re in this group while you’re in the cohort. Mute it if you’d rather not be notified.');
    if (!members.includes(me.id)) throw new BadRequestException('You aren’t in this group');
    await this.prisma.threadMember.update({ where: { threadId_userId: { threadId, userId: me.id } }, data: { leftAt: new Date(), role: 'MEMBER' } });
    // Never leave a group without an admin: the longest-standing member takes over
    const admins = await this.prisma.threadMember.count({ where: { threadId, leftAt: null, role: 'ADMIN' } });
    if (!admins) {
      const next = await this.prisma.threadMember.findFirst({ where: { threadId, leftAt: null }, orderBy: { joinedAt: 'asc' } });
      if (next) await this.prisma.threadMember.update({ where: { id: next.id }, data: { role: 'ADMIN' } });
    }
    await this.messages.postSystem(thread, me.id, `${nameOf(me)} left`);
    return { left: true };
  }

  async setRole(me: UserProfile, threadId: string, userId: string, role: string) {
    const { thread, members, admin } = await this.groupFor(me, threadId);
    if (!admin) throw new ForbiddenException('Only group admins can change who is an admin');
    if (role !== 'ADMIN' && role !== 'MEMBER') throw new BadRequestException('Role is ADMIN or MEMBER');
    if (!members.includes(userId)) throw new NotFoundException('They aren’t in this group');
    if (thread.cohortId && role === 'MEMBER' && (await this.prisma.cohort.count({ where: { id: thread.cohortId, teacherId: userId } }))) throw new BadRequestException('The cohort’s teacher is always a group admin');
    await this.prisma.threadMember.upsert({ where: { threadId_userId: { threadId, userId } }, update: { role }, create: { threadId, userId, role, addedById: me.id } });
    const [n] = await this.names([userId]);
    await this.messages.postSystem(thread, me.id, role === 'ADMIN' ? `${nameOf(me)} made ${(n ?? 'someone')} a group admin` : `${nameOf(me)} removed ${(n ?? 'someone')} as a group admin`);
    return { role };
  }

  async mute(me: UserProfile, threadId: string, muted: boolean) {
    const { member } = await this.groupFor(me, threadId);
    if (!member) throw new ForbiddenException('Only members can mute a group');
    await this.prisma.threadMember.upsert({ where: { threadId_userId: { threadId, userId: me.id } }, update: { muted: !!muted }, create: { threadId, userId: me.id, muted: !!muted } });
    return { muted: !!muted };
  }

  /** Photos, voice notes and files shared in the group, newest first */
  async media(me: UserProfile, threadId: string, kind: string) {
    await this.groupFor(me, threadId);
    const pre = kind === 'voice' ? 'audio/' : kind === 'files' ? 'application/' : 'image/';
    const rows = await this.prisma.message.findMany({
      where: { threadId, kind: 'TEXT', attachmentType: { startsWith: pre } }, orderBy: { createdAt: 'desc' }, take: 60,
      select: { id: true, createdAt: true, attachmentKey: true, attachmentName: true, attachmentType: true, attachmentSize: true, attachmentDuration: true, attachmentWave: true, sender: { select: personSelect } },
    });
    const linked = await this.messages.withLinks(rows);
    return linked.map(({ sender, ...m }) => ({ ...m, senderName: nameOf(sender) }));
  }
}
