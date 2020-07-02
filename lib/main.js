import {getURLParameter} from './client-utils';
var Router = require('vanilla-router');

function mainInit(){
    var bucketName = process.env.UPLOAD_BUCKET || "ergatas-public";
    var bucketBase="https://storage.googleapis.com/"+bucketName+"/";
    var postgrestBase= process.env.POSTGREST_URL_BASE;
    var authBase=process.env.AUTH_URL_BASE;
    var authRedirect=process.env.REDIRECT_URL;
    var router;
    var base=process.env.APP_BASE || '/';
    var db;
    var geocoder = new google.maps.Geocoder();
    var map, resultsMap;
    var resultMarkers=[];
    var profileMarker;
    var viewModel;

    db= new postgrestClient.default(postgrestBase);

  
    viewModel = {
        loginURL: authBase+"/authorize?client_id=785acfb9-0f7a-4655-bcf0-ef6dcffcee70&response_type=code&redirect_uri="+authRedirect,
        query: ko.observable(),
        loggedInUser:ko.observable(),
        token: ko.observable(),
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
        },
        playSample: function(){
            jQuery("#ergatas-sample")[0].play();
        },
        navigateFn: function(path){
            return function(){
                router.navigateTo(path);
            }
        },
        signOut: function(){
            viewModel.loggedInUser(undefined);
            router.navigateTo("signOut");
            viewModel.userProfile(undefined);
        },
        handleSearch: function(data,event){
            var query;

            if(event.type!=="click" && event.keyCode != 13) 
                return;

            query=viewModel.query();
            console.log("query: ",query);
            router.navigateTo("search/"+query);

           // db.get("/profile_search").auth(viewModel.token()).
           //     //match({search_text:"ILIKE.*"+query+"*"}).
           //     ilike("search_text",'*'+query+'*').
           //     then(function(results){
           //         console.log("search results:",results)
           //         viewModel.profiles(results);
           //         router.navigateTo("search");
           //     });
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
            router.navigateTo('profile-detail/'+data.missionary_profile_key);
        },
        saveProfile: function(form){
            var profile;
            var picture_url;
            var updateFn ;

            profile = viewModel.userProfile();
            console.log("create Profile: ",profile);

            updateFn = function(){
                var data ;
                var dbBase;

                if( ! viewModel.hasProfile()){
                    dbBase=db.post("/missionary_profiles_view").auth(viewModel.token());
                }else{
                    dbBase=db.patch("/missionary_profiles_view").auth(viewModel.token()).
                        eq("missionary_profile_key",profile.missionary_profile_key());
                }



                console.log("patching");
                if(picture_url != null )
                    profile.data.picture_url(picture_url);

                data = ko.mapping.toJS(profile);

                console.log("saving profile data: ",data);
                dbBase.send( data).
                    set("Prefer","return=representation").
                    then(function(results){
                        console.log("post result: ",results);
                            if(results.length === 1){
                                viewModel.loadProfileFromData(results[0]);
                                alertify.success("Profile Saved");
                                router.navigateTo("");
                            }else{
                                alertify.error("failed to save profile");

                            }
                    }).catch(function(error){
                        console.error("failed to update new profile: ",error);
                        alertify.error("Failed to update profile");
                    });
            };

            uploadProfilePicture(form).
                then(function(url){
                    console.log("both promises fulfilled, url:",url);
                    picture_url=url;
                }).always(function(){
                    console.log("in always");
                    updateFn();
                });
        },
        checkForProfile: function(redirectTo){
            viewModel.loadProfile("user_key",viewModel.loggedInUser().user_key()).
                then(function(){
                    if(redirectTo != null)
                        router.navigateTo(redirectTo);
                    else if(viewModel.hasProfile()){
                        router.navigateTo("");
                    }else{
                        router.navigateTo("profile");
                    }
                });
        },
        loadProfileFromData: function(data,jobs){
            console.log("setting user profile from data:",JSON.stringify(data),JSON.stringify(jobs));
            viewModel.userProfile(ko.mapping.fromJS(data));
        },
        loadProfile: function(byKeyType, keyValue){
            console.log("loading profile by "+byKeyType+"="+keyValue);
            return db.get("/missionary_profiles_view").auth(viewModel.token()).
                eq(byKeyType,keyValue).
                single().
                then(function(result){
                    console.log("profile result: ",result);
                    if(result != null){
                        //viewModel.userProfile(ko.mapping.fromJS(result,mappingOptions));
                        viewModel.userProfile(ko.mapping.fromJS(result));
                        //not here router.navigateTo("profile");
                    }
                }).catch(function(error){
                    console.log("load profile, in catch block: "+error);
                    //no profile found
                    if(String(error).indexOf("Not Acceptable")!==-1) // indicates no results returned, but otherwise call was fine
                        return viewModel.newProfile().
                            then(function(profile){
                                viewModel.userProfile(profile);
                            });

                });

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


            map = new google.maps.Map(jQuery('#locationMap')[0], options);
            viewModel.showMap();
            ko.computed(function(){
                console.log("location lat/long update");
                if(viewModel.hasProfile())
                    viewModel.recordLocation(viewModel.userProfile().data.location_lat(),
                                         viewModel.userProfile().data.location_long());
            })

        },
        submitOrgApplication: function(){
            console.log("submitting org app",viewModel.organizationApplication());
            db.post("/organizations_view").auth(viewModel.token()).
                send(ko.mapping.toJS(viewModel.organizationApplication())).
                then(function(){
                    alertify.success("Application submitted!");
                    router.navigateTo("");
                    //TODO: make call to server to send email notice 
                }).catch(function(error,a1,a2){
                    console.log("failed to insert org application: ",error);
                    //console.log(" response: ",error.response);
                    if(error.status===409)
                        alertify.error("An organization with that EIN is already available or is still under review")
                    else
                        alertify.error("Failed to submit application");
                });
        },
        initResultsView: function(element){
            if(viewModel.searchResultsTemplate() === "map-results-template")
                viewModel.initResultsMap();
        },
        recordLocation: function(lat,long){
            var location = {lat:lat,lng:long};
            console.log("recording location ",location);
            if(profileMarker != null){
                profileMarker.setPosition(location);
                map.setCenter(location);
                //map.setZoom(7);
                //jQuery("#location_lat").val(location.lat);
                //jQuery("#location_long").val(location.lng);
                if(viewModel.userProfile() != null){
                    viewModel.userProfile().data.location_lat(location.lat);
                    viewModel.userProfile().data.location_long(location.lng);
                }
            }
        },

        reverseGeocode: function(location){
            geocoder.geocode({ location:location},function(results,status){
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
                    //jQuery("#location").val(address);
                    //jQuery("#country").val(country);
                    if(viewModel.userProfile()!=null){
                        viewModel.userProfile().data.location(address);
                        viewModel.userProfile().data.country(country);
                    }

                }
            })

        },

        showMap: function(){
            console.log("showing map");
            profileMarker = new google.maps.Marker({
                    //position: {lat:vm.location_lat(), lng: vm.location_long()},
                    map:map,
                    draggable: true,
                });

            google.maps.event.addListener(profileMarker, 'dragend', function(event){
                viewModel.recordLocation(profileMarker.getPosition().lat(), profileMarker.getPosition().lng());
                viewModel.reverseGeocode(profileMarker.getPosition());
            });

            //Listen for any clicks on the map.
            google.maps.event.addListener(map, 'click', function(event) {                
                //Get the location that the user clicked.
                var clickedLocation = event.latLng;
                console.log("click envent ",clickedLocation);
                profileMarker.setPosition(clickedLocation);
                viewModel.recordLocation(profileMarker.getPosition().lat(), profileMarker.getPosition().lng());
                viewModel.reverseGeocode(profileMarker.getPosition());
            });
        },
        initResultsMap: function(){
            var doSearchWhenIdle=false;


            console.log("===================== Initializing results map =======================");
            resultsMap = new google.maps.Map(jQuery('#search-results-map')[0],  {
                center:  new google.maps.LatLng(0,0),
                zoom: 1 ,
                options:{
                    gestureHandling: 'greedy',
                }
            });
            //add map drag listener
            resultsMap.addListener("bounds_changed",function(){
                doSearchWhenIdle=true;
            });
            resultsMap.addListener("idle",function(){
                var ne,sw, bound;
                if(doSearchWhenIdle){
                    doSearchWhenIdle=false;
                    bound = resultsMap.getBounds();
                    ne=bound.getNorthEast();
                    sw=bound.getSouthWest();
                    console.log("bounds: ",ne,sw);
                    db.get("/rpc/profile_in_box?"+
                            "ne_lat="+ne.lat()+"&"+
                            "ne_long="+ne.lng()+"&"+
                            "sw_lat="+sw.lat()+"&"+
                            "sw_long="+sw.lng()).
                        then(function(results){
                            console.log("found results: ",results);
                            //TODO: load actual profiles here
                        })
                }

            });
            //trigger updating the map with any existing profile results
            viewModel.profiles.valueHasMutated();
        },


        /*
        editProfile: function(profile){
            console.log("editing profile: ",profile);
            viewModel.loadProfile('missionary_profile_key',profile.missionary_profile_key).
                then(function(){
                    if(viewModel.userProfile().missionary_profile_key != null)
                        router.navigateTo("profile");
                    else{
                        alertify.error("Failed to load profile");
                        console.error("Failed to load profile for editing");
                    }
                });
        },
        */
    };
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
            geocoder.geocode({ address:query },function(results,status){
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
   // ko.computed(function(){
   //     var page=viewModel.currentPage();
   //     var resultsView = viewModel.searchResultsTemplate();
   //     if(resultsView === "map-results-template")
   //         viewModel.initResultsMap();
   // });
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

    /*
    ko.computed(function(){
        var username = viewModel.username();
        if(username == null || username==="")
            return;
        jQuery.get("api/genToken/"+username).
            then(function(token){
                viewModel.token(token);

                db.get("/users_view").auth(viewModel.token()).then(function(result){
                    console.log("visable users: ",result);
                });
                db.patch("/users_view").auth(viewModel.token()).send({first_name:"bob"}).
                    then(function(result){
                        console.log("patch result: ",result);
                    });
            });
    });
    */
    viewModel.getOrganization=function(organization_key) {
        organization_key = parseInt(organization_key); //TOOD: fix selectgize functions that set this to be a string 
        return viewModel.approvedOrganizations().find(function(org){
            return org.organization_key === organization_key;
        });
    };
    viewModel.doSearch=ko.computed(function(){
        var name, org, skills, location,query;
        var request;
        console.log("doing search");
        query = viewModel.query();
        name = viewModel.filter.name();
        org= viewModel.filter.organization();
        skills= viewModel.filter.skills();
        location= viewModel.filter.location();

        if(query==null && name==null && org==null && skills==null && location==null){
            viewModel.profiles.removeAll();
            return;
        }

        request=db.get("/profile_search");

        if(query != null && query !== '')
            request = request.ilike("search_text",'*'+query+'*');
        if(name != null)
            request = request.ilike("missionary_name",'*'+name+'*');
        if(org!= null)
            request = request.ilike("organization_name",'*'+org+'*');
        if(skills!= null)
            request = request.query({"job_catagory_keys": "ov.{"+skills.join(",")+"}"});
        if(location!= null)
            request = request.ilike("location",'*'+location+'*');

        //TODO: if a resultMap is defined, constrain results to fit in box.
        // can simulare by just not resizing the map to fit results.

        return request.then(function(results){
                console.log("filtered search results:",results)
                viewModel.profiles(results);
            });


        //if(name != null || org != null || skills != null || location != null)
        //    jQuery.post("api/search",viewModel.filter).
        //        then(function(results){
        //            console.log("filtered search results: ",results);
        //            viewModel.profiles(results);
        //        });
    });
    ko.computed(function(){
        var profiles = viewModel.profiles();
        var bound;
        var ne,sw;
        console.log("updating map results");
        if(resultsMap == null)
            return;

        //remove any existing markers
        while(resultMarkers.length > 0){
            resultMarkers.pop().setMap(null);
        }

        //add profiles to map
        profiles.forEach(function(profile){
            console.log("profile lat long: ",profile.data.location_lat, profile.data.location_long);
            resultMarkers.push(
                new google.maps.Marker({
                    map: resultsMap,
                    position: {
                        lat: profile.data.location_lat,
                        lng: profile.data.location_long,
                    }
                })
            );
        });

        bound = new google.maps.LatLngBounds();
        resultMarkers.forEach(function(m){
            bound.extend(m.position);
        });
        ne=bound.getNorthEast();
        sw=bound.getSouthWest();
        if(ne.lng() - sw.lng() < 20){
            //bounds too small
            bound.extend(new google.maps.LatLng(ne.lat()+5,ne.lng()));
            bound.extend(new google.maps.LatLng(sw.lat()+5,sw.lng()));
        }
        resultsMap.fitBounds(bound);
    })
    viewModel.loadFeaturedProfiles = function(){
        console.log("loading featured profiles");


        db.get("/featured_profiles").
            then(function(results){
                //viewModel.featuredProfiles(results.map(function(result){return result.profile;}));
                viewModel.featuredProfiles(results);
            });


       // var profiles = viewModel.profiles();
       // profiles.sort(function(){
       //     return Math.random() - 0.5; //make negative half the time
       // });
       // if(number <= profiles.length)
       //     return profiles.slice(0,number);
       // else    
       //     return profiles;

    };
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
    viewModel.newProfile = function(){
        return db.get("/new_missionary_profile").
            single().
            then(function(result){
                return {
                    data:ko.mapping.fromJS(result.data),
                    user_key:ko.observable(viewModel.loggedInUser().user_key()),
                    missionary_profile_key:ko.observable(),
                }
            });
    },
    viewModel.newOrganization = function(){
        return db.get("/new_organization").
            single().
            then(function(result){
                var obj=ko.mapping.fromJS(result.data);
                obj.organization_key= ko.observable();
                return obj;
            });
    },
    viewModel.initObject = function(objectName){
        return db.get("/table_fields").
            eq("table_name",objectName).
            then(function(results){
                console.log("object fields",results);
                var obj={};
                results.forEach(function(result){
                    obj[result.field_name] = ko.observable();
                });
                return obj;
            });
    };
    
    ko.applyBindings(viewModel);


    db.get("/organizations_view").then(function(result){
        viewModel.approvedOrganizations(result);
    }).then(function(){
        db.get("/job_catagories_view").then(function(result){
            viewModel.jobCatagories(result);
            viewModel.loadFeaturedProfiles(); //this depends on jobCatagories
        });
    });


    router = new Router({
        root:base,
        page404: function (path) {
            console.log('"/' + path + '" Page not found');
            viewModel.currentPage("notfound-template");
        }
    });
     
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
    router.add('profile-detail/(:num)', function (missionary_profile_key) {
        if(viewModel.selectedProfile() == null){
            db.get("/profile_search").eq("missionary_profile_key",missionary_profile_key).
                then(function(results){
                    console.log("found profile; ",results);
                    if(results.length === 1){
                        viewModel.selectedProfile(results[0]);
                        viewModel.currentPage("profile-detail-page-template");
                    }else{
                        console.log("no profile found for missionary_profile_key",missionary_profile_key);
                        alertify.error("Profile not found");
                    }
                }).catch(function(error){
                    console.log("no profile found for missionary_profile_key",missionary_profile_key,error);
                    alertify.error("Profile not found");
                });
        }else
            viewModel.currentPage("profile-detail-page-template");
    });
    router.add('about/', function () {
        viewModel.currentPage("about-page-template");
    });
    router.add('org-application/', function () {
        viewModel.newOrganization().
            then(function(newOrg){
                console.log("new org: ",newOrg);
                viewModel.organizationApplication(newOrg);
                viewModel.currentPage("org-application-page-template");
            }).catch(function(error){
                console.log("failed to get new organization: ",error);
                alertify.error("Failed to load Organization Application page");
            })
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
        window.location=authBase+"/logout?client_id=785acfb9-0f7a-4655-bcf0-ef6dcffcee70";
    });

    function uploadProfilePicture(form){
        console.log("uploading profile picture");
        var files;
        var file;
        var bucketKey;

        files = jQuery(form).find("#profile-picture")[0].files;
        if(files.length === 0)
            //return Promise.reject("no file to upload");
            return jQuery.Deferred().reject("no file to upload");

        file=files[0];
        bucketKey = viewModel.loggedInUser().user_key()+"/"+file.name;
        console.log("file: ",file);

        return jQuery.get("api/getSignedUrl/"+bucketKey).
            then(function(result){
                var promise = jQuery.Deferred();
                //return new Promise(function(resolve,reject){

                    console.log("signed url: ",result);
                    var signedUrl = result.url;
                    const xhr = new XMLHttpRequest();
                    xhr.open("PUT", signedUrl, true);
                    xhr.onload = function() {
                        var status = xhr.status;
                        if (status === 200) {
                            console.log("File is uploaded");
                            promise.resolve(bucketBase+bucketKey);
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
                    xhr.send(file);
                //});
                return promise;
            }).fail(function(error){
                console.error("failed to get signed upload url: ",error);
            });
    }
    function doLogin(code,state){

        var postLogin=function(user){
            viewModel.loggedInUser(ko.mapping.fromJS(user));

            if(state != null && state==="profile")
                viewModel.checkForProfile("profile");
            else
                viewModel.checkForProfile();

        }
        return jQuery.get("api/token/"+code).
            then(function(result){
                console.log("token result: ",result);
                if(result.access_token != null){
                    viewModel.token(result.access_token)

                    db.get("/users_view").auth(viewModel.token()).
                        eq("email",result.email).
                        single().
                        then(function(result){
                            console.log("logged in user: ",result);
                            postLogin(result);
                        
                        }).catch(function(error){
                            if(String(error).indexOf("Not Acceptable")!==-1){ // indicates no results returned, but otherwise call was fine
                                db.post("/users_view").auth(viewModel.token()).
                                    set("Prefer","return=representation").
                                    send({email:result.email}).
                                    single().
                                    then(function(result){
                                        console.log("new user record: ",result);
                                        postLogin(result);
                                    }).
                                    catch(function(error){
                                        console.log("failed to create new user with email "+result.email,error);
                                        alerify.error("Failed to create user");
                                    });
                            }
                        });
                }else{
                    alertify.error("Login Failed");
                    console.error("No access_token found in result");
                }
            }).fail(function(error){
                alertify.error("Login Failed");
                console.error("failed to get access token: "+error);
            });

    }

    var code = getURLParameter("code");
    var state= getURLParameter("state");
    var userState = getURLParameter("userState");
    console.log("code: ",code);
    if(code != null && userState != null && userState==="Authenticated"){
        doLogin(code,state);
    }else{
        //for testing mode, always try to sign in
        //window.location=viewModel.loginURL;
        router.navigateTo(window.location.pathname.replace(base,""));
    }


    router.addUriListener();
    
}

//module.exports = {
//    mainInit: () => mainInit(),
//    viewModel: viewModel,
//};
export default {mainInit};