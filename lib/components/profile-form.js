
import * as utils from '../client/client-utils';
import {ensureFields} from '../shared/shared-utils';
/**
 * INPUT
 * -----
 *      - profile:  observable with profile object
 *      - appState: AppState object
 *      - userId: observable with external_user_id value
 *      - navigateFn: function that returns a function to perform a navigation
 *      - isProfileManager: true if user has rule 'profile_manager'
 */

export function register(){
   const NAME="profile-form";
   const SENSITIVE_LOCATION_TAG_KEY="3";


   ko.components.register(NAME, {
       viewModel: function(params) {
            console.log(NAME+" params: ",params);
            var self=this;
            var profileObs;

            ensureFields(params,["profile","appState","userId","navigateFn"]);

            profileObs = params.profile;

            self.appState = params.appState;
            self.da = params.appState.da;
            self.server = params.appState.server;
            self.storage = params.appState.storage;
            self.profile = profileObs().data;
            self.missionary_profile_key = profileObs().missionary_profile_key;
            self.utils=utils;
            self.userId = params.userId;
            self.navigateFn = params.navigateFn;
            self.isProfileManager = params.isProfileManager;

            self.state = ko.observable();
            self.profileState = profileObs().state;
            self.saving = ko.observable(false).extend({rateLimit:500});
            self.peopleGroupRunning= ko.observable(false).extend({rateLimit:500});
            self.languageRunning= ko.observable(false).extend({rateLimit:500});
            self.saved = ko.observable(false);
            self.currentPage = ko.observable();
            self.currentFooter = ko.observable();
            self.pageErrors = ko.observable({}); // per page error messages

            self.sensitiveProfile = ko.observable(false);

            const jobCatagories= self.appState.jobList.listObs();
            const orgsWithProfiles = self.appState.orgsWithProfilesList.listObs();
            const tags = self.appState.tagList.listObs();
            const causes = self.appState.causeList.listObs();


            console.log("profile: ",ko.unwrap(self.profile));
            console.log("org key: ",self.profile.organization_key);
            self.selectedOrganization = ko.computed(() =>{
                var organization_key = parseInt(self.profile.organization_key());
                var org = self.appState.getOrganizationObs(organization_key)();
                if(Object.keys(org).length === 0)
                    return undefined;

                return org;
            });
            self.getPage = function(state){
                switch(state){
                    //special cases here
                    default:
                        return state+"_page";
                }
            };
            self.getFooter = function(state){
                switch(state){
                    case "new_profile":
                        return "new_profile_footer";
                    default:
                        return "footer";
                }

            };
            self.checkForSensitiveLocation=function(tags){
                self.sensitiveProfile(tags.includes(SENSITIVE_LOCATION_TAG_KEY)); 
            };
            self.sensitiveProfile.subscribe( newValue => {
                console.log("sensitive location check value: ",newValue);
                var tags = self.profile.tag_keys();
                if(newValue === true && ! tags.includes(SENSITIVE_LOCATION_TAG_KEY)){
                    tags.push(SENSITIVE_LOCATION_TAG_KEY); 
                }else if(newValue === false &&  tags.includes(SENSITIVE_LOCATION_TAG_KEY)){
                    tags = tags.filter( x => x != SENSITIVE_LOCATION_TAG_KEY);
                }
                self.profile.tag_keys(tags);
            });
 

            self.checkForSensitiveLocation(self.profile.tag_keys());

            if(profileObs().missionary_profile_key() == null) { // new profile
                self.state("new_profile");
            }else if(location.hash != null 
                     && location.hash !== ''
                     && ["org","personal","locations","support","files","ministry"].includes(location.hash.replaceAll("#",""))){
                self.state(location.hash.replaceAll("#",""));
            }else{
                self.state("org");
            }

            ko.computed(function(){
                var state = self.state();
                var newPage = self.getPage(state);
                var newFooter = self.getFooter(state);
                self.saved(false);
                self.currentPage(newPage);
                self.currentFooter(newFooter);
                //if(state !== "menu")
                    //utils.scrollToFn("body")();
            })

            self.nextPage = function(){
                switch(self.state()){
                    case "new_profile":
                        return self.state("personal")
                    case "org":
                        return self.state("personal");
                    case "personal":
                        return self.state("ministry");
                    case "ministry":
                        return self.state("locations");
                    case "locations":
                        return self.state("support");
                    case "support":
                        return self.state("files");
                    case "files":
                        return self.state("files");
                    default:
                        return self.state("org");
                }
            }

            self.setStateFn = function(state){
                return function(){
                    self.state(state);
                };
            }

            self.setProfilePicture = function(){
                return this.storage.browseForProfilePicture(self.profile,self.userId(),self.server);
            }

            self.orgSelectizeOptions= {
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
                    console.log("init for orgSelectizeOptions");
                    var api=this;
                    var obs=self.appState.approvedOrgList.listObs();
                    ko.bindingHandlers.selectize.utils.setOptions(api,obs);
                    ko.bindingHandlers.selectize.utils.watchForNewOptions(api,obs);

                    if(self.profile != null && self.profile.organization_key() != null)
                        ko.bindingHandlers.selectize.utils.setItems(api,self.profile.organization_key);

                    // watch for changes to organization_key
                    if(self.profile != null && self.profile.organization_key != null){
                        self.profile.organization_key.subscribe((newValue) =>{
                            if(newValue != null && newValue !== ""){
                                dataLayer.push({event:'user','user-action':"profile-org-selected",user_id: self.userId()});
                            }
                        });
                    }
                    
                },
                onObsUpdate: onObsUpdate
            };
            
            self.peopleGroupSelectizeOptions = utils.peopleGroupSelectizeOptions(
                                                        self.server,
                                                        self.peopleGroupRunning,
                                                        self.profile.people_id3_codes);
            self.languageSelectizeOptions = utils.languageSelectizeOptions(
                                                        self.server,
                                                        self.languageRunning,
                                                        self.profile.rol3_codes);
         

            self.jobSelectizeOptions= utils.jobSelectizeOptions(jobCatagories,self.profile.job_catagory_keys);

            self.birthYearsSelectizeOptions = {
                create: true,
                maxItems:100,
                plugins:['remove_button'],
                createFilter: /^\d{4}$/,
                onInitialize: function(){
                    var api=this;
        
                    if(self.profile != null && self.profile.kids_birth_years() != null){
                        self.profile.kids_birth_years().forEach(year => 
                            api.addOption({value: year, text: year }));
                        ko.bindingHandlers.selectize.utils.setItems(api,self.profile.kids_birth_years);
                    }
                }
            }
            self.tagSelectizeOptions= utils.tagSelectizeOptions(tags,self.profile.tag_keys);
            self.tagSelectizeOptions.maxItems=20;
            self.tagSelectizeOptions.onObsUpdate = function(api,value){
                    //console.log("new tag values: ",value()); 
                    self.checkForSensitiveLocation(value());
                    utils.onObsUpdate(api,value);
                }

           
            self.causeSelectizeOptions= utils.causeSelectizeOptions(causes,self.profile.cause_keys);
            

            self.saveProfile= async function(noAdvance){
                var data ;
                var reloadedProfile;

                self.server.sendRecaptcha("save_profile");
                console.log("save Profile: ",profileObs());


                try{

                    self.saving(true);
                    await self.updateSearchTerms();
                    data = ko.mapping.toJS(profileObs());

                    //if( profileObs().missionary_profile_key() == null){
                    if( self.isNew() ){
                        reloadedProfile =  await self.da.createProfile(data);
                        self.server.authPostJson("/api/newProfile",{
                            firstName: data.data.first_name,
                            lastName: data.data.last_name,
                            missionary_profile_key: reloadedProfile.missionary_profile_key,
                        });
                        dataLayer.push({event:'profile','profile-action':"saved-new",user_id: self.userId()});
                    }else{
                        reloadedProfile =  await self.da.updateProfile(profileObs().missionary_profile_key(),data);
                        dataLayer.push({event:'profile','profile-action':"saved-existing",user_id: self.userId()});
                    }

                    ko.mapping.fromJS(reloadedProfile,null,profileObs);
                    //self.navigateFn("profile-saved")();
                    self.saved(true);
                    if(noAdvance !== true){
                        self.nextPage();
                        utils.scrollToFn("body")();
                    }
                    window.localStorage.removeItem("savedProfile");
                }catch(error){
                    console.error("failed to create or update profile. "+error.message,error);
                    if(error.status === 401){
                        alertify.error("Session expired, could not save your profile. Please log-in again.");
                    }else
                        alertify.error("Failed to save profile");
                }finally{
                    self.saving(false);
                }

            };
            self.updateSearchTerms = async function(){
                //set various terms for full-text-search  to use. We otherwise only store the keys for these.
                self.profile.search_terms = ""; //reset

                try{
                   await self.appState.countryList.selectItems(self.profile.impact_countries(),
                               countries =>{
                                   self.profile.search_terms = self.profile.search_terms + " "+
                                                                   countries.map(x => x.name).join(" ");
                               });
                }catch(error){
                   console.error("failed to update search terms for impact countries",error);
                }
                
                try{
                   await utils.peopleGroupNames(self.appState.server,self.profile.people_id3_codes())
                            .then( names => {
                                self.profile.search_terms = self.profile.search_terms + " "+
                                    names.map(x => x.PeopNameAcrossCountries).join(" ");

                            });
                }catch(error){
                   console.error("failed to update search terms for people groups",error);
                }

                try{
                   await utils.languageNames(self.appState.server,self.profile.rol3_codes())
                            .then( names => {
                                self.profile.search_terms = self.profile.search_terms + " "+
                                    names.map(x => x.Language).join(" ");

                            });
                }catch(error){
                   console.error("failed to update search terms for language names",error);
                }
            }
            self.isNew = function(){
                return profileObs().missionary_profile_key() == null;
            }
            self.isLast = function(){
                return self.state() === "files";
            }
            self.cancel = function(){
                //TODO: reload profile if user cancels to ensure original data is restored
                
                self.state("menu");
            }
            self.updatePageValidityFn =function(pageName){

                return function(validity){
                    var errors = self.pageErrors();
                    //console.log("updating page validity for page "+pageName+": ",validity);
                    if(validity)
                        errors[pageName] = undefined;
                    else
                        errors[pageName] = "Validation error. Scroll down to see messages";

                    self.pageErrors(errors);
                };
            }
            self.checkPublishRequirements = function(){
                console.log("checking publish requirements");
                    //ensure that description is defined
                if(self.profile.description() == null || self.profile.description() === ""){
                    console.log("description not set:",self.profile.description());
                    self.state("ministry");
                    return false;
                }

                return true;
            }
            self.togglePublished= async function(){
                var published = self.profile.published();
                self.appState.search.refreshSearchResults();

                if(!published && ! self.checkPublishRequirements()){ //trying to go from un-published -> published
                    return;
                }

                self.setPublishedState(!published);
            }
            self.setPublishedState= async function(published){
                var origState = self.profile.published();
               try{
                    self.profile.published(published);
                    await self.saveProfile(true)

                    if(origState === null && published === true){
                        //never been published before
                        self.server.authPostJson("/api/firstPublish",{
                            missionary_profile_key: profileObs().missionary_profile_key()
                        });
                    }
             

                    if(published === true ){
                        if(self.isProfileManager != null && self.isProfileManager() === true)
                            self.navigateFn("dashboard")();
                        else
                            self.navigateFn("profile-saved")();
                    }
                }catch(error){
                    self.profile.published(origState);
                    console.error("failed to set published state to: "+published,error);
                }
            }
        },
        template: require('./'+NAME+'.html'),
    });
}
function onObsUpdate(api, value){
    //console.log("new value set on observable: ",value());
    api.clear(true);
    ko.bindingHandlers.selectize.utils.setItems(api,value);
}
