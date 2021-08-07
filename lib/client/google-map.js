import { Loader } from "@googlemaps/js-api-loader";

const geocodeUrl = "https://maps.googleapis.com/maps/api/geocode/json"
const geocodeAPIKey = process.env.GEOCODE_API_KEY;

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
