import {allCountries} from '../shared/shared-utils';

/**
 * INPUT
 *   - da: data-access object
 *   - server: server object
 *   - storage: CloudStorage object
 *   - user_key: user_key for currently logged in user
 *   - external_user_id: id for user in auth system
 *   - navigateFn: function that returns a function that changes pages
 *   - adminMode: if true, enable admin only fields
 */


export function register(){
   const NAME="org-application";

   const stateList = require("../data/states.json");
   const countryDataPromise = allCountries();
   const availableCountries = [
       "USA", "CAN", "AUS","GBR",
   ];


   ko.components.register(NAME, {
       viewModel: function(params) {
            var self=this;
            console.log("params: ",params);
            const da=params.da;
            const server = params.server;
            const storage = params.storage;

            self.orgLogoUrl = (x) => storage.orgLogoUrl(x);
            self.navigateFn = params.navigateFn;
            self.orgApplicationStatus= ko.observable("");
            self.organizationApplication = ko.observable();
            self.stateList = ko.observableArray(stateList);
            self.stateFilter = ko.observable();
            self.manualMode = ko.observable(params.adminMode);
            self.countryCodes = ko.observableArray();

            countryDataPromise.then(countryData => 
                self.countryCodes(countryData.filter(x => availableCountries.includes(x.alpha3Code))));

            dataLayer.push({event:'user','user-action':"org-application-started",user_id: params.external_user_id()});

            initOrgApp(da,self.organizationApplication);

            ko.computed(()=>{
                const application = self.organizationApplication();
                if( application == null || application.country_code == null )
                    return;
                const selectedCountry = application.country_code();

                //self.manualMode(availableCountries.includes(selectedCountry));
                self.manualMode(selectedCountry !== "USA");


            });
            
            self.submitOrgApplication= async function(){
                const user_key = params.user_key();
                const external_user_id= params.external_user_id();
                console.log("submitting org app",self.organizationApplication());
                const country_org_id = self.organizationApplication().country_org_id();
                try{
                    //check to see if org exists and is denied, and inform user
                    var status = await da.unapprovedOrganizationStatus(country_org_id);
                    if(status != null && status.length > 0){
                        if(status[0].status === "denied"){
                            self.orgApplicationStatus("denied");
                            dataLayer.push({event:'user','user-action':"org-application-org-selected",status:"denied",user_id: external_user_id});
                            return;
                        }
                        if(status[0].status === "pending"){
                            await da.insertOrganizationListener(status[0].organization_key,user_key);
                            dataLayer.push({event:'user','user-action':"org-application-org-selected",status:"pending",user_id: external_user_id});
                            self.orgApplicationStatus("pending");
                            return;
                        }
                    }
                    //else, if no status, then org does not yet exist
                    var newOrg = await da.createNonProfitOrganization(
                        ko.mapping.toJS(self.organizationApplication()));
                    console.log("new org: ",newOrg);
                    dataLayer.push({event:'user','user-action':"org-application-org-selected",status:"new-application",user_id: external_user_id});
                    await da.insertOrganizationListener(newOrg.organization_key,user_key);
                    await server.postJson("/api/orgAppNotify",{
                        organization_key:newOrg.organization_key,
                        user_key: user_key,
                        external_user_id:external_user_id});
                    self.orgApplicationStatus("submitted");
                }catch(error){
                    if(error.status===409)
                        self.orgApplicationStatus("available");
                    else{
                        self.orgApplicationStatus("failed");
                        console.error("Error while submitting organization application: "+error.message,error);
                    }

                }
            };
            self.nonProfitSelectizeOptions = {
                create:false,
                valueField: "ein",
                labelField:"name",
                searchField:["name","displayEIN"],
                onInitialize: function(){
                    var api = this;
                    self.stateFilter.subscribe(function(newValue){
                        console.log("state filter changed ",newValue);
                        api.clearOptions();
                    });

                },
                load: function(query,callback){
                    //console.log("loading options for query "+query);
                    server.postJson("/api/nonProfits",{
                            query:query,
                            state: self.stateFilter(),
                        }).
                        then(function(results){
                            //console.log("results: ",results);
                            callback(results.organizations);
                        }).fail(function(error){
                            console.warn("query failed: "+error.message,error);
                        })
                },
                render: {
                    option: function(data,escape){
                            return "<div>"+data.name+
                                    "</br><span style='font-size:0.7em;'> "+
                                        ( data.displayEIN || data.ein )+", "+data.city+", "+data.state+"</span></div>";
                    },
                },
                onItemAdd: function(value){
                    var data,orgApp;
                    data = this.options[value];
                    orgApp = self.organizationApplication();
                    console.log("onItemAdd: ",data,value);
                    if(data != null && orgApp != null ){
                        dataLayer.push({event:'user','user-action':"org-application-org-selected",user_id: params.external_user_id()});

                        orgApp.name( data.name);
                        orgApp.country_org_id(data.ein);
                        orgApp.city(data.city);
                        orgApp.state(data.state);
                    }
                },
                onDelete: async function(value){
                    console.log("removing item ",value);
                    console.log("orgApp: ",self.organizationApplication());
                    try{
                        await initOrgApp(da,self.organizationApplication,self.organizationApplication().is_shell);
                    }catch(error){
                        console.warn("failed to init org application: ",error);
                    }
                }


            };
            self.browseForLogo = async function(org){
                storage.browseForLogo(org);
            }
        },
        template: require('./'+NAME+'.html'),
    });
}
function initOrgApp(da, obs,is_shell){
    da.newOrganization().
        then((newOrg) => {
            newOrg.is_shell = !! is_shell;
            newOrg.country_code="USA";
            obs(ko.mapping.fromJS(newOrg));
            console.log("org app: ",obs());
            obs().name.extend({rateLimit:300,method: "notifyWhenChangesStop"});
        });


};
