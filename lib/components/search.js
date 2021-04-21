
import * as utils from '../client-utils';
import {ensureFields} from '../shared-utils';
/**
 * INPUT
 * -----
 *      - appState: AppState object
 */

export function register(){
   const NAME="search";


   ko.components.register(NAME, {
       viewModel: function(params) {
            console.log(NAME+" params: ",params);
            var self=this;

            ensureFields(params,["appState"]);

            self.appState = params.appState;
            self.search = self.appState.search;
            self.da = self.appState.da;
            self.utils=utils;

            self.selectedFilter = ko.observable();
            self.page = ko.observable("filter_list_template");
            const jobCatagories= self.appState.jobCatagories;
            const orgsWithProfiles = self.appState.orgsWithProfiles;
            const tags = self.appState.tags;
            const causes = self.appState.causes;
            const countryCodes = []; //TODO: define this

            self.filters = [
                {
                    name: "keyword",
                    display: "Keywords"
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
                {
                    name: "causes",
                    display:"Ministry Causes",
                    showClearBtn: true,
                },
                {
                    name: "support",
                    display:"Support Level"
                },
                {
                    name: "skills",
                    display:"Job Skills",
                    showClearBtn: true,
                },
                {
                    name: "maritalStatus",
                    display:"Marital Status"
                },
                {
                    name: "ageGroups",
                    display:"Kids Ages"
                },
                {
                    name:  "movementStage",
                    display:"Movement Stage"
                },
                {
                    name: "tags",
                    display: "Tags",
                    showClearBtn: true,
                },
                {
                    name: "impactCountries",
                    display: "Areas of Impact",
                    showClearBtn: true,
                },
                {
                    name:  "location",
                    display:"Missionary Location",
                },
            ];

            if(self.search.searchResultsTemplate() == null)
                self.search.searchResultsTemplate("list-results-template");

            self.search.updateQueryResults();


            self.appState.updateTagList();
            self.appState.updateJobList();
            self.appState.updateOrgsWithProfiles();



            self.selectFilterFn = function(name){
                return  () => {
                    self.selectedFilter(name+"_filter");
                    self.page("filter_template");
                };
            };
            self.goToFilterList= function(){
                self.page("filter_list_template");
            }

            self.jobCatagoryArray = () => self.appState.jobCatagoryArray(self.search.filter.skills.obs()(),true);
            self.selectedOrgsArray = () => self.appState.selectedOrgsArray(self.search.filter.organizations.obs()(),true);
            self.tagArray = () => self.appState.tagArray(self.search.filter.tags.obs()(),true);
            self.causeArray = () => self.appState.causeArray(self.search.filter.causes.obs()(),true);
            self.countryArray = () => self.appState.countryArray(self.search.filter.impactCountries.obs()());

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
            };
            self.goToMapView = function(){
                self.toggleFilterPanel(false);
                self.searchMapView();
            }

            self.jobSelectizeFilterOptions= {
                create:false,
                valueField: "job_catagory_key",
                labelField:"catagory",
                searchField: "catagory",
                plugins:['remove_button'],
                maxItems:10,
                closeAfterSelect: true,
                onInitialize: function(){
                    var api=this;
                    ko.bindingHandlers.selectize.utils.setOptions(api,jobCatagories);
                    ko.bindingHandlers.selectize.utils.watchForNewOptions(api,jobCatagories);
                    ko.bindingHandlers.selectize.utils.setItems(api,self.search.filter.skills.obs());
                },
                onObsUpdate: function(api, value){
                    console.log("new value set on observable: ",value());
                    api.clear(true);
                    ko.bindingHandlers.selectize.utils.setItems(api,value);
                },

            };

            self.tagSelectizeFilterOptions= {
                create:false,
                valueField: "tag_key",
                labelField:"name",
                searchField: "name",
                plugins:['remove_button'],
                maxItems:10,
                closeAfterSelect: true,
                onInitialize: function(){
                    var api=this;
                    ko.bindingHandlers.selectize.utils.setOptions(api,tags);
                    ko.bindingHandlers.selectize.utils.watchForNewOptions(api,tags);
                    ko.bindingHandlers.selectize.utils.setItems(api,self.search.filter.tags.obs());
                },
                onObsUpdate: function(api, value){
                    console.log("new value set on observable: ",value());
                    api.clear(true);
                    ko.bindingHandlers.selectize.utils.setItems(api,value);
                },
            };

            self.causeSelectizeFilterOptions= {
                create:false,
                valueField: "cause_key",
                labelField:"cause",
                searchField: "cause",
                plugins:['remove_button'],
                maxItems:10,
                closeAfterSelect: true,
                onInitialize: function(){
                    var api=this;
                    ko.bindingHandlers.selectize.utils.setOptions(api,causes);
                    ko.bindingHandlers.selectize.utils.watchForNewOptions(api,causes);
                    ko.bindingHandlers.selectize.utils.setItems(api,self.search.filter.causes.obs());
                },
                onObsUpdate: function(api, value){
                    console.log("new value set on observable: ",value());
                    api.clear(true);
                    ko.bindingHandlers.selectize.utils.setItems(api,value);
                },
            };
            self.fixedSelectizeFilterOptions = {
                //plugins:['remove_button'],
                allowEmptyOption: true,
                //showEmptyOptionInDropDown: true,
                //emptyOptionLabel: "--",
                onInitialize: function(){
                    //ko.bindingHandlers.selectize.utils.setItems(this,self.search.filter..obs());
                },
                onObsUpdate: function(api, value){
                    console.log("new value set on observable: ",value());
                    api.clear(true);
                    ko.bindingHandlers.selectize.utils.setItems(api,value);
                },
            };
            self.ageGroupsSelectizeFilterOptions = {
                maxItems: 10,
                plugins:['remove_button'],
                closeAfterSelect: true,
                onInitialize: async function() {
                    var api = this;
                    ko.bindingHandlers.selectize.utils.setItems(api,self.search.filter.ageGroups.obs());
                },
                onObsUpdate: self.fixedSelectizeFilterOptions.onObsUpdate

            };

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
                onObsUpdate: function(api, value){
                    console.log("org new value set on observable: ",value());
                    api.clear(true);
                    ko.bindingHandlers.selectize.utils.setItems(api,value);
                },

            };



       },
        template: require('./'+NAME+'.html'),
    });
}
 