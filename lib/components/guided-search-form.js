import {ensureFields} from '../shared/shared-utils';
import * as utils from '../client/client-utils';

/**
 * INPUT
 * -----
 *      - appState: AppState object
 *      - user: obs with user info, if any
 */

export function register(){
   const NAME="guided-search-form";


   ko.components.register(NAME, {
       viewModel: function(params) {
            console.log(NAME+" params: ",params);
            var self=this;

            ensureFields(params,["appState","user"]);


            self.appState = params.appState;
            self.utils=utils;
            self.user= params.user;
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
            self.doSearch = async function(searchName){
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

                var user_key= null;

                if(params.user!= null && params.user() != null){
                    user_key = params.user().user_key();
                }
                await self.search.saveSearch(searchName,user_key);


                dataLayer.push({event:'guided-search-run'});

                if(user_key != null){
                    params.user().has_saved_search(true);
                    self.appState.router.navigateTo("search/saved/"+searchName);
                }else{
                    self.appState.router.navigateTo("search");

                }

            }
            self.login = function(){
                //send user to login/register page
                // make sure they are redirected back to search page
                // Problem: login will require reload, which means we'll lose their search settings
                //   need to save them in local storage

                    //window.localStorage.setItem("savedProfile","");
                
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

