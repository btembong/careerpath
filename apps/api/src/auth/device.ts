/** phone, tablet or computer, from the browser's user agent */
export function deviceOf(ua: string | undefined): string {
  const s = ua ?? '';
  if (/iPad|Tablet|Nexus (7|9|10)|SM-T|Kindle|Silk/i.test(s) || (/Android/i.test(s) && !/Mobile/i.test(s))) return 'tablet';
  if (/Mobi|iPhone|iPod|Android|Opera Mini|IEMobile/i.test(s)) return 'phone';
  return 'computer';
}
