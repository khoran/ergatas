import * as utils from './client-utils';
import Logger from '../shared/logging'; 
import {DataAccess} from '../shared/data-access';
import {urlBase64ToUint8Array} from '../shared/shared-utils';
import {AppError} from '../server/app-error';
import * as profileCollection from  '../components/profile-collection';
import * as searchResultsMap from  '../components/search-results-map';
import * as locationInput from  '../components/location-input';
import * as fileCollection from  '../components/file-collection';
import * as donatePopup from  '../components/donate-popup';
import * as messagePopup from  '../components/message-popup';
import * as messageForm from  '../components/message-form';
import * as newsletterSignup from  '../components/newsletter-signup';
import * as sof from  '../components/statement-of-faith';
import * as orgApp from  '../components/org-application';
import * as ergatasDonation from  '../components/ergatas-donation';
import * as countrySelector from  '../components/country-selector';
import * as pendingOrganizations from  '../components/pending-organizations';
import * as reports from  '../components/reports';
import * as profileForm from  '../components/profile-form';
import * as searchResults from  '../components/search-results';
import * as worker from  '../components/worker';
import * as cannedSearches from  '../components/canned-searches';
import * as messageModeration from  '../components/message-moderation';
import * as savedSearchList from  '../components/saved-search-list';
import * as guidedSearchForm from  '../components/guided-search-form';
import * as directDonationPopup from  '../components/direct-donation-popup';
import * as dashboard from  '../components/dashboard';
import * as claimOrg from  '../components/claim-org';
import * as orgPortal from  '../components/org-portal';
import * as orgEditor from  '../components/org-editor';


import {countryBound} from './google-map';
import alertify from 'alertifyjs';
import { ServerAPI } from './server-api';
import { CloudStorage } from '../server/cloud-storage';
import { Search } from './search';
import { AppState } from '../server/app-state';

var Router = require('vanilla-router');

console.log("main starting4");

