const CACHE_NAME = 'fyvio-stream-v1.0.0';
const urlsToCache = [
    '/MvStream/',
    '/MvStream/index.html',
    '/MvStream/style.css',
    '/MvStream/script.js',
    '/MvStream/manifest.json'
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(urlsToCache))
    );
});

self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request)
            .then((response) => {
                // Return cached version or fetch from network
                return response || fetch(event.request);
            }
        )
    );
});