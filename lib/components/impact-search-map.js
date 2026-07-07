
/*
    A world map for searching by 'areas of impact'. Countries are shaded by how
    many workers report an impact there; clicking a country toggles it in the
    impact-countries search filter. Once countries are selected, each matching
    worker is drawn as a bubble at their physical location with an arc to each
    selected country they impact — making workers who serve a region from
    somewhere else visible.

    INPUT Params
        - allResults: observable array of result stubs
                      {missionary_profile_key, lat, long, impact_countries}
        - impactCountries: the search filter observable (array of alpha-3 codes)
        - appState: AppState object
*/

const NAME="impact-search-map";

const SELECTED_FILL = "#335060";  // navy, matches profile impact map's location color
const DEFAULT_FILL  = "#e3e0d5";
const HEAT_FILLS    = ["#cfe3da","#a3cbba","#77b29a","#468f72","#2b6b52"]; // light -> dark
const WORKER_COLOR  = "#c96a12"; // bubbles and arcs
const BUBBLE_RADIUS = 4;   // on-screen px, kept constant across zoom levels
const ARC_WIDTH     = 1.5;
const MAX_ZOOM      = 12;

export function register(){
    console.log(NAME+" REGISTRATION");

    ko.components.register(NAME, {
        viewModel: { createViewModel: (params,componentInfo) =>
                        new ImpactSearchMap(params, jQuery(componentInfo.element).find(".impact-map-container")[0]) },
        template: "<div class='impact-map-container' style='position:relative'></div>",
    });
}

