// FlashGyan service worker: makes repeat visits faster and shows a friendly
// page when offline. Pages always come from the network first, so a new
// deploy is picked up on the next visit; only built files (whose names change
// with every build), icons and fonts are served from the cache. Admin pages,
// sign-in, server functions and APIs are never cached.
const VERSION = "v2";
const STATIC = `fg-static-${VERSION}`;
const RUNTIME = `fg-runtime-${VERSION}`;
// The students' atlas pages, kept so the atlas opens offline (its data is
// kept by the page itself).
const PAGES = `fg-atlas-pages-${VERSION}`;
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/icons/icon-192x192.png", "/favicon-96x96.png"];
const MAX_RUNTIME_ENTRIES = 250;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(STATIC)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== STATIC && k !== RUNTIME && k !== PAGES)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

const NEVER_CACHE = /^\/(_serverFn|api|admin|auth)(\/|$|\?)/;

async function trim(cache) {
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - MAX_RUNTIME_ENTRIES; i++) await cache.delete(keys[i]);
}

async function cacheFirst(request) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) {
    await cache.put(request, res.clone());
    void trim(cache);
  }
  return res;
}

async function staleWhileRevalidate(event, request) {
  const cache = await caches.open(RUNTIME);
  const hit = await cache.match(request);
  const update = fetch(request)
    .then(async (res) => {
      if (res.ok || res.type === "opaque") await cache.put(request, res.clone());
      return res;
    })
    .catch(() => hit);
  if (hit) {
    event.waitUntil(update);
    return hit;
  }
  return update;
}

// Network first, kept for later; offline: the page kept, or the atlas's
// home page (the app shell opens any atlas page), or the offline page.
async function atlasPage(request, url) {
  const cache = await caches.open(PAGES);
  try {
    const res = await fetch(request);
    if (res.ok && (res.headers.get("content-type") ?? "").includes("text/html"))
      await cache.put(url.pathname, res.clone());
    return res;
  } catch {
    return (
      (await cache.match(url.pathname)) ??
      (await cache.match("/atlas")) ??
      (await caches.match(OFFLINE_URL)) ??
      Response.error()
    );
  }
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    // Pages (admin included) come from the network; the offline page is only
    // a fallback and nothing from them is stored.
    if (request.mode === "navigate" && /^\/atlas(\/|$)/.test(url.pathname)) {
      event.respondWith(atlasPage(request, url));
      return;
    }
    // The atlas's pages fetched to keep them ("Save for offline").
    if (/^\/atlas(\/|$)/.test(url.pathname) && request.destination === "") {
      event.respondWith(atlasPage(request, url));
      return;
    }
    if (request.mode === "navigate") {
      event.respondWith(
        fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) ?? Response.error()),
      );
      return;
    }
    if (NEVER_CACHE.test(url.pathname)) return;
    if (url.pathname.startsWith("/assets/")) {
      event.respondWith(cacheFirst(request));
      return;
    }
    if (/^\/(icons\/|favicon|manifest\.json|admin-manifest\.json)/.test(url.pathname)) {
      event.respondWith(staleWhileRevalidate(event, request));
    }
    return;
  }

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    event.respondWith(staleWhileRevalidate(event, request));
  }
});
