import * as utils from '../client-utils';
/**
 *  INPUT
 *      - profiles: array of profile objects
 *      - showMessageOnEmptyResult: true or false, default is true
 *      - appState: AppState object
 *      - containerSelector: css selector for container results are within
 *      - userProfile: obs with current users profile, if any
 */
export function register(){
    ko.components.register('profile-collection', {
        viewModel: function(params) {
            var self=this;
            console.log("defining viewmodel for PROFILE-COLLECTION",params);
            const userProfile = params.userProfile;
            self.appState=params.appState;
            self.utils = utils;
            self.profiles= params.profiles;
            self.da = params.appState.da;

            self.profileObservables = {}; //array of observables

            self.selectProfile =  data => params.appState.selectProfile(data);
            self.getOrganizationObs = x => params.appState.getOrganizationObs(x);
            self.pictureUrl =  x => params.appState.storage.profilePictureUrl(x);
            self.searchInProgress = params.appState.search.searchInProgress;
            self.showMessageOnEmptyResult = params.showMessageOnEmptyResult == null ? true : params.showMessageOnEmptyResult ;
            self.searchPageNumber = params.appState.search.searchPageNumber;
            self.containerSelector = params.containerSelector;

            self.loadNextPage = function(){
                //console.log("loading next page" );
                self.searchPageNumber(self.searchPageNumber() + 1); 
            }
            self.donate = function(data){
                var ownProfile = userProfile() && (userProfile().missionary_profile_key() === data.missionary_profile_key);
                utils.donate(self.da,data,'summary',ownProfile);
            }

            self.getJobNames = function(missionary_profile_key){
                var self=this;
                var profile = self.profiles().find( profile => 
                                    profile.missionary_profile_key === missionary_profile_key);

                if(profile == null)
                    return ;

                //console.log("== getOrganizationObs for "+organization_key);

                if(self.profileObservables[missionary_profile_key] == null){
                    //console.log("setting up org observable for "+organization_key);
                    self.profileObservables[missionary_profile_key] = ko.observable({});
                    self.appState.jobList.selectItems(profile.data.job_catagory_keys,
                        self.profileObservables[missionary_profile_key]);
                }
                return self.profileObservables[missionary_profile_key];
        
            }

        },
        template: require('./profile-collection.html'),
    });
}