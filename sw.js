// ─────────────────────────────────────────────────────────────
//  PunchCard Service Worker — offline-first, Safari compatible
//  Bump CACHE_VERSION on every deploy to force clients to update.
// ─────────────────────────────────────────────────────────────

const CACHE_VERSION = "1.5.0";
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

const OFFLINE_HTML = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>PunchCard - Offline</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      background: #18160f; color: #f0ead8;
      font-family: 'Courier New', monospace;
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; text-align: center; padding: 40px 24px;
    }
    .wrap { max-width: 320px; }
    .logo { color: #d4b84a; font-size: 22px; letter-spacing: 4px; margin-bottom: 32px; }
    .icon { font-size: 48px; margin-bottom: 20px; }
    h2 { color: #d4b84a; font-size: 18px; letter-spacing: 2px; margin-bottom: 12px; }
    p { color: #8a7840; font-size: 13px; line-height: 1.6; }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="logo">PUNCHCARD</div>
    <div class="icon">✈️</div>
    <h2>YOU ARE OFFLINE</h2>
    <p>Open the app once while connected to Wi-Fi or cellular to enable offline access.</p>
  </div>
</body>
</html>`;

// ── Install: pre-cache everything ────────────────────────────
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async cache => {
      await Promise.allSettled(
        LOCAL_ASSETS.map(url =>
          cache.add(url).catch(err => console.warn(`[SW] local cache miss: ${url}`, err))
        )
      );
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

// ── Fetch: cache-first, Safari-safe ──────────────────────────
self.addEventListener("fetch", event => {
  if (event.request.method !== "GET") return;

  const url = new URL(event.request.url);
  const isSameOrigin = url.origin === self.location.origin;
  const isCDN = CDN_ASSETS.some(u => event.request.url.startsWith(u.split("?")[0]));

  event.respondWith(
    caches.match(event.request).then(cached => {

      // Cache hit — serve immediately, revalidate in background (same-origin only)
      if (cached) {
        if (isSameOrigin) {
          fetch(event.request)
            .then(res => {
              if (res && res.ok) caches.open(CACHE_NAME).then(c => c.put(event.request, res));
            })
            .catch(() => {});
        }
        return cached;
      }

      // Cache miss — same-origin assets
      if (isSameOrigin) {
        return fetch(event.request)
          .then(res => {
            if (res && res.ok) {
              caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
            }
            return res;
          })
          .catch(() => {
            if (event.request.mode === "navigate") {
              return caches.match("/index.html").then(r => r ||
                new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } })
              );
            }
            return new Response("Offline", { status: 503 });
          });
      }

      // Cache miss — CDN assets
      if (isCDN) {
        return fetch(event.request, { mode: "no-cors" })
          .then(res => {
            if (res) caches.open(CACHE_NAME).then(c => c.put(event.request, res.clone()));
            return res;
          })
          .catch(() => new Response("Offline", { status: 503 }));
      }

      // Everything else
      return fetch(event.request).catch(() => new Response("Offline", { status: 503 }));
    })
  );
});

// ── Message: skipWaiting from app ────────────────────────────
self.addEventListener("message", event => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});
