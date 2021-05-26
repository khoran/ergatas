import * as utils from './client-utils';
import Logger from './logging'; 
import {DataAccess} from './data-access';
import {AppError} from './app-error';
import * as profileCollection from  './components/profile-collection';
import * as searchResultsMap from  './components/search-results-map';
import * as locationInput from  './components/location-input';
import * as fileCollection from  './components/file-collection';
import * as donatePopup from  './components/donate-popup';
import * as messagePopup from  './components/message-popup';
import * as messageForm from  './components/message-form';
import * as newsletterSignup from  './components/newsletter-signup';
import * as sof from  './components/statement-of-faith';
import * as orgApp from  './components/org-application';
import * as ergatasDonation from  './components/ergatas-donation';
import * as countrySelector from  './components/country-selector';
import * as pendingOrganizations from  './components/pending-organizations';
import * as reports from  './components/reports';
import * as profileForm from  './components/profile-form';
import * as search from  './components/search';
import * as worker from  './components/worker';

import * as mapUtils from './map';
import alertify from 'alertifyjs';
import { ServerAPI } from './server-api';
import { CloudStorage } from './cloud-storage';
import { Search } from './search';
import { AppState } from './app-state';

var Router = require('vanilla-router');


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
    const bucketBase=bucketBaseUrl+"/"+bucketName+"/";
    const countryUrl = "https://restcountries.eu/rest/v2/all";

    ko.options.deferUpdates = true;

    this.version = process.env.PACKAGE_VERSION;
    this.router;
    this.viewModel;
    this.pageInfo; //initialized by initTemplates
    this.server = new ServerAPI();
    this.storage = new CloudStorage(bucketBase);

    console.info(" VERSION: "+this.version);

    //this will replace console.{log,info,error,warn} with remote logging
    new Logger((buffer) => {
        return self.server.postJson("/api/log",{
            key: logKey,
            logs:buffer
        });
    });

    this.initTagManager();
    this.registerServiceWorker();

    this.setupPWA();

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
        search,
        newsletterSignup,
        sof,
        ergatasDonation,
        orgApp,
        pendingOrganizations,
        countrySelector,
        worker,
        profileForm,
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


    var code = utils.getURLParameter("code");
    var state= utils.getURLParameter("state") || window.location.pathname.replace(appBase,"")  ;
    var hash= window.location.hash;


    console.log("code: "+code+", state: "+state);


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


}
start(){

    //console.warn(" ============================== BINDINGS APPLIED =========================",(new Date()) - window.performance.timing.navigationStart);
    ko.applyBindings(this.viewModel);

    //mapUtils.testGeocoder();

    setTimeout(() =>{
        mapUtils.initMap();
        jQuery.getScript("https://www.google.com/recaptcha/api.js?render=6LdotL0ZAAAAALDh_JBTO_JC-CF4ZnSysamIHV3c").
            then(()=>{
                this.server.sendRecaptcha("initial_page_load");
            })
        this.initChatra();
        this.initSocialButtons();
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
    }else{
        console.warn("service worker API not found.Version: "+utils.browserVersion());
    }
}
initTemplates(){
    this.pageInfo = require("./data/page_info.json");
    //console.log("pageInfo: ",this.pageInfo);
    const pages = Object.keys(this.pageInfo);
    //console.log("pages: ",pages);

    const snippets = ["message-form"];
    this.templates={pages:[],snippets:[]};
    pages.forEach(name =>{
        this.templates.pages[name] = jQuery(require("./page-templates/"+name+".html"));
    });
    snippets.forEach(name =>{
        this.templates.snippets[name] = jQuery(require("./snippet-templates/"+name+".html"));
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
initSocialButtons(){
  jQuery.getScript("//s7.addthis.com/js/300/addthis_widget.js#pubid=ra-5f74b07edecb1557");
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
getSnippet(name){
    return this.templates.snippets[name];
}

initViewModel(authBaseUrl,clientId,redirect,appBase,appState){
    const self=this;
    const viewModel = {
        loginURL: authBaseUrl+"/authorize?client_id="+clientId+"&response_type=code&scope=offline_access&redirect_uri="+redirect,
        loggedInUser:ko.observable(),
        appState: appState,
        server: appState.server,
        da: appState.da,
        utils:utils,
        storage: appState.storage,
        search: appState.search,
        roles: ko.observable(),
        page: ko.observable(),
        //version: ko.observable("68"),
        version: ko.observable(self.version),

        selectedProfile: ko.observable(),
        userProfile: ko.observable(),
        showInstallBanner: ko.observable(false),
        pwaSupported: ko.observable(false),
        versionMessage: ko.observable(utils.unsupportedBrowserCheck()),
        updateApp: function(){},

        termsConfirmed: ko.observable(false),
        termsConfirmedCheckBox: ko.observable(false),
        
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
                        await Promise.all([
                            self.da.deleteUser(viewModel.loggedInUser().user_key()),
                            self.server.authPostJson("/api/deleteUser"),
                        ]);
                        dataLayer.push({event:'user','user-action':"deleted",user_id: viewModel.userId()});
                        //log user out
                        viewModel.signOut();
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
    }
    viewModel.isOwnProfile = function(){
        return viewModel.hasProfile() &&
               viewModel.selectedProfile().missionary_profile_key === viewModel.userProfile().missionary_profile_key();
    }
}
initRouter(appBase,authBaseUrl,authClientID){
    const viewModel=this.viewModel;
    const self=this;

    function setPage(pageName){

        var _setPage = function(){

            console.log("======= SETTING PAGE TO "+pageName+"================");
            viewModel.doTransition = false;
            if(self.pageInfo[pageName] && self.pageInfo[pageName].title){
                //if current doc title does not match new page title, then perform a transition
                viewModel.doTransition = document.title !== self.pageInfo[pageName].title;
            }
            viewModel.page(self.getPage(pageName).clone());
            if(self.pageInfo[pageName] && self.pageInfo[pageName].title){
                document.title = self.pageInfo[pageName].title;
            }

            //scroll to top of new page as long as no hash anchor link is present
            if( ! window.location.hash)
                $("html, body").animate({ scrollTop: 0},500);
            else{
                var offset = $(window.location.hash).offset() || {top:0}
                $("html, body").animate({ scrollTop: offset.top},500);
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
    function setLoggedInPage(pageName,redirect){
        if(viewModel.loggedIn())
            setPage(pageName);
        else //if redirect not set, use pageName
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
                console.log("item: ",item);
                if(item != null)
                    viewModel.search.filter.organizations.obs()([item.organization_key]);
                setSearch();
            })
    });
    router.add(/^search\/([-a-zA-Z0-9"' ]+)$/, async function (query) {
        console.log("query search : "+query);
        self.search.setQuery(query);
        setSearch();
    });
    router.add('profile/', async function () {
        if(viewModel.loggedIn()){
            if( ! await self.isUserVerified()){
                self.router.navigateTo("verify-email");
            } else if( ! viewModel.hasProfile() && ! viewModel.termsConfirmed()){
                await viewModel.loadProfile(viewModel.loggedInUser().user_key());
                setPage("confirm-sof");
            } else if( ! viewModel.hasProfile() &&  viewModel.termsConfirmed()){
                await viewModel.loadProfile(viewModel.loggedInUser().user_key());
                setPage("profile");
            }else{
                setPage("profile");
            }
        }else
            signInWithRedirect("profile");
    });
    router.add('verify-email/', async function () {
        //reset this value
        self.viewModel.verifyEmailSent(false);
        setPage("verify-email");
    });
    router.add('profile-detail/(:num)', async function (missionary_profile_key) {
        var profile;
        try{

            profile = await self.da.getProfileByKey(missionary_profile_key);
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
    router.add('signIn/', function () {
        console.log("sign in with no redirect",viewModel.loginURL);
        window.location=viewModel.loginURL;
    });
    router.add(/^signIn\/(.+)$/, function (redirectPage) {
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
    router.add('sof/', function () {
        //statement of faith
        setPage("sof");
    });
    router.add('privacy/', function () {
        setPage("privacy");
    });
    router.add('terms-of-service/', function () {
        setPage("terms-of-service");
    });
    router.add('donate/', function () {
        setPage("donate");
    });
    router.add('organization-review/(:num)', function (organization_key) {
        setLoggedInPage('organization-review');
    });
    router.add('organization-review/', function () {
        setLoggedInPage('organization-review');
    });
    router.add('reports/', function () {
        setLoggedInPage('reports');
    });
    router.add('learn/', function (name) {
        setPage("learn");
    });
    router.add('learn/{name}', function (name) {
        console.log("loading learn article "+name);
        setPage(name);
    });
    router.add('profile-saved/', function (name) {
        setPage("profile-saved");
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
        console.info("failed to refresh login. "+error.message,error);
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

setCookies(){
    if(this.viewModel.hasRole("debugger")){
        document.cookie = "debugmode=true;max-age="+(60*60*24);
        console.log("DEBUG MODE ON");
    }
}

/**
 * return a lookup for mapping 3 letter country codes to country information. 
 * @param {url} country data url 
 */
async countryLookup(url){
    const result = await jQuery.get(countryUrl);
    var lookup= {};
    console.log("countries: ",result);
    results.forEach((country) =>{
        lookup[country.alpha3Code] = {
            alpha3Code: country.alpha3Code,
            name: country.name,
            flag: country.flag,
            region: country.region,
            subregion: country.subregion,
        }
    })

}


} // end Client class


export default {Client};