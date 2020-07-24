/**
 *  INPUT / OUTPUT Params
        - mapPlatform: 'platform' object for HERE map
 *      - lat: lattidute 
 *      - lng: longitude 
 *      - location: text description of position
 *      - country: name of country of current location
 */



export function register(){
    ko.components.register('location-input', {
        viewModel: function(params) {
            var self=this;
            var options;
//            const geocoder = new google.maps.Geocoder();

            console.log("defining viewmodel for LOCATION-MAP",params);
            var profileMarker;


            self.lat = params.lat;
            self.lng = params.lng;
            self.location=params.location;
            self.country = params.country;
            console.log("country: ",self.country());
            self.country("");

            const platform = params.mapPlatform();
            const defaultLayers = platform.createDefaultLayers();
            const geocoder = platform.getSearchService();

            if(self.lat() != null && self.lng() != null)
                options = {
                    center: {lat:self.lat(),lng:self.lng()},
                    zoom: 7, //The zoom value.
                    pixelRatio: window.devicePixelRatio || 1
                };
            else    
                options = {
                    center:  {lat:0,lng:0},
                    zoom: 1 ,
                    pixelRatio: window.devicePixelRatio || 1
                };

            const map = new H.Map(jQuery('#location-map')[0], defaultLayers.vector.normal.map, options);
            window.addEventListener('resize', () => map.getViewPort().resize());
            const mapEvents = new H.mapevents.MapEvents(map);
            const behavior = new H.mapevents.Behavior(mapEvents);
            const ui = H.ui.UI.createDefault(map, defaultLayers);





            
            //const map = new google.maps.Map(jQuery('#location-map')[0], options);
            
            async function updatePosition(position,resolveCountryOnly){
                console.log("updating position",position);


                //profileMarker.setPosition(position);
                //map.setCenter(position);
                map.removeObjects(map.getObjects());
                map.addObject(new  H.map.Marker(position));
                map.setCenter(position,true);

                self.lat(position.lat);
                self.lng(position.lng);
                
                var addressInfo = await getAddress(position,geocoder);
                console.log("address info: ",addressInfo);
                self.country(addressInfo.country);

                //this location will be overly specific in some cases
                if(resolveCountryOnly== null || resolveCountryOnly=== false){
                    self.location(addressInfo.location);
                }
            }

//            ko.computed(function(){
//                    console.log("location lat/long update");
//                    if(viewModel.hasProfile())
//                        viewModel.recordLocation(viewModel.userProfile().data.location_lat(),
//                                            viewModel.userProfile().data.location_long());
//            });
//
            //profileMarker = new google.maps.Marker({
                    //map:map,
                    //draggable: true,
                //});

            map.addEventListener("tap", function (event) {
                console.log("click event: ",event);
                var position = map.screenToGeo(event.currentPointer.viewportX,
                    event.currentPointer.viewportY);
                updatePosition(position);
            });
            //google.maps.event.addListener(profileMarker, 'dragend', function(event){
                //updatePosition(profileMarker.getPosition());
            //});

            //Listen for any clicks on the map.
            //google.maps.event.addListener(map, 'click', function(event) {                
            //    //Get the location that the user clicked.
            //    console.log("click envent ",event.latLng);
            //    updatePosition(event.latLng);
            //});
            self.locationSelectizeOptions= {
                create:false,
                valueField: "label",
                labelField:"label",
                searchField:"label",
                maxItems: 1,
                plugins:['remove_button'],
                onInitialize: function(){
                    console.log("location selectize init: ",this);
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
                    console.log("location updated via observabale",value);
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
                        console.log("error in autosuggest: ",error);
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
                resolve({location:item.address.label, country:item.address.countryName});
            }else{
                console.log("no reverse geocode results");
                resolve({location:"", country:""});
            }
          }, (error) =>{
              console.log("reverse geocoding failed for query ",position);
              reject(error);
          });


/*
        geocoder.geocode({ location:location},function(results,status){
            var country,address;
            var bestMatch;
            var countryComp;
            console.log("location results:", results);
            if(results.length > 0){
                bestMatch=results.find(function(result){
                    //accepte first match that is a street_address or political
                    return result.types.indexOf("political") !== -1 
                        || result.types.indexOf("street_address") !== -1;
                });
                console.log("best match: ",bestMatch);
                if(bestMatch == null)
                    bestMatch = results[0]; //take what we can get if no non-routes found

                address = bestMatch.formatted_address;
                countryComp=bestMatch.address_components.find(function(comp){
                    return comp.types.indexOf("country") !== -1;
                });
                console.log("country component: ",countryComp);
                if(countryComp != null){
                    country = countryComp.long_name;
                }
                resolve({location:address,country:country});
            }
        });
        */
    });

}

