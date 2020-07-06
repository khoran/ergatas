import {getURLParameter,initKOLoaders} from './client-utils';
import {DataAccess} from './data-access';
import {registerProfileCollection} from  './components/profile-collection';
var Router = require('vanilla-router');


class Client {

    constructor(){
        var code,state,userState;
        const bucketName = process.env.UPLOAD_BUCKET || "ergatas-public";

        this.bucketBase="https://storage.googleapis.com/"+bucketName+"/";
        this.postgrestBase= process.env.POSTGREST_URL_BASE;
        this.authBase=process.env.AUTH_URL_BASE;
        this.authRedirect=process.env.REDIRECT_URL;
        this.base=process.env.APP_BASE || '/';
        this.router;
        this.db;
        this.geocoder = new google.maps.Geocoder();
        this.map;
        this.resultsMap;
        this.resultMarkers=[];
        this.profileMarker;
        this.viewModel;

        this.da = new DataAccess(this.postgrestBase);

        initKOLoaders();
        registerProfileCollection();


        this.initViewModel();
        ko.applyBindings(this.viewModel);
        this.initOrganizations();
        this.initRouter();

        code = getURLParameter("code");
        state= getURLParameter("state");
        userState = getURLParameter("userState");

        console.log("code: ",code);
        if(code != null && userState != null && userState==="Authenticated"){
            this.doLogin(code,state);
        }else{
            this.router.navigateTo(window.location.pathname.replace(this.base,""));
        }

        
    }
    postJson(url,data){
        return jQuery.ajax(url,{
            type: "POST",
            contentType: "application/json",
            data:JSON.stringify(data),
            dataType:"json",
        });
    }
   
