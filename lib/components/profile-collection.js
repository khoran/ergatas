import * as utils from '../client-utils';
/**
 *  INPUT
 *      - profiles: array of profile objects
 *      - showMessageOnEmptyResult: true or false, default is true
 *      - appState: AppState object
 *      - containerSelector: css selector for container results are within
 */
export function register(){
    ko.components.register('profile-collection', {
        viewModel: function(params) {
            // Data: value is either null, 'like', or 'dislike'
            console.log("defining viewmodel for PROFILE-COLLECTION",params);
            this.utils = utils;
            this.profiles= params.profiles;
            this.da = params.appState.da;


            this.selectProfile =  data => params.appState.selectProfile(data);

            this.getOrganization = x => params.appState.getOrganization(x);
            this.jobNames = x => params.appState.jobCatagoryArray(x);

            this.pictureUrl =  x => params.appState.storage.profilePictureUrl(x);
            this.searchInProgress = params.appState.search.searchInProgress;
            this.showMessageOnEmptyResult = params.showMessageOnEmptyResult == null ? true : params.showMessageOnEmptyResult ;
            this.searchPageNumber = params.appState.search.searchPageNumber;
            this.containerSelector = params.containerSelector;

            var self=this;
            this.loadNextPage = function(){
                //console.log("loading next page" );
                self.searchPageNumber(self.searchPageNumber() + 1); 
            }
            this.donate = function(data){
                utils.donate(self.da,data,'summary');
            }

        },
        template: require('./profile-collection.html'),
    });
}