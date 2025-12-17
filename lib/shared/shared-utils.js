/** functions that can be imported by server and client
 * 
 */

import { AppError } from "../server/app-error.js";

export function allCountries(){
   const countryUrl= '/country_data.json';
   return jQuery.get(countryUrl);
   

}
export function ensureFields(object,fieldNames){
    for(var i in fieldNames){
        if(object[fieldNames[i]] == null)
            throw new AppError("ensureFields: missing field "+fieldNames[i]);
    }
}
export function randomIntBetween(min,max){
    return Math.floor(Math.random() * (max - min) + min);
}
export function rankedMatches(query,data,fields){
    var pattern = new RegExp(query,"i");

    console.local("ranking matches for query "+query+", fields: ",fields);

    return Object.values(data).map( item =>{
        //console.local("considering item ",item);
        return fields.map( field => {
            var match = item[field].match(pattern);
            if(match == null)
                return null;
            //console.local("found match ",match);
            return {
                index: match.index,
                fieldLength: item[field].length,
                input: match.input,
                item: item,
            };
        }).filter( x =>{
            //if(x != null)
                //console.local(" match: ",x);
            return x != null
        }). //remove non-matches
           reduce( (accumulator,currentValue ) =>{ //keep the match closest to start of field
                var result;
                if( accumulator.item != null  && accumulator.index < currentValue.index){
                    result = accumulator;
                }else   
                    result = currentValue;

                result.numMatches = (accumulator.numMatches || 0) + 1;
                return result;
            },{}); // return one object
    } ).filter( x =>{
        //if(x.item != null){
            //console.local("final match: ",x);
        //}
        return x.item != null; //the reduce returns the initial value when there were no matches
    }).sort( (a,b) =>{

            if(a.index < b.index) return -1;
            if(a.index > b.index) return 1;
            //else index is equal, sort on fieldLength
            if(a.fieldLength < b.fieldLength) return -1;
            if(a.fieldLength > b.fieldLength) return 1;
            //else reverse sort on the number of fields that had a match
            if(a.numMatches > b.numMatches) return -1;
            if(a.numMatches < b.numMatches) return 1;
            // then sort alphabetically on input
            if(a.input < b.input) return -1;
            if(a.input < b.input) return 1;
            return 0;
        })
        .map( x => x.item);

}

/**
 * urlBase64ToUint8Array
 * 
 * @param {string} base64String a public vavid key
 */
export function urlBase64ToUint8Array(base64String) {
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64 = (base64String + padding)
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    var rawData = window.atob(base64);
    var outputArray = new Uint8Array(rawData.length);

    for (var i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}
 
/**
 * Extract a slug from the current URL.
 * If the passed value is a Knockout observable it will be unwrapped.
 * Returns the first path segment (no leading/trailing slashes) or null.
 */
export function getURLSlug(){
    return window.location.pathname.replace("/",""); //remove first /
    //let slug = null;
    //try{
    //    if(typeof window !== 'undefined' && window.location && window.location.pathname)
    //        slug = window.location.pathname.replace(/^\/+|\/+$/g,'').split('/')[0];
    //    if(slug && slug.indexOf('/') !== -1)
    //        slug = slug.split('/')[0];
    //}catch(e){
    //    slug = null;
    //}
    //return slug;
}
export function hydrateWikiPage(jQuery,page,doc=null){
    // page contains fields: title, body, sidebar (all HTML strings), asign to 
    // html elements by id.
    function getEl(id){
        if(doc) 
            return doc.find("#"+id); 
        else 
            return jQuery("#"+id);
    }

    if(page.sidebar)
        getEl("fullwidth").remove();
    else
        getEl("with-sidebar").remove();

    if(page.title)
        getEl("title").text(page.title);
    if(page.body)
        getEl("body").html(page.body);
    if(page.sidebar)
        getEl("sidebar").html(page.sidebar);
}
export function ageGroupsToBirthYears(ageGroups){
    var years = [];
    var currentYear = new Date().getFullYear();
    console.log("converting age groups to birth years ",ageGroups);
    ageGroups.forEach(group =>{
        var range = group.split("-");
        var start, end;
        var givenYears;
        try{
            start = parseInt(range[0]);
            end = parseInt(range[1]);
            givenYears = [...Array(end-start+1)].map((_, i) => currentYear - (start + i) );
            years = years.concat(givenYears);

        }catch(error){
            console.warn("error while convering age groups to birth years for group "+group,error);
        }
    });
    console.log("final birth years: ",years);
    return years;
};


export function searchParamsFromJson(searchFilter){
    const fieldsToCast = ["job_catagory_keys","organization_keys",
                          "movement_stages","cultural_distances",
                          "cause_keys","tag_keys"]
    const peopleGroups = new Set();
    const params = {};

    for (const [key,value] of Object.entries(searchFilter)){
        console.log("adding field "+key+", with value "+value);
        
        if(key === "ageGroups"){
            params.birth_years = ageGroupsToBirthYears(value).
                                            map( x =>parseInt(x));
        } else if(key === "pgSets"){
            //for each 'set' in pgSets, add all people group ids to extraPGs unique set
            if(value != null){
                Object.values(value).forEach( set =>{
                    set.forEach( id => peopleGroups.add(id));
                })
            }
        } else if( fieldsToCast.indexOf(key) !== -1 ){
            //cast values to int
            params[key] = value.map( x =>parseInt(x));
        }else
            params[key] = value;
    }
    //do this at end so we know people_id3_codes will have been set, if any was present
    var arr = Array.from(peopleGroups.values());
    if(arr.length > 0){
        if(params.people_id3_codes == null)
            params.people_id3_codes =  arr;
        else   
            params.people_id3_codes = params.people_id3_codes.concat(arr);
    }

    console.log("final params: ",params);
    return params;
}

export async function getProfilesForFilter(da,savedSearch){
    //console.log("saved search: ",savedSearch);
    const params = searchParamsFromJson(savedSearch);
    var searchResults = await da.primarySearch(params,1000000,"rank,desc",false,true)
    //console.log("primary search results: ",searchResults);
    return searchResults.first_page;
}

export function writeQif(transactions, writeFn) {
  var params = {
    output: writeFn,
    type: 'Cash'
  };

  function write() {
    for (var i = 0; i < arguments.length; i++) {
      params.output(arguments[i] + '');
    }
  }

  write('!Type:', params.type, '\n');
  for (var i = 0; i < transactions.length; i++) {
    var txn = transactions[i];

    write('D', txn.date, '\n');
    write('T', txn.amount, '\n');
    if (txn.payee) {
      write('P', txn.payee, '\n');
    }
    if (txn.memo) {
      write('M', txn.memo, '\n');
    }
    if (txn.category) {
      write('L', txn.category, '\n');
    }
    if (txn.splits) {
      var totalSplits = 0;
      for (var j = 0; j < txn.splits.length; j++) {
        var split = txn.splits[j];
        totalSplits += split.amount;
        write('$', split.amount, '\n');
        if (split.category) {
          write('S', split.category, '\n');
        }
        if (split.memo) {
          write('E', split.memo, '\n');
        }
      }
      if (totalSplits != txn.amount) {
        console.log(totalSplits, txn.amount);
        throw new Error('Total amount and sum of splits is not the same');
      }
    }
    write('^\n');
  }
}
