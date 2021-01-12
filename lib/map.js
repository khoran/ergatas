

var platform;
var inProgressPromise;
const mapAPIKey = process.env.HERE_MAP_API_KEY;
const timeout = 20*1000; // 20 seconds

function testForPlatform(){
    try{
        return window.H != null && window.H.service != null && window.H.service.Platform != null;
    }catch{
        return false;
    }
}
function initPlatform(resolve,reject,startTime){
    const now = new Date();
    if(testForPlatform()){
        platform =new H.service.Platform({ 'apikey': mapAPIKey });
        testCountryShape();
        resolve(platform);
        console.log("created platform after "+((now-startTime)/1000)+"s: ",platform);
    }else if(now-startTime > timeout){
        const message="Failed to load map after "+((now-startTime)/1000)+"sec";
        console.warn(message);
        reject(message);
    }else{
        console.log("waiting for Platform to become available");
        setTimeout(initPlatform,100);
    }
}

//this function assumes the platform var has already been initialized with initMap
export function getPlatform(){
    return platform;
}

export async function initMap(){
    if(inProgressPromise == null){
        inProgressPromise = new Promise((resolve,reject) =>{
            if(testForPlatform() && platform != null)
                resolve(platform);
            else{ //load these in serial so we don't hog all the connections early on
                const startTime=new Date();
                return jQuery.getScript("https://js.api.here.com/v3/3.1/mapsjs-core.js").
                    then(()=>{
                        return jQuery.getScript("https://js.api.here.com/v3/3.1/mapsjs-service.js");
                    }).
                    then(()=>{
                        return jQuery.getScript("https://js.api.here.com/v3/3.1/mapsjs-mapevents.js");
                    }).
                    then(()=>{
                        return jQuery.getScript("https://js.api.here.com/v3/3.1/mapsjs-ui.js");
                    }).
                    then(()=>{
                        return jQuery.getScript("https://js.api.here.com/v3/3.1/mapsjs-clustering.js");
                    }).
                    then(() =>{
                        console.log("map scripts done loading");
                        return initPlatform(resolve,reject,startTime);
                    }).catch(function(error){
                        var message = "failed to load map files: "+error.statusText+", code "+error.status;
                        console.error(message,error);
                        reject(message);
                    });

            }
                //initMap(resolve,reject);

        });
    }
    return inProgressPromise;
}

export function testGeocoder(){
    
    console.log("mapAPIKey: "+mapAPIKey);
    //const localPlatform =new H.service.Platform({ 'apikey': mapAPIKey });
    const geocoder = platform.getSearchService();
    const query="wildomar, ca";

    geocoder.autosuggest({ q:query,at:"0,0" },function(results){
        var options;
        console.log("location results:", results);
        if(results.items.length > 0){
            options =results.items.map(function(item){
                return {
                    label: item.title,
                    location: {
                        lat: item.position.lat,
                        lng: item.position.lng,
                    }
                }
            });
            console.log("selectize options",options);
        }else {
            console.log("no geocoder results");
        }
    },(error)=>{
        console.error("error in autosuggest: "+error.message,error);
    });

}

export function testCountryShape(){

    platform.getGeocodingService().geocode({
        country:"BEL,FRA,USA",
        additionaldata:"IncludeShapeLevel,country",
    },function(result){
        console.log("country shape result (js): ",result);
    },function(error){
        console.log("geocoder error: ",error);
    });


/*
    const appId = "";
    //const url = "https://geocoder.api.here.com/6.2/geocode.json?"+
    const url = "https://geocoder.ls.hereapi.com/6.2/geocode.json?"+
            "&apiKey="+mapAPIKey+
            "&country=BEL,FRA,USA"+ // FRA, AUT, BEL
            "&additionaldata=IncludeShapeLevel,country";
    jQuery.get(url).then((result) =>{
        console.log("country shape result: ",result);
        const views = result.Response.View;
        if(views.length > 0){
            const innerResults = views[0].Result;
            if(innerResults.length > 0){
                const shape = innerResults[0].Location.Shape;
                console.log("country shape: ",shape);
            }
        }
    })
    */
}