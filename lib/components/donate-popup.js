import * as utils from '../client-utils';

/**
 * INPUT PARAMS
 *      - donationUrl: URL to open when user clicks donate button
 *      - missionary_profile_key: profile to attribute possible transaction to
 *      - instructions: any instructions on makeing the donation
 *      - da: data-access object
 */
export function register(){
   ko.components.register('donate-popup', {
       viewModel: function(params) {
           const self=this;
           console.log("donate-popup params: ",params);

           const profileKey = ko.unwrap(params.missionary_profile_key);
           const da = ko.unwrap(params.da);
           self.donationUrl = ko.observable(ko.unwrap(params.donationUrl));
           self.amount = ko.observable();
           self.donationType = ko.observable();
           self.instructions = ko.observable(params.instructions);
           self.mode=ko.observable("pre-donate");
           self.showFeedback = ko.observable(false);
           self.feedbackGiven= ko.observable(false);

           console.log("donation url: ",self.donationUrl());

           self.donateClicked = function(){
               if(profileKey !== 0){ // indicates a preview
                //record possible tx
                dataLayer.push({event:"donate",
                                missionary_profile_key: profileKey,
                                'donate-level':2,
                                    'possible-donation-amount':self.amount(),
                                    'donation-type':self.donationType()});
                    if(self.amount() != null)
                        da.insertPossibleTransaction(profileKey,self.amount(),self.donationType());
                }
                self.mode("post-donate");
                return true; // allows default click action to also occur
           };

           self.htmlInstructions = function(data){
               return data.instructions().replaceAll("\n","<p/>");
           }
           self.confirmDonation = function(){
               if(profileKey !== 0){
                    dataLayer.push({event:"donate-confirmation",
                               missionary_profile_key: profileKey,
                               'donate-level':2,
                                'confirmed-donation-amount':self.amount(),
                                'donation-type':self.donationType()});
               }
           }
           self.feedback = function(){
                if(self.amount() != null){
                    da.insertPossibleTransaction(profileKey,self.amount(),self.donationType());
                    self.confirmDonation();
                }
                self.feedbackGiven(true);
           }


       },

        template: require('./donate-popup.html'),
    });
}
 