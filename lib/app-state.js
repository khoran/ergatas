import { CachedList } from './cachedList';
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

        //self.countryData = ko.observable();

        self.featuredOrgList = new CachedList(
            () => self.da.featuredProfiles(), 
            (keys,data) => {} );

        self.approvedOrgList = new CachedList(
            () => self.da.organizationList(), 
            (keys,data) => utils.selectedKeys(keys,data,"organization_key","name",true));

        self.orgsWithProfilesList = new CachedList(
            () => self.da.selectOrganizationsWithProfiles(), 
            (keys,data) => utils.selectedKeysAsArray(keys,data,"organization_key","name",true));

        self.jobList = new CachedList(
            () => self.da.jobList(), 
            (keys,data) => utils.selectedKeysAsArray(keys,data,"job_catagory_key","catagory",true));


        self.tagList = new CachedList(
            () => self.da.tagList(), 
            (keys,data) => utils.selectedKeysAsArray(keys,data,"tag_key","name",true));


        self.causeList = new CachedList(
            () => self.da.causeList(), 
            (keys,data) => utils.selectedKeysAsArray(keys,data,"cause_key","cause",true));

        self.countriesByCode;

        self.orgObservables = {};

        self.countryList = new CachedList(
            () => jQuery.get(countryUrl),
            (keys,data) => utils.selectedKeys(keys,data,"alpha3Code","name",false),
            30 * 24 * 60 * 60); //update every 30 days


        ko.computed( () =>{
            var countryList = self.countryList.listObs()();
            if(countryList  != null){
                self.countriesByCode = {};
                countryList.forEach( country =>{
                    self.countriesByCode[country.alpha3Code] = country;
                });
            }
        });

    }
    setRouter(router){
        this.router = router;
    }

    selectProfile(data){
        console.log("selected profile: ",data);
        this.router.navigateTo('profile-detail/'+data.missionary_profile_key);
    };


   // countryArray(countryCodes){
   //     var self=this;
   //     if(self.countriesByCode == null){
   //         self.initCountriesByCode();
   //     }
   //     console.log("countryArray: ",countryCodes);
   //     if(countryCodes == null || ! Array.isArray(countryCodes))
   //         return [];
   //     return countryCodes.map( code => {
   //         return {
   //             name: self.countriesByCode[code] != null ?  self.countriesByCode[code].name : code ,
   //             key: code,
   //         };
   //     });
   // }
   // initCountriesByCode(){
   //     var self=this;
   //     self.countriesByCode = {};
   //     if(self.countryData() != null)
   //         self.countryData().forEach( country =>{
   //             self.countriesByCode[country.alpha3Code] = country;
   //         });
   // }
    getOrganizationObs(organization_key){
        var self=this;

        //console.log("== getOrganizationObs for "+organization_key);

        if(self.orgObservables[organization_key] == null){
            //console.log("setting up org observable for "+organization_key);
            self.orgObservables[organization_key] = ko.observable({});
            self.approvedOrgList.selectItems(organization_key,self.orgObservables[organization_key]);
        }
        return self.orgObservables[organization_key];
    }


}