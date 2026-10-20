// Service worker: makes the site installable and usable offline.
// League data and pages: network first (always fresh when online), cached copy when offline.
// Built assets have hashed names, so they're served from cache once fetched.
const CACHE = 'pgkl-v1'

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icons/icon-192.png'])))
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()))
})

self.addEventListener('fetch', (e) => {
  const req = e.request
  const url = new URL(req.url)
  if (req.method !== 'GET' || url.origin !== location.origin) return // Sleeper API, fonts: straight to network
  const hashed = url.pathname.includes('/assets/')
  if (hashed) {
    e.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); return res })))
    return
  }
  e.respondWith(
    fetch(req)
      .then((res) => { if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)) } return res })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  )
})
