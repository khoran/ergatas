import * as utils from './client-utils';
import Logger from './logging'; 
import {DataAccess, ILikeFilterAppender, OverlapsFilterAppender, LessThanFilterAppender, ContainsFilterAppender} from './data-access';
import {AppError} from './app-error';
import * as profileCollection from  './components/profile-collection';
import * as searchMap from  './components/search-results-map';
import * as locationInput from  './components/location-input';
import * as fileCollection from  './components/file-collection';
import * as donatePopup from  './components/donate-popup';

import {sanitizeHtml} from './sanitize';
import { Filter } from './filter';


var Router = require('vanilla-router');


class Client {

constructor(){
    var code,state,userState;
    const bucketName = process.env.UPLOAD_BUCKET || "ergatas-public";
    const authClientID=process.env.AUTH_CLIENT_ID
    const authRedirect=process.env.REDIRECT_URL;
    const postgrestBase= process.env.POSTGREST_URL_BASE;
    const authBaseUrl=process.env.AUTH_URL_BASE;
    const appBase=process.env.APP_BASE || '/';
    const logKey = process.env.LOG_KEY;
    const bucketBase="https://storage.googleapis.com/"+bucketName+"/";

    this.recaptchaSiteKey = process.env.GOOGLE_RECAPTCHA_SITE_KEY;
    this.mapAPIKey = process.env.HERE_MAP_API_KEY;
    this.router;
    this.viewModel;
    //this will replace console.{log,info,error,warn} with remote logging
    new Logger((buffer) => {
        return utils.postJson("/api/log/"+logKey,buffer);
    });

    this.da = new DataAccess(postgrestBase);

    [profileCollection,
        searchMap,
        locationInput,
        donatePopup,
        fileCollection].forEach(c => c.register())

    this.initTemplates();


    
    this.initViewModel(authBaseUrl,authClientID,authRedirect,bucketBase);
    ko.applyBindings(this.viewModel);
    this.initOrganizations();
    this.initRouter(appBase,authBaseUrl,authClientID);
    this.initMap(this.mapAPIKey);



    code = utils.getURLParameter("code");
    state= utils.getURLParameter("state");
    userState = utils.getURLParameter("userState");

    console.log("code: ",code);
    if(code != null && userState != null && userState==="Authenticated"){
        this.doLogin(code,state);
    }else{
        this.router.navigateTo(window.location.pathname.replace(appBase,""));
    }

    this.sendRecaptcha("initial_page_load");
}
sendRecaptcha(action){
    const self=this;
    console.log("site key: "+self.recaptchaSiteKey);
    return new Promise((resolve,reject) =>{
        grecaptcha.ready(async function() {
            try{
                const token = await grecaptcha.execute(self.recaptchaSiteKey, {action: action});
                const result =  await utils.postJson("/api/recaptcha",{ token:token,action:action });
                console.log("recaptcha score: ",result);
                resolve(result.score);
            }catch(error){
                reject(error);
            }
        });
    });
}

initTemplates(){
    const pages = ['home','about','search','edit-profile','not-found',
                    'org-application','profile-detail','statement-of-faith',
                    'confirm-sof','privacy','organization-review'];
    const snippets = ['statement-of-faith'];
    this.templates={pages:[],snippets:[]};
    pages.forEach(name =>{
        this.templates.pages[name] = jQuery(require("./page-templates/"+name+".html"));
    });
    snippets.forEach(name =>{
        this.templates.snippets[name] = jQuery(require("./snippet-templates/"+name+".html"));
    });
}
getPage(name){
    return this.templates.pages[name];
}
getSnippet(name){
    return this.templates.snippets[name];
}
async initMap(mapAPIKey){

    // doesn't work // await import(/* webpackChunkName: "here-maps", webpackPrefetch: true */ './map-chunk');
    const platform =new H.service.Platform({
        'apikey': mapAPIKey
    });
    console.log("created platform ",platform);
    this.viewModel.mapPlatform(platform);
}

initViewModel(authBaseUrl,clientId,redirect,bucketBase){
    const self=this;
    const viewModel = {
        loginURL: authBaseUrl+"/authorize?client_id="+clientId+"&response_type=code&redirect_uri="+redirect,
        query: ko.observable(),
        loggedInUser:ko.observable(),
        token: ko.observable(), 
        page: ko.observable(self.getPage("home")),
        profiles: ko.observableArray(),
        selectedProfile: ko.observable(),
        featuredProfiles: ko.observableArray(),
        approvedOrganizations:ko.observableArray(),
        jobCatagories: ko.observableArray(),

        mapPlatform: ko.observable(),
        //mapPlatform: ko.observable(self.platform),
     //   mapPlatform: ko.pureComputed({
     //       read: async function(){
     //           console.warn("++++++    creating new platform object +++++++++++++++++++++++++");
     //           return new H.service.Platform({
     //               'apikey': self.mapAPIKey
     //           });  
     //       },
     //       deferEvaluation: true
     //   }),

        userProfile: ko.observable(),
        uploadAdditionalFilesFn: ko.observable(),
        uploadPictureFn: ko.observable(),

        sortBy: ko.observable(),
        searchResultsTemplate: ko.observable("list-results-template"),
        organizationApplication:ko.observable(),
        filter: {
            name: new Filter("missionary_name",new ILikeFilterAppender()),
            organization: new Filter("organization_name",new ILikeFilterAppender()),
            skills: new Filter("job_catagory_keys",new OverlapsFilterAppender()),
            location: new Filter("location",new ILikeFilterAppender()),
            supportLevel: new Filter("current_support_percentage",new LessThanFilterAppender()),
            profilesInCurrentMap: new Filter("missionary_profile_key",new ContainsFilterAppender()),
        },
        playSample: function(){
            jQuery("#ergatas-sample")[0].play();
        },
        navigateFn: function(path){
            return function(){
                self.router.navigateTo(path);
            }
        },
        signOut: function(){
            viewModel.loggedInUser(undefined);
            self.router.navigateTo("signOut");
            viewModel.userProfile(undefined);
        },
        handleSearch: function(data,event){
            var query;
            var searchSource;

            if(event.type!=="click" && event.keyCode != 13) 
                return;
            //console.log("search event: ",event);

            searchSource = event.currentTarget.id.replace("-input","").replace("-btn","");
            query=viewModel.query();

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

            this.sendRecaptcha("save_profile");
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

                viewModel.userProfile(ko.mapping.fromJS(reloadedProfile));

                alertify.success("Profile saved");
                self.router.navigateTo("");
            }catch(error){
                console.error("failed to create or update profile",error);
                alertify.error("Failed to save profile");
            }


        },
        loadProfile: async function(user_key){
            console.log("loading profile by user_key="+user_key);
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
                viewModel.userProfile(ko.mapping.fromJS(profile));
            }catch(error){
                console.error("failed to load profile for "+user_key,error);
                alertify.error("Failed to load profile"); 
            }
        },
        submitOrgApplication: async function(){
            console.log("submitting org app",viewModel.organizationApplication());
            try{
                //TOOD: check to see if org exists and is denied, and inform user
                var newOrg = await self.da.createOrganization(
                    ko.mapping.toJS(viewModel.organizationApplication()));
                alertify.success("Application submitted!");
                utils.postJson("/api/orgAppNotify",{profile_key:newOrg.missionary_profile_key});
                self.router.navigateTo("");
            }catch(error){
                if(error.status===409)
                    alertify.error("An organization with that EIN is already available or is still under review")
                else
                    alertify.error("Failed to submit application");

            }
        },
    };
    this.viewModel=viewModel;

    viewModel.orgSelectizeOptions= {
        create:false,
        valueField: "organization_key",
        labelField:"name",
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
            console.log("loading options for query "+query);
            jQuery.get("/api/nonProfits/"+query).
                then(function(results){
                    console.log("results: ",results);
                    callback(results.organizations);
                }).fail(function(error){
                    console.log("query failed: ",error);
                })
        },
        render: {
            option: function(data,escape){
                    console.log("rendering: ",data);
                    return "<div>"+data.name+
                            "</br><span style='font-size:0.7em;'> "+
                                data.city+", "+data.state+"</span></div>";
            },
        },
        onItemAdd: function(value){
            var data,orgApp;
            data = this.options[value];
            orgApp = viewModel.organizationApplication();
            console.log("onItemAdd: ",data);
            if(data != null && orgApp != null ){

                orgApp.name( data.name);
                orgApp.ein(data.ein);
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
        obObsUpdate: function(api, value){
            console.log("new value set on observable: ",value());
        },
    };
    
    viewModel.loggedIn= ko.computed(function(){
        return viewModel.loggedInUser() != null;
    });
    viewModel.hasProfile = ko.computed(function(){
        return viewModel.userProfile() != null && viewModel.userProfile().missionary_profile_key() != null;
    });
    viewModel.jobCatagoryArray = function(job_catagory_keys){
        return job_catagory_keys.map(function(job_key){
            var job;
            job_key = parseInt(job_key);
            job=viewModel.jobCatagories().find(function(catagory){
                return catagory.job_catagory_key === job_key;
            });
            if(job!=null)
                return job.catagory;
            else 
                return undefined;
        })
    };
    viewModel.getOrganization=function(organization_key) {
        organization_key = parseInt(organization_key); //TOOD: fix selectgize functions that set this to be a string 
        return viewModel.approvedOrganizations().find(function(org){
            return org.organization_key === organization_key;
        });
    };
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
                                " missionary_profile_key: "+profile.missionary_profile_key+" ,da:da \"></donate-popup>");

        ko.applyBindings({da:self.da},dialogContent[0]);

        alertify.donatePopup("").set({
                transition: "zoom",
                //title:"Donate",
                basic: true,
            }).
            setContent(dialogContent[0]).
            resizeTo("30%","50%");

    };
    viewModel.doSearch=ko.computed(async function(){
        var searchResults;
        var filters = [];
        var queryFilter = new Filter("search_text",new ILikeFilterAppender());
        console.log("doing search");

        queryFilter.obs()(viewModel.query());

        filters.push(queryFilter);
        for( var f in viewModel.filter){
            if(viewModel.filter.hasOwnProperty(f))
                filters.push(viewModel.filter[f]);
        }


        try{
            searchResults = await self.da.profileSearch(filters);
            //console.log("filtered search results:",searchResults);
            viewModel.profiles(searchResults);
        }catch(error){
            console.error("profile search failed: ",error);
            alertify.error("Search failed");
        }

    });
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
    viewModel.orgsNeedingReview = async function(){
            console.log("getting orgs for approval");
            var orgs;
            try{
                orgs = await self.da.organizationsNeedingReview();
            }catch(error){
                console.error("failed to get list of orgs needing review. ",error);
                alertify.error("Failed to get organiation list");
                orgs = [];
            }
            console.log("orgs: ",orgs);
            viewModel.pendingOrganizations(orgs);
    };
    viewModel.setOrgStatus=async function(organization_key,status){
        try{
            await self.da.setOrganizationApprovalStatus(organization_key,status);
            viewModel.orgsNeedingReview(); //reload list
        }catch(error){
            console.error("failed to set approval state for org "+organization_key,error);
            alertify.error("Failed to set approval state");
        }
    };
    viewModel.profilePictureUrl = function(picture_url){
        var url;

        if((picture_url == null || picture_url==="") && viewModel.hasProfile())
            url  = bucketBase + viewModel.userProfile().data.picture_url();
        else if(picture_url != null && picture_url !== "")
            url =  bucketBase +picture_url;
        else
            url = "/img/unknown_person.svg";

        return url;
    };
    viewModel.replaceProfilePicture= async function(){
        console.log("replacing profile image");
        var path = viewModel.userProfile().data.picture_url();
        var filename = path.replace(/^.*?([^/\\&\?]+\.\w{3,4}(?=([\?&].*$|$))).*$/,"$1");
        console.log("url filename: ",filename);

        try{

            await utils.postJson("/api/removeUserFile",{filename:filename,token:viewModel.token()});
        }catch(error){
            console.warn("failed to remove old profile picture "+filename,error);
        }

        viewModel.userProfile().data.picture_url("");
        
    };
    viewModel.profilePicturePondOptions = {
        //stylePanelLayout: 'compact circle',
        //allowRevert: false,
        maxFileSize: '5MB',
        imageResizeUpscale: false,
        imageResizeTargetWidth: 400, //aspect ratio will be retained, but image scaled
        imageResizeTargetHeight: 400,
        imageCropAspectRatio: "1:1",

        //imagePreviewHeight: 170,
        //styleLoadIndicatorPosition: 'center bottom',
        //styleProgressIndicatorPosition: 'right bottom',
        //styleButtonRemoveItemPosition: 'left bottom',
        //styleButtonProcessItemPosition: 'right bottom',

        server: {
            process: utils.pondProcessFn(bucketBase,viewModel.token)
        },
        onprocessfile:function(error,file){
            if(error != null){
                console.error("failed to upload profile picture: ",error);
                alertify.error("Profile picture upload failed");
            }else{
                console.log("uploaded profile picture: ",file);
                var path = viewModel.loggedInUser().external_user_id()+"/"+
                                file.filenameWithoutExtension+"."+file.fileExtension.toLowerCase();
                console.log("new URL for profile picture: ",path);
                viewModel.userProfile().data.picture_url(path);
            }
        }

    }
    viewModel.collectionControls = {
        selectProfile: viewModel.selectProfile,
        getOrganization: viewModel.getOrganization,
        jobNames: viewModel.jobCatagoryArray,
        pictureUrl: viewModel.profilePictureUrl,
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

            
}
async initOrganizations(){
    const viewModel=this.viewModel;

    try{
        viewModel.approvedOrganizations(await this.da.organizationList());
        viewModel.jobCatagories(await this.da.jobList());
        viewModel.featuredProfiles(await this.da.featuredProfiles());
    }catch(error){
        console.error("failed to init organizations: ",error);
    }
}
initRouter(appBase,authBaseUrl,authClientID){
    const viewModel=this.viewModel;
    const self=this;

    function setPage(pageName){
        viewModel.page(self.getPage(pageName));
        //dataLayer.push({currentPage:pageName});
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
    router.add('search/', function () {
        viewModel.query("");
        setPage("search");
    });
    router.add(/^search\/([a-zA-Z0-9 ]+)$/, function (query) {
        viewModel.query(query);
        setPage("search");
    });
    router.add('profile-post-sof/', async function () {
        self.sendRecaptcha("agree_sof");
        setPage("edit-profile");
        
    });
    router.add('profile/', async function () {
        if(viewModel.loggedIn()){
            if( ! viewModel.hasProfile()){
                await viewModel.loadProfile(viewModel.loggedInUser().user_key());
                self.router.navigateTo("confirm-sof");
            }else{
                setPage("edit-profile");
            }
                
        }else
            router.navigateTo("signIn/profile");
    });
    router.add('post-login/', async function () {
        self.sendRecaptcha("login");
        if(viewModel.loggedIn()){
            await viewModel.loadProfile(viewModel.loggedInUser().user_key());
            if(viewModel.hasProfile()){
                self.router.navigateTo("");
            }else{
                self.router.navigateTo("confirm-sof");
            }
        }else
            router.navigateTo("");
    });
    router.add('profile-detail/(:num)', async function (missionary_profile_key) {
        var profile;
        if(viewModel.selectedProfile() == null){
            try{
                profile = await self.da.getProfileByKey(missionary_profile_key);
                console.log("found profile; ",profile);
                viewModel.selectedProfile(profile);
                setPage("profile-detail");
            }catch(error){
                console.log("no profile found for missionary_profile_key",missionary_profile_key);
                alertify.error("Profile not found");
            }
        }else //TODO: this doesn't seem correct
            setPage("profile-detail");
    });
    router.add('about/', function () {
        setPage("about");
    });
    router.add('org-application/', async function () {
        try{
            var newOrg = await self.da.newOrganization();
            viewModel.organizationApplication(ko.mapping.fromJS(newOrg));
            setPage("org-application");
        }catch(error){
            console.error("failed to get new organization: ",error);
            alertify.error("Failed to load Organization Application page");
        }
    });
    router.add('signIn/', function () {
        console.log("sign in with no redirect",viewModel.loginURL);
        window.location=viewModel.loginURL;
    });
    router.add(/^signIn\/([a-zA-Z0-9- ]+)$/, function (redirectPage) {
        console.log("signin with redirect to "+redirectPage);
        window.location=viewModel.loginURL+"&state="+redirectPage;
    });
    router.add('signOut/', function () {
        console.log("signing out, url: ",authBaseUrl+"/logout?client_id="+authClientID);
        window.location=authBaseUrl+"/logout?client_id="+authClientID;
    });
    router.add('confirm-sof/', function () {
        setPage("confirm-sof");
    });
    router.add('organization-review/', function () {
        if(viewModel.loggedIn())
            setPage("organization-review");
        else
            router.navigateTo("signIn/organization-review");
    });


    router.addUriListener();

}

async doLogin(code,state){
    const viewModel=this.viewModel;
    const self=this;
    var userResults, user;

    try{
        var tokenResult = await utils.postJson("api/token",{code:code});
        console.log("token result: ",tokenResult);
        if(tokenResult.access_token != null){
            self.viewModel.token(tokenResult.access_token); 
            self.da.setToken(tokenResult.access_token);

            try{
                userResults = await self.da.getUser(tokenResult.userId);
                if(userResults.length === 1){
                    console.log("logged in user: ",userResults[0]);
                    user = userResults[0];
                }else{ //user not found
                    user = await self.da.createUser(tokenResult.userId);
                    console.log("new user record: ",user);
                }
                user.email= tokenResult.email;
                viewModel.loggedInUser(ko.mapping.fromJS(user));

                self.router.navigateTo('post-login');

            }catch(error){
                throw new AppError("failed to create new user with email "+result.email);
            }
        }else{
            throw new AppError("no access_token found in tokenResult");
        }
    }catch(error){
        alertify.error("Login Failed");
        console.error("failed to log in user. ",error);
    }
}
}


export default {Client};