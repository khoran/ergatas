

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
                    //then(()=>{ //needed for geojson
                        //return jQuery.getScript("https://js.api.here.com/v3/3.1/mapsjs-data.js");
                    //}).
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
/* not used
function storeShape(countryCode,shape){
    try{
        console.log("cacheing shape for "+countryCode);
        window.localStorage.setItem(countryCode,JSON.stringify(shape));
    }catch(error){
        console.warn("failed to cache "+countryCode,error);
    }
}
function getShape(countryCode){
    if(window.localStorage){
        console.log("Fetching shape for "+countryCode);
        return JSON.parse(window.localStorage.getItem(countryCode));
    }
}
function shapeCached(countryCode){
    return window.localStorage && window.localStorage.getItem(countryCode) != null;
}
export function getCountryShapes(countryCodes){

    return platform.getGeocodingService().geocode({
        country:countryCodes.join(","),
        additionaldata:"IncludeShapeLevel,country",
    }).then(function(result){
        console.log("country shape result (js): ",result);
        const views = result.Response.View;
        var shapes=[];
        if(views.length > 0){
            const innerResults = views[0].Result;
            if(innerResults.length > 0){

                innerResults.forEach((inner)=>{
                    storeShape(inner.Location.Address.Country,inner.Location.Shape.Value);
                    shapes.push(inner.Location.Shape.Value);
                    //shapes[inner.Location.Address.Country]= inner.Location.Shape.Value;
                })
            }
        }
        return shapes;
    });

}
export async function getAllCountryShapes(countryCodes){
    
    // fetch 10 at a time
    var i;
    var length;
    var batchSize = 10;
    var batch;
    var jobs=[];
    var cachedCodes=[];
    var remainingCodes=[];
    var allShapes=[];

    countryCodes.forEach((code) =>{
        if(shapeCached(code))
            cachedCodes.push(code);
        else
            remainingCodes.push(code);
    });

    console.log("CACHED SHAPES: ", cachedCodes);
    console.log("REMAINING SHAPES: ",remainingCodes);

    allShapes = cachedCodes.map(getShape);

    length = remainingCodes.length;
    for(i=0;i < length; i=i+batchSize){
        batch = remainingCodes.slice(i,i+batchSize);
        jobs.push(getCountryShapes(batch).then((shapes)=>{
            console.log("appending "+shapes.length+" shapes to final result");
            allShapes = allShapes.concat(shapes);
        }));
    }
    console.log("fired off "+jobs.length+" jobs");
    await Promise.all(jobs);

   // jobs.forEach(async (job)=>{
   //     console.log("getting job result");
   //     job.then((shapes) =>{
   //         console.log("appending "+shapes.length+" shapes to final result");
   //         allShapes = allShapes.concat(shapes);
   //     })
   // });
    console.log("got "+allShapes.length+" shapes");
    if(allShapes.length !== countryCodes.length){
        console.warn("failed to fetch all shapes, "+countryCodes.length+" given, but only got "+allShapes.length);
    }
    return allShapes;

}

export function addShape(map,shape){

    //console.log("adding shape: ",shape);
    const highlightStyle = {
        strokeColor: 'black', 
        //fillColor: 'rgba(0,175,170,0.5)', 
        fillColor: 'rgba(237,181,58,0.5)', 
        lineWidth: 1,            
        lineJoin: 'bevel'
    };


    // the shape is returned as WKT and we need to convert it a Geometry
    var geometry = H.util.wkt.toGeometry(shape); 

    // geometry is either a single or multi-polygon     
    if (geometry instanceof H.geo.MultiGeometry) {
        var geometryArray = geometry.getGeometries(); 
        for (var i = 0; i < geometryArray.length; i++) {
            map.addObject(new H.map.Polygon(geometryArray[i].getExterior(), 
            	{ style: highlightStyle }));            
        }
    } else { // instanceof H.geo.Polygon            
        map.addObject(new H.map.Polygon(geometry.getExterior(), 
            { style: highlightStyle}));          
    }
}

export function showGeoJSONData (map) {
  // Create GeoJSON reader which will download the specified file.
  // Shape of the file was obtained by using HERE Geocoder API.
  // It is possible to customize look and feel of the objects.
  //var reader = new H.data.geojson.Reader('/countries-10m.json', {
  var reader = new H.data.geojson.Reader('/berlin.json', {
    disableLegacyMode: true,
    // This function is called each time parser detects a new map object
    style: function (mapObject) {
      // Parsed geo objects could be styled using setStyle method
      if (mapObject instanceof H.map.Polygon) {
        mapObject.setStyle({
        //  fillColor: 'rgba(255, 0, 0, 0.5)',
          fillColor: 'rgba(237,181,58,0.5)', 
          strokeColor: 'black', 
          lineWidth: 1,
          lineJoin: 'bevel'
        });
      }
    }
  });

  // Start parsing the file
  reader.parse();

  // Add layer which shows GeoJSON data on the map
  map.addLayer(reader.getLayer());
}
*/