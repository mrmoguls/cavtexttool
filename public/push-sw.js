// Loaded into the app's service worker (see vite.config.ts → workbox.importScripts).
// Shows phone notifications and opens the right screen when one is tapped.

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch { data = { title: 'CAV Hub', body: event.data ? event.data.text() : '' } }
  const title = data.title || 'CAV Hub'
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: data.tag || undefined,
    renotify: !!data.tag,
    data: { open: data.open || 'notifications' },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const open = (event.notification.data && event.notification.data.open) || 'notifications'
  const url = new URL('./?open=' + encodeURIComponent(open), self.registration.scope).href
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const w of wins) {
      if (w.url.startsWith(self.registration.scope)) {
        w.postMessage({ type: 'cav-open', open })
        try { return await w.focus() } catch { return undefined }
      }
    }
    return self.clients.openWindow(url)
  })())
})
