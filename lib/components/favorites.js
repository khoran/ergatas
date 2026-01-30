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
            self.loading = ko.observable(true);

            self.loadFavoriteProfiles = async function() {
                var userFavorites = await utils.getUserFavorites(params.user(), da);
                try {
                    if (userFavorites.length === 0) {
                        self.favoriteProfiles([]);
                        return;
                    }
                    var results = await da.primarySearch({missionary_profile_keys: userFavorites},100000,"rank,desc",false,false,true);
                    self.favoriteProfiles(results.first_page);
                    console.log("loaded favorite profiles: ",self.favoriteProfiles());
                } catch (error) {
                    console.error("failed to load favorite profiles", error);
                    self.favoriteProfiles([]);
                } finally {
                    self.loading(false);
                }
            };

            // Load favorites on init
            self.loadFavoriteProfiles();

        },
       template: require(`./${name}.html`),
   });
}