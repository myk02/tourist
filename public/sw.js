/*
 * KenyaTrace service worker — deliberately minimal.
 *
 * Its only job is install-shell support: same-origin static assets
 * (Next build chunks, icons, the hero image) are cached network-first so an
 * installed app opens its shell on a weak connection. Everything else —
 * pages, /api/*, Convex, Clerk, map tiles — passes straight through:
 * trip data already has its own offline-lite layer in localStorage.
 */
const VERSION = 'kt-static-v2'

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', event => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('fetch', event => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  // Cross-origin (Convex, Clerk, tiles) and app APIs never touch the cache.
  if (url.origin !== self.location.origin) return
  if (url.pathname.startsWith('/api/')) return
  const cacheable =
    url.pathname.startsWith('/_next/static/') ||
    url.pathname.startsWith('/icons/') ||
    url.pathname === '/kenya-hero.png' ||
    url.pathname === '/placeholder.jpg' ||
    url.pathname === '/apple-icon.png' ||
    url.pathname === '/icon.svg'
  if (cacheable) {
    event.respondWith(
      caches.open(VERSION).then(async cache => {
        const cached = await cache.match(req)
        const network = fetch(req)
          .then(res => {
            if (res && res.ok) cache.put(req, res.clone())
            return res
          })
          .catch(() => cached)
        return cached || network
      }),
    )
    return
  }
  // Offline navigation fallback: when the browser is offline and navigates
  // (e.g. installed app opened with weak signal), try network then serve
  // the cached shell hero so the app at least paints instead of dino.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).catch(async () => {
        const cache = await caches.open(VERSION)
        // Try cached hero as minimal shell paint; else generic offline.
        const fallback = await cache.match('/kenya-hero.png')
        if (fallback) return fallback
        return new Response('You are offline — retry when connected.', {
          status: 503,
          headers: { 'content-type': 'text/plain' },
        })
      }),
    )
  }
})
