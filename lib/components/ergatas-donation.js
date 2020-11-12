
/**
 *  INPUT
 * ----------
 *      - server: server object with postJson function
 */
export function register(){
   const name="ergatas-donation";
   const stripeURL="https://js.stripe.com/v3/";
   const stripePublicKey = process.env.STRIPE_PUB_KEY;
   ko.components.register(name, {
       viewModel: function(params) {
            //initiate script loading early. will wait for it later
            //console.log("LOADING STRIPE");
            //jQuery.getScript(stripeURL);

            var self=this;
            console.log("params: ",params);
            const server = params.server;

            self.state= ko.observable("donate");
            self.errorMessage = ko.observable();
            self.spinner = ko.observable(false);
            self.donation= {
                email: ko.observable(),
                amount: ko.observable(),
                cardholderName: ko.observable(),
            };
            console.log("spinner: ",self.spinner());
            //if( ! window.Stripe)
                //await jQuery.getScript(stripeURL);

            const stripe = Stripe(stripePublicKey);
            const elements = stripe.elements();
            const card = elements.create('card',{style:{}});

           // const card= elements.create('card', {
           //     style: {
           //         base: {
           //             //color: '#edb53a',
           ////             fontWeight: 500,
           ////             fontFamily: 'Roboto, sans-serif',
           ////             fontSize: '16px',
           ////             fontSmoothing: 'antialiased',
           //             ':-webkit-autofill': {
           //                 color: '#edb500',
           //             },
           //             '::placeholder': {
           //                 //color: '#edb53a',
           //             },
           //         },
           //         invalid: {
           //             iconColor: '#FFC7EE',
           //             color: '#FFC7EE',
           //         },
           //     },
           //     });



            card.mount('#card-element');

            // Handle real-time validation errors from the card Element.
            card.on('change', function(event) {
                console.info("card change. error: "+event.error+", message: "+event.errorMessage);
                if (event.error) {
                    self.error(event.errorMessage);
                } else {
                    self.state("donate");
                    self.errorMessage("");
                }
            });



            self.error = function(message){
                self.state("failed");
                console.error("card error: "+message);
                self.errorMessage(message);
            }

            self.donateForm = async function(){
                const donationData = {
                    name: self.donation.cardholderName(),
                    email: self.donation.email(),
                    amount: self.donation.amount(),
                };
                //console.info("making a donation: ",donationData);
                try{
                    self.spinner(true);
                    const data = await server.postJson("/api/donate", donationData);

                    const result = await stripe.confirmCardPayment(data.intentSecret, {
                        payment_method: {
                            card: card,
                            billing_details: {name: self.donation.cardholderName()},
                        }
                    });
                    if (result.error) {
                        self.error(result.error.message);
                    }else{
                        donationData.paymentIntentId = data.paymentIntentId;
                        try{
                            await server.postJson("/api/donate/confirm", donationData);
                        }catch(error){
                            console.error("payment succeeded, but failed to confirm, receipt may not be sent: "+error.message);
                        }
                        self.state("succeeded");
                    }
                    

                    self.spinner(false);

                }catch(error){
                    self.spinner(false);
                    console.error("caught error in donateForm: ",error);
                    self.error(error.message);
                }

            };
 
       },
       template: require('./'+name+'.html'),
    });
}