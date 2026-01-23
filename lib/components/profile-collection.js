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
            const loggedInUser = params.appState.loggedInUser;
            self.appState=params.appState;
            self.utils = utils;
            self.profiles= params.profiles;
            self.da = params.appState.da;

            self.profileObservables = {}; //array of observables

            self.getProfileObservables = function(profile) {
                var key = profile.missionary_profile_key;
                var user = loggedInUser();
                if (!self.profileObservables[key]) {
                    self.profileObservables[key] = {
                        jobNames: ko.observable({}),
                        causeNames: ko.observable({}),
                        isFavorite: ko.observable(
                            user && user.search_filter 
                            && user.search_filter.ro_profile_keys 
                            && user.search_filter.ro_profile_keys().indexOf(key) !== -1
                        )
                    };
                }
                return self.profileObservables[key];
            };

            self.selectProfile =  data => params.appState.selectProfile(data);
            self.getOrganizationObs = x => params.appState.getOrganizationObs(x);
            self.pictureUrl =  x => params.appState.storage.profilePictureUrl(x);
            self.getProfileUrl = utils.getProfileUrl;
            self.searchInProgress = params.appState.search.searchInProgress;
            self.showMessageOnEmptyResult = params.showMessageOnEmptyResult == null ? true : params.showMessageOnEmptyResult ;
            self.searchPageNumber = params.appState.search.searchPageNumber;
            self.containerSelector = params.containerSelector;
            self.onMapView = params.onMapView || false;
            self.cardClass = params.cardClass || '';

            self.isFavorite = function(profile) {
                return self.getProfileObservables(profile).isFavorite;
            };

            self.toggleFavorite = function(profile) {
                var user = loggedInUser();
                if (!user) return;

                if (!user.search_filter) user.search_filter = {};

                if (!user.search_filter.ro_profile_keys) user.search_filter.ro_profile_keys = ko.observable([]);

                var key = profile.missionary_profile_key;
                var index = user.search_filter.ro_profile_keys().indexOf(key);
                if (index === -1) {
                    user.search_filter.ro_profile_keys().push(key);
                    self.profileObservables[key].isFavorite(true);
                } else {
                    user.search_filter.ro_profile_keys().splice(index, 1);
                    self.profileObservables[key].isFavorite(false);
                }
                self.da.updateUser(user.user_key(), {search_filter: ko.mapping.toJS(user.search_filter)});
            };

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
            self.showSeparator = function(data){
                return data.isSeparator === true && self.showMessageOnEmptyResult;
            }
            self.separatorClass = function(data){
                return self.showSeparator(data) ? 'flex-break' : '';
            }
            self.profileClass = function(data){
                return self.showSeparator(data) ? '' : 'pcard flex-fill ' + self.cardClass;
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
                var obs = self.getProfileObservables(profile);
                self.appState.jobList.selectItems(profile.data.job_catagory_keys, obs.jobNames);
                self.appState.causeList.selectItems(profile.data.cause_keys, obs.causeNames);
            }

        },
        template: require('./profile-collection.html'),
    });
}