function ImpactSearchMap(params, element){
    var self=this;
    var map;
    var paintedCodes = {}; // every code we have ever colored, so repaints can reset them
    var zoomScale = 1;     // current d3 zoom scale, used to keep marks a constant screen size

    const appState = params.appState;
    const impactCountriesObs = params.impactCountries;

    dataLayer.push({event:'search-impact-map'});

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
    function countryName(code){
        var country = appState.countriesByCode && appState.countriesByCode[code];
        return (country && country.name) || code;
    }

    async function init(){
        try {
            await import(/* webpackChunkName: "impact-map-chunk" */ '../client/impact-map-chunk');
        } catch(e) {
            // A stale deploy: the client's cached shell is asking for a chunk hash
            // a later deploy removed. Reload once to pick up the current build.
            console.error('impact-map-chunk failed to load, likely a stale deploy', e);
            if (!sessionStorage.getItem('impact-map-reload')) {
                sessionStorage.setItem('impact-map-reload', '1');
                window.location.reload();
            }
            return;
        }
        sessionStorage.removeItem('impact-map-reload');

        var counts = {}; // alpha-3 -> worker_count
        try{
            (await appState.da.impactCountriesWithWorkers()).forEach( row =>{
                counts[row.code] = row.worker_count;
            });
        }catch(error){
            console.error("failed to load impact country counts",error);
        }

        var maxCount = Math.max(1, ...Object.values(counts));
        function heatFill(count){
            // log scale so a few high-count countries don't wash out the rest
            var t = Math.log(count+1)/Math.log(maxCount+1);
            return HEAT_FILLS[Math.min(HEAT_FILLS.length-1, Math.floor(t*HEAT_FILLS.length))];
        }

        var popupData = {};
        Object.keys(counts).forEach( code => popupData[code] = {workerCount: counts[code]} );

        // datamaps' 'responsive' mode sizes the map by padding-bottom: a percentage
        // of its WIDTH (not the parent's height), so the default 0.5625 (16:9)
        // aspect ratio badly under-fills a tall column. Compute a ratio from the
        // actual space available below the map's top offset to the bottom of the
        // viewport, so the map uses close to the full page height instead.
        var rect = element.getBoundingClientRect();
        var availableHeight = Math.max(300, window.innerHeight - rect.top - 24);
        var aspectRatio = element.clientWidth > 0
            ? Math.min(1.3, Math.max(0.5, availableHeight/element.clientWidth))
            : 0.5625;

        map = new Datamap({
            element: element,
            responsive: true,
            aspectRatio: aspectRatio,
            fills:{ defaultFill: DEFAULT_FILL, worker: WORKER_COLOR },
            data: popupData,
            geographyConfig: {
                popupOnHover: true,
                highlightOnHover: true,
                highlightFillColor: '#9db4a9',
                highlightBorderColor: '#335060',
                popupTemplate: function(geo, data){
                    var count = (data && data.workerCount) || 0;
                    return "<div class='hoverinfo'><b>"+geo.properties.name+"</b><br/>"+
                           count+" worker"+(count===1?"":"s")+" making an impact"+
                           "<br/><span style='font-size:0.85em'>click to "+
                           (selectedCodes().includes(geo.id) ? "remove from" : "add to")+" search</span></div>";
                },
            },
            done: function(datamap){
                datamap.svg.selectAll('.datamaps-subunit')
                    .style('cursor','pointer');
            },
        });

        jQuery(window).on('resize.impactSearchMap', () => map.resize());

        // Click handlers use jQuery delegation rather than d3: datamaps has its
        // own nested copy of d3, and mixing selections from the two instances
        // breaks their per-instance d3.event globals.
        jQuery(element).on('click','.datamaps-subunit', function(event){
            if(event.originalEvent && event.originalEvent.defaultPrevented)
                return; //end of a pan, not a click
            var code = (this.getAttribute('class') || '').split(/\s+/)
                            .find( cls => /^[A-Z]{3}$/.test(cls));
            if(code != null)
                toggleCountry(code);
        });
        jQuery(element).on('click','circle.datamaps-bubble', function(event){
            if(event.originalEvent && event.originalEvent.defaultPrevented)
                return;
            try{
                //datamaps stashes each bubble's datum in data-info
                appState.selectProfile(JSON.parse(this.getAttribute('data-info')));
            }catch(error){
                console.warn("could not open profile from map bubble",error);
            }
        });

        // ---- zoom & pan (wheel/pinch zoom, drag to pan) ----
        // datamaps draws a static SVG, so transform its layer groups with a
        // d3 zoom behavior; marks are re-scaled inversely to keep their
        // on-screen size, which keeps small countries selectable when zoomed in.
        // Note: bind through OUR d3's selection, not map.svg (see above).
        var zoomBehavior = d3.behavior.zoom()
            .scaleExtent([1,MAX_ZOOM])
            .on('zoom', function(){
                applyTransform(d3.event.translate, d3.event.scale);
            });
        d3.select(element).select('svg')
            .call(zoomBehavior)
            .on('dblclick.zoom',null); //double-click zoom jumps too far

        function applyTransform(translate,scale){
            zoomScale = scale;
            map.svg.selectAll('g')
                .attr('transform','translate('+translate+')scale('+scale+')');
            //keep line weights and bubbles a constant size on screen
            map.svg.selectAll('.datamaps-subunit').style('stroke-width', (1/scale)+'px');
            map.svg.selectAll('circle.datamaps-bubble')
                .attr('r', BUBBLE_RADIUS/scale)
                .style('stroke-width', (1/scale)+'px');
            map.svg.selectAll('path.datamaps-arc').style('stroke-width', (ARC_WIDTH/scale)+'px');
        }
        function zoomBy(factor){
            var scale = zoomBehavior.scale();
            var translate = zoomBehavior.translate();
            var newScale = Math.max(1, Math.min(MAX_ZOOM, scale*factor));
            //zoom about the center of the viewport
            var cx = element.clientWidth/2;
            var cy = element.clientHeight/2;
            var newTranslate = [ cx - (cx - translate[0]) * newScale/scale,
                                 cy - (cy - translate[1]) * newScale/scale ];
            if(newScale === 1)
                newTranslate = [0,0];
            zoomBehavior.scale(newScale).translate(newTranslate);
            applyTransform(newTranslate,newScale);
        }
        var zoomControls = jQuery(
            "<div style='position:absolute;top:10px;left:10px;z-index:10;display:flex;"+
                        "flex-direction:column;box-shadow:0 2px 6px rgba(0,0,0,.3);"+
                        "border-radius:3px;overflow:hidden;user-select:none'>"+
              "<button type='button' data-zoom='in' title='Zoom in' "+
                  "style='background:white;border:none;border-bottom:1px solid #ddd;width:32px;height:32px;font-size:18px;cursor:pointer'>+</button>"+
              "<button type='button' data-zoom='out' title='Zoom out' "+
                  "style='background:white;border:none;border-bottom:1px solid #ddd;width:32px;height:32px;font-size:18px;cursor:pointer'>&minus;</button>"+
              "<button type='button' data-zoom='reset' title='Reset zoom' "+
                  "style='background:white;border:none;width:32px;height:32px;font-size:14px;cursor:pointer'>&#8634;</button>"+
            "</div>");
        zoomControls.on('click','button', function(){
            var action = jQuery(this).data('zoom');
            if(action === 'in') zoomBy(1.6);
            else if(action === 'out') zoomBy(1/1.6);
            else zoomBy(0); //snaps to the minimum scale of 1, i.e. reset
        });
        jQuery(element).append(zoomControls);

        function paintChoropleth(){
            var fills = {};
            //reset everything previously painted, then apply heat + selection
            Object.keys(paintedCodes).forEach( code => fills[code] = DEFAULT_FILL );
            Object.keys(counts).forEach( code => fills[code] = heatFill(counts[code]) );
            selectedCodes().forEach( code => fills[code] = SELECTED_FILL );
            Object.keys(fills).forEach( code => paintedCodes[code] = true );
            map.updateChoropleth(fills);
        }

        function drawWorkers(){
            var selected = selectedCodes();
            var results = params.allResults() || [];
            var bubbles = [];
            var arcs = [];

            if(selected.length > 0)
                results.forEach( profile =>{
                    var impacts = (profile.impact_countries || []).filter( code => selected.includes(code));
                    // fuzzy results may not actually impact a selected country; leave them
                    // to the results list and only draw workers with a connection to show
                    if(impacts.length === 0
                        || profile.lat == null || profile.long == null
                        || (profile.lat === 0 && profile.long === 0))
                        return;
                    bubbles.push({
                        latitude: profile.lat,
                        longitude: profile.long,
                        radius: BUBBLE_RADIUS/zoomScale,
                        fillKey: 'worker',
                        missionary_profile_key: profile.missionary_profile_key,
                    });
                    impacts.forEach( code =>{
                        arcs.push({
                            origin: {latitude: profile.lat, longitude: profile.long},
                            destination: code, //datamaps resolves codes to country centroids
                        });
                    });
                });

            map.bubbles(bubbles,{
                popupOnHover:false,
                borderWidth: 1/zoomScale,
                borderColor: '#ffffff',
                fillOpacity: 0.85,
                highlightFillColor: '#e0913f',
                highlightBorderColor: '#ffffff',
            });
            //clicks are handled by the delegated jQuery handler above
            map.svg.selectAll('circle.datamaps-bubble')
                .style('cursor','pointer');

            map.arc(arcs,{
                strokeWidth: ARC_WIDTH/zoomScale,
                strokeColor: WORKER_COLOR,
                arcSharpness: 1.2,
                animationSpeed: 600,
            });

            // the bubble/arc layer <g>s are created lazily on first draw, so
            // re-apply the current zoom transform in case it happened while zoomed
            applyTransform(zoomBehavior.translate(), zoomBehavior.scale());
        }

        self.updateMap = ko.computed({
            read: function(){
                selectedCodes(); //register dependency on the filter
                params.allResults(); //and on the search results
                try{
                    paintChoropleth();
                    drawWorkers();
                }catch(error){
                    console.warn("failed to update impact map",error);
                }
            },
            disposeWhenNodeIsRemoved: true,
        });
    }
    init();
}

ImpactSearchMap.prototype.dispose = function(){
    jQuery(window).off('resize.impactSearchMap');
    if(this.updateMap != null)
        this.updateMap.dispose();
}
