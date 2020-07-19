/**
 * INPUT params
 *      - bucketBase: prefix for any uploaded files. should not include a trailing '/'
 *      - token: JWT authorizaton token
 *      - filenameFilter: array of filenames to not show in file list
 * OUTPUT params
 *      - uploadAllFn: will be set to a function which will ensure all files are uploaded before returning
 * INPUT / OUTPUT params
 * 
 */

import * as utils from '../client-utils';

async function setFileList(fileList,token,filenameFilter){

    try{
        const files = await utils.postJson("/api/listUserFiles",{token: token});
        const filteredFiles= files.filter( (file) =>{
            return filenameFilter.indexOf(file.name) === -1; 
        });
        console.log("files response: ",filteredFiles);
        fileList(filteredFiles);
    }catch(error){
        console.error("failed to fetch list of user files",error);
        fileList([]);
    }
}

export function register(){
   ko.components.register('file-collection', {
       viewModel: function(params) {
            var self=this;
            var resolveUpload,rejectUpload;
            var uploadPromise;
            console.log("params: ",params);
            const bucketPrefix = ko.unwrap(params.bucketPrefix);
            self.fileList = ko.observableArray([]);
            self.token = params.token;
            var filenameFilter = ko.unwrap(params.filenameFilter).map(
                name => name.replace(bucketPrefix+"/","")
            );
            console.log("filename filters: ",filenameFilter);



            //uploadPromise = new Promise((resolve,reject) =>{
            //    resolveUpload= resolve;
            //    rejectUpload = reject;
            //});

            if(params.uploadAllFn != null){
                params.uploadAllFn(async() =>{
                    return await self.pond().processFiles();
                });
            }

            self.pond= ko.observable();

            setFileList(self.fileList,self.token(),filenameFilter);


            self.options = {
                filePondInit: function(pond){
                    self.pond(pond);
                },
                onprocessfiles: () => {
                    console.log("xx done processing all files");
                    //resolveUpload();
                },
                onerror: (error) => {
                    console.log("error processing files: ",error);
                    //rejectUpload(error);
                },
                allowMultiple:true,
                allowRevert: false,
                maxFiles: 10,
                maxFileSize: '10MB',
                imageResizeUpscale: false,
                imageResizeTargetWidth: 400,
                instantUpload: false,
            
                server: {
                    process: utils.pondProcessFn(bucketPrefix,self.token)
                }
            };
            self.removeFile= (file) =>{
                console.log("removing file ",file);
                alertify.confirm("Delete File","Are you sure you want to delete '"+file.name+"'?",
                    async () =>{
                        await utils.postJson("/api/removeUserFile",{filename:file.name,token:self.token()});
                        setFileList(self.fileList,self.token(),filenameFilter);
                    },() => {});
            };
        },
        template: require('./file-collection.html'),
    });
}