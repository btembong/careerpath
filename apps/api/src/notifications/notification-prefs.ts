/** What a user can switch on or off in Settings → Notifications. `system` is always delivered in the app. */
export const NOTIFICATION_KINDS = [
  { key: 'live', label: 'Live class reminders', hint: 'Before a class starts, and when one is moved or cancelled', email: true },
  { key: 'assignment', label: 'Assignments and deadlines', hint: 'New work set, and reminders before it is due', email: true },
  { key: 'grade', label: 'Grades and feedback', hint: 'When a teacher grades your work', email: true },
  { key: 'message', label: 'Messages', hint: 'New direct messages', email: true },
  { key: 'community', label: 'Community replies', hint: 'Answers to your questions, and new questions in your courses. Emailed only when you’re not online', email: true },
  { key: 'certificate', label: 'Certificates', hint: 'When you earn one', email: true },
  { key: 'news', label: 'Announcements', hint: 'News and offers from CareerPath Africa', email: true },
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number]['key'];
export type NotificationPrefs = Record<string, { inApp: boolean; email: boolean }>;

/** Stored prefs merged over the defaults (everything on, except emails a kind doesn't offer). */
export function resolvePrefs(stored: unknown): NotificationPrefs {
  const raw = (stored && typeof stored === 'object' ? stored : {}) as Record<string, any>;
  return Object.fromEntries(NOTIFICATION_KINDS.map(k => [k.key, {
    inApp: raw[k.key]?.inApp !== false,
    email: k.email && raw[k.key]?.email !== false,
  }]));
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
