// ─────────────────────────────────────────────────────────────
//  PunchCard Service Worker
//  Bump CACHE_VERSION on every deploy to force clients to update.
// ─────────────────────────────────────────────────────────────

const CACHE_VERSION = "1.4.0";
const CACHE_NAME    = `punchcard-${CACHE_VERSION}`;

// Local assets — always pre-cached on install
const LOCAL_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/sw.js",
];

// CDN assets — pre-cached on install so the app works fully offline
const CDN_ASSETS = [
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Oswald:wght@400;600;700&display=swap",
];

// ── Install: pre-cache everything ────────────────────────────
self.addEventListener("install", event => {
  console.log(`[SW] Installing v${CACHE_VERSION}`);
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache =>
      Promise.allSettled([
        // Local assets — same origin, no CORS issues
        ...LOCAL_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn(`[SW] Could not cache ${url}:`, err))
        ),
        // CDN assets — fetch with no-cors so opaque responses are stored
        ...CDN_ASSETS.map(url =>
          fetch(url, { mode: "no-cors" })
            .then(res => cache.put(url, res))
            .catch(err => console.warn(`[SW] Could not cache CDN ${url}:`, err))
        ),
      ])
    ).then(() => {
      console.log(`[SW] Pre-cache complete`);
      return self.skipWaiting();
    })
  );
});

// ── Activate: delete old caches ──────────────────────────────
self.addEventListener("activate", event => {
  console.log(`[SW] Activating v${CACHE_VERSION}`);
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith("punchcard-") && k !== CACHE_NAME)
          .map(k => { console.log(`[SW] Removing old cache: ${k}`); return caches.delete(k); })
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first for everything ────────────────────────
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        // Serve cache immediately; refresh in background when online
        fetch(event.request, { mode: "no-cors" })
          .then(res => {
            if (res) caches.open(CACHE_NAME).then(c => c.put(event.request, res));
          })
          .catch(() => {});
        return cached;
      }

      // Not cached yet — try network and cache result
      return fetch(event.request, { mode: "no-cors" })
        .then(res => {
          if (res) {
            caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
          }
          return res;
        })
        .catch(() => {
          // Fully offline and not cached — fall back to index.html for navigation
          if (event.request.mode === "navigate") {
            return caches.match("/index.html");
          }
        });
    })
  );
});

// ── Message: manual skipWaiting trigger from app UI ──────────
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") {
    console.log("[SW] skipWaiting triggered by app");
    self.skipWaiting();
  }
});
