import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';

interface SocketUser {
  id: string;
  role: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
}

interface AuthenticatedSocket extends Socket {
  user?: SocketUser;
}

/**
 * Real-time whiteboard gateway for live class sessions.
 *
 * Rooms are keyed by liveClassId.
 *
 * Events (client → server):
 *   whiteboard:join       { classId }                  — join a whiteboard room
 *   whiteboard:update     { classId, elements, appState } — broadcast drawing change
 *   whiteboard:toggle     { classId, open }            — teacher opens/closes board
 *   whiteboard:clear      { classId }                  — teacher clears the board
 *   whiteboard:permission { classId, studentId, canDraw } — teacher grants/revokes student draw access
 *
 * Events (server → client):
 *   whiteboard:state      { elements, appState, open } — full state (on join / request)
 *   whiteboard:update     { elements, appState, senderId } — incremental update
 *   whiteboard:toggle     { open }                     — board visibility changed
 *   whiteboard:permission { canDraw }                  — your draw permission changed
 *   whiteboard:error      { message }                  — something went wrong
 */
@WebSocketGateway({
  namespace: '/whiteboard',
  cors: {
    origin: process.env.PORTAL_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class WhiteboardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server: Server;
  private readonly logger = new Logger(WhiteboardGateway.name);

  // In-memory state per classId: { elements, appState, open, drawPermissions }
  private rooms = new Map<string, {
    elements: any[];
    appState: Record<string, any>;
    open: boolean;
    drawPermissions: Set<string>; // studentIds allowed to draw
  }>();

  constructor(
    private jwt: JwtService,
    private prisma: PrismaService,
  ) {}

  // ── Connection / auth ────────────────────────────────────

  async handleConnection(socket: AuthenticatedSocket) {
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
      this.logger.log(`Whiteboard connected: ${user.email} (${user.role})`);
    } catch {
      socket.emit('whiteboard:error', { message: 'Invalid token' });
      socket.disconnect();
    }
  }

  handleDisconnect(socket: AuthenticatedSocket) {
    if (socket.user) {
      this.logger.log(`Whiteboard disconnected: ${socket.user.email}`);
    }
  }

  // ── Join a class whiteboard room ─────────────────────────

  @SubscribeMessage('whiteboard:join')
  async handleJoin(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { classId: string },
  ) {
    const { classId } = data;
    if (!socket.user) return;

    // Verify user has access to this class
    const liveClass = await this.prisma.liveClass.findUnique({
      where: { id: classId },
      include: { cohort: { select: { teacherId: true } } },
    });

    if (!liveClass) {
      socket.emit('whiteboard:error', { message: 'Class not found' });
      return;
    }

    const isTeacher = liveClass.cohort.teacherId === socket.user.id;
    const isAdmin   = socket.user.role === 'ADMIN';

    if (!isTeacher && !isAdmin) {
      // Verify student is in the cohort
      const roster = await this.prisma.cohortRoster.findUnique({
        where: {
          studentId_cohortId: {
            studentId: socket.user.id,
            cohortId: liveClass.cohortId,
          },
        },
      });
      if (!roster) {
        socket.emit('whiteboard:error', { message: 'Not enrolled in this class' });
        return;
      }
    }

    socket.join(classId);

    // Ensure room state exists
    if (!this.rooms.has(classId)) {
      this.rooms.set(classId, {
        elements: [],
        appState: {},
        open: false,
        drawPermissions: new Set(),
      });
    }

    const room = this.rooms.get(classId)!;
    const canDraw = isTeacher || isAdmin || room.drawPermissions.has(socket.user.id);

    // Send current state to the joining client
    socket.emit('whiteboard:state', {
      elements: room.elements,
      appState: room.appState,
      open: room.open,
      canDraw,
    });

    this.logger.log(`${socket.user.email} joined whiteboard room: ${classId}`);
  }

  // ── Teacher broadcasts drawing changes ───────────────────

  @SubscribeMessage('whiteboard:update')
  handleUpdate(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { classId: string; elements: any[]; appState?: Record<string, any> },
  ) {
    if (!socket.user) return;
    const { classId, elements, appState = {} } = data;
    const room = this.rooms.get(classId);
    if (!room) return;

    // Only teacher, admin, or students with draw permission can update
    const isTeacherOrAdmin = socket.user.role === 'TEACHER' || socket.user.role === 'ADMIN';
    if (!isTeacherOrAdmin && !room.drawPermissions.has(socket.user.id)) return;

    // Persist latest state in memory
    room.elements = elements;
    room.appState = appState;

    // Broadcast to everyone else in the room
    socket.to(classId).emit('whiteboard:update', {
      elements,
      appState,
      senderId: socket.user.id,
    });
  }

  // ── Teacher toggles whiteboard visibility ────────────────

  @SubscribeMessage('whiteboard:toggle')
  handleToggle(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { classId: string; open: boolean },
  ) {
    if (!socket.user) return;
    if (socket.user.role !== 'TEACHER' && socket.user.role !== 'ADMIN') return;

    const { classId, open } = data;
    const room = this.rooms.get(classId);
    if (!room) return;

    room.open = open;
    // Broadcast to all (including sender's other tabs)
    this.server.to(classId).emit('whiteboard:toggle', { open });
    this.logger.log(`Whiteboard ${open ? 'opened' : 'closed'} for class ${classId}`);
  }

  // ── Teacher clears the board ─────────────────────────────

  @SubscribeMessage('whiteboard:clear')
  handleClear(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { classId: string },
  ) {
    if (!socket.user) return;
    if (socket.user.role !== 'TEACHER' && socket.user.role !== 'ADMIN') return;

    const { classId } = data;
    const room = this.rooms.get(classId);
    if (!room) return;

    room.elements = [];
    room.appState = {};
    this.server.to(classId).emit('whiteboard:update', { elements: [], appState: {}, senderId: socket.user.id });
  }

  // ── Teacher grants/revokes student draw permission ───────

  @SubscribeMessage('whiteboard:permission')
  handlePermission(
    @ConnectedSocket() socket: AuthenticatedSocket,
    @MessageBody() data: { classId: string; studentId: string; canDraw: boolean },
  ) {
    if (!socket.user) return;
    if (socket.user.role !== 'TEACHER' && socket.user.role !== 'ADMIN') return;

    const { classId, studentId, canDraw } = data;
    const room = this.rooms.get(classId);
    if (!room) return;

    if (canDraw) room.drawPermissions.add(studentId);
    else room.drawPermissions.delete(studentId);

    // Notify all sockets in the room — the target student listens for their userId
    this.server.to(classId).emit('whiteboard:permission', { studentId, canDraw });
    this.logger.log(`Draw permission ${canDraw ? 'granted' : 'revoked'} to ${studentId} in class ${classId}`);
  }

  // ── Save snapshot when class ends (called from LiveService) ─

  getSnapshot(classId: string): any[] {
    return this.rooms.get(classId)?.elements ?? [];
  }

  clearRoom(classId: string) {
    this.rooms.delete(classId);
    this.logger.log(`Whiteboard room cleared: ${classId}`);
  }
}
