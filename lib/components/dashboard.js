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
            const USDollar = new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD',
            });
    

            console.log("user profile: ",userProfile);
            self.storage = appState.storage;
            self.stats = ko.observable();
            self.donations = ko.observableArray();
            self.managedProfiles = ko.observableArray();
            self.activeProfile = ko.observable();
            self.org = ko.observable();
            self.editOrgMode = ko.observable(false);
            self.orgUpdates = ko.observable();
            self.npUpdates = ko.observable();
            self.canEdit = ko.observable(false);
            self.singleProfile = ko.observable(userProfile != null);

            self.permissionForm = ko.observable({
                userKey: ko.observable(),
                orgKey: ko.observable(),
                readOnly: ko.observable(false),
            });

            if(userProfile != null){
                utils.pageStats(server,userProfile.missionary_profile_key()).then(self.stats);

            }
            //da.getWorkerTransactions(userProfile.user_key()).then(data =>{
            da.getWorkerTransactions().then(data =>{
                //console.log("worker tx: ",data);
                self.donations(data);
                self.sortDir("asc");
                data.forEach(d => d.details=ko.observable()); //spot to hang more data later
            });

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
                    profileInfo.forEach(pi =>{

                        pi.pageStats = ko.observable();
                        utils.pageStats(server,pi.missionary_profile_key).then(pi.pageStats);
                    })
                    self.managedProfiles(profileInfo);
                })
            }


            self.deleteProfile=async function(profile){
                if(profile.ro === true){
                    await server.authPostJson("/api/deleteProfile",{
                        missionary_profile_key: profile.missionary_profile_key,
                        unlinkOnly: true,
                    });
                    self.updateProfileList();
                }else{
                    alertify.confirm("Are you sure you want to delete "+profile.missionary_name+"? This cannot be undone.",
                        async ()=>{
                            console.log("deleting profile ",profile);
                            await server.authPostJson("/api/deleteProfile",{
                                missionary_profile_key: profile.missionary_profile_key,
                                unlinkOnly: false,
                            });
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

                //console.log("permission and org: ",permissions,org);
                self.canEdit(permissions.read_only === false)

                self.org(org);

                jQuery("#landing_page_button").remove();

                //force user to set require fields first
                if( ! org.slug || ! org.contact_email  || ! org.description)
                    self.editOrg();
            }
            self.editOrg = function(){
                const org = self.org();
                
                if(org==null) return;

                self.orgUpdates(ko.mapping.fromJS( {
                    description: org.description,
                    logo_url: org.logo_url,
                    contact_email: org.contact_email,
                    slug: org.slug,
                }));
                self.npUpdates(ko.mapping.fromJS( {
                    donation_settings: org.donation_settings,
                }));


                self.editOrgMode(true);
            }
            self.saveOrg = async function(){

                try{
                    await da.updateOrganization(self.org().organization_key,
                                            ko.mapping.toJS(self.orgUpdates()));
                    await da.updateNonProfit(self.org().non_profit_key,
                                            ko.mapping.toJS(self.npUpdates()));
                }catch(error){
                    console.error("error updating managing org info: ",error);
                    if(error.status === 409){ //duplicate key error
                        alertify.error("Oh no, it seems that slug is taken already! Please choose another one");
                    }else
                        alertify.error("Oh no, an error has occurred! Please try back later, or let us know what happened.");
                    return;
                }

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

                alertify.prompt("Invite Profile Owner",
                    "Please enter this workers email address:",
                    "",
                    async function(e,ownerEmail){
                        console.log("resending notice to "+ownerEmail);
                        try{
                            const response = await server.authPostJson("/api/inviteProfileOwner",{
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
            //self.checkForInvites = async function(){
            //    const response = await da.getProfileInvitations();
            //    if(response != null){
            //        console.log("found invites: ",response);
            //        await server.authPostJson("/api/claimProfile");
            //    }else //no invites found
            //        console.log("no invitations found");

            //}
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
            self.donationRowClick = async function(data){
                jQuery("#details_"+data.possible_transaction_key).collapse('toggle');
                if(data.details() == null){
                    const info = await server.authPostJson("/api/txDetails",
                                        {possible_transaction_key:data.possible_transaction_key});
                    if(info.name && info.email)
                        data.details(info);
                }
            }
            self.paymentStatus = function(data){
                let result = {};
                if(data.on_site){
                    result = {
                        rtext: data.paid ? 'Transfer Complete' : 'Pending',
                        rclass: data.paid ? 'text-success' : 'text-ergatas-warning',
                    }
                }else{
                    result = {
                        rtext: data.confirmed ? 'Confirmed by Donor' : 'Not Confirmed',
                        rclass: data.confirmed ? 'text-success' : 'text-ergatas-warning',
                    }
                }
                return result;
            }
            self.formatDate = function(dateStr){
                return (new Date(dateStr)).toDateString();
            }
            self.formatMoney = function(amount){
               return USDollar.format(amount);
            }

            self.sortDir = ko.observable("desc");
            self.sortField = ko.observable('created_on');
            self.sortBy = ko.computed(() =>{
                const direction = self.sortDir() === "desc" ? 1 : -1;
                const field = self.sortField();
                //console.log("sorting ",field,direction);

                self.donations(self.donations.peek().sort((a,b)=>{
                    if(a[field] < b[field]) return -1 * direction;
                    if(a[field] > b[field]) return 1 * direction;
                    return 0;
                }));
            });

            loadManagingOrg();




        },
       template: require(`./${name}.html`),
    });
}
 
