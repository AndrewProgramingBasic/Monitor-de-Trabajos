// VPTI Task Monitor - Service Worker
self.addEventListener('install', (event) => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener('push', (event) => {
  if (!event.data) return

  try {
    let data = {}
    try {
      data = event.data.json()
    } catch {
      data = {
        title: 'VPTI Task Monitor',
        body: event.data.text(),
      }
    }

    const title = data.title || 'VPTI Task Monitor'
    const targetUrl = data.data?.url || data.url || '/'
    const options = {
      body: data.body || 'Alerta operativa de ventana técnica VPTI',
      icon: '/icon-dark-32x32.png',
      badge: '/icon-light-32x32.png',
      vibrate: [200, 100, 200],
      data: targetUrl,
      actions: [
        { action: 'open_dashboard', title: 'Ver en Panel' },
      ],
    }

    event.waitUntil(self.registration.showNotification(title, options))
  } catch (e) {
    event.waitUntil(
      self.registration.showNotification('VPTI Task Monitor', {
        body: typeof event.data.text === 'function' ? event.data.text() : 'Alerta VPTI',
      })
    )
  }
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()

  const targetUrl =
    (typeof event.notification.data === 'string' && event.notification.data) ||
    event.notification.data?.url ||
    '/'

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url && 'focus' in client) {
          if (client.url.includes(targetUrl) || targetUrl === '/') {
            return client.focus()
          }
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl)
      }
    })
  )
})
