
import { ensureFields } from '../shared-utils';
/**
 * INPUT PARAMS:
 *  navigateFn: function to navigate to other pages
 *  search: Search object
 */

export function register(){
    const name = "canned-searches";
    ko.components.register(name, {
       viewModel: function(params) {
            var self=this;
            console.log(name+" params: ",params);

            try{
                ensureFields(params,['search',"navigateFn"]);
            }catch(error){
                console.error(" in message-popup, not all fields given: "+error);
                return {};
            }


            self.navigateFn = params.navigateFn;

            self.leastSupport = function(){
                params.search.clearFilters();
                params.search.setSort("current_support_percentage,asc");
                params.navigateFn("search")();
            }
            self.movementFocused = function(){
                params.search.clearFilters();
                params.search.setSearch("movementStages",[1,2,3,4,5,6,7]);
                params.navigateFn("search")();
            }
            self.frontierPeoples = function(){
                params.search.clearFilters();
                params.search.setSearch("causes",[118]);
                params.navigateFn("search")();
            }
            self.perspectives= function(){
                params.search.clearFilters();
                params.search.setSearch("tags",[1]);
                params.navigateFn("search")();
            }
        },
        template: require(`./${name}.html`),
    });
}