    initViewModel(){
        const self=this;
        const db=self.db;
        const viewModel = {
            loginURL: this.authBase+"/authorize?client_id=785acfb9-0f7a-4655-bcf0-ef6dcffcee70&response_type=code&redirect_uri="+this.authRedirect,
            query: ko.observable(),
            loggedInUser:ko.observable(),
            token: ko.observable(), //NOT UI
            currentPage:ko.observable("home-page-template"),
            profiles: ko.observableArray(),
            selectedProfile: ko.observable(),
            featuredProfiles: ko.observableArray(),
            approvedOrganizations:ko.observableArray(),
            jobCatagories: ko.observableArray(),
            userProfile: ko.observable(),
            sortBy: ko.observable(),
            searchResultsTemplate: ko.observable("list-results-template"),
            organizationApplication:ko.observable(),
            filter: {
                name:ko.observable(),
                organization:ko.observable(),
                skills: ko.observable(),
                location:ko.observable(),
                profilesInCurrentMap: ko.observableArray(),
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

                if(event.type!=="click" && event.keyCode != 13) 
                    return;

                query=viewModel.query();
                console.log("query: ",query);
                self.router.navigateTo("search/"+query);
            },
            searchListView: function(){
                viewModel.searchResultsTemplate("list-results-template");
            },
            searchMapView: function(){
                viewModel.searchResultsTemplate("map-results-template");

            },
            selectProfile: function(data){
                console.log("selected profile: ",data);
                viewModel.selectedProfile(data);
                self.router.navigateTo('profile-detail/'+data.missionary_profile_key);
            },
            saveProfile: async function(form){
                var profile;
                var picture_url;
                var updateFn ;

                profile = viewModel.userProfile();
                console.log("create Profile: ",profile);

                updateFn = async function(){
                    var data ;
                    var reloadedProfile;

                    try{
                        if(picture_url != null )
                            profile.data.picture_url(picture_url);

                        data = ko.mapping.toJS(profile);

                        if( ! viewModel.hasProfile()){
                            reloadedProfile =  await self.da.createProfile(data);
                        }else{
                            reloadedProfile =  await self.da.updateProfile(profile.missionary_profile_key(),data);
                        }

                        viewModel.userProfile(ko.mapping.fromJS(data));

                        alertify.success("Profile saved");
                        self.router.navigateTo("");
                    }catch(error){
                        console.error("failed to create or update profile",error);
                        alertify.error("Failed to save profile");
                    }

                };

                picture_url = await self.uploadProfilePicture(form);
                console.log("picuture url: "+picture_url);
                updateFn();
                //self.uploadProfilePicture(form).
                 //   then(function(url){
                  //      console.log("both promises fulfilled, url:",url);
                   //     picture_url=url;
                    //}).always(function(){
                     //   console.log("in always");
                      //  updateFn();
                    //});
            },
            checkForProfile: function(redirectTo){
                viewModel.loadProfile(viewModel.loggedInUser().user_key()).
                    then(function(){
                        if(redirectTo != null)
                            self.router.navigateTo(redirectTo);
                        else if(viewModel.hasProfile()){
                            self.router.navigateTo("");
                        }else{
                            self.router.navigateTo("profile");
                        }
                    });
            },
            loadProfile: async function(user_key){
                console.log("loading profile by user_key="+user_key);
                var profileResults,profile;
                try{
                    profileResults = await self.da.getProfile(user_key)
                    if(profileResults.length===1){
                        profile= profileResults[0];
                    }else{
                        profile = await self.da.newProfile();
                        profile.user_key=viewModel.loggedInUser().user_key();
                    }
                    viewModel.userProfile(ko.mapping.fromJS(profile));
                }catch(error){
                    console.error("failed to load profile for "+user_key,error);
                    alertify.error("Failed to load profile"); 
                }
            },
            initProfileForm: function(element){
                var profile = viewModel.userProfile().data;
                var options;
                console.log("initializing profile form. ",element);


                if(viewModel.hasProfile())
                    options = {
                        center: new google.maps.LatLng(profile.location_lat(), profile.location_long()),
                        zoom: 7 //The zoom value.
                    };
                else    
                    options = {
                        center:  new google.maps.LatLng(0,0),
                        zoom: 1 
                    };


                self.map = new google.maps.Map(jQuery('#locationMap')[0], options);
                viewModel.showMap();
                ko.computed(function(){
                    console.log("location lat/long update");
                    if(viewModel.hasProfile())
                        viewModel.recordLocation(viewModel.userProfile().data.location_lat(),
                                            viewModel.userProfile().data.location_long());
                })

            },
            submitOrgApplication: async function(){
                console.log("submitting org app",viewModel.organizationApplication());
                try{
                    await self.da.createOrganization(
                        ko.mapping.toJS(viewModel.organizationApplication()));
                    alertify.success("Application submitted!");
                    self.router.navigateTo("");
                    //TODO: make call to server to send email notice 
                }catch(error){
                    if(error.status===409)
                        alertify.error("An organization with that EIN is already available or is still under review")
                    else
                        alertify.error("Failed to submit application");

                }
            },
            initResultsView: function(element){
                if(viewModel.searchResultsTemplate() === "map-results-template")
                    viewModel.initResultsMap();
            },
            recordLocation: function(lat,long){
                var location = {lat:lat,lng:long};
                console.log("recording location ",location);
                if(self.profileMarker != null){
                    self.profileMarker.setPosition(location);
                    self.map.setCenter(location);
                    if(viewModel.userProfile() != null){
                        viewModel.userProfile().data.location_lat(location.lat);
                        viewModel.userProfile().data.location_long(location.lng);
                    }
                }
            },

            reverseGeocode: function(location){
                self.geocoder.geocode({ location:location},function(results,status){
                    var country,address;
                    var bestMatch;
                    var countryComp;
                    console.log("location results:", results);
                    if(results.length > 0){
                        bestMatch=results.find(function(result){
                            //accepte first match that is a street_address or political
                            return result.types.indexOf("political") !== -1 
                                || result.types.indexOf("street_address") !== -1;
                        });
                        console.log("best match: ",bestMatch);
                        if(bestMatch == null)
                            bestMatch = results[0]; //take what we can get if no non-routes found

                        address = bestMatch.formatted_address;
                        countryComp=bestMatch.address_components.find(function(comp){
                            return comp.types.indexOf("country") !== -1;
                        });
                        console.log("country component: ",countryComp);
                        if(countryComp != null){
                            country = countryComp.long_name;
                        }
                        if(viewModel.userProfile()!=null){
                            viewModel.userProfile().data.location(address);
                            viewModel.userProfile().data.country(country);
                        }

                    }
                })

            },

            showMap: function(){
                console.log("showing map");
                self.profileMarker = new google.maps.Marker({
                        map:self.map,
                        draggable: true,
                    });

                google.maps.event.addListener(self.profileMarker, 'dragend', function(event){
                    viewModel.recordLocation(self.profileMarker.getPosition().lat(), self.profileMarker.getPosition().lng());
                    viewModel.reverseGeocode(self.profileMarker.getPosition());
                });

                //Listen for any clicks on the map.
                google.maps.event.addListener(self.map, 'click', function(event) {                
                    //Get the location that the user clicked.
                    var clickedLocation = event.latLng;
                    console.log("click envent ",clickedLocation);
                    self.profileMarker.setPosition(clickedLocation);
                    viewModel.recordLocation(self.profileMarker.getPosition().lat(), self.profileMarker.getPosition().lng());
                    viewModel.reverseGeocode(self.profileMarker.getPosition());
                });
            },
            initResultsMap: function(){
                var doSearchWhenIdle=false;
                
                console.log("initResultsMap. current resultsMap: ",self.resultsMap);
                if(self.resultsMap != null)
                    return; // already initialized

                console.log("initializing resultsMap  ------------");
                self.resultsMap = new google.maps.Map(jQuery('#search-results-map')[0],  {
                    center:  new google.maps.LatLng(0,0),
                    zoom: 1 ,
                    options:{
                        gestureHandling: 'greedy',
                    }
                });
                //add map drag listener
                self.resultsMap.addListener("bounds_changed",function(){
                    console.log("============= bounds changed ====================");
                    doSearchWhenIdle=true;
                });
                self.resultsMap.addListener("idle",async function(){
                    var ne,sw, bound;
                    var searchResults;
                    if(doSearchWhenIdle){
                        doSearchWhenIdle=false;
                        bound = self.resultsMap.getBounds();
                        ne=bound.getNorthEast();
                        sw=bound.getSouthWest();
                        console.log("bounds: ",ne,sw);
                        try{
                            searchResults = await self.da.profileSearchByArea(ne,sw);
                            console.log("found results: ",searchResults);
                            viewModel.filter.profilesInCurrentMap(searchResults);
                        }catch(error){
                            console.error("profile search by area failed: ",error);
                            alertify.error("Failed to search by map location");
                        }
                    }

                });
                //trigger updating the map with any existing profile results
                viewModel.profiles.valueHasMutated();
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
                //profile = viewModel.userProfile();
                if(data != null && orgApp != null ){
                    //viewModel.userProfile().organization = data;
                    //TODO: do something here

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
        viewModel.locationSelectizeOptions= {
            create:false,
            valueField: "label",
            labelField:"label",
            searchField:"label",
            maxItems: 1,
            plugins:['remove_button'],
            onInitialize: function(){
                console.log("location selectize init: ",this);
                var profile = viewModel.userProfile().data;
                if(profile != null && profile.location() !== ''){
                    this.addOption({
                        label: profile.location(),
                        location: {
                            lat: profile.location_lat(),
                            lng: profile.location_long(),
                        }
                    });
                    //this.refreshOptions(false);
                    this.addItem(profile.location(),true);
                }
            },
            onObsUpdate: function(api, value){
                console.log("location updated via observabale",value);
                if(value== null || value === '')
                    return;
                var profile = viewModel.userProfile().data;
                api.addOption({
                    label: value,
                    location: {
                        lat: profile.location_lat(),
                        lng: profile.location_long(),
                    }
                });
                api.addItem(value,true);
            },
            load: function(query,callback){
                if(query == null || query ===''){
                    callback();
                    return;
                }
                self.geocoder.geocode({ address:query },function(results,status){
                    var options;
                    console.log("location results:", results);
                    if(results.length > 0){
                        options =results.map(function(result){
                            return {
                                label: result.formatted_address,
                                location: {
                                    lat: result.geometry.location.lat(),
                                    lng: result.geometry.location.lng(),
                                }
                            }
                        });
                        console.log("selectize options",options);
                        callback(options);
                    }else callback();
                });
            },
            onItemAdd: function(value){
                var profile,data;
                data = this.options[value];
                console.log("onItemAdd: ",data);
                //profile = viewModel.userProfile();
                if(data != null && data.location != null){
                    viewModel.recordLocation(data.location.lat,data.location.lng);
                    //profile.location_lat(data.location.lat);
                    //profile.location_long(data.location.lng);
                }

            }
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

        viewModel.getFormFields = function(selector){
            var obj={};
            jQuery("<div>"+jQuery(selector).html()+"</div>").
                find(":input").
                each(function(){
                    var id=$(this).attr("id");
                    console.log("found field "+id);
                    obj[id]=ko.observable();
                });

            return obj;
        };

        viewModel.getOrganization=function(organization_key) {
            organization_key = parseInt(organization_key); //TOOD: fix selectgize functions that set this to be a string 
            return viewModel.approvedOrganizations().find(function(org){
                return org.organization_key === organization_key;
            });
        };
        viewModel.doSearch=ko.computed(async function(){
            var name, org, skills, location,query,profileKeys;
            var request;
            var searchResults;
            console.log("doing search");
            query = viewModel.query();
            name = viewModel.filter.name();
            org= viewModel.filter.organization();
            skills= viewModel.filter.skills();
            location= viewModel.filter.location();
            profileKeys = viewModel.filter.profilesInCurrentMap();

            if(query==null && name==null && org==null && skills==null && location==null){
                viewModel.profiles.removeAll();
                return;
            }

            try{
                searchResults = await self.da.profileSearch(query,name,org,skills,location,profileKeys);
                //TODO: if a resultMap is defined, constrain results to fit in box.
                // can simulare by just not resizing the map to fit results.
                console.log("filtered search results:",searchResults);
                viewModel.profiles(searchResults);
            }catch(error){
                console.error("profile search failed: ",error);
                alertify.error("Search failed");
            }

        });
        ko.computed(function(){
            var profiles = viewModel.profiles();
            var bound;
            var ne,sw;
            if(self.resultsMap == null)
                return;

            console.log("updating map results");
            //remove any existing markers
            while(self.resultMarkers.length > 0){
                self.resultMarkers.pop().setMap(null);
            }

            //add profiles to map
            profiles.forEach(function(profile){
                console.log("profile lat long: ",profile.data.location_lat, profile.data.location_long);
                self.resultMarkers.push(
                    new google.maps.Marker({
                        map: self.resultsMap,
                        position: {
                            lat: profile.data.location_lat,
                            lng: profile.data.location_long,
                        }
                    })
                );
            });

            bound = new google.maps.LatLngBounds();
            self.resultMarkers.forEach(function(m){
                bound.extend(m.position);
            });
            ne=bound.getNorthEast();
            sw=bound.getSouthWest();
            if(ne.lng() - sw.lng() < 20){
                //bounds too small
                bound.extend(new google.maps.LatLng(ne.lat()+5,ne.lng()));
                bound.extend(new google.maps.LatLng(sw.lat()+5,sw.lng()));
            }
            //self.resultsMap.fitBounds(bound);
        })
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
    initRouter(){
        const viewModel=this.viewModel;
        const db=this.db;
        const self=this;

        const router = new Router({
            root:self.base,
            page404: function (path) {
                console.log('"/' + path + '" Page not found');
                viewModel.currentPage("notfound-template");
            }
        });
        this.router = router;
        
        router.add('', function () {
            viewModel.currentPage("home-page-template");
        });
        router.add('search/', function () {
            viewModel.query("");
            viewModel.currentPage("search-page-template");
        });
        router.add(/^search\/([a-zA-Z0-9 ]+)$/, function (query) {
            viewModel.query(query);
            viewModel.currentPage("search-page-template");
        });
        router.add('profile/', function () {
            if(viewModel.loggedIn())
                viewModel.currentPage("edit-profile-page-template");
            else
                router.navigateTo("signIn/profile");
        });
        router.add('profile-detail/(:num)', async function (missionary_profile_key) {
            var profile;
            if(viewModel.selectedProfile() == null){
                try{
                    profile = await self.da.getProfileByKey(missionary_profile_key);
                    console.log("found profile; ",profile);
                    viewModel.selectedProfile(profile);
                    viewModel.currentPage("profile-detail-page-template");
                }catch(error){
                    console.log("no profile found for missionary_profile_key",missionary_profile_key);
                    alertify.error("Profile not found");
                }
            }else //TODO: this doesn't seem correct
                viewModel.currentPage("profile-detail-page-template");
        });
        router.add('about/', function () {
            viewModel.currentPage("about-page-template");
        });
        router.add('org-application/', async function () {
            try{
                var newOrg = await self.da.newOrganization();
                viewModel.organizationApplication(ko.mapping.fromJS(newOrg));
                viewModel.currentPage("org-application-page-template");
            }catch(error){
                console.error("failed to get new organization: ",error);
                alertify.error("Failed to load Organization Application page");
            }

/*
            viewModel.newOrganization().
                then(function(newOrg){
                    console.log("new org: ",newOrg);
                    viewModel.organizationApplication(newOrg);
                    viewModel.currentPage("org-application-page-template");
                }).catch(function(error){
                    console.log("failed to get new organization: ",error);
                    alertify.error("Failed to load Organization Application page");
                })
                */
        });
        router.add('signIn/', function () {
            console.log("sign in with no redirect",viewModel.loginURL);
            //viewModel.currentPage("sign-in-page-template");
            window.location=viewModel.loginURL;
        });
        router.add('signIn/(:word)', function (redirectPage) {
            console.log("signin with redirect to "+redirectPage);
            window.location=viewModel.loginURL+"&state="+redirectPage;
        });
        //router.add('signUp/', function () {
            //viewModel.currentPage("sign-up-page-template");
        //});
        router.add('signOut/', function () {
            window.location=self.authBase+"/logout?client_id=785acfb9-0f7a-4655-bcf0-ef6dcffcee70";
        });

        router.addUriListener();

    }
    async uploadProfilePicture(form){
        console.log("uploading profile picture");
        var files;
        var file;
        var resizedFileData;
        var bucketKey;
        var signedUrl;
        var pictureUrl;
        const viewModel=this.viewModel;
        const self=this;

        files = jQuery(form).find("#profile-picture")[0].files;
        if(files.length === 0)
            return undefined;

        file=files[0];
        bucketKey = viewModel.loggedInUser().user_key()+"/"+file.name;
        console.log("file: ",file);

        resizedFileData = await this.resizeImage(file);
        try{

            signedUrl = await self.postJson("api/getSignedUrl",{filename:file.name,token:viewModel.token()});
            signedUrl=signedUrl.url;
            console.log("signed url: ",signedUrl);

            var promise = jQuery.Deferred();
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", signedUrl, true);
            xhr.onload = function() {
                var status = xhr.status;
                if (status === 200) {
                    console.log("File is uploaded");
                    promise.resolve(self.bucketBase+bucketKey);
                } else{
                    console.error("Something went wrong! status:",status);
                    promise.reject("upload failed with status "+status+" "+xhr.statusText);
                }
            };
            xhr.onerror = function() {
                alertify.error("failed upload profile picture");
                promise.reject("upload failed with status "+xhr.status+" "+xhr.statusText);
            };
            xhr.setRequestHeader('Content-Type', file.type);
            //xhr.send(file);
            xhr.send(resizedFileData);
            pictureUrl = await promise;

        }catch(error){
            console.error("failed to get signed upload url: ",error);
        }
        return pictureUrl;
    }
    resizeImage(file) {
        const width = 400;
        const promise = jQuery.Deferred();
        //const height = 300;
        const fileName = file.name;
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = event => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                    const scaleFactor = width / img.width;
                    const elem = document.createElement('canvas');
                    elem.width = width;
                    elem.height = img.height * scaleFactor;
                    console.log("scale factor: ",scaleFactor);
                    console.log("dimensions: ",elem.width,elem.height);
                    const ctx = elem.getContext('2d');
                    // img.width and img.height will contain the original dimensions
                    ctx.drawImage(img, 0, 0, width, img.height*scaleFactor);
                    //const data = ctx.canvas.toDataURL();
                    ctx.canvas.toBlob((blob) => {
                        const file = new File([blob], fileName, {
                            type: 'image/jpeg',
                            lastModified: Date.now()
                        });
                        console.log("resized file data: ",file);
                        promise.resolve(file);
                    }, 'image/jpeg', 1);
                }
        };
        reader.onerror = error => {
            console.log(error);
            promise.reject(error);
        };
        return promise;
    }
    async doLogin(code,state){
        const viewModel=this.viewModel;
        const self=this;
        var userResults, user;

        try{
            var tokenResult = await self.postJson("api/token",{code:code});
            console.log("token result: ",tokenResult);
            if(tokenResult.access_token != null){
                viewModel.token(tokenResult.access_token); //TOOD: remove this eventually
                self.da.setToken(tokenResult.access_token);

                try{
                    userResults = await self.da.getUser(tokenResult.email);
                    if(userResults.length === 1){
                        console.log("logged in user: ",userResults[0]);
                        user = userResults[0];
                    }else{ //user not found
                        user = await self.da.createUser(tokenResult.email);
                        console.log("new user record: ",user);
                    }
                    viewModel.loggedInUser(ko.mapping.fromJS(user));
                    if(state != null && state==="profile")
                        viewModel.checkForProfile("profile");
                    else
                        viewModel.checkForProfile();
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