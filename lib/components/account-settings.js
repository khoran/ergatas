/**
 * Account settings pane of the dashboard. For now this is where a user changes
 * their email: the server mails a confirmation link to the new address, and
 * nothing changes until that link is opened (see confirm-email-change).
 *
 * INPUT
 * ------
 *      - appState
 *      - user: logged in user (observable)
 */

import {ensureFields} from '../shared/shared-utils';

export function register(){
   const name="account-settings";
   ko.components.register(name, {
      viewModel: function(params) {
            var self=this;
            console.log("start of "+name);

            ensureFields(params,["appState","user"]);

            const server = params.appState.server;

            self.user = params.user;
            self.newEmail = ko.observable("");
            self.sending = ko.observable(false);
            self.error = ko.observable(null);
            self.sentTo = ko.observable(null);

            self.requestEmailChange = async function(){
                const newEmail = self.newEmail().trim();
                if(newEmail === "")
                    return;
                self.error(null);
                self.sentTo(null);
                self.sending(true);
                try{
                    const result = await server.authPostJson("/api/requestEmailChange",{newEmail: newEmail});
                    self.sentTo(result.email);
                    self.newEmail("");
                    dataLayer.push({event:'user','user-action':"requested-email-change"});
                }catch(error){
                    console.error("failed to request email change",error);
                    self.error((error.responseJSON && error.responseJSON.message) ||
                                "Sorry, we could not send the confirmation email. Please try again later.");
                }finally{
                    self.sending(false);
                }
            };
        },
       template: require(`./${name}.html`),
   });
}
