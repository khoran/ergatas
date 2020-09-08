
//import '@uppy/robodog/dist/robodog.css';

//import robodog from '@uppy/robodog';
//window.robodog = robodog;


import '@uppy/core/dist/style.css'
import '@uppy/dashboard/dist/style.css'
import '@uppy/image-editor/dist/style.css'
import '@uppy/core/dist/style.css'
import '@uppy/webcam/dist/style.css'
import Uppy from '@uppy/core';
import Dashboard from '@uppy/dashboard';
import ImageEditor from '@uppy/image-editor';
import Transloadit from '@uppy/transloadit';
import GoogleDrive from '@uppy/google-drive';
import Dropbox from '@uppy/dropbox';
import Instagram from '@uppy/instagram';
import Facebook from '@uppy/facebook';
import OneDrive from '@uppy/onedrive';
import Webcam from '@uppy/webcam';
import ScreenCapture from '@uppy/screen-capture';



function buildUppy(uppyOptions,templateId,userId,inline){
    const uppy = new Uppy(uppyOptions);
    uppy.use(Dashboard,{
        inline:inline,
        metaFields: [
            { id: 'name', name: 'Name', placeholder: 'file name' },
        ],
    });
    uppy.use(ImageEditor,{
        target: Dashboard,
        quality: 0.8,
        cropperOptions:{
            aspectRatio:1,
        }
    });
    uppy.use(Transloadit,{
        providers: [ 'instagram', 'url', 'webcam', 'dropbox', 'google-drive', 'facebook', 'onedrive' ],
        waitForEncoding: true,
        fields:{
            userId: userId,
        },
        params: {
            // To avoid tampering, use Signature Authentication
            auth: { key: 'f5e160d453964b0485b61eb0f61a28ba' },
            template_id: templateId,
        },
    });

    uppy.use(GoogleDrive, { target: Dashboard, companionUrl: Transloadit.COMPANION, companionAllowedHosts: Transloadit.COMPANION_PATTERN})
    uppy.use(Dropbox, { target: Dashboard, companionUrl:  Transloadit.COMPANION,companionAllowedHosts: Transloadit.COMPANION_PATTERN })
    uppy.use(Instagram, { target: Dashboard, companionUrl:Transloadit.COMPANION,companionAllowedHosts: Transloadit.COMPANION_PATTERN })
    uppy.use(Facebook, { target: Dashboard, companionUrl: Transloadit.COMPANION,companionAllowedHosts: Transloadit.COMPANION_PATTERN })
    uppy.use(OneDrive, { target: Dashboard, companionUrl: Transloadit.COMPANION,companionAllowedHosts: Transloadit.COMPANION_PATTERN })
    uppy.use(Webcam, { target: Dashboard })
    uppy.use(ScreenCapture, { target: Dashboard })

    return uppy;

}

export function profileUploader(userId){

    const uppy = buildUppy({
        restrictions: {
            maxFileSize: 15*1024*1024, //15MB
            minFileSize: 0,
            maxNumberOfFiles: 1,
            minNumberOfFiles: 1,
            allowedFileTypes: ['image/*', '.jpg', '.jpeg', '.png' ],
        },
    }, '32a3dd9ec4be4a269ef1d19edabfa886',userId,false);
    return uppy;
}
export function generalFileUploader(userId){

    const maxUserFiles= process.env.MAX_USER_FILES || 10;
    const uppy = buildUppy({
        restrictions: {
            maxFileSize: 5*1024*1024, //5MB
            maxNumberOfFiles: maxUserFiles,
        },
    }, 'c09ca49bdc5041b5867f8af8b25b860c',userId,false);
    return uppy;
}
