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

    this.betaPassword="theharvestisplentiful";
    this.recaptchaSiteKey = process.env.GOOGLE_RECAPTCHA_SITE_KEY;
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

    //console.log("code, state: ",code,state);


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
    
    if(code)
        this.doLogin(state ,code);
    else{ //see if we can log user in based on refresh_token in cookie
        this.doRefresh();
        if(state)
            this.router.navigateTo(state);
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
                this.sendRecaptcha("initial_page_load");
            })
        this.initChatra();
        this.initSocialButtons();
    },5000);
}
getCurrentRootPage(appBase){
    return window.location.pathname.replace(appBase,"").replace(/\/.*/,"");
}
sendRecaptcha(action){
    const self=this;
    if(window.grecaptcha == null){ // not loaded yet
        console.warn("skipping recaptcha check as not loaded yet");
        return;
    }
    return new Promise((resolve,reject) =>{
        grecaptcha.ready(async function() {
            try{
                const token = await grecaptcha.execute(self.recaptchaSiteKey, {action: action});
                const result =  await self.server.postJson("/api/recaptcha",{ recaptchaToken:token,action:action });
                //console.log("recaptcha score: ",result);
                resolve(result.score);
            }catch(error){
                reject(error);
            }
        });
    });
}
setupPWA(){
    const self=this;
    alertify.dialog("installPrompt",function(){},true,'confirm');
    window.addEventListener('beforeinstallprompt', function(evt){
        console.log("got beforeinstallprompt event ");

        self.pwaEvent = evt;
        setTimeout(() =>{
            jQuery(".section-install").show();
        },60000)

        setTimeout(() =>{
            jQuery(".section-install").hide();
        },180000)
    });
    window.addEventListener('appinstalled', function(evt){
        console.log("user installed app");

        dataLayer.push({event:'pwa-install' });
    });

}
registerServiceWorker(){
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', function() {
            navigator.serviceWorker.register('/service-worker.js')
                .then((reg) => {
                    console.log('Service worker registered.', reg);
                });
        });
    }
}

