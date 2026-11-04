/** Calendar entries for live classes: an .ics file (Outlook, Apple, phones) and a Google Calendar link. */
export interface ClassEvent { uid: string; title: string; description?: string | null; start: Date; minutes: number; weeks?: number; link: string }

const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
// Calendar text escapes backslash, semicolon, comma and line breaks
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');

export function classIcs(e: ClassEvent): string {
  const end = new Date(e.start.getTime() + e.minutes * 60_000);
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CareerPath Africa//Live classes//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT', `UID:${e.uid}@careerpathafrica.com`, `DTSTAMP:${stamp(new Date())}`, `DTSTART:${stamp(e.start)}`, `DTEND:${stamp(end)}`,
    ...((e.weeks ?? 1) > 1 ? [`RRULE:FREQ=WEEKLY;COUNT=${e.weeks}`] : []),
    `SUMMARY:${esc(`Live class: ${e.title}`)}`, `DESCRIPTION:${esc(`${e.description ? e.description + '\n\n' : ''}Join: ${e.link}`)}`, `URL:${e.link}`,
    'BEGIN:VALARM', 'TRIGGER:-PT30M', 'ACTION:DISPLAY', 'DESCRIPTION:Live class in 30 minutes', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
}

export function googleCalendarLink(e: ClassEvent): string {
  const end = new Date(e.start.getTime() + e.minutes * 60_000);
  const q = new URLSearchParams({
    action: 'TEMPLATE', text: `Live class: ${e.title}`, dates: `${stamp(e.start)}/${stamp(end)}`,
    details: `${e.description ? e.description + '\n\n' : ''}Join: ${e.link}`,
    ...((e.weeks ?? 1) > 1 ? { recur: `RRULE:FREQ=WEEKLY;COUNT=${e.weeks}` } : {}),
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}
