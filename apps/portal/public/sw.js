/**
 * CareerPath Africa — Service Worker
 * Strategy:
 *   - App shell (JS/CSS/fonts) → Cache-first
 *   - Pages (HTML nav requests) → Network-first, fall back to cache, then /offline
 *   - API (/live, /auth, etc.) → Network-only (never cache auth/API)
 *   - Images                  → Stale-while-revalidate
 */

const SHELL_CACHE  = 'cpa-shell-v2';
const PAGES_CACHE  = 'cpa-pages-v2';
const IMAGES_CACHE = 'cpa-images-v2';

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
  // One by one, so a single missing file can't stop the worker installing (and with it, push notifications)
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => Promise.all(PRECACHE_URLS.map(u => cache.add(u).catch(() => null))))
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

// ── Push notifications ───────────────────────────────────────────────────────
// Every notice in the bell reaches people who don't have the portal open, and incoming calls ring here.
self.addEventListener('push', event => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { title: 'CareerPath Africa', body: event.data ? event.data.text() : '' }; }
  const call = d.kind === 'call';
  event.waitUntil(self.registration.showNotification(d.title || 'CareerPath Africa', {
    body: d.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: d.tag || undefined,
    renotify: !!d.tag,
    requireInteraction: !!d.requireInteraction,
    vibrate: call ? [400, 200, 400, 200, 400, 200, 400] : [120],
    data: { url: d.url || '/' },
    actions: call ? [{ action: 'open', title: 'Answer' }] : [],
  }));
});

// Tapping a notification opens that page, reusing an open portal tab if there is one
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const tabs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const tab = tabs.find(t => new URL(t.url).origin === self.location.origin);
    if (tab) { await tab.focus(); return tab.navigate ? tab.navigate(target).catch(() => tab) : tab; }
    return self.clients.openWindow(target);
  })());
});
