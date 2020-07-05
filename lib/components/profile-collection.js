export function registerProfileCollection(){
    ko.components.register('profile-collection', {
        viewModel: function(params) {
            // Data: value is either null, 'like', or 'dislike'
            console.log("defining viewmodel for PROFILE-COLLECTION",params);
            this.profiles= params.profiles;
        },
        template: {fromUrl: "profile-collection"},
    });
}