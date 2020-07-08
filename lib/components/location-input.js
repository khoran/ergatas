/**
 *  INPUT / OUTPUT Params
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
            const geocoder = new google.maps.Geocoder();
            console.log("defining viewmodel for LOCATION-MAP",params);
            var profileMarker;

            self.lat = params.lat;
            self.lng = params.lng;
            self.location=params.location;
            self.country = params.country;

            if(self.lat()!= null && self.lng() != null)
                options = {
                    center: new google.maps.LatLng(self.lat(),self.lng()),
                    zoom: 7 //The zoom value.
                };
            else    
                options = {
                    center:  new google.maps.LatLng(0,0),
                    zoom: 1 
                };

            
            const map = new google.maps.Map(jQuery('#location-map')[0], options);
            
            async function updatePosition(position){
                console.log("updating position",position);
                var addressInfo = await getAddress(position,geocoder);
                console.log("address info: ",addressInfo);

                profileMarker.setPosition(position);
                map.setCenter(position);

                self.lat(position.lat());
                self.lng(position.lng());
                self.location(addressInfo.location);
                self.country(addressInfo.country);
            }

//            ko.computed(function(){
//                    console.log("location lat/long update");
//                    if(viewModel.hasProfile())
//                        viewModel.recordLocation(viewModel.userProfile().data.location_lat(),
//                                            viewModel.userProfile().data.location_long());
//            });
//
            profileMarker = new google.maps.Marker({
                    map:map,
                    draggable: true,
                });

            google.maps.event.addListener(profileMarker, 'dragend', function(event){
                updatePosition(profileMarker.getPosition());

            });

            //Listen for any clicks on the map.
            google.maps.event.addListener(map, 'click', function(event) {                
                //Get the location that the user clicked.
                console.log("click envent ",event.latLng);
                updatePosition(event.latLng);
            });
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
                    if(value== null || value === '')
                        return;
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
                    geocoder.geocode({ address:query },function(results,status){
                        var options;
                        console.log("location results:", results);
                        if(results.length > 0){
                            options =results.map(function(result){
                                return {
                                    label: result.formatted_address,
                                    location: {
                                        lat: result.geometry.location.lat(),
                                        lng: result.geometry.location.lng(),
                                    }
                                }
                            });
                            console.log("selectize options",options);
                            callback(options);
                        }else callback();
                    });
                },
                onItemAdd: function(value){
                    var data;
                    data = this.options[value];
                    console.log("onItemAdd: ",data);
                    if(data != null && data.location != null){
                        updatePosition( new google.maps.LatLng(
                            data.location.lat,data.location.lng));
                    }

                }
            };

        },
        //template: {fromUrl: "location-input"},
        template: require('./location-input.html'),
    });
}
function getAddress(location,geocoder){

    return new Promise((resolve,reject) =>{
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
    });

}

