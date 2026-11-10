import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { UserProfile } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../notifications/push.service';
import { DailyService } from '../live/daily/daily.service';
import { MessagesService, isGroupThread, nameOf, personSelect } from './messages.service';
import { MessagesGateway } from './messages.gateway';

/** A one-to-one call rings this long before it counts as missed */
const RING_SECS = 45;
const OPEN = ['RINGING', 'ACTIVE'];
const HOME: Record<string, string> = { TEACHER: '/teacher', ADMIN: '/admin', COUNTRY_REP: '/country-rep', SUBJECT_REVIEWER: '/reviewer' };

/** "4 min 12 s", "38 min", "1 h 5 min" */
function length(secs: number) {
  if (secs < 60) return `${secs} s`;
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  if (h) return `${h} h ${m} min`;
  return m < 10 && s ? `${m} min ${s} s` : `${m} min`;
}

type CallRow = NonNullable<Awaited<ReturnType<CallsService['load']>>>;

/**
 * Voice calls in Messages, on Daily: you can call anyone you can message; in groups the teacher or a group admin
 * starts the call and members join. Each call has an entry in the chat that says how it went.
 *
 * Live events (to everyone in the call, or the chat for group calls):
 *   call:incoming  { call }   — someone is ringing you (one-to-one) or a group call started
 *   call:update    { call }   — answered, someone joined or left, ended, missed, declined
 */
@Injectable()
export class CallsService {
  private readonly logger = new Logger(CallsService.name);
  private timers = new Map<string, NodeJS.Timeout>();

  constructor(
    private prisma: PrismaService,
    private messages: MessagesService,
    private gateway: MessagesGateway,
    private daily: DailyService,
    private notifications: NotificationsService,
    private push: PushService,
  ) {}

  load(id: string) {
    return this.prisma.call.findUnique({
      where: { id },
      include: {
        thread: true,
        startedBy: { select: personSelect },
        participants: { include: { user: { select: personSelect } }, orderBy: { joinedAt: 'asc' } },
        message: { select: { id: true } },
      },
    });
  }

  /** The call as the portal shows it */
  private async view(call: CallRow, viewerId?: string) {
    const t = call.thread;
    const cohort = t.cohortId ? await this.prisma.cohort.findUnique({ where: { id: t.cohortId }, select: { name: true } }) : null;
    const other = call.kind === 'ONE' ? call.participants.find(p => p.userId !== viewerId) : null;
    const host = call.kind === 'GROUP' && viewerId ? await this.messages.isGroupAdmin(t, { id: viewerId, role: (await this.prisma.userProfile.findUnique({ where: { id: viewerId }, select: { role: true } }))?.role ?? 'STUDENT' } as UserProfile) : false;
    return {
      id: call.id, threadId: call.threadId, kind: call.kind, status: call.status,
      startedAt: call.startedAt, answeredAt: call.answeredAt, endedAt: call.endedAt,
      startedBy: { id: call.startedBy.id, name: nameOf(call.startedBy), avatarUrl: call.startedBy.avatarUrl },
      title: call.kind === 'GROUP' ? t.name ?? cohort?.name ?? 'Group call' : other ? nameOf(other.user) : nameOf(call.startedBy),
      avatarUrl: call.kind === 'GROUP' ? t.photoUrl : other?.user.avatarUrl ?? null,
      subtitle: call.kind === 'GROUP' ? 'Group voice call' : other ? ({ TEACHER: 'Teacher', STUDENT: 'Student', ADMIN: 'CareerPath support', COUNTRY_REP: 'Country representative', SUBJECT_REVIEWER: 'Subject reviewer' } as Record<string, string>)[other.user.role] ?? '' : '',
      participants: call.participants.map(p => ({ id: p.userId, name: nameOf(p.user), avatarUrl: p.user.avatarUrl, role: p.user.role, inCall: !!p.joinedAt && !p.leftAt, declined: !!p.declinedAt })),
      isHost: call.kind === 'GROUP' ? host : true,
      memberCount: call.kind === 'GROUP' ? (await this.messages.members(t)).length : 2,
    };
  }

  private async tell(call: CallRow, event: string, userIds?: string[]) {
    const to = userIds ?? (call.kind === 'GROUP' ? await this.messages.members(call.thread) : call.participants.map(p => p.userId));
    for (const id of to) this.gateway.emitTo([id], event, { call: await this.view(call, id) });
  }

