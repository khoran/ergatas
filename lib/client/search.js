
import * as utils from './client-utils';
import * as sharedUtils from '../shared/shared-utils';
import {FTSFilterAppender, ILikeFilterAppender, OverlapsFilterAppender, LessThanFilterAppender, 
    GreaterThanFilterAppender,ContainsFilterAppender} from '../shared/data-access';
import { Filter } from './filter';

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
        self.sortBy = ko.observable();
        self.searchPageNumber = ko.observable();
        self.searchResultsTemplate =  ko.observable();
        self.pageSize = utils.computePageSize();

        self.searchPages = ["search"]; // urls where the search is active

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
            missionaryProfiles: new Filter("missionary_profile_keys",null),
        };
        self.filter.bounds.value = self.filter.bounds.obs().extend({arrayCompare:{}})

        //update URL to match any query value
        self.filter.query.obs().subscribe(function(newValue){
            var path = window.location.pathname;
            if(path.startsWith("/search/") || path=== "/search")
                history.replaceState({},'',"/search/"+(newValue || ""));
        });

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
            }
        });

        this.onLastPage = ko.computed(function(){
            return self.allResults() == null 
                   || ((self.pageSize * (self.searchPageNumber()+1)) >= self.allResults().length);
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
            self.profiles(searchResults.first_page.concat(fuzzyResults.first_page.slice(0,pageSize - searchResults.first_page.length)));
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
    async saveSearch(name,user_key){
        console.log("saving search "+name+" for user_key "+user_key);

        var searchParams = this.filterValues(this.filter);
        var data = {
            name: name,
            params: searchParams,
        }
        if(user_key == null){
                window.localStorage.setItem(name,JSON.stringify(searchParams));
        }else{
            try{
                var savedSearch = await this.da.getSavedSearchesByName(user_key,name)
                if(savedSearch != null)
                    return this.da.updateSavedSearch(savedSearch.saved_search_key,data);
            }catch{
                var promise = this.da.createSavedSearch(user_key,data);

                history.pushState({},null,"/search/saved/"+name);

                dataLayer.push({event:'search-saved'});
                

                return promise;
            }
        }
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
        this.sortBy(undefined);
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
