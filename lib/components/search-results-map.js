import * as mapUtils from '../map';
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
export async function register(){
    console.log("registering search-results-map component");


    ko.components.register('search-results-map', {
        viewModel: main,
        template: "<div id='search-results-map'  style='height:90vh;'></div>"
    });
}
function main(params) {
            var self=this;
            console.log("defining viewmodel for SEARCH-RESULTS-MAP",params);
            dataLayer.push({event:'search-map'});
            mapUtils.initMap().then(function(platform){

                //const platform = mapUtils.getPlatform();

                const defaultLayers = platform.createDefaultLayers();
                const appState = params.appState;

                //SETUP MAP

                const map = new H.Map(jQuery('#search-results-map')[0],
                    defaultLayers.raster.normal.map, {
                    center: { lat: 0, lng:0 },
                    zoom: 1,
                    pixelRatio: window.devicePixelRatio || 1
                });
                setMapViewBounds(map,params.output_bounds());
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



                var clusteredDataProvider = createClusterLayer(ui,appState);

                // Create a layer tha will consume objects from our clustering provider
                map.addLayer(new H.map.layer.ObjectLayer(clusteredDataProvider));


                async function searchByBounds(){
                    var ne,sw, bound;
                    var searchResults;
                    var bound = map.getViewModel().getLookAtData().bounds.getBoundingBox();

                    //console.log("bounds: ",bound);
                    params.output_bounds([
                        bound.getTop(), bound.getRight(),
                        bound.getBottom(), bound.getLeft() ] );
                }

                var viewChanging;
                map.addEventListener('mapviewchange', function () {
                    //console.log("map view changed event");
                    window.clearTimeout(viewChanging);
                    viewChanging = setTimeout(searchByBounds,100);
                });

                // UPDATE WHEN PROFILES LIST CHANGES
                self.updateMap = ko.computed({
                    read:function(){
                        var profiles = params.allResults();
                        //console.log("search-results-map: profiles updated");

                        //console.log("updating map results",profiles);
                        //remove any existing markers
                        map.removeObjects(map.getObjects());

                        try{
                            if(profiles != null )
                                addClusters(profiles,clusteredDataProvider);
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
function setMapViewBounds(map,bounds){

    if(bounds == null) return;
    var bbox = new H.geo.Rect(bounds[0],bounds[3],bounds[2],bounds[1]);
    map.getViewModel().setLookAtData({
        bounds: bbox
    });
}
function addClusters (profiles,clusteredDataProvider){
    var dataPoints = profiles.map(function (item) {
        if(item.long > 180)
            item.long = 180;
        if(item.long < -180)
            item.long = -180;
        return new H.clustering.DataPoint(item.lat, item.long,null,item);
    });

    // Create a clustering provider with custom options for clusterizing the input
    clusteredDataProvider.setDataPoints(dataPoints);

};
function createClusterLayer(ui,appState){
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
    clusteredDataProvider.addEventListener('tap', async function(event){
        var position = event.target.getGeometry();
        // Get the data associated with that marker
        var data = event.target.getData();
        if(bubble == null){
            bubble = new H.ui.InfoBubble(position,{content:""});
            ui.addBubble(bubble);
        }
        bubble.setContent("<div class='text-center'><img width=25 src='/img/block-spinner2.svg'/></div>");
                  
        bubble.setPosition(position);
        console.log("profile data: ",data);
        try{
            var profiles;
            if(Array.isArray(data))
                profiles = await appState.da.getProfilesByKey(data.map((p) => p.missionary_profile_key));
            else
                profiles = await appState.da.getProfileByKey(data.missionary_profile_key);
            bubble.setContent(bubbleContent(profiles,appState));
            bubble.open();
        }catch(error){
            console.error("failed to get profile data for map bubble for missionary_profile_key "+data.missionary_profile_key,error);
        }
    });

    return clusteredDataProvider;

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
                return appState.storage.profilePictureUrl(profile.data.picture_url);
            },
            select: function(profile){
                appState.selectProfile(profile);
            }
        },html);

    }else{
        var profile = data;
        var imgBind="visible: fullUrl, attr:{src: fullUrl },click: select";
        html = jQuery(`<div style='text-align:center'><img width=100 class='cursor-pointer' data-bind='${imgBind}'/>`+
                    `<br><a href='#' data-bind='click: select'>${profile.missionary_name}</a></div>`)[0];
        ko.applyBindings({
            select: function(){
                appState.selectProfile(profile);
            },
            fullUrl: appState.storage.profilePictureUrl(profile.data.picture_url),
        },html);


    }

    return html;
}
