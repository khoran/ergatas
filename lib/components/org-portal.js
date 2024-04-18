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

            if(self.org.search_filter != null && self.org.search_filter != ""){
                console.log("setting org filter: ",self.org.search_filter);
                appState.search.loadSavedSearch(self.org.search_filter);
            }

            self.claim = async function(){
                console.log("claim organization");
            }

            
        },
        template: require('./'+name+'.html'),
    });
}