const CACHE_NAME = "teslapulse-v2";

// Install: just activate immediately
self.addEventListener("install", () => {
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Fetch: network-first everywhere, cache static assets on success
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests
  if (event.request.method !== "GET") return;

  // Skip API calls — always go to network, no caching
  if (url.pathname.startsWith("/api/")) return;

  // For everything else: network-first with cache fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Cache successful responses for static assets
        if (
          response.ok &&
          (url.pathname.startsWith("/_next/static/") ||
            url.pathname.startsWith("/icons/") ||
            url.pathname === "/manifest.json")
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => {
        // Network failed — try cache
        return caches.match(event.request).then((cached) => {
          if (cached) return cached;
          // Return a basic offline response for navigation
          if (event.request.mode === "navigate") {
            return new Response(
              "<html><body style='background:#0a0a0f;color:#e8e8ed;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh'><div style='text-align:center'><h2>TeslaPulse</h2><p>Offline — check your connection</p></div></body></html>",
              { headers: { "Content-Type": "text/html" } }
            );
          }
          return new Response("", { status: 503 });
        });
      })
  );
});
