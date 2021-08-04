import * as mapUtils from '../client/google-map';
/**
 *  INPUT / OUTPUT Params
 *      - lat: lattidute 
 *      - lng: longitude 
 *      - location: text description of position
 *      - country: name of country of current location
 *      - countryCode: 3166 alpha-3 country code
 *      - description: description of purpose of this field
 */


const toAlpha3Code = require("../data/country_code_mapping.json");

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
            self.mapLoading= ko.observable(true);
            self.selectizeLoading= ko.observable(true);
            console.log("country: ",self.country());
            self.country("");


            mapUtils.initMap().then(() => {

                var positionMarker;

                self.mapLoading(false);

                console.log("initial location coords: ",self.lat(),self.lng());
                //neither are null, and they are not both 0
                if(self.lat() != null  && self.lng() != null && !(self.lat()===0 && self.lng()===0))
                    options = {
                        center: {lat:self.lat(),lng:self.lng()},
                        zoom: 7, //The zoom value.
                        gestureHandling: 'greedy',
                    };
                else    {
                    console.log("no initial coords set");
                    options = {
                        center:  {lat:0,lng:0},
                        zoom: 1 ,
                        gestureHandling: 'greedy',
                    };

                }

                var handlingClick=false;
                const map = new google.maps.Map(document.getElementById("location-map"),options );

                const geocoder = new google.maps.Geocoder();


                map.addListener("click", async function (event) {
                    handlingClick=true;
                    console.log("click event ");
                    var position = event.latLng;
                      //map.screenToGeo(event.currentPointer.viewportX,
                        //event.currentPointer.viewportY);
                    console.log("click at latLng: ",position);
                    var addressInfo = await updatePosition(position);

                    self.location(addressInfo.location,false);
                    handlingClick=false;
                });

/*
            });


            mapUtils.initMap().then(function(platform){
                //const platform = mapUtils.getPlatform();
                const defaultLayers = platform.createDefaultLayers();
                const geocoder = platform.getSearchService();

                self.mapLoading(false);

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
                const map = new H.Map(jQuery('#location-map')[0], defaultLayers.raster.normal.map, options);
                window.addEventListener('resize', () => map.getViewPort().resize());
                const mapEvents = new H.mapevents.MapEvents(map);
                const behavior = new H.mapevents.Behavior(mapEvents);
                //const ui = H.ui.UI.createDefault(map, defaultLayers,"en-US");
                const ui = new H.ui.UI(map,{zoom:true});
                ui.addControl('custom_settings_control', new H.ui.MapSettingsControl({
                    baseLayers: [{
                        label: 'Map View',
                        layer: defaultLayers.raster.normal.map
                    }, {
                        label: 'Satellite',
                        layer: defaultLayers.raster.satellite.map
                    }],
                    layers: []
                }));

                var handlingClick=false;
                map.addEventListener("tap", async function (event) {
                    handlingClick=true;
                    console.log("click event ");
                    var position = map.screenToGeo(event.currentPointer.viewportX,
                        event.currentPointer.viewportY);
                    var addressInfo = await updatePosition(position);

                    self.location(addressInfo.location,false);
                    handlingClick=false;
                });

*/

                async function updatePosition(position){
                    console.log("updating position",position);
                    console.log("updating position coords: "+position.lat()+", "+position.lng());
                    console.log("HANDLING CLICK: "+handlingClick);


                    //map.removeObjects(map.getObjects());
                    //map.addObject(new  H.map.Marker(position));

                    if(positionMarker != null)
                       positionMarker.setMap(null);
                    positionMarker=new google.maps.Marker({
                       position:position,
                       map:map
                    });
                    map.panTo(position);

                    //don't use animation here, looks terrible in most cases
                    //map.setCenter(position,false);

                    self.lat(position.lat());
                    self.lng(position.lng());
                    
                    var addressInfo = await getAddress(position,geocoder);
                    console.log("address info: ",addressInfo);
                    self.country(addressInfo.country);
                    self.countryCode(addressInfo.countryCode);

                    return addressInfo;
                }

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
                                location: new google.maps.LatLng(self.lat(),self.lng()),
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
                            location: new google.maps.LatLng(self.lat(),self.lng()),
                        });
                        api.addItem(value,true);
                    },
                    load: function(query,callback){
                        if(query == null || query ===''){
                            callback();
                            return;
                        }
                        geocoder.geocode({ address:query},function(results,status){
                            var options;
                            console.log("location goecode status: ",status);
                            console.log("location results:", results);
                            if(status=="OK" && results && results.length > 0){
                                options =results.map(function(item){
                                    return {
                                        label: item.formatted_address,
                                        location: item.geometry.location,
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
                       console.log("onItemAdd lat; "+data.location.lat());
                        if(data != null && data.location != null){
                            updatePosition( 
                                new google.maps.LatLng(data.location.lat(),data.location.lng()));
                        }

                    }
                };

                self.selectizeLoading(false);
            }).catch(function(error){
                console.error("failed to load map in location-input component: "+error,error);
                self.mapLoading(false);
                self.selectizeLoading(false);
            });
        },
        //template: {fromUrl: "location-input"},
        template: require('./location-input.html'),
    });
}
function getAddress(position,geocoder){

    console.log("reverse geocoding ",position);

    return geocoder.geocode({
       location:position
      }).then( (response) => {
        var results = response.results;

        console.log("rev geocode results: ",results);

        if(results.length > 0){
            var item = results[0];
            console.log("using item ",item);
            var country = getCountry(item.address_components);
            return {location:item.formatted_address, 
                     country:country.long_name,
                     countryCode: country.country_code};
        }else{
            console.log("no reverse geocode results");
            return {location:"", country:"",countryCode:""};
        }
      }).catch( (error) =>{
          console.log("reverse geocoding failed for query: "+error.message,position);
          return {location:"", country:"",countryCode:""};
      });
}
function getCountry(address){
   console.log("getting country from address ",address);

   var country;
   var candidates= address.filter( component => component.types.indexOf("country") !== -1) ;
   console.log("mark a");

   if(candidates.length > 0)
      country = candidates[0];


   console.log("from comps, found country comp: ",country);

   if(country && country.short_name){
      //get 3 letter country code
      country.country_code = toAlpha3Code[country.short_name];
   }
   //convert any null or undefined's to empty strings
   country.country_code = country.country_code || "";
   console.log("got country: ",country);
   return country;

}
