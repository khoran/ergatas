/**
 * INPUT
 * ------
 *      - appState
 *      - user: logged in user
 *      - userProfile: users profile, or null
 */

import * as utils from '../client/client-utils';
import {searchParamsFromJson,ensureFields} from '../shared/shared-utils';



export function register(){
   const name="dashboard";
   ko.components.register(name, {
       viewModel: function(params) {
            var self=this;
            console.log("start of "+name);

            ensureFields(params,["appState","user","userProfile"]);

            const userProfile = ko.unwrap(params.userProfile);
            const appState = params.appState
            const server = appState.server;
            const da = appState.da;
            

            self.appState = appState;
            self.server = server;
            self.da = da;
            self.storage = appState.storage;
            self.user = params.user;
            self.dashboardPage = ko.observable("dashboard-home"); // default page

    

            console.log("user profile: ",userProfile);
            self.storage = appState.storage;
            self.stats = ko.observable();
            self.singleProfile = ko.observable(userProfile != null);

            if(userProfile != null){
                utils.pageStats(server,userProfile.missionary_profile_key()).then(self.stats);

            }

            


            // Donation list moved into donation-list component (it will fetch its own transactions)

            //just for testing
//            server.authPostJson("/api/newProfile",{
//                first_name: "test",
//                last_name: "6",
//                missionary_profile_key: 777,
//            }).then(result => console.log("new profile result: ",result));
//
            // Managed profiles UI and logic moved to `lib/components/managed-profiles-list.js`
            // The managed-profiles-list component is used in the template (`dashboard.html`).

            // loadManagingOrg moved to manage-org module
            // editOrg/saveOrg live in manage-org module; dashboard no longer exposes wrappers
            
            // resendInvite behaviour moved into managed-profiles-list component
            //self.checkForInvites = async function(){
            //    const response = await da.getProfileInvitations();
            //    if(response != null){
            //        console.log("found invites: ",response);
            //        await server.authPostJson("/api/claimProfile");
            //    }else //no invites found
            //        console.log("no invitations found");

            //}
            // stateText / borderClass moved into managed-profiles-list component for UI rendering
            // donationRowClick moved to donation-list
            // paymentStatus, formatDate, formatMoney moved to donation-list







        },
       template: require(`./${name}.html`),
    });
}
 
