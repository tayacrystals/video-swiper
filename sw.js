const SHELL = "swiper-shell-v2";
const MEDIA = "swiper-media-v2";

const PRECACHE = ["./", "./manifest.webmanifest", "./seed.zip"];

self.addEventListener("install", e => {
	e.waitUntil(
		caches
			.open(SHELL)
			.then(c => c.addAll(PRECACHE))
			.then(() => self.skipWaiting())
	);
});

self.addEventListener("activate", e => {
	e.waitUntil(
		caches
			.keys()
			.then(keys =>
				Promise.all(
					keys.filter(k => ![SHELL, MEDIA].includes(k)).map(k => caches.delete(k))
				)
			)
			.then(() => self.clients.claim())
	);
});

self.addEventListener("fetch", e => {
	const url = new URL(e.request.url);
	if (e.request.method !== "GET" || url.origin !== location.origin) return;
	if (e.request.headers.has("range")) return; // let browsers stream video directly

	// immutable assets & the seed pack: cache-first
	if (url.pathname.includes("/assets/") || url.pathname.endsWith("/seed.zip")) {
		e.respondWith(
			caches.open(MEDIA).then(async cache => {
				const hit = await cache.match(e.request, { ignoreVary: true });
				if (hit) return hit;
				const res = await fetch(e.request);
				if (res.ok) cache.put(e.request, res.clone());
				return res;
			})
		);
		return;
	}

	// shell: network-first, fall back to cache offline
	e.respondWith(
		fetch(e.request)
			.then(res => {
				if (res.ok) {
					const clone = res.clone();
					caches.open(SHELL).then(c => c.put(e.request, clone));
				}
				return res;
			})
			.catch(() => caches.match(e.request, { ignoreVary: true }))
	);
});
