/* ═══════════════════════════════════════
   UPG v10 — SERVICE WORKER
   Fixed: cache name updated to v10 (was stuck at upg-v6)
   Fixed: complete file list including all CSS and JS files
   Fixed: old cache cleanup on activate
   Strategy: cache-first for assets, network-first for HTML
   Fixed (this patch): CACHE_NAME bumped to v10.1 — the v10 cache had
     been serving a stale calendar.js/goals.js (with the duplicate
     Mood declaration bug) and stale auth.js/index.html this ENTIRE
     session, because cache-first + an unchanged CACHE_NAME meant
     every rebuilt zip since was silently ignored by the browser.
   Added: localhost is now ALWAYS network-first, no caching at all —
     this is a dev environment; caching here has no upside and every
     bug like the one above is a direct result of it.
   Added: session-manager.js and firebase-init.js to the asset list
     (new files from the auth rebuild that were missing from this list).
   Fixed (this patch): session-manager.js was replaced by three focused
     modules (email-auth.js, guest-session.js, data-sync.js) — updated
     the asset list to match, and bumped CACHE_NAME again since the
     file list changed.
═══════════════════════════════════════ */
const CACHE_NAME = 'upg-v10.2';

const ASSETS = [
  './',
  './index.html',
  './manifest.json',
  './css/tokens.css',
  './css/setup.css',
  './css/layout.css',
  './css/features.css',
  './js/core/storage.js',
  './js/core/state.js',
  './js/core/timezone.js',
  './js/core/email-auth.js',
  './js/core/guest-session.js',
  './js/core/data-sync.js',
  './js/core/firebase-init.js',
  './js/features/auth.js',
  './js/features/goals.js',
  './js/features/badges.js',
  './js/features/calendar.js',
  './js/features/widget.js',
  './js/features/ai-coach.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
];

// ── INSTALL: pre-cache all assets ──
self.addEventListener('install', event => {
  self.skipWaiting(); // activate immediately
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS)).catch(err => {
      console.warn('[SW] Pre-cache failed (some assets may be missing):', err);
    })
  );
});

// ── ACTIVATE: clean up old caches ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => {
          console.log('[SW] Deleting old cache:', k);
          return caches.delete(k);
        })
      )
    ).then(() => self.clients.claim())
  );
});

// ── FETCH: network-first for HTML, cache-first for everything else ──
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Always go to network for API calls
  if (url.hostname === 'api.anthropic.com') return;
  if (url.hostname !== self.location.hostname) return;

  // DEV BYPASS: on localhost, never cache anything. This is a dev
  // environment — caching here only causes stale-bundle bugs (see
  // header comment) and buys nothing, since there's no offline-network
  // scenario worth optimizing for during active development.
  const isLocalDev = ['localhost', '127.0.0.1'].includes(url.hostname);
  if (isLocalDev) {
    event.respondWith(fetch(event.request));
    return;
  }

  if (event.request.mode === 'navigate' || event.request.headers.get('accept')?.includes('text/html')) {
    // Network-first for navigation (ensures app updates are picked up)
    event.respondWith(
      fetch(event.request)
        .then(res => {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
          return res;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Cache-first for all other assets
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(res => {
        if (res.ok) {
          const clone = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(event.request, clone));
        }
        return res;
      }).catch(() => cached);
    })
  );
});
