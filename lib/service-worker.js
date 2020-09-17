//import { CacheableResponsePlugin } from 'workbox-cacheable-response/CacheableResponsePlugin';
//import { CacheFirst } from 'workbox-strategies/CacheFirst';
import { StaleWhileRevalidate} from 'workbox-strategies/StaleWhileRevalidate';
//import { createHandlerForURL } from 'workbox-precaching/createHandlerForURL';
//import { ExpirationPlugin } from 'workbox-expiration/ExpirationPlugin';
//import { NavigationRoute } from 'workbox-routing/NavigationRoute';
import { precacheAndRoute } from 'workbox-precaching/precacheAndRoute';
//import { registerRoute } from 'workbox-routing/registerRoute';
import {setDefaultHandler} from 'workbox-routing';


import {createHandlerBoundToURL} from 'workbox-precaching';
import {NavigationRoute, registerRoute} from 'workbox-routing';

precacheAndRoute(self.__WB_MANIFEST);



// This assumes /app-shell.html has been precached.
const handler = createHandlerBoundToURL('/index.html');
const navigationRoute = new NavigationRoute(handler);
registerRoute(navigationRoute);

//setDefaultHandler(new StaleWhileRevalidate());


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