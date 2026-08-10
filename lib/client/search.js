
import * as utils from './client-utils';
import * as sharedUtils from '../shared/shared-utils';
import {FTSFilterAppender, ILikeFilterAppender, OverlapsFilterAppender, LessThanFilterAppender, 
    GreaterThanFilterAppender,ContainsFilterAppender} from '../shared/data-access';
import { Filter } from './filter';

// How each filter's value is encoded into / decoded from the search URL query
// string. Keyed by the DB field name each Filter carries (see self.filter below).
//   scalar   - single string value (query, name, tax_receipt_countries)
//   num      - single number (support level bounds)
//   array    - comma-joined list of string values. selectize stores values as
//              strings and searchParamsFromJson casts the int-key fields at query
//              time, so we keep everything but bounds as strings on the way back in.
//   numArray - comma-joined list of numbers (map bounds)
//   pgSets   - special: encoded as its object keys (set names) and re-expanded on
//              load via addPGSet, so the URL never carries thousands of expanded ids.
const URL_FILTER_TYPES = {
    query: "scalar",
    name: "scalar",
    organization_keys: "array",
    job_catagory_keys: "array",
    support_level_lte: "num",
    support_level_gte: "num",
    bounds: "numArray",
    impact_countries: "array",
    marital_status: "array",
    ageGroups: "array",
    movement_stages: "array",
    tag_keys: "array",
    cause_keys: "array",
    people_id3_codes: "array",
    pgSets: "pgSets",
    rol3_codes: "array",
    cultural_distances: "array",
    org_currencies: "array",
    tax_receipt_countries: "scalar",
    missionary_profile_keys: "array",
};
// Keep the whole URL under nginx's default large_client_header_buffers (8k), with
// headroom for the "GET …HTTP/1.1" request-line framing.
const URL_MAX_BYTES = 8000;
const DEFAULT_RESULTS_TEMPLATE = "list-results-template";
const DEFAULT_SORT = "rank,desc"; //Relevance; omitted from the URL like the default view

export class Search {

