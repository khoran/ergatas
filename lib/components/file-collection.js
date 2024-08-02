/**
 * INPUT params
 *      - bucketPrefix: prefix for any uploaded files. should not include a trailing '/'
 *      - filenameFilter: array of filenames to not show in file list
 *      - server: object with authPostJson method 
 *      - userId: external user id. 
 *      - title: text for section title. If blank, no title HTMl will be displayed
 *      - readOnly: true for public display, false to allow owner to add/remove files
 *      - useMPKPrefix: if true, use new key format based on profile key. else use userId
 *      - missionary_profile_key
 * 
 */

import * as utils from '../client/client-utils';
//import * as uploaderUtils from '../upload';

async function setFileList(server,fileList,filenameFilter,prefix){

    try{
        const titleMaxWidth= 26;
        const args = {};
        const thumbPostfix="-ergatas-thumbnail.png";

        const files = await server.postJson("/api/listUserFiles",{prefix:prefix});

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
            const useMPKPrefix = ko.unwrap(params.useMPKPrefix);
            const readOnly = params.readOnly === true;
            const missionary_profile_key = ko.unwrap(params.missionary_profile_key);
            const userId = ko.unwrap(params.userId);
            //const bucketPrefix = ko.unwrap(params.bucketPrefix);
            var bucketPrefix;
            if(useMPKPrefix)
                bucketPrefix = "MPK"+missionary_profile_key;
            else
                bucketPrefix = userId;


            // if readOnly, no upload or delete options.
            self.withUploads=ko.observable( ! readOnly);
            self.selectedFile= ko.observable();

            self.fileList = ko.observableArray([]);
            var filenameFilter = ko.unwrap(params.filenameFilter).map(
                name => name.replace(bucketPrefix+"/","")
            );
            console.log("filename filters: ",filenameFilter);


            setFileList(self.server,self.fileList,filenameFilter,bucketPrefix);

            self.showUploader = async () =>{

                const uploaderUtils = await import(/* webpackChunkName: "uppy", webpackPrefetch: true*/ '../client/upload');
                
                const uppy = uploaderUtils.generalFileUploader(bucketPrefix) ;

                uppy.on('transloadit:complete', (assembly) => {
                    console.log("upload complete: ",assembly.results);

                    uppy.getPlugin('Dashboard').closeModal();
                    setFileList(self.server,self.fileList,filenameFilter,bucketPrefix);
                })

                uppy.getPlugin('Dashboard').openModal()
            };
            self.removeFile= (file) =>{
                console.log("removing file ",file);
                alertify.confirm("Delete File","Are you sure you want to delete '"+file.name+"'?",
                    async () =>{
                        await self.server.authPostJson("/api/removeUserFile", {
                                filename:file.name,
                                missionary_profile_key: useMPKPrefix ? missionary_profile_key:undefined,
                            });
                        setFileList(self.server,self.fileList,filenameFilter,bucketPrefix);
                    },() => {});
            };
        },
        template: require('./file-collection.html'),
    });
}