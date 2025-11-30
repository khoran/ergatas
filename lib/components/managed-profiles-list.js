import * as utils from '../client/client-utils';
import alertify from 'alertifyjs';
import {ensureFields} from '../shared/shared-utils';

export function register(){
    const name = 'managed-profiles-list';
    ko.components.register(name,{
        viewModel: function(params){
            const self = this;
            const PAGE_SIZE = 12;
            ensureFields(params, ['appState']);
            self.appState = params.appState;
            self.server = self.appState && self.appState.server;
            self.da = self.appState && self.appState.da;
            self.storage = self.appState && self.appState.storage;

            self.managedProfiles = ko.observableArray();
            self.loading = ko.observable(false);

            // paging
            self.pageSize = PAGE_SIZE;
            self.currentPage = ko.observable(1);
            self.totalPages = ko.computed(() => Math.ceil(self.managedProfiles().length / PAGE_SIZE));
            self.visibleProfiles = ko.computed(() => {
                const start = (self.currentPage() - 1) * PAGE_SIZE;
                return self.managedProfiles().slice(start, start + PAGE_SIZE);
            });

            self.updateProfileList = function(){
                console.log("updateProfileList");
                self.loading(true);
                self.server.authPostJson("/api/getManagedProfiles").then( profileInfo =>{
                    console.log("managed profiles: ",profileInfo);
                    profileInfo.forEach(pi =>{
                        pi.pageStats = ko.observable();
                        utils.pageStats(self.server,pi.missionary_profile_key).then(pi.pageStats);
                    })
                    self.managedProfiles(profileInfo);
                    self.currentPage(1);
                    self.loading(false);
                }).catch(error => {
                    console.error("failed to load managed profiles", error);
                    self.loading(false);
                });
            }

            self.deleteProfile = async function(profile){
                if(profile.ro === true){
                    await self.server.authPostJson("/api/deleteProfile",{
                        missionary_profile_key: profile.missionary_profile_key,
                        unlinkOnly: true,
                    });
                    self.updateProfileList();
                }else{
                    alertify.confirm("Are you sure you want to delete "+profile.missionary_name+"? This cannot be undone.",
                        async ()=>{
                            console.log("deleting profile ",profile);
                            await self.server.authPostJson("/api/deleteProfile",{
                                missionary_profile_key: profile.missionary_profile_key,
                                unlinkOnly: false,
                            });
                            self.updateProfileList();
                        });
                }
            }

            self.resendInvite = async function(profile){
                console.log("resend invite: ",profile);

                alertify.prompt("Invite Profile Owner",
                    "Please enter this workers email address:",
                    "",
                    async function(e,ownerEmail){
                        console.log("resending notice to "+ownerEmail);
                        try{
                            const response = await self.server.authPostJson("/api/inviteProfileOwner",{
                                ownerName: profile.missionary_name,
                                ownerEmail: ownerEmail,
                                missionary_profile_key:profile.missionary_profile_key,
                            });
                            if(response && response.existingProfile === true){
                                alertify.error("The user with email "+ownerEmail+" already has "+
                                " an Ergatas profile. Please coordinate with them to decide which profile to keep.");
                            }
                            else if(response && response.autoAssigned === true){
                                alertify.success("Permission granted!");
                            }else{
                                alertify.success("Invitation sent!");
                            }
                        }catch(error){
                            alertify.error("Oops, we couldn't send the invite for some reason.");
                            console.error("failed to send invite for profile "+profile.missionary_profile_key,error);
                        }
                    },()=>{});


            }

            self.stateText= function(state,published){
                if(state === "warning1" || state === "warning2")
                    return "Expiring Soon";
                if(state === "disabled")
                    return "Expired. Update profile to re-enable";
                if(state === "blocked")
                    return "Disabled, contact support";

                if( ! published)
                    return "Not Published";

                return "";
            }
            self.borderClass = function(profile){
                if(profile.state ==="blocked")
                    return "border-danger";
                if( ! profile.published)
                    return "";
                if(profile.state ==="current")
                    return "border-success";
                if(profile.state === "warning1" || profile.state==="warning2")
                    return "border-warning";
                if(profile.state === "disabled")
                    return "border-danger";

                return "";
            }

            // initialize
            self.updateProfileList();
        },
        template: require('./managed-profiles-list.html')
    });
}
