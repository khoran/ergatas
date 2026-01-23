/**
 * INPUT
 * ------
 *      - appState
 *      - user: logged in user
 */

import * as utils from '../client/client-utils';
import {ensureFields} from '../shared/shared-utils';

export function register(){
   const name="favorites";
   ko.components.register(name, {
      viewModel: function(params) {
            var self=this;
            console.log("start of "+name);

            ensureFields(params,["appState","user"]);

            const appState = params.appState
            const server = appState.server;
            const da = appState.da;

            self.appState = appState;
            self.server = server;
            self.da = da;
            self.storage = appState.storage;
            self.user = params.user;
            self.favoriteProfiles = ko.observableArray([]);

            self.loadFavoriteProfiles = async function() {
                var user = params.user();
                if (!user || !user.search_filter || !user.search_filter.ro_profile_keys) {
                    self.favoriteProfiles([]);
                    return;
                }
                var keys = user.search_filter.ro_profile_keys();
                if (keys.length === 0) {
                    self.favoriteProfiles([]);
                    return;
                }
                try {
                    var results = await da.primarySearch({missionary_profile_keys: keys},100,"rank,desc",false,true,true);
                    self.favoriteProfiles(results.first_page);
                    console.log("loaded favorite profiles: ",self.favoriteProfiles());
                } catch (error) {
                    console.error("failed to load favorite profiles", error);
                    self.favoriteProfiles([]);
                }
            };

            // Load favorites on init
            self.loadFavoriteProfiles();

        },
       template: require(`./${name}.html`),
   });
}