class Client {

constructor(){
    const self=this;
    var code,state;
    const bucketName = process.env.UPLOAD_BUCKET ;
    const bucketBaseUrl= process.env.BUCKET_BASE_URL;
    const authClientID=process.env.AUTH_CLIENT_ID
    const authRedirect=process.env.REDIRECT_URL;
    const postgrestBase= process.env.POSTGREST_URL_BASE;
    const authBaseUrl=process.env.AUTH_URL_BASE;
    const appBase=process.env.APP_BASE || '/';
    const logKey = process.env.LOG_KEY;
    const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
    const bucketBase=bucketBaseUrl+"/"+bucketName+"/";

    ko.options.deferUpdates = true;

    this.guidedSearchName = "Guided Search Profile";
    this.version = process.env.PACKAGE_VERSION;
    this.domain =  process.env.DOMAIN;
    this.maintenance_mode = process.env.MAINTENANCE_MODE ==="true" ;
    this.router;
    this.viewModel;
    this.pageInfo; //initialized by initTemplates
    this.server = new ServerAPI();
    this.storage = new CloudStorage(bucketBase);

    this.convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

    console.info(" VERSION: "+this.version+", maintenance mode: "+this.maintenance_mode);

    //this will replace console.{log,info,error,warn} with remote logging
    new Logger((buffer) => {
        return self.server.postJson("/api/log",{
            key: logKey,
            logs:buffer
        });
    });

    this.initTagManager();


    this.da = new DataAccess(postgrestBase,jQuery.ajax, function(){return self.server.refreshToken();});
    this.search = new Search(appBase,this.da);
    this.server.token.subscribe((newToken) =>{
        //update da whenever the token is refreshed
        console.log("setting new JWT token in da after token obs update");
        self.da.setToken(newToken);
    });


    [profileCollection,
        searchResultsMap,
        locationInput,
        reports,
        donatePopup,
        messagePopup,
        messageForm,
        searchResults,
        newsletterSignup,
        sof,
        ergatasDonation,
        orgApp,
        pendingOrganizations,
        countrySelector,
        worker,
        cannedSearches,
        profileForm,
        messageModeration,
        savedSearchList,
        guidedSearchForm,
        directDonationPopup,
        dashboard,
        claimOrg,
        orgEditor,
        orgPortal,
        fileCollection].forEach(c => c.register())

    alertify.defaults.notifier.delay=15;
    alertify.defaults.notifier.position="top-center";
    alertify.defaults.transition="zoom";
    this.initTemplates();


    //console.warn("+++++++++  mode: "+process.env.NODE_ENV+"  +++++++++++++++++++++++");

    
    this.appState = new AppState(self.da,self.search,self.storage,self.router,self.server);
    this.initViewModel(authBaseUrl,authClientID,authRedirect,appBase,this.appState);
    this.initRouter(appBase,authBaseUrl,authClientID);
    this.appState.setRouter(this.router);

    this.registerServiceWorker();
    this.setupPWA();

    var code = utils.getURLParameter("code");
    var state= utils.getURLParameter("state") || window.location.pathname.replace(appBase,"")  ;
    var hash= window.location.hash;

    if(document.getElementById("is_search_page") != null){
        console.log("adding "+state+"as a search page");
        this.search.searchPages.push(state); //add current page as a search page
    }

    console.log("code: "+code+", state: "+state+", hash: "+hash);


    //some paths require more processing than the server can perform. Those
    // paths generally have additional path components.
    // So we look for them here, and if we find one, we navigate again to that
    // page to trigger the required javascript processing.
    // If the page_content section is empty, some error
    // prevented the server from filling it in. In that case, we always 
    // trigger a navigation.

    console.log("state has no /: ",state.indexOf("/") === -1);
    console.log("page content length: "+jQuery("#page_content").children().length, jQuery("#page_content"));
    if(state.indexOf("/") === -1 &&  jQuery("#page_content").children().length > 0 ) //state is just one path component
        state = undefined; //we assume the server will have filled in required page, so we don't do any navigation here
    console.log("final state: ",state);


    //do a test login here to see if  have a cookie that will keep us logged in
    // also, encrypt the cookies
    
    if(code){
        this.doLogin(state ,code);
    }else{ //see if we can log user in based on refresh_token in cookie
        this.doRefresh().then(() =>{
            if(state){
                self.router.check();
            }
        });
    }

    this.handleDonationResult();
   
}
handleDonationResult(){
    var checkoutSessionId= utils.getURLParameter("session_id");
    console.log("resumeCheckout. id: "+checkoutSessionId);
    if(! checkoutSessionId )
        return;

    this.server.authPostJson("/api/checkoutSessionStatus",{
        checkoutSessionId: checkoutSessionId
    }).then( result =>{
        console.log("checkout status: ",result);
        if(result.status === "open"){ //re-display checkout form
            alertify.error("Oops, something went wrong while processing your donation. Please try your donation again.")
        }else if(result.status === "complete"){ //checkout completed, show thank you message
            alertify.success("Thank you for your contribution!");
        }

        //clear this parameter from the location bar so users don't reload it
        history.pushState({},'',location.origin+location.pathname);
    });

    // check for donation status
    //var donationResult = utils.getURLParameter("donationResult");
    //if(donationResult==="failed"){
    //    console.warn("got failed donation result");
    //    alertify.error("Oops, something when wrong while processing your donation. But have no fear, we'll get it fixed in a jiffy! Please check back later.")
    //}else if(donationResult==="success"){
    //    alertify.success("Thank you for your contribution!");
    //}
    //if(donationResult != null) 
    //    history.pushState({},'',location.origin+location.pathname);


}
start(){


    //console.warn(" ============================== BINDINGS APPLIED =========================",(new Date()) - window.performance.timing.navigationStart);
    ko.applyBindings(this.viewModel);

    utils.pageStats(this.server).then(this.viewModel.pageStats);

    this.setSubscriptionStatus(this.viewModel.isSubscribed);

    setTimeout(() =>{
        jQuery.getScript("https://www.google.com/recaptcha/api.js?render=6LdotL0ZAAAAALDh_JBTO_JC-CF4ZnSysamIHV3c").
            then(()=>{
                this.server.sendRecaptcha("initial_page_load");
            })
        this.initChatra();
    },5000);
}

setupPWA(){
    const self=this;
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
registerServiceWorker(){
    var self=this;


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
registerPushSubscription(){
   var self=this;
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
        self.setSubscriptionStatus(self.viewModel.isSubscribed);
		}).catch(function(error){
         console.error("failed to subscribe: ",error);
      });

}
setSubscriptionStatus(obs){
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
initTemplates(){
    this.pageInfo = require("../data/page_info.json");
    //console.log("pageInfo: ",this.pageInfo);
    const pages = Object.keys(this.pageInfo).filter(p=>this.pageInfo[p].alias_for == null);
    //console.log("pages: ",pages);

    const snippets = ["message-form"];
    this.templates={pages:[],snippets:[]};
    pages.forEach(name =>{
        try{
            this.templates.pages[name] = jQuery(require("../page-templates/"+(this.pageInfo[name].path || "")+name+".html"));
        }catch(error){
            if(this.pageInfo[name].virtual !== true)
                console.error("failed to load template for page "+name,error);
        }
    });
    snippets.forEach(name =>{
        this.templates.snippets[name] = jQuery(require("../snippet-templates/"+name+".html"));
    });
}
initChatra(){
    window.ChatraSetup= {
        colors:{
            buttonText: "#FFFFFF",
            buttonBg: "#012245",
        }
    };
    (function(d, w, c) {
          w.ChatraID = 'RsGoc343bCCuy6DCn';
          var s = d.createElement('script');
          w[c] = w[c] || function() {
              (w[c].q = w[c].q || []).push(arguments);
          };
          s.async = true;
          s.src = 'https://call.chatra.io/chatra.js';
          if (d.head) d.head.appendChild(s);
      })(document, window, 'Chatra');
 
}
initTagManager(){
    const tagId = process.env.GOOGLE_TAG_MANAGER_ID;
    (function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
      new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
      j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
      'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
      })(window,document,'script','dataLayer',tagId);
}
getPage(name){
    return this.templates.pages[name];
}
pageExists(name){
    //return this.templates.pages[name] != null;
    return this.pageInfo[name] != null;
}
getSnippet(name){
    return this.templates.snippets[name];
}

initViewModel(authBaseUrl,clientId,redirect,appBase,appState){
    const self=this;
    const viewModel = {
        loginURL: authBaseUrl+"/authorize?client_id="+clientId+"&response_type=code&scope=offline_access&redirect_uri="+redirect,
        loggedInUser:ko.observable(),
        maintenance_mode:this.maintenance_mode,
        appState: appState,
        server: appState.server,
        da: appState.da,
        utils:utils,
        domain:self.domain,
        storage: appState.storage,
        search: appState.search,
        roles: ko.observable(),
        page: ko.observable(),
        //version: ko.observable("68"),
        version: ko.observable(self.version),
        guidedSearchName: self.guidedSearchName,

        selectedProfile: ko.observable(),
        portalOrg: ko.observable(),
        userProfile: ko.observable(),
        editingProfile:ko.observable(),
        showInstallBanner: ko.observable(false),
        pwaSupported: ko.observable(false),
        versionMessage: ko.observable(utils.unsupportedBrowserCheck()),
        pageStats: ko.observable(),
        updateApp: function(){},

        isSubscribed: ko.observable(false),

        termsConfirmed: ko.observable(false),
        termsConfirmedCheckBox: ko.observable(false),

        fundId: ko.observable(),
        
        doTransition: false,
        pageParameters:{},
        playSample: function(){
            jQuery("#ergatas-sample")[0].play();
        },
        navigateFn: function(path,eventName){
            return function(){
                if(eventName != null && eventName !== "")
                    dataLayer.push({event:"navigate",'navigation-type':eventName,user_id: viewModel.userId()});
                self.router.navigateTo(path);
            }
        },

        directSignIn: function(redirectPage){
            console.log("direct sign in. redirect: ",redirectPage);
            if(redirectPage!=null && redirectPage !== '' && (typeof redirectPage === "string"))
                window.location=viewModel.loginURL+"&state="+redirectPage;
            else
                window.location=viewModel.loginURL;
        },
        signIn: function(){
            var currentPage = window.location.pathname.replace(appBase,"");
            self.router.navigateTo("signIn/"+currentPage);
        },
        signOut: async function(){
            await self.server.postJson("/api/signOut");
            self.router.navigateTo("signOut");
        },
        handleSearch: function(data,event){
            var query;
            var searchSource;

            if(event.type!=="click" && event.keyCode != 13) 
                return;
            //console.log("search event: ",event.currentTarget);

            searchSource = event.currentTarget.id.replace("-input","").replace("-btn","");
            //query=viewModel.filter.query.obs()() || "";
            query=viewModel.search.filter.query.obs()() || "";

            console.log("search source: ",searchSource);
            dataLayer.push({event:'handle-search',
                            'search-source-id':searchSource,
                            'search-query':query,user_id: viewModel.userId()});

            console.log("query: ",query);
            self.router.navigateTo("search/"+query);
        },
        loadProfile: async function(user_key){
            console.log("loading profile by user_key="+user_key);
            console.log("current profile value: ",viewModel.userProfile());
            var profileResults,profile;
            var keepUnsavedData=false;
            var savedData;
            try{
                // org admins don't have one unique profile, they can
                // choose what profile to edit from the list later
                if(viewModel.loggedInUser().is_org_admin())
                    return;

                utils.checkForInvites(viewModel.appState);

                profileResults = await self.da.getProfileByUser(user_key)
                console.log("loading profile result: ",profileResults);
                if(profileResults.length===1){
                    profile= profileResults[0];
                }else{
                    dataLayer.push({event:'profile','profile-action':"started-profile",user_id: viewModel.userId()});

                    savedData = window.localStorage.getItem("savedProfile");
                    //console.log("savedData: ",savedData);
                    if(savedData != null && savedData !== ""){
                        profile = {
                            data:JSON.parse(savedData),
                            missionary_profile_key:  undefined,
                        };
                    }else
                        profile = await self.da.newProfile();
                    //console.log("using initial profile data ",profile); 

                    profile.user_key=viewModel.loggedInUser().user_key();
                    keepUnsavedData = true;
                }
                if(viewModel.userProfile() == null)
                    viewModel.userProfile(ko.mapping.fromJS(profile));
                else
                    ko.mapping.fromJS(profile,null,viewModel.userProfile);


                if(keepUnsavedData){
                    window.localStorage.setItem("savedProfile","");
                    utils.subscribeFields(viewModel.userProfile().data,function(){
                        var enabled = window.localStorage.getItem("savedProfile") != null;
                        if(enabled){
                            //console.log("profile field changed, saving");
                            window.localStorage.setItem("savedProfile",ko.mapping.toJSON(viewModel.userProfile().data));
                        }
                    })
                }
            }catch(error){
                console.error("failed to load profile for "+user_key+". "+error.message,error);
                alertify.error("Failed to load profile"); 
            }
        },
        
    };
    this.viewModel=viewModel;

    viewModel.loggedIn= ko.computed(function(){
        return viewModel.loggedInUser() != null;
    });
    viewModel.userId= function(){
        if(viewModel.loggedIn())
            return viewModel.loggedInUser().external_user_id();
        else    
            return undefined;
    };
    viewModel.hasProfile = ko.computed(function(){
        return viewModel.userProfile() != null && viewModel.userProfile().missionary_profile_key() != null;
    });
    viewModel.hasGuidedSearch = ko.computed(function(){
        return viewModel.loggedInUser() != null && viewModel.loggedInUser().has_saved_search();
    });
      
   
    viewModel.contactMessageSent=ko.observable(false);
    viewModel.contact = async function(name,email,message){
        console.log("sending message...");
        try{
            if(email != null && name != null && message != null && message != ""){
                await self.server.postJson("/api/contact",{
                    fromEmail: email,
                    name: name,
                    message: message,
                });
                viewModel.contactMessageSent(true);
                dataLayer.push({event:'contact-us-message',user_id: viewModel.userId() });
            }
        }catch(error){
            console.error("failed to send contact message to server: "+error.message,error);
            alertify.error("Failed to send message, terribly sorry about that!");
        }
    };
    viewModel.deleteAccount = function(){
        console.log("request to delete account");
        alertify.prompt("Confirm Deletion of Account","<p>Are you sure you want to delete your account? This CANNOT be undone.</p>"+
                    "<p>To confirm deletion, please type DELETE into the box below:</p>","",
                async function(evt,value){
                    console.log("prompt value: ",value);
                    if(value != "DELETE"){

                        alertify.message("Account was NOT deleted");
                        return;
                    }
                    try{
                        //await Promise.all([
                        //    self.da.deleteUser(viewModel.loggedInUser().user_key()),
                        //    self.server.authPostJson("/api/deleteUser"),
                        //]);
                        const result = await self.server.authPostJson("/api/deleteUser",{
                            missionary_profile_key: viewModel.userProfile() && viewModel.userProfile().missionary_profile_key()
                        });

                        if(result && result.error === true){
                            alertify.alert("Cannot Remove", result.message);
                        }else{
                            dataLayer.push({event:'user','user-action':"deleted",user_id: viewModel.userId()});
                            //log user out
                            viewModel.signOut();
                        }
                    }catch(error){
                        console.error("failed to delete user account for user_key "+viewModel.loggedInUser().user_key()+". "+error.message,error);
                        alertify.error("Failed to remove account");
                    }
                },function(){
                    alertify.message("Phew! That was a close one!");
                })
    };
    viewModel.hasExtendedRoles=function(){
        return !(viewModel.roles() == null || (viewModel.roles().length === 1 && viewModel.roles()[0]==="user") )
    };
    viewModel.hasRole = function(role){
        return viewModel.roles() != null && viewModel.roles().indexOf(role) !== -1;
    };
    viewModel.installApp = function(){

        console.log("confirmed installing app");
        viewModel.showInstallBanner(false);


        self.pwaEvent.prompt();
        self.pwaEvent.userChoice.then((choice)=>{
            if (choice.outcome === 'accepted') {
                console.log('User accepted the A2HS prompt', choice);
            } else {
                console.log('User dismissed the A2HS prompt', choice);
            }
            
        })
    };

    viewModel.verifyEmailSent=ko.observable(false);
    viewModel.resendVerifyEmail = function(){
        dataLayer.push({event:"resent-verify-email"});
        self.server.authPostJson("/api/resendVerifyEmail").
            then(function(){                    
                console.log("verify email sent");
                viewModel.verifyEmailSent(true);
            })

    };
    viewModel.agreeSOF = function(){
        var data;
        self.server.sendRecaptcha("agree_sof");

        if(viewModel.loggedIn()){
            try{
                viewModel.termsConfirmed(true);
                data = ko.mapping.toJS(viewModel.loggedInUser());
                delete data.email;
                data.agreed_to_sof=true;
                self.da.updateUser(viewModel.loggedInUser().user_key(),data);
            }catch(error){
                console.warn("failed to update user in agreeSOF ",error);
            }
        } 
        dataLayer.push({event:'user','user-action':"agreed-to-terms","user_id":viewModel.userId()});
        self.router.navigateTo('profile');
    };
    viewModel.isOwnProfile = function(){
        return viewModel.hasProfile() &&
               viewModel.selectedProfile().missionary_profile_key === viewModel.userProfile().missionary_profile_key();
    };
    
    viewModel.setupNotifications = function(){
        Notification.requestPermission().then((result) => {
            console.log("notification request response: ",result);
            if (result === 'granted') {
                console.log("notification granted");

                self.registerPushSubscription();
                dataLayer.push({event:'user','user-action':"enabled-notifications","user_id":viewModel.userId()});
                //self.initPrayerNotifications();
                //self.sendNotice("Yay, notifications are working!",{});

            }
        });
    };

    viewModel.unsubscribePushNotifications = function(){
       navigator.serviceWorker.ready
         .then(function(registration) {
           return registration.pushManager.getSubscription()
              .then( subscription => {
                 try{

                   if(subscription){
                      subscription.unsubscribe();
                      self.server.postJson("/api/unsubscribePushNotifications",
                         { subscription:subscription});
                      self.setSubscriptionStatus(viewModel.isSubscribed);
                   }else{
                      console.warn("trying to unsubscribe, but no subscription found");
                   }
                 }catch(error){
                    console.error("failed to unsubscribe from push notification: ",error);
                 }
              });
         });

    };

    viewModel.hasUnsavedSearchParams = function(){
        var x = window.localStorage.getItem(self.guidedSearchName) != null && ! self.viewModel.loggedIn()
        console.log("has unsaved search param? "+x);
        return x;
    }

    viewModel.makeTestDonation = async function(){
        console.log("making test donation");
        var missionary_profile_key = 117;
        const result = await self.server.postJson("/api/makeDonation",{
            email: "khoran512@gmail.com",
            //email: "test1@ergatas.org",
            name:"Ted Smith",
            missionary_profile_key: missionary_profile_key,
            donation_type:"one-time",
            //donation_type:"recurring",
            amount:1000});
        console.log("got result: ",result);
        location.assign(result.payment_url);

    }
   
    viewModel.newProfileSetup = async function(){
        const profile = await self.da.newProfile();
        profile.user_key = viewModel.loggedInUser().user_key();

        viewModel.editingProfile(ko.mapping.fromJS(profile))
    }
    viewModel.showGetStarted = function(){
        return viewModel.loggedIn() 
                && ! (viewModel.hasProfile() || viewModel.loggedInUser().is_org_admin())
                && ! viewModel.hasGuidedSearch();
    }
    viewModel.addToPortal = async function(profile){
        console.log("adding profile to users portal: ",profile);

        const result = await viewModel.server.authPostJson("/api/addROProfile",{
            missionary_profile_key:profile.missionary_profile_key
        });
        console.log("result: ",result);
        if(result && result.added===true)
            alertify.success("Profile added!");
        if(result && result.added===false)
            alertify.warning("Hey, you've already go that one!");

    }
   
}

initRouter(appBase,authBaseUrl,authClientID){
    const viewModel=this.viewModel;
    const self=this;

    function setPage(pageName){

        var _setPage = function(){

            console.log("======= SETTING PAGE TO "+pageName+"================",window.location.hash);
            viewModel.doTransition = false;
            if(self.pageInfo[pageName] && self.pageInfo[pageName].title){
                //if current doc title does not match new page title, then perform a transition
                viewModel.doTransition = document.title !== self.pageInfo[pageName].title;
            }
            if(self.pageInfo[pageName].alias_for && self.pageInfo[self.pageInfo[pageName].alias_for]){
                viewModel.page(self.getPage(self.pageInfo[pageName].alias_for).clone());
            }else{
                viewModel.page(self.getPage(pageName).clone());
            }
            if(self.pageInfo[pageName] && self.pageInfo[pageName].title){
                document.title = self.pageInfo[pageName].title;
            }

            try{

                //scroll to top of new page as long as no hash anchor link is present
                if( ! window.location.hash)
                    $("html, body").animate({ scrollTop: 0},500);
                else{
                    setTimeout(() =>{
                       console.log("found hash, scrolling to ", window.location.hash,$(window.location.hash));
                       var offset = $(window.location.hash).offset() || {top:0}
                       $("html, body").animate({ scrollTop: offset.top},500);
                    },1000);
                }
            }catch(error){
                console.warn("failed to scroll page: ",error);

            }
        }

        //new service worker found, so reload to use it
        if(viewModel.reloadOnNextNav === true ){
            viewModel.updateApp();
            //the above function should trigger a whole page reload.
            // but occasionally it fails to for some reason. 
            // To ensure that doesn't lead to all page navigation being broken
            // we'll still set a page here, but after a delay
            setTimeout(() =>{
                console.warn("SW Reload did not occur after 500ms, setting next page");
                _setPage();
            },500);
        }else
            _setPage();


    }
    function setLoggedInPage(pageName,redirect,requiredRole){
        //console.log(`setting log-in required page ${pageName}. redirect: ${redirect}, required role: ${requiredRole}`,viewModel.roles());
        if(viewModel.loggedIn()){
            if(requiredRole == null || (requiredRole!=null && viewModel.hasRole(requiredRole)))
                setPage(pageName);
            else{
                console.warn(`required role ${requiredRole} not met for page ${pageName}`);
                setPage('not-found');
            }
        }else //if redirect not set, use pageName
            signInWithRedirect(redirect || pageName);
    }
    function setSearch(){
        //scroll to top before setting page so we don't trigger the infinite scroll function
        window.scrollTo(0,0);
        setPage("search");
    }
    const router = new Router({
        root:appBase,
        page404: function (path) {
            console.log('"/' + path + '" Page not found');
            viewModel.page(self.getPage("not-found"));
        }
    });
    this.router = router;
    
    router.add('', function () {
        //page stats are also run start() function
        utils.pageStats(self.server).then(viewModel.pageStats);
        setPage("home");
    });
    router.add('search/', async function () {
        console.log("bare search");
        setSearch();
    });
    router.add(/^search\/tag\/([^\/]+)$/, async function (tagName) {
        console.log("setting tag filter for tag name "+tagName);
        viewModel.appState.tagList.findItem( item => item.name.toLowerCase() === tagName.toLowerCase() ).
            then( item => {
                if(item != null)
                    viewModel.search.filter.tags.obs()([item.tag_key]);
                setSearch();
            })
    });
    router.add(/^search\/organization\/([^\/]+)$/, async function (orgName) {
        console.log("setting org filter for org name "+orgName);
        viewModel.appState.approvedOrgList.findItem( 
                item => item.display_name.toLowerCase() === orgName.toLowerCase() ).
            then( item => {
                if(item != null)
                    viewModel.search.filter.organizations.obs()([item.organization_key]);
                setSearch();
            })
    });
    router.add("search/peopleGroupID/(:num)", async function (peopleID3) {
        viewModel.search.filter.peopleGroups.obs()([peopleID3]);
        setSearch();
    });
    router.add("search/countryCode/(:any)", async function (countryCode) {
        //console.log("searching by country code "+countryCode);
        var bound = await countryBound(countryCode);
        if(bound != null){
           //console.log("setting bound for country "+countryCode);
           viewModel.search.filter.bounds.obs()([
              bound.northeast.lat,
              bound.northeast.lng,
              bound.southwest.lat,
              bound.southwest.lng
            ]);
            viewModel.search.searchResultsTemplate("map-results-template");
        }
        setSearch();
    });
    router.add(/^search\/public\/([-a-zA-Z0-9"' ]+)$/, async function (searchName) {
        console.log("loading public search "+searchName);

        try{
            var savedSearch = await self.da.getPublicSearch(searchName);

            if(savedSearch == null) throw "failed";

            console.log("loading public search ",savedSearch);
            self.search.loadSavedSearch(savedSearch.data.params);

        }catch{
            console.warn("could not find public search "+searchName);
            alertify.error("Well this is embarrassing, but I could not find a search saved under the name '"+searchName+"'");
        }
        setSearch();
    });
    router.add(/^search\/saved\/([-a-zA-Z0-9"' ]+)$/, async function (searchName) {
        //fetch search data
        //  search public and user data
        //load 
        //navigate to search page
        console.log("loading saved search "+searchName);

        if(viewModel.loggedIn()){
            try{

                var userKey = viewModel.loggedInUser().user_key();
                var savedSearch = await self.da.getSavedSearchesByName(userKey,searchName);
                if(savedSearch == null){
                    throw "failed";
                }else{
                    console.log("loading saved search ",savedSearch);
                    self.search.loadSavedSearch(savedSearch.data.params);
                }
            }catch{
                console.warn("could not find saved search "+searchName);
                alertify.error("Well this is embarrassing, but I could not find a search saved under the name '"+searchName+"'");
            }
            setSearch();
    
        }else{
           console.log("saved searches require login first, redirecting");
            signInWithRedirect("search/saved/"+searchName);
        }

    });
    router.add(/^search\/([-a-zA-Z0-9"' ]+)$/, async function (query) {
        console.log("query search : "+query);
        self.search.setQuery(query);
        setSearch();
    });
    router.add('profile/edit/(:num)', async function (missionary_profile_key) {
        console.log("nav2 to profile/edit",missionary_profile_key,viewModel.roles());
        if(viewModel.loggedIn() && viewModel.hasRole("profile_manager") ){
            try{
                const profile = await self.da.getProfileByKey(missionary_profile_key);
                viewModel.editingProfile(ko.mapping.fromJS(profile))
                setPage('profile');
            }catch(e){
                setPage('not-found');
            }
        }else
            setPage('not-found');
    });
    router.add('profile/preview/(:num)', async function (missionary_profile_key) {
        console.log("nav3 to profile/preview",missionary_profile_key,viewModel.roles());
        //if(viewModel.loggedIn() && viewModel.hasRole("profile_manager") ){
        if(viewModel.loggedIn()){
            try{
                const profile = await self.da.getDisplayProfilePreviewByKey(missionary_profile_key);
                viewModel.selectedProfile(profile);
                setPage('profile-detail');
            }catch(e){
                setPage('not-found');
            }
        }else
            setPage('not-found');
    });
    router.add('profile/new', async function () {
        console.log("nav to profile/new",viewModel.roles());
        if(viewModel.loggedIn() && viewModel.hasRole("profile_manager") ){
            await viewModel.newProfileSetup();
            setPage('profile');
        }else
            setPage('not-found');
    });
    router.add('profile/', async function () {
        if(viewModel.loggedIn()){
            if( ! await self.isUserVerified()){
                //reset this value
                self.viewModel.verifyEmailSent(false);
                setPage("verify-email");
                //self.router.navigateTo("verify-email"); //messes up back button
            } else if( ! viewModel.hasProfile() && ! viewModel.termsConfirmed()){
                await viewModel.loadProfile(viewModel.loggedInUser().user_key());
                setPage("confirm-sof");
            } else if( ! viewModel.hasProfile() &&  viewModel.termsConfirmed()){
                console.log("no profile, but sof confirmed",viewModel.userProfile())
                await viewModel.loadProfile(viewModel.loggedInUser().user_key());
                viewModel.editingProfile(viewModel.userProfile());
                setPage("profile");
            }else{
                console.log("has profile, and sof confirmed",viewModel.userProfile())
                viewModel.editingProfile(viewModel.userProfile());
                setPage("profile");
            }
        }else
            signInWithRedirect("profile"+location.hash.replaceAll("#","%23"));
    });
    router.add('verify-email/', async function () {
        //reset this value
        self.viewModel.verifyEmailSent(false);
        setPage("verify-email");
    });

    router.add('get-started/', function (name) {
        setPage("get-started");
    });
    router.add('profile-detail/(:num)', async function (missionary_profile_key) {
        var profile;
        try{

            profile = await self.da.getDisplayProfileByKey(missionary_profile_key);
            console.log("found profile; ",profile);
            viewModel.selectedProfile(profile);
            setPage("profile-detail");

            document.title = "Ergatas Profile - "+profile.missionary_name;
        }catch(error){
            console.error("no profile found for missionary_profile_key",missionary_profile_key+". "+error.message,error);
            setPage("not-found");
        }
    });
    router.add('about/', function () {
        setPage("about");
    });
    router.add('resources/', function () {
        setPage("resources");
    });
    router.add('contact/', function () {

        var message= utils.getURLParameter("message");
        viewModel.pageParameters.message = message;
        viewModel.contactMessageSent(false);
        setPage("contact");
    });
    router.add('org-application/', async function () {
        setLoggedInPage("org-application");
    });
    router.add(/^signIn\/(.+)$/, function (redirectPage) {
        console.log("sign in with redirect",viewModel.loginURL);
        signInWithRedirect(redirectPage);
    });
    router.add('signOut/', function () {
        window.location=authBaseUrl+"/logout?client_id="+authClientID;
    });
    router.add('confirm-sof/', async function () {

        if( ! await self.isUserVerified()){
            self.router.navigateTo("verify-email");
        }else
            setPage("confirm-sof");
    });
    router.add('organization-review/(:num)', function (organization_key) {
        setLoggedInPage('organization-review',null,'organization_review');
    });
    router.add('organization-review/', function () {
        setLoggedInPage('organization-review',null,'organization_review');
    });
    router.add('reports/', function () {
        setLoggedInPage('reports',null,'organization_review');
    });
    router.add('message-moderation/', function () {
        setLoggedInPage('message-moderation',null,'organization_review');
    });
    router.add('learn/{name}', function (name) {
        console.log("loading learn article "+name);
        setPage(name);
    });

    router.add(/([^./]+)$/, async function (name) {
        console.log("default handler, attempting to load "+name);
        if(self.pageExists(name)){
            const pageInfo = self.pageInfo[name];
            console.log("page info: ",pageInfo);
            if(pageInfo.auth != null && pageInfo.auth === true)
                setLoggedInPage(name);
            else
                setPage(name);
        }else {
            console.log("checking to see if "+name+" is an org slug");
            const org = await self.da.getOrganizationBySlug(name);
            if(org != null){
                console.log("it is a slug! ",JSON.stringify(org));
                self.viewModel.portalOrg(org);
                setPage("organization");
            }else
                setPage('not-found')
        }
    });

    router.addUriListener();
    function signInWithRedirect(redirectPage){
        console.log("signIn with redirect to "+redirectPage);
        window.location=viewModel.loginURL+"&state="+redirectPage;
    }

}
async isUserVerified(){
    try{
        const result = await this.server.authPostJson("/api/verifyUser");
        console.log("verify result: ",result,result != null && result.verified === true);
        return result != null && result.verified === true;
    }catch(error){
        console.error("failed to check if user is verified: "+error.message,error);
        return false;
    }
}

async doRefresh(){
    var self=this;
    try{
        var tokenResult = await self.server.refreshToken();
        this.viewModel.roles(tokenResult.roles);
        this.setCookies();

        if( ! self.viewModel.loggedIn()){
            console.log("reloading user during refresh");
            var userResults = await self.da.getUser(tokenResult.userId);
            if(userResults.length === 1){
                console.log("logged in user: ",userResults[0]);
                dataLayer.push({event:'user','user-action':"login","user_id":tokenResult.userId});
                var user = userResults[0];
                user.email= tokenResult.email; //not saved, just displayed on page
                self.viewModel.loggedInUser(ko.mapping.fromJS(user));
                self.viewModel.termsConfirmed(self.viewModel.loggedInUser().agreed_to_sof());
                self.viewModel.termsConfirmedCheckBox(self.viewModel.termsConfirmed());
            }
        }

        if( ! self.viewModel.hasProfile()){
            console.log("reloading profile during refresh");
            await self.viewModel.loadProfile(self.viewModel.loggedInUser().user_key());
        }
    }catch(error){
        console.info("failed to refresh login. "+(error.responseJSON && error.responseJSON.message));
    }
    console.log("token refresh done");
}

async doLogin(state,code){
    const viewModel=this.viewModel;
    const self=this;
    var userResults, user;

    console.log("attempting login");
    try{
        var tokenResult = await self.server.postJson("/api/token",{code:code});
        var newUser=false;
        //console.log("token result: ",tokenResult);
        if(tokenResult.access_token != null){
            console.info("login authenticated");
            //self.updateToken(tokenResult);
            self.server.token(tokenResult.access_token);
            self.viewModel.roles(tokenResult.roles);

            self.server.sendRecaptcha("login");
            dataLayer.push({event:'user','user-action':"login","user_id":tokenResult.userId});
            try{
                userResults = await self.da.getUser(tokenResult.userId);
                console.log("userResults: ",userResults);
                if(userResults.length === 1){
                    console.log("logged in user: ",userResults[0]);
                    user = userResults[0];
                }else{ //user not found
                    newUser=true;
                    user = await self.da.createUser(tokenResult.userId);
                    dataLayer.push({event:'user','user-action':"created","user_id":tokenResult.userId});
                    console.log(" new user record: ",user);
                    try{
                        await self.server.authPostJson("/api/newUser");
                    }catch(error){ //not fatal, make sure any errors from this don't propagate
                        console.warn("failed to post to newUser endpoint: "+error.message,error);
                    }
                }

                try{
                    await self.persistSavedGuidedSearch(user);
                }catch(error){ //not fatal, make sure any errors from this don't propagate
                    console.warn("failed to check for or persist locally saved guided search: "+error.message,error);
                }
                user.email= tokenResult.email; //not saved, just displayed on page
                viewModel.loggedInUser(ko.mapping.fromJS(user));
                self.viewModel.termsConfirmed(self.viewModel.loggedInUser().agreed_to_sof());
                self.viewModel.termsConfirmedCheckBox(self.viewModel.termsConfirmed());
                this.setCookies();

                await viewModel.loadProfile(viewModel.loggedInUser().user_key());

                if(newUser)
                    self.router.navigateTo("confirm-sof");
                else
                    self.router.navigateTo(state);

            }catch(error){
                throw new AppError("failed to create new user with userId "+tokenResult.userId+". "+error.message,error);
            }
        }else{
            throw new AppError("no access_token found in tokenResult");
        }
    }catch(error){
        alertify.error("Login Failed");
        console.error("failed to log in user. "+error.message,error);
        self.router.navigateTo('');
    }
}


async persistSavedGuidedSearch(user){
    //look to see if there is a locally stored guided search and no guided search in db 
    //  then grab it and store it, then remove the local entry

    console.log("checking for a local guided search with name "+this.guidedSearchName);
    var name = this.guidedSearchName;
    var searchParams= window.localStorage.getItem(name);
    console.log("search params: ",searchParams);

    if(searchParams == null)
        return;

    try{
        var savedSearch = await this.da.getSavedSearchesByName(user.user_key,name)
        if(savedSearch != null)
            //if we have a db search already, then just remove this local one
            window.localStorage.clear(name);
            return;
    }catch{ //we'll come here if the above search fails to find anything
        try{

            var data = {
                name:name,
                params: JSON.parse(searchParams)
            }
            console.log("found a local guided search, saving to db");
            await this.da.createSavedSearch(user.user_key,data);
            user.has_saved_search=true;
        }catch(error){
            console.error("failed to persist locally saved search",error);
        }
    }
}

setCookies(){
    if(this.viewModel.hasRole("debugger")){
        document.cookie = "debugmode=true;max-age="+(60*60*24);
        console.log("DEBUG MODE ON");
    }
}


} // end Client class


export default {Client};
