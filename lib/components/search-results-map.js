/*
    INPUT Params
        - profiles: observable array of profiles objects
        - mapPlatform: 'platform' object for HERE map
        - controls: a function that takes a profile and navigates to its detail page
    OUTPUT Params
        - output_profilesInArea: provide an observabel, will be set with an array of missionary_profile_key values
*/
export function register(){
    ko.components.register('search-results-map', {
        viewModel: function(params) {
            var self=this;
            console.log("defining viewmodel for SEARCH-RESULTS-MAP",params);
            dataLayer.push({event:'search-map'});

            const platform = params.mapPlatform();
            const defaultLayers = platform.createDefaultLayers();
            const profileControls= params.controls;

            //SETUP MAP

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


            //map.addEventListener("tap", function (event) {

            //});

            async function serachByBounds(){
                var ne,sw, bound;
                var searchResults;
                var bound = map.getViewModel().getLookAtData().bounds.getBoundingBox();

                //console.log("bounds: ",bound);
                ne=bound.getBottomRight();
                sw=bound.getTopLeft();
                //console.log("bounds: ",ne,sw);
                try{
                    searchResults = await params.da.profileSearchByArea(ne.lat,ne.lng,sw.lat,sw.lng);
                    console.log("found results: ",searchResults);
                    params.output_profilesInArea(searchResults);
                }catch(error){
                    console.error("profile search by area failed: ",error);
                    alertify.error("Failed to search by map location");
                }
            }

            var viewChanging;
            map.addEventListener('mapviewchange', function () {
                //console.log("map view changed event");
                window.clearTimeout(viewChanging);
                viewChanging = setTimeout(serachByBounds,100);
            });

            // UPDATE WHEN PROFILES LIST CHANGES
            ko.computed(function(){
                var profiles = params.profiles();
                var bound;
                var ne,sw;
                console.log("search-results-map: profiles updated");

                console.log("updating map results");
                //remove any existing markers
                map.removeObjects(map.getObjects());

                //add profiles to map
                profiles.forEach(function(profile){
                    //console.log("profile lat long: ",profile.data.location_lat, profile.data.location_long);
                    var position = {
                            lat:profile.data.location_lat, 
                            lng: profile.data.location_long
                    };
                    var marker = new H.map.Marker(position );
                    marker.addEventListener("tap",function(event){

                        //clear bubbles
                        ui.getBubbles().forEach((bubble) =>{
                            ui.removeBubble(bubble); });

                        var imgBind="visible: fullUrl, attr:{src: fullUrl }";
                        var html = jQuery(`<div><img width='100px' data-bind='${imgBind}'><br><a href='#' data-bind='click: select'>${profile.data.first_name} ${profile.data.last_name}</a></div>`)[0];
                        ko.applyBindings({
                            select: function(){
                                profileControls.selectProfile(profile);
                            },
                            fullUrl: profileControls.pictureUrl(profile.data.picture_url),
                        },html);

                        var bubble = new H.ui.InfoBubble(position, { content: html, });
                        ui.addBubble(bubble);

                    });
                    map.addObject(marker );

                });

            });

        },
        template: "<div id='search-results-map'  style='height:90vh;'></div>"
    });
}