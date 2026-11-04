/* Media on Wheels (bikeads) service worker: keeps the app files on the phone so the driver app opens
 * and works with no signal. App files: network first, saved copy when offline.
 * Map tiles: saved as they are seen, so the streets already viewed still show offline. */
const CACHE = 'bikeads-v8';
const APP = ["./", "index.html", "styles.css", "deliver.css", "theme.css", "light.css", "fonts/dm-serif-display-latin-400-normal.woff2", "fonts/dm-serif-display-latin-ext-400-normal.woff2", "fonts/plus-jakarta-sans-latin-wght-normal.woff2", "fonts/plus-jakarta-sans-latin-ext-wght-normal.woff2", "fonts/heebo-hebrew-wght-normal.woff2", "vendor/hebcal/hebcal.min.js", "js/jcal.js", "js/williamsburg-streets.js", "js/bikeride.js", "favicon.svg", "manifest.webmanifest", "vendor/leaflet/leaflet.css", "vendor/leaflet/leaflet.js", "vendor/qrcode/qrcode.js", "vendor/jsqr/jsQR.js", "js/deliver-core.js", "js/deliver-seed.js", "js/data.js", "js/trackers.js", "js/ui.js", "js/deliver.js", "js/deliver-ui.js", "js/config.js", "js/homevideo.js", "js/home.js", "js/admin.js", "media/hero-poster.jpg", "js/platform.js", "js/client.js", "js/driver.js", "js/store.js", "js/boss.js", "js/app.js", "icons/icon-192.png", "vendor/leaflet/images/marker-icon.png", "vendor/leaflet/images/marker-shadow.png", "vendor/leaflet/images/layers.png"];
self.addEventListener('install', (e) => { e.waitUntil(caches.open(CACHE).then((c) => c.addAll(APP)).then(() => self.skipWaiting())); });
self.addEventListener('activate', (e) => { e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE && k !== 'bikeads-tiles').map((k) => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.hostname.endsWith('tile.openstreetmap.org')) {
    e.respondWith(caches.open('bikeads-tiles').then(async (c) => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone()); return res; } catch (err) { return hit || Response.error(); }
    }));
    return;
  }
  if (url.origin !== location.origin) return;
  if (req.headers.has('range') || /\.(mp4|webm)$/i.test(url.pathname)) return; // videos stream straight from the network
  e.respondWith(fetch(req).then((res) => {
    if (res && res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
    return res;
  }).catch(() => caches.match(req, { ignoreSearch: true }).then((hit) => hit || caches.match('index.html'))));
});
