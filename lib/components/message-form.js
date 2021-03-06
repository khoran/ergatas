
import { ensureFields } from '../client-utils';
/**
 * INPUT PARAMS:
 *   - onSend: function to call when  send button is clicked. Takes args 'name','email','message'
 *   - emailPrivacyNotice: true or false, defaults to false
 *   - hideCancel: if true, no cancel button is shown
 */

export function register(){
   ko.components.register('message-form', {
       viewModel: function(params) {
            var self=this;
            console.log(" message form params: ",params);

            try{
                ensureFields(params,['onSend']);
            }catch(error){
                console.error(" in message-popup, not all fields given: "+error);
                return {};
            }
            self.name = ko.observable();
            self.email = ko.observable();
            self.message= ko.observable();
            self.buttonClass = ko.unwrap(params.buttonClass) ;
            self.buttonText = ko.unwrap(params.buttonText) ;
            self.emailPrivacyNotice = ko.unwrap(params.emailPrivacyNotice) || false;
            self.hideCancel = ko.unwrap(params.hideCancel) || false;

            self.onSend = params.onSend;
            self.sendMessage = function(){
                var sendFn = ko.unwrap(params.onSend);
                sendFn(self.name(),self.email(),self.message());
                self.name(undefined);
                self.email(undefined);
                self.message(undefined);
            };

        },
        template: require('./message-form.html'),
    });
}

