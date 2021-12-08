import { Loader } from "@googlemaps/js-api-loader";

const geocodeUrl = "https://maps.googleapis.com/maps/api/geocode/json"
const geocodeAPIKey = process.env.GEOCODE_API_KEY;

export const toAlpha3Code = require("../data/country_code_mapping.json");

export async function initMap(){
   const mapAPIKey = process.env.GOOGLE_MAP_API_KEY;
   const loader = new Loader({
        apiKey: mapAPIKey,
        version: "weekly",
   });
   return loader.load();
}

export async function geocode(address){
   return jQuery.get(geocodeUrl+`?key=${geocodeAPIKey}&address=`+address);
}
export async function reverseGeocode(position){
   return jQuery.get(geocodeUrl+`?key=${geocodeAPIKey}&latlng=`+position.toUrlValue());
}

function alpha3ToAlpha2(alpha3Code){
   var mapping = Object.entries(toAlpha3Code).
                        find(codes => codes[1].toLowerCase() == alpha3Code.toLowerCase());
   if(mapping == null){
      console.log("could not convert alpha3 code to alpha2 code ",alpha3Code);
      return undefined;
   }else
      return mapping[0];

}
export async function countryBound(countryCode){
   try{

      var alpha2Code = countryCode.length === 2 ? countryCode : alpha3ToAlpha2(countryCode);

      var geocodeResult = await jQuery.get(geocodeUrl+
                     `?key=${geocodeAPIKey}&components=country:${alpha2Code}`);
      //console.log("country bound result: ",geocodeResult);
      if(geocodeResult.results && geocodeResult.results.length > 0){
         var bound = geocodeResult.results[0].geometry.bounds;
         return bound;
      }
   }catch(error){
      console.error("failed to find bounding box for country code "+alpha3Code,error);

   }

}
