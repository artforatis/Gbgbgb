// Offline cache for the Haram Guide website.
const SHELL = "hg-shell-v6";
const DATA = "hg-data-v6";
const SHELL_FILES = [
  "./", "index.html", "manifest.webmanifest", "icon-192.png", "icon-512.png", "translit.js",
  "hateem.js", "places.js", "seerah-1.js", "seerah-2.js", "seerah-3.js",
  "duas.js", "sunnah.js", "tawaf.js", "haram3d.js", "guide3d.js", "umrah.js", "hajj.js", "madinah.js", "madinah-places.js", "vendor/three/three.min.js", "data/walk.json", "data/photos.json",
  "vendor/leaflet/leaflet.js", "vendor/leaflet/leaflet.css", "vendor/fonts/fonts.css", "data/osm.json", "data/osm-madinah.json", "data/walk-madinah.json"
];

self.addEventListener("install", e => {
  // add files one by one so a missing file does not stop the rest
  e.waitUntil(caches.open(SHELL).then(c => Promise.all(SHELL_FILES.map(f => c.add(f).catch(() => null)))).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== SHELL && k !== DATA && k !== "hg-tiles").map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  const live = /router\.project-osrm\.org|valhalla1\.openstreetmap\.de|api\.quran\.com|alharamain\.gov\.sa|youtube\.com/.test(url.hostname);
  if (live) return;

  if (url.origin === location.origin) {
    const isData = url.pathname.includes("/data/quran/") || url.pathname.includes("/data/img/") || url.pathname.includes("/vendor/fonts/");
    if (isData) {
      // Quran files and fonts rarely change: cache first
      e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(DATA).then(c => c.put(req, copy)); }
        return res;
      })));
      return;
    }
    // pages and content: network first so updates arrive, cache when offline
    e.respondWith(
      fetch(req).then(res => {
        if (res.ok) { const copy = res.clone(); caches.open(SHELL).then(c => c.put(req, copy)); }
        return res;
      }).catch(() => caches.match(req, { ignoreSearch:true }).then(r => r || caches.match("index.html")))
    );
    return;
  }

  // fonts, map library, online Quran fallback: cache first
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(res => {
      if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(DATA).then(c => c.put(req, copy)); }
      return res;
    }))
  );
});
