
import * as utils from '../client-utils';
import {ensureFields} from '../shared-utils';
/**
 * INPUT
 * -----
 *      - profile:  observable with profile object
 *      - appState: AppState object
 *      - server: server api object
 *      - userId: observable with external_user_id value
 *      - storage: CloudStorage object
 *      - navigateFn: function that returns a function to perform a navigation
 */

export function register(){
   const NAME="profile-form";


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
            self.utils=utils;
            self.userId = params.userId;
            self.navigateFn = params.navigateFn;

            self.state = ko.observable();
            self.saving = ko.observable(false).extend({rateLimit:500});
            self.saved = ko.observable(false);
            self.currentPage = ko.observable();
            self.currentFooter = ko.observable();

            self.appState.updateTagList().then( () => self.profile.tag_key.valueHasMutated())
            self.appState.updateJobList().then( () => self.profile.job_catagory_keys.valueHasMutated());
            self.appState.updateApprovedOrgList().then( () => self.profile.organization_key.valueHasMutated());


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

            }
 

            if(profileObs().missionary_profile_key() == null) { // new profile
                self.state("new_profile");
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
                return this.storage.browseForProfilePicture(self.profile,self.userId,self.server);
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
                    var obs=self.appState.approvedOrganizations;
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
            
            self.jobSelectizeOptions= {
                create:false,
                valueField: "job_catagory_key",
                labelField:"catagory",
                searchField: "catagory",
                plugins:['remove_button'],
                maxItems:10,
                onInitialize: function(){
                    var api=this;

                    ko.bindingHandlers.selectize.utils.setOptions(api,self.appState.jobCatagories);
                    ko.bindingHandlers.selectize.utils.watchForNewOptions(api,self.appState.jobCatagories);

                    if(self.profile != null && self.profile.job_catagory_keys() != null)
                        ko.bindingHandlers.selectize.utils.setItems(api,self.profile.job_catagory_keys);
                },
                onObsUpdate: onObsUpdate
            };
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
            self.tagSelectizeOptions= {
                create:false,
                valueField: "tag_key",
                labelField:"name",
                searchField: "name",
                plugins:['remove_button'],
                maxItems:20,
                onInitialize: function(){
                    var api=this;

                    ko.bindingHandlers.selectize.utils.setOptions(api,self.appState.tags);
                    ko.bindingHandlers.selectize.utils.watchForNewOptions(api,self.appState.tags);

                    if( self.profile != null && self.profile.tag_keys() != null)
                        ko.bindingHandlers.selectize.utils.setItems(api,self.profile.tag_keys);
                },
                onObsUpdate: onObsUpdate
            };
            self.saveProfile= async function(noAdvance){
                var data ;
                var reloadedProfile;

                self.server.sendRecaptcha("save_profile");
                console.log("save Profile: ",profileObs());


                try{

                    self.saving(true);
                    data = ko.mapping.toJS(profileObs());

                    //if( profileObs().missionary_profile_key() == null){
                    if( self.isNew() ){
                        reloadedProfile =  await self.da.createProfile(data);
                        dataLayer.push({event:'profile','profile-action':"saved-new",user_id: self.userId});
                    }else{
                        reloadedProfile =  await self.da.updateProfile(profileObs().missionary_profile_key(),data);
                        dataLayer.push({event:'profile','profile-action':"saved-existing",user_id: self.userId});
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
            self.togglePublished= async function(){
                self.setPublishedState(!self.profile.published());
            }
            self.setPublishedState= async function(published){
                var origState = self.profile.published();
                try{
                    self.profile.published(published);
                    await self.saveProfile(true)
                    if(published === true)
                        self.navigateFn("profile-saved")();
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