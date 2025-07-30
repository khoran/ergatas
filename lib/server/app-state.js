import { CachedList } from './cachedList';
import {allCountries} from '../shared/shared-utils';
import * as utils from '../client/client-utils';

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
            () => self.da.sendingOrganizationList(), 
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
            () => allCountries(),
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
    toString(){
        return "AppState Object";
    }
    setRouter(router){
        this.router = router;
    }

    selectProfile(data){
        console.log("selected profile: ",data);
        this.router.navigateTo('profile-detail/'+data.missionary_profile_key);
    };

    featuredProfiles() {
        var profiles = this.featuredOrgList.listObs();
        console.log("featured profiles: ",profiles());
        if(profiles() && profiles().length >= 3){
            profiles()[0].class="pcard-dark-bg accent3-bg";
            profiles()[1].class="pcard-dark-bg accent2-bg";
            profiles()[2].class="pcard-dark-bg accent1-bg";
        }
        return profiles;
    }

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