initTemplates(){
    this.pageInfo = require("./data/page_info.json");
    console.log("pageInfo: ",this.pageInfo);
    delete this.pageInfo[this.betaPassword];
    const pages = Object.keys(this.pageInfo);
    console.log("pages: ",pages);

    //const pages = ['home','about','search','edit-profile','not-found',
                    //'org-application','profile-detail','statement-of-faith',
                    //'confirm-sof','privacy','organization-review',
                    //'terms-of-service','coming-soon','contact'];
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
        roles: ko.observable(),

        //initialize page to the page_content section sent by the server
        // The server inserts it to speed up first page loads.
        page: ko.observable(jQuery("#page_content")),
        profiles: ko.observableArray(),
        searchInProgress:ko.observable(false),
        selectedProfile: ko.observable(),
        featuredProfiles: ko.observableArray(),
        approvedOrganizations:ko.observableArray(),
        jobCatagories: ko.observableArray(),
        userProfile: ko.observable(),
        uploadAdditionalFilesFn: ko.observable(),
        uploadPictureFn: ko.observable(),

        sortBy: ko.observable(),
        searchResultsTemplate: ko.observable("list-results-template"),
        organizationApplication:ko.observable(),
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
            //console.log("search event: ",event);

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

            self.sendRecaptcha("save_profile");
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
                //update search results, as they may contain an out-of-date copy of this profile
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
        submitOrgApplication: async function(){
            console.log("submitting org app",viewModel.organizationApplication());
            const country_org_id = viewModel.organizationApplication().country_org_id();
            const user_key = viewModel.loggedInUser().user_key();
            try{
                //check to see if org exists and is denied, and inform user
                var status = await self.da.organizationStatus(country_org_id);
                if(status != null && status.length > 0){
                    if(status[0].status === "denied"){
                        alertify.error("Sorry, this organization has been previously reviewed, but was not approved");
                        return;
                    }
                    if(status[0].status === "pending"){
                        await self.da.insertOrganizationListener(status[0].organization_key,user_key);
                        alertify.success("Application submitted!");
                        self.router.navigateTo("");
                        return;
                    }
                }
                //else, if no status, then org does not yet exist
                var newOrg = await self.da.createOrganization(
                    ko.mapping.toJS(viewModel.organizationApplication()));
                console.log("new org: ",newOrg);
                await self.da.insertOrganizationListener(newOrg.organization_key,user_key);
                await self.server.postJson("/api/orgAppNotify",{
                    organization_key:newOrg.organization_key,
                    user_key: viewModel.loggedInUser().user_key()});
                alertify.success("Application submitted!");
                self.router.navigateTo("");
            }catch(error){
                if(error.status===409)
                    alertify.error("An organization with ID "+country_org_id+" is already available or is still under review")
                else
                    alertify.error("Failed to submit application");

            }
        },
        
    };
    this.viewModel=viewModel;

    viewModel.orgSelectizeOptions= {
        create:false,
        valueField: "organization_key",
        labelField:"display_name",
        searchField: "name",
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
    viewModel.nonProfitSelectizeOptions = {
        create:false,
        valueField: "name",
        labelField:"name",
        searchField:"name",
        load: function(query,callback){
            //console.log("loading options for query "+query);
            jQuery.get("/api/nonProfits/"+query).
                then(function(results){
                    //console.log("results: ",results);
                    callback(results.organizations);
                }).fail(function(error){
                    console.log("query failed: "+error.message,error);
                })
        },
        render: {
            option: function(data,escape){
                    return "<div>"+data.name+
                            "</br><span style='font-size:0.7em;'> "+
                                data.city+", "+data.state+"</span></div>";
            },
        },
        onItemAdd: function(value){
            var data,orgApp;
            data = this.options[value];
            orgApp = viewModel.organizationApplication();
            //console.log("onItemAdd: ",data);
            if(data != null && orgApp != null ){

                orgApp.name( data.name);
                orgApp.country_org_id(data.ein);
                orgApp.city(data.city);
                orgApp.state(data.state);
            }
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
    viewModel.getOrganization=function(organization_key) {
        //console.log("getting organization info for "+organization_key);
        organization_key = parseInt(organization_key); //TOOD: fix selectgize functions that set this to be a string 
        return viewModel.approvedOrganizations().find(function(org){
            return org.organization_key === organization_key;
        });
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
    viewModel.donate = function(profile,source){
        console.log("donate button clicked ",profile);

        dataLayer.push({event:'donate',
                   'donate-event-source':source,
                   missionary_profile_key:profile.missionary_profile_key,
                   'donate-level':1});
        var dialogContent = jQuery("<donate-popup params=\"donationUrl:'"+profile.data.donation_url+"',"+
                                "instructions: '"+ (profile.data.donate_instructions || "").trim() +"',"+
                                " missionary_profile_key: "+profile.missionary_profile_key+" ,da:da \"></donate-popup>");

        ko.applyBindings({da:self.da},dialogContent[0]);

        alertify.donatePopup("").set({
                transition: "zoom",
                basic: true,
            }).
            setContent(dialogContent[0]).
            resizeTo("30%","50%");
    };
    viewModel.donatePreview = function(url,instructions){

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
                console.log("failed to send contact message to server: "+error.message,error);
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
            console.log("failed to send contact message to server: "+error.message,error);
            alertify.error("Failed to send message, terribly sorry about that!");
        }
    };
    viewModel.doSearch=ko.computed(async function(){
        var searchResults;
        var filters = [];
        //console.log("start of doSearch");
        //var queryFilter = new Filter("search_text",new ILikeFilterAppender());

        //queryFilter.obs()(viewModel.query());

        //filters.push(queryFilter);
        for( var f in viewModel.filter){
            const filter = viewModel.filter[f];
            if(viewModel.filter.hasOwnProperty(f) && filter.isDefined()){
                filters.push(filter);

                dataLayer.push({event:'filter', 'filter-type':filter.name()});
            }
        }

        if(self.getCurrentRootPage(appBase) !== "search")
            return; 

        //console.log("doing search");
        viewModel.searchInProgress(true);
        try{
            searchResults = await self.da.profileSearch(filters);
            //console.log("filtered search results:",searchResults);
            viewModel.profiles(searchResults);
            viewModel.searchInProgress(false);
        }catch(error){
            viewModel.searchInProgress(false);
            console.error("profile search failed: "+error.message,error);
            alertify.error("Search failed");
        }

    }).extend({rateLimit:300,method:"notifyWhenChangesStop"});
    viewModel.sortResults = function(data){
        //sortBy value should look like "<fieldName>,<asc|desc>"
        console.log("sorting by ",viewModel.sortBy());
        var field,direction;
        var profiles = viewModel.profiles();
        var sortBy = viewModel.sortBy().split(",");
        field = sortBy[0];
        direction = sortBy[1] || "asc";

        if(field == null)
            return;

        profiles.sort(function(a,b){
            var av, bv, result;
            av=a[field];
            bv=b[field];

            if(av < bv) result=-1;
            else if(av > bv) result = 1;
            else result = 0;

            if(direction === "desc")
                result = result * -1;
            return result;
        });
        viewModel.profiles(profiles);
    };
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
    }
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
        alertify.prompt("Confirm Deletion of Account","Are you sure you want to delete your account? This CANNOT be undone."+
                    "<br>To conform deletion, please type DELETE into the box below:","",
                async function(evt,value){
                    console.log("prompt value: ",value);
                    if(value != "DELETE"){

                        alertify.message("Account was NOT deleted");
                        return;
                    }
                    try{
                        await Promise.all([
                            self.server.authPostJson("/api/deleteUser"),
                            self.da.deleteUser(viewModel.loggedInUser().user_key()),
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
        alertify.confirm("Flag Profile","Do you want to flag this profile as inappropriate in some way?",
            function(){
                console.warn("PROFiLE FLAGGED  /profile-detail/"+profile.missionary_profile_key);
                alertify.success("Thanks, someone will review this profile shortly");
            },function(){}).set("labels",{ok:"Yes",cancel:"no it's fine"});
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
    viewModel.browseForLogo= async function(orgApplication){
        console.log("showing logo file picker",orgApplication);

        const uploaderUtils = await import(/* webpackChunkName: "uppy", webpackPrefetch: true */ './upload');
        const uppy = uploaderUtils.orgUploader() ;
        //clear files
        uppy.getFiles().map( (file) =>{
            uppy.removeFile(file.id);
        });
        uppy.on('transloadit:complete', (assembly) => {
            console.log("logo upload complete: ",assembly.results);
            var url;
            if(assembly.results && assembly.results.resize_image &&
                assembly.results.resize_image.length > 0 && assembly.results.resize_image[0].url != null){
                var url = assembly.results.resize_image[0].url;
                url = url.replace(/^http/,"https");// so it matches our bucketBase pattern
                var path = url.replace(bucketBase,"");
                console.log("uploaded org logo path: ",path);
                orgApplication.logo_url(path);
                uppy.getPlugin('Dashboard').closeModal();
            }
          })
        uppy.getPlugin('Dashboard').openModal();
    }

    viewModel.browseForProfilePicture= async function(profile){
        console.log("showing file picker",profile);

        const uploaderUtils = await import(/* webpackChunkName: "uppy", webpackPrefetch: true */ './upload');
        const userId=viewModel.loggedInUser().external_user_id();
        const uppy = uploaderUtils.profileUploader(userId) ;
        //clear files
        uppy.getFiles().map( (file) =>{
            uppy.removeFile(file.id);
        });
        uppy.on('transloadit:complete', (assembly) => {
            console.log("profile picture upload complete: ",assembly.results);
            var url;
            if(assembly.results && assembly.results.resize_image &&
                assembly.results.resize_image.length > 0 && assembly.results.resize_image[0].url != null){
                var url = assembly.results.resize_image[0].url;
                url = url.replace(/^http/,"https");// so it matches our bucketBase pattern
                var path = url.replace(bucketBase,"");
                console.log("uploaded profile picture path: ",path);
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
        alertify.alert("Beta Tester Request","If you'd like to be a beta tester, click on the 'Help' button in the lower right corner to start a chat. "+
            "Enter your name, email address, and mention that you'd like to be a beta tester. We'll get back to you shortly. Thanks!");
    };
    viewModel.installApp = function(){

        console.log("confirmed installing app");
        jQuery(".section-install").hide();


        self.pwaEvent.prompt();
        self.pwaEvent.userChoice.then((choice)=>{
            if (choice.outcome === 'accepted') {
                console.log('User accepted the A2HS prompt', choice);
            } else {
                console.log('User dismissed the A2HS prompt', choice);
            }
            
        })
    };
            
}
async initOrganizations(){
    const viewModel=this.viewModel;

    try{
        viewModel.approvedOrganizations(await this.da.organizationList());
        viewModel.jobCatagories(await this.da.jobList());
        viewModel.featuredProfiles(await this.da.featuredProfiles());
    }catch(error){
        console.error("failed to init organizations: "+error.message,error);
    }
}
initRouter(appBase,authBaseUrl,authClientID){
    const viewModel=this.viewModel;
    const self=this;

    function setPage(pageName,title){
        viewModel.page(self.getPage(pageName).clone());
        if(self.pageInfo[pageName] && self.pageInfo[pageName].title)
            document.title = self.pageInfo[pageName].title;
        //if(pageName==="home" || pageName === "coming-soon") // keep HTML title for home page
            //document.title="Ergatas - Search for Missionaries";
        //else
            //document.title=title || pageName;
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
            setPage("coming-soon","home");
        else
            setPage("home");
    });
    router.add('search/', async function () {
        viewModel.filter.query.obs()("");
        //setting "" above will only trigger a search if it was not already ""
        // so here we make sure to trigger it so we do a new search
        // each time the search page is loaded
        viewModel.filter.query.obs().valueHasMutated();
        await mapUtils.initMap();
        setPage("search");
    });
    router.add(/^search\/([-a-zA-Z0-9"' ]+)$/, async function (query) {
        viewModel.filter.query.obs()(query);
        await mapUtils.initMap();
        setPage("search");
    });
    router.add('profile-post-sof/', async function () {
        self.sendRecaptcha("agree_sof");
        await mapUtils.initMap();
        setLoggedInPage('edit-profile','profile-post-sof');
    });
    router.add('profile/', async function () {
        if(viewModel.loggedIn()){
            if( ! viewModel.hasProfile()){
                await viewModel.loadProfile(viewModel.loggedInUser().user_key());
                //self.router.navigateTo("confirm-sof");
                setPage("confirm-sof","Edit Profile");
            }else{
                await mapUtils.initMap();
                viewModel.approvedOrganizations(await self.da.organizationList());
                setPage("edit-profile","Edit Profile");
            }
                
        }else
            signInWithRedirect("profile");
            //router.navigateTo("signIn/profile");
    });
    router.add('profile-detail/(:num)', async function (missionary_profile_key) {
        var profile;
        if(viewModel.selectedProfile() == null){
            try{
                profile = await self.da.getProfileByKey(missionary_profile_key);
                console.log("found profile; ",profile);
                viewModel.selectedProfile(profile);
                setPage("profile-detail","Profile");
            }catch(error){
                console.log("no profile found for missionary_profile_key",missionary_profile_key+". "+error.message,error);
                alertify.error("Profile not found");
            }
        }else //TODO: this doesn't seem correct
            setPage("profile-detail","Profile");
    });
    router.add('about/', function () {
        setPage("about");
    });
    router.add('contact/', function () {
        viewModel.contactMessageSent(false);
        setPage("contact");
    });
    router.add('org-application/', async function () {
        try{
            var newOrg = await self.da.newOrganization();
            viewModel.organizationApplication(ko.mapping.fromJS(newOrg));
            console.log("org app: ",viewModel.organizationApplication());
            viewModel.organizationApplication().name.extend({rateLimit:300,method: "notifyWhenChangesStop"});
            setLoggedInPage("org-application");
        }catch(error){
            console.error("failed to get new organization: "+error.message,error);
            alertify.error("Failed to load Organization Application page");
        }
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
    router.add('confirm-sof/', function () {
        setPage("confirm-sof","Edit Profile");
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

            self.sendRecaptcha("login");
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