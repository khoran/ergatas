/**
 * INPUT
 * ------
 *      - appState
 *      - user: logged in user
 *      - userProfile: users profile, or null
 */

import * as utils from '../client/client-utils';
import {ensureFields,getProfilesForFilter} from '../shared/shared-utils';



export function register(){
   const name="dashboard";
   ko.components.register(name, {
      viewModel: function(params) {
            var self=this;
            console.log("start of "+name);

            ensureFields(params,["appState","user","userProfile","navigateFn"]);

            const userProfile = ko.unwrap(params.userProfile);
            const appState = params.appState
            const server = appState.server;
            const da = appState.da;
            

            self.appState = appState;
            self.server = server;
            self.da = da;
            self.storage = appState.storage;
            self.user = params.user;
            self.dashboardPage = ko.observable("dashboard-home").extend({ rateLimit: 500 });; // default page

            // Read template name from URL if present: support paths like /dashboard/<template>
            function getTemplateFromURL(){
                try{
                    const path = window.location.pathname || '';
                    const parts = path.split('/').filter(p=>p.length>0);
                    const idx = parts.indexOf('dashboard');
                    if(idx >= 0 && parts.length > idx+1){
                        return parts[idx+1];
                    }
                }catch(e){
                    console.warn('getTemplateFromURL error',e);
                }
                return null;
            }




            // Initialize from URL if a template segment is present
            const urlTemplate = getTemplateFromURL();
            if(urlTemplate){
                self.dashboardPage(urlTemplate);
            }


            // When the dashboard page changes, use the provided navigateFn to update the path.
            // params.navigateFn is expected to be a function that returns a navigation function.
            self.dashboardPage.subscribe(function(newTemplate){
                if(!newTemplate) return;
                const targetPath = 'dashboard/' + newTemplate;
                params.navigateFn(targetPath)();
            });

            console.log("user profile: ",userProfile);
            self.storage = appState.storage;
            self.stats = ko.observable();
            self.singleProfile = ko.observable(userProfile != null);

            if(userProfile != null){
                utils.pageStats(server,userProfile.missionary_profile_key()).then(self.stats);

            }
            self.updateDonors = async function(){
                await server.authPostJson("/api/updateDonors");
            }
            
            //var permissions = await da.getUserProfilePermissions(self.user().user_key());
            //var org = await da.getOrganization(permissions.organization_key);


        },
       template: require(`./${name}.html`),
    });
}
 
