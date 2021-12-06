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
            self.country("");


            mapUtils.initMap().then(() => {

                var positionMarker;

                self.mapLoading(false);
                options = {
                     center:  {lat:0,lng:0},
                     zoom: 2 ,
                     minZoom: 2,
                     streetViewControl: false, 
                     gestureHandling: 'greedy',
                 };

                //console.log("initial location coords: ",self.lat(),self.lng());
                //neither are null, and they are not both 0
                if(self.lat() != null  && self.lng() != null && !(self.lat()===0 && self.lng()===0)){
                    options.center =  {lat:self.lat(),lng:self.lng()};
                    options.zoom = 7;
                }

                var handlingClick=false;
                const map = new google.maps.Map(document.getElementById("location-map"),options );

                const geocoder = new google.maps.Geocoder();


                map.addListener("click", async function (event) {
                    handlingClick=true;
                    var position = event.latLng;
                    //console.log("click at latLng: ",position);
                    var addressInfo = await updatePosition(position);

                    self.location(addressInfo.location,false);
                    handlingClick=false;
                });



                async function updatePosition(position){
                    console.log("updating position",position);


                    if(positionMarker != null)
                       positionMarker.setMap(null);
                    positionMarker=new google.maps.Marker({
                       position:position,
                       map:map
                    });
                    map.panTo(position);

                    self.lat(position.lat());
                    self.lng(position.lng());
                    
                    var addressInfo = await getAddress(position,geocoder);
                    //console.log("address info: ",addressInfo);
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
                        //console.log("location updated via observable",value);
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
                        //geocoder.geocode({ address:query},function(results,status){
                        mapUtils.geocode(query).then(function(response) {
                            var status = response.status;
                            var results = response.results;

                            var options;
                            //console.log("location results:", results);
                            if(status=="OK" && results && results.length > 0){
                                options =results.map(function(item){
                                    return {
                                        label: item.formatted_address,
                                        location: new google.maps.LatLng( item.geometry.location),
                                    }
                                });
                                //console.log("selectize options",options);
                                callback(options);
                            }else callback();
                        },(error)=>{
                            console.warn("error in autosuggest: "+error.message,error);
                        });
                    },
                    onItemAdd: function(value){
                        var data;
                        data = this.options[value];
                        //console.log("onItemAdd: ",data);
                       //console.log("onItemAdd lat; "+data.location.lat());
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

    //console.log("reverse geocoding ",position);

    return mapUtils.reverseGeocode(position).
         then( (response) => {
           var results = response.results;

           //console.log("rev geocode results: ",results);

           if(results.length > 0){
               var item = results[0];
               //console.log("using item ",item);
               var country = getCountry(item.address_components);
               return {location:item.formatted_address, 
                        country:country.long_name,
                        countryCode: country.country_code};
           }else{
               //console.log("no reverse geocode results");
               return {location:"", country:"",countryCode:""};
           }
         }).catch( (error) =>{
             console.warn("reverse geocoding failed for query: "+error.message,position);
             return {location:"", country:"",countryCode:""};
         });
}
function getCountry(address){
   console.log("getting country from address ",address);

   var country;
   var candidates= address.filter( component => component.types.indexOf("country") !== -1) ;

   if(candidates.length > 0)
      country = candidates[0];


   //console.log("from comps, found country comp: ",country);

   if(country && country.short_name){
      //get 3 letter country code
      country.country_code = toAlpha3Code[country.short_name];
   }
   //convert any null or undefined's to empty strings
   country.country_code = country.country_code || "";
   //console.log("got country: ",country);
   return country;

}
