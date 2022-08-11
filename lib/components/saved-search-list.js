
import {ensureFields} from '../shared/shared-utils';

/**
 * INPUT
 * -----
 *      - user: user object to list saved searches for
 *      - da: data access object
 *      - search: search object
 *      - navigateFn
 */

export function register(){
   const NAME="saved-search-list";


   ko.components.register(NAME, {
        viewModel: function(params) {
            console.log(NAME+" params: ",params);
            var self=this;

            ensureFields(params,["user","da"]);

            self.da = params.da;
            self.user = params.user;

            self.searches = ko.observableArray();


            if(self.user() != null){
                //load searches
                console.log("fetching searches for ",self.user());
                this.da.getSavedSearchesByUser(self.user().user_key()).then( x=>{
                    console.log("got searches: ",x);
                    self.searches(x);
                })
            }

            self.run = function(savedSearch){
                //params.search.loadSavedSearch(savedSearch.data.params);
                params.navigateFn("search/saved/"+savedSearch.data.name,"saved-search")();
            }
            self.delete = function(savedSearch){
                self.da.deleteSavedSearch(savedSearch.saved_search_key).
                    then(() =>{
                        self.searches.remove(savedSearch);

                        //if we've removed our last search
                        if(self.user() != null && self.searches().length === 0)
                            self.user().has_saved_search(false);
                    });
            }
            self.formatDate=function(dateStr){
                var date = new Date(dateStr);
                return date.toLocaleDateString();
            };

        },
        template: require('./'+NAME+'.html'),
    });
 
}