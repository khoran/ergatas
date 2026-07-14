
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
const HOVER_FILL    = "#9db4a9";  // fill applied while the pointer is over a country
const WORKER_COLOR  = "#c96a12"; // bubbles and arcs
const BUBBLE_RADIUS = 4;   // on-screen px, kept constant across zoom levels
const ARC_WIDTH     = 1.5;
const ARC_ANIM_MS   = 600;  // datamaps arc draw animation duration
const MAX_ZOOM      = 12;
const CLICK_MOVE_THRESHOLD = 5; // px between mousedown & click; more = a pan, not a click

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

        // quantile scale: buckets by rank among observed counts, not raw magnitude,
        // so a narrow high range (e.g. 44-75) still spreads across all 5 shades
        var countValues = Object.values(counts);
        var heatScale = d3.scale.quantile()
            .domain(countValues.length ? countValues : [0])
            .range(HEAT_FILLS);
        function heatFill(count){
            return heatScale(count);
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
                // datamaps' own highlightOnHover calls moveToFront() (a DOM re-append)
                // on mouseover, which in Chrome stops the matching mouseout from firing
                // so highlights pile up. We do the highlight ourselves via pointer events
                // below (no DOM reordering); leave datamaps' highlight off.
                highlightOnHover: false,
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

        // arrowhead marker for the arcs, drawn at the destination (the impacted
        // country) and oriented along the curve so it points into that country.
        // markerUnits defaults to strokeWidth, so it tracks the arc's width and stays
        // a constant on-screen size as the map zooms (arc stroke-width is scaled too).
        map.svg.append('defs').append('marker')
            .attr('id','impact-arc-arrow')
            .attr('viewBox','0 0 10 10')
            .attr('refX',9).attr('refY',5)
            .attr('markerWidth',6).attr('markerHeight',6)
            .attr('orient','auto')
          .append('path')
            .attr('d','M0,0 L10,5 L0,10 z')
            .attr('fill',WORKER_COLOR);

        // Selection is driven off POINTER events, not click. On Chrome a d3-zoom pan
        // shifts the map under the cursor between mousedown and mouseup, so the browser
        // never synthesizes a `click` (and retargets the mouse events to the parent
        // <g class="datamaps-subunits">). Pointer events keep firing on the actual
        // country path, so treat a pointerup released close to where pointerdown
        // started as a click, and hit-test the release point to find the mark.
        // (We bind directly rather than through d3: datamaps carries its own nested
        // copy of d3, and mixing selections across the two instances breaks d3.event.)
        var downX = null, downY = null;
        function clientXY(event){
            var oe = event.originalEvent || event; //jQuery doesn't normalize pointer coords
            return { x: oe.clientX, y: oe.clientY };
        }
        jQuery(element).on('pointerdown', function(event){
            var p = clientXY(event);
            downX = p.x; downY = p.y;
        });
        function movedLikePan(x,y){
            if(downX == null) return true; //no press recorded; don't treat as a click
            var dx = x - downX, dy = y - downY;
            return Math.sqrt(dx*dx + dy*dy) > CLICK_MOVE_THRESHOLD;
        }
        jQuery(element).on('pointerup', function(event){
            var p = clientXY(event);
            if(movedLikePan(p.x, p.y))
                return; //end of a pan, not a click
            // pointerup's target can be the parent <g> (Chrome), so hit-test the point.
            // A worker bubble sits above the subunit, so elementFromPoint returns it
            // first when the release is on one.
            var node = document.elementFromPoint(p.x, p.y);
            var cls = (node && node.getAttribute && node.getAttribute('class')) || '';
            if(/(^|\s)datamaps-bubble(\s|$)/.test(cls)){
                try{
                    //datamaps stashes each bubble's datum in data-info
                    appState.selectProfile(JSON.parse(node.getAttribute('data-info')));
                }catch(error){
                    console.warn("could not open profile from map bubble",error);
                }
                return;
            }
            var code = cls.split(/\s+/).find( c => /^[A-Z]{3}$/.test(c) );
            if(code != null)
                toggleCountry(code);
        });

        // ---- hover highlight (replaces datamaps' highlightOnHover) ----
        // Track the country under the pointer ourselves and recolor it, restoring the
        // previous one first, so at most one country is ever highlighted. elementFromPoint
        // is coordinate-based, so it is immune to Chrome retargeting the event to <g>.
        // Only the FILL is changed: leaving the stroke untouched means a highlight can
        // never linger as a wrong border (e.g. a navy hover border left on a navy
        // selected country, which reads as a missing border between it and its neighbors).
        var hoverNode = null, hoverCode = null;
        function baseFill(code){
            if(selectedCodes().includes(code)) return SELECTED_FILL;
            if(counts[code] != null) return heatFill(counts[code]);
            return DEFAULT_FILL;
        }
        function restoreHover(){
            if(hoverNode == null) return;
            hoverNode.style.fill = baseFill(hoverCode);
            hoverNode = null; hoverCode = null;
        }
        // ---- worker bubble tooltip (name + picture on hover) ----
        // The bubble datum only carries missionary_profile_key, so fetch the full
        // profile on demand (cached) and show a small card near the pointer. The
        // tooltip is pointer-events:none so it never intercepts elementFromPoint.
        var tooltip = jQuery(
            "<div style='position:absolute;z-index:20;pointer-events:none;display:none;"+
                        "align-items:center;gap:8px;max-width:220px;padding:5px 8px 5px 5px;"+
                        "background:white;border-radius:6px;box-shadow:0 2px 8px rgba(0,0,0,.3);"+
                        "font-size:0.85rem;color:#335060'>"+
              "<img alt='' style='width:40px;height:40px;border-radius:50%;object-fit:cover;"+
                        "flex:0 0 auto;background:#eee'/>"+
              "<span style='white-space:nowrap;overflow:hidden;text-overflow:ellipsis'></span>"+
            "</div>")[0];
        element.appendChild(tooltip);
        var tooltipImg = tooltip.querySelector('img');
        var tooltipName = tooltip.querySelector('span');
        var tooltipKey = null, profileCache = {}, lastX = 0, lastY = 0;

        function hideTooltip(){
            tooltip.style.display = 'none';
            tooltipKey = null;
        }
        function positionTooltip(){
            var rect = element.getBoundingClientRect();
            var x = lastX - rect.left + 14, y = lastY - rect.top + 14;
            if(x + tooltip.offsetWidth > element.clientWidth)
                x = lastX - rect.left - tooltip.offsetWidth - 14;
            if(y + tooltip.offsetHeight > element.clientHeight)
                y = element.clientHeight - tooltip.offsetHeight - 4;
            tooltip.style.left = Math.max(4,x)+'px';
            tooltip.style.top  = Math.max(4,y)+'px';
        }
        function renderTooltip(profile){
            var data = profile.data || {};
            tooltipImg.src = appState.storage.profilePictureUrl(data.picture_url);
            tooltipName.textContent = profile.missionary_name
                || ((data.first_name||'')+' '+(data.last_name||'')).trim()
                || 'Worker';
            tooltip.style.display = 'flex';
            positionTooltip();
        }
        function showTooltip(node){
            var key;
            try{ key = JSON.parse(node.getAttribute('data-info')).missionary_profile_key; }
            catch(e){ hideTooltip(); return; }
            if(key == null){ hideTooltip(); return; }
            if(key === tooltipKey){ positionTooltip(); return; }
            tooltipKey = key;
            if(profileCache[key]){ renderTooltip(profileCache[key]); return; }
            tooltip.style.display = 'none'; //until the profile arrives
            appState.da.getDisplayProfileByKey(key).then( profile =>{
                profileCache[key] = profile;
                if(tooltipKey === key) //still hovering the same bubble
                    renderTooltip(profile);
            }).catch( error => console.warn("map tooltip profile fetch failed",error) );
        }

        jQuery(element).on('pointermove', function(event){
            var p = clientXY(event);
            lastX = p.x; lastY = p.y;
            var node = document.elementFromPoint(p.x, p.y);
            var cls = (node && node.getAttribute && node.getAttribute('class')) || '';
            // worker bubble → name/picture tooltip (bubbles sit above the subunits)
            if(/(^|\s)datamaps-bubble(\s|$)/.test(cls)){
                restoreHover();
                showTooltip(node);
                return;
            }
            hideTooltip();
            // country subunit → fill highlight
            var code = /(^|\s)datamaps-subunit(\s|$)/.test(cls)
                ? cls.split(/\s+/).find( c => /^[A-Z]{3}$/.test(c) ) : null;
            if(code == null){ restoreHover(); return; }
            if(code === hoverCode) return;
            restoreHover();
            hoverNode = node; hoverCode = code;
            hoverNode.style.fill = HOVER_FILL;
        });
        jQuery(element).on('pointerleave', function(){ restoreHover(); hideTooltip(); });

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

        var arcDrawSeq = 0; // guards the deferred arrowhead against a newer redraw
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
                // our own pointer tooltip handles hover; datamaps' highlightOnHover uses
                // the moveToFront re-append that sticks in Chrome (see country hover above)
                highlightOnHover:false,
                borderWidth: 1/zoomScale,
                borderColor: '#ffffff',
                fillOpacity: 0.85,
            });
            //clicks are handled by the delegated jQuery handler above
            map.svg.selectAll('circle.datamaps-bubble')
                .style('cursor','pointer');

            map.arc(arcs,{
                strokeWidth: ARC_WIDTH/zoomScale,
                strokeColor: WORKER_COLOR,
                arcSharpness: 1.2,
                animationSpeed: ARC_ANIM_MS,
            });
            // arcs are decorative and originate at the bubble centre; without this they
            // sit above the bubbles and intercept hover/click hit-testing there
            map.svg.selectAll('path.datamaps-arc').style('pointer-events','none');
            // SVG markers ignore the stroke-dashoffset draw animation, so an arrowhead
            // set now would pop in before its line arrives. Add it once the animation
            // (datamaps' 100ms delay + ARC_ANIM_MS) has finished. The sequence guard
            // stops a stale timer from arrowing arcs a newer redraw is still animating.
            var seq = ++arcDrawSeq;
            setTimeout(function(){
                if(seq !== arcDrawSeq) return;
                map.svg.selectAll('path.datamaps-arc').attr('marker-end','url(#impact-arc-arrow)');
            }, ARC_ANIM_MS + 200);

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
