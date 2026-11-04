import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'crypto';
import type Redis from 'ioredis';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

interface SocketUser {
  id: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface AuthenticatedSocket extends Socket {
  user?: SocketUser;
  /** Resolves once the sign-in check is done, so early messages wait for it */
  ready?: Promise<void>;
}

/** Board state kept in Redis, so it survives an API restart and is shared by every API server */
interface Board {
  elements: any[];
  appState: Record<string, any>;
  open: boolean;
  /** Who leads the board: the class teacher, or the mentor in a 1-on-1 */
  leaders: string[];
  /** Students the leader allowed to draw */
  drawers: string[];
}

const KEY = (room: string) => `wb:${room}`;
const CHANNEL = 'wb:events';
const TTL = 24 * 3600;

/**
 * Real-time whiteboard for live classes and 1-on-1 mentoring sessions.
 *
 * Room ids: a live class id, or `mentor:<bookingId>` for a mentoring session.
 *
 * Events (client → server):
 *   whiteboard:join       { classId }                       — join a room (classId is the room id)
 *   whiteboard:update     { classId, elements, appState }   — drawing change
 *   whiteboard:toggle     { classId, open }                 — leader opens/closes the board
 *   whiteboard:clear      { classId }                       — leader clears the board
 *   whiteboard:permission { classId, studentId, canDraw }   — leader lets a student draw, or stops them
 *
 * Events (server → client):
 *   whiteboard:state      { elements, appState, open, canDraw }
 *   whiteboard:update     { elements, appState, senderId }
 *   whiteboard:toggle     { open }
 *   whiteboard:permission { studentId, canDraw }
 *   whiteboard:error      { message }
 */
@WebSocketGateway({
  namespace: '/whiteboard',
  cors: {
    origin: process.env.PORTAL_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class WhiteboardGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit, OnModuleDestroy {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(WhiteboardGateway.name);
  /** Tells this server's own messages apart on the shared channel */
  private readonly instance = randomUUID();
  private sub?: Redis;
  /** Mentoring boards are kept with the booking, written a moment after the drawing stops */
  private keepTimers = new Map<string, ReturnType<typeof setTimeout>>();

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ── Cross-server fan-out ─────────────────────────────────

  onModuleInit() {
    try {
      this.sub = this.redis.client.duplicate();
      this.sub.subscribe(CHANNEL).catch(err => this.logger.warn(`Whiteboard channel not subscribed: ${err.message}`));
      this.sub.on('message', (_ch, raw) => {
        try {
          const m = JSON.parse(raw) as { from: string; room: string; event: string; payload: unknown };
          if (m.from !== this.instance) this.server?.to(m.room).emit(m.event, m.payload);
        } catch { /* ignore bad messages */ }
      });
    } catch (err: any) {
      this.logger.warn(`Whiteboard runs on this server only: ${err?.message}`);
    }
  }

  async onModuleDestroy() {
    await this.sub?.quit().catch(() => {});
  }

  /** Emit to everyone in the room on every server; `except` skips the sender's socket here */
  private broadcast(room: string, event: string, payload: unknown, except?: Socket) {
    (except ? except.to(room) : this.server.to(room)).emit(event, payload);
    this.redis.client.publish(CHANNEL, JSON.stringify({ from: this.instance, room, event, payload })).catch(() => {});
  }

  private async load(room: string): Promise<Board | null> {
    const raw = await this.redis.get(KEY(room)).catch(() => null);
    return raw ? (JSON.parse(raw) as Board) : null;
  }

  private async save(room: string, board: Board) {
    await this.redis.set(KEY(room), JSON.stringify(board), TTL);
  }

  // ── Connection / auth ────────────────────────────────────

  handleConnection(socket: AuthenticatedSocket) {
    socket.ready = this.authenticate(socket);
  }

  private async authenticate(socket: AuthenticatedSocket) {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        socket.emit('whiteboard:error', { message: 'Authentication required' });
        socket.disconnect();
        return;
      }

      const payload = this.jwt.verify<{ sub: string; role: string }>(token);
      const user = await this.prisma.userProfile.findUnique({
        where: { id: payload.sub },
        select: { id: true, role: true, firstName: true, lastName: true, email: true },
      });

      if (!user) {
        socket.disconnect();
        return;
      }

      socket.user = user;
    } catch {
      socket.emit('whiteboard:error', { message: 'Invalid token' });
      socket.disconnect();
    }
  }

  handleDisconnect() { /* nothing to tidy: state lives in Redis */ }

  /** Who may be in this room, and who leads it. Null when the user has no place there. */
  private async access(user: SocketUser, room: string): Promise<{ leaders: string[]; isLeader: boolean } | { error: string }> {
    const isAdmin = user.role === 'ADMIN';
    if (room.startsWith('mentor:')) {
      const booking = await this.prisma.mentorBooking.findUnique({ where: { id: room.slice(7) }, include: { slot: { select: { teacherId: true } } } });
      if (!booking) return { error: 'Session not found' };
      // In a 1-on-1 both people can draw; the mentor leads
      const leaders = [booking.slot.teacherId, booking.studentId];
      if (!isAdmin && !leaders.includes(user.id)) return { error: 'Not your session' };
      return { leaders, isLeader: true };
    }
    const liveClass = await this.prisma.liveClass.findUnique({ where: { id: room }, include: { cohort: { select: { teacherId: true } } } });
    if (!liveClass) return { error: 'Class not found' };
    const leaders = [liveClass.cohort.teacherId];
    if (isAdmin || leaders.includes(user.id)) return { leaders, isLeader: true };
    const roster = await this.prisma.cohortRoster.findUnique({ where: { studentId_cohortId: { studentId: user.id, cohortId: liveClass.cohortId } } });
    if (!roster) return { error: 'Not enrolled in this class' };
    return { leaders, isLeader: false };
  }

  private leads(user: SocketUser, board: Board) {
    return user.role === 'ADMIN' || board.leaders.includes(user.id);
  }

  // ── Join ─────────────────────────────────────────────────

  @SubscribeMessage('whiteboard:join')
  async handleJoin(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { classId: string },
  ) {
    await socket.ready;
    const room = data?.classId;
    if (!socket.user || !room) return;

    const a = await this.access(socket.user, room);
    if ('error' in a) {
      socket.emit('whiteboard:error', { message: a.error });
      return;
    }
    socket.join(room);

    let board = await this.load(room);
    if (!board) {
      board = { elements: [], appState: {}, open: room.startsWith('mentor:'), leaders: a.leaders, drawers: [] };
      await this.save(room, board);
    }

    socket.emit('whiteboard:state', {
      elements: board.elements,
      appState: board.appState,
      open: board.open,
      canDraw: a.isLeader || board.drawers.includes(socket.user.id),
    });
  }

  // ── Drawing changes ──────────────────────────────────────

  @SubscribeMessage('whiteboard:update')
  async handleUpdate(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { classId: string; elements: any[]; appState?: Record<string, any> },
  ) {
    await socket.ready;
    if (!socket.user || !data?.classId || !socket.rooms.has(data.classId)) return;
    const { classId: room, elements, appState = {} } = data;
    const board = await this.load(room);
    if (!board) return;
    if (!this.leads(socket.user, board) && !board.drawers.includes(socket.user.id)) return;
    if (!Array.isArray(elements) || elements.length > 20000) return;

    board.elements = elements;
    board.appState = appState;
    await this.save(room, board);
    this.keepMentoringBoard(room, elements);
    this.broadcast(room, 'whiteboard:update', { elements, appState, senderId: socket.user.id }, socket);
  }

  private keepMentoringBoard(room: string, elements: any[]) {
    if (!room.startsWith('mentor:')) return;
    clearTimeout(this.keepTimers.get(room));
    this.keepTimers.set(room, setTimeout(() => {
      this.keepTimers.delete(room);
      this.prisma.mentorBooking.update({ where: { id: room.slice(7) }, data: { whiteboardSnapshot: JSON.stringify(elements) } })
        .catch(err => this.logger.warn(`Could not keep the board for ${room}: ${err.message}`));
    }, 3000));
  }

  // ── Leader opens or closes the board ─────────────────────

  @SubscribeMessage('whiteboard:toggle')
  async handleToggle(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { classId: string; open: boolean },
  ) {
    await socket.ready;
    if (!socket.user || !data?.classId || !socket.rooms.has(data.classId)) return;
    const board = await this.load(data.classId);
    if (!board || !this.leads(socket.user, board)) return;
    board.open = !!data.open;
    await this.save(data.classId, board);
    this.broadcast(data.classId, 'whiteboard:toggle', { open: board.open });
  }

  // ── Leader clears the board ──────────────────────────────

  @SubscribeMessage('whiteboard:clear')
  async handleClear(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { classId: string },
  ) {
    await socket.ready;
    if (!socket.user || !data?.classId || !socket.rooms.has(data.classId)) return;
    const board = await this.load(data.classId);
    if (!board || !this.leads(socket.user, board)) return;
    board.elements = [];
    board.appState = {};
    await this.save(data.classId, board);
    this.keepMentoringBoard(data.classId, []);
    this.broadcast(data.classId, 'whiteboard:update', { elements: [], appState: {}, senderId: socket.user.id });
  }

  // ── Leader lets a student draw, or stops them ────────────

  @SubscribeMessage('whiteboard:permission')
  async handlePermission(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { classId: string; studentId: string; canDraw: boolean },
  ) {
    await socket.ready;
    if (!socket.user || !data?.classId || !socket.rooms.has(data.classId)) return;
    const board = await this.load(data.classId);
    if (!board || !this.leads(socket.user, board)) return;
    const set = new Set(board.drawers);
    if (data.canDraw) set.add(data.studentId); else set.delete(data.studentId);
    board.drawers = [...set];
    await this.save(data.classId, board);
    this.broadcast(data.classId, 'whiteboard:permission', { studentId: data.studentId, canDraw: !!data.canDraw });
  }

  // ── Snapshot when a class ends (called from LiveService) ─

  async getSnapshot(room: string): Promise<any[]> {
    return (await this.load(room))?.elements ?? [];
  }

  async clearRoom(room: string) {
    await this.redis.del(KEY(room)).catch(() => {});
  }
}
