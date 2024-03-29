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
import {clientsClaim} from 'workbox-core';


import {createHandlerBoundToURL} from 'workbox-precaching';
import {NavigationRoute, registerRoute} from 'workbox-routing';


clientsClaim();

setCacheNameDetails({
  prefix: 'ergatas',
  precache: 'precache',
  suffix: 'v10',
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

//setDefaultHandler(new StaleWhileRevalidate());
setDefaultHandler(new NetworkOnly());

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

