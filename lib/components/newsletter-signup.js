import * as utils from '../client-utils';

export function register(){
   ko.components.register('newsletter-signup', {
       viewModel: function(params) {
            var self=this;
            console.log("newsletter signup params: ",params);

            self.formSubmitted = ko.observable(false);
            self.firstName = ko.observable();
            self.lastName = ko.observable();
            self.email = ko.observable();
            self.prayerList= ko.observable(false);

            self.signUp = async function(){
                try{

                    var response = await utils.postJson("/api/newsletterSignup",{
                        firstName: self.firstName(),
                        lastName:self.lastName(),
                        email: self.email(),
                        prayer: self.prayerList(),
                    });

                    console.log("response: ",response);
                    self.formSubmitted(true);
                    dataLayer.push({event:'newsletter-signup' });
                }catch(error){
                    self.formSubmitted(false);
                    console.log("failed to submit newsletter signup form: ",error);
                    alertify.error("Signup failed, sorry about that");
                }
                
            }
       },

        template: require('./newsletter-signup.html'),
    });
}
