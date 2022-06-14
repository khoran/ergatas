import {ensureFields} from '../shared/shared-utils';
import * as utils from '../client/client-utils';

/**
 * INPUT
 * -----
 *      - appState: AppState object
 *      - userProfile: obs with user profile, if any
 */

export function register(){
   const NAME="guided-search-form";


   ko.components.register(NAME, {
       viewModel: function(params) {
            console.log(NAME+" params: ",params);
            var self=this;

            ensureFields(params,["appState","userProfile"]);


            self.appState = params.appState;
            self.utils=utils;
            self.search = params.appState.search;
            self.selectedSection= ko.observable();
            self.prevSection = ko.observable();
            self.peopleGroupLoading = ko.observable(false).extend({rateLimt:1000});;
            self.languageLoading = ko.observable(false).extend({rateLimt:1000});;
            self.movementOriented = ko.observable(false);
            self.sensitiveLocation = ko.observable(false);
            self.nationals= ko.observable(false);
            self.currentStep= ko.observable(0);
            
            const jobCatagories= self.appState.jobList.listObs();
            const orgsWithProfiles = self.appState.orgsWithProfilesList.listObs();
            const tags = self.appState.tagList.listObs();
            const causes = self.appState.causeList.listObs();

            
            self.selectSection = function(sectionName){

                self.selectedSection(sectionName);
                self.setStep(1);
            }
            self.next = function(){
                self.setStep(self.currentStep()+1);

            }
            self.setStep=function(step){
                self.currentStep(step);

                setTimeout(()=>{

                    var el = jQuery("#section"+self.currentStep())
                    if(el.length > 0)
                        el[0].scrollIntoView({behavior:"smooth",block:"start"});
                },300);
            }
            self.doSearch = function(step){
                console.log("doing search");

                if(self.movementOriented()===true){
                    self.search.filter.movementStages.obs()( // options 1-7
                        ['1','2','3','4','5','6','7']
                    );
                }

                if(self.sensitiveLocation() === true){
                    self.search.filter.tags.obs()(['3']);
                }

                if(self.nationals() === true){
                    self.search.filter.culturalDistances.obs()( ['0']);
                }


                if(params.userProfile != null && params.userProfile() != null){
                    self.search.saveSearch("Guided Search Profile",params.userProfile().user_key());
                }

                self.appState.router.navigateTo("search");
            }
            self.selectPeopleGroups = async function(setName){
                self.appState.search.addPGSet(setName,self.appState.server);
            }


            self.tagSelectizeFilterOptions= utils.tagSelectizeOptions(tags,self.search.filter.tags.obs())
            self.causeSelectizeFilterOptions= utils.causeSelectizeOptions(causes,self.search.filter.causes.obs());
            self.movementSelectizeFilterOptions =  utils.fixedItemsSelectizeOptions(self.search.filter.movementStages.obs());
            self.jobSelectizeFilterOptions= utils.jobSelectizeOptions(jobCatagories,self.search.filter.skills.obs());
            self.peopleGroupSelectizeOptions = utils.peopleGroupSelectizeOptions(
                                                        self.appState.server,
                                                        self.peopleGroupLoading,
                                                        self.search.filter.peopleGroups.obs());
            self.languageSelectizeOptions = utils.languageSelectizeOptions(
                                                        self.appState.server,
                                                        self.languageLoading,
                                                        self.search.filter.languages.obs());
         
            self.search.clearFilters();


        },
        template: require('./'+NAME+'.html'),

    });
}