  /** The chat entry for a call says how it went; everyone in the chat sees it change */
  private async summarise(call: CallRow) {
    if (!call.message) return;
    const joined = call.participants.filter(p => p.joinedAt).length;
    const secs = call.answeredAt && call.endedAt ? Math.max(1, Math.round((+call.endedAt - +call.answeredAt) / 1000)) : 0;
    const body = call.kind === 'GROUP'
      ? (OPEN.includes(call.status) ? 'Group voice call in progress' : `Group voice call · ${length(secs)} · ${joined} joined`)
      : call.status === 'MISSED' ? 'Missed voice call'
      : call.status === 'DECLINED' ? 'Voice call · declined'
      : call.status === 'ENDED' ? `Voice call · ${length(secs)}`
      : 'Voice call';
    await this.prisma.message.update({ where: { id: call.message.id }, data: { body } });
    const members = await this.messages.members(call.thread);
    for (const m of members) {
      const [one] = await this.messages.shape(call.threadId, [call.message.id], { id: m });
      if (one) this.gateway.emitTo([m], 'message:updated', { threadId: call.threadId, message: one });
    }
  }

  private async token(call: CallRow, me: UserProfile, owner: boolean) {
    return this.daily.createToken({ roomName: call.roomName, userId: me.id, userName: nameOf(me), isOwner: owner, exp: new Date(Date.now() + 3 * 3600_000) });
  }

  private async joinInfo(call: CallRow, me: UserProfile) {
    const owner = call.kind === 'ONE' || (await this.messages.isGroupAdmin(call.thread, me));
    return { call: await this.view(call, me.id), roomUrl: call.roomUrl, token: await this.token(call, me, owner), fake: this.daily.fake };
  }

  // ── Starting and answering ───────────────────────────────

  async start(me: UserProfile, threadId: string) {
    const { thread, members } = await this.messages.threadFor(me, threadId);
    if (!members.includes(me.id)) throw new ForbiddenException('Only people in this chat can call');
    const group = isGroupThread(thread);
    const open = await this.prisma.call.findFirst({ where: { threadId, status: { in: OPEN } } });
    if (open) {
      if (group && open.status === 'ACTIVE') return this.join(me, open.id);
      throw new ConflictException('There’s already a call in this chat');
    }
    if (group && !(await this.messages.isGroupAdmin(thread, me))) throw new ForbiddenException('Group calls are started by the teacher or a group admin');
    const other = group ? null : members.find(m => m !== me.id)!;
    if (other) {
      const busy = await this.prisma.callParticipant.count({ where: { userId: other, leftAt: null, declinedAt: null, call: { status: { in: OPEN } } } });
      if (busy) throw new ConflictException('They’re on another call. Try again in a moment.');
    }
    const room = await this.daily.createCallRoom(`call-${randomUUID()}`, group ? 50 : 2);
    const now = new Date();
    const created = await this.prisma.call.create({
      data: {
        threadId, startedById: me.id, kind: group ? 'GROUP' : 'ONE', status: group ? 'ACTIVE' : 'RINGING',
        roomName: room.name, roomUrl: room.url, answeredAt: group ? now : null,
        participants: { create: [{ userId: me.id, joinedAt: now }, ...(other ? [{ userId: other }] : [])] },
        message: { create: { threadId, senderId: me.id, kind: 'CALL', body: group ? 'Group voice call in progress' : 'Voice call' } },
      },
    });
    await this.prisma.messageThread.update({ where: { id: threadId }, data: { lastMessageAt: now } });
    const call = (await this.load(created.id))!;
    // The call's entry appears in the chat for everyone
    const msgId = call.message!.id;
    for (const m of members) {
      const [one] = await this.messages.shape(threadId, [msgId], { id: m });
      if (one) this.gateway.emitTo([m], 'message:new', { threadId, message: one });
    }
    const others = members.filter(m => m !== me.id);
    await this.tell(call, 'call:incoming', others);
    if (group) {
      const muted = new Set((await this.prisma.threadMember.findMany({ where: { threadId, muted: true }, select: { userId: true } })).map(m => m.userId));
      const people = await this.prisma.userProfile.findMany({ where: { id: { in: others.filter(o => !muted.has(o)) } }, select: { id: true, role: true } });
      const v = await this.view(call);
      for (const p of people) this.notifications.notify(p.id, { type: 'message', title: `${nameOf(me)} started a group call`, body: `${v.title} · tap to join`, href: `${HOME[p.role] ?? '/student'}/messages?thread=${threadId}` });
    } else {
      this.timers.set(call.id, setTimeout(() => this.ringOut(call.id).catch(() => {}), RING_SECS * 1000));
      // Portal closed: ring their phone or computer
      if (!this.gateway.isOnline(other!)) {
        const callee = await this.prisma.userProfile.findUnique({ where: { id: other! }, select: { role: true } });
        this.push.send([other!], { kind: 'call', title: `${nameOf(me)} is calling you`, body: 'Voice call on CareerPath Africa · tap to answer', url: `${HOME[callee?.role ?? ''] ?? '/student'}/messages?thread=${threadId}`, tag: `call-${call.id}`, requireInteraction: true });
      }
    }
    return this.joinInfo(call, me);
  }

