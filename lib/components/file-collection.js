/**
 * INPUT params
 *      - bucketPrefix: prefix for any uploaded files. should not include a trailing '/'
 *      - filenameFilter: array of filenames to not show in file list
 *      - token: JWT authorizaton token, as an observable
 *      - userId: external user id. Either userId or token must be given
 * OUTPUT params
 *      - uploadAllFn: will be set to a function which will ensure all files are uploaded before returning
 * 
 */

import * as utils from '../client-utils';
import * as uploaderUtils from '../upload';

async function setFileList(fileList,filenameFilter,authType,authValue){

    try{
        const titleMaxWidth= 16;
        const args = {};
        const thumbPostfix="-ergatas-thumbnail.png";
        args[authType]=authValue;
        const files = await utils.postJson("/api/listUserFiles",args);
        const filteredFiles= files.filter( (file) =>{
            return filenameFilter.indexOf(file.name) === -1 
                    && file.name.indexOf(thumbPostfix) === -1 ;
        });
        console.log("files response: ",filteredFiles);
        const filesWithPreviews = filteredFiles.map((file) =>{
            //see if we can find a file with the thumbnail postfix
            const thumbFile = files.find( (f) =>{
                //remove extension
                const filename = file.name.replace(/\....$/,""); 
                return f.name === filename+".png"+thumbPostfix;
            });
            var title = file.name.replace(/\....$/,"");
            if(title.length >= titleMaxWidth)
                title = title.substring(0,titleMaxWidth-3)+"...";
            var obj = {
                original:file,
                image: file,
                title: title,
            }
            if(thumbFile != null)
                obj.image = thumbFile;

            return obj;

        });
        console.log("final file list: ",filesWithPreviews);
        //fileList(filteredFiles);
        fileList(filesWithPreviews);
    }catch(error){
        console.error("failed to fetch list of user files",error);
        fileList([]);
    }
}

export function register(){
   ko.components.register('file-collection', {
       viewModel: function(params) {
            var self=this;
            console.log("params: ",params);
            const bucketPrefix = ko.unwrap(params.bucketPrefix);
            var authType,authValue;
            if(params.token == null && params.userId != null){
                authType="userId";
                authValue = params.userId;
            }else if(params.token != null && params.userId == null){
                authType="token";
                authValue = params.token;
            }


            //if not token given, but userId given, then just list
            // files, no upload or delete options.
            self.withUploads=ko.observable(authType === "token");

            self.fileList = ko.observableArray([]);
            var filenameFilter = ko.unwrap(params.filenameFilter).map(
                name => name.replace(bucketPrefix+"/","")
            );
            console.log("filename filters: ",filenameFilter);


           // if(params.uploadAllFn != null){
           //     params.uploadAllFn(async() =>{
           //         return await self.pond().processFiles();
           //     });
           // }

           // self.pond= ko.observable();

            setFileList(self.fileList,filenameFilter,authType,ko.unwrap(authValue));


            //self.options = {
            //    filePondInit: function(pond){
            //        self.pond(pond);
            //    },
            //    onprocessfiles: () => {
            //        console.log("xx done processing all files");
            //        try{
            //            dataLayer.push({event: "file-upload",'file-upload-count':self.pond().getFiles().length});
            //        }catch(error){
            //            console.warn("failed to get file upload count or submit file-upload event",error);
            //        }
            //    },
            //    onerror: (error) => {
            //        console.log("error processing files: ",error);
            //    },
            //    allowMultiple:true,
            //    allowRevert: false,
            //    maxFiles: 10,
            //    maxFileSize: '10MB',
            //    imageResizeUpscale: false,
            //    imageResizeTargetWidth: 400, 
            //    instantUpload: false,
            
            //    server: {
            //        //this will only work for authType of 'token'
            //        process: utils.pondProcessFn(bucketPrefix,authValue)
            //    }
            //};
            self.showUploader = () =>{

                const uppy = uploaderUtils.generalFileUploader(bucketPrefix) ;

                uppy.on('transloadit:complete', (assembly) => {
                    // Could do something fun with this!
                    console.log("upload complete: ",assembly.results);

                    uppy.getPlugin('Dashboard').closeModal();
                    setFileList(self.fileList,filenameFilter,authType,ko.unwrap(authValue));
                })

                uppy.getPlugin('Dashboard').openModal()
            };
            self.removeFile= (file) =>{
                console.log("removing file ",file);
                alertify.confirm("Delete File","Are you sure you want to delete '"+file.name+"'?",
                    async () =>{
                        await utils.postJson("/api/removeUserFile",{filename:file.name,token:ko.unwrap(authValue)});
                        setFileList(self.fileList,filenameFilter,authType,ko.unwrap(authValue));
                    },() => {});
            };
        },
        template: require('./file-collection.html'),
    });
}