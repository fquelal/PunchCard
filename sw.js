// ─────────────────────────────────────────────────────────────
//  PunchCard Service Worker — offline-first, Safari compatible
//  Bump CACHE_VERSION on every deploy to force clients to update.
// ─────────────────────────────────────────────────────────────

const CACHE_VERSION = "1.4.7";
const CACHE_NAME    = `punchcard-${CACHE_VERSION}`;

const LOCAL_ASSETS = [
  "/",
  "/index.html",
  "/style.css",
  "/script.js",
  "/sw.js",
];

const CDN_ASSETS = [
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
  "https://fonts.googleapis.com/css2?family=Courier+Prime:wght@400;700&family=Oswald:wght@400;600;700&display=swap",
];

// ── Install: pre-cache everything ────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      // Local assets — normal fetch, same origin
      await Promise.allSettled(
        LOCAL_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn(`[SW] local cache miss: ${url}`, err))
        )
      );
      // CDN assets — no-cors (opaque responses are fine for CDN reads)
      await Promise.allSettled(
        CDN_ASSETS.map(url =>
          fetch(url, { mode: "no-cors" })
            .then(res => { if (res) cache.put(url, res); })
            .catch(err => console.warn(`[SW] CDN cache miss: ${url}`, err))
        )
      );
    }).then(() => self.skipWaiting())
  );
});

// ── Activate: delete old caches ──────────────────────────────
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(k => k.startsWith("punchcard-") && k !== CACHE_NAME)
          .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// ── Fetch: cache-first, safe for Safari ──────────────────────
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCDN = CDN_ASSETS.some(u => event.request.url.startsWith(u.split("?")[0]));

  event.respondWith(
    caches.match(event.request).then(cached => {

      // ── Cache hit: serve immediately ──────────────────────
      if (cached) {
        // Background revalidate only when online and only for same-origin
        if (isSameOrigin) {
          fetch(event.request)
            .then(res => {
              if (res && res.ok) caches.open(CACHE_NAME).then(c => c.put(event.request, res));
            })
            .catch(() => {});
        }
        return cached;
      }

      // ── Cache miss: try network ───────────────────────────
      if (isSameOrigin) {
        // Same-origin: normal fetch, cache on success
        return fetch(event.request)
          .then(res => {
            if (res && res.ok) {
              caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
            }
            return res;
          })
          .catch(() => {
            // Offline + not cached → serve index.html for navigation requests
            if (event.request.mode === "navigate") {
              return caches.match("/index.html").then(r => r || new Response(
                "<h2>Offline — open the app once while connected to cache it.</h2>",
                { headers: { "Content-Type": "text/html" } }
              ));
            }
            // For non-navigation (scripts, CSS) return empty 503
            return new Response("Offline", { status: 503 });
          });
      }

      if (isCDN) {
        // CDN: no-cors fetch, opaque response is fine for scripts/fonts
        return fetch(event.request, { mode: "no-cors" })
          .then(res => {
            if (res) caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
            return res;
          })
          .catch(() => new Response("Offline", { status: 503 }));
      }

      // Everything else: try network, no caching
      return fetch(event.request).catch(() => new Response("Offline", { status: 503 }));
    })
  );
});

// ── Message: skipWaiting from app ────────────────────────────
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
