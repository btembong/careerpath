import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

/**
 * Thin wrapper around the Daily.co REST API.
 * All video room and token operations go through here.
 *
 * Security rules enforced here:
 *  - Rooms are always time-boxed (nbf + exp on creation)
 *  - Tokens are always per-request, per-user — never cached or reused
 *  - Students get `is_owner: false` tokens; teachers get `is_owner: true`
 *  - Correct answers and room tokens are never sent to the frontend together
 */
@Injectable()
export class DailyService {
  private readonly client: AxiosInstance;
  private readonly domain: string;
  private readonly logger = new Logger(DailyService.name);

  constructor(private config: ConfigService) {
    this.domain = config.getOrThrow<string>('DAILY_DOMAIN');

    this.client = axios.create({
      baseURL: 'https://api.daily.co/v1',
      headers: {
        Authorization: `Bearer ${config.getOrThrow<string>('DAILY_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      timeout: 10_000,
    });
  }

  /**
   * Create a private, time-boxed Daily.co room for a live class.
   * nbf = class start time, exp = class start + duration
   * Returns the room URL stored on LiveClass.dailyRoomUrl
   */
  async createRoom(options: CreateRoomOptions): Promise<DailyRoom> {
    const { name, startsAt, durationMinutes = 90, maxParticipants } = options;
    const nbf = Math.floor(startsAt.getTime() / 1000);
    const exp = nbf + durationMinutes * 60;

    try {
      const res = await this.client.post<DailyRoom>('/rooms', {
        name,
        privacy: 'private',
        properties: {
          nbf,
          // ── Multi-participant UX ──────────────────────────
          enable_chat: true,
          enable_screenshare: true,
          // Cap screenshare bitrate — keeps bandwidth predictable for lower-end connections
          screenshare_send_max_bitrate: 2500,  // kbps — clear for slides/code, not wasteful
          enable_network_ui: true,
          // Pre-join screen: camera/mic preview before entering
          enable_prejoin_ui: true,
          // Knocking: students appear in a waiting room; teacher admits them
          enable_knocking: true,
          // Auto-admit when teacher is already in the room (reduces friction)
          // Owner can toggle knocking off inside the room
          // ── Participant cap ───────────────────────────────
          // +2 buffer for teacher + potential admin observer
          ...(maxParticipants ? { max_participants: maxParticipants + 2 } : {}),
          // ── Recording ────────────────────────────────────
          // Cloud recording is enabled per-token for owner (teacher)
          // so no room-level recording flag needed here
          // ── Media defaults ───────────────────────────────
          start_video_off: false,
          start_audio_off: true,   // Students join muted — teacher unmutes as needed
          // ── Expiry buffer: allow 15 min grace after class ends ──
          exp: exp + 15 * 60,
        },
      });
      this.logger.log(`Created Daily.co room: ${res.data.name} (max: ${maxParticipants ?? 'unlimited'})`);
      return res.data;
    } catch (err: any) {
      this.logger.error('Failed to create Daily.co room', err.response?.data ?? err.message);
      throw new InternalServerErrorException('Could not create video room');
    }
  }

  /**
   * Issue a per-request, per-user meeting token.
   * Owner tokens (teachers) can mute/remove participants and manage the room.
   * Never reuse or cache a token across users.
   */
  async createToken(options: CreateTokenOptions): Promise<string> {
    const { roomName, userId, userName, isOwner, exp } = options;

    try {
      const res = await this.client.post<{ token: string }>('/meeting-tokens', {
        properties: {
          room_name: roomName,
          user_id: userId,
          user_name: userName,
          is_owner: isOwner,
          exp: exp ? Math.floor(exp.getTime() / 1000) : undefined,
          // Enable data channels for Excalidraw whiteboard sync
          enable_recording: isOwner ? 'cloud' : undefined,
        },
      });
      return res.data.token;
    } catch (err: any) {
      this.logger.error('Failed to create Daily.co token', err.response?.data ?? err.message);
      throw new InternalServerErrorException('Could not issue video token');
    }
  }

  /**
   * Force-close a room when a class ends.
   * Ejects all participants and makes the room inaccessible.
   */
  async closeRoom(roomName: string): Promise<void> {
    try {
      await this.client.delete(`/rooms/${roomName}`);
      this.logger.log(`Closed Daily.co room: ${roomName}`);
    } catch (err: any) {
      // Log but don't throw — closing failure must not crash the end-class flow
      this.logger.error(`Failed to close room ${roomName}`, err.response?.data ?? err.message);
    }
  }

  /** One recording, straight from Daily: used to check a webhook's claim before trusting it. */
  async getRecording(id: string): Promise<{ id: string; room_name: string; status: string; duration?: number } | null> {
    try { return (await this.client.get(`/recordings/${encodeURIComponent(id)}`)).data; }
    catch (err: any) { this.logger.warn(`Recording ${id} not found at Daily: ${err.response?.status ?? err.message}`); return null; }
  }

  /** Finished recordings for a room, newest first. */
  async listRecordings(roomName: string): Promise<{ id: string; room_name: string; status: string; start_ts?: number }[]> {
    try {
      const res = await this.client.get('/recordings', { params: { room_name: roomName, limit: 20 } });
      return (res.data?.data ?? []).filter((r: any) => r.room_name === roomName && r.status === 'finished');
    } catch (err: any) { this.logger.warn(`Could not list recordings for ${roomName}: ${err.response?.status ?? err.message}`); return []; }
  }

  /** A short-lived link to watch or download a recording. */
  async recordingLink(id: string): Promise<{ url: string; expires: number } | null> {
    try {
      const res = await this.client.get(`/recordings/${encodeURIComponent(id)}/access-link`, { params: { valid_for_secs: 3 * 3600 } });
      return res.data?.download_link ? { url: res.data.download_link, expires: res.data.expires } : null;
    } catch (err: any) { this.logger.warn(`No access link for recording ${id}: ${err.response?.status ?? err.message}`); return null; }
  }

  /** Extract the room name from a Daily.co room URL. */
  roomNameFromUrl(url: string): string {
    return url.split('/').pop() ?? url;
  }
}

// ── Types ─────────────────────────────────────────────────

export interface CreateRoomOptions {
  name: string;
  startsAt: Date;
  durationMinutes?: number;
  /** Cohort student count — used to cap the room. Teacher + 2 buffer added automatically. */
  maxParticipants?: number;
}

export interface CreateTokenOptions {
  roomName: string;
  userId: string;
  userName: string;
  isOwner: boolean;
  exp?: Date;
}

export interface DailyRoom {
  id: string;
  name: string;
  url: string;
  privacy: string;
  created_at: string;
}
