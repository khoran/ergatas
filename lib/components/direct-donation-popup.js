import * as utils from '../client/client-utils';
import {ensureFields} from '../shared/shared-utils';
import * as mapUtils from '../client/google-map';
import {allCountries} from '../shared/shared-utils';
import alertify from 'alertifyjs';

/**
 * INPUT PARAMS
 *      - server: refrence to server object
 *      - da: data-access object 
 *      - missionary_profile_key: profile to attribute possible transaction to
 *      - workerName: name of worker
 *      - ownProfile: true if a logged in user is clicking their own profiles donate button
 *      - instructions: from worker profile
 *      - donationUrl: from worker profile
 *      - donationMethods: one of 'both', 'ergatas', or 'agency'
 */
export function register(){
    const name='direct-donation-popup'
    var counter = 0;
    const countryDataPromise = allCountries();

    const moneyRE = /^\d+\.?\d{0,2}$/;
    const moneyFormatter = new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
    });

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
                ensureFields(params,["server","missionary_profile_key","workerName"]);
            }catch(error){
                console.error("DONATE BUTTON INIT FAILED: missing some parameters to direct-donation-popup component: ",error);
                return; 
            }


            const profileKey = ko.unwrap(params.missionary_profile_key);
            const ownProfile = params.ownProfile  || false; // assume not own profile if not given

            self.instructions = params.instructions || "";
            self.donationUrl = params.donationUrl;
            self.da = params.da;
            self.profileKey = profileKey;
            self.ownProfile = ownProfile;

            self.level = ko.observable("50");
            self.otherAmount= ko.observable(0);
            self.monthly= ko.observable();
            self.email = ko.observable();
            self.mode=ko.observable("pre-donate");
            self.includeFee=ko.observable(true);
            self.title=ko.observable("Donate to the ministry of "+params.workerName);
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
            self.donationMethods = ko.observable(params.donationMethods || "both");


            countryDataPromise.then(self.countryCodes);

            self.modalID = name+counter;

            self.openDialog = function(){
                setupAddressEntry(self.modalID,self.address);
                dataLayer.push({event:"donate", 'donate-level':1});
                jQuery("#"+self.modalID).modal("show");
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
                return moneyFormatter.format(value);
            }
            self.clearAddress = function(){
                self.address(undefined);
                jQuery(".mail-address").val("");
            }
            self.navEnabled = function(){
                return self.donationMethods() === "both";
            }
            self.methodEnabled = function(methodName){


                console.log("checking if method is enabled ",methodName,params.donationMethods, self.donationMethods());
                // either both methods are allowed ('both'), 
                //  or the one allowed equals the one we're asking about
                return self.donationMethods() === "both" 
                       || self.donationMethods() === methodName;
            }
            self.methodActive = function(methodName){
                var x = (methodName === "ergatas" && (self.donationMethods() === "both" || self.donationMethods() === 'ergatas'))
                       || (methodName === "agency" &&  self.donationMethods() === 'agency')

                console.log(methodName+" active? "+x,self.donationMethods());
                if(x)
                    return "show active";
                else
                    return "";
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

                            const result = await params.server.postJson("/api/makeDonation",{
                                        email: self.email(),
                                        worker_name:params.workerName,
                                        donor_name: self.donorName(),
                                        missionary_profile_key: params.missionary_profile_key,
                                        donation_type:self.monthly() ? 'recurring':'one-time',
                                        return_url: window.location.origin+window.location.pathname,
                                        address: self.address(),
                                        phone: self.phone(),
                                        amount:parseInt(self.finalAmount()*100)});
                            if(result == null || result.payment_url == null)
                                throw "got null result from makeDonation";


                            dataLayer.push({event:"direct-donate",
                                        'amount':self.amount(),
                                        'monthly':self.monthly()});

                            location.assign(result.payment_url);
                        }catch(error){
                            console.error("failed to make donation: ",error);
                            alertify.error("Oops, something bad happened! We cannot process your donation right now, please check back at a later time.")
                        }
                    }
                    self.mode("post-donate");

                    jQuery("#"+self.modalID).modal("hide");
            };



        },

        template: require(`./${name}.html`),
    });
}
 