    constructor(appBase,da){
        var self=this;

        self.FUZZY_THRESHOLD = 100;

        self.appBase = appBase;
        self.da = da;
        self.profiles = ko.observableArray();
        self.numSearchResults = ko.observable();
        self.allResults = ko.observable();
        self.searchInProgress = ko.observable(false).extend({rateLimit:1000});
        self.sortBy = ko.observable(DEFAULT_SORT);
        self.searchPageNumber = ko.observable();
        self.searchResultsTemplate =  ko.observable();
        self.pageSize = utils.computePageSize();

        self.searchPages = ["search","org"]; // urls where the search is active

        //start true to trigger first search
        self.outstandingChanges = true;

        var initializing = true;

        self.filter = {
            query: new Filter("query",new FTSFilterAppender()),
            name: new Filter("name",new ILikeFilterAppender(),500),
            organizations: new Filter("organization_keys",null),
            skills: new Filter("job_catagory_keys",new OverlapsFilterAppender()),
            supportLevelLte: new Filter("support_level_lte",new LessThanFilterAppender()),
            supportLevelGte: new Filter("support_level_gte",new GreaterThanFilterAppender()),
            bounds: new Filter("bounds",null),
            impactCountries: new Filter("impact_countries",null),
            maritalStatus: new Filter("marital_status",null),
            ageGroups: new Filter("ageGroups",null),
            movementStages: new Filter("movement_stages",null),
            tags: new Filter("tag_keys",null),
            causes: new Filter("cause_keys",null),
            peopleGroups: new Filter("people_id3_codes",null),
            pgSets: new Filter("pgSets",null), //an object of arrays of people_id3 values
            languages: new Filter("rol3_codes",null),
            culturalDistances: new Filter("cultural_distances",null),
            orgCurrencies: new Filter("org_currencies",null),
            taxReceiptCountries: new Filter("tax_receipt_countries",null),
            missionaryProfiles: new Filter("missionary_profile_keys",null),
        };
        self.filter.bounds.value = self.filter.bounds.obs().extend({arrayCompare:{}})

        //set true while rehydrating from the URL so the URL-writer below doesn't
        //fight the reader (applyQueryString).
        self.suppressURLUpdate = false;

        //this.debugChanges();

        //setup dependencies on any search related parameter and trigger a new search
        // when anything changes
        ko.computed(function(){
            //poke each filter value (via isDefined), and sortBy, to register dependency on value changes
            var sortBy = self.sortBy();

            console.log("FILTER VALUE CHANGE, resetting page to 0");

            for( var f in self.filter){
                const filter = self.filter[f];
                self.filter.hasOwnProperty(f) && filter.isDefined();
            }


            //whenever a filter value changes, reset the page number to 0
            self.searchPageNumber(0);
            self.profiles.removeAll();
            self.allResults(undefined);
            //also take the opportunity to re-compute the page size in case the screen size has changed
            self.pageSize = utils.computePageSize();

            if(initializing){ // don't trigger anything on first run
                console.log(" search dependency registration initializing");
                return;
            }

            //this needs to stay below the above filter block for dependency registration
            if(self.searchPages.includes(utils.getCurrentRootPage(self.appBase)) )
                self.doSearch();
            else{
                console.log("NOT ON SEARCH PAGE, skipping search");
                self.outstandingChanges = true;
            }
        
        }); //.extend({rateLimit:300,method:"notifyWhenChangesStop"});

        //extendPage
        ko.computed(async function(){

            var pageSize = self.pageSize;
            var page = self.searchPageNumber();
            var allKeys = self.allResults.peek(); //don't create dependency
            var start,end;
            var searchResults;
            var pageKeys;
            var reordered = [];
            var profile;

            //console.log("EXTENDING PAGE. pageSize: "+pageSize+", page ",page);
            
            if( allKeys != null && allKeys.length > 0 && ( page === 0 || (pageSize*page) < allKeys.length)){
                start = pageSize * page;
                end = pageSize * (page+1) ;
                pageKeys = allKeys.slice(start,end).map((x) => x.missionary_profile_key);
                //console.log("fetching range "+start+","+end,pageKeys );
                
                searchResults = await self.da.getDisplayProfilesByKey(pageKeys);
                //keys come back in a different order, so reshuffle them here.
                // Hard to sort in db as required field are not present in this view
                for(var i in pageKeys){
                    profile = searchResults.find((profile) => profile.missionary_profile_key === pageKeys[i]);
                    if(profile)
                        reordered.push(profile);
                    else
                        console.warn("failed to find missionary_profile_key "+pageKeys[i]+" in result set while extending page");
                }
                self.profiles(self.profiles.peek().concat(reordered));
                //page 0 is the initial result load; page>0 means the visitor paginated /
                //scrolled for more — a traffic-quality signal for smart bidding.
                if(page > 0)
                    dataLayer.push({event:'search_engagement',action:'paginate',page:page});
            }
        });

        this.onLastPage = ko.computed(function(){
            return self.allResults() == null
                   || ((self.pageSize * (self.searchPageNumber()+1)) >= self.allResults().length);
        });

        //keep the URL query string in sync with the full filter + view state, so a
        //reload / shared link reproduces the same results and view. Kept separate
        //from the search-triggering computed above so the two concerns don't tangle.
        ko.computed(function(){
            //register a dependency on every filter value plus sort + view template
            for( var f in self.filter){
                if(self.filter.hasOwnProperty(f))
                    self.filter[f].isDefined();
            }
            var sortBy = self.sortBy();
            var template = self.searchResultsTemplate();

            if(initializing || self.suppressURLUpdate)
                return;
            //only rewrite the URL on the search page itself - the embedded search on
            //org pages ("org" is also in searchPages) must keep its own /org/<slug> URL
            if(utils.getCurrentRootPage(self.appBase) !== "search")
                return;

            var qs = self.toQueryString();
            history.replaceState({},'',"/search" + (qs ? "?"+qs : ""));
        });

        initializing=false;
    }
    toString(){
        return "Search Object";
    }

    /**
     * convert set of filters to param object for primarySearch
     */
    genSearchParams(filterSet){
        return sharedUtils.searchParamsFromJson(this.filterValues(filterSet));
    }
    filterValues(filterSet){
        var params = {};
        Object.values(filterSet).forEach( filter =>{
            if(filter.isDefined())
                params[filter.name()] = filter.obs()();
        });
        return params;
    }

    // Serialize the current filter + view state to a URL query string (no leading
    // "?"). pgSets is encoded by set name; the whole string is trimmed to stay under
    // the URL byte ceiling by dropping the longest param(s) if needed.
    toQueryString(){
        const params = new URLSearchParams();
        const values = this.filterValues(this.filter); //omits undefined/empty filters

        Object.keys(values).forEach( key =>{
            const value = values[key];
            if(value == null) return;
            if(URL_FILTER_TYPES[key] === "pgSets"){
                const names = Object.keys(value);
                if(names.length > 0) params.set("pgSets", names.join(","));
            }else if(Array.isArray(value)){
                if(value.length > 0) params.set(key, value.join(","));
            }else{
                params.set(key, String(value));
            }
        });

        if(this.sortBy() && this.sortBy() !== DEFAULT_SORT) params.set("sort", this.sortBy());
        const template = this.searchResultsTemplate();
        if(template && template !== DEFAULT_RESULTS_TEMPLATE) params.set("view", template);

        //stay under the URL byte ceiling: silently drop the longest key=value until
        //it fits. Only the URL is trimmed - the live in-session filters are untouched.
        let str = params.toString();
        while(str.length > URL_MAX_BYTES){
            let longestKey = null, longestLen = -1;
            for(const [k,v] of params.entries()){
                const len = k.length + 1 + encodeURIComponent(v).length;
                if(len > longestLen){ longestLen = len; longestKey = k; }
            }
            if(longestKey == null) break;
            params.delete(longestKey);
            str = params.toString();
        }
        return str;
    }

