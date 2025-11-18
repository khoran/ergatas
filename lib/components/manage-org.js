import {searchParamsFromJson,ensureFields} from '../shared/shared-utils';

// manage-org component - extracted from dashboard.html
export function register(){
    const name = "manage-org";
    ko.components.register(name, {
        viewModel: function(params){
                var self=this;
                console.log("start of "+name);
                ensureFields(params,["appState","user"]);

                const da = params.appState.da;
                const server = params.appState.server;

                self.user = params.user;
                self.appState = params.appState;
                self.storage = params.appState.storage;
                self.org = ko.observable();
                self.canEdit = ko.observable(false);
                self.orgUpdates = ko.observable();
                self.npUpdates = ko.observable();
                self.editOrgMode = ko.observable(false);

                self.editOrg = function(){

                    var org = self.org();
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

                async function loadManagingOrg(){
                    console.log("loading managing org");


                    // permissions for self user
                    var permissions = await da.getUserProfilePermissions(self.user().user_key());
                    self.canEdit(permissions && permissions.read_only === false);

                    var org = await da.getOrganization(permissions.organization_key);
                    console.log("loaded managing org: ",org);

                    self.org(org);

                    // force user to set required fields first
                    if(!org.slug || !org.contact_email || !org.description)
                        editOrg();
                }
                loadManagingOrg();



        },
        template: require(`./${name}.html`),
    });
}

