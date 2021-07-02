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
  suffix: 'v9',
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
    console.log("notification click event: ",event);
    console.log("notification: ",event.notification);
    event.notification.close();
    var key = event.notification.data && event.notification.data.missionary_profile_key;
    console.log("key: "+key);
    if(key != null){

      console.log("got key");

      event.waitUntil(clients.matchAll({ type: 'window' }).then(clientsArr => {
        console.log("window array: ",clientsArr.map( c => c.url));
        // If a Window tab matching the targeted URL already exists, focus that;
        //const hadWindowToFocus = clientsArr.some(windowClient => 
          //windowClient.url === event.notification.data.url ? (windowClient.focus(), true) : false);
        // Otherwise, open a new tab to the applicable URL and focus it.
        //console.log("had window to focus:",hadWindowToFocus);
        var url = "https://home.ergatas.org/profile-detail/"+key;
        if(clientsArr.length > 0){
          console.log("setting existing client window to "+url);
          clientsArr[0].navigate(url);
          clientsArr[0].focus();
        }else{
          console.log("would open a new window");
          clients.openWindow(url);
          //clients.openWindow(event.notification.data.url).then(windowClient => 
            //windowClient ? windowClient.focus() : null);
        }
      }));



      //clients.openWindow("/profile-detail/"+key);
    }

}, false);

