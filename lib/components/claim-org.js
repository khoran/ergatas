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
            this.rwPermission = ko.observable();
            this.isNonProfit = ko.observable();
            this.isAuthorized = ko.observable();

            this.formSubmitted=ko.observable(false);
            this.error=ko.observable(false);
            this.churchName=ko.observable();
            this.churchWebsite=ko.observable();
            this.selectedOrgKey = ko.observable();

            this.submit=async function(){
                console.log("submitting form",this.selectedOrgKey(), this.churchName(), this.churchWebsite());
                console.log("user: ",user);


                //if non-sending org, create entry now
                if(this.isNonProfit() === "false"){
                    const org =await this.appState.da.createOrganization({
                        non_profit_key: 0, //indicates no non-profit
                        name:this.churchName(),
                        website:this.churchWebsite(),
                        is_sending_org: false,
                    });
                    this.selectedOrgKey(org.organization_key);
                }

                this.appState.server.authPostJson("/api/claimOrg",{
                    user_key: user.user_key(),
                    organization_key: this.selectedOrgKey(),
                    church_name: this.churchName(),
                    church_website: this.churchWebsite(),
                    read_only: this.rwPermission(),
                }).always((result) =>{
                    console.log("result: ",result);
                    this.formSubmitted(true);
                    if(result.status != 200)
                        this.error(true);
                });
            }






        },
       template: require(`./${name}.html`),
    });
}
 