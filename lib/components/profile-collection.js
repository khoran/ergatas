import * as utils from '../client/client-utils';
/**
 *  INPUT
 *      - profiles: array of profile objects
 *      - showMessageOnEmptyResult: true or false, default is true
 *      - appState: AppState object
 *      - containerSelector: css selector for container results are within
 *      - userProfile: obs with current users profile, if any
 *      - onMapView: boolean, should be true if results are being filtered by map
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
            self.onMapView = params.onMapView || false;

            self.loadNextPage = function(){
                //console.log("loading next page" );
                self.searchPageNumber(self.searchPageNumber() + 1); 
            }
            self.donate = function(data){
                var ownProfile = userProfile() && (userProfile().missionary_profile_key() === data.missionary_profile_key);
                utils.donate(self.da,data,'summary',ownProfile);
            }
            self.isOwnProfile = function(data){
                return utils.isOwnProfile(userProfile,data.missionary_profile_key);
            }

            self.getJobNames = function(missionary_profile_key){
                var self=this;
                var profile = self.findProfile(missionary_profile_key);
                if(profile == null)
                    return ;

                this.resolveNames(profile);

               return self.profileObservables[missionary_profile_key].jobNames;
            }
            self.hasCauses = function(missionary_profile_key){
                var profile = self.findProfile(missionary_profile_key);
                if(profile == null)
                  return false;
                return profile.data.cause_keys != null && profile.data.cause_keys.length > 0;
            }
            self.getCauseNames = function(missionary_profile_key){
                var self=this;
                var profile = self.findProfile(missionary_profile_key);
                if(profile == null)
                    return ;

                self.resolveNames(profile);

                return self.profileObservables[missionary_profile_key].causeNames;
            }
            self.findProfile = function(missionary_profile_key){
                return self.profiles().find( profile => 
                                    profile.missionary_profile_key === missionary_profile_key);
            }
            self.resolveNames = function(profile){
                var missionary_profile_key = profile.missionary_profile_key;
                if(self.profileObservables[missionary_profile_key] == null){
                    //console.log("setting up org observable for "+organization_key);
                    self.profileObservables[missionary_profile_key] = {
                       jobNames: ko.observable({}),
                       causeNames: ko.observable({}),
                    };
                    self.appState.jobList.selectItems(profile.data.job_catagory_keys,
                        self.profileObservables[missionary_profile_key].jobNames);
                    self.appState.causeList.selectItems(profile.data.cause_keys,
                        self.profileObservables[missionary_profile_key].causeNames);
                }
                
            }

        },
        template: require('./profile-collection.html'),
    });
}
