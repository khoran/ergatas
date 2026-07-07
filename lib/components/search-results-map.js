import * as mapUtils from '../client/google-map';
import MarkerClusterer from '@googlemaps/markerclustererplus';
import countryCentroids from '../data/country_centroids.json';

/*
    INPUT Params
        - allResults: observable array of profiles objects
        - appState: AppState object
        - impactCountries: the impact-countries search filter observable (array of alpha-3 codes).
                           Enables the "where work impacts" mode toggle when provided.
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

const IMPACT_GREEN = "#468f72";
const IMPACT_NAVY = "#335060";
const IMPACT_ORANGE = "#c96a12";

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
   self.impactMode = ko.observable(false);
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
       //console.log("output_bounds: ",b);
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

           // workers impacting a country may live anywhere, so the viewport
           // must not restrict the search while in impact mode
           if(self.impactMode())
               return;

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

       if(params.impactCountries != null)
           setupImpactMode(self,map,params,appState, function(visible){
               // hide the worker markers while in impact mode with no country
               // selected: the per-country circles are the subject there, and
               // every worker in the world underneath them is just clutter
               clusterer.setMap(visible ? map : null);
               if(visible)
                   clusterer.repaint();
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
                                     profiles = await appState.da.getDisplayProfilesByKey(
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
    if(this.updateImpactOverlay != null)
        this.updateImpactOverlay.dispose();
}

/* "Where work impacts" mode: instead of restricting the search to the visible
   map area, show per-country circles sized by how many workers report an
   impact there. Clicking a circle toggles that country in the impact-countries
   filter; matching workers keep their physical-location markers, connected to
   each selected country by a line. */
function setupImpactMode(self,map,params,appState,setWorkersVisible){
    const impactCountriesObs = params.impactCountries;
    var countryMarkers = {};  // alpha3 -> {marker, count}
    var maxCount = 1;
    var impactLines = [];
    var countsRequested = false;

    function selectedCodes(){
        return impactCountriesObs() || [];
    }
    function toggleCountry(code){
        var current = selectedCodes().slice();
        var index = current.indexOf(code);
        if(index >= 0)
            current.splice(index,1);
        else
            current.push(code);
        impactCountriesObs(current.length > 0 ? current : undefined);
    }
    function circleIcon(count,selected){
        return {
            path: google.maps.SymbolPath.CIRCLE,
            scale: 9 + Math.sqrt(count/maxCount)*14,
            fillColor: selected ? IMPACT_NAVY : IMPACT_GREEN,
            fillOpacity: 0.85,
            strokeColor: '#ffffff',
            strokeWeight: 1.5,
        };
    }

    var control = jQuery(
        "<div style='margin:10px;background:white;border-radius:3px;font-family:inherit;"+
                    "box-shadow:0 2px 6px rgba(0,0,0,.3);overflow:hidden;cursor:pointer;user-select:none'>"+
           "<span data-mode='live' style='display:inline-block;padding:8px 12px'>Where workers live</span>"+
           "<span data-mode='impact' style='display:inline-block;padding:8px 12px'>Where work impacts</span>"+
        "</div>")[0];
    jQuery(control).on('click','span', function(){
        self.impactMode(jQuery(this).data('mode') === 'impact');
    });
    function applyModeStyles(){
        var mode = self.impactMode() ? 'impact' : 'live';
        jQuery(control).find('span').each(function(){
            var active = jQuery(this).data('mode') === mode;
            jQuery(this).css({
                'background-color': active ? IMPACT_NAVY : 'white',
                'color': active ? 'white' : '#333',
            });
        });
    }
    applyModeStyles();
    map.controls[google.maps.ControlPosition.TOP_CENTER].push(control);

    async function ensureCountryMarkers(){
        if(countsRequested)
            return;
        countsRequested = true;
        var counts;
        try{
            counts = await appState.da.impactCountriesWithWorkers();
        }catch(error){
            console.error("failed to load impact country counts",error);
            countsRequested = false; //allow a retry on next mode switch
            return;
        }
        maxCount = Math.max(1, ...counts.map( row => row.worker_count));
        counts.forEach( row =>{
            var centroid = countryCentroids[row.code];
            if(centroid == null)
                return;
            var country = appState.countriesByCode && appState.countriesByCode[row.code];
            var name = (country && country.name) || row.code;
            var marker = new google.maps.Marker({
                position: {lat: centroid[0], lng: centroid[1]},
                icon: circleIcon(row.worker_count,false),
                label: {text: String(row.worker_count), color:'white', fontSize:'11px'},
                title: name+": "+row.worker_count+" worker"+(row.worker_count===1?"":"s")+
                       " making an impact — click to search",
                zIndex: 1000,
                map: self.impactMode() ? map : null,
            });
            marker.addListener('click', () => toggleCountry(row.code));
            countryMarkers[row.code] = {marker: marker, count: row.worker_count};
        });
        updateOverlay();
    }

    function updateOverlay(){
        var mode = self.impactMode();
        var selected = selectedCodes();

        setWorkersVisible( ! mode || selected.length > 0);

        Object.keys(countryMarkers).forEach( code =>{
            var cm = countryMarkers[code];
            cm.marker.setIcon(circleIcon(cm.count,selected.includes(code)));
        });

        impactLines.forEach( line => line.setMap(null));
        impactLines = [];
        if( ! mode || selected.length === 0)
            return;

        (params.allResults() || []).forEach( profile =>{
            // stubs only carry impact_countries (intersected with the filter)
            // when the impact filter is active
            var impacts = (profile.impact_countries || []).filter( code => selected.includes(code));
            if(profile.lat == null || profile.long == null
                || (profile.lat === 0 && profile.long === 0))
                return;
            impacts.forEach( code =>{
                var centroid = countryCentroids[code];
                if(centroid == null)
                    return;
                impactLines.push(new google.maps.Polyline({
                    path: [{lat: profile.lat, lng: profile.long},
                           {lat: centroid[0], lng: centroid[1]}],
                    geodesic: true,
                    strokeColor: IMPACT_ORANGE,
                    strokeOpacity: 0.7,
                    strokeWeight: 1.5,
                    map: map,
                }));
            });
        });
    }

    self.impactMode.subscribe( mode =>{
        applyModeStyles();
        if(mode){
            dataLayer.push({event:'search-map-impact-mode'});
            // release the viewport restriction: impact workers can live anywhere
            params.output_bounds(undefined);
            map.setZoom(2);
            map.setCenter({lat:15,lng:10});
            ensureCountryMarkers();
        }
        Object.values(countryMarkers).forEach( cm => cm.marker.setMap(mode ? map : null));
        updateOverlay();
    });

    self.updateImpactOverlay = ko.computed({
        read: function(){
            impactCountriesObs();   //register dependency on the filter
            params.allResults();    //and on the search results
            try{
                updateOverlay();
            }catch(error){
                console.warn("failed to update impact overlay",error);
            }
        },
        disposeWhenNodeIsRemoved: true,
    });
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
            profile = await appState.da.getDisplayProfileByKey(profile.missionary_profile_key);
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
