
var viewModel;
//var db; //TODO: move this back inside mainInit
jQuery(document).ready(function() { mainInit(); });
var getFormData;

function mainInit(){
    var bucketBase="https://storage.googleapis.com/ergatas-public/";
    var postgrestBase="/db";
    var authBase="http://auth-dev.ergatas.org:9011/oauth2";
    var authRedirect="https://dev.ergatas.org:9444/";
    var router;
    var base="/";
    var db;
    var geocoder = new google.maps.Geocoder();
    var map;
    var profileMarker;


    db= new PostgREST(postgrestBase);

  
    getFormData=function(form){
        var fields= jQuery(form).serializeArray();
        var data={};
            
        fields.forEach(function(field){
            if(data[field.name] != null){ //we've seen this field before, so store as array
                data[field.name] = [field.value].concat(data[field.name]);
            }else
                data[field.name]=field.value;
        });

        return data;
    }
    viewModel = {
        loginURL: authBase+"/authorize?client_id=785acfb9-0f7a-4655-bcf0-ef6dcffcee70&response_type=code&redirect_uri="+authRedirect,
        query: ko.observable(),
        loggedInUser:ko.observable(),
        token: ko.observable(),
        currentPage:ko.observable("home-page-template"),
        profiles: ko.observableArray(),
        featuredProfiles: ko.observableArray(),
        organizations:ko.observableArray(),
        jobCatagories: ko.observableArray(),
        userProfile: ko.observable(undefined),
        sortBy: ko.observable(),
        filter: {
            name:ko.observable(),
            organization:ko.observable(),
            skills: ko.observable(),
            location:ko.observable(),
        },
        iframeReload: function(data){
            console.log("iframe reloading: ",data);

        },
        navigateFn: function(path){
            return function(){
                router.navigateTo(path);
            }
        },
        //signIn: function(form){
        //    var data=getFormData(form);
        //    jQuery.get("api/genToken/"+data.email).
        //        then(function(token){
        //            viewModel.token(token);
        //            db.get("/users_view").auth(viewModel.token()).
        //                eq("email",data.email).
        //                then(function(result){
        //                    console.log("logged in user: ",result);
        //                    if(result.length === 1){
        //                        viewModel.loggedInUser(ko.mapping.fromJS(result[0]));
        //                        viewModel.checkForProfile();
        //                    }else{
        //                        alertify.error("Login failed");
        //                        console.error("signIn: returned user list was not of length 1");
        //                    }
        //                });
        //        }).fail(function(error){
        //            console.log("failed to get token: ",error);
        //            alertify.error("Login failed");
        //        });
        //},
        //signUp: function(form){
        //    var data=getFormData(form);
        //    db.post("/users_view").
        //        //send(ko.mapping.toJS(viewModel.loggedInUser())).
        //        send(data).
        //        then(function(result){
        //            console.log("user created: ",result);
        //            //TODO: modify postgrest-client to allow access to reponse headers, which will tell use the resulting key value 
        //            viewModel.signIn(form);
        //        }).catch(function(error){
        //            console.log("failed to create new user: ",error);
        //            if(String(error).indexOf("Conflict") !== -1)
        //                alertify.error("A User with that email address already exists, please choose another one");
        //            else
        //                alertify.error("Sign Up failed");
        //        });
        //},
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
        createProfile: function(form){
            var data;
            var profile;
            var picture_url;
            var updateFn ;

            data=getFormData(form);
            profile = viewModel.userProfile();
            console.log("create Profile: ",profile,data);

            updateFn = function(){
                var jobIds;
                if( ! viewModel.hasProfile()){
                    console.log("inserting");

                    data.user_key =viewModel.loggedInUser().user_key(); 
                    data.picture_url=picture_url;
                    jobIds = data.profile_jobs_view;
                    delete data.profile_jobs_view;

                    db.post("/missionary_profiles_view").auth(viewModel.token()).send(data). 
                    then(function(result){
                        console.log("post result: ",result);
                        /*
                        //TODO: fix postgrest-client to allow returning full, newly inserted record, so we dont have to fetch it again here
                        db.get("/missionary_profiles_view").auth(viewModel.token()).
                            eq("user_key",viewModel.loggedInUser().user_key()).
                            then(function(result){
                                if(result.length===1)
                                    viewModel.userProfile(ko.mapping.fromJS(result[0]));
                            });
                        */

                        viewModel.loadProfile('user_key',viewModel.loggedInUser().user_key()).
                            then(function(){ // add job_catagories here
                                //TODO: need to handle removals as well
                                if(jobIds != null && jobIds.length > 0){
                                    if(jobIds.map == null) jobIds=[jobIds];
                                    db.post("/profile_jobs_view").auth(viewModel.token()).
                                        send( 
                                            jobIds.map(function(job_catagory_key){
                                                return {missionary_profile_key: viewModel.userProfile().missionary_profile_key(),
                                                        job_catagory_key:job_catagory_key};
                                            })
                                        ).then(function(){
                                            alertify.success("Profile Saved");
                                            router.navigateTo("");
                                        });
                                }else{
                                        alertify.success("Profile Saved");
                                    router.navigateTo("");
                                }
                        });
                    }).then(function(){
                        //reload profile
                    }).catch(function(error){
                        console.error("failed to create new profile: ",error);
                        alertify.error("Failed to create profile");
                    });
                }else{
                    console.log("patching");
                    if(picture_url != null )
                        profile.picture_url(picture_url);

                    data = ko.mapping.toJS(profile);
                    delete data.profile_jobs_view; 

                    db.patch("/missionary_profiles_view").
                        auth(viewModel.token()).
                        eq("missionary_profile_key",profile.missionary_profile_key()).
                        send( data).
                    then(function(result){
                        console.log("post result: ",result);
                        // add job_catagories here
                        if(profile.profile_jobs_view() != null ){
                            if(profile.profile_jobs_view().map == null) 
                                profile.profile_jobs_view([profile.profile_jobs_view()]);
                            db.post("/profile_jobs_view?on_conflict=missionary_profile_key,job_catagory_key").auth(viewModel.token()).
                                set("Prefer","resolution=ignore-duplicates").
                                send( 
                                    //TODO: need to handle removals as well
                                    profile.profile_jobs_view().map(function(job_catagory_key){
                                        return {missionary_profile_key: viewModel.userProfile().missionary_profile_key(),
                                                job_catagory_key:job_catagory_key};
                                    })
                                ).then(function(){
                                    alertify.success("Profile Saved");
                                    router.navigateTo("");
                                });
                        }else{
                            alertify.success("Profile Saved");
                            router.navigateTo("");
                        }

                    }).catch(function(error){
                        console.error("failed to update new profile: ",error);
                        alertify.error("Failed to update profile");
                    });
    
                }

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
/*
            db.get("/missionary_profiles_view").auth(viewModel.token()).
                eq("user_key",viewModel.loggedInUser().user_key()).
                then(function(result){
                    console.log("fetched profile: ",result);
                    if(result.length===0){
                        console.log("no profile found");
                        router.navigateTo("profile");
                    }else if(result.length===1){
                        viewModel.userProfile(ko.mapping.fromJS(result[0]));
                        router.navigateTo("");
                    }
                });
                */
        },
        loadProfile: function(byKeyType, keyValue){
            var mappingOptions={
                'profile_jobs_view':{
                    create: function(options){
                        console.log("options.data: ",options.data);
                        if(options.data.job_catagories_view != null && options.data.job_catagories_view.job_catagory_key != null)
                            return options.data.job_catagories_view.job_catagory_key;
                        return {};
                    }
                }
            };
            console.log("loading profile by "+byKeyType+"="+keyValue);
            return db.get("/missionary_profiles_view").auth(viewModel.token()).
                eq(byKeyType,keyValue).
                select('*,profile_jobs_view(job_catagories_view(*))').
               // single().
                then(function(result){
                    console.log("profile result: ",result);
                    if(result.length===1){
                        viewModel.userProfile(ko.mapping.fromJS(result[0],mappingOptions));

                        router.navigateTo("profile");
                        
                    }
                    //Not always an error, caller should raise error if needed
                    //else{
                    //    alertify.error("Failed to load profile");
                    //    console.error("got back "+result.length+" profile results, expected 1");
                    //}
                });

        },
        initProfileForm: function(element){
            var profile = viewModel.userProfile();
            var centerOfMap,options;
            console.log("initializing profile form. ",element);

            //TODO: idea to init profile based on existing fields in form. not sure if its a good idea or not yet
            //if(viewModel.userProfile() == null)
                //viewModel.userProfile(viewModel.getFormFields("#profile-form-template"));

		    //uploaderOptions.element= jQuery(element).find("#fine-uploader")[0];
            //uploader = new qq.s3.FineUploader(uploaderOptions);


            if(profile != null)
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
            viewModel.showMap(profile);
            ko.computed(function(){
                console.log("location lat/long update");
                if(viewModel.userProfile() != null)
                    viewModel.recordLocation(viewModel.userProfile().location_lat(),
                                         viewModel.userProfile().location_long());
            })

        },
        recordLocation: function(lat,long){
            var location = {lat:lat,lng:long};
            console.log("recording location ",location);
            if(profileMarker != null){
                profileMarker.setPosition(location);
                map.setCenter(location);
                map.setZoom(7);
                jQuery("#location_lat").val(location.lat);
                jQuery("#location_long").val(location.lng);
                if(viewModel.userProfile() != null){
                    viewModel.userProfile().location_lat(location.lat);
                    viewModel.userProfile().location_long(location.lng);
                }
            }
        },

       // recordMarker: function(marker){
       //         jQuery("#location_lat").val(marker.getPosition().lat());
       //         jQuery("#location_long").val(marker.getPosition().lng());
       //         //vm.location_lat(marker.getPosition().lat());
       //         //vm.location_long(marker.getPosition().lng());
       // },

        showMap: function(vm){
            console.log("showing map",vm);
            profileMarker = new google.maps.Marker({
                    //position: {lat:vm.location_lat(), lng: vm.location_long()},
                    map:map,
                    draggable: true,
                });

            google.maps.event.addListener(profileMarker, 'dragend', function(event){
                viewModel.recordLocation(profileMarker.getPosition().lat(), profileMarker.getPosition().lng());
            });

            //Listen for any clicks on the map.
            google.maps.event.addListener(map, 'click', function(event) {                
                //Get the location that the user clicked.
                var clickedLocation = event.latLng;
                console.log("click envent ",clickedLocation);
                profileMarker.setPosition(clickedLocation);
                viewModel.recordLocation(profileMarker.getPosition().lat(), profileMarker.getPosition().lng());
            });
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
        options: viewModel.organizations,
    };
    viewModel.jobSelectizeOptions= {
        create:false,
        valueField: "job_catagory_key",
        labelField:"catagory",
        //options: viewModel.jobCatagories,
        plugins:['remove_button'],
        maxItems:10,
        onInitialize: function(){
            var api=this;

            console.log("select job catagories: ",viewModel.userProfile() && viewModel.userProfile().profile_jobs_view());
            if(viewModel.jobCatagories() != null)
                api.addOption(viewModel.jobCatagories());

            if(viewModel.userProfile() != null && viewModel.userProfile().profile_jobs_view() != null)
                viewModel.userProfile().profile_jobs_view().map(function(job){
                    api.addItem(job,true);
                });

            viewModel.jobCatagories.subscribe(function(newValue){
                console.log("new job catagories set");
                if(newValue != null){
                    api.clearOptions(true);
                    api.addOption(newValue);
                    api.refreshOptions(false);
                }
            });
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
        onInitialize: function(a1){
            console.log("location selectize init: ",this);
            var profile = viewModel.userProfile();
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
            })
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
        return viewModel.userProfile() != null;
    });
    viewModel.jobCatagoryArray = function(data){
        if(data.job_catagories != null)
            return data.job_catagories.split("|");
        else
            return [];
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

        request=db.get("/profile_search").auth(viewModel.token());

        if(query != null)
            request = request.ilike("search_text",'*'+query+'*');
        if(name != null)
            request = request.ilike("missionary_name",'*'+name+'*');
        if(org!= null)
            request = request.ilike("organization_name",'*'+org+'*');
        if(skills!= null)
            request = request.ilike("job_catagories",'*'+skills+'*');
        if(location!= null)
            request = request.ilike("location",'*'+location+'*');

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
    viewModel.loadFeaturedProfiles = function(){
        console.log("loading featured profiles");


        db.get("/featured_profiles").auth(viewModel.token()).
            then(function(results){
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
    ko.applyBindings(viewModel);

    viewModel.loadFeaturedProfiles();

    db.get("/organizations_view").auth(viewModel.token()).then(function(result){
        viewModel.organizations(result);
    });

    db.get("/job_catagories_view").auth(viewModel.token()).then(function(result){
        viewModel.jobCatagories(result);
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
    router.add('about/', function () {
        viewModel.currentPage("about-page-template");
    });
    router.add('signIn/', function () {
        console.log("sign in with no redirect");
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

        return jQuery.get("api/token/"+code).
            then(function(result){
                console.log("token result: ",result);
                if(result.access_token != null){
                    viewModel.token(result.access_token)

                    //TODO: create user if not already existing.
                    db.get("/users_view").auth(viewModel.token()).
                        eq("email",result.email).
                        then(function(result){
                            console.log("logged in user: ",result);
                            if(result.length === 1){
                                viewModel.loggedInUser(ko.mapping.fromJS(result[0]));

                                if(state != null && state==="profile")
                                    viewModel.checkForProfile("profile");
                                else
                                    viewModel.checkForProfile();
                            }else{
                                alertify.error("Login failed");
                                console.error("signIn: returned user list was not of length 1");
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