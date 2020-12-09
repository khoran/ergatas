import * as mapUtils from '../map';
/*
    INPUT Params
        - profiles: observable array of profiles objects
        - mapPlatform: 'platform' object for HERE map
        - controls:  an object with several helper functions needed. These should be:
            - selectProfile: a function that takes a profile and navigates to its detail page
            - pictureUrl: a function that takes the relative profile_url from a profile object 
                          and returns the full URL.
            - searchByArea: a function that takes coords NE lat, NE long, SW lat, SW long,
                            and returns a list of profile keys in that area
    OUTPUT Params
        - output_profilesInArea: provide an observabel, will be set with an array of missionary_profile_key values
*/
export async function register(){
    console.log("registering search-results-map component");


    ko.components.register('search-results-map', {
        viewModel: function(params) {
            var self=this;
            console.log("defining viewmodel for SEARCH-RESULTS-MAP",params);
            dataLayer.push({event:'search-map'});
            const platform = mapUtils.getPlatform();

            //const platform = params.mapPlatform();
            const defaultLayers = platform.createDefaultLayers();
            const profileControls= params.controls;

            //SETUP MAP

            const map = new H.Map(jQuery('#search-results-map')[0],
                //defaultLayers.vector.normal.map, {
                defaultLayers.raster.normal.map, {
                center: { lat: 0, lng:0 },
                zoom: 1,
                pixelRatio: window.devicePixelRatio || 1
            });
            window.addEventListener('resize', () => map.getViewPort().resize());
            const mapEvents = new H.mapevents.MapEvents(map);
            const behavior = new H.mapevents.Behavior(mapEvents);
            //const ui = H.ui.UI.createDefault(map, defaultLayers);
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



            var clusteredDataProvider = createClusterLayer(ui,profileControls);

            // Create a layer tha will consume objects from our clustering provider
            map.addLayer(new H.map.layer.ObjectLayer(clusteredDataProvider));


            async function serachByBounds(){
                var ne,sw, bound;
                var searchResults;
                var bound = map.getViewModel().getLookAtData().bounds.getBoundingBox();

                //console.log("bounds: ",bound);
                try{
                    searchResults = await profileControls.searchByArea(
                        bound.getTop(), bound.getRight(),
                        bound.getBottom(), bound.getLeft());
                    //console.log("found results: ",searchResults);
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
                //console.log("search-results-map: profiles updated");

                //console.log("updating map results");
                //remove any existing markers
                map.removeObjects(map.getObjects());

                addClusters(profiles,clusteredDataProvider);
            });


        },
        template: "<div id='search-results-map'  style='height:90vh;'></div>"
    });
}
function addClusters (profiles,clusteredDataProvider){
    var dataPoints = profiles.map(function (item) {
        return new H.clustering.DataPoint(item.data.location_lat, item.data.location_long,null,item);
    });

    // Create a clustering provider with custom options for clusterizing the input
    clusteredDataProvider.setDataPoints(dataPoints);

};
function createClusterLayer(ui,profileControls){
    var bubble;
    var clusteredDataProvider = new H.clustering.Provider([], {
        clusteringOptions: {
            // Maximum radius of the neighbourhood
            eps: 32,
            // minimum weight of points required to form a cluster
            minWeight: 2,
        },
    });
    var defaultTheme   = clusteredDataProvider.getTheme();
    clusteredDataProvider.setTheme({
        getClusterPresentation: function(cluster){
            var clusterMarker = defaultTheme.getClusterPresentation(cluster);
            var profiles = [];
            cluster.forEachDataPoint((dataPoint) => profiles.push(dataPoint.getData()));
            clusterMarker.setData(profiles);
            return clusterMarker;
        },
        getNoisePresentation: function (noisePoint) {
            var noiseMarker = new H.map.Marker(noisePoint.getPosition(), {
                // Set min/max zoom with values from the cluster,
                // otherwise clusters will be shown at all zoom levels:
                min: noisePoint.getMinZoom(),
            });
            noiseMarker.setData(noisePoint.getData());
            return noiseMarker;
        },
    });
    clusteredDataProvider.addEventListener('tap', function(event){
        var position = event.target.getGeometry();
        // Get the data associated with that marker
        var data = event.target.getData();
        if(bubble == null){
            bubble = new H.ui.InfoBubble(position,{content:""});
            ui.addBubble(bubble);
        }
        bubble.setPosition(position);
        bubble.setContent(bubbleContent(data,profileControls));
        bubble.open();
    });

    return clusteredDataProvider;

}

function bubbleContent(data,profileControls){ //data could be a single profile or array or profiles
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
                return profileControls.pictureUrl(profile.data.picture_url);
            },
            select: function(profile){
                profileControls.selectProfile(profile);
            }
        },html);

    }else{
        var profile = data;
        var imgBind="visible: fullUrl, attr:{src: fullUrl },click: select";
        html = jQuery(`<div style='text-align:center'><img width=100 class='cursor-pointer' data-bind='${imgBind}'/><br><a href='#' data-bind='click: select'>${profile.data.first_name} ${profile.data.last_name}</a></div>`)[0];
        ko.applyBindings({
            select: function(){
                profileControls.selectProfile(profile);
            },
            fullUrl: profileControls.pictureUrl(profile.data.picture_url),
        },html);


    }

    return html;
}
