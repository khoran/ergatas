import * as utils from './client-utils';
import {AppError} from '../server/app-error';
import alertify from 'alertifyjs';

// Builds the root knockout view-model. Returns a FLAT object whose member names are
// bound directly by templates across lib/page-templates/ and lib/components/ — do not
// rename or namespace these members. `client` is the Client instance.
export function createViewModel(client, {authBaseUrl, clientId, redirect, appBase, appState}){
    const self=client;
    const viewModel = {
        loginURL: authBaseUrl+"/authorize?client_id="+clientId+"&response_type=code&scope=offline_access&redirect_uri="+redirect,
        loggedInUser:ko.observable(),
        maintenance_mode:client.maintenance_mode,
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
    client.viewModel=viewModel;

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
                    if(value.trim() != "DELETE"){

                        alertify.message("Account was NOT deleted");
                        return;
                    }
                    try{
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

    viewModel.toggleFavorite = async function(profile, userFavoritesObs){

        //console.log("toggling favorite for profile: ", profile,userFavoritesObs);
        let da = viewModel.appState.da;
        let user = viewModel.loggedInUser();
        if(user == null){
            throw new AppError("User must be logged in to toggle favorites");
        }
        if(profile == null){
            throw new AppError("Profile must be provided to toggle favorites");
        }

        let user_key = ko.unwrap(user.user_key);
        let profileKey = ko.unwrap(profile.missionary_profile_key);

        // find existing saved search named 'Favorites' for this user
        let existing = null;
        try{
            existing = await da.getSavedSearchesByName(user_key,'Favorites');
        }catch(e){
            // getSavedSearchesByName uses dbGet and returns null when not found; ignore errors
            existing = null;
        }

        if(existing == null){
            // create a new saved search with this profile key
            const data = {
                name: 'Favorites',
                params:{
                    missionary_profile_keys: [profileKey]
                }
            };
            const created = await da.createSavedSearch(user_key,data);
            userFavoritesObs(created.data.params.missionary_profile_keys);
            return created;
        }else{
            // ensure data object exists
            const data = existing.data || {};
            const keys = Array.isArray(data.params.missionary_profile_keys) ? data.params.missionary_profile_keys.slice() : [];

            const idx = keys.findIndex(k => parseInt(k) === profileKey);
            if(idx !== -1){ // remove
                keys.splice(idx,1);
            }else{ // add
                keys.push(profileKey);
            }

            //console.log("updating favorite keys to: ",keys,newValue);
            data.params.missionary_profile_keys = keys;
            const updated = await da.updateSavedSearch(existing.saved_search_key, data);
            userFavoritesObs(updated.data.params.missionary_profile_keys);
            return updated;
        }
    }

    return viewModel;
}
