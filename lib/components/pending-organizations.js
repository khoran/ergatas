/**
 * INPUT
 * ------
 *      - server: server api object
 *      - da: data access object  
 *      - orgLogoUrl: function mapping partial url to full url
 */

async function loadPendingOrgs(pendingOrganizations,da){
    console.log("getting orgs for approval");
    try{
        pendingOrganizations(await da.organizationsNeedingReview());
    }catch(error){
        console.error("failed to get list of orgs needing review. "+error.message,error);
        alertify.error("Failed to get organization list");
        pendingOrganizations.removeAll();
    }
}
export function register(){
   const name="pending-organizations";
   ko.components.register(name, {
       viewModel: function(params) {
            var self=this;
            self.orgLogoUrl = params.orgLogoUrl;

            self.pendingOrganizations = ko.observableArray();
            setTimeout(function(){
                loadPendingOrgs(self.pendingOrganizations,params.da);
            },1000)// try to wait till auth finishes

            self.setOrgStatus=async function(organization_key,status,message){
                try{
                    await params.da.setOrganizationApprovalStatus(organization_key,status);
                    await params.server.authPostJson("/api/notifyOrgUpdate",{organization_key:organization_key,message:message});

                    loadPendingOrgs(self.pendingOrganizations,params.da);
                }catch(error){
                    console.error("failed to set approval state for org "+organization_key+". "+error.message,error);
                    alertify.error("Failed to set approval state");
                }
            };

/* not needed right now
            self.sendMessage= async function(message){
                console.log("sending message to "+external_user_id)
                await self.server.postJson("/api/contact/setup",{
                        fromEmail: "information@ergatas.org",
                        name: "Ergatas",
                        message: message,
                        profileUserId: external_user_id,
                    });
            }
            self.deleteApplication= function(organization_key){
            }
            */

        },
       template: require(`./${name}.html`),
    });
}
 