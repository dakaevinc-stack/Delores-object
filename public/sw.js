/* Deloresh Objects — minimal offline shell for PWA install + SPA refresh */
const SHELL = 'deloresh-shell-v2'
const ASSETS = 'deloresh-assets-v2'

const ASSET_RE = /\.(?:js|mjs|css|svg|png|ico|json|webmanifest|woff2?)$/i

self.addEventListener('install', (event) => {
  event.waitUntil(
    fetch('/', { cache: 'reload' })
      .then((res) => {
        if (!res.ok) throw new Error('shell')
        return caches
          .open(SHELL)
          .then((cache) => cache.put('/index.html', res.clone()))
      })
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== SHELL && key !== ASSETS) return caches.delete(key)
            return undefined
          }),
        ),
      )
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  const accept = request.headers.get('accept') || ''
  const isHtml =
    request.mode === 'navigate' || accept.includes('text/html')

  if (isHtml) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(SHELL).then((c) => c.put('/index.html', copy))
          }
          return res
        })
        .catch(() =>
          caches.match('/index.html').then((hit) => hit || caches.match('/')),
        ),
    )
    return
  }

  if (ASSET_RE.test(url.pathname)) {
    // Сеть в приоритете: после деплоя не отдаём устаревший JS/CSS из cache-first.
    event.respondWith(
      fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone()
            caches.open(ASSETS).then((c) => c.put(request, copy))
          }
          return res
        })
        .catch(() => caches.match(request)),
    )
  }
})
