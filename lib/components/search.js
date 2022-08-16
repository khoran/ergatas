
import * as utils from '../client/client-utils';
import {ensureFields} from '../shared/shared-utils';
/**
 * INPUT
 * -----
 *      - appState: AppState object
 *      - userProfile: obs with user profile, if any
 *      - user: logged in user object
 */

export function register(){
   const NAME="search";


   ko.components.register(NAME, {
       viewModel: function(params) {
            console.log(NAME+" params: ",params);
            var self=this;

            ensureFields(params,["appState","userProfile"]);

            self.userProfile = params.userProfile;
            self.user = params.user;
            self.appState = params.appState;
            self.search = self.appState.search;
            self.da = self.appState.da;
            self.utils=utils;

            self.selectedFilter = ko.observable();
            self.page = ko.observable("filter_list_template");
            self.loading = ko.observable(false).extend({rateLimt:1000});
            self.showSearchNameInput = ko.observable(false);
            self.savedSearchName = ko.observable(utils.getSearchNameFromURL());

            const jobCatagories= self.appState.jobList.listObs();
            const orgsWithProfiles = self.appState.orgsWithProfilesList.listObs();
            const tags = self.appState.tagList.listObs();
            const causes = self.appState.causeList.listObs();

            self.filters = [
                {
                    name: "keyword",
                    display: "General Search"
                },
                {
                    name: "name",
                    display:"Missionary Name",
                },
                {
                    name:"organizations",
                    display:"Organization Name",
                    showClearBtn: true,
                },

                {   separator: true },

                {
                    name: "causes",
                    display:"Causes / Passions",
                    showClearBtn: true,
                },
                 {
                    name: "skills",
                    display:"Vocations / Job Skills / Giftings",
                    showClearBtn: true,
                },
                {
                    name: "languages",
                    display:"Languages Spoken",
                    showClearBtn: true,
                },
 
                {   separator: true },

                {
                    name: "peopleGroups",
                    display:"People Groups",
                    showClearBtn: true,
                },
                {
                    name:  "movementStages",
                    display:"Movement Stage",
                    showClearBtn: true,
                },
                {
                    name:  "culturalDistances",
                    display:"Cultural Distance",
                    showClearBtn: true,
                },



                {   separator: true },

                {
                    name: "impactCountries",
                    display: "Areas of Impact",
                    showClearBtn: true,
                },
                {
                    name:  "location",
                    display:"Missionary Location",
                },

                {   separator: true },
 
               {
                    name: "support",
                    display:"Support Level"
                },
               {
                    name: "maritalStatus",
                    display:"Marital Status"
                },
                {
                    name: "ageGroups",
                    display:"Kids Ages",
                    showClearBtn: true,
                },
               {
                    name: "tags",
                    display: "Tags",
                    showClearBtn: true,
                },
           ];
           if(self.search.searchResultsTemplate() == null)
                self.search.searchResultsTemplate("list-results-template");

            self.search.updateQueryResults();


            self.selectFilterFn = function(name){
                return  () => {
                    self.selectedFilter(name+"_filter");
                    self.page("filter_template");
                };
            };
            self.goToFilterList= function(){
                self.page("filter_list_template");
            }
            self.saveSearch = function(){
                console.log("saving current search ",self.savedSearchName())
                //var searchParams = self.search.filterValues(self.search.filter);
                //console.log("search params: ",searchParams);
                console.log("user : ",self.user());
                if(self.user != null && self.user() != null){

                    //save to db
                    self.search.saveSearch(self.savedSearchName(),self.user().user_key()).
                            then( () =>{
                                self.user().has_saved_search(true);
                                self.showSearchNameInput(false)
                            });
                }
            }


            self.causeNames = ko.observable();
            ko.computed( () =>
                self.appState.causeList.selectItems(self.search.filter.causes.obs()(),self.causeNames));

            self.tagNames = ko.observable();
            ko.computed( () =>
                self.appState.tagList.selectItems(self.search.filter.tags.obs()(),self.tagNames));

            self.jobCatagoryNames = ko.observable();
            ko.computed( () =>
                self.appState.jobList.selectItems(self.search.filter.skills.obs()(),self.jobCatagoryNames));

            //self.countryNames = ko.observable();
            //ko.computed( () =>
            //    self.appState.countryList.selectItems(self.search.filter.impactCountries.obs()(),self.countryNames));

            self.orgNames = ko.observable();
            ko.computed( () =>
                self.appState.approvedOrgList.selectItems(self.search.filter.organizations.obs()(),self.orgNames));



            self.clearFilter = function(filterName){
                if(self.search.filter[filterName] != null){
                    self.search.filter[filterName].clear();
                }else
                    console.warn("tryed to clear non-existing filter "+filterName);
            };
        
            self.searchListView= function(){
                self.search.filter.bounds.clear();
                self.search.searchResultsTemplate("list-results-template");
            };
            self.searchMapView = function(){
                self.search.searchResultsTemplate("map-results-template");
            };
        


            self.toggleFilterPanel = function(state){
                self.goToFilterList();
                jQuery(".cd-panel").toggleClass("cd-panel--is-visible",state);
                if(state===true){
                    dataLayer.push({event:'user','user-action':"opened-filter-panel"});

                    $(document).on("keydown",(event) => {
                        //console.log("key event : ",event.originalEvent);
                        if(event.originalEvent && event.originalEvent.key==="Escape")
                            self.toggleFilterPanel(false);
                    });
                }else
                    $(document).off("keydown");
            };
            self.goToMapView = function(){
                self.toggleFilterPanel(false);
                self.searchMapView();
            }

            self.selectedPeopleGroupNames = ko.observable([]);
            ko.computed(() =>{
                var selectedPGCodes = self.search.filter.peopleGroups.obs()();
                utils.peopleGroupNames(self.appState.server,selectedPGCodes,self.loading).
                    then( names => {
                        self.selectedPeopleGroupNames(names.map( name => {
                            if(name == null) return {name:"", key:-1};
                            return {
                                name: name.PeopNameAcrossCountries,
                                key: name.PeopleID3
                            }
                        }).sort((a,b) =>{
                            if(a.name > b.name) return 1;
                            if(a.name < b.name) return -1;
                            return 0;
                        }));
                    })
            });
            self.peopleGroupSelectizeOptions = utils.peopleGroupSelectizeOptions(
                                                               self.appState.server,
                                                               self.loading,
                                                               self.search.filter.peopleGroups.obs());


            self.selectedLanguageNames = ko.observable([]);
            ko.computed(() =>{
                var selectedCodes = self.search.filter.languages.obs()();
                utils.languageNames(self.appState.server,selectedCodes,self.loading).
                    then( names => {
                        self.selectedLanguageNames(names.sort((a,b) =>{
                            if(a.Language > b.Langauge) return 1;
                            if(a.Language < b.Language) return -1;
                            return 0;
                        }));
                    })
            });
            
            self.languageSelectizeOptions = utils.languageSelectizeOptions(
                                                               self.appState.server,
                                                               self.loading,
                                                               self.search.filter.languages.obs());



            self.onObsUpdate =function(api, value){
                //console.log("new value set on observable: ",value());
                api.clear(true);
                ko.bindingHandlers.selectize.utils.setItems(api,value);
            }
 
            self.fixedSelectizeFilterOptions = {
                allowEmptyOption: true,
                onObsUpdate:  self.onObsUpdate,
            };

            self.jobSelectizeFilterOptions= utils.jobSelectizeOptions(jobCatagories,self.search.filter.skills.obs());

            self.sortBySelectizeOptions= {
                closeAfterSelect: true,
                onInitialize: function(){
                    var api=this;
                    ko.bindingHandlers.selectize.utils.setItems(api,self.search.sortBy);
                },
                onObsUpdate: self.onObsUpdate
            };

            self.tagSelectizeFilterOptions= utils.tagSelectizeOptions(tags,self.search.filter.tags.obs())

            self.causeSelectizeFilterOptions= utils.causeSelectizeOptions(causes,self.search.filter.causes.obs());

            self.movementSelectizeFilterOptions =  utils.fixedItemsSelectizeOptions(self.search.filter.movementStages.obs());
            //{
            //    maxItems:10,
            //    plugins:['remove_button'],

            //    onInitialize: async function() {
            //        var api = this;
            //        ko.bindingHandlers.selectize.utils.setItems(api,self.search.filter.movementStages.obs());
            //    },
            //    onObsUpdate: self.onObsUpdate
            //};
            self.culturalDistanceSelectizeFilterOptions= utils.fixedItemsSelectizeOptions(self.search.filter.culturalDistances.obs());
            //{
            //    maxItems:10,
            //    plugins:['remove_button'],

            //    onInitialize: async function() {
            //        var api = this;
            //        ko.bindingHandlers.selectize.utils.setItems(api,self.search.filter.culturalDistances.obs());
            //    },
            //    onObsUpdate: self.onObsUpdate
            //};
            
            self.ageGroupsSelectizeFilterOptions = utils.fixedItemsSelectizeOptions(self.search.filter.ageGroups.obs(),true);
            //{
            //    maxItems: 10,
            //    plugins:['remove_button'],
            //    closeAfterSelect: true,
            //    onInitialize: async function() {
            //        var api = this;
            //        ko.bindingHandlers.selectize.utils.setItems(api,self.search.filter.ageGroups.obs());
            //    },
            //    onObsUpdate: self.onObsUpdate

            //};

            self.orgSelectizeFilterOptions= {
                create:false,
                valueField: "organization_key",
                labelField:"name",
                searchField: "name",
                plugins:['remove_button'],
                maxItems:10,
                closeAfterSelect: true,
                onInitialize: async function(){
                    console.log("org selectize init");
                    var api=this;
                    ko.bindingHandlers.selectize.utils.setOptions(api,orgsWithProfiles);
                    ko.bindingHandlers.selectize.utils.watchForNewOptions(api,orgsWithProfiles);
                    ko.bindingHandlers.selectize.utils.setItems(api,self.search.filter.organizations.obs());
                },
                onObsUpdate: self.onObsUpdate
            };
            self.selectPeopleGroups = async function(setName){
                self.appState.search.addPGSet(setName,self.appState.server);
            }

//            self.selectedPeopleGroupSets = function(){
//                return Object.keys(self.search.filter.pgSets.obs()() || {});
//            }
//            self.peopleGroupSetSize = function(setName){
//                var sets = self.search.filter.pgSets.obs()();
//                if(sets != null && sets[setName] != null)
//                    return utils.displayNumResults(sets[setName].length)
//                return 0;
//            }
//            self.deletePeopleGroupSet = function(setName){
//                var sets = self.search.filter.pgSets.obs()();
//                delete sets[setName];
//                if( sets != null && Object.values(sets).length === 0)
//                    sets = undefined;
//                self.search.filter.pgSets.obs()(sets);
//            }



       },
        template: require('./'+NAME+'.html'),
    });
}
 
