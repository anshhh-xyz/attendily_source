self.addEventListener('install', function (e) {
  self.skipWaiting();
});

self.addEventListener('activate', function (e) {
  e.waitUntil(self.clients.claim());
});

self.addEventListener("push", function(event) {
  var data = event.data ? event.data.json() : {};
  var title = data.title || "Attendily";
  var options = {
    body: data.body || "",
    icon: "icon-192.png",
    badge: "icon-192.png",
    data: { url: data.url || "/" }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", function(event) {
  event.notification.close();
  var url = event.notification.data && event.notification.data.url ? event.notification.data.url : "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(function(clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var client = clientList[i];
        if ("focus" in client) {
          return client.navigate(url).then(function() {
            return client.focus();
          });
        }
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});
