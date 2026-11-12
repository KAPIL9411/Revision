const VERSION = 'vault-v1'
const STATIC_CACHE = `${VERSION}-static`
const PAGE_CACHE = `${VERSION}-pages`

const OFFLINE_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Offline · SSC Revision Vault</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#F8F8F5;color:#202124;
  font:14px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Inter,sans-serif;padding:24px;text-align:center}
  .card{max-width:360px;border:1px solid #E9E9E5;background:#fff;border-radius:12px;padding:24px}
  h1{font-size:16px;margin:0 0 8px}p{margin:0;color:#777}
</style></head><body><div class="card">
<h1>You are offline</h1><p>This page was not cached yet. Your saved questions are still on this device — reopen the vault once you have a connection.</p>
</div></body></html>`

self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys()
      await Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)))
      await self.clients.claim()
    })(),
  )
})

async function cacheFirst(request) {
  const cache = await caches.open(STATIC_CACHE)
  const hit = await cache.match(request)
  if (hit) return hit
  const response = await fetch(request)
  if (response.ok) cache.put(request, response.clone())
  return response
}

async function networkFirst(request) {
  const cache = await caches.open(PAGE_CACHE)
  try {
    const response = await fetch(request)
    if (response.ok) cache.put(request, response.clone())
    return response
  } catch (error) {
    const hit = await cache.match(request)
    if (hit) return hit
    return new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  if (
    url.pathname.startsWith('/_next/static') ||
    url.pathname.startsWith('/brand/') ||
    url.pathname.startsWith('/icon')
  ) {
    event.respondWith(cacheFirst(request))
    return
  }
  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request))
  }
})
