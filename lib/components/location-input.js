import * as mapUtils from '../map';
/**
 *  INPUT / OUTPUT Params
        - mapPlatform: 'platform' object for HERE map
 *      - lat: lattidute 
 *      - lng: longitude 
 *      - location: text description of position
 *      - country: name of country of current location
 *      - countryCode: 3166 alpha-3 country code
 *      - description: description of purpose of this field
 */



export async function register(){

    ko.components.register('location-input', {
        viewModel: function(params) {
            var self=this;
            var options;

            console.log("defining viewmodel for LOCATION-MAP",params);
            var profileMarker;


            self.lat = params.lat;
            self.lng = params.lng;
            self.location=params.location;
            self.country = params.country;
            self.countryCode = params.countryCode;
            self.description = params.description;
            console.log("country: ",self.country());
            self.country("");

            const platform = mapUtils.getPlatform();
            const defaultLayers = platform.createDefaultLayers({lg:"en"});
            const geocoder = platform.getSearchService();

            console.log("initial location coords: ",self.lat(),self.lng());
            //neither are null, and they are not both 0
            if(self.lat() != null  && self.lng() != null && !(self.lat()===0 && self.lng()===0))
                options = {
                    center: {lat:self.lat(),lng:self.lng()},
                    zoom: 7, //The zoom value.
                    pixelRatio: window.devicePixelRatio || 1
                };
            else    {
                console.log("no initial coords set");
                options = {
                    center:  {lat:0,lng:0},
                    zoom: 1 ,
                    pixelRatio: window.devicePixelRatio || 1
                };

            }
            const map = new H.Map(jQuery('#location-map')[0], defaultLayers.vector.normal.map, options);
            window.addEventListener('resize', () => map.getViewPort().resize());
            const mapEvents = new H.mapevents.MapEvents(map);
            const behavior = new H.mapevents.Behavior(mapEvents);
            const ui = H.ui.UI.createDefault(map, defaultLayers,"en-US");


            async function updatePosition(position,resolveCountryOnly){
                console.log("updating position",position);


                map.removeObjects(map.getObjects());
                map.addObject(new  H.map.Marker(position));
                map.setCenter(position,true);

                self.lat(position.lat);
                self.lng(position.lng);
                
                var addressInfo = await getAddress(position,geocoder);
                console.log("address info: ",addressInfo);
                self.country(addressInfo.country);
                self.countryCode(addressInfo.countryCode);

                //this location will be overly specific in some cases
                if(resolveCountryOnly== null || resolveCountryOnly=== false){
                    self.location(addressInfo.location);
                }
            }

            map.addEventListener("tap", function (event) {
                console.log("click event: ",event);
                var position = map.screenToGeo(event.currentPointer.viewportX,
                    event.currentPointer.viewportY);
                updatePosition(position);
            });
            self.locationSelectizeOptions= {
                create:false,
                valueField: "label",
                labelField:"label",
                searchField:"label",
                maxItems: 1,
                plugins:['remove_button'],
                onInitialize: function(){
                    if(self.location() !== ''){
                        this.addOption({
                            label: self.location(),
                            location: {
                                lat: self.lat(),
                                lng: self.lng(),
                            }
                        });
                        this.addItem(self.location(),true);
                    }
                },
                onObsUpdate: function(api, value){
                    value = ko.unwrap(value);
                    console.log("location updated via observable",value);
                    if(value== null )// || value === '')
                        return;
                    else if(value === ""){
                        api.clear(true);
                        return;
                    }
                    api.addOption({
                        label: value,
                        location: {
                            lat: self.lat(),
                            lng: self.lng(),
                        }
                    });
                    api.addItem(value,true);
                },
                load: function(query,callback){
                    if(query == null || query ===''){
                        callback();
                        return;
                    }
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
                            callback(options);
                        }else callback();
                    },(error)=>{
                        console.log("error in autosuggest: "+error.message,error);
                    });
                },
                onItemAdd: function(value){
                    var data;
                    data = this.options[value];
                    console.log("onItemAdd: ",data);
                    if(data != null && data.location != null){
                        updatePosition( 
                            {lat:data.location.lat,lng: data.location.lng},true);
                        console.log("done with onItemAdd");
                    }

                }
            };

        },
        //template: {fromUrl: "location-input"},
        template: require('./location-input.html'),
    });
}
function getAddress(position,geocoder){

    console.log("reverse geocoding ",position);
    return new Promise((resolve,reject) =>{

        geocoder.reverseGeocode({
            lang: "en",
            at: position.lat+","+position.lng,
            limit: 5,
          }, (results) => {
            // Add a marker for each location found
            results.items.forEach((item) => {
                console.log("geocode item: ",item);
            });
            if(results.items.length > 0){
                var item = results.items[0];
                console.log("using item ",item);
                resolve({location:item.address.label, 
                         country:item.address.countryName,
                         countryCode: item.address.countryCode});
            }else{
                console.log("no reverse geocode results");
                resolve({location:"", country:"",countryCode:""});
            }
          }, (error) =>{
              console.log("reverse geocoding failed for query: "+error.message,position);
              reject(error);
          });
    });
}