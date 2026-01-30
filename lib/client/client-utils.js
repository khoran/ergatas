import { AppError } from "../server/app-error.js";
import alertify from 'alertifyjs';
import {sanitizeHtml} from './sanitize';


export const movements=[
            "No Purposeful Plan Yet",
            "Moving Purposefully (Gen 1)",
            "Focused (Gen 2)",
            "Breakthrough (G3)",
            "Emerging CPM (Gen 4)",
            "Church Planting Movement",
            "Sustained CPM",
            "Multiplying CPMs",
        ];
export const cultural_distances=[
            "Same",
            "Similar",
            "Foreign",
            "No Direct Contact",
        ];

export function getURLParameter(name) {
    return decodeURIComponent((new RegExp('[?|&]' + name + '=' + '([^&;]+?)(&|#|;|$)').exec(location.search) || [null, ''])[1].replace(/\+/g, '%20')) || null;
}
export function downloadAsBlob(url){
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

export function organizationDisplayName(org){
    var display=this.reCapitalize(org.name);
    if(org.dba_name != null && org.dba_name !== ""){
        display=org.dba_name;
    }

    return display;
};
export function reCapitalize(words){
   if(words != null)
      return words.toLowerCase().trim().split(/\s+/).
         map((word) => word[0].toUpperCase() + word.slice(1)).
         join(" ");
   else
      return words;
};
export function organizationRegisteredName(org){
    if(org.dba_name != null && org.dba_name !== ""){
        return "(registered as "+org.name+")";
    }
    return "";
}
export function urlRootDomain(urlStr){
    const rootPattern = /^.*?([a-zA-Z0-9-]+\.[a-zA-Z0-9-]+)$/;
    var url;
    try{
        url=new URL(urlStr);
        return url.hostname.replace(rootPattern,"$1");
    }catch(error){
        console.warn("failed to parse url: "+urlStr,error);
        return urlStr;
    }
};


alertify.dialog("donatePopup",function(){},true,'alert');
function displayDonatePopup(da,missionary_profile_key, donation_url,instructions,ownProfile){
    var dialogContent;


    //should be passed in now
    if(ownProfile == null) console.error("PASS ownProfile VALUE FOR donate popup !!!!!!!!!!!!!!!!");
    console.log("ownProfile ? "+ownProfile);

    dialogContent = jQuery("<donate-popup params=\"donationUrl:'"+donation_url+"',"+
                            "instructions: instructions,"+
                            "ownProfile: ownProfile,"+
                            " missionary_profile_key: "+missionary_profile_key+" ,da:da \"></donate-popup>");

    ko.applyBindings({
            da:da, 
            ownProfile:ownProfile,
            instructions: (instructions || "").trim(),
        },dialogContent[0]);

    alertify.donatePopup("").set({
            transition: "zoom",
            basic: true,
        }).
        setContent(dialogContent[0]).
        resizeTo("30%","50%");
};
export function isOwnProfile(userProfile,missionary_profile_key){

    return userProfile && (ko.unwrap(userProfile.missionary_profile_key) === missionary_profile_key);
}
export function donate(da,profile,source,ownProfile){
    console.log("donate button clicked ",da,profile);
    dataLayer.push({event:'donate',
                'donate-event-source':source,
                missionary_profile_key:profile.missionary_profile_key,
                'donate-level':1});//,user_id: viewModel.userId()});

    displayDonatePopup(da,profile.missionary_profile_key,
                        profile.data.donation_url,
                        profile.data.donate_instructions,
                        ownProfile);

};
export function donatePreview(url,instructions){
    displayDonatePopup(null,0,url,instructions,true);
};

export function birthYearsToAges(years){
    var ages = [];
    var currentYear = new Date().getFullYear();
    return years.map(year => currentYear - parseInt(year)).sort((a,b)=>{                
        if(a < b) return -1;
        else if(b < a) return 1;
        else return 0;
    } );
};
export function flagProfile(profile){
    alertify.prompt("Report Profile","If this profile is inappropriate in some way, please let us know why."+
        " Ergatas will review this information, but you will remain anonymous.",
        "",
        function(evt,message){
            console.warn("PROFiLE FLAGGED  /"+getProfileUrl(profile),message);
            alertify.success("Thanks, someone will review this profile shortly");
        },function(){}).set("labels",{ok:"Submit"});
};
    
export function scrollToFn(selector){
    return function(){
        jQuery([document.documentElement, document.body]).
            animate({
                    scrollTop: $(selector).offset().top
            }, 300);
    }

}
export {sanitizeHtml};

export function displayNumResults(num){
    // run through parseFloat so we can accept strings or numbers as input
    var asFloat = parseFloat(num);
    if(isNaN(asFloat))
        return num;
    
    return asFloat.toLocaleString();
}
export function selectedKeys(selectedKeys, keyLookup,keyField,nameField,keysAsInt=true){
    if(selectedKeys == null){
        return [];
    }
    return selectedKeys.map(function(key){
        if(keysAsInt)
            key = parseInt(key);
        return keyLookup.find(function(item){
            return item[keyField] === key;
        });
    }).sort((a,b) =>{
        if(a[nameField].toLowerCase() < b[nameField].toLowerCase()) return -1;
        if(a[nameField].toLowerCase() > b[nameField].toLowerCase()) return 1;
        return 0;
    });;
    
}
export function selectedKeysAsArray(selectedKeys, keyLookup,keyFieldName,nameFieldName,asObject){
    if(selectedKeys == null){
        return [];
    }
    return selectedKeys.map(function(key){
        var item;
        key = parseInt(key);
        item=keyLookup.find(function(item){
            return item[keyFieldName] === key;
        });
        if(item!=null){
            if(asObject === true)
                return {
                    name: item[nameFieldName],
                    key: key,
                } ;
            else
                return item[nameFieldName];
        }else 
            return undefined;
    }).sort((a,b) =>{
        if(asObject === true){
            if(a.name < b.name) return -1;
            else if (a.name > b.name) return 1;
            else return 0;
        }else{
            if(a < b) return -1;
            else if (a > b) return 1;
            else return 0;
        }
    });
};
export function computePageSize(){
    //get a rough idea of how many cards will fit on a screen
    const wh = $(window).height();
    const ww = $(window).width();
    const cardArea = 370 * 276; //profile card area, only needs to be aprroximate
    const unusedScreenArea = 500 * ww;
    const numCards = Math.ceil((wh*ww - unusedScreenArea) / cardArea) + 10;
    //console.log("num cards per page: "+numCards);
    return numCards;
}

export function getCurrentRootPage(appBase){
    return window.location.pathname.replace(appBase,"").replace(/\/.*/,"");
}
export function watchChanges(name,obs){
    obs.subscribe(function(oldValue){
        console.log(name+" -------------- Obs old value: "+oldValue);
    },null,"beforeChange");

    obs.subscribe(function(newValue){
        console.log(name+" -------------- Obs new value: "+newValue);
    });
}

export function arrayEquals(a, b) {
  return Array.isArray(a) &&
    Array.isArray(b) &&
    a.length === b.length &&
    a.every((val, index) => val === b[index]);
}
export function peopleGroupSearch(server,query,spinnerObs,limit=100){
    return joshuaProjectSearch(server,"peopleGroupSearch",query,spinnerObs,limit);
}
export function peopleGroupNames(server,peopleID3Codes,spinnerObs){
    return joshuaProjectNames(server,"peopleGroupNames",peopleID3Codes,spinnerObs);
}

export function languageSearch(server,query,spinnerObs,limit=100){
    return joshuaProjectSearch(server,"languageSearch",query,spinnerObs,limit);
}
export function languageNames(server,rol3Codes,spinnerObs){
    return joshuaProjectNames(server,"languageNames",rol3Codes,spinnerObs,false);
}


export function joshuaProjectSearch(server,endpoint,query,spinnerObs,limit){

    if(query !=  null && query.length >= 3 ){
        if(spinnerObs) spinnerObs(true)
        return server.postJson("/api/"+endpoint,{
                query:query ,
                limit:  limit,
            }).fail( error =>{
                console.error(endpoint+" query failed: "+error.message,error);
            }).always(() =>{
                if(spinnerObs) spinnerObs(false)
            });
    }else 
        return Promise.resolve([]);
}
export function joshuaProjectNames(server,endpoint,codes,spinnerObs,castToInt=true){
    if(  Array.isArray(codes)){
        if(spinnerObs) spinnerObs(true);
        return server.postJson("/api/"+endpoint,{
                codes: codes.map(x => castToInt ?  parseInt(x) : x )
            }).always(() =>{
                if(spinnerObs) spinnerObs(false)
            });
    }else
        return Promise.resolve([]);
    
}
export function peopleGroupSelectizeOptions(server,spinnerObs,initValuesObs){
    return {
        create: false,
        valueField: "PeopleID3",
        labelField:"PeopNameInCountry",
        plugins:['remove_button'],
        maxItems:10,
        loadingClass: "", //remove default of 'loading'
        searchField: ["PeopNameAcrossCountries","PeopNameInCountry","PeopleCluster"],
        load: function(query,callback){
            peopleGroupSearch(server,query,spinnerObs,200).then( callback);
        },
        render:{
            option: function(data){
                return "<div class='people-group-item'><div>"+data.PeopNameInCountry+"</div>"+
                            "<div class='people-group-cluster'><b>Cluster:</b> "+
                            data.PeopleCluster+"</div></div>";
            }
        },
        onInitialize: function(){
            var api = this;
            var initValue = initValuesObs();
            if(initValue != null && ( ! Array.isArray(initValue) || initValue.length > 0) ){
                peopleGroupNames(server,initValuesObs(),spinnerObs).
                    then( (results) =>{
                        console.log("people groups initial option names: ",results);
                        ko.bindingHandlers.selectize.utils.setOptions(api,results);
                        if(initValuesObs() != null)
                            ko.bindingHandlers.selectize.utils.setItems(api,initValuesObs);
                    })
            }
        },
        onObsUpdate: function(api, value){
            api.clear(true);
            ko.bindingHandlers.selectize.utils.setItems(api,value);
        },
    };
}
export function languageSelectizeOptions(server,spinnerObs,initValuesObs){
    return {
        create: false,
        valueField: "ROL3",
        labelField:"Language",
        plugins:['remove_button'],
        maxItems:10,
        loadingClass: "", //remove default of 'loading'
        searchField: ["Language"],
        load: function(query,callback){
            languageSearch(server,query,spinnerObs,200).then( callback);
        },
        render:{
            option: function(data){
                return "<div class='language-item'>"+data.Language+"</div>";
            }
        },
        onInitialize: function(){
            var api = this;
            var initValue = initValuesObs();
            if(initValue != null && ( ! Array.isArray(initValue) || initValue.length > 0) ){
                languageNames(server,initValuesObs(),spinnerObs).
                    then( (results) =>{
                        console.log("languages initial option names: ",results);
                        ko.bindingHandlers.selectize.utils.setOptions(api,results);
                        if(initValuesObs() != null)
                            ko.bindingHandlers.selectize.utils.setItems(api,initValuesObs);
                    })
            }
        },
        onObsUpdate: function(api, value){
            api.clear(true);
            ko.bindingHandlers.selectize.utils.setItems(api,value);
        },
    };
}

export function contactMissionaryFn(external_user_id,server){
    return async function(name, email,message){
        console.log("sending message to missionary...");
        try{
            if(email != null && name != null && message != null && message != "")
                await server.postJson("/api/contact/setup",{
                    fromEmail: email,
                    name: name,
                    message: message,
                    profileUserId: external_user_id,
                });
                dataLayer.push({event:'message-to-missionary',user_id: external_user_id});
                alertify.success("Message away!");
        }catch(error){
            console.error("failed to send contact message to server: "+error.message,error);
            alertify.error("Failed to send message, terribly sorry about that!");
        }
    }
};

export function normalizeVideoURL(givenURL){
    var id;

    if(givenURL.includes("vimeo")){
        let [id1,id2] = vimeoID(givenURL);
        return `https://player.vimeo.com/video/${id1}?h=${id2}`;
    }else if(givenURL.includes("youtube.com") || givenURL.includes("youtu.be")){
        id = youtubeVideoID(givenURL);
        return `https://www.youtube.com/embed/${id}?rel=0`;
    }else if(givenURL.includes("loom.com") ){
        id = loomID(givenURL);
        return `https://www.loom.com/embed/${id}`;
    }

}


function youtubeVideoID(url){
    var regExp = /^.*(?:(?:youtu\.be\/|v\/|vi\/|u\/\w\/|shorts\/|embed\/)|(?:(?:watch)?\?v(?:i)?=|\&v(?:i)?=))([^#\&\?]*).*/;
    var match = url.match(regExp);
    return (match && match[1]) || "";
}
function vimeoID(url){
    //https://vimeo.com/1073688664/2882f9b645?share=copy
    //https://player.vimeo.com/video/1073688664?h=2882f9b645
    var regExp = /(https?:\/\/)?(www\.)?(player\.)?vimeo\.com\/?(showcase\/|video\/)*([0-9]+)(\/([0-9a-z]+))?(?:\?.*?h=([0-9a-z]+))?[?]?.*/;
    var match = url.match(regExp);
    console.log("vimeoID url: "+url+", matches: ",match);
    return match ? [match[5], match[7] || match[8]].filter(Boolean) : [];
}
function loomID(url){
    //http://loom.com/share/53f933117b0040c68e8ac18300bdabf0
    //https://www.loom.com/embed/c263e17b7827411e85282540c615afff
    var regExp = /(https?:\/\/)?(www\.)?loom\.com\/(share|embed)\/([0-9a-zA-Z]+)/;
    var match = url.match(regExp);
    console.log("loomID url: "+url+", matches: ",match);
    return (match && match[4]);
}
export function getRandomInt(max) {
  return Math.floor(Math.random() * max);
}
export function setErrorOnElement(element,validationErrorClass,message){
  var $element  = jQuery(element);
  var container = $element.parents(".contains-validation-message");
  var errorEl = container.find(`.`+validationErrorClass)[0] || createErrorEl(element,validationErrorClass);
  var haveError = message != null && message !== "";

  $element.toggleClass("error",haveError);
  if(haveError){
    errorEl.textContent = message;
    jQuery(errorEl).show();
  }
  else
    jQuery(errorEl).hide();


}
function createErrorEl(element,validationErrorClass){
  var errorEl  = document.createElement('div');
  errorEl.className=validationErrorClass;
  element.parentNode.insertBefore(errorEl,element);
  return errorEl;
}

/**
 * 
 * @param {*} time  should look like "HH:MM"
 * @param {*} f 
 */
export function scheduleFunction(time, f) {

    // get hour and minute from hour:minute param received, ex.: '16:00'
    const hour = Number(time.split(':')[0]);
    const minute = Number(time.split(':')[1]);

    // create a Date object at the desired timepoint
    const startTime = new Date(); startTime.setHours(hour, minute);
    const now = new Date();

    // increase timepoint by 24 hours if in the past
    if (startTime.getTime() <= now.getTime()) {
      startTime.setHours(startTime.getHours() + 24);
    }

    // get the interval in ms from now to the timepoint when to trigger the alarm
    const firstTriggerAfterMs = startTime.getTime() - now.getTime();

    console.log(`scheduling function. given time: ${time}, understood time: ${startTime}, offset: ${firstTriggerAfterMs} `)

    // trigger the function f() at the timepoint
    // create setInterval when the timepoint is reached to trigger it every day at this timepoint
    setTimeout(function(){
      f();
      setInterval(f, 24 * 60 * 60 * 1000);
    }, firstTriggerAfterMs);

  }

export function quickSearchFn(appState,filterName,keyField,asArray=false){
      return function(data){
          appState.search.setSearch(filterName,
              asArray ? [data[keyField]] : data[keyField]);
          appState.router.navigateTo('search');
      }
  }

export function onObsUpdate(api, value){
    //console.log("new value set on observable: ",value());
    api.clear(true);
    ko.bindingHandlers.selectize.utils.setItems(api,value);
}
 

export function jobSelectizeOptions(jobCatagories,initialItems){
    return defaultSelectizeOptions(jobCatagories,initialItems,"job_catagory_key","catagory","catagory");
}
export function tagSelectizeOptions(tags,initialItems){
    return defaultSelectizeOptions(tags,initialItems, "tag_key","name","name" );
}
export function causeSelectizeOptions(causes,initialItems){
    return defaultSelectizeOptions(causes,initialItems,"cause_key","cause","cause");
}
function defaultSelectizeOptions(keys,initialItems,valueField,labelField,searchField){
    return {
                create:false,
                valueField: valueField,
                labelField:labelField,
                searchField: searchField,
                plugins:['remove_button'],
                maxItems:10,
                //closeAfterSelect: true,
                onInitialize: function(){
                    var api=this;
                    ko.bindingHandlers.selectize.utils.setOptions(api,keys);
                    ko.bindingHandlers.selectize.utils.watchForNewOptions(api,keys);
                    if(initialItems != null)
                        ko.bindingHandlers.selectize.utils.setItems(api,initialItems);
                },
                onObsUpdate: self.onObsUpdate
            };
}
export function fixedItemsSelectizeOptions(initialItems,closeAfterSelect=false){
    return  {
            maxItems: 10,
            plugins:['remove_button'],
            closeAfterSelect: closeAfterSelect,
            onInitialize: async function() {
                var api = this;
                if(initialItems != null)
                    ko.bindingHandlers.selectize.utils.setItems(api,initialItems);
            },
            onObsUpdate: self.onObsUpdate
        };
}
export function selectedPeopleGroupSets(search){
    return Object.keys(search.filter.pgSets.obs()() || {});
}
export function peopleGroupSetSize(setName,search){
    var sets = search.filter.pgSets.obs()();
    if(sets != null && sets[setName] != null)
        return displayNumResults(sets[setName].length)
    return 0;
}
export function deletePeopleGroupSet(setName,search){
    var sets = search.filter.pgSets.obs()();
    delete sets[setName];
    if( sets != null && Object.values(sets).length === 0)
        sets = undefined;
    search.filter.pgSets.obs()(sets);
}
export function getSearchNameFromURL(){

    var url = new URL(window.location);
    // Match either /search/saved/<searchName> or /search/saved/<user_key>/<searchName>
    // user_key (search_key) is expected to be an integer when present.
    var match = /^\/search\/saved\/(?:\d+\/)?([-a-zA-Z0-9"' ]+)/.exec(decodeURI(url.pathname));
    console.log("search name match from URL: ",match,url);
    if(match != null && match.length >= 2)
        return match[1];
    return null;
}

export function pageStats(server,missionary_profile_key){
    return server.postJson("/api/profileStats",
        { missionary_profile_key: missionary_profile_key});
}

export function donationMethods(profile){

    //TODO: eventually we can check here for non-USA countries
    // and set them to 'agency' only so we don't process those donations
    if(ko.unwrap(profile.on_site_donation) === false 
       || (profile.data && ko.unwrap(profile.data.on_site_donation) === false)){
        return "agency";
    }else
        return "both";
}
export async function checkForInvites(appState){
    console.log("Checking for invitations");
    const response = await appState.da.getProfileInvitations();
    if(response != null){
        console.log("found invites: ",response);
        await appState.server.authPostJson("/api/claimProfile");
    }else //no invites found
        console.log("no invitations found");
}
export function getProfileUrl(profile){
    let slug = ko.unwrap(profile.profile_slug);
    if(slug){
        return 'worker/'+slug;
    }else{
        return 'profile-detail/'+ko.unwrap(profile.missionary_profile_key);
    }
}
export function getUserFavoritesLazy(user,da){
    let userFavorites = ko.observable([]);
    getUserFavorites(user,da).then(userFavorites);
    return userFavorites;
}   
export async function getUserFavorites(user,da){
    if(user == null){
        return [];
    }
    var savedSearch = await da.getSavedSearchesByName(user.user_key(),"Favorites");

    if(savedSearch == null 
        || savedSearch.data == null 
        || savedSearch.data.params == null 
        || ! Array.isArray(savedSearch.data.params.missionary_profile_keys)){
        return [];
    }else{
        return savedSearch.data.params.missionary_profile_keys.map(k => parseInt(k));
    }
}
export function isFavorite(profile,userFavorites){
    return ko.computed(() => {
            return userFavorites().indexOf(profile.missionary_profile_key) !== -1;
        });
}