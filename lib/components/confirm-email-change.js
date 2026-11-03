/**
 * Landing page for the link mailed by /api/requestEmailChange. The change is
 * only made when the user presses the button: mail scanners open links on
 * their own, and that shouldn't be enough to change an account.
 *
 * INPUT
 * ------
 *      - appState
 *      - user: logged in user (observable), null when not signed in
 */

import * as utils from '../client/client-utils';
import {ensureFields} from '../shared/shared-utils';

//the new address, read from the link's token just for display; the server
// verifies the token before acting on it
function newEmailFromToken(token){
    try{
        const payload = token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/");
        return JSON.parse(atob(payload)).new_email || null;
    }catch(error){
        return null;
    }
}

export function register(){
   const name="confirm-email-change";
   ko.components.register(name, {
      viewModel: function(params) {
            var self=this;
            console.log("start of "+name);

            ensureFields(params,["appState","user"]);

            const server = params.appState.server;
            const changeToken = utils.getURLParameter("token");

            self.user = params.user;
            self.newEmail = changeToken ? newEmailFromToken(changeToken) : null;
            self.validLink = self.newEmail != null;
            self.confirming = ko.observable(false);
            self.error = ko.observable(null);
            self.changedTo = ko.observable(null);

            self.confirm = async function(){
                self.error(null);
                self.confirming(true);
                try{
                    const result = await server.postJson("/api/confirmEmailChange",{changeToken: changeToken});
                    //a signed-in session still holds a token with the old email; get a fresh one
                    if(self.user()){
                        try{
                            await server.refreshToken();
                        }catch(error){
                            console.warn("failed to refresh session after email change",error);
                        }
                        self.user().email(result.email);
                    }
                    self.changedTo(result.email);
                    dataLayer.push({event:'user','user-action':"changed-email"});
                }catch(error){
                    console.error("failed to confirm email change",error);
                    self.error((error.responseJSON && error.responseJSON.message) ||
                                "Sorry, we could not change your email address. Please try again later.");
                }finally{
                    self.confirming(false);
                }
            };
        },
       template: require(`./${name}.html`),
   });
}
