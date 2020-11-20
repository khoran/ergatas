//import { CacheableResponsePlugin } from 'workbox-cacheable-response/CacheableResponsePlugin';
import { CacheFirst } from 'workbox-strategies/CacheFirst';
import { StaleWhileRevalidate} from 'workbox-strategies/StaleWhileRevalidate';
import { NetworkOnly} from 'workbox-strategies/NetworkOnly';
//import { createHandlerForURL } from 'workbox-precaching/createHandlerForURL';
import { ExpirationPlugin } from 'workbox-expiration/ExpirationPlugin';
//import { NavigationRoute } from 'workbox-routing/NavigationRoute';
import { precacheAndRoute } from 'workbox-precaching/precacheAndRoute';
//import { registerRoute } from 'workbox-routing/registerRoute';
import {setDefaultHandler} from 'workbox-routing';
import {setCacheNameDetails} from 'workbox-core';



import {createHandlerBoundToURL} from 'workbox-precaching';
import {NavigationRoute, registerRoute} from 'workbox-routing';



setCacheNameDetails({
  prefix: 'ergatas',
  precache: 'precache',
  suffix: 'v7',
});

precacheAndRoute(self.__WB_MANIFEST);

registerRoute(
  ({request}) => request.destination === 'image',
  new CacheFirst({
    cacheName: 'images',
    plugins: [
      new ExpirationPlugin({
        maxEntries: 60,
        maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
      }),
    ],
  })
);

registerRoute(
  ({request}) => request.destination === 'script' ||
                  request.destination === 'style',
  new StaleWhileRevalidate({
    cacheName: 'static-resources',
  })
);
registerRoute(
  ({request}) => request.mode === 'navigate' ,
  new StaleWhileRevalidate({
    cacheName: 'navigation',
  })
);


registerRoute(
  ({url}) => url.origin === self.location.origin &&
             ( url.pathname.startsWith('/api/') ||
               url.pathname.startsWith('/db/') ),
  new NetworkOnly()
);

//setDefaultHandler(new StaleWhileRevalidate());
setDefaultHandler(new NetworkOnly());

addEventListener('message', messageEvent => {
  if (messageEvent.data === 'skipWaiting') return skipWaiting();
});

/*
const CACHE_NAME="static-cache-v2";
const FILES_TO_CACHE = [
    '/standin.html',
];
self.addEventListener('install', (evt) => {
    console.log('[ServiceWorker] Install');
    // CODELAB: Precache static resources here.
    evt.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('[ServiceWorker] Pre-caching offline page');
            return cache.addAll(FILES_TO_CACHE);
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  console.log('[ServiceWorker] Activate');
  // CODELAB: Remove previous cached data from disk.
  evt.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );

  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  console.log('[ServiceWorker] Fetch', evt.request.url);
  // CODELAB: Add fetch event handler here.
  if (evt.request.mode !== 'navigate') {
    // Not a page navigation, bail.
    return;
  }
  evt.respondWith(
        fetch(evt.request)
            .catch(() => {
            return caches.open(CACHE_NAME)
                .then((cache) => {
                    return cache.match('standin.html');
                });
            })
);

});
*/