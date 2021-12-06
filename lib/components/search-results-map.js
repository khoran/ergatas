import * as mapUtils from '../client/google-map';
import MarkerClusterer from '@googlemaps/markerclustererplus';

/*
    INPUT Params
        - allResults: observable array of profiles objects
        - appState: AppState object
        - controls:  an object with several helper functions needed. These should be:
            - selectProfile: a function that takes a profile and navigates to its detail page
            - pictureUrl: a function that takes the relative profile_url from a profile object 
                          and returns the full URL.
            - getProfile:
            - getProfiles:
    OUTPUT Params
        - output_profilesInArea: provide an observabel, will be set with an array of missionary_profile_key values
        - output_bounds: array of current map bounds coords
*/

var openWindow;

export async function register(){
    console.log("registering search-results-map component");


    ko.components.register('search-results-map', {
        viewModel: main,
        template: "<div id='search-results-map'  style='height:90vh;'></div>"
    });
}
function main(params) {
   var self=this;
   var markers = [];
   var clusterer;
   console.log("defining viewmodel for SEARCH-RESULTS-MAP",params);
   dataLayer.push({event:'search-map'});
   mapUtils.initMap().then( () =>{


       const appState = params.appState;

       const options = {
            center:  {lat:0,lng:0},
            zoom: 2,
            minZoom: 2,
            streetViewControl: false, 
            gestureHandling: 'greedy',
       };
       const map = new google.maps.Map(document.getElementById("search-results-map"),options );

       clusterer = new MarkerClusterer(map,[],{
                            imagePath:"/img/cluster-icons/m",
                            averageCenter: true,
                            minimumClusterSize: 2,
                            zoomOnClick: false,
                         });

       openWindow = new google.maps.InfoWindow({ });
       const b = params.output_bounds();
       console.log("output_bounds: ",b);
       if(b != null && b.length === 4)
          map.fitBounds({
            north: b[0],
            east: b[1],
            south: b[2],
            west: b[3],
          },0);

       async function searchByBounds(){
           var ne,sw, bound;
           var searchResults;
           var bound = map.getBounds();

           //console.log("bounds: ",bound);
           params.output_bounds([
               bound.getNorthEast().lat(), bound.getNorthEast().lng(),
               bound.getSouthWest().lat(), bound.getSouthWest().lng()]);
       }

       var viewChanging;
       map.addListener('bounds_changed', function () {
           console.log("map view changed event");
           window.clearTimeout(viewChanging);
           viewChanging = setTimeout(searchByBounds,100);
       });

       // UPDATE WHEN PROFILES LIST CHANGES
       self.updateMap = ko.computed({
           read:function(){
               var profiles = params.allResults();
               console.log("search-results-map: profiles updated");

               console.log("updating map results",profiles);

               try{
                   if(profiles != null ){
                      clusterer.removeMarkers(markers);
                      markers.forEach(m => m.setMap(null));
                      markers = profiles.map(p =>profileMarker(p,map,appState));
                      clusterer.addMarkers(markers);

                      google.maps.event.addListener(clusterer,"click", (cluster) =>{
                         var markers = cluster.getMarkers();
                         var initialZoom = map.getZoom();

                         if(markers == null)
                            return;

                         if(markers.length > 1 && markers.length < 10){
                            var positions = markers.map(m => m.getPosition());
                            //see if markers are all on top of each other
                            var allEqual = true;
                            positions.forEach( p =>{
                               allEqual = (positions[0].equals(p));
                            });

                            if(allEqual){ //they are all on top of each other
                               //show info window
                               openInfoWindow(cluster.getCenter(),map,async () =>{
                                 var profiles = [];
                                 try{
                                     profiles = await appState.da.getProfilesByKey(
                                                   markers.map((m) => m.ergatas_custom_data.missionary_profile_key));
                                 }catch(error){
                                    //just use the stub profile so we can at least provide a link
                                    console.error("failed to fetch full profile for ",profile);
                                 }
                                 return bubbleContent(profiles,appState)
                              });
                           }else
                               map.fitBounds(cluster.getBounds());
                         }else
                            map.fitBounds(cluster.getBounds());
                      });
                   }
               }catch(error){
                   console.warn("failed to add clusters: ",error);
               }
           },
           disposeWhenNodeIsRemoved: true,
       });
   });
}

main.prototype.dispose = function(){
    //make sure updates don't keep happening after map is removed
    this.updateMap.dispose();
}

function profileMarker(profile,map,appState){
   var marker = new google.maps.Marker({
      position: new google.maps.LatLng(profile.lat,profile.long),
      ergatas_custom_data: profile,
   });
   marker.addListener("click",() =>{

      openInfoWindow(marker.getPosition(),map,async () =>{
         try{
            //replace stub with full profile
            profile = await appState.da.getProfileByKey(profile.missionary_profile_key);
         }catch(error){
            //just use the stub profile so we can at least provide a link
            console.error("failed to fetch full profile for ",profile);
         }
         return bubbleContent(profile,appState)
      });
   });
   return marker;
}
async function openInfoWindow(position,map,htmlFn){

   openWindow.setPosition(position);
   openWindow.setContent("<div class='text-center'><img width=25 src='/img/block-spinner2.svg'/></div>");

   openWindow.setContent(await htmlFn());
   openWindow.open({ map:map });
}

function bubbleContent(data,appState){ //data could be a single profile or array or profiles
    var html;
   
    if(Array.isArray(data)){
        html = jQuery([
                "<div  class='map-thumbnail-container' data-bind='foreach: profiles'>",
                    "<img width = 100 class='cursor-pointer'  data-bind='attr:{src:$root.fullUrl($data)},click: $root.select'/>",
                "</div>",
        ].join(''))[0];
        ko.applyBindings({
            profiles: ko.observableArray(data),
            fullUrl: function(profile) {                                
                var url = (profile.data && profile.data.picture_url ) || undefined;
                return appState.storage.profilePictureUrl(url);
            },
            select: function(profile){
                appState.selectProfile(profile);
            }
        },html);

    } else{
        var profile = data;

       if(profile.data != null){ //we have a full profile
           var imgBind="visible: fullUrl, attr:{src: fullUrl },click: select";
           html = jQuery(`<div style='text-align:center'><img width=100 class='cursor-pointer' data-bind='${imgBind}'/>`+
                       `<br><a href='#' data-bind='click: select'>${profile.missionary_name}</a></div>`)[0];
           ko.applyBindings({
               select: function(){
                   appState.selectProfile(profile);
               },
               fullUrl: appState.storage.profilePictureUrl(profile.data.picture_url),
           },html);
       } else{ // we have just a stub
           html = jQuery(`<div style='text-align:center'>`+
                       `<br><a href='#' data-bind='click: select'>View</a></div>`)[0];
           ko.applyBindings({
               select: function(){
                   appState.selectProfile(data);
               },
           },html);
       }
    }

    return html;
}
