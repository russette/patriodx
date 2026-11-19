const CACHE_NAME = "patriodx-v3";

const APP_FILES = [
    "./",
    "./index.html",
    "./style.css",
    "./script.js",
    "./ai.js",
    "./auth.html",
    "./reset-password.html",
    "./marketplace.html",
    "./privacy.html",
    "./terms.html",
    "./manifest.json",
    "./assets/patriodx-logo.jpeg",
    "./assets/patriodx-icon-512.png"
];

const SUPABASE_HOST = "saerujjsfzyxkyacbvgr.supabase.co";

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async cache => {
                await Promise.all(
                    APP_FILES.map(async file => {
                        try {
                            await cache.add(file);
                        } catch (error) {
                            console.warn(
                                "Could not cache:",
                                file,
                                error
                            );
                        }
                    })
                );
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys =>
                Promise.all(
                    keys
                        .filter(key => key.startsWith("patriodx-") &&
                            key !== CACHE_NAME)
                        .map(key => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Never cache Supabase requests or private API responses.
    if (url.hostname === SUPABASE_HOST) return;

    // Navigation: try network first, then use cached page.
    if (request.mode === "navigate") {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response.ok && url.origin === self.location.origin) {
                        const copy = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(request, copy));
                    }

                    return response;
                })
                .catch(async () => {
                    return (
                        await caches.match(request) ||
                        await caches.match("./index.html") ||
                        Response.error()
                    );
                })
        );

        return;
    }

    // Static resources: cache first, then network.
    if (url.origin === self.location.origin) {
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;

                return fetch(request).then(response => {
                    if (response.ok) {
                        const copy = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(request, copy));
                    }

                    return response;
                });
            })
        );

        return;
    }

    // External libraries: network first, cached fallback.
    if (
        request.destination === "script" ||
        request.destination === "style" ||
        request.destination === "font"
    ) {
        event.respondWith(
            fetch(request)
                .then(response => {
                    if (response.ok || response.type === "opaque") {
                        const copy = response.clone();

                        caches.open(CACHE_NAME)
                            .then(cache => cache.put(request, copy));
                    }

                    return response;
                })
                .catch(async () => {
                    return (
                        await caches.match(request) ||
                        Response.error()
                    );
                })
        );
    }
});