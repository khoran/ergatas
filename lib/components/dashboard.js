/**
 * INPUT
 * ------
 *      - appState
 *      - user: logged in user
 *      - userProfile: users profile, or null
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

            ensureFields(params,["appState","user","userProfile"]);

            const appState = params.appState
            const server = appState.server;
            const da = appState.da;
            const getUser = params.user;
            const userProfile = ko.unwrap(params.userProfile);
            

            console.log("user profile: ",userProfile);
            self.storage = appState.storage;
            self.stats = ko.observable();
            self.donations = ko.observableArray();
            self.managedProfiles = ko.observableArray();
            self.activeProfile = ko.observable();
            self.org = ko.observable();
            self.editOrgMode = ko.observable(false);
            self.orgUpdates = ko.observable();

            if(userProfile != null){
                utils.pageStats(server,userProfile.missionary_profile_key()).then(self.stats);

                da.getWorkerTransactions(userProfile.user_key()).then(data =>{
                    console.log("worker tx: ",data);
                    self.donations(data);
                });
            }

            //just for testing
//            server.authPostJson("/api/newProfile",{
//                first_name: "test",
//                last_name: "6",
//                missionary_profile_key: 777,
//            }).then(result => console.log("new profile result: ",result));
//
            self.updateProfileList=function(){
                //create/update permission cache on server for editing profiles
                server.authPostJson("/api/getManagedProfiles").then( profileInfo=>{
                    console.log("managed profiles: ",profileInfo);
                    self.managedProfiles(profileInfo);
                })
            }


            self.deleteProfile=async function(profile){
                alertify.confirm("Are you sure you want to delete "+profile.missionary_name+"?",
                    async ()=>{
                        console.log("deleting profile ",profile);
                        await da.deleteProfile(profile.missionary_profile_key);
                        self.updateProfileList();
                    });
            }

            self.updateProfileList();

            async function loadManagingOrg(){


                //managing organization
                var permissions = await da.getUserProfilePermissions(getUser().user_key())
                if( permissions == null) return;

                var org = await da.getOrganization(permissions.organization_key);
                if(org == null) return;

                self.org(org);
            }
            self.editOrg = async function(){
                const org = self.org();
                
                if(org==null) return;

                self.orgUpdates(ko.mapping.fromJS( {
                    description: org.description,
                    logo_url: org.logo_url,
                    contact_email: org.contact_email,
                    slug: org.slug,
                }));

                self.editOrgMode(true);
            }
            self.saveOrg = async function(){

                await da.updateOrganization(self.org().organization_key,
                //await da.updateOrganization(625,
                                            ko.mapping.toJS(self.orgUpdates()));

                var org = await da.getOrganization(self.org().organization_key);
                self.org(org);
                self.editOrgMode(false);
            }

            loadManagingOrg();



        },
       template: require(`./${name}.html`),
    });
}
 