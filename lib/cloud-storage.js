export class CloudStorage{
    constructor(bucketBase){
        this.bucketBase = bucketBase;
    }

    orgLogoUrl(urlPostfix){
        if(urlPostfix != null && urlPostfix != "")
            return this.bucketBase+urlPostfix;
        return "";
    };
    fullUrlToRelative(fullUrl){
        return fullUrl.replace(this.bucketBase,"");
    };
    profilePictureUrl(picture_url){
        var url;

        if(picture_url != null && picture_url !== "")
            url =  this.bucketBase +picture_url;
        else
            url = "/img/unknown_person.svg";

        //console.log("profile pic url. raw: "+picture_url+", final: "+url);
        return url;
    };
    async browseForProfilePicture(profile,userId,server){
        console.log("showing file picker",profile);

        const uploaderUtils = await import(/* webpackChunkName: "uppy", webpackPrefetch: true */ './upload');
        //const userId=viewModel.loggedInUser().external_user_id();
        const uppy = uploaderUtils.profileUploader(userId) ;
        //clear files
        uppy.getFiles().map( (file) =>{
            uppy.removeFile(file.id);
        });
        uppy.on('transloadit:complete', async (assembly) => {
            console.log("profile picture upload complete: ",assembly.results);
            var url;
            if(assembly.results && assembly.results.resize_image &&
                assembly.results.resize_image.length > 0 && assembly.results.resize_image[0].url != null){
                var url = assembly.results.resize_image[0].url;
                url = url.replace(/^http/,"https");// so it matches our bucketBase pattern
                var path = url.replace(this.bucketBase,"");
                console.log("uploaded profile picture path: ",path);

                //see if we have an old profile picture to remove first
                if(profile.picture_url() != null && profile.picture_url() != ""){                        
                    console.info("removing old profile picture: "+profile.picture_url());
                    try{
                        var filename = profile.picture_url().replace(/.*\//,"");
                        await server.authPostJson("/api/removeUserFile",{filename:filename});
                    }catch(error){
                        console.error("failed to remove old profile picture: "+error.message);
                    }
                }

                profile.picture_url(path);
                uppy.getPlugin('Dashboard').closeModal();
            }
          })
        uppy.getPlugin('Dashboard').openModal();
    }
}