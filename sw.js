const CACHE_NAME = "patriodx-v4";

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

/* =========================================================
   INSTALL
========================================================= */

self.addEventListener("install", event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(async cache => {
                await Promise.all(
                    APP_FILES.map(async file => {
                        try {
                            const url = new URL(
                                file,
                                self.registration.scope
                            );

                            const response = await fetch(url, {
                                cache: "reload"
                            });

                            if (response.ok) {
                                await cache.put(url, response);
                            }
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

/* =========================================================
   ACTIVATE — REMOVE OLD CACHES
========================================================= */

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys()
            .then(keys =>
                Promise.all(
                    keys
                        .filter(key =>
                            key.startsWith("patriodx-") &&
                            key !== CACHE_NAME
                        )
                        .map(key => caches.delete(key))
                )
            )
            .then(() => self.clients.claim())
    );
});

/* =========================================================
   FETCH — NETWORK FIRST
========================================================= */

self.addEventListener("fetch", event => {
    const request = event.request;

    if (request.method !== "GET") return;

    const url = new URL(request.url);

    // Never cache Supabase requests.
    if (url.hostname === SUPABASE_HOST) return;

    // Never cache private API responses.
    if (
        url.origin === self.location.origin &&
        url.pathname.startsWith("/api/")
    ) {
        return;
    }

    // External scripts, styles and fonts: network first.
    if (url.origin !== self.location.origin) {

        if (
            request.destination === "script" ||
            request.destination === "style" ||
            request.destination === "font"
        ) {
            event.respondWith(
                fetch(request, { cache: "no-cache" })
                    .then(response => {
                        if (
                            response.ok ||
                            response.type === "opaque"
                        ) {
                            const copy = response.clone();

                            caches.open(CACHE_NAME)
                                .then(cache =>
                                    cache.put(request, copy)
                                );
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

        return;
    }

    // All same-origin requests: network first.
    event.respondWith(
        fetch(request, { cache: "no-cache" })
            .then(response => {
                if (response.ok) {
                    const copy = response.clone();

                    caches.open(CACHE_NAME)
                        .then(cache =>
                            cache.put(request, copy)
                        );
                }

                return response;
            })
            .catch(async () => {
                return (
                    await caches.match(request) ||
                    (
                        request.mode === "navigate"
                            ? await caches.match("./index.html")
                            : null
                    ) ||
                    Response.error()
                );
            })
    );
});