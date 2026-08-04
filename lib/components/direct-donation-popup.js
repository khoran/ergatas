import * as utils from '../client/client-utils';
import {ensureFields} from '../shared/shared-utils';
import * as mapUtils from '../client/google-map';
import {allCountries} from '../shared/shared-utils';
import alertify from 'alertifyjs';
import {loadStripe} from '../client/stripe-loader';

/**
 * INPUT PARAMS
 *      - appState
 *      - missionary_profile_key: profile to attribute possible transaction to
 *      - organization_key: key of organization that the missionary belongs to
 *      - workerName: name of worker
 *      - ownProfile: true if a logged in user is clicking their own profiles donate button
 *      - instructions: from worker profile
 *      - donationUrl: from worker profile
 *      - donationMethods: one of 'both', 'ergatas', or 'agency'
 *      - buttonText: optional text for donate button
 */
export function register(){
    const name='direct-donation-popup'
    var counter = 0;
    const countryDataPromise = allCountries();
    var checkoutSession; // shared among all instances, but only one should be active at a time

    const moneyRE = /^\d+\.?\d{0,2}$/;

    const getAddressComp=function(type,components,required=true){

        const match = components.find(comp => comp.types.find(t=>{
            if(Array.isArray(type))
                return type.indexOf(t) !== -1;
            else
                return t===type
        }) != null)

        //console.log("component "+type+": ",match);

        if(match != null)
            return match.short_name;
        if(required)
            throw "failed to get address component of type "+type;
        else 
            return "";
    }
    const setupAddressEntry=function(modalID,addressObs){

        mapUtils.initMap().then(()=>{
            const el = jQuery("#"+modalID+" .mail-address")[0];
            const autocomplete=new google.maps.places.Autocomplete(el,{
                fields: ["address_components"],
                types: ["address"],
            });
            setTimeout(()=>
                jQuery(el).attr("autocomplete","address-level4"), //disable for chrome
                500);

            autocomplete.addListener("place_changed",()=>{
                const place = autocomplete.getPlace();
                //console.log("selected place: ",place);
                try{
                    if(place.address_components != null){
                        addressObs({
                            line1: getAddressComp("street_number",place.address_components)+" "+
                                    getAddressComp("route",place.address_components)+" "+
                                    getAddressComp("subpremise",place.address_components,false),
                            city: getAddressComp(["locality","administrative_area_level_2"],place.address_components),
                            postal_code: getAddressComp("postal_code",place.address_components,false),
                            state: getAddressComp("administrative_area_level_1",place.address_components,false),
                            country: getAddressComp("country",place.address_components),
                        })
                    }else if(place.name != null && place.name !== ""){
                        console.warn("address was not found, just going with provided string as first line");
                        addressObs({
                            line1: place.name,
                            city:"",
                            postal_code:"",
                            state:"",
                            country:"",
                        });
                    }else{
                        throw "no address found. place:"+JSON.stringify(place);
                    }
                }catch(error){
                    console.error("failed to get all address components",error);
                    addressObs(undefined);
                    alertify.error("Sorry, we couldn't process the address you selected. Please try again, or select \"I can't find my address\" to enter an address manually");
                }


            });
        });

    }

    ko.components.register(name, {
        viewModel: function(params) {
            const self=this;
            const stripeFee=0.023;
            console.log(name+" params: ",params);
            counter = counter + 1;

            self.error= ko.observable();
            try{
                ensureFields(params,["appState","missionary_profile_key","workerName"]);
            }catch(error){
                console.error("DONATE BUTTON INIT FAILED: missing some parameters to direct-donation-popup component: ",error);
                return; 
            }


            const profileKey = ko.unwrap(params.missionary_profile_key);
            const ownProfile = params.ownProfile  || false; // assume not own profile if not given
            const organization_key = ko.unwrap(params.organization_key);



            self.instructions = ko.unwrap(params.instructions) || "";
            self.donationUrl = ko.unwrap(params.donationUrl);
            self.da = params.appState.da;
            self.server = params.appState.server;
            self.storage = params.appState.storage;
            self.profileKey = profileKey;
            self.ownProfile = ownProfile;

            self.level = ko.observable("50");
            self.otherAmount= ko.observable(0);
            self.monthly= ko.observable();
            self.email = ko.observable();
            self.mode=ko.observable("pre-donate");
            self.includeFee=ko.observable(true);
            self.title=ko.observable("Donate to the ministry of "+ko.unwrap(params.workerName));
            self.address=ko.observable();
            self.phone=ko.observable();
            self.donorName=ko.observable();
            self.manualAddressEntry=ko.observable(false);
            self.addressComponents = {
                line1:ko.observable(),
                line2: ko.observable(),
                city: ko.observable(),
                state:ko.observable(),
                postal_code:ko.observable(),
                country:ko.observable()
            }
            self.countryCodes = ko.observableArray();
            self.mode= ko.observable("pre-donate");
            self.modalTemplate = ko.observable();
            self.donateButtonText = ko.observable(params.buttonText || "Donate");
            self.donationSettings = ko.observable({
                address_field_status:"optional",
                phone_field_status:"hidden",
                send_receipt:true});
            self.orgName = ko.observable();
            self.orgLogo = ko.observable();
            self.orgCountryCode = ko.observable();

            //currencies the org can receive without an exchange: manual selections
            // plus those detected from the org's Stripe bank accounts
            self.acceptedCurrencies = ko.pureComputed(() =>{
                const settings = self.donationSettings() || {};
                const currencies = (settings.native_currencies || [])
                    .concat(settings.stripe_currencies || [])
                    .map( c => String(c).toUpperCase());
                return [...new Set(currencies)].sort();
            });

            // The account's base settlement currency (what donations are created in). Adaptive
            // Pricing localizes on top of this at checkout.
            self.settlementCurrency = ko.pureComputed(() =>{
                const settings = self.donationSettings() || {};
                return String(settings.settlement_currency || "USD").toUpperCase();
            });
            // Currencies the org can settle without an exchange (from its Stripe bank accounts).
            self.chargeCurrencies = ko.pureComputed(() =>{
                const settings = self.donationSettings() || {};
                return (settings.stripe_currencies || []).map(c => String(c).toUpperCase());
            });
            // Offer a currency picker only when the org has more than one settleable currency.
            self.showCurrencySelector = ko.pureComputed(() => self.chargeCurrencies().length > 1);
            self.selectedCurrency = ko.observable("USD");
            // Amount formatter follows the selected currency; falls back to USD on any bad code.
            self.currencyFormatter = ko.pureComputed(() =>{
                try{
                    return new Intl.NumberFormat(undefined, {style:'currency', currency: self.selectedCurrency() || "USD"});
                }catch(e){
                    return new Intl.NumberFormat('en-US', {style:'currency', currency:'USD'});
                }
            });
            // Same, but without fractional digits — used for the whole-number preset buttons so
            // they stay narrow (e.g. "CA$25" instead of "CA$25.00").
            self.currencyFormatterWhole = ko.pureComputed(() =>{
                try{
                    return new Intl.NumberFormat(undefined, {style:'currency', currency: self.selectedCurrency() || "USD",
                        minimumFractionDigits:0, maximumFractionDigits:0});
                }catch(e){
                    return new Intl.NumberFormat('en-US', {style:'currency', currency:'USD',
                        minimumFractionDigits:0, maximumFractionDigits:0});
                }
            });
            self.taxReceiptCountryName = ko.pureComputed(() =>{
                const settings = self.donationSettings() || {};
                // the org issues its own-country receipt only when Ergatas does not
                // send it (send_receipt === false); default (true/undefined) => none
                if( settings.send_receipt !== false)
                    return null;
                const country = (self.countryCodes() || []).find( c => c.alpha3Code === self.orgCountryCode());
                return country != null ? country.name : self.orgCountryCode();
            });


            countryDataPromise.then(self.countryCodes);


            if(organization_key != null)
                self.da.getOrganization(organization_key).then(org => {
                    if(org != null){

                        if(org.donation_settings)
                            self.donationSettings(org.donation_settings);

                        // default the charge currency to the account's settlement currency
                        self.selectedCurrency(self.settlementCurrency());

                        self.orgCountryCode(org.country_code);
                        self.orgName(org.display_name);
                        self.orgLogo(org.logo_url);
                        //self.title("Donate to the ministry of "+ko.unwrap(params.workerName)+" at "+self.orgName());
                        self.title("Donate to the ministry of "+ko.unwrap(params.workerName));

                        if(org.stripe_account != null && org.stripe_account != "")
                            params.donationMethods="ergatas"; // force to on-site donation only
                    }
                });

            self.modalID = name+counter;

            self.openDialog = function(){
                setupAddressEntry(self.modalID,self.address);
                if(profileKey != 0){
                    dataLayer.push({event:"donate", 'donate-level':1});
                    dataLayer.push({event:"click_donate", missionary_profile_key:profileKey});
                }
                self.donationMethods = ko.observable(ko.unwrap(params.donationMethods) || "both");
                self.modalTemplate("donation-modal");
            }
            self.showModal = function(){
                var modal = jQuery("#"+self.modalID);
                modal.on('hidden.bs.modal', function (event) {
                    self.modalTemplate(undefined);
                });
                modal.modal("show");
                //afterRender hook: if we're resuming a redirect-return checkout, the modal DOM
                //(including the #ergatas mount point) now exists, so mount the embedded checkout.
                if(self._pendingResume){
                    const info = self._pendingResume;
                    self._pendingResume = null;
                    self.showCheckout(info);
                }
            }
            // Re-open the dialog straight into the embedded checkout for an existing session. Used
            // when a donor returns from a redirect-based payment method with an unfinished payment.
            self.resumeCheckout = function(sessionInfo){
                self._pendingResume = sessionInfo;
                self.openDialog();
            }
            // React to a redirect-return resume request for THIS profile. Covers both orderings:
            // the value set before this component initialized (checked now) and after (subscribe).
            // Consume it (set null) so only the matching popup reacts and it fires once.
            if(params.appState && params.appState.pendingDonationResume){
                const tryResume = function(resume){
                    if(resume && String(resume.missionary_profile_key) === String(profileKey) && resume.client_secret){
                        params.appState.pendingDonationResume(null);
                        self.resumeCheckout({client_secret: resume.client_secret, stripeAccount: resume.stripeAccount});
                    }
                };
                tryResume(params.appState.pendingDonationResume());
                params.appState.pendingDonationResume.subscribe(tryResume);
            }
            self.hideModal = function(){
                var modal = jQuery("#"+self.modalID);
                modal.modal("hide");
            }
            self.fieldRequirements = function(fieldStatus){
                if(fieldStatus === "required")
                    return "required-text";
                else if(fieldStatus === "optional")
                    return "optional";
                else
                    return "d-none";
            }
            self.addressRequired = function(entry_type){ //'manual' or 'auto'
                if(self.donationSettings().address_field_status !== 'required'){
                    console.log("address not required")
                    return false;
                }

                if(entry_type === "auto"){
                    console.log("auto: ",! self.manualAddressEntry() && ! self.address());
                    return ! self.manualAddressEntry() && ! self.address();
                }

                if(entry_type === "manual"){
                    console.log("manual: ", self.manualAddressEntry());
                    return  self.manualAddressEntry();
                }

            }

            
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
                    amt = parseFloat(self.otherAmount());
                else
                    amt = parseFloat(self.level());
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
                return self.currencyFormatter().format(value);
            }
            self.moneyFormatWhole = function(value){
                return self.currencyFormatterWhole().format(value);
            }
            self.clearAddress = function(){
                self.address(undefined);
                jQuery(".mail-address").val("");
            }
            self.navEnabled = function(){
                return self.donationMethods() === "both";
            }
            self.methodEnabled = function(methodName){
                // either both methods are allowed ('both'), 
                //  or the one allowed equals the one we're asking about
                return self.donationMethods() === "both" 
                       || self.donationMethods() === methodName;
            }
            self.methodActive = function(methodName){
                var x = (methodName === "ergatas" && (self.donationMethods() === "both" || self.donationMethods() === 'ergatas'))
                       || (methodName === "agency" &&  self.donationMethods() === 'agency')

                if(x)
                    return "show active";
                else
                    return "";
            }

           self.showCheckout = async function(sessionInfo){
                const clientSecret = sessionInfo.client_secret;
                const stripeAccount = sessionInfo.stripeAccount;
                const Stripe = await loadStripe();
                const pubKey = process.env.STRIPE_PUB_KEY;
                // In test mode, turn on Stripe's testing assistant so we can simulate a customer's
                // location and preview Adaptive Pricing currency presentment. It never renders with
                // live keys, so gating on the test-key prefix keeps it out of production entirely.
                const testMode = typeof pubKey === "string" && pubKey.startsWith("pk_test");
                const stripe = Stripe(pubKey,{
                    stripeAccount:stripeAccount,
                    developerTools:{ assistant:{ enabled: testMode } },
                });
                if(checkoutSession != null)
                    checkoutSession.destroy();
                checkoutSession = await stripe.initEmbeddedCheckout({
                    clientSecret:clientSecret,
                    onComplete: function(){
                        console.log("checkout complete");
                        self.hideModal();
                        //record the completed donation (GA4 confirmed-donation). This is
                        //the primary on-site completion path (embedded checkout, no redirect).
                        if(profileKey !== 0)
                            utils.recordConfirmedDonation(profileKey,self.amount(),
                                                          self.monthly() ? 'recurring':'one-time');
                        utils.celebrateDonation();
                        checkoutSession.destroy();
                        checkoutSession = null;
                    }
                });
                jQuery("#ergatas").children().remove();
                checkoutSession.mount("#ergatas");
            }
            self.submitForm= async function(){
                console.log("submitted form.",{finalAmount:self.finalAmount(),email:self.email(),monthly:self.monthly()});
                if(self.finalAmount() === 0){
                    self.error("Please set an amount to donate");
                    return;
                }
                if(profileKey !== 0){ // indicates a preview
                        console.log("donate clicked by "+profileKey);

                        if(self.manualAddressEntry() === true){
                            self.address(ko.toJS(self.addressComponents));
                            console.log("using manual address: ",self.address());
                        }

                        try{

                            const result = await self.server.postJson("/api/makeDonation",{
                                        email: self.email(),
                                        worker_name:params.workerName,
                                        donor_name: self.donorName(),
                                        missionary_profile_key: params.missionary_profile_key,
                                        donation_type:self.monthly() ? 'recurring':'one-time',
                                        return_url: window.location.origin+window.location.pathname,
                                        address: self.address(),
                                        phone: self.phone(),
                                        currency: self.selectedCurrency(),
                                        amount:parseInt(self.finalAmount()*100)});
                            if(result == null || result.client_secret== null)
                                throw "got null result from makeDonation";


                            dataLayer.push({event:"direct-donate",
                                        'missionary_profile_key':profileKey,
                                        'amount':self.amount(),
                                        'monthly':self.monthly()});

                           await self.showCheckout(result);
                        }catch(error){
                            console.error("failed to make donation: ",error);
                            alertify.error("Oops, something bad happened! We cannot process your donation right now, please check back at a later time.")
                        }
                    }
            };
        },

        template: require(`./${name}.html`),
    });
}
 

