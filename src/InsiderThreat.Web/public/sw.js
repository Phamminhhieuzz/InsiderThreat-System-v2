// Minimal Service Worker for PWA compliance
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(clients.claim()));
self.addEventListener('fetch', () => { /* Network first policy */ });
