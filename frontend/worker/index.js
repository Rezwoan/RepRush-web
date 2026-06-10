// Custom service-worker logic merged into the PWA worker by next-pwa.
// Handles incoming web-push notifications and click-through navigation.

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: 'RepRush', body: event.data ? event.data.text() : '' };
  }
  const title = data.title || 'RepRush';
  const options = {
    body: data.body || '',
    icon: '/icon.png',
    badge: '/icon.png',
    tag: data.tag || 'reprush',
    data: { url: data.url || '/dashboard' },
    vibrate: [80, 40, 80],
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/dashboard';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ('focus' in client) {
          if ('navigate' in client) client.navigate(url);
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    }),
  );
});
