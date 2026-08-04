
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
            self.group = ko.unwrap(params.group) || "general";
            self.navigateFn = params.navigateFn;

            console.log("canned search group: ",self.group);

            //Each canned search just navigates to a fully-specified /search URL. The
            //search page's applyQueryString reader clears any prior filters, hydrates
            //these, and re-expands pgSets by name - so there's no need to set filter
            //observables here (which the URL reader would otherwise wipe on the bare
            ///search route). Field names match the DB fields in Search's URL_FILTER_TYPES.
            self.leastSupport = function(){
                params.navigateFn("search?sort=current_support_percentage,asc","canned-search")();
            }
            self.movementFocused = function(){
                params.navigateFn("search?movement_stages=1,2,3,4,5,6,7","canned-search")();
            };
            self.frontierFocused= function(){
                params.navigateFn("search?cause_keys=118&pgSets=Frontier","canned-search")();
            };
            self.frontierPeopleGroups= function(){
                params.navigateFn("search?pgSets=Frontier","canned-search")();
            };
            self.perspectives= function(){
                params.navigateFn("search?tag_keys=1","canned-search")();
            };
            self.nationals= function(){
                params.navigateFn("search?cultural_distances=0","canned-search")();
            };
        },
        template: require(`./${name}.html`),
    });
}

