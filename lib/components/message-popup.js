import { ensureFields } from '../client-utils';

/**
 * INPUT PARAMS:
 *   - buttonClass
 *   - buttonText
 *   - onSend: function to call when  send button is clicked. Takes args 'name','email','message'
 *   - emailPrivacyNotice: true or false, defaults to false
 */
export function register(){
   ko.components.register('message-popup', {
       viewModel: function(params) {
            var self=this;
            console.log(" message popup params: ",params);

            try{
                ensureFields(params,['onSend']);
            }catch(error){
                console.error(" in message-popup, not all fields given: "+error);
                return {};
            }

            //self.name = ko.observable();
            //self.email = ko.observable();
            //self.message= ko.observable();
            self.buttonClass = ko.unwrap(params.buttonClass) ;
            self.buttonText = ko.unwrap(params.buttonText) ;
            self.emailPrivacyNotice = ko.unwrap(params.emailPrivacyNotice) || false;


            self.submitModal = function(name,email,message){
                console.log("submit modal function");
                var sendFn = ko.unwrap(params.onSend);
                sendFn(name,email,message);
                jQuery("#messageModal").modal("hide");

            }


            //self.sendMessage = function(){
            //    var sendFn = ko.unwrap(params.onSend);
            //    sendFn(self.name(),self.email(),self.message());
            //    jQuery("#messageModal").modal("hide");
            //    //jQuery("#messageModal").modal("dispose");
            //    self.name(undefined);
            //    self.email(undefined);
            //    self.message(undefined);
            //};

        },
        template: require('./message-popup.html'),
    });
}

