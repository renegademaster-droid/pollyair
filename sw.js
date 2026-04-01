self.addEventListener('push', event => {
  if (!event.data) return;
  const { title, body, aqIndex } = event.data.json();
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: 'pollyair-aq',
      renotify: true,
      data: { aqIndex },
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
