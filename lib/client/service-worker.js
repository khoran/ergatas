//import { CacheableResponsePlugin } from 'workbox-cacheable-response/CacheableResponsePlugin';
import { CacheFirst } from 'workbox-strategies/CacheFirst';
import { StaleWhileRevalidate} from 'workbox-strategies/StaleWhileRevalidate';
import { NetworkFirst} from 'workbox-strategies/NetworkFirst';
import { NetworkOnly} from 'workbox-strategies/NetworkOnly';
//import { createHandlerForURL } from 'workbox-precaching/createHandlerForURL';
import { ExpirationPlugin } from 'workbox-expiration/ExpirationPlugin';
//import { NavigationRoute } from 'workbox-routing/NavigationRoute';
import { precacheAndRoute } from 'workbox-precaching/precacheAndRoute';
//import { registerRoute } from 'workbox-routing/registerRoute';
import {setCacheNameDetails} from 'workbox-core';
import {clientsClaim} from 'workbox-core';


import {createHandlerBoundToURL} from 'workbox-precaching';
import {NavigationRoute, registerRoute} from 'workbox-routing';


clientsClaim();

setCacheNameDetails({
  prefix: 'ergatas',
  precache: 'precache',
  suffix: process.env.PACKAGE_VERSION,
  //suffix: 'v11',
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

// Same-origin only. Cross-origin scripts must not be cached here: the Google
// Maps bootstrap (maps.googleapis.com/maps/api/js) is dynamically generated and
// pins versioned submodules — serving a stale copy after Google rotates the
// weekly build throws NotLoadingAPIFromGoogleMapsError and blanks the map until
// a reload. Stripe.js likewise must load fresh from js.stripe.com.
registerRoute(
  ({url, request}) => url.origin === self.location.origin &&
                      (request.destination === 'script' ||
                       request.destination === 'style'),
  new StaleWhileRevalidate({
    cacheName: 'static-resources',
  })
);
// Navigations are NetworkFirst, NOT StaleWhileRevalidate. The HTML document
// references content-hashed CSS/JS filenames (see buildIndex in
// lib/server/utils.js). With SWR a returning visitor got the *stale* cached HTML
// after a deploy, whose old hashed CSS name had already been removed from dist —
// the render-blocking <link> 404'd and the page painted unstyled and STAYED that
// way until the next reload. NetworkFirst always serves fresh HTML online (so the
// asset hashes it references exist), and only falls back to cache when offline
// (where the cached HTML and its cached assets match, so still styled). The extra
// network round-trip per navigation is the intended trade for never showing an
// unstyled page. networkTimeoutSeconds falls back to cache on a flaky connection
// instead of hanging.
registerRoute(
  ({request}) => request.mode === 'navigate' ,
  new NetworkFirst({
    cacheName: 'navigation',
    networkTimeoutSeconds: 4,
  })
);


registerRoute(
  ({url}) => url.hostname=== "restcountries.eu" ,
  new CacheFirst({
      cacheName: 'restcountries',
      plugins: [
        new ExpirationPlugin({
          maxEntries: 60,
          maxAgeSeconds: 30 * 24 * 60 * 60, // 30 Days
        }),
      ],
    })
);


registerRoute(
  ({url}) => url.origin === self.location.origin &&
             ( url.pathname.startsWith('/api/') ||
               url.pathname.startsWith('/db/') ),
  new NetworkOnly()
);

// Same-origin fallback only. Do NOT install a global default handler: a catch-all
// would intercept cross-origin requests too, re-issuing them from the SW. For a CORS
// POST like Uppy's https://api2.transloadit.com/assemblies that re-fetch fails the
// preflight (Firefox: NS_ERROR_INTERCEPTION_FAILED) and breaks uploads. Leaving
// cross-origin requests unmatched lets the browser handle them normally.
registerRoute(
  ({url}) => url.origin === self.location.origin,
  new NetworkOnly()
);
//setDefaultHandler(new StaleWhileRevalidate());

addEventListener('message', messageEvent => {
  if (messageEvent.data === 'skipWaiting') return skipWaiting();
});


self.addEventListener('notificationclick', function(event) {
    //console.log("notification: ",event.notification.data);
    event.notification.close();
    var url = event.notification.data;

    if(url != null){

      console.log("got url "+ url);

      event.waitUntil(clients.matchAll({ type: 'window' }).then(clientsArr => {
        //console.log("window array: ",clientsArr.map( c => c.url));
        if(clientsArr.length > 0){
          var client = clientsArr[0];
          //console.log("setting existing client window to "+url);
          client.postMessage(url);
          client.focus();
        }else{
          //console.log("would open a new window");
          clients.openWindow(url);
        }
      }));
    }

}, false);

self.addEventListener('push', function(event) {
  console.log("got push event");
  const payload = event.data ? event.data.json() : 'no payload';
  console.log("payload: ",payload);
  event.waitUntil(
    self.registration.showNotification(payload.title, {
        requireInteraction:true,
        icon: "/favicon.ico",
        body: payload.body,
        data: payload.url,
        image: payload.image,
        vibrate:  [200, 100, 200, 100, 200, 100, 200],
    })
  );
});

