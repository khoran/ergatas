import { Loader } from "@googlemaps/js-api-loader";


export async function initMap(){
   const mapAPIKey = process.env.GOOGLE_MAP_API_KEY;
   const loader = new Loader({
        apiKey: mapAPIKey,
        version: "weekly",
   });
   return loader.load();
}
