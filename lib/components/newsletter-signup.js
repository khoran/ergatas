import * as utils from '../client/client-utils';

/**
 * INPUT params
 *    - server: object with postJson method
 *    - buttonText: text for 'subscribe' button, defaults to "Subscribe"
 *    - dailyPrayer: boolean, if true, pre-check the box for Missionary of the Day
 *    - mobilizer: boolean, if true, pre-check the box for Ergatas Mobilizer
 */

export function register(){
   ko.components.register('newsletter-signup', {
       viewModel: function(params) {
            var self=this;
            self.server = params.server;
            console.log("newsletter signup params: ",params);

            self.formSubmitted = ko.observable(false);
            self.firstName = ko.observable();
            self.lastName = ko.observable();
            self.email = ko.observable();
            self.prayerList= ko.observable(false);
            self.dailyPrayer = ko.observable(params.dailyPrayer || false);
            self.mobilizer= ko.observable(params.mobilizer || false);
            self.buttonText= ko.observable(params.buttonText || "Subscribe");


            self.signUp = async function(){
                try{
                    const score = await self.server.sendRecaptcha("newsletter_signup");

                    var data = {
                        firstName: self.firstName(),
                        lastName: "",
                        email: self.email(),
                        recaptchaScore: score,
                    };
                    data.dailyPrayer = self.dailyPrayer();
                    data.prayer= self.prayerList();
                    data.mobilizer= self.mobilizer();

                    var response = await self.server.postJson("/api/newsletterSignup",data);

                    console.log("response: ",response);
                    self.formSubmitted(true);
                    dataLayer.push({event:'newsletter-signup' });
                }catch(error){
                    self.formSubmitted(false);
                    console.error("failed to submit newsletter signup form: ",error);
                    alertify.error("Signup failed, sorry about that");
                }
                
            }
       },

        template: require('./newsletter-signup.html'),
    });
}
