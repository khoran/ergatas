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
            this.appState = params.appState;
            this.rwPermission = ko.observable();
            this.isNonProfit = ko.observable();
            this.isAuthorized = ko.observable();

            this.formSubmitted=ko.observable(false);
            this.loginFirst=ko.observable(user==null);
            this.error=ko.observable(false);
            this.churchName=ko.observable();
            this.churchWebsite=ko.observable();
            this.selectedOrgKey = ko.observable();
            this.finalOrgName = ko.observable("this organization");
            this.adminName = ko.observable();

            ko.computed( async function(){
                console.log("orgName ",self.isNonProfit(),self.selectedOrgKey(),self.churchName());
                if(self.isNonProfit() === "true" && self.selectedOrgKey()){
                    //get org info
                    const org = await self.appState.approvedOrgList.findItem(
                        (o)=>o.organization_key === self.selectedOrgKey());

                    console.log("found org: ",org);

                    if(org)
                        self.finalOrgName(org.display_name);

                }else if(self.isNonProfit() === "false" 
                        && self.churchName() != null 
                        && self.churchName() !== '')
                    self.finalOrgName(self.churchName());
            });

            this.submit=async function(){
                console.log("submitting form",this.selectedOrgKey(), this.churchName(), this.churchWebsite());
                console.log("user: ",user);


                //if non-sending org, create entry now
                if(this.isNonProfit() === "false"){
                    try{
                        const org =await this.appState.da.createOrganization({
                            non_profit_key: 0, //indicates no non-profit
                            name:this.churchName(),
                            website:this.churchWebsite(),
                            is_sending_org: false,
                        });
                        console.log("new church org: ",org);
                        this.selectedOrgKey(org.organization_key);
                    }catch(error){
                        console.error("failed to create non-sending org",error);
                        if(error.status && error.status === 409){
                            alertify.error("Hmm, it seems like an organization by that name already exists!");
                        }else{
                            this.error(true);
                            this.formSubmitted(true);
                        }
                        return;
                    }
                }

                this.appState.server.authPostJson("/api/claimOrg",{
                    user_key: user.user_key(),
                    organization_key: this.selectedOrgKey(),
                    church_name: this.churchName(),
                    church_website: this.churchWebsite(),
                    read_only: this.rwPermission(),
                    adminName: this.adminName(),
                }).always((result) =>{
                    console.log("result: ",result);
                    this.formSubmitted(true);
                    if(result.status != null && result.status != 200)
                        this.error(true);
                });
            }
        },
       template: require(`./${name}.html`),
    });
}
 