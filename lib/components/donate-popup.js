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

           console.log("donation url: ",self.donationUrl());

           self.donateClicked = function(){
               //record possible tx
               dataLayer.push({event:"donate",
                               missionary_profile_key: profileKey,
                               'donate-level':2,
                                'possible-donation-amount':self.amount(),
                                'donation-type':self.donationType()});
               da.insertPossibleTransaction(profileKey,self.amount(),self.donationType());
               self.mode("post-donate");
               return true; // allows default click action to also occur
           };
           self.confirmDonation = function(){
               dataLayer.push({event:"donate",
                               missionary_profile_key: profileKey,
                               'donate-level':2,
                                'confirmed-donation-amount':self.amount(),
                                'donation-type':self.donationType()});
           }


       },

        template: require('./donate-popup.html'),
    });
}
 