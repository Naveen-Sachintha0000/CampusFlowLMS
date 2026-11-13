// Intentionally does not cache authenticated requests, private media or API data.
// The app remains network-dependent for security-sensitive content.
self.addEventListener('install', event => { self.skipWaiting(); });
self.addEventListener('activate', event => { event.waitUntil(self.clients.claim()); });
