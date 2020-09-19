

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
    console.log("mapAPIKey: "+mapAPIKey);
    const now = new Date();
    if(testForPlatform()){
        platform =new H.service.Platform({ 'apikey': mapAPIKey });
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
            else{
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
                    then(() =>{
                        console.log("map scripts done loading");
                        return initPlatform(resolve,reject,startTime);
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
