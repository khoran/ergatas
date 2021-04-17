
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
            const jobCatagories= self.appState.jobCatagories;
            const orgsWithProfiles = self.appState.orgsWithProfiles;
            const tags = self.appState.tags;

            if(self.search.searchResultsTemplate() == null)
                self.search.searchResultsTemplate("list-results-template");

            self.search.updateQueryResults();

//
//            self.da.selectOrganizationsWithProfiles().then( orgs => { 
//                orgsWithProfiles(orgs); 
//            });
//            self.da.jobList().then( jobs =>{ 
//                jobCatagories(jobs);
//            });
//            self.da.tagList().then( t =>{ 
//                tags(t)
//            });



            //viewModel functions
            self.jobCatagoryArray = function(){
                return utils.selectedKeysAsArray(self.search.filter.skills.obs()(),
                                                 jobCatagories(),"job_catagory_key","catagory",true);
            };
            self.selectedOrgsArray = function(){
                return utils.selectedKeysAsArray(self.search.filter.organizations.obs()(),
                                                 orgsWithProfiles(),"organization_key","name",true);
            };
            self.tagArray = function(){
                return utils.selectedKeysAsArray(self.search.filter.tags.obs()(),
                                                 tags(),"tag_key","name",true);
            };
        
            self.searchListView= function(){
                self.search.filter.bounds.clear();
                self.search.searchResultsTemplate("list-results-template");
            };
            self.searchMapView = function(){
                self.search.searchResultsTemplate("map-results-template");
            };
        


            self.toggleFilterPanel = function(){
                jQuery(".cd-panel").toggleClass("cd-panel--is-visible");
            };

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
                onObsUpdate: function(api, value){
                    console.log("new value set on observable: ",value());
                    api.clear(true);
                    ko.bindingHandlers.selectize.utils.setItems(api,value);
                },
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
                    var api=this;
                    ko.bindingHandlers.selectize.utils.setOptions(api,orgsWithProfiles);
                    ko.bindingHandlers.selectize.utils.watchForNewOptions(api,orgsWithProfiles);
                },
                onObsUpdate: function(api, value){
                    console.log("new value set on observable: ",value());
                    api.clear(true);
                    ko.bindingHandlers.selectize.utils.setItems(api,value);
                },

            };



       },
        template: require('./'+NAME+'.html'),
    });
}
 