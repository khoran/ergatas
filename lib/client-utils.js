import { AppError } from "./app-error.js";

function getURLParameter(name) {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [null, ''])[1].replace(/\+/g, '%20')) || null;
}
//function postJson(url,data,updateTokenFn){
//    return jQuery.ajax(url,{
//        type: "POST",
//        contentType: "application/json",
//        data:JSON.stringify(data),
//        dataType:"json",
//    }).catch((error) =>{
//        if(updateTokenFn != null && error.status === 401){
//            return utils.postJson("/api/refresh").
//                then((result) =>{
//                    updateTokenFn(tokenResult);
//                    return postJson(url,data);
//                });
//        }else
//            throw error;
//    });
//}
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
        downloadAsBlob,
        ensureFields,
        };