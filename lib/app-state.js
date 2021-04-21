import * as utils from './client-utils';

const countryUrl = "https://restcountries.eu/rest/v2/all";
export class AppState{
    constructor(da,search,storage,router,server) {
        var self=this;
        self.da=da;
        self.search=search;
        self.storage=storage;
        self.router = router;
        self.server = server;

        self.jobCatagories= ko.observable();
        self.orgsWithProfiles = ko.observable();
        self.tags = ko.observable();
        self.approvedOrganizations = ko.observable();
        self.featuredProfiles = ko.observable();
        self.countryData = ko.observable();

        self.countriesByCode;

        self.orgObservables = {};

        this.updateFeaturedProfiles();
        this.updateOrgsWithProfiles();
        this.updateTagList();
        this.updateJobList();
        this.updateApprovedOrgList();

        self.countryData.promise = jQuery.get(countryUrl).then( data => self.countryData(data) );

        //self.orgTest = 0;
        self.jobTest = 0;
    }
    setRouter(router){
        this.router = router;
    }

    selectProfile(data){
        console.log("selected profile: ",data);
        this.router.navigateTo('profile-detail/'+data.missionary_profile_key);
    };
    jobCatagoryArray(job_catagory_keys,asObject){
        return utils.selectedKeysAsArray(job_catagory_keys,this.jobCatagories(),"job_catagory_key","catagory",asObject);
    };
    selectedOrgsArray(organization_keys,asObject){
        return utils.selectedKeysAsArray(organization_keys,this.orgsWithProfiles(),"organization_key","name",asObject);
    };
    tagArray(tag_keys,asObject){
        return utils.selectedKeysAsArray(tag_keys,this.tags(),"tag_key","name",asObject);
    };
    countryArray(countryCodes){
        var self=this;
        if(self.countriesByCode == null){
            self.initCountriesByCode();
        }
        console.log("countryArray: ",countryCodes);
        if(countryCodes == null || ! Array.isArray(countryCodes))
            return [];
        return countryCodes.map( code => {
            return {
                name: self.countriesByCode[code] != null ?  self.countriesByCode[code].name : code ,
                key: code,
            };
        });
    }
    async updateApprovedOrgList(){
        return this.updateList(this.da.organizationList(),this.approvedOrganizations);

            //FOR DEBUGGING
           // if(self.orgTest <= 1){
           //     self.orgTest = self.orgTest + 1;
           //     orgs = orgs.filter(org => org.organization_key != 617);
           // }
    }
    async updateFeaturedProfiles(){
        return this.updateList(this.da.featuredProfiles(),this.featuredProfiles);
    }
    async updateTagList(){
        return this.updateList(this.da.tagList(),this.tags);
    }
    async updateJobList(){
        return this.updateList(this.da.jobList(),this.jobCatagories);
    }
    async updateOrgsWithProfiles(){
        return this.updateList(this.da.selectOrganizationsWithProfiles(),this.orgsWithProfiles);
    }
    async updateList(source, obs){
        var self=this;
        obs.promise = source.then( data=> { 
            obs(data); 
        });
        return obs.promise;
    }
    initCountriesByCode(){
        var self=this;
        self.countriesByCode = {};
        if(self.countryData() != null)
            self.countryData().forEach( country =>{
                self.countriesByCode[country.alpha3Code] = country;
            });
    }
    findOrg(organization_key){
        organization_key = parseInt(organization_key); 
        return this.approvedOrganizations.peek().find(function(org){
            return org.organization_key === organization_key;
        });
    }
    getOrganizationObs(organization_key){
        var self=this;
        var org;

        //console.log("== getOrganizationObs for "+organization_key);

        if(self.orgObservables[organization_key] != null){
            //console.log("found existing org observable for "+organization_key,self.orgObservables[organization_key]());
        }else{
            //console.log("setting up org observable for "+organization_key);
            self.orgObservables[organization_key] = ko.observable({});
            org = self.findOrg(organization_key);

            if(org != null){
                //console.log("found org for "+organization_key,org);
                self.orgObservables[organization_key](org);
            }else{
                //console.log("org not found in current list");
                self.updateApprovedOrgList().then( () => {
                    //console.log("new org list loaded");
                    org = self.findOrg(organization_key);
                    if(org != null){
                        //console.log("found org after reload for "+organization_key);
                        self.orgObservables[organization_key](org);
                    }else{
                        //console.log("org still not found for "+organization_key);
                    }
                });
            }

        }
        return self.orgObservables[organization_key];
    }


}