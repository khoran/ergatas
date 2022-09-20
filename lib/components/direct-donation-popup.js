import * as utils from '../client/client-utils';
import { AppError } from '../server/app-error';
import {ensureFields} from '../shared/shared-utils';

/**
 * INPUT PARAMS
 *      - server: refrence to server object
 *      - missionary_profile_key: profile to attribute possible transaction to
 *      - workerName: name of worker
 *      - ownProfile: true if a logged in user is clicking their own profiles donate button
 */
export function register(){
    const name='direct-donation-popup'
    var counter = 0;

    const moneyRE = /^\d+\.?\d{0,2}$/;
    const moneyFormatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    });


    ko.components.register(name, {
        viewModel: function(params) {
            const self=this;
            const stripeFee=0.023;
            console.log(name+" params: ",params);
            counter = counter + 1;

            self.error= ko.observable();
            try{

                ensureFields(params,["server","missionary_profile_key","workerName"]);
            }catch(error){
                //TODO: this still needs work
                console.error("missing some parameters to direct-donatin-popup component: ",error);
                self.error("Oops, something bad happened. Please try back later");
                return; 
            }


            const profileKey = ko.unwrap(params.missionary_profile_key);
            const ownProfile = params.ownProfile  || false; // assume not own profile if not given

            self.level = ko.observable("10");
            self.otherAmount= ko.observable(0);
            self.monthly= ko.observable();
            self.email = ko.observable();
            self.mode=ko.observable("pre-donate");
            self.includeFee=ko.observable(true);
            self.title=ko.observable("Donate to the ministry of "+params.workerName);

            self.modalID = name+counter;


            self.otherAmount.subscribe(function(newValue) {
                console.log("new other amount: "+newValue);
                // clean up the value
                if(newValue != null && newValue !== "" && newValue.match(moneyRE) == null){
                    var amt = parseFloat(newValue);
                    amt = Math.abs(Math.trunc(amt*100))/100;

                    if(isNaN(amt))
                        amt = 0;

                    amt = String(amt);
                    
                    console.log("orig value: "+newValue+", cleaned value: "+amt);
                    if(amt !== newValue)
                        self.otherAmount(amt);
                }
            });

            self.amount = ko.computed(() =>{
                var amt;
                if(self.level()==="other")
                    amt = parseInt(self.otherAmount());
                else
                    amt = parseInt(self.level());
                if(isNaN(amt))
                    amt = 0;
                return amt;
            });
            self.fee = ko.computed(()=>{ // 2.3% + $0.30
                return self.amount() * stripeFee+0.3;
            })


            self.finalAmount = ko.computed(()=>{
                var amt ;
                if(self.includeFee()===true)
                    amt = self.amount()+self.fee();
                else
                    amt = self.amount();

                if(isNaN(amt))
                    amt = 0;

                self.error(null);
                return amt;
            });
            self.moneyFormat = function(value){
                return moneyFormatter.format(value);
            }


            self.submitForm= async function(){
                console.log("submitted form.",{finalAmount:self.finalAmount(),email:self.email(),monthly:self.monthly()});
                if(self.finalAmount() === 0){
                    self.error("Please set an amount to donate");
                    return;
                }
                if(profileKey !== 0){ // indicates a preview
                        console.log("donate clicked by "+profileKey);

                        //FOR DEBUGGIN, remove "true" before commit
                        if(true || ! ownProfile && !utils.debugMode()){
                            //record possible tx

                            try{

                                const result = await params.server.postJson("/api/makeDonation",{
                                            email: self.email(),
                                            name:params.workerName,
                                            missionary_profile_key: params.missionary_profile_key,
                                            donation_type:self.monthly() ? 'recurring':'one-time',
                                            return_url: window.location.origin+window.location.pathname,
                                            amount:parseInt(self.finalAmount()*100)});
                                if(result == null || result.payment_url == null)
                                    throw "got null result from makeDonation";


                                dataLayer.push({event:"direct-donate",
                                            'amount':self.amount(),
                                            'monthly':self.monthly()});

                                location.assign(result.payment_url);
                            }catch(error){
                                console.error("failed to make donation: ",error);
                                self.error("Oops, something bad happened! We cannot process your donation right now, please check back at a later time.")
                            }
                        }else{
                            console.warn("not recording donation click due to debug mode or own profile");
                        }
                    }
                    self.mode("post-donate");

                    jQuery("#"+self.modalID).modal("hide");
            };



        },

        template: require(`./${name}.html`),
    });
}
 
