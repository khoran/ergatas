import * as utils from './client-utils';
import alertify from 'alertifyjs';

// Progressive-web-app + service-worker + push-notification wiring.
// Each function receives the Client instance as `client`. PWA install state is
// stored back on `client.pwaEvent` (read by viewModel.installApp).

export function setupPWA(client){
    const self=client;
    alertify.dialog("installPrompt",function(){},true,'confirm');
    window.addEventListener('beforeinstallprompt', function(evt){
        console.log("got beforeinstallprompt event ");
        self.viewModel.pwaSupported(true);

        self.pwaEvent = evt;
        setTimeout(() =>{
            self.viewModel.showInstallBanner(true);

        },60000)

        setTimeout(() =>{
            self.viewModel.showInstallBanner(false);
        },180000)
    });
    window.addEventListener('appinstalled', function(evt){
        console.log("user installed app");

        dataLayer.push({event:'pwa-install',user_id: self.viewModel.userId() });
    });

}
export function registerServiceWorker(client){
    var self=client;


    function listenForWaitingServiceWorker(reg, callback) {
        console.log("SW listening for sw changes");
        function awaitStateChange() {
            console.log("SW new worker found,  listening for state changes");
            reg.installing.addEventListener('statechange', function() {
                console.log("SW state change:",this.state );
                if (this.state === 'installed') callback(reg);
                if (this.state === 'activating') {
                    console.log("SW worker activating, disabling reload-on-nav");
                    self.viewModel.reloadOnNextNav=false;
                    self.viewModel.updateApp=undefined;
                }
            });
        }
        if (!reg) return;
        if (reg.waiting){
            console.log("SW found waiting sw");
            return callback(reg);
        }
        if (reg.installing){
            console.log("SW found installing sw");
            awaitStateChange();
        }
        reg.addEventListener('updatefound', awaitStateChange);
    }

    function reloadOnNextNavigation(reg){
        console.log("SW setting flag to reload on next navigation");
        self.viewModel.reloadOnNextNav= true;
        self.viewModel.updateApp = function(){
            console.log("SW updating app on page navigation");
            if(reg && reg.waiting && reg.waiting.postMessage){
                reg.waiting.postMessage('skipWaiting');

                //as a safety mechanism, if we don't reload after the above is called
                // bail out of the update procedure. Navigation problems can result if we don't.
                setTimeout(() => {
                    console.warn("SW Reload did not occur after 500ms, bailing out of reload procedure");
                    self.viewModel.reloadOnNextNav=false;
                    self.viewModel.updateApp=undefined;
                },500);
            } else
                console.error("Failed to update at users request, reg.waiting not defined");
        };
    }
    var refreshing;
    function reload(){
        console.log("SW reloading page");
        if (refreshing) return;
        refreshing = true;
        window.location.reload();
    }


    if ('serviceWorker' in navigator) {
        // reload once when the new Service Worker starts activating
        navigator.serviceWorker.addEventListener('controllerchange',reload);
        navigator.serviceWorker.register('/service-worker.js')
            .then((reg) => {
                console.log('SW Service worker registered.', reg);

                console.log("SW update "+self.viewModel.version());
                listenForWaitingServiceWorker(reg, reloadOnNextNavigation);
                setInterval(function(){
                    console.log("SW Checking for service worker update");
                    reg.update();
                },60*60*1000); //check for updates every hour
            });
         navigator.serviceWorker.addEventListener('message', event =>{
            console.log("client got message from SW: ",event.data);
            var url = new URL(event.data);
            if(url.hostname === self.domain)
               self.router.navigateTo(url.pathname+url.search);
            else
               console.error("recieved message to navigate to non-local URL "+event.data,url.hostname,self.domain);
         });
    }else{
        console.warn("service worker API not found.Version: "+utils.browserVersion());
    }
}
export function registerPushSubscription(client){
   var self=client;
	console.log("subscribing to notifications");
	navigator.serviceWorker.ready
		.then(function(registration) {
		  // Use the PushManager to get the user's subscription to the push service.
		  return registration.pushManager.getSubscription()
			  .then(async function(subscription) {
				 // If a subscription was found, return it.
				 if (subscription) {
					console.log("existing subscription found, using it",subscription);
					return subscription;
				 }
             console.log("creating new subscription");

				 // Otherwise, subscribe the user
				 return registration.pushManager.subscribe({
					userVisibleOnly: true,
					applicationServerKey: self.convertedVapidKey
				 });
			  });
		}).then(function(subscription) {
		  // Send the subscription details to the server using the Fetch API.
        console.log("sending subscription to server: ",subscription);
		  self.server.postJson('/api/registerPushSubscriber',
			 {
				subscription: subscription,
            lists: ["daily_prayer_list"],
			 });
        setSubscriptionStatus(self, self.viewModel.isSubscribed);
		}).catch(function(error){
         console.error("failed to subscribe: ",error);
      });

}
export function setSubscriptionStatus(client, obs){
    console.log("setting subscription status?");

    return navigator.serviceWorker.ready
      .then(function(registration) {
        return registration.pushManager.getSubscription()
           .then( subscription => {
              console.log("checking if subscribed: ",subscription);
              obs(subscription != null)
           });
      });
 }
