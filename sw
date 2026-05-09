// ─────────────────────────────────────────────────────────────
//  PunchCard Service Worker
//  To push an update: bump CACHE_VERSION, redeploy sw.js
//  The app will show an "Update Available" banner automatically.
// ─────────────────────────────────────────────────────────────

const CACHE_VERSION = "1.0.1";
const CACHE_NAME    = `punchcard-${CACHE_VERSION}`;

// Files to pre-cache on install
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
  "/manifest.json",
  // Add your built JS/CSS bundles here after running `npm run build`
  // e.g. "/static/js/main.abc123.js"
];

// ── Install: pre-cache assets ─────────────────────────────────
self.addEventListener("install", event => {
  console.log(`[SW] Installing v${CACHE_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_ASSETS))
      .then(() => {
        console.log(`[SW] Pre-cached ${PRECACHE_ASSETS.length} assets`);
      })
  );
  // Don't skipWaiting automatically — let the app's UI trigger it
});

// ── Activate: clean up old caches ────────────────────────────
self.addEventListener("activate", event => {
  console.log(`[SW] Activating v${CACHE_VERSION}`);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key.startsWith("punchcard-") && key !== CACHE_NAME)
          .map(key => {
            console.log(`[SW] Deleting old cache: ${key}`);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first with network fallback ─────────────────
self.addEventListener("fetch", event => {
  // Skip non-GET and cross-origin requests
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;

      return fetch(event.request).then(response => {
        // Only cache valid same-origin responses
        if (!response || response.status !== 200 || response.type === "opaque") {
          return response;
        }
        const toCache = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
        return response;
      }).catch(() => {
        // Offline fallback — return index.html for navigation requests
        if (event.request.mode === "navigate") {
          return caches.match("/index.html");
        }
      });
    })
  );
});

// ── Message: allow app to trigger update ─────────────────────
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") {
    console.log("[SW] skipWaiting triggered by app");
    self.skipWaiting();
  }
});
