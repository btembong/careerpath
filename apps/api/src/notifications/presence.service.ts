import { Injectable } from '@nestjs/common';

/** Who has the portal open right now (counted by open live connections), so alerts go elsewhere only when they don't */
@Injectable()
export class PresenceService {
  private online = new Map<string, number>();

  connected(userId: string) { this.online.set(userId, (this.online.get(userId) ?? 0) + 1); }

  disconnected(userId: string) {
    const n = (this.online.get(userId) ?? 1) - 1;
    if (n <= 0) this.online.delete(userId); else this.online.set(userId, n);
  }

  isOnline(userId: string) { return (this.online.get(userId) ?? 0) > 0; }
}
