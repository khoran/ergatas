
import { ensureFields } from '../shared/shared-utils';
/**
 * INPUT PARAMS:
 *  navigateFn: function to navigate to other pages
 *  appState: AppState object
 *  group: which group of canned searches to show, defaults to "general"
 */

export function register(){
    const name = "canned-searches";
    ko.components.register(name, {
       viewModel: function(params) {
            var self=this;
            console.log(name+" params: ",params);

            try{
                ensureFields(params,['appState',"navigateFn"]);
            }catch(error){
                console.error(" in message-popup, not all fields given: "+error);
                return {};
            }
            const search=params.appState.search;
            const server=params.appState.server;

            self.group = ko.unwrap(params.group) || "general";
            self.navigateFn = params.navigateFn;

            console.log("canned search group: ",self.group);

            self.leastSupport = function(){
                search.clearFilters();
                search.setSort("current_support_percentage,asc");
                params.navigateFn("search","canned-search")();
            }
            self.movementFocused = function(){
                search.clearFilters();
                search.setSearch("movementStages",[1,2,3,4,5,6,7]);
                params.navigateFn("search","canned-search")();
            };
            self.frontierFocused= function(){
                search.clearFilters();
                search.setSearch("causes",[118]);
                search.addPGSet("Frontier",server);
                params.navigateFn("search","canned-search")();
            };
            self.frontierPeopleGroups= function(){
                search.clearFilters();
                search.addPGSet("Frontier",server);
                params.navigateFn("search","canned-search")();
            };
            self.perspectives= function(){
                search.clearFilters();
                search.setSearch("tags",[1]);
                params.navigateFn("search","canned-search")();
            };
            self.nationals= function(){
                search.clearFilters();
                search.setSearch("culturalDistances",[0]);
                params.navigateFn("search","canned-search")();
            };
        },
        template: require(`./${name}.html`),
    });
}

