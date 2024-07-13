import * as sharedUtils from '../shared/shared-utils';

/**
 * INPUT params
 *  - org: the non_profit_organization_view  data
 *  - appState: appState object
 * 
 */
export function register(){
    const name="org-portal"; 
    ko.components.register(name, {
       viewModel: function(params) {
            var self=this;

            console.log(name+" params: ",params);

            const appState = params.appState;

            self.appState=appState;
            self.org = params.org;
            self.storage = appState.storage;
            self.userProfile = ko.observable();

            async function loadProfiles(){
                const ro_profile_keys = self.org.search_filter.ro_profile_keys || [];
                delete self.org.search_filter.ro_profile_keys;
                const params = sharedUtils.searchParamsFromJson(self.org.search_filter);
                const results = await self.appState.da.primarySearch(params,20,"rank,desc");
                const profile_keys = (results.all_results || []).
                                        map( r => r.missionary_profile_key).
                                        concat(ro_profile_keys);
                appState.search.setSearch("missionaryProfiles",profile_keys);

                //appState.search.setResults(results);

            }

            if(self.org.search_filter != null && self.org.search_filter != ""){
                console.log("setting org filter: ",self.org.search_filter);
                //appState.search.loadSavedSearch(self.org.search_filter);
                loadProfiles();
            }

            self.claim = async function(){
                console.log("claim organization");
            }

            
        },
        template: require('./'+name+'.html'),
    });
}