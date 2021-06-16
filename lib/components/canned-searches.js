
import { ensureFields } from '../shared-utils';
/**
 * INPUT PARAMS:
 *  navigateFn: function to navigate to other pages
 *  appState: AppState object
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


            self.navigateFn = params.navigateFn;

            self.leastSupport = function(){
                search.clearFilters();
                search.setSort("current_support_percentage,asc");
                params.navigateFn("search")();
            }
            self.movementFocused = function(){
                search.clearFilters();
                search.setSearch("movementStages",[1,2,3,4,5,6,7]);
                params.navigateFn("search")();
            }
            self.frontierPeoples = function(){
                search.clearFilters();
                search.setSearch("causes",[118]);
                // this does not accomplish the right thing because 
                // conditions are 'and'ed still
                //search.addFrontierPGSet(server);
                params.navigateFn("search")();
            }
            self.perspectives= function(){
                search.clearFilters();
                search.setSearch("tags",[1]);
                params.navigateFn("search")();
            }
        },
        template: require(`./${name}.html`),
    });
}

