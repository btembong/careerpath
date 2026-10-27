/**
 * CareerPath Africa — Service Worker
 * Strategy:
 *   - App shell (JS/CSS/fonts) → Cache-first
 *   - Pages (HTML nav requests) → Network-first, fall back to cache, then /offline
 *   - API (/live, /auth, etc.) → Network-only (never cache auth/API)
 *   - Images                  → Stale-while-revalidate
 */

const SHELL_CACHE  = 'cpa-shell-v1';
const PAGES_CACHE  = 'cpa-pages-v1';
const IMAGES_CACHE = 'cpa-images-v1';

// Static assets to pre-cache on install
const PRECACHE_URLS = [
  '/',
  '/offline',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// ── Install ──────────────────────────────────────────────────────────────────
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

// ── Activate ─────────────────────────────────────────────────────────────────
self.addEventListener('activate', event => {
  const keep = [SHELL_CACHE, PAGES_CACHE, IMAGES_CACHE];
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => !keep.includes(k)).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// ── Fetch ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin (socket.io, Daily.co, etc.)
  if (request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // API calls — always network-only (never stale auth data)
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/socket.io')) return;

  // _next/static assets — cache-first (immutable with hashes)
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(cacheFirst(request, SHELL_CACHE));
    return;
  }

  // Images — stale-while-revalidate
  if (/\.(png|jpg|jpeg|svg|gif|webp|ico)$/.test(url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, IMAGES_CACHE));
    return;
  }

  // Navigation requests (HTML pages) — network-first
  if (request.mode === 'navigate') {
    event.respondWith(networkFirstNav(request));
    return;
  }
});

// ── Strategies ───────────────────────────────────────────────────────────────

async function cacheFirst(request, cacheName) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) {
    const cache = await caches.open(cacheName);
    cache.put(request, response.clone());
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetchPromise = fetch(request).then(response => {
    if (response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  return cached ?? (await fetchPromise) ?? new Response('', { status: 503 });
}

async function networkFirstNav(request) {
  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(PAGES_CACHE);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    // Offline — try cache
    const cached = await caches.match(request);
    if (cached) return cached;
    // Fall back to offline page
    return caches.match('/offline') ?? new Response(
      '<h1>You are offline</h1><p>Please reconnect to continue learning.</p>',
      { headers: { 'Content-Type': 'text/html' } }
    );
  }
}
