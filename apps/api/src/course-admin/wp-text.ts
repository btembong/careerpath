/** Turning WordPress titles and content into plain text, and comparing names loosely. */

const NAMED: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…',
  rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è', ecirc: 'ê', agrave: 'à', ccedil: 'ç', copy: '©', reg: '®', trade: '™',
};

export function decodeEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED[n.toLowerCase()] ?? m);
}

export const cleanTitle = (raw: string) => decodeEntities(String(raw ?? '').replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim() || 'Untitled';

/** Same rule the old sync used for descriptions (first 500 characters of the text), so unchanged courses compare equal */
export const cleanDescription = (raw: string) => {
  const text = decodeEntities(String(raw ?? '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  return text.slice(0, 500) || null;
};

/** For matching names: lower case, letters and digits only ("GCE O'Level" = "gce o level" = "GCE O Level") */
export const norm = (s: string | null | undefined) => decodeEntities(String(s ?? '')).toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Looks like a placeholder rather than a real course */
export const looksLikeJunk = (title: string) => /\b(test|testing|ignore|sample|dummy|demo|copy of|untitled|draft)\b/i.test(title);
