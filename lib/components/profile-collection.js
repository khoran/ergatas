/**
 *  INPUT
 *      - profiles: array of profile objects
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
        },
        template: require('./profile-collection.html'),
    });
}