  /** Nobody answered in time */
  private async ringOut(id: string) {
    this.timers.delete(id);
    const call = await this.load(id);
    if (!call || call.status !== 'RINGING') return;
    await this.finish(call, 'MISSED');
  }

  async accept(me: UserProfile, id: string) {
    const call = await this.load(id);
    if (!call) throw new NotFoundException('Call not found');
    const mine = call.participants.find(p => p.userId === me.id);
    if (!mine || call.kind !== 'ONE' || call.startedById === me.id) throw new ForbiddenException('This call isn’t ringing for you');
    if (call.status !== 'RINGING') throw new BadRequestException(call.status === 'ACTIVE' ? 'You’ve already answered' : 'The call has ended');
    clearTimeout(this.timers.get(id)); this.timers.delete(id);
    await this.prisma.$transaction([
      this.prisma.call.update({ where: { id }, data: { status: 'ACTIVE', answeredAt: new Date() } }),
      this.prisma.callParticipant.update({ where: { id: mine.id }, data: { joinedAt: new Date() } }),
    ]);
    const fresh = (await this.load(id))!;
    await this.tell(fresh, 'call:update');
    return this.joinInfo(fresh, me);
  }

  /** Decline, optionally with a short message sent to the chat ("Can't talk now, I'll call you back") */
  async decline(me: UserProfile, id: string, text?: string) {
    const call = await this.load(id);
    if (!call) throw new NotFoundException('Call not found');
    const mine = call.participants.find(p => p.userId === me.id);
    if (!mine || call.kind !== 'ONE' || call.startedById === me.id) throw new ForbiddenException('This call isn’t ringing for you');
    if (call.status !== 'RINGING') return { ok: true };
    clearTimeout(this.timers.get(id)); this.timers.delete(id);
    await this.prisma.callParticipant.update({ where: { id: mine.id }, data: { declinedAt: new Date() } });
    await this.finish((await this.load(id))!, 'DECLINED');
    const note = String(text ?? '').trim().slice(0, 300);
    if (note) await this.messages.sendMessage(call.threadId, me, { body: note });
    return { ok: true };
  }

  async join(me: UserProfile, id: string) {
    const call = await this.load(id);
    if (!call) throw new NotFoundException('Call not found');
    if (call.status !== 'ACTIVE') throw new BadRequestException('This call has ended');
    if (call.kind === 'ONE') {
      if (!call.participants.some(p => p.userId === me.id)) throw new ForbiddenException('Not your call');
    } else {
      const members = await this.messages.members(call.thread);
      if (!members.includes(me.id)) throw new ForbiddenException('Only people in this group can join');
    }
    await this.prisma.callParticipant.upsert({ where: { callId_userId: { callId: id, userId: me.id } }, update: { joinedAt: new Date(), leftAt: null }, create: { callId: id, userId: me.id, joinedAt: new Date() } });
    const fresh = (await this.load(id))!;
    await this.tell(fresh, 'call:update');
    return this.joinInfo(fresh, me);
  }