    // Rehydrate filter + view state from a URL query string (e.g. location.search).
    // server is needed to re-expand pgSets via addPGSet.
    applyQueryString(search,server){
        const self = this;
        const params = new URLSearchParams(search || "");

        //If the URL already matches the current in-memory filter + view state, do
        //nothing. This preserves the old behavior where returning to the search page
        //(e.g. via Back) does NOT re-run the search when the filters haven't changed.
        //A genuinely different URL state still falls through and rehydrates.
        if(params.toString() === self.toQueryString())
            return;

        const paramsObj = {};

        Object.keys(URL_FILTER_TYPES).forEach( field =>{
            if(field === "pgSets") return; //handled below
            if(!params.has(field)) return;
            const raw = params.get(field);
            const type = URL_FILTER_TYPES[field];
            if(type === "num")
                paramsObj[field] = parseInt(raw);
            else if(type === "numArray")
                paramsObj[field] = raw.split(",").map( x => parseFloat(x));
            else if(type === "array")
                paramsObj[field] = raw.split(",");
            else //scalar
                paramsObj[field] = raw;
        });

        self.suppressURLUpdate = true;
        try{
            //loadSavedSearch clears all filters (except bounds) + sortBy, then rehydrates
            self.loadSavedSearch(paramsObj);
            if(!params.has("bounds"))
                self.filter.bounds.clear(); //clearFilters skips bounds; clear stale value
            self.sortBy(params.get("sort") || DEFAULT_SORT);
            self.searchResultsTemplate(params.get("view") || DEFAULT_RESULTS_TEMPLATE);
        }finally{
            self.suppressURLUpdate = false;
        }

        //re-expand any people-group sets by name (async; appends to the cleared pgSets)
        const pgSets = params.get("pgSets");
        if(pgSets && server != null){
            pgSets.split(",").forEach( name =>{
                if(name) self.addPGSet(name,server);
            });
        }
    }

    //savedSearch should be an object as generated by filterValues
    loadSavedSearch(savedSearch){
        console.log("loading saved search",savedSearch);

        const filters = Object.values(this.filter);
        const getFilter = (name) => filters.find( f => f.name() === name)

        this.clearFilters();

        console.log("ss: "+JSON.stringify(savedSearch));
        console.log("ss keys: "+JSON.stringify(Object.keys(savedSearch)));
        Object.keys(savedSearch).forEach( paramName =>{

            var filter = getFilter(paramName);
            console.log("loading param "+paramName,filter);
            if(filter != null){
                filter.obs()(savedSearch[paramName]);
            }
        })

    }
    async doSearch(){
        var self=this;
        var searchResults;
        var pageSize = self.pageSize;
        var sortBy = self.sortBy() || "rank,desc";
        var params = self.genSearchParams(self.filter);

        //console.log("doing search ============================",params); 
        self.outstandingChanges = false;
        self.searchInProgress(true);
        try{
            searchResults = await self.da.primarySearch(params,pageSize,sortBy,false,false,true);
            //console.log("filtered search results:",searchResults);
            this.setResults(searchResults,params);
            self.searchInProgress(false);
        }catch(error){
            self.searchInProgress(false);
            console.error("profile search failed: "+error.message,error);
            alertify.error("Search failed");
        }
    }
    async setResults(searchResults,params){
        const self=this;

        if(searchResults!= null){
            if(searchResults.all_results == null || searchResults.all_results.length === 0){
                searchResults.all_results=[];
                searchResults.first_page =[];
            }

            self.allResults(searchResults.all_results)
            self.numSearchResults(searchResults.all_results.length);
            self.profiles(searchResults.first_page);

            if(params != null && self.numSearchResults() < self.FUZZY_THRESHOLD)
                await self.addFuzzyResults(searchResults,params,self.pageSize,self.sortBy() || "rank,desc");
        }


    }

