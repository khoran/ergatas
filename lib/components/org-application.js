
/**
 * INPUT
 *   - da: data-access object
 *   - server: server object
 *   - user_key: user_key for currently logged in user
 *   - orgLogoUrl: function to take logo_url and return a full URL
 *   - navigateFn: function that returns a function that changes pages
 *   - toRelativeUrl: function to remove domain base from URL
 */


export function register(){
   const NAME="org-application";

   const stateList = require("../data/states.json");


   ko.components.register(NAME, {
       viewModel: function(params) {
            var self=this;
            console.log("params: ",params);
            const da=params.da;
            const server = params.server;
            const user_key = ko.unwrap(params.user_key);
            const toRelativeUrl = params.toRelativeUrl;

            self.orgLogoUrl = params.orgLogoUrl;
            self.navigateFn = params.navigateFn;
            self.orgApplicationStatus= ko.observable("");
            self.organizationApplication = ko.observable();
            self.stateList = ko.observableArray(stateList);
            self.stateFilter = ko.observable();


            da.newOrganization().
                then((newOrg) => {
                    self.organizationApplication(ko.mapping.fromJS(newOrg));
                    console.log("org app: ",self.organizationApplication());
                    self.organizationApplication().
                        name.extend({rateLimit:300,method: "notifyWhenChangesStop"});
                });


            self.submitOrgApplication= async function(){
                console.log("submitting org app",self.organizationApplication());
                const country_org_id = self.organizationApplication().country_org_id();
                try{
                    //check to see if org exists and is denied, and inform user
                    var status = await da.unapprovedOrganizationStatus(country_org_id);
                    if(status != null && status.length > 0){
                        if(status[0].status === "denied"){
                            self.orgApplicationStatus("denied");
                            return;
                        }
                        if(status[0].status === "pending"){
                            await da.insertOrganizationListener(status[0].organization_key,user_key);
                            self.orgApplicationStatus("pending");
                            return;
                        }
                    }
                    //else, if no status, then org does not yet exist
                    var newOrg = await da.createOrganization(
                        ko.mapping.toJS(self.organizationApplication()));
                    console.log("new org: ",newOrg);
                    await da.insertOrganizationListener(newOrg.organization_key,user_key);
                    await server.postJson("/api/orgAppNotify",{
                        organization_key:newOrg.organization_key,
                        user_key: user_key});
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
                searchField:"name",
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
                                        data.city+", "+data.state+"</span></div>";
                    },
                },
                onItemAdd: function(value){
                    var data,orgApp;
                    data = this.options[value];
                    orgApp = self.organizationApplication();
                    console.log("onItemAdd: ",data,value);
                    if(data != null && orgApp != null ){

                        orgApp.name( data.name);
                        orgApp.country_org_id(data.ein);
                        orgApp.city(data.city);
                        orgApp.state(data.state);
                    }
                },


            };
            self.browseForLogo= async function(orgApplication){
                console.log("showing logo file picker",orgApplication);

                const uploaderUtils = await import(/* webpackChunkName: "uppy", webpackPrefetch: true */ '../upload');
                const uppy = uploaderUtils.orgUploader() ;
                //clear files
                uppy.getFiles().map( (file) =>{
                    uppy.removeFile(file.id);
                });
                uppy.on('transloadit:complete', (assembly) => {
                    console.log("logo upload complete: ",assembly.results);
                    var url;
                    if(assembly.results && assembly.results.resize_image &&
                        assembly.results.resize_image.length > 0 && assembly.results.resize_image[0].url != null){
                        var url = assembly.results.resize_image[0].url;
                        url = url.replace(/^http/,"https");// so it matches our bucketBase pattern
                        var path = toRelativeUrl(url);
                        console.log("uploaded org logo path: ",path);
                        orgApplication.logo_url(path);
                        uppy.getPlugin('Dashboard').closeModal();
                    }
                })
                uppy.getPlugin('Dashboard').openModal();
            }


        },
        template: require('./'+NAME+'.html'),
    });
}