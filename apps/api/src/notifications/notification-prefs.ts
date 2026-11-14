/**
 * What a user can switch on or off in Settings → Notifications. `system` is always delivered in the app.
 * `roles` limits a kind to the people it applies to; `emailAlways` marks kinds whose emails are receipts or
 * decisions that are always sent, so only the app and phone can be switched off.
 */
export const NOTIFICATION_KINDS = [
  { key: 'live', group: 'Classes and work', label: 'Live class reminders', hint: 'Before a class starts, and when one is moved or cancelled', email: true },
  { key: 'assignment', group: 'Classes and work', label: 'Assignments and deadlines', hint: 'New work set, and reminders before it is due', email: true },
  { key: 'grade', group: 'Classes and work', label: 'Grades and feedback', hint: 'When a teacher grades your work', email: true },
  { key: 'message', group: 'People', label: 'Messages', hint: 'New direct messages and calls', email: true },
  { key: 'community', group: 'People', label: 'Community replies', hint: 'Answers to your questions, and new questions in your courses. Emailed only when you’re not online', email: true },
  { key: 'earnings', group: 'Your work', label: 'Earnings and payouts', hint: 'Sales added to your earnings, and money sent or returned. Emails are always sent, as receipts', email: true, emailAlways: true, roles: ['TEACHER', 'COUNTRY_REP', 'SUBJECT_REVIEWER'] },
  { key: 'review', group: 'Your work', label: 'Course reviews and prices', hint: 'A course is approved or sent back, and price decisions. Emails are always sent', email: true, emailAlways: true, roles: ['TEACHER'] },
  { key: 'certificate', group: 'Milestones and news', label: 'Certificates', hint: 'When you earn one', email: true },
  { key: 'news', group: 'Milestones and news', label: 'Announcements', hint: 'News and offers from CareerPath Africa', email: true },
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]['key'];
export interface KindPrefs { inApp: boolean; email: boolean; push: boolean }
export type NotificationPrefs = Record<string, KindPrefs>;

/** Kinds that apply to this role (everyone gets the ones without `roles`) */
export function kindsFor(role: string) {
  return NOTIFICATION_KINDS.filter(k => !('roles' in k) || (k.roles as readonly string[]).includes(role));
}

/** Stored prefs merged over the defaults (everything on, except emails a kind doesn't offer). */
export function resolvePrefs(stored: unknown): NotificationPrefs {
  const raw = (stored && typeof stored === 'object' ? stored : {}) as Record<string, any>;
  return Object.fromEntries(NOTIFICATION_KINDS.map(k => [k.key, {
    inApp: raw[k.key]?.inApp !== false,
    email: ('emailAlways' in k && k.emailAlways) || (k.email && raw[k.key]?.email !== false),
    push: raw[k.key]?.push !== false,
  }]));
}

/** Quiet hours and a pause, for phone alerts. Times are HH:MM in the user's timezone. */
export interface QuietPrefs { on: boolean; from: string; to: string; pausedUntil: string | null }
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function resolveQuiet(stored: unknown): QuietPrefs {
  const raw = (stored && typeof stored === 'object' ? stored : {}) as Record<string, any>;
  const q = raw._quiet ?? {};
  const until = raw._pausedUntil ? new Date(raw._pausedUntil) : null;
  return {
    on: q.on === true,
    from: HHMM.test(q.from) ? q.from : '21:00',
    to: HHMM.test(q.to) ? q.to : '06:00',
    pausedUntil: until && !isNaN(+until) && +until > Date.now() ? until.toISOString() : null,
  };
}

/** Whether phone alerts should wait right now: paused, or inside quiet hours in their timezone */
export function isQuietNow(stored: unknown, timezone: string | null | undefined, now = new Date()): boolean {
  const q = resolveQuiet(stored);
  if (q.pausedUntil) return true;
  if (!q.on) return false;
  let hm: string;
  try { hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: timezone || 'Africa/Douala' }).format(now); }
  catch { hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Africa/Douala' }).format(now); }
  // Overnight windows (21:00 → 06:00) wrap past midnight
  return q.from <= q.to ? hm >= q.from && hm < q.to : hm >= q.from || hm < q.to;
}

export const DISPLAY_DEFAULTS = { language: 'en', textSize: 'normal', dataSaver: false, autoplay: true, downloadOnWifi: true };
export type DisplayPrefs = typeof DISPLAY_DEFAULTS;

export function resolveDisplay(stored: unknown): DisplayPrefs {
  const raw = (stored && typeof stored === 'object' ? stored : {}) as Record<string, any>;
  return {
    language: ['en', 'fr'].includes(raw.language) ? raw.language : 'en',
    textSize: ['small', 'normal', 'large'].includes(raw.textSize) ? raw.textSize : 'normal',
    dataSaver: raw.dataSaver === true,
    autoplay: raw.autoplay !== false,
    downloadOnWifi: raw.downloadOnWifi !== false,
  };
}
