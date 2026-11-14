import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomInt } from 'crypto';

/**
 * Authenticator-app codes (RFC 6238 TOTP): 6 digits, a new one every 30 seconds, SHA-1, the same as
 * Google Authenticator, Microsoft Authenticator and Authy use.
 */
const STEP = 30;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(s: string): Buffer {
  const clean = s.replace(/[\s=-]/g, '').toUpperCase();
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('Not base32');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** A new secret: 20 random bytes, as the app expects them (base32) */
export const newSecret = () => base32(randomBytes(20));

export const stepNow = (now = Date.now()) => Math.floor(now / 1000 / STEP);

export function codeAt(secret: string, step: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const h = createHmac('sha1', unbase32(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, '0');
}

/** The step the code belongs to (one step either side, for phone clocks), or null. Steps at or before lastStep don't count. */
export function matchStep(secret: string, code: string, lastStep?: number | null, now = Date.now()): number | null {
  const c = code.replace(/\s/g, '');
  if (!/^\d{6}$/.test(c)) return null;
  const s = stepNow(now);
  for (const step of [s, s - 1, s + 1]) {
    if (lastStep != null && step <= lastStep) continue;
    if (codeAt(secret, step) === c) return step;
  }
  return null;
}

/** What the QR code holds: the app shows "CareerPath Africa (email)" */
export const otpauthUrl = (secret: string, email: string) =>
  `otpauth://totp/${encodeURIComponent(`CareerPath Africa:${email}`)}?secret=${secret}&issuer=${encodeURIComponent('CareerPath Africa')}&algorithm=SHA1&digits=6&period=${STEP}`;

// ── Backup codes ─────────────────────────────────────────

const BACKUP_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
/** 10 codes like "k7m2-x9qa", each usable once */
export const newBackupCodes = (n = 10) => Array.from({ length: n }, () => {
  const part = () => Array.from({ length: 4 }, () => BACKUP_CHARS[randomInt(BACKUP_CHARS.length)]).join('');
  return `${part()}-${part()}`;
});
export const normalBackup = (code: string) => code.toLowerCase().replace(/[^a-z0-9]/g, '');
export const hashBackup = (code: string) => createHash('sha256').update(`cpa-backup:${normalBackup(code)}`).digest('hex');
export const looksLikeBackup = (code: string) => /^[a-z0-9]{8}$/.test(normalBackup(code)) && !/^\d+$/.test(normalBackup(code));

// ── The secret at rest ───────────────────────────────────

function key(): Buffer {
  const raw = process.env.TOTP_KEY;
  if (!raw) throw new Error('TOTP_KEY is not set');
  const k = Buffer.from(raw, 'base64');
  if (k.length !== 32) throw new Error('TOTP_KEY must be 32 bytes, base64');
  return k;
}

export function seal(secret: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([c.update(secret, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString('base64')).join('.');
}

export function unseal(sealed: string): string {
  const [iv, tag, data] = sealed.split('.').map(x => Buffer.from(x, 'base64'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}
