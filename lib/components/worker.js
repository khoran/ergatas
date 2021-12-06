
import * as utils from '../client/client-utils';
import {ensureFields} from '../shared/shared-utils';
/**
 * INPUT
 * -----
 *      - profile:  observable with profile object
 *      - appState: AppState object
 *      - userProfile:  obs with logged in users profile, if any
 *      - navigateFn: function that returns a function to perform a navigation
 */

export function register(){
   const NAME="worker";


   ko.components.register(NAME, {
        viewModel: function(params) {
            console.log(NAME+" params: ",params);
            var self=this;

            ensureFields(params,["profile","appState","userProfile","navigateFn"]);
            const userProfile = params.userProfile;
            self.profile = params.profile;
            self.appState = params.appState;
            self.utils = utils;
            self.storage = params.appState.storage;
            self.server = params.appState.server;
            self.da = params.appState.da;

            
            self.peopleGroups = ko.observableArray();
            utils.peopleGroupNames(self.server,self.profile.data.people_id3_codes).
                then( names =>{
                    self.peopleGroups(names);
                });

            self.languages = ko.observableArray();
            utils.languageNames(self.server,self.profile.data.rol3_codes).
                then( names =>{
                    self.languages(names);
                });

            self.donate = function(){
                var ownProfile = userProfile() && (userProfile().missionary_profile_key() === self.profile.missionary_profile_key);
                self.utils.donate(self.da,self.profile,'detail',ownProfile);
            }

            self.causeNames = ko.observable();
            self.appState.causeList.selectItems(self.profile.data.cause_keys,self.causeNames);

            self.tagNames = ko.observable();
            self.appState.tagList.selectItems(self.profile.data.tag_keys,self.tagNames);

            self.jobCatagoryNames = ko.observable();
            self.appState.jobList.selectItems(self.profile.data.job_catagory_keys,self.jobCatagoryNames);

            self.orgNames = ko.observable();
            self.appState.approvedOrgList.selectItems(self.profile.data.organization_key,self.orgNames);

            self.quickSearchFn = function(filterName,keyField,asArray=false){
               return utils.quickSearchFn(self.appState,filterName,keyField,asArray);
            }
            //self.quickSearchFn = function(filterName,keyField,asArray=false){
            //    return function(data){

            //        console.log("quick search data: ",data);
            //        self.appState.search.setSearch(filterName,
            //            asArray ? [data[keyField]] : data[keyField]);
            //        params.navigateFn('search')();
            //    }

            //}
        },
        template: require('./'+NAME+'.html'),
    });

}
 
