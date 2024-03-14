/**
 * INPUT
 * ------
 *      - appState
 *      - user: logged in user
 *      - userProfile: users profile, or null
 *      - editProfile: function to switch to selected profile form
 */

import * as utils from '../client/client-utils';
import {searchParamsFromJson,ensureFields} from '../shared/shared-utils';
import alertify from "alertifyjs";



export function register(){
   const name="dashboard";
   ko.components.register(name, {
       viewModel: function(params) {
            var self=this;
            console.log("start of "+name);

            ensureFields(params,["appState","user","userProfile","editProfile"]);

            const appState = params.appState
            const server = appState.server;
            const da = appState.da;
            const user = params.user;
            const userProfile = params.userProfile;
            const editProfile = params.editProfile;
            

            console.log("user profile: ",userProfile());
            console.log("user: ",user);
            self.stats = ko.observable();
            self.donations = ko.observableArray();
            self.managedProfiles = ko.observableArray();
            self.activeProfile = ko.observable();

            if(userProfile != null){
                utils.pageStats(server,userProfile().missionary_profile_key()).then(self.stats);

                da.getWorkerTransactions(userProfile().user_key()).then(data =>{
                    console.log("worker tx: ",data);
                    self.donations(data);
                });
            }

            //create/update permission cache on server for editing profiles
            server.authPostJson("/api/updatePermissions");

            da.getUserProfilePermissions(user().user_key()).then(async (data) => {

                console.log("permission on orgs: ",data);
                data.forEach(async org_perm =>{
                    const org = await da.getOrganization(org_perm.organization_key);
                    
                    if(org.search_filter == null || Object.keys(org.search_filter).length === 0 ){
                        //default to any profile set to that org
                        org.search_filter = {organization_keys:[org_perm.organization_key]};
                    }

                    console.log("org search filter: ",org.search_filter);


                    const params = searchParamsFromJson(org.search_filter);
                    const searchResults = await da.primarySearch(params,1,"rank,desc")
                    console.log("search filter results: ",searchResults);

                    self.managedProfiles(searchResults.first_page);

                })



            });

            this.editProfile= async function(profile){
                console.log("editing profile",profile);
                const p2 = await da.getProfileByKey(profile.missionary_profile_key);
                //self.activeProfile(ko.mapping.fromJS({

                editProfile(ko.mapping.fromJS({
                    missionary_profile_key: p2.missionary_profile_key,
                    user_key: p2.user_key,
                    data: p2.data,
                }));
            }





        },
       template: require(`./${name}.html`),
    });
}
 