import * as utils from '../client-utils';

/**
 * INPUT PARAMS
 *      - donationUrl: URL to open when user clicks donate button
 *      - missionary_profile_key: profile to attribute possible transaction to
 *      - da: data-access object
 */
export function register(){
   ko.components.register('donate-popup', {
       viewModel: function(params) {
           const self=this;

           const profileKey = ko.unwrap(params.missionary_profile_key);
           const da = ko.unwrap(params.da);
           self.donationUrl = ko.observable(ko.unwrap(params.donationUrl));
           self.amount = ko.observable();
           self.donationType = ko.observable();

           console.log("donation url: ",self.donationUrl());

           self.donateClicked = function(){
               //record possible tx
               da.insertPossibleTransaction(profileKey,self.amount(),self.donationType());
               return true; // allows default click action to also occur
           }


       },

        template: require('./donate-popup.html'),
    });
}
 