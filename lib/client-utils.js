import { AppError } from "./app-error";

function getURLParameter(name) {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [null, ''])[1].replace(/\+/g, '%20')) || null;
}
function postJson(url,data){
    return jQuery.ajax(url,{
        type: "POST",
        contentType: "application/json",
        data:JSON.stringify(data),
        dataType:"json",
    });
}
function pondProcessFn(bucketBase,token) {
    return async function (fieldName, file, metadata, load, error, progress, abort) {
        var bucketKey = bucketBase+"/"+file.name;
        console.log("bucket, token: ",bucketBase,token);

        var response= await postJson("/api/getSignedUrl",
                                {filename:file.name,token:token()});

        if(response.error != null){
            error(response.error);
        }else{
            var signedUrl=response.url;

            //for when you want to simulate an upload error
            //signedUrl = signedUrl+"XXX";

            var promise = jQuery.Deferred();
            const xhr = new XMLHttpRequest();
            xhr.open("PUT", signedUrl, true);
            xhr.upload.onprogress = function (e) {
                progress(e.lengthComputable, e.loaded, e.total);
            };
            xhr.onload = function() {
                var status = xhr.status;
                if (status >= 200 && status < 300) {
                    console.log("File is uploaded");
                    load(self.bucketBase+bucketKey);
                    promise.resolve(self.bucketBase+bucketKey);
                } else{
                    console.error("Something went wrong! status:",status);
                    promise.reject("upload failed with status "+status+" "+xhr.statusText);
                    error("Failed to upload file "+file.name+". "+xhr.responseText);
                }
            };
            xhr.onerror = function() {
                alertify.error("failed upload profile picture");
                promise.reject("upload failed with status "+xhr.status+" "+xhr.statusText);
            };
            xhr.setRequestHeader('Content-Type', file.type);
            xhr.send(file);
        }

        return {
            abort: function () {
                xhr.abort();
                abort();
            }
        };
    }
    
}
function downloadAsBlob(url){
    return new Promise((resolve,reject)=>{
        var xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'blob';
        xhr.onload = function(e) {
            if (this.status == 200) 
                resolve(this.response);
            else   
                reject(this.responseText);
        };
        xhr.send();
    });
}
function ensureFields(object,fieldNames){
    for(var i in fieldNames){
        if(object[fieldNames[i]] == null)
            throw new AppError("ensureFields: missing field "+fieldNames[i]);
    }
}
export {getURLParameter,
        postJson,
        downloadAsBlob,
        ensureFields,
        pondProcessFn};