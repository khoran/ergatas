/**
 *  INPUT
 *      - profiles: array of profile objects
 *      - showMessageOnEmptyResult: true or false, default is true
 *      - controls: object of functions
 *          - selectProfile
 *          - getOrganization
 *          - jobNames
 *          - fileUrlBase
 *          - searchInProgress - should be an observable
 */
export function register(){
    ko.components.register('profile-collection', {
        viewModel: function(params) {
            // Data: value is either null, 'like', or 'dislike'
            console.log("defining viewmodel for PROFILE-COLLECTION",params);
            this.profiles= params.profiles;
            this.selectProfile = params.controls.selectProfile;
            this.getOrganization = params.controls.getOrganization;
            this.jobNames = params.controls.jobNames;
            this.pictureUrl = params.controls.pictureUrl;
            this.searchInProgress = params.controls.searchInProgress;
            this.showMessageOnEmptyResult = params.showMessageOnEmptyResult == null ? true : params.showMessageOnEmptyResult ;
            this.searchPageNumber = params.controls.searchPageNumber;
            this.containerSelector = params.containerSelector;

            var self=this;
            this.loadNextPage = function(){
                //console.log("loading next page" );
                self.searchPageNumber(self.searchPageNumber() + 1); 
            }

        },
        template: require('./profile-collection.html'),
    });
}