// ─────────────────────────────────────────────────────────────
//  PunchCard Service Worker  v1.1.9
//  Deploy this file as sw.js alongside index.html.
//  To push an update: bump CACHE_VERSION and redeploy.
// ─────────────────────────────────────────────────────────────

const CACHE_VERSION = "1.2.1";
const CACHE_NAME    = `punchcard-${CACHE_VERSION}`;

// Only cache files you know exist on the server.
// Do NOT include manifest.json unless you have actually created that file —
// cache.add() will throw on a 404, which would have silently prevented the
// entire app from being cached for offline use.
const PRECACHE_ASSETS = [
  "/",
  "/index.html",
];

// ── Install: pre-cache core assets ───────────────────────────
// Uses Promise.allSettled so a single failed asset never blocks
// the rest of the cache from being populated.
self.addEventListener("install", event => {
  console.log(`[SW] Installing v${CACHE_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache =>
        Promise.allSettled(
          PRECACHE_ASSETS.map(url =>
            cache.add(url).catch(err =>
              console.warn(`[SW] Could not pre-cache ${url}:`, err)
            )
          )
        )
      )
      .then(() => {
        console.log(`[SW] Pre-cache complete`);
        // Take control of all open tabs immediately — no need for the user
        // to close and reopen the app to get the new version.
        return self.skipWaiting();
      })
  );
});

// ── Activate: clean up stale caches ──────────────────────────
self.addEventListener("activate", event => {
  console.log(`[SW] Activating v${CACHE_VERSION}`);
  event.waitUntil(
    caches.keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith("punchcard-") && key !== CACHE_NAME)
            .map(key => {
              console.log(`[SW] Removing old cache: ${key}`);
              return caches.delete(key);
            })
        )
      )
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first, network fallback ─────────────────────
// Serves the cached version instantly when offline.
// Any successful network response is saved to the cache so the
// app stays up-to-date when the user IS online.
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Serve from cache immediately, then refresh in the background
        const networkRefresh = fetch(event.request)
          .then(response => {
            if (response && response.status === 200 && response.type !== "opaque") {
              caches.open(CACHE_NAME).then(cache =>
                cache.put(event.request, response.clone())
              );
            }
            return response;
          })
          .catch(() => {});
        // Return the cached version right away — don't wait for network
        return cached;
      }

      // Not in cache — try network, cache the result
      return fetch(event.request)
        .then(response => {
          if (!response || response.status !== 200 || response.type === "opaque") {
            return response;
          }
          const toCache = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, toCache));
          return response;
        })
        .catch(() => {
          // Fully offline and not cached — return index.html for navigation
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
        });
    })
  );
});

// ── Message: manual update trigger from the app UI ───────────
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") {
    console.log("[SW] skipWaiting triggered by app");
    self.skipWaiting();
  }
});
