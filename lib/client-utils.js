import { AppError } from "./app-error.js";

function getURLParameter(name) {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [null, ''])[1].replace(/\+/g, '%20')) || null;
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
 /**
 * Return the current style for an element.
 * @param {HTMLElement} elem The element to compute.
 * @param {string} prop The style property.
 * @returns {number}
 */
function computeStyle(elem, prop) {
    if (!window.getComputedStyle) {
        window.getComputedStyle = function(el, pseudo) {
            this.el = el;
            this.getPropertyValue = function(prop) {
                var re = /(\-([a-z]){1})/g;
                if (prop == 'float') prop = 'styleFloat';
                if (re.test(prop)) {
                    prop = prop.replace(re, function () {
                        return arguments[2].toUpperCase();
                    });
                }
                return el.currentStyle && el.currentStyle[prop] ? el.currentStyle[prop] : null;
            }
            return this;
        }
    }

    return window.getComputedStyle(elem, null).getPropertyValue(prop);
}

/**
 * Returns the maximum number of lines of text that should be rendered based
 * on the current height of the element and the line-height of the text.
 */
export function getMaxLines(height,element) {
    var availHeight = height,
        lineHeight = getLineHeight(element);

    console.log(`getMaxLines: height=${height}, availHeight=${availHeight}, lineHeight=${lineHeight}`);
    return Math.max(Math.floor(availHeight/lineHeight), 0);
}

/**
 * Returns the maximum height a given element should have based on the line-
 * height of the text and the given clamp value.
 */
export function getMaxHeight(clmp,element) {
    var lineHeight = getLineHeight(element);
    return lineHeight * clmp;
}

/**
 * Returns the line-height of an element as an integer.
 */
function getLineHeight(elem) {
    var lh = computeStyle(elem, 'line-height');
    if (lh == 'normal') {
        // Normal line heights vary from browser to browser. The spec recommends
        // a value between 1.0 and 1.2 of the font size. Using 1.1 to split the diff.
        lh = parseInt(computeStyle(elem, 'font-size')) * 1.2;
    }
    return parseInt(lh);
}



export {getURLParameter,
        downloadAsBlob,
        ensureFields,
        };