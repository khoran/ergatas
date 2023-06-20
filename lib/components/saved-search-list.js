
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
            self.publicSearches = ko.observableArray();


            if(self.user() != null){
                //load searches
                console.log("fetching searches for ",self.user());
                this.da.getSavedSearchesByUser(self.user().user_key()).then( x=>{
                    console.log("got searches: ",x);
                    self.searches(x);
                })
                this.da.getPublicSearches().then( x=>{
                    self.publicSearches(x);
                })
            }

            self.run = function(search){
                console.log("running search ",search);

                dataLayer.push({event:'search-run' });
                if(search.public_search_key != null)
                    params.navigateFn("search/public/"+search.search_name,"saved-search")();
                else
                    params.navigateFn("search/saved/"+search.data.name,"saved-search")();
            }
            self.delete = function(search){
                if(search.saved_search_key != null)
                    self.da.deleteSavedSearch(search.saved_search_key).
                        then(() =>{
                            self.searches.remove(search);

                            //if we've removed our last search
                            if(self.user() != null && self.searches().length === 0)
                                self.user().has_saved_search(false);
                        });
                else if(search.public_search_key != null)
                    self.da.deletePublicSearch(search.public_search_key).
                        then(()=>{
                            self.publicSearches.remove(search);
                        });

            }
            self.makePublic = async function(savedSearch){
                
                try{
                    var s = await self.da.createPublicSearch(savedSearch.data.name,savedSearch.data)
                    self.publicSearches.push(s);
                }catch(error){
                    console.warn("failed to copy saved search to public: "+error.responseText,savedSearch);
                }

            }
            self.formatDate=function(dateStr){
                var date = new Date(dateStr);
                return date.toLocaleDateString();
            };

        },
        template: require('./'+NAME+'.html'),
    });
 
}