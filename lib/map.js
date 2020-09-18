

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

function initMap(resolve,reject){
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

export async function getPlatform(){
    if(inProgressPromise == null){

        inProgressPromise = new Promise((resolve,reject) =>{
            if(testForPlatform())
                resolve(platform);
            else
                initMap(resolve,reject);

        });
    }
    return inProgressPromise;
}
