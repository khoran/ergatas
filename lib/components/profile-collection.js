/**
 *  INPUT
 *      - profiles: array of profile objects
 *      - showMessageOnEmptyResult: true or false, default is true
 *      - controls: object of functions
 *          - selectProfile
 *          - getOrganization
 *          - jobNames
 *          - fileUrlBase
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
            this.showMessageOnEmptyResult = params.showMessageOnEmptyResult == null ? true : params.showMessageOnEmptyResult ;
        },
        template: require('./profile-collection.html'),
    });
}