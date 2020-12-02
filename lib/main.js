import * as utils from './client-utils';
import Logger from './logging'; 
import {DataAccess,FTSFilterAppender, ILikeFilterAppender, OverlapsFilterAppender, LessThanFilterAppender, 
    GreaterThanFilterAppender,ContainsFilterAppender} from './data-access';
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

import {sanitizeHtml} from './sanitize';
import { Filter } from './filter';
import * as mapUtils from './map';
import alertify from 'alertifyjs';
import { ServerAPI } from './server-api';

var Router = require('vanilla-router');


class Client {

constructor(){
    const self=this;
    var code,state;
    const bucketName = process.env.UPLOAD_BUCKET || "ergatas-public";
    const authClientID=process.env.AUTH_CLIENT_ID
    const authRedirect=process.env.REDIRECT_URL;
    const postgrestBase= process.env.POSTGREST_URL_BASE;
    const authBaseUrl=process.env.AUTH_URL_BASE;
    const appBase=process.env.APP_BASE || '/';
    const logKey = process.env.LOG_KEY;
    const bucketBase="https://storage.googleapis.com/"+bucketName+"/";

    //this.pageSize = 40; 
    this.pageSize = this.computePageSize();
    this.betaPassword="theharvestisplentiful";
    this.router;
    this.viewModel;
    this.pageInfo; //initialized by initTemplates
    //this will replace console.{log,info,error,warn} with remote logging
    this.server = new ServerAPI();

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
    this.server.token.subscribe((newToken) =>{
        //update da whenever the token is refreshed
        console.log("setting new JWT token in da after token obs update");
        self.da.setToken(newToken);
    });

    [profileCollection,
        searchResultsMap,
        locationInput,
        donatePopup,
        messagePopup,
        messageForm,
        newsletterSignup,
        sof,
        ergatasDonation,
        orgApp,
        countrySelector,
        fileCollection].forEach(c => c.register())

    alertify.defaults.notifier.delay=15;
    alertify.defaults.notifier.position="top-center";
    alertify.defaults.transition="zoom";
    this.initTemplates();


    //console.warn("+++++++++  mode: "+process.env.NODE_ENV+"  +++++++++++++++++++++++");

    
    this.initViewModel(authBaseUrl,authClientID,authRedirect,bucketBase,appBase);
    //ko.applyBindings(this.viewModel);
    //console.warn(" ============================== BINDINGS APPLIED =========================",(new Date()) - window.performance.timing.navigationStart);
    this.initRouter(appBase,authBaseUrl,authClientID);
    this.initOrganizations();

    //check for beta test mode
    if(document.cookie
            .split('; ')
            .find(row => row.startsWith('betatestmode')) != null)
        this.viewModel.restrictedMode(false);

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

    if(state.indexOf("/") === -1 && this.viewModel.page()[0].length===0 ) //state is just one path component
        state = undefined; //we assume the server will have filled in required page, so we don't do any navigation here
    console.log("final state: ",state);


    //do a test login here to see if  have a cookie that will keep us logged in
    // also, encrypt the cookies
    
    if(code){
        this.doLogin(state ,code);
    }else{ //see if we can log user in based on refresh_token in cookie
        this.doRefresh();
        if(state){
            this.router.check();
        }
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
getCurrentRootPage(appBase){
    return window.location.pathname.replace(appBase,"").replace(/\/.*/,"");
}

setupPWA(){
    const self=this;
    alertify.dialog("installPrompt",function(){},true,'confirm');
    window.addEventListener('beforeinstallprompt', function(evt){
        console.log("got beforeinstallprompt event ");

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

        dataLayer.push({event:'pwa-install' });
    });

}
registerServiceWorker(){
    var self=this;

    function listenForWaitingServiceWorker(reg, callback) {
        console.log("SW listening for sw changes");
        function awaitStateChange() {
            console.log("SW awaiting state change");
            reg.installing.addEventListener('statechange', function() {
                console.log("SW state change:",this.state );
                if (this.state === 'installed') callback(reg);
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


    function promptUserToRefresh(reg) {
        console.log("SW prompting to refresh");
        // this is just an example
        // don't use window.confirm in real life; it's terrible
        self.viewModel.updateApp = function(){
            console.log("SW updating app, as requested");
            if(reg && reg.waiting && reg.waiting.postMessage)
                reg.waiting.postMessage('skipWaiting');
            else
                console.error("Failed to update at users request, reg.waiting not defined");
            self.viewModel.showUpdateBanner(false);
        };
        self.viewModel.showUpdateBanner(true);
    }


    if ('serviceWorker' in navigator) {
        // reload once when the new Service Worker starts activating
        var refreshing;
        navigator.serviceWorker.addEventListener('controllerchange',
            function() {

                console.log("SW reloading page");
                if (refreshing) return;
                refreshing = true;
                window.location.reload();
            }
        );
        navigator.serviceWorker.register('/service-worker.js')
            .then((reg) => {
                console.log('SW Service worker registered.', reg);

                console.log("SW update 18");
                listenForWaitingServiceWorker(reg, promptUserToRefresh);
                setInterval(function(){
                    console.info("Checking for service worker update");
                    reg.update();
                },60*60*1000); //check for updates every hour
            });
    }else{
        console.warn("service worker API not found.Version: "+utils.browserVersion());
    }
}
computePageSize(){
    //get a rough idea of how many cards will fit on a screen
    const wh = $(window).height();
    const ww = $(window).width();
    const cardArea = 360 * 276; //profile card area, only needs to be aprroximate
    const unusedScreenArea = 500 * ww;
    const numCards = Math.ceil((wh*ww - unusedScreenArea) / cardArea) + 10;
    console.log("num cards per page: "+numCards);
    return numCards;
}
initTemplates(){
    this.pageInfo = require("./data/page_info.json");
    console.log("pageInfo: ",this.pageInfo);
    delete this.pageInfo[this.betaPassword];
    const pages = Object.keys(this.pageInfo);
    console.log("pages: ",pages);

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

initViewModel(authBaseUrl,clientId,redirect,bucketBase,appBase){
    const self=this;
    const viewModel = {
        restrictedMode: ko.observable(true), 
        loginURL: authBaseUrl+"/authorize?client_id="+clientId+"&response_type=code&scope=offline_access&redirect_uri="+redirect,
        loggedInUser:ko.observable(),
        //token: ko.observable(), 
        ///token: self.server.token,
        server: self.server,
        da: self.da,
        roles: ko.observable(),

        //initialize page to the page_content section sent by the server
        // The server inserts it to speed up first page loads.
        page: ko.observable(jQuery("#page_content")),
        profiles: ko.observableArray(),
        numSearchResults: ko.observable(), // not always the same as the length of profile because of paging
        searchInProgress:ko.observable(false),
        selectedProfile: ko.observable(),
        featuredProfiles: ko.observableArray(),
        approvedOrganizations:ko.observableArray(),
        jobCatagories: ko.observableArray(),
        userProfile: ko.observable(),
        uploadAdditionalFilesFn: ko.observable(),
        uploadPictureFn: ko.observable(),
        showInstallBanner: ko.observable(false),
        showUpdateBanner: ko.observable(false),
        versionMessage: ko.observable(utils.unsupportedBrowserCheck()),
        updateApp: function(){},

        sortBy: ko.observable(),
        searchResultsTemplate: ko.observable("list-results-template"),
        searchPageNumber: ko.observable(0),
        termsConfirmed: ko.observable(false),
        filter: {
            query: new Filter("document",new FTSFilterAppender()),
            name: new Filter("missionary_name",new ILikeFilterAppender(),500),
            organization: new Filter("organization_name",new ILikeFilterAppender(),500),
            skills: new Filter("job_catagory_keys",new OverlapsFilterAppender()),
            //location: new Filter("location",new ILikeFilterAppender()),
            supportLevelLte: new Filter("current_support_percentage",new LessThanFilterAppender()),
            supportLevelGte: new Filter("current_support_percentage",new GreaterThanFilterAppender()),
            profilesInCurrentMap: new Filter("missionary_profile_key",new ContainsFilterAppender(),null,true),
        },
        pageParameters:{},
        playSample: function(){
            jQuery("#ergatas-sample")[0].play();
        },
        navigateFn: function(path){
            return function(){
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
            query=viewModel.filter.query.obs()() || "";

            console.log("search source: ",searchSource);
            dataLayer.push({event:'handle-search',
                            'search-source-id':searchSource,
                            'search-query':query});

            console.log("query: ",query);
            self.router.navigateTo("search/"+query);
        },
        searchListView: function(){
            viewModel.filter.profilesInCurrentMap.clear();
            viewModel.searchResultsTemplate("list-results-template");
        },
        searchMapView: function(){
            viewModel.searchResultsTemplate("map-results-template");

        },
        saveProfile: async function(form){
            var profile;
            var data ;
            var reloadedProfile;

            self.server.sendRecaptcha("save_profile");
            profile = viewModel.userProfile();
            console.log("create Profile: ",profile);


            try{

                if(viewModel.uploadAdditionalFilesFn() != null){
                    await viewModel.uploadAdditionalFilesFn()();
                }

                data = ko.mapping.toJS(profile);

                if( ! viewModel.hasProfile()){
                    reloadedProfile =  await self.da.createProfile(data);
                    dataLayer.push({event:'profile','profile-action':"saved-new"});
                }else{
                    reloadedProfile =  await self.da.updateProfile(profile.missionary_profile_key(),data);
                    dataLayer.push({event:'profile','profile-action':"saved-existing"});
                }

                ko.mapping.fromJS(reloadedProfile,null,viewModel.userProfile);
                self.router.navigateTo("");
                alertify.success("Profile saved");
            }catch(error){
                console.error("failed to create or update profile. "+error.message,error);
                if(error.status === 401){
                    alertify.error("Session expired, could not save your profile. Please log-in again.");
                }else
                    alertify.error("Failed to save profile");
            }

        },
        loadProfile: async function(user_key){
            console.log("loading profile by user_key="+user_key);
            console.log("current profile value: ",viewModel.userProfile());
            var profileResults,profile;
            try{
                profileResults = await self.da.getProfileByUser(user_key)
                console.log("loading profile result: ",profileResults);
                if(profileResults.length===1){
                    profile= profileResults[0];
                }else{
                    profile = await self.da.newProfile();
                    dataLayer.push({event:'profile','profile-action':"started-profile"});
                    profile.user_key=viewModel.loggedInUser().user_key();
                }
                if(viewModel.userProfile() == null)
                    viewModel.userProfile(ko.mapping.fromJS(profile));
                else
                    ko.mapping.fromJS(profile,null,viewModel.userProfile);
            }catch(error){
                console.error("failed to load profile for "+user_key+". "+error.message,error);
                alertify.error("Failed to load profile"); 
            }
        },
        
    };
    this.viewModel=viewModel;

    viewModel.orgSelectizeOptions= {
        create:false,
        valueField: "organization_key",
        labelField:"display_name",
        searchField: ["name","dba_name"],
        render: {
            option: function(data,escape){
                var text=data.name
                if(data.dba_name != null && data.dba_name != "")
                    text=data.dba_name +"  (registered as "+data.name+")";
                return "<p>"+text+"</p>";

            },
        },

        onInitialize: function(){
            var api=this;
            var obs=viewModel.approvedOrganizations;
            ko.bindingHandlers.selectize.utils.setOptions(api,obs);
            ko.bindingHandlers.selectize.utils.watchForNewOptions(api,obs);

            if(viewModel.userProfile() != null && viewModel.userProfile().data.organization_key() != null)
                ko.bindingHandlers.selectize.utils.setItems(api,viewModel.userProfile().data.organization_key);
            
        },
    
    };
    
    viewModel.jobSelectizeOptions= {
        create:false,
        valueField: "job_catagory_key",
        labelField:"catagory",
        searchField: "catagory",
        plugins:['remove_button'],
        maxItems:10,
        onInitialize: function(){
            var api=this;

            //console.log("select job catagories: ",viewModel.userProfile() && viewModel.userProfile().profile_jobs_view());

            ko.bindingHandlers.selectize.utils.setOptions(api,viewModel.jobCatagories);
            ko.bindingHandlers.selectize.utils.watchForNewOptions(api,viewModel.jobCatagories);

            if(viewModel.userProfile() != null && viewModel.userProfile().data.job_catagory_keys() != null)
                ko.bindingHandlers.selectize.utils.setItems(api,viewModel.userProfile().data.job_catagory_keys);
        },
        onObsUpdate: function(api, value){
            console.log("new value set on observable: ",value());
            api.clear(true);
            ko.bindingHandlers.selectize.utils.setItems(api,value);
        },
    };
    viewModel.jobSelectizeFilterOptions= {
        create:false,
        valueField: "job_catagory_key",
        labelField:"catagory",
        searchField: "catagory",
        plugins:['remove_button'],
        maxItems:10,
        onInitialize: function(){
            var api=this;
            ko.bindingHandlers.selectize.utils.setOptions(api,viewModel.jobCatagories);
            ko.bindingHandlers.selectize.utils.watchForNewOptions(api,viewModel.jobCatagories);
        },
        onObsUpdate: function(api, value){
            console.log("new value set on observable: ",value());
            api.clear(true);
            ko.bindingHandlers.selectize.utils.setItems(api,value);
        },

    };
    viewModel.loggedIn= ko.computed(function(){
        return viewModel.loggedInUser() != null;
    });
    viewModel.hasProfile = ko.computed(function(){
        return viewModel.userProfile() != null && viewModel.userProfile().missionary_profile_key() != null;
    });
    viewModel.jobCatagoryArray = function(job_catagory_keys,asObject){
        if(job_catagory_keys == null){
            return [];
        }
        return job_catagory_keys.map(function(job_key){
            var job;
            job_key = parseInt(job_key);
            job=viewModel.jobCatagories().find(function(catagory){
                return catagory.job_catagory_key === job_key;
            });
            if(job!=null){
                if(asObject === true)
                    return {
                        name: job.catagory,
                        key: job_key,
                    } ;
                else
                    return job.catagory;
            }else 
                return undefined;
        }).sort((a,b) =>{
            if(asObject === true){
                if(a.name < b.name) return -1;
                else if (a.name > b.name) return 1;
                else return 0;
            }else{
                if(a < b) return -1;
                else if (a > b) return 1;
                else return 0;
            }
        });


    };
    viewModel.getOrganization= function(organization_key) {
        //console.log("getting organization info for "+organization_key);
        organization_key = parseInt(organization_key); //TOOD: fix selectgize functions that set this to be a string 


        var org = viewModel.approvedOrganizations().find(function(org){
            return org.organization_key === organization_key;
        });
        return org;
    };
    viewModel.organizationDisplayName = function(org){
        if(org.dba_name != null && org.dba_name !== ""){
            return org.dba_name;
        }
        return org.name;
    };
    viewModel.organizationRegisteredName = function(org){
        if(org.dba_name != null && org.dba_name !== ""){
            return "(registered as "+org.name+")";
        }
        return "";
    }

    viewModel.selectProfile = function(data){
        console.log("selected profile: ",data);
        viewModel.selectedProfile(data);
        self.router.navigateTo('profile-detail/'+data.missionary_profile_key);
    };


    alertify.dialog("donatePopup",function(){},true,'alert');
    var displayDonatePopup=function(missionary_profile_key, donation_url,instructions){
        var dialogContent = jQuery("<donate-popup params=\"donationUrl:'"+donation_url+"',"+
                                "instructions: instructions,"+
                                " missionary_profile_key: "+missionary_profile_key+" ,da:da \"></donate-popup>");

        ko.applyBindings({
                da:self.da, 
                instructions: (instructions || "").trim(),
            },dialogContent[0]);

        alertify.donatePopup("").set({
                transition: "zoom",
                basic: true,
            }).
            setContent(dialogContent[0]).
            resizeTo("30%","50%");
    };
    viewModel.donate = function(profile,source){
        console.log("donate button clicked ",profile);
        dataLayer.push({event:'donate',
                   'donate-event-source':source,
                   missionary_profile_key:profile.missionary_profile_key,
                   'donate-level':1});

        displayDonatePopup(profile.missionary_profile_key,profile.data.donation_url,profile.data.donate_instructions)
       
    };
    viewModel.donatePreview = function(url,instructions){

        displayDonatePopup(0,url,instructions);
        /*
        var dialogContent = jQuery("<donate-popup params=\"donationUrl:'"+url+"',"+
                                "instructions: '"+ (instructions || "").trim() +"',"+
                                " missionary_profile_key: 0 ,da:da \"></donate-popup>");

        ko.applyBindings({da:self.da},dialogContent[0]);

        alertify.donatePopup("").set({
                transition: "zoom",
                basic: true,
            }).
            setContent(dialogContent[0]).
            resizeTo("30%","50%");
            */
    };
   
    viewModel.contactMissionaryFn = function(profile){
        return async function(name, email,message){
            console.log("sending message to missionary...");
            try{
                if(email != null && name != null && message != null && message != "")
                    await self.server.postJson("/api/contact/setup",{
                        fromEmail: email,
                        name: name,
                        message: message,
                        profileUserId: profile.external_user_id,
                    });
                    alertify.success("Message away!");
            }catch(error){
                console.error("failed to send contact message to server: "+error.message,error);
                alertify.error("Failed to send message, terribly sorry about that!");
            }
        }
    };
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
                dataLayer.push({event:'contact-us-message' });
            }
        }catch(error){
            console.error("failed to send contact message to server: "+error.message,error);
            alertify.error("Failed to send message, terribly sorry about that!");
        }
    };
    viewModel.resetSearchPageNumber = ko.computed(function(){
        //poke each filter value (via isDefined), and sortBy, to register dependency on value changes

        var sortBy = viewModel.sortBy();
        for( var f in viewModel.filter){
            const filter = viewModel.filter[f];
            viewModel.filter.hasOwnProperty(f) && filter.isDefined();
        }
        //console.log("FILTER VALUE CHANGE, resetting page to 0");

        //whenever a filter value changes, reset the page number to 0
        viewModel.searchPageNumber(0);
        //also take the opportunity to re-compute the page size in case the screen size has changed
        self.pageSize = self.computePageSize();
       
    });
    viewModel.doSearch=ko.computed(async function(){
        var searchResults;
        var filters = [];
        var page = viewModel.searchPageNumber();
        var pageSize = self.pageSize;
        var range;
        var sortBy,field,direction;

        if(viewModel.sortBy() == null || viewModel.sortBy() === ""){
            field="rank";
            direction="desc";
        }else{
            sortBy = viewModel.sortBy().split(",");
            field = sortBy[0];
            direction = sortBy[1] || "asc";
        }
        //console.log("start of doSearch");

        for( var f in viewModel.filter){
            const filter = viewModel.filter[f];
            if(viewModel.filter.hasOwnProperty(f) && filter.isDefined()){
                filters.push(filter);
                dataLayer.push({event:'filter', 'filter-type':filter.name()});
            }
        }

        if(self.getCurrentRootPage(appBase) !== "search")
            return; 

        //console.log("doing search. page: "+page+", pageSize: "+pageSize+", num search results: "+viewModel.numSearchResults());
        viewModel.searchInProgress(true);
        try{
            if(viewModel.filter.profilesInCurrentMap.isDefined()){ // query for map view, no length restriction
                page = 0;
                viewModel.searchPageNumber(0);
                searchResults = await self.da.profileSearch(filters,null,field,direction);
                viewModel.numSearchResults(searchResults.data.length);
            }else{
                if( !(page > 0 && (pageSize*page) >= viewModel.numSearchResults() )){
                    range = String(pageSize*page) +"-"+String( pageSize*(page+1)-1  );
                    //console.log("range calc. page: "+page+", pageSize:"+pageSize+", range: "+range);
                    searchResults = await self.da.profileSearch(filters,range,field,direction);
                    viewModel.numSearchResults(searchResults.numResults);
                }//else console.log("page is past end of results: "+page);
            }
            //console.log("filtered search results:",searchResults);
            if(searchResults!= null){
                if(page === 0 )
                    viewModel.profiles(searchResults.data);
                else
                    viewModel.profiles(viewModel.profiles().concat(searchResults.data));
            }
            viewModel.searchInProgress(false);
        }catch(error){
            viewModel.searchInProgress(false);
            console.error("profile search failed: "+error.message,error);
            alertify.error("Search failed");
        }

    }).extend({rateLimit:300,method:"notifyWhenChangesStop"});
  
    viewModel.pendingOrganizations = ko.observableArray();
    viewModel.setOrgsNeedingReview = async function(){
            console.log("getting orgs for approval");
            var orgs;
            try{
                orgs = await self.da.organizationsNeedingReview();
            }catch(error){
                console.error("failed to get list of orgs needing review. "+error.message,error);
                alertify.error("Failed to get organization list");
                orgs = [];
            }
            //console.log("orgs: ",orgs);
            viewModel.pendingOrganizations(orgs);
    };
    viewModel.setOrgStatus=async function(organization_key,status){
        try{
            await self.da.setOrganizationApprovalStatus(organization_key,status);
            await self.server.authPostJson("/api/notifyOrgUpdate",{organization_key:organization_key});

            await viewModel.setOrgsNeedingReview(); //reload list
        }catch(error){
            console.error("failed to set approval state for org "+organization_key+". "+error.message,error);
            alertify.error("Failed to set approval state");
        }
    };
    viewModel.orgLogoUrl = function(urlPostfix){
        if(urlPostfix != null && urlPostfix != "")
            return bucketBase+urlPostfix;
        return "";
    };
    viewModel.fullUrlToRelative = function(fullUrl){
        return fullUrl.replace(bucketBase,"");
    };
    viewModel.profilePictureUrl = function(picture_url){
        var url;

        if(picture_url != null && picture_url !== "")
            url =  bucketBase +picture_url;
        else
            url = "/img/unknown_person.svg";

        //console.log("profile pic url. raw: "+picture_url+", final: "+url);
        return url;
    };
    viewModel.replaceProfilePicture= async function(){
        console.log("replacing profile image");
        var path = viewModel.userProfile().data.picture_url();
        var filename = path.replace(/^.*?([^/\\&\?]+\.\w{3,4}(?=([\?&].*$|$))).*$/,"$1");
        console.log("url filename: ",filename);

        try{

            await self.server.postJson("/api/removeUserFile",{filename:filename});
        }catch(error){
            console.warn("failed to remove old profile picture "+filename+", "+error.message,error);
        }

        viewModel.userProfile().data.picture_url("");
        
    };

    viewModel.collectionControls = {
        selectProfile: viewModel.selectProfile,
        getOrganization: viewModel.getOrganization,
        jobNames: viewModel.jobCatagoryArray,
        pictureUrl: viewModel.profilePictureUrl,
        searchInProgress: viewModel.searchInProgress,
        searchByArea: function(neLat,neLong,swLat,swLong){
            return self.da.profileSearchByArea(neLat,neLong,swLat,swLong);
        },
        searchPageNumber: viewModel.searchPageNumber,
    };

    viewModel.sanitizeHtml=sanitizeHtml;
    viewModel.invalidInput = function(data,event){
        console.log("invalid input ",event);
        jQuery(event.target).toggleClass("error",true);
    };
    viewModel.checkValidity= function(data,event){
        var el = event.target;
        el.checkValidity();
        console.log("validity: ",el.validity);
        jQuery(el).toggleClass("error",! el.validity.valid);
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
                        dataLayer.push({event:'user','user-action':"deleted"});
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
    viewModel.flagProfile = function(profile){
        alertify.prompt("Report Profile","If this profile is inappropriate in some way, please let us know why:",
            "",
            function(evt,message){
                console.warn("PROFiLE FLAGGED  /profile-detail/"+profile.missionary_profile_key,message);
                alertify.success("Thanks, someone will review this profile shortly");
            },function(){}).set("labels",{ok:"Submit"});
    };
    viewModel.toggleFilterPanel = function(){
        console.log("toggling filter panel");
        jQuery(".cd-panel").toggleClass("cd-panel--is-visible");
        //alertify.alert("hi").set({resizable:true,basic:true}).resizeTo('50%','100%').moveTo(0,0)
    };
    viewModel.removeJobFromFilter=function(jobKey){
        //console.log("removing "+jobKey+" from skills filter");
        var skills = viewModel.filter.skills.obs();
        if(skills() == null)
            return;
        skills(skills().filter((key) => {
            return parseInt(key) !== parseInt(jobKey);
        }));
        if(skills().length === 0)
            skills(undefined);
    };
    viewModel.clearFilters= function(){
        for( var f in viewModel.filter){
            const filter = viewModel.filter[f];
            if(viewModel.filter.hasOwnProperty(f) && filter.isDefined()){
                filter.clear();
            }
        }
    };
    viewModel.browseForProfilePicture= async function(profile){
        console.log("showing file picker",profile);

        const uploaderUtils = await import(/* webpackChunkName: "uppy", webpackPrefetch: true */ './upload');
        const userId=viewModel.loggedInUser().external_user_id();
        const uppy = uploaderUtils.profileUploader(userId) ;
        //clear files
        uppy.getFiles().map( (file) =>{
            uppy.removeFile(file.id);
        });
        uppy.on('transloadit:complete', async (assembly) => {
            console.log("profile picture upload complete: ",assembly.results);
            var url;
            if(assembly.results && assembly.results.resize_image &&
                assembly.results.resize_image.length > 0 && assembly.results.resize_image[0].url != null){
                var url = assembly.results.resize_image[0].url;
                url = url.replace(/^http/,"https");// so it matches our bucketBase pattern
                var path = url.replace(bucketBase,"");
                console.log("uploaded profile picture path: ",path);

                //see if we have an old profile picture to remove first
                if(profile.picture_url() != null && profile.picture_url() != ""){                        
                    console.info("removing old profile picture: "+profile.picture_url());
                    try{
                        var filename = profile.picture_url().replace(/.*\//,"");
                        await self.server.authPostJson("/api/removeUserFile",{filename:filename});
                    }catch(error){
                        console.error("failed to remove old profile picture: "+error.message);
                    }
                }

                profile.picture_url(path);
                uppy.getPlugin('Dashboard').closeModal();
            }
          })
        uppy.getPlugin('Dashboard').openModal();
    }
    viewModel.betaTesterLogin = function(){
        alertify.prompt("Beta Tester Login","Enter the password: ","",function(event,value){
            console.log("beta tester login attempt");
            if(value === self.betaPassword ){
                console.log("beta tester login succeeded");
                viewModel.restrictedMode(false);
                document.cookie = "betatestmode=true;max-age="+(60*60*24*7);
                self.router.navigateTo("");
                alertify.success("You're in!")
            }else{
                console.log("beta tester login failed");
                alertify.error("Sorry, that was not the correct password");

            }
        },function(){});

    };
    viewModel.betaTesterRequest = function(){
        console.info("beta tester request link clicked");
        const message = "If you'd like to be a beta tester, "+
            "enter your name and email address below and mention that you'd like to be a beta tester. We'll get back to you shortly. Thanks!";
        self.router.navigateTo("/contact?message="+message);
        //alertify.alert("Beta Tester Request","If you'd like to be a beta tester, click on the 'Help' button in the lower right corner to start a chat. "+
            //"Enter your name, email address, and mention that you'd like to be a beta tester. We'll get back to you shortly. Thanks!");
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

    viewModel.filter.query.obs().subscribe(function(newValue){
        var path = window.location.pathname;
        if(path.startsWith("/search/") || path=== "/search")
            history.replaceState({},'',"/search/"+(newValue || ""));
    });
    viewModel.verifyEmailSent=ko.observable(false);
    viewModel.resendVerifyEmail = function(){
        self.server.authPostJson("/api/resendVerifyEmail").
            then(function(){                    
                console.log("verify email sent");
                viewModel.verifyEmailSent(true);
            })

    }
            
}
async initOrganizations(){
    const viewModel=this.viewModel;

    try{
        this.loadApprovedOrganizations();
        viewModel.jobCatagories(await this.da.jobList());
        viewModel.featuredProfiles(await this.da.featuredProfiles());
    }catch(error){
        console.error("failed to init organizations: "+error.message,error);
    }
}
async loadApprovedOrganizations(forceReload){
    var currentOrgs = this.viewModel.approvedOrganizations();
    if(forceReload===true || currentOrgs == null || currentOrgs.length === 0){
        console.info("reloading org list");
        this.viewModel.approvedOrganizations(await this.da.organizationList());
    }else
        console.log("not reloading org list, already set and not forced ",this.viewModel.approvedOrganizations());
}
initRouter(appBase,authBaseUrl,authClientID){
    const viewModel=this.viewModel;
    const self=this;

    function setPage(pageName){
        //console.log("======= SETTING PAGE TO "+pageName+"================");
        viewModel.page(self.getPage(pageName).clone());
        if(self.pageInfo[pageName] && self.pageInfo[pageName].title)
            document.title = self.pageInfo[pageName].title;

        //scroll to top of new page as long as no hash anchor link is present
        if( ! window.location.hash)
            $("html, body").animate({ scrollTop: 0},500);
    }
    function setLoggedInPage(pageName,redirect){
        if(viewModel.loggedIn())
            setPage(pageName);
        else //if redirect not set, use pageName
            signInWithRedirect(redirect || pageName);
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
        if(viewModel.restrictedMode())
            setPage("coming-soon");
        else
            setPage("home");
    });
    router.add('search/', async function () {
        viewModel.filter.query.obs()("");
        //setting "" above will only trigger a search if it was not already ""
        // so here we make sure to trigger it so we do a new search
        // each time the search page is loaded
        viewModel.filter.query.obs().valueHasMutated();
        await self.loadApprovedOrganizations();
        await mapUtils.initMap();

        //scroll to top before setting page so we don't trigger the infinite scroll function
        window.scrollTo(0,0);

        setPage("search");
    });
    router.add(/^search\/([-a-zA-Z0-9"' ]+)$/, async function (query) {
        viewModel.filter.query.obs()(query);
        await self.loadApprovedOrganizations();
        await mapUtils.initMap();

        //scroll to top before setting page so we don't trigger the infinite scroll function
        window.scrollTo(0,0);

        setPage("search");
    });
    router.add('profile-post-sof/', async function () {

        if( ! await self.isUserVerified()){
            self.router.navigateTo("verify-email");
        }else{
            self.server.sendRecaptcha("agree_sof");
            await mapUtils.initMap();
            setLoggedInPage("profile",'profile-post-sof');
        }
    });
    router.add('profile/', async function () {
        if(viewModel.loggedIn()){
            if( ! await self.isUserVerified()){
                self.router.navigateTo("verify-email");
            } else if( ! viewModel.hasProfile()){
                await viewModel.loadProfile(viewModel.loggedInUser().user_key());
                setPage("confirm-sof");
            }else{
                await mapUtils.initMap();
                await self.loadApprovedOrganizations();
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
            await self.loadApprovedOrganizations();
            
            profile = await self.da.getProfileByKey(missionary_profile_key);
            console.log("found profile; ",profile);
            viewModel.selectedProfile(profile);
            setPage("profile-detail");
        }catch(error){
            console.error("no profile found for missionary_profile_key",missionary_profile_key+". "+error.message,error);
            alertify.error("Profile not found");
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
        setPage("statement-of-faith");
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
        viewModel.setOrgsNeedingReview();
        setLoggedInPage('organization-review');
    });
    router.add('organization-review/', function () {
        viewModel.setOrgsNeedingReview();
        setLoggedInPage('organization-review');
    });
    router.add(self.betaPassword+"/", function () {
        console.log("direct beta link");
        viewModel.restrictedMode(false);
        document.cookie = "betatestmode=true;max-age="+(60*60*24*7);
        self.router.navigateTo("");
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

        if( ! self.viewModel.loggedIn()){
            console.log("reloading user during refresh");
            var userResults = await self.da.getUser(tokenResult.userId);
            if(userResults.length === 1){
                console.log("logged in user: ",userResults[0]);
                var user = userResults[0];
                user.email= tokenResult.email; //not saved, just displayed on page
                self.viewModel.loggedInUser(ko.mapping.fromJS(user));
            }
        }

        if( ! self.viewModel.hasProfile()){
            console.log("reloading profile during refresh");
            await self.viewModel.loadProfile(self.viewModel.loggedInUser().user_key());
        }
    }catch(error){
        console.warn("failed to refresh login. "+error.message,error);
    }
    console.log("token refresh done");
}
//doRefreshFn(){
//    //this is needed for proper 'this' scoping
//    var self = this;
//    return function(){
//        return self.doRefresh();
//    }
//}
//updateToken(tokenResult){
//    console.log("updating token");
//    this.viewModel.token(tokenResult.access_token); 
//    this.viewModel.roles(tokenResult.roles);
//    this.da.setToken(tokenResult.access_token);
//}
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
            dataLayer.push({event:'user','user-action':"login"});
            try{
                userResults = await self.da.getUser(tokenResult.userId);
                if(userResults.length === 1){
                    console.log("logged in user: ",userResults[0]);
                    user = userResults[0];
                }else{ //user not found
                    newUser=true;
                    user = await self.da.createUser(tokenResult.userId);
                    dataLayer.push({event:'user','user-action':"created"});
                    console.log("new user record: ",user);
                }
                user.email= tokenResult.email; //not saved, just displayed on page
                viewModel.loggedInUser(ko.mapping.fromJS(user));
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


} // end Client class


export default {Client};