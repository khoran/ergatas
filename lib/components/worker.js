
import { param } from 'jquery';
import * as utils from '../client/client-utils';
import {ensureFields} from '../shared/shared-utils';
/**
  * INPUT
  * -----
  *      - profile:  observable with profile object
  *      - appState: AppState object
  *      - user:  obs with logged in user object, if any
  *      - userProfile: obs with logged in user's profile object, if any
  *      - navigateFn: function that returns a function to perform a navigation
  */

export function register(){
   const NAME="worker";


   ko.components.register(NAME, {
        viewModel: function(params) {
            console.log(NAME+" params: ",params);
            var self=this;

            ensureFields(params,["profile","appState","user","userProfile","navigateFn"]);
            self.profile = params.profile;
            self.appState = params.appState;
            self.utils = utils;
            self.storage = params.appState.storage;
            self.server = params.appState.server;
            self.da = params.appState.da;


            self.stats = ko.observable();
            self.descExpanded = ko.observable(false);
            self.immediateOpen=ko.observable(location.hash==="#connect");

            self.isFavorite = ko.observable(
                params.user() 
                && params.user().search_filter 
                && params.user().search_filter.ro_profile_keys 
                && params.user().search_filter.ro_profile_keys().indexOf(self.profile.missionary_profile_key) !== -1);


            
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
                var ownProfile = self.ownProfile();
                self.utils.donate(self.da,self.profile,'detail',ownProfile);
            }
            self.ownProfile = function(){
                return params.userProfile() && (params.userProfile().missionary_profile_key() === self.profile.missionary_profile_key);
            }

            self.prayClicked = ko.observable(false);
            self.pray = function(){
                if(self.prayClicked() === false){
                    self.prayClicked(true);
                    dataLayer.push({
                        event: "prayed",
                        missionary_profile_key: self.profile.missionary_profile_key
                    });

                    console.log("stats: ",self.stats());
                    if(self.stats() != null && self.stats().prayers != null){
                        var x=self.stats();
                        console.log(" updating prayer count ",x);
                        x.prayers = parseInt(x.prayers) + 1;
                        self.stats(x);
                    }
                        
                }
            }
            self.updateStats = function(){
                utils.pageStats(self.server, self.profile.missionary_profile_key).
                    then(self.stats);
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

            self.updateStats();
           
            self.toggleDescription= function(data,event){
                var target = jQuery(event.target)
                var desc = target.siblings(".fade-text");
                if( ! self.descExpanded()){ // expanding
                    self.originalHeight = desc.height();
                    desc.height("100%");
                }
                if(self.descExpanded()){ //contracting
                    target.height()
                    desc.height(self.originalHeight);
                }
                self.descExpanded( ! self.descExpanded());
            }
            self.lastUpdatedClass = function(){
                var last_update = new Date(self.profile.last_updated_on).getTime();
                const year = 365*24*60*60*1000; // millies in a year
                if((new Date().getTime()) - last_update < year){
                    return  "muted-font";
                }else{
                    return "text-danger"
                }
            }

            self.toggleFavorite = function(){
                var user = params.user();
                console.log("user: ",user," search_filter: ",user.search_filter);
                if (!user) 
                    return;

                if (!user.search_filter) 
                    user.search_filter = {};

                if (!user.search_filter.ro_profile_keys) 
                    user.search_filter.ro_profile_keys = ko.observable([]);

                var key = self.profile.missionary_profile_key;
                var index = user.search_filter.ro_profile_keys().indexOf(key);
                if (index === -1) {
                    user.search_filter.ro_profile_keys().push(key);
                    self.isFavorite(true);
                } else {
                    user.search_filter.ro_profile_keys().splice(index, 1);
                    self.isFavorite(false);
                }
                console.log("user: ",user," search_filter: ",user.search_filter.ro_profile_keys());
                self.da.updateUser(user.user_key(), {search_filter: ko.mapping.toJS(user.search_filter)});
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
 
