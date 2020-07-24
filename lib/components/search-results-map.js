/*
    INPUT Params
        - profiles: observable array of profiles objects
        - mapPlatform: 'platform' object for HERE map
    OUTPUT Params
        - output_profilesInArea: provide an observabel, will be set with an array of missionary_profile_key values
*/
export function register(){
    ko.components.register('search-results-map', {
        viewModel: function(params) {
            var self=this;
            console.log("defining viewmodel for SEARCH-RESULTS-MAP",params);

            //self.resultMarkers=[];
            //self.doSearchWhenIdle=false;
            const platform = params.mapPlatform();
            const defaultLayers = platform.createDefaultLayers();

            //SETUP MAP
            console.log("map div: ",jQuery('#search-results-map')[0]);
//            self.resultsMap = new google.maps.Map(jQuery('#search-results-map')[0],  {
//                    center:  new google.maps.LatLng(0,0),
//                    zoom: 1 ,
//                    options:{
//                        gestureHandling: 'greedy',
//                    }
//                });

            const map = new H.Map(jQuery('#search-results-map')[0],
                defaultLayers.vector.normal.map, {
                center: { lat: 0, lng:0 },
                zoom: 1,
                pixelRatio: window.devicePixelRatio || 1
            });
            window.addEventListener('resize', () => map.getViewPort().resize());
            const mapEvents = new H.mapevents.MapEvents(map);
            const behavior = new H.mapevents.Behavior(mapEvents);
            const ui = H.ui.UI.createDefault(map, defaultLayers);

            async function serachByBounds(){
                var ne,sw, bound;
                var searchResults;
                //self.doSearchWhenIdle=false;
                var bound = map.getViewModel().getLookAtData().bounds.getBoundingBox();

                console.log("bounds: ",bound);
                //bound = self.resultsMap.getBounds();
                ne=bound.getBottomRight();
                sw=bound.getTopLeft();
                console.log("bounds: ",ne,sw);
                try{
                    searchResults = await params.da.profileSearchByArea(ne.lat,ne.lng,sw.lat,sw.lng);
                    console.log("found results: ",searchResults);
                    //viewModel.filter.profilesInCurrentMap(searchResults);
                    params.output_profilesInArea(searchResults);
                }catch(error){
                    console.error("profile search by area failed: ",error);
                    alertify.error("Failed to search by map location");
                }
            }

            //add map drag listener
            //self.resultsMap.addListener("bounds_changed",function(){
            //    console.log("============= bounds changed ====================");
            //    self.doSearchWhenIdle=true;
            //});
            //map.addEventListener("dragend",async function(){
            //    searchByBounds();
            //});
            var viewChanging;
            map.addEventListener('mapviewchange', function () {
                console.log("map view changed event");
                window.clearTimeout(viewChanging);
                viewChanging = setTimeout(serachByBounds,100);
            });

            // UPDATE WHEN PROFILES LIST CHANGES
            ko.computed(function(){
                var profiles = params.profiles();
                var bound;
                var ne,sw;
                console.log("search-results-map: profiles updated");
                //if(self.resultsMap == null)
                    //return;

                console.log("updating map results");
                //remove any existing markers
                map.removeObjects(map.getObjects());
                //while(self.resultMarkers.length > 0){
                    //self.resultMarkers.pop().setMap(null);
                //}

                //add profiles to map
                profiles.forEach(function(profile){
                    //console.log("profile lat long: ",profile.data.location_lat, profile.data.location_long);
                    map.addObject( new H.map.Marker(
                        {
                            lat:profile.data.location_lat, 
                            lng: profile.data.location_long
                        }));

                    //self.resultMarkers.push(
                    //    new google.maps.Marker({
                    //        map: self.resultsMap,
                    //        position: {
                    //            lat: profile.data.location_lat,
                    //            lng: profile.data.location_long,
                    //        }
                    //    })
                    //);
                });

                //bound = new google.maps.LatLngBounds();
                //self.resultMarkers.forEach(function(m){
                //    bound.extend(m.position);
                //});
                //ne=bound.getNorthEast();
                //sw=bound.getSouthWest();
                //if(ne.lng() - sw.lng() < 20){
                //    //bounds too small
                //    bound.extend(new google.maps.LatLng(ne.lat()+5,ne.lng()));
                //    bound.extend(new google.maps.LatLng(sw.lat()+5,sw.lng()));
                //}
                //self.resultsMap.fitBounds(bound);
            });




        },
        template: "<div id='search-results-map'  style='height:100%;'></div>"
    });
}