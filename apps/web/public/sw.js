/* global self */
// Chorely's service worker exists only to make the app installable. Offline use is not supported in v1, so it
// has no fetch handler and caches nothing: every request goes to the network as if there were no worker.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
