const CACHE_NAME = "airline-tycoon-v113";
const PRECACHE_URLS = [
  "/",
  "/offline.html",
  "/manifest.json",
  "/aircraft-icons/regional.png",
  "/aircraft-icons/narrow-body-twin.png",
  "/aircraft-icons/wide-body-twin.png",
  "/aircraft-icons/wide-body-quad.png",
  "/aircraft-icons/twin.png",
  "/aircraft-side/a220-300.png",
  "/aircraft-side/a320neo.png",
  "/aircraft-side/a321neo.png",
  "/aircraft-side/a330-900neo.png",
  "/aircraft-side/a350-900.png",
  "/aircraft-side/a350-1000.jpg",
  "/aircraft-side/b737max8.jpg",
  "/aircraft-side/b737max9.png",
  "/aircraft-side/b777-300er.png",
  "/aircraft-side/b777-9.jpg",
  "/aircraft-side/b787-8.jpg",
  "/aircraft-side/b787-9.jpg",
  "/aircraft-side/b787-10.jpg",
  "/aircraft/a220-300.jpg",
  "/aircraft/a320neo.jpg",
  "/aircraft/a321neo.jpeg",
  "/aircraft/a330-900neo.jpg",
  "/aircraft/a350-900.png",
  "/aircraft/a350-1000.jpg"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => Promise.allSettled(PRECACHE_URLS.map((url) => cache.add(url))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, "/offline.html"));
    return;
  }

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/aircraft") || url.pathname.startsWith("/manifest")) {
    event.respondWith(cacheFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request, fallbackUrl) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch {
    return (await cache.match(request)) || (await cache.match("/")) || (await cache.match(fallbackUrl));
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  cache.put(request, response.clone());
  return response;
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      cache.put(request, response.clone());
      return response;
    })
    .catch(() => cached);
  return cached || network;
}
