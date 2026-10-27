export type ParsedVideo =
  | { kind: 'youtube'; id: string; embedUrl: string }
  | { kind: 'vimeo'; id: string; embedUrl: string }
  | { kind: 'file'; src: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

/**
 * Turn any supported video link into something a player can use.
 * Handles youtube.com/watch, youtu.be, /shorts/, /embed/, /live/, m.youtube.com,
 * vimeo.com/ID, vimeo.com/channels/x/ID, player.vimeo.com/video/ID, and direct
 * http(s) video files. Returns null for anything else.
 */
export function parseVideoUrl(raw: string | null | undefined): ParsedVideo | null {
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;

  const host = url.hostname.replace(/^(www\.|m\.)/, '');
  const parts = url.pathname.split('/').filter(Boolean);

  if (host === 'youtube.com' || host === 'youtube-nocookie.com' || host === 'youtu.be') {
    let id: string | null = null;
    if (host === 'youtu.be') id = parts[0] ?? null;
    else if (parts[0] === 'watch') id = url.searchParams.get('v');
    else if (['shorts', 'embed', 'live', 'v'].includes(parts[0] ?? '')) id = parts[1] ?? null;
    if (!id || !YT_ID.test(id)) return null;
    return { kind: 'youtube', id, embedUrl: `https://www.youtube-nocookie.com/embed/${id}?rel=0` };
  }

  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const id = [...parts].reverse().find(p => /^\d+$/.test(p));
    if (!id) return null;
    // Unlisted Vimeo links carry a privacy hash: vimeo.com/123/abcdef or ?h=abcdef
    const after = parts[parts.indexOf(id) + 1];
    const hash = url.searchParams.get('h') ?? (after && /^[0-9a-f]+$/i.test(after) ? after : null);
    return {
      kind: 'vimeo',
      id,
      embedUrl: `https://player.vimeo.com/video/${id}${hash ? `?h=${hash}` : ''}`,
    };
  }

  return { kind: 'file', src: url.toString() };
}
