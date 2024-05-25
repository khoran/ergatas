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
            self.canEdit = ko.observable(false);

            self.permissionForm = ko.observable({
                userKey: ko.observable(),
                orgKey: ko.observable(),
                readOnly: ko.observable(false),
            });

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
                if(profile.read_only){
                    //TODO just remove them from filter

                }else{
                    alertify.confirm("Are you sure you want to delete "+profile.missionary_name+"?",
                        async ()=>{
                            console.log("deleting profile ",profile);
                            await da.deleteProfile(profile.missionary_profile_key);
                            self.updateProfileList();
                        });
                }
            }

            self.updateProfileList();

            async function loadManagingOrg(){


                //managing organization
                var permissions = await da.getUserProfilePermissions(getUser().user_key())
                if( permissions == null) return;

                var org = await da.getOrganization(permissions.organization_key);
                if(org == null) return;

                console.log("permission and org: ",permissions,org);
                self.canEdit(permissions.read_only === false)

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

                await server.postJson("/api/refreshSlugCache");
                var org = await da.getOrganization(self.org().organization_key);
                self.org(org);
                self.editOrgMode(false);
            }
            self.addUserOrg = async function(){
                const fields = self.permissionForm();
                console.log("adding user_profile_permission ",fields.userKey(),fields.orgKey(),fields.readOnly());
                try{
                    await server.authPostJson("/api/grantUserOrgPerm",{
                        user_key: fields.userKey(),
                        organization_key: fields.orgKey(),
                        read_only: fields.readOnly(),
                    });
                    fields.userKey(null);
                    fields.orgKey(null);
                    fields.readOnly(false);
                }catch(error){
                    console.error("failed to set user permission: ", error && error.responseJSON);
                    alertify.error("failed to set user permission: "+ 
                        error && error.responseJSON && error.responseJSON.message);
                }

            }
            self.resendInvite = async function(profile){
                console.log("resend invite: ",profile);

                alertify.prompt("Resend Owner Notice",
                    "Please enter this workers email address:",
                    "",
                    async function(e,ownerEmail){
                        console.log("resending notice to "+ownerEmail);
                        await server.authPostJson("/api/inviteProfileOwner",{
                            ownerName: profile.missionary_name,
                            ownerEmail: ownerEmail,
                            missionary_profile_key:profile.missionary_profile_key,
                        })
                    },()=>{});


            }
            self.checkForInvites = async function(){
                try{
                    const response = await da.getProfileInvitations();
                    console.log("found invites: ",response);
                    await server.authPostJson("/api/claimProfile");
                }catch(error){
                    //no invites found
                    console.log("no invitations found");
                }

            }

            loadManagingOrg();

            self.checkForInvites();



        },
       template: require(`./${name}.html`),
    });
}
 