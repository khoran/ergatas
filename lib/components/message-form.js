
import { ensureFields } from '../shared/shared-utils';
/**
 * INPUT PARAMS:
 *   - onSend: function to call when  send button is clicked. Takes args 'name','email','message'
 *   - emailPrivacyNotice: true or false, defaults to false
 *   - hideCancel: if true, no cancel button is shown
 *   - message: a pre-filled message string
 *   - includeEmail: boolean, give user option of including their email in message.
 */

export function register(){
    var counter = 1; 
    ko.components.register('message-form', {
       viewModel: function(params) {
            var self=this;
            counter = counter + 1;
            //console.log(" message form params: ",params);

            try{
                ensureFields(params,['onSend']);
            }catch(error){
                console.error(" in message-popup, not all fields given: "+error);
                return {};
            }

            self.nameID="name"+counter;
            self.emailID="email"+counter;
            self.messageID="message"+counter;
            self.includeEmailID="includeEmail"+counter;
            self.prayerTeamID="prayerTeam"+counter;
            self.updatesID="updates"+counter;

            self.name = ko.observable();
            self.email = ko.observable();
            self.message= ko.observable(ko.unwrap(params.message));
            self.buttonClass = ko.unwrap(params.buttonClass) ;
            self.buttonText = ko.unwrap(params.buttonText) ;
            self.emailPrivacyNotice = ko.unwrap(params.emailPrivacyNotice) || false;
            self.hideCancel = ko.unwrap(params.hideCancel) || false;
            self.includeEmailOption = ko.unwrap(params.includeEmail) || false;
            //self.includeEmail = ko.observable(self.includeEmailOption);
            self.prayerTeam = ko.observable(false);
            self.updates = ko.observable(false);

            self.onSend = params.onSend;
            self.sendMessage = function(){
                var sendFn = ko.unwrap(params.onSend);
                var finalMessage="";
                var includedEmail="";

                if(self.prayerTeam())
                    finalMessage = self.name()+" would like to join your prayer team.\n";

                if(self.updates())
                    finalMessage = finalMessage + self.name()+" would like to receive regular updates about your ministry.\n";

                if(self.includeEmail())
                    finalMessage = finalMessage + "Email address: "+self.email()+"\n";
                
                if(self.message() != null && self.message() !== "")
                    finalMessage = finalMessage + "Message: \n"+self.message()+"\n";

                sendFn(self.name(),self.email(),finalMessage);
                self.name(undefined);
                self.email(undefined);
                self.message(undefined);
            };
            self.includeEmail = ko.computed(function(){
                return self.prayerTeam() || self.updates();
            });

        },
        template: require('./message-form.html'),
    });
}