    async addFuzzyResults(searchResults,params,pageSize,sortBy){
        var self=this;
        //this only gets called if not too many main search results are returned.
        // so we can assume that self.allResults is not too big.
        //NOTE: don't use self.allResults and others , as there will be a race condition
        // between doSearch and addFuzzyResults when searches are performed rapidly (from map).

        console.log("adding in fuzzy results");

        var mainKeys = new Set(searchResults.all_results.map(x=>x.missionary_profile_key));
        var fuzzyResults= await self.da.primarySearch(params,pageSize,sortBy,true,false,true);

        if(fuzzyResults.all_results == null || fuzzyResults.all_results.length == 0)
            return;

        fuzzyResults.all_results = fuzzyResults.all_results.filter(x => ! mainKeys.has(x.missionary_profile_key));
        fuzzyResults.first_page= fuzzyResults.first_page.filter(x => ! mainKeys.has(x.missionary_profile_key));
        console.log("num de-duped fuzzy results: "+fuzzyResults.all_results.length);
        console.log("num de-duped fuzzy first page: "+fuzzyResults.first_page.length);


        //cancat fuzzy allResults to main allResults, after removing dups.
        self.allResults(searchResults.all_results.concat(fuzzyResults.all_results));

        //if main first_page is less than pageSize, fill it upt to pageSize from fuzzy first_page
        // else, just leave first_page alone
        if(searchResults.first_page.length < pageSize){
            console.log("adding "+(pageSize - searchResults.first_page.length)+" fuzzy results to first page");
            const fuzzyToAdd = fuzzyResults.first_page.slice(0,pageSize - searchResults.first_page.length);
            if(fuzzyToAdd.length > 0){
                self.profiles(searchResults.first_page.concat([{isSeparator: true}], fuzzyToAdd));
            }else{
                self.profiles(searchResults.first_page);
            }
        }
        self.numSearchResults(self.allResults().length);


    }


    //search with no filters
    doBareSearch(){
        this.clearFilters();
        console.log("doing bare search");
        this.doSearch();
    }
    setSearch(filterName, value){
        this.clearFilters();
        console.log("setting up new search with filter "+filterName+" set to ",value);
        this.filter[filterName].obs()(value);

    }
    setSort(sortField){
        this.sortBy(sortField);
    }
    async saveSearch(name,user_key,originalName){
        console.log("saving search "+name+" for user_key "+user_key);

        var searchParams = this.filterValues(this.filter);
        var data = {
            name: name,
            params: searchParams,
        }
        if(user_key == null){
            window.localStorage.setItem(name,JSON.stringify(searchParams));
            return;
        }
        // Update the record identified by its ORIGINAL name when renaming, so we
        // patch that row (data.name = new name) instead of creating a duplicate
        // under the new name. getSavedSearchesByName throws when nothing matches.
        var lookupName = originalName != null ? originalName : name;
        var existing = null;
        try{
            existing = await this.da.getSavedSearchesByName(user_key,lookupName);
        }catch(e){
            existing = null; // not found -> create below
        }
        if(existing != null){
            await this.da.updateSavedSearch(existing.saved_search_key,data);
        }else{
            await this.da.createSavedSearch(user_key,data);
            dataLayer.push({event:'search-saved'});
        }
        history.pushState({},null,"/search/saved/"+user_key+"/"+encodeURIComponent(name));
    }
    updateQueryResults(){
        if(this.outstandingChanges === true){
            console.log("outstanding changes found, running query");
            this.doSearch();
        }
    }
    setQuery(query){
        this.filter.query.obs()(query);
    }
    async addPGSet(setName,server){
        var self=this;
        var ids = await server.postJson("/api/peopleGroupIds",{setName:setName});
        //console.log("adding "+fpgIDs.length+" people groups");

        var pgSets = self.filter.pgSets.obs()();
        if(pgSets== null)
            pgSets = {};
        pgSets[setName]= ids;
        self.filter.pgSets.obs()(pgSets);
    }
    refreshSearchResults(){
        //this will cause a new search to be done next time the search page is shown
        this.outstandingChanges=true;
    }
    removeFromFilter(obs,itemKey,castToInt=true){
        console.log("removing "+itemKey+" from filter ",obs());
        if(castToInt)
            itemKey = parseInt(itemKey);

        if(obs() == null)
            return;

        obs(obs().filter((key) => {
            return (castToInt ?  parseInt(key) : key) !== itemKey;
        }));
        if(obs().length === 0)
            obs(undefined);
    };
    clearFilters(){
        for( var f in this.filter){
            const filter = this.filter[f];
            if(this.filter.hasOwnProperty(f) 
               && filter.isDefined()
               && filter.name() != "bounds"){ // don't clear the map filter
                filter.clear();
            }
        }
        this.sortBy(DEFAULT_SORT);
    };

    debugChanges(){
        //setup subscriptions to watch value changes
        for( var f in this.filter){
            const filter = this.filter[f];
            if(this.filter.hasOwnProperty(f) ){
                utils.watchChanges(filter.name(),filter.obs());
            }
        }
        utils.watchChanges("sortBy", this.sortBy);
 
    }


}
