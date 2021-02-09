import { AppError } from "./app-error.js";

function getURLParameter(name) {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [null, ''])[1].replace(/\+/g, '%20')) || null;
}
export var getParams = function () {
	var params = {};
    var query = window.location.search.substring(1);
	var vars = query.split('&');
	for (var i = 0; i < vars.length; i++) {
		var pair = vars[i].split('=');
		params[pair[0]] = decodeURIComponent(pair[1]);
	}
	return params;
};
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
export function debugMode() {

    return document.cookie.split('; ').find(row => row.startsWith('debugmode')) != null;
}
export function subscribeFields(object,callback){
    //console.log("subscribing fields for ",object);
    for(var field in object){
        if( object.hasOwnProperty(field) &&  ko.isObservable(object[field])){
            //console.log("adding subscription for field "+field, object[field]());
            object[field].subscribe(callback);
        }
    }
}
export function browserVersion(){
    var ua= navigator.userAgent, tem, 
    M= ua.match(/(opera|chrome|safari|firefox|msie|trident(?=\/))\/?\s*(\d+)/i) || [];
    if(/trident/i.test(M[1])){
        tem=  /\brv[ :]+(\d+)/g.exec(ua) || [];
        return 'IE '+(tem[1] || '');
    }
    if(M[1]=== 'Chrome'){
        tem= ua.match(/\b(OPR|Edge)\/(\d+)/);
        if(tem!= null) return tem.slice(1).join(' ').replace('OPR', 'Opera');
    }
    M= M[2]? [M[1], M[2]]: [navigator.appName, navigator.appVersion, '-?'];
    if((tem= ua.match(/version\/(\d+)/i))!= null) M.splice(1, 1, tem[1]);
    return M.join(' ');
}
export function unsupportedBrowserCheck(){
    const version  = browserVersion();
    const badSafariVersions = [
        "Safari 9",
        "Safari 8",
        "Safari 7",
        "Safari 6",
        "Safari 5",
        "Safari 4",
        "Safari 3",
        "Safari 2",
        "Safari 1",
    ]
    if(badSafariVersions.indexOf(version) !== -1){
        return "This app works best on Safari version 11 or above. Some things may not look or function correctly.";
    }

    return false;
}

export {getURLParameter,
        downloadAsBlob,
        ensureFields,
        };