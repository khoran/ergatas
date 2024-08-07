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

