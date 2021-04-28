
import * as utils from '../client-utils';
import {ensureFields} from '../shared-utils';
/**
 * INPUT
 * -----
 *      - profile:  observable with profile object
 *      - appState: AppState object
 *      - userId: observable with external_user_id value
 *      - navigateFn: function that returns a function to perform a navigation
 */

export function register(){
   const NAME="worker";


   ko.components.register(NAME, {
        viewModel: function(params) {
            console.log(NAME+" params: ",params);
            var self=this;
            var profileObs;

            ensureFields(params,["profile","appState","userId","navigateFn"]);
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


            self.causeNames = ko.observable();
            self.appState.causeList.selectItems(self.profile.data.cause_keys,self.causeNames);


            self.tagNames = ko.observable();
            self.appState.tagList.selectItems(self.profile.data.tag_keys,self.tagNames);

            self.jobCatagoryNames = ko.observable();
            self.appState.jobList.selectItems(self.profile.data.job_catagory_keys,self.jobCatagoryNames);

            self.orgNames = ko.observable();
            self.appState.approvedOrgList.selectItems(self.profile.data.organization_key,self.orgNames);




            //init social sharing buttons
            if(window.addthis && window.addthis.toolbox)
                window.addthis.toolbox(".addthis_toolbox");

        },
        template: require('./'+NAME+'.html'),
    });

}
 