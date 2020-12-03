/**
 * INPUT params
 *      - bucketPrefix: prefix for any uploaded files. should not include a trailing '/'
 *      - filenameFilter: array of filenames to not show in file list
 *      - DEPRECATED token: JWT authorizaton token, as an observable
 *      - server: object with postJson method and token field
 *      - userId: external user id. Either userId or token must be given
 *      - title: text for section title. If blank, no title HTMl will be displayed
 * 
 */

import * as utils from '../client-utils';
//import * as uploaderUtils from '../upload';

async function setFileList(server,fileList,filenameFilter,authType,authValue){

    try{
        const titleMaxWidth= 26;
        const args = {};
        const thumbPostfix="-ergatas-thumbnail.png";
        var files;

        if(authType==="token")
            files = await server.authPostJson("/api/listUserFiles");
        else if(authType ==="userId")
            files = await server.postJson("/api/listUserFiles",{userId:authValue});
        else{
            log.warn("invalid authType give in setFileList: "+authType);
            return;
        }

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
            self.title=params.title;
            self.server = params.server;
            console.log("params: ",params);
            const bucketPrefix = ko.unwrap(params.bucketPrefix);
            var authType,authValue;
            if(params.token == null && params.userId != null){
                authType="userId";
                authValue = params.userId;
            }else if(params.server != null && params.userId == null){
                authType="token";
                authValue = self.server.token;
            }


            //if not token given, but userId given, then just list
            // files, no upload or delete options.
            self.withUploads=ko.observable(authType === "token");
            self.selectedFile= ko.observable();

            self.fileList = ko.observableArray([]);
            var filenameFilter = ko.unwrap(params.filenameFilter).map(
                name => name.replace(bucketPrefix+"/","")
            );
            console.log("filename filters: ",filenameFilter);


            //console.log("current auth value: "+ko.unwrap(authValue), authValue);

            setFileList(self.server,self.fileList,filenameFilter,authType,ko.unwrap(authValue));

            self.showUploader = async () =>{

                const uploaderUtils = await import(/* webpackChunkName: "uppy", webpackPrefetch: true */ '../upload');
                
                const uppy = uploaderUtils.generalFileUploader(bucketPrefix) ;

                uppy.on('transloadit:complete', (assembly) => {
                    console.log("upload complete: ",assembly.results);

                    uppy.getPlugin('Dashboard').closeModal();
                    setFileList(self.server,self.fileList,filenameFilter,authType,ko.unwrap(authValue));
                })

                uppy.getPlugin('Dashboard').openModal()
            };
            self.removeFile= (file) =>{
                console.log("removing file ",file);
                alertify.confirm("Delete File","Are you sure you want to delete '"+file.name+"'?",
                    async () =>{
                        await self.server.authPostJson("/api/removeUserFile",{filename:file.name,});
                        setFileList(self.server,self.fileList,filenameFilter,authType,ko.unwrap(authValue));
                    },() => {});
            };
        },
        template: require('./file-collection.html'),
    });
}