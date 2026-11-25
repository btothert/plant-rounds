/* Water Plant Rounds - offline support.
   Keeps a copy of the app on the iPad so it opens with no Wi-Fi.
   When online, it checks for a newer version first (up to 3 seconds), then falls back to the saved copy.
   Change VERSION whenever you upload a new index.html, so old copies are cleaned up. */
const VERSION = "rounds-v14";
const APP_FILES = ["./", "./index.html", "./manifest.webmanifest", "./icon-180.png", "./icon-192.png", "./icon-512.png"];
const QR_READER = [
  "https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js",
];

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(APP_FILES);
    // The QR reader is saved too, but the app still installs if it can't be reached right now.
    for (const url of QR_READER) {
      try { const r = await fetch(url, {mode: "cors"}); if (r.ok) { await cache.put(url, r); break; } } catch (e) {}
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

function timeout(ms) { return new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms)); }

self.addEventListener("fetch", event => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // The app page: try the network for updates, fall back to the saved copy when offline or slow.
  if (req.mode === "navigate" || (url.origin === location.origin && url.pathname.endsWith("/index.html"))) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      try {
        const fresh = await Promise.race([fetch(req), timeout(3000)]);
        if (fresh && fresh.ok) { await cache.put("./index.html", fresh.clone()); return fresh; }
        throw new Error("bad response");
      } catch (e) {
        return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
      }
    })());
    return;
  }

  // Everything else we know about (icons, manifest, QR reader): saved copy first, then network.
  if (url.origin === location.origin || QR_READER.includes(req.url)) {
    event.respondWith((async () => {
      const cache = await caches.open(VERSION);
      const hit = await cache.match(req.url);
      if (hit) return hit;
      try {
        const r = await fetch(req);
        if (r.ok || r.type === "opaque") await cache.put(req.url, r.clone());
        return r;
      } catch (e) { return Response.error(); }
    })());
  }
});
