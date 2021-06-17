import { ensureFields } from '../shared/shared-utils';
import * as utils from '../client/client-utils';

/**
 * INPUT PARAMS:
 *   - buttonClass
 *   - buttonText
 *   - onSend: function to call when  send button is clicked. Takes args 'name','email','message'
 *   - emailPrivacyNotice: true or false, defaults to false
 *   - title: optional title to show at top of popup box
 *   - message: a prefilled message
 *   - includeEmail: show option for user to include email in message
 */
export function register(){
    var counter = 1;
    ko.components.register('message-popup', {
       viewModel: function(params) {
            var self=this;
            counter = counter + 1;
            console.log(" message popup params: ",params);


            try{
                ensureFields(params,['onSend']);
            }catch(error){
                console.error(" in message-popup, not all fields given: "+error.message);
                return {};
            }
            self.modalID = "messageModal"+counter;

            self.buttonClass = ko.unwrap(params.buttonClass) ;
            self.buttonText = ko.unwrap(params.buttonText) ;
            self.emailPrivacyNotice = ko.unwrap(params.emailPrivacyNotice) || false;
            self.title= ko.unwrap(params.title) ;
            self.message = ko.unwrap(params.message);
            self.includeEmail= ko.unwrap(params.includeEmail) || false;


            self.submitModal = function(name,email,message){
                console.log("submit modal function");
                var sendFn = ko.unwrap(params.onSend);
                sendFn(name,email,message);
                jQuery("#"+self.modalID).modal("hide");

            }

        },
        template: require('./message-popup.html'),
    });
}

