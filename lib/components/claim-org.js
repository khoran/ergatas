/**
 * INPUT
 * ------
 *      - appState
 *      - user: logged in user info
 */

import * as utils from '../client/client-utils';
import {ensureFields} from '../shared/shared-utils';
import alertify from "alertifyjs";



export function register(){
   const name="claim-org";
   ko.components.register(name, {
       viewModel: function(params) {
            var self=this;
            console.log("start of "+name);

            ensureFields(params["appState","da"]);

            const user= params.user();

            if(user == null){
                console.error("user not logged in");
                // redirect to login?
                return;
            }

            this.appState = params.appState;
            this.selectedOrgKey = ko.observable();
            this.orgType = ko.observable();

            this.churchName=ko.observable();
            this.churchWebsite=ko.observable();

            this.submit=async function(){
                console.log("submitting form",this.orgType(),this.selectedOrgKey(), this.churchName(), this.churchWebsite());
                console.log("user: ",user);

                this.appState.server.authPostJson("/api/claimOrg",{
                    user_key: user.user_key(),
                    orgType:this.orgType(),
                    organization_key: this.selectedOrgKey(),
                    church_name: this.churchName(),
                    church_website: this.churchWebsite(),
                }).always(() => this.appState.router.navigateTo('dashboard') );

            }






        },
       template: require(`./${name}.html`),
    });
}
 