  async leave(me: UserProfile, id: string) {
    const call = await this.load(id);
    if (!call || !OPEN.includes(call.status)) return { ok: true };
    const mine = call.participants.find(p => p.userId === me.id);
    if (!mine) return { ok: true };
    if (call.kind === 'ONE') {
      // Hanging up before they answer: a missed call for them; after: the call ends for both
      await this.finish(call, call.status === 'RINGING' ? 'MISSED' : 'ENDED');
      return { ok: true };
    }
    await this.prisma.callParticipant.update({ where: { id: mine.id }, data: { leftAt: new Date() } });
    const fresh = (await this.load(id))!;
    if (!fresh.participants.some(p => p.joinedAt && !p.leftAt)) await this.finish(fresh, 'ENDED');
    else await this.tell(fresh, 'call:update');
    return { ok: true };
  }

  /** Group calls: the host ends it for everyone */
  async end(me: UserProfile, id: string) {
    const call = await this.load(id);
    if (!call || !OPEN.includes(call.status)) return { ok: true };
    if (call.kind === 'GROUP' && !(await this.messages.isGroupAdmin(call.thread, me))) throw new ForbiddenException('Only the teacher or a group admin can end the call for everyone');
    if (call.kind === 'ONE' && !call.participants.some(p => p.userId === me.id)) throw new ForbiddenException('Not your call');
    await this.finish(call, 'ENDED');
    return { ok: true };
  }

  private async finish(call: CallRow, status: 'ENDED' | 'MISSED' | 'DECLINED') {
    const now = new Date();
    const done = await this.prisma.call.updateMany({ where: { id: call.id, status: { in: OPEN } }, data: { status, endedAt: now } });
    if (!done.count) return; // someone else finished it first
    await this.prisma.callParticipant.updateMany({ where: { callId: call.id, joinedAt: { not: null }, leftAt: null }, data: { leftAt: now } });
    clearTimeout(this.timers.get(call.id)); this.timers.delete(call.id);
    this.daily.closeRoom(call.roomName).catch(() => {});
    const fresh = await this.load(call.id);
    if (!fresh) return; // removed meanwhile
    await this.summarise(fresh);
    const people = call.kind === 'GROUP' ? fresh.participants.map(p => p.userId) : undefined;
    await this.tell(fresh, 'call:update', people);
    if (status === 'MISSED' && call.kind === 'ONE') {
      const callee = fresh.participants.find(p => p.userId !== call.startedById);
      if (callee) this.notifications.notify(callee.userId, { type: 'message', title: `Missed voice call from ${nameOf(fresh.startedBy)}`, body: 'Tap to call back', href: `${HOME[callee.user.role] ?? '/student'}/messages?thread=${call.threadId}`, pushTag: `call-${call.id}` });
    }
  }

  /** On opening the portal: a call ringing for me, or one I'm in (after a reload) */
  async current(me: UserProfile) {
    const part = await this.prisma.callParticipant.findFirst({
      where: { userId: me.id, declinedAt: null, leftAt: null, call: { status: { in: OPEN } } },
      orderBy: { call: { startedAt: 'desc' } }, select: { callId: true, joinedAt: true },
    });
    if (!part) return { call: null };
    const call = (await this.load(part.callId))!;
    return { call: await this.view(call, me.id), ringing: call.status === 'RINGING' && call.startedById !== me.id, inCall: !!part.joinedAt };
  }

  async get(me: UserProfile, id: string) {
    const call = await this.load(id);
    if (!call) throw new NotFoundException('Call not found');
    const members = await this.messages.members(call.thread);
    if (!members.includes(me.id) && !call.participants.some(p => p.userId === me.id)) throw new ForbiddenException('Not your call');
    return this.view(call, me.id);
  }

  /** Every minute: calls ringing too long are missed; calls everyone left (or 3 hours old) are ended */
  @Cron('*/1 * * * *')
  async sweep() {
    const stale = await this.prisma.call.findMany({
      where: { OR: [
        { status: 'RINGING', startedAt: { lt: new Date(Date.now() - (RING_SECS + 15) * 1000) } },
        { status: 'ACTIVE', startedAt: { lt: new Date(Date.now() - 3 * 3600_000) } },
        { status: 'ACTIVE', participants: { none: { joinedAt: { not: null }, leftAt: null } } },
      ] },
      select: { id: true },
    });
    for (const s of stale) {
      const call = await this.load(s.id);
      if (call) await this.finish(call, call.status === 'RINGING' ? 'MISSED' : 'ENDED').catch(err => this.logger.warn(`Call sweep: ${err.message}`));
    }
  }
}
