import * as utils from '../client/client-utils';

/**
 * INPUT PARAMS
 *      - donationUrl: URL to open when user clicks donate button
 *      - missionary_profile_key: profile to attribute possible transaction to
 *      - instructions: any instructions on makeing the donation
 *      - ownProfile: true if a logged in user is clicking their own profiles donate button
 *      - da: data-access object
 */
export function register(){
   ko.components.register('donate-popup', {
       viewModel: function(params) {
           const self=this;
           console.log("donate-popup params: ",params);

           const profileKey = ko.unwrap(params.missionary_profile_key);
           const da = ko.unwrap(params.da);
           const ownProfile = params.ownProfile  || false; // assume not own profile if not given

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
                    console.log("donate clicked by "+profileKey);
                    if( ! ownProfile && !utils.debugMode()){
                        //record possible tx
                        dataLayer.push({event:"donate",
                                'donate-level':2,
                                    'possible-donation-amount':self.amount(),
                                    'donation-type':self.donationType()});
                        da.insertPossibleTransaction(profileKey,self.amount() || 0,self.donationType());
                    }else{
                        console.warn("not recording donation click due to debug mode or own profile");
                    }
                }
                self.mode("post-donate");
                return true; // allows default click action to also occur
           };

           self.htmlInstructions = function(data){
               return data.instructions().replace(/\n/g,"<p/>");
           }
           self.confirmDonation = function(){
               if(profileKey !== 0 && ! ownProfile){
                    dataLayer.push({event:"donate-confirmation",
                               'donate-level':2,
                               'missionary_profile_key':profileKey,
                                'confirmed-donation-amount':self.amount(),
                                'donation-type':self.donationType()});
               }
           }
           self.feedback = function(){
                da.insertPossibleTransaction(profileKey,self.amount() || 0,self.donationType());
                self.confirmDonation();
                self.feedbackGiven(true);
           }


       },

        template: require('./donate-popup.html'),
    });
}
 
