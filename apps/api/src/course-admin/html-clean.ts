/**
 * Makes lesson HTML from WordPress safe to show in the portal. Every tag is rebuilt from an
 * allowlist with only safe attributes, so nothing from the source is passed through as-is:
 * scripts, styles, forms, event handlers and javascript: links can't survive.
 */
const KEEP = new Set([
  'p', 'br', 'h2', 'h3', 'h4', 'h5', 'h6', 'strong', 'b', 'em', 'i', 'u', 's', 'sub', 'sup', 'small', 'mark',
  'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'hr', 'span', 'div', 'figure', 'figcaption',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'a', 'img', 'iframe',
]);
const VOID = new Set(['br', 'hr', 'img']);
/** Dropped together with everything inside them */
const DROP_WITH_CONTENT = new Set(['script', 'style', 'noscript', 'template', 'object', 'embed', 'form', 'select', 'textarea', 'button', 'svg', 'math', 'head', 'title']);
const RENAME: Record<string, string> = { h1: 'h2' };
const ATTRS: Record<string, string[]> = {
  a: ['href', 'title'], img: ['src', 'alt', 'title', 'width', 'height'],
  td: ['colspan', 'rowspan'], th: ['colspan', 'rowspan', 'scope'], ol: ['start'],
  iframe: ['src', 'title'],
};
const VIDEO_HOST = /^https:\/\/(www\.)?(youtube\.com|youtube-nocookie\.com|player\.vimeo\.com)\//i;

const esc = (s: string) => s.replace(/&(?!(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);)/gi, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const attrEsc = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const decode = (s: string) => s.replace(/&quot;/g, '"').replace(/&#0*39;|&apos;/g, "'").replace(/&amp;/g, '&');

function safeUrl(raw: string, kind: 'link' | 'image' | 'frame'): string | null {
  const url = decode(raw).trim().replace(/[\u0000-\u001F\s]+/g, (m) => (m.includes(' ') ? '%20' : ''));
  if (kind === 'frame') return VIDEO_HOST.test(url) ? url : null;
  if (/^https?:\/\//i.test(url)) return url;
  if (kind === 'link' && (/^mailto:/i.test(url) || url.startsWith('#'))) return url;
  return null;
}

function parseAttrs(src: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of src.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    out[m[1].toLowerCase()] = m[2] ?? m[3] ?? m[4] ?? '';
  }
  return out;
}

export function cleanHtml(input: string | null | undefined): string {
  if (!input) return '';
  const html = String(input).replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<!doctype[^>]*>/gi, '');
  let out = '';
  let dropping: string | null = null;
  let depth = 0;
  const open: string[] = [];
  // A tag name must follow "<" directly, so maths like "a < b" stays text
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)((?:\s[^>]*)?\/?)>/g;
  let last = 0;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    const text = html.slice(last, m.index);
    last = re.lastIndex;
    const closing = m[1] === '/';
    const tag = m[2].toLowerCase();
    if (dropping) {
      if (tag === dropping) depth += closing ? -1 : 1;
      if (depth === 0) dropping = null;
      continue;
    }
    out += esc(text);
    if (DROP_WITH_CONTENT.has(tag)) {
      if (!closing && !/\/\s*$/.test(m[3])) { dropping = tag; depth = 1; }
      continue;
    }
    const name = RENAME[tag] ?? tag;
    if (!KEEP.has(name)) continue;
    if (closing) {
      const i = open.lastIndexOf(name);
      if (i === -1) continue;
      // Close anything left open inside it, so the output stays well-formed
      while (open.length > i) out += `</${open.pop()}>`;
      continue;
    }
    const attrs = parseAttrs(m[3]);
    const kept: string[] = [];
    for (const a of ATTRS[name] ?? []) {
      const v = attrs[a];
      if (v == null) continue;
      if (a === 'href') { const u = safeUrl(v, 'link'); if (u) kept.push(`href="${attrEsc(u)}"`); continue; }
      if (a === 'src') { const u = safeUrl(v, name === 'iframe' ? 'frame' : 'image'); if (u) kept.push(`src="${attrEsc(u)}"`); continue; }
      if (['width', 'height', 'colspan', 'rowspan', 'start'].includes(a)) { if (/^\d{1,4}$/.test(v)) kept.push(`${a}="${v}"`); continue; }
      kept.push(`${a}="${attrEsc(decode(v)).slice(0, 300)}"`);
    }
    if ((name === 'img' || name === 'iframe') && !kept.some(k => k.startsWith('src='))) continue;
    if (name === 'a' && kept.some(k => /^href="https?:/.test(k))) kept.push('target="_blank"', 'rel="noopener noreferrer"');
    if (name === 'iframe') kept.push('allowfullscreen', 'loading="lazy"');
    if (name === 'img') kept.push('loading="lazy"');
    out += `<${name}${kept.length ? ' ' + kept.join(' ') : ''}>`;
    if (name === 'iframe') out += '</iframe>';
    else if (!VOID.has(name)) open.push(name);
  }
  if (!dropping) out += esc(html.slice(last));
  while (open.length) out += `</${open.pop()}>`;
  // Empty paragraphs left by editors
  return out.replace(/<p>(\s|&nbsp;|<br>)*<\/p>/g, '').trim();
}

/** Plain text from HTML, e.g. for question text */
export const htmlToText = (input: string | null | undefined) =>
  decode(String(input ?? '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|li|div|h\d)>/gi, '\n').replace(/<[^>]+>/g, ''))
    .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&[lg]t;/g, m => (m === '&lt;' ? '<' : '>'))
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();

/** The first picture in some HTML, if any */
export const firstImage = (input: string | null | undefined) => {
  const m = String(input ?? '').match(/<img[^>]+src\s*=\s*["']([^"']+)["']/i);
  return m && /^https?:\/\//i.test(m[1]) ? m[1] : null;
};
