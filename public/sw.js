self.addEventListener('push', function(event) {
  let data = {};
  try { data = event.data.json(); } catch(e) { data = { title: 'New', body: 'You have a message' }; }
  const title = data.title || 'Notification';
  const options = {
    body: data.body || '',
    icon: '/icon.png' // optional if you have an icon
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(clients.openWindow('/'));
});
