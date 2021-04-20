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


        //TODO: some mechanism to update these as needed
        //  either by reqeust, or if a key has no match
        self.da.selectOrganizationsWithProfiles().then( orgs => { 
            self.orgsWithProfiles(orgs); 
        });
        self.da.jobList().then( jobs =>{ 
            self.jobCatagories(jobs);
        });
        self.da.tagList().then( t =>{ 
            self.tags(t)
        });

        self.da.organizationList().then( orgs =>{
            self.approvedOrganizations(orgs);
        })
        self.da.featuredProfiles().then( orgs =>{
            self.featuredProfiles(orgs);
        });
        
        jQuery.get(countryUrl).then( data => self.countryData(data) );

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
        var x=countryCodes.map( code => {
            return {
                name: self.countriesByCode[code].name ,
                key: code,
            };
        });
        console.log("countryArray names: ",x);
        return x;
        //return countryCodes.map( code => this.countriesByCode[code].name);
    }
    initCountriesByCode(){
        var self=this;
        self.countriesByCode = {};
        if(self.countryData() != null)
            self.countryData().forEach( country =>{
                self.countriesByCode[country.alpha3Code] = country;
            });
    }
    getOrganization(organization_key) {
        //console.log("getting organization info for "+organization_key);
        organization_key = parseInt(organization_key); //TOOD: fix selectgize functions that set this to be a string 

        var org = this.approvedOrganizations().find(function(org){
            return org.organization_key === organization_key;
        });
        return org;
    };



}