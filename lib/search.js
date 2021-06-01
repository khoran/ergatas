
import * as utils from './client-utils';
import {FTSFilterAppender, ILikeFilterAppender, OverlapsFilterAppender, LessThanFilterAppender, 
    GreaterThanFilterAppender,ContainsFilterAppender} from './data-access';
import { Filter } from './filter';

export class Search {
    constructor(appBase,da){
        var self=this;
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
            impactCountries: new Filter("impact_countries",null),
            peopleGroups: new Filter("people_id3_codes",null),
            languages: new Filter("rol3_codes",null),
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

            //this needs to stay below the above filter block for depdeancy registration
            if(utils.getCurrentRootPage(self.appBase) === "search")
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
                
                searchResults = await self.da.getProfilesByKey(pageKeys);
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
            return self.allResults() == null || ((self.pageSize * self.searchPageNumber()) >= self.allResults().length);
        });

        initializing=false;
    }
    toString(){
        return "Search Object";
    }

    async doSearch(){
        var self=this;
        var searchResults;
        var filters = [];
        var pageSize = self.pageSize;
        var sortBy = self.sortBy() || "rank,desc";

        //console.log("start of doSearch+++++++++++++++++++++");
        for( var f in self.filter){
            const filter = self.filter[f];
            if(self.filter.hasOwnProperty(f) && filter.isDefined()){
                if(filter.name() === "ageGroups"){
                    var ageGroups = filter.obs()();
                    filter = new Filter("birth_years",null);
                    filter.obs()(utils.ageGroupsToBirthYears(ageGroups));
                }
                filters.push(filter);
                dataLayer.push({event:'filter', 'filter-type':filter.name()});//,user_id: viewModel.userId()});
            }
        }



        //console.log("doing search ============================"); 
        self.outstandingChanges = false;
        self.searchInProgress(true);
        try{
            searchResults = await self.da.primarySearch(filters,pageSize,sortBy);
            //console.log("filtered search results:",searchResults);
            if(searchResults!= null){
                if(searchResults.all_results == null || searchResults.all_results.length === 0){
                    self.allResults([]);
                    self.profiles([]);
                    self.numSearchResults(0);
                }else{
                    self.allResults(searchResults.all_results)
                    self.numSearchResults(searchResults.all_results.length);
                    self.profiles(searchResults.first_page);
                }
            }
            self.searchInProgress(false);
        }catch(error){
            self.searchInProgress(false);
            console.error("profile search failed: "+error.message,error);
            alertify.error("Search failed");
        }

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
    updateQueryResults(){
        if(this.outstandingChanges === true){
            console.log("outstanding changes found, running query");
            this.doSearch();
        }
    }
    setQuery(query){
        this.filter.query.obs()(query);
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