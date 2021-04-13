
import * as utils from '../client-utils';
import {ensureFields} from '../shared-utils';
/**
 * INPUT
 * -----
 *      - profile:  observable with profile object
 *      - da: data-access object
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
            const approvedOrganizations = ko.observable();
            const tags = ko.observable();
            const jobCatagories = ko.observable();
            var profileObs;

            ensureFields(params,["profile","da","userId","storage","server","navigateFn"]);

            profileObs = params.profile;
            self.da = params.da;
            self.server = params.server;
            self.storage = params.storage;
            self.profile = profileObs().data;
            self.utils=utils;
            self.userId = params.userId;
            self.navigateFn = params.navigateFn;

            console.log("profile: ",ko.unwrap(self.profile));
            console.log("org key: ",self.profile.organization_key);
            self.selectedOrganization = ko.computed(() =>{
                var organization_key = parseInt(self.profile.organization_key());
                var orgs = approvedOrganizations();
                return orgs == null ? null :  
                        orgs.find( org => org.organization_key === organization_key );
            });



            self.da.organizationList().then( orgs => { 
                approvedOrganizations(orgs); 
                //trigger update in case options were loaded late
                self.profile.organization_key.valueHasMutated();
            });
            self.da.jobList().then( jobs =>{ 
                jobCatagories(jobs);
                self.profile.job_catagory_keys.valueHasMutated();
            });
            self.da.tagList().then( t =>{ 
                tags(t)
                self.profile.tag_keys.valueHasMutated();
            });

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
                    var obs=approvedOrganizations;
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

                    console.log("select job catagories: ", jobCatagories() );

                    ko.bindingHandlers.selectize.utils.setOptions(api,jobCatagories);
                    ko.bindingHandlers.selectize.utils.watchForNewOptions(api,jobCatagories);

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

                    ko.bindingHandlers.selectize.utils.setOptions(api,tags);
                    ko.bindingHandlers.selectize.utils.watchForNewOptions(api,tags);

                    if( self.profile != null && self.profile.tag_keys() != null)
                        ko.bindingHandlers.selectize.utils.setItems(api,self.profile.tag_keys);
                },
                onObsUpdate: onObsUpdate
            };
            self.saveProfile= async function(){
                var data ;
                var reloadedProfile;

                self.server.sendRecaptcha("save_profile");
                console.log("create Profile: ",profileObs());


                try{

                    data = ko.mapping.toJS(profileObs());

                    if( profileObs().missionary_profile_key() == null){
                        reloadedProfile =  await self.da.createProfile(data);
                        dataLayer.push({event:'profile','profile-action':"saved-new",user_id: self.userId});
                    }else{
                        reloadedProfile =  await self.da.updateProfile(profileObs().missionary_profile_key(),data);
                        dataLayer.push({event:'profile','profile-action':"saved-existing",user_id: self.userId});
                    }

                    ko.mapping.fromJS(reloadedProfile,null,profileObs);
                    self.navigateFn("profile-saved")();
                    window.localStorage.removeItem("savedProfile");
                }catch(error){
                    console.error("failed to create or update profile. "+error.message,error);
                    if(error.status === 401){
                        alertify.error("Session expired, could not save your profile. Please log-in again.");
                    }else
                        alertify.error("Failed to save profile");
                }

            };
        },
        template: require('./'+NAME+'.html'),
    });
}
function onObsUpdate(api, value){
    //console.log("new value set on observable: ",value());
    api.clear(true);
    ko.bindingHandlers.selectize.utils.setItems(api,value);
}