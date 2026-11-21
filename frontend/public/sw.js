const APP_CACHE = 'molecore-app'
const DATA_CACHE = 'molecore-data'
const DATA_PATHS = ['/api/pages', '/api/preferences', '/uploads/']

self.addEventListener('install', () => self.skipWaiting())

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)
  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request))
  } else if (DATA_PATHS.some(path => url.pathname.startsWith(path))) {
    event.respondWith(networkFirst(request, DATA_CACHE))
  } else if (!url.pathname.startsWith('/api/')) {
    event.respondWith(networkFirst(request, APP_CACHE))
  }
})

async function handleNavigation(request) {
  let response
  try {
    response = await fetch(request)
  } catch {
    return (await caches.match('/')) || Response.error()
  }

  if (response.status === 200) {
    // fresh index = fresh asset hashes, so the old ones can go
    await caches.delete(APP_CACHE)
    const cache = await caches.open(APP_CACHE)
    await cache.put('/', response.clone())
  }
  return response
}

async function networkFirst(request, cacheName) {
  let response
  try {
    response = await fetch(request)
  } catch {
    return (await caches.match(request, { ignoreVary: true })) || Response.error()
  }

  // only 200s, audio comes as 206 range responses and cache.put hates those
  if (response.status === 200) {
    try {
      const cache = await caches.open(cacheName)
      await cache.put(request, response.clone())
    } catch (error) {
      console.error('Caching failed:', error)
    }
  }
  return response
}
