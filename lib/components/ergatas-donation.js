/**
 *  INPUT
 * ----------
 *      - server: server object with postJson function
 */


import '../scss/bloomerang.scss';
export function register() {
    const name = "ergatas-donation";
    ko.components.register(name, {
        viewModel: function (params) {
            // initiate script loading early. will wait for it later
            // console.log("LOADING STRIPE");
            // jQuery.getScript(stripeURL);

            var self = this;
            console.log("params: ", params);
            const server = params.server;

            self.state = ko.observable("donate");
            self.errorMessage = ko.observable();
            self.spinner = ko.observable(false);

            bloomerangInit(self.state);

        },
        template: require('./' + name + '.html')
    });
}

function bloomerangInit(pageState){
    var insertForm16384 = function() {
        var html16384 =  
        '<div id="donation-form-container">' + 
        '  <form id="donation-form" class="donation-form" method="post" onsubmit="event.preventDefault(); collectPayment();">' + 
        '    <div class="errors hidden"></div>' + 
        '    <div class="section donation">' + 


'    <div class="input-group">'+
'        <div class="input-btn-group btn-group-toggle" data-toggle="buttons">'+
'            <label class="btn btn-ergatas-primary active">'+
'                <input type="radio" name="donation-level" id="option1" value="10.00" checked> $10'+
'            </label>'+
'            <label class="btn btn-ergatas-primary ">'+
'                <input type="radio" name="donation-level" id="option2" value="50.00"> $50'+
'            </label>'+
'            <label class="btn btn-ergatas-primary">'+
'                <input type="radio" name="donation-level" id="option3" value="100.00">$100 '+
'            </label>'+
'<br>'+
           '<div class="mt-3 field text other-amount" >' + 
'            <div class="input-group">'+
'                <div class="input-group-prepend btn-group-toggle">'+
'                    <label class="btn btn-ergatas-primary">'+
'                        <input type="radio" name="donation-level" id="other-option"> Other'+
'                    </label>'+
'                </div>'+
  '                <input id="other-amount" name="other-amount" style="height: 46px" class=" form-control otherAmount" type="text" placeholder="$0.00"></input>'+
'            </div>'+
           '</div>' + 
'        </div>'+
'    </div>'+


//        '      <div class="field radio 18432 required" >' + 
//        '<label for="18432"><input id="18432" name="donation-level" class="required" type="radio" value="10.000000" maxlength="255"></input><span class="label">$10.00 </span></label>' + 
//        '</div>' + 
//        '<div class="field radio 18433 required" >' + 
//        '<label for="18433"><input id="18433" name="xdonation-level" class="required" type="radio" value="50.000000" maxlength="255"></input><span class="label">$50.00 </span></label>' + 
//        '</div>' + 
//        '<div class="field radio 18434 required" >' + 
//        '<label for="18434"><input id="18434" name="xdonation-level" class="required" type="radio" value="100.000000" maxlength="255"></input><span class="label">$100.00 </span></label>' + 
//        '</div>' + 
//        '<div class="field radio other-option required" >' + 
//        '<label for="other-option"><input id="other-option" name="xdonation-level" class="required" type="radio" maxlength="255"></input><span class="label">Other</span></label>' + 
//        '</div>' + 


//        '<div class="field text other-amount" >' + 
//        '<input id="other-amount" name="other-amount" class="otherAmount" type="text" placeholder="$0.00"></input>' + 
//        '</div>' + 
        '' + 
        '</div>' + 
        '    <div class="my-4 section recurring">' + 
        '      <div class="field checkbox recurring" >' + 
        '<label for="recurring"><input id="recurring" name="recurring" type="checkbox" maxlength="255"></input><span class="label">Recurring Donation</span></label>' + 
        '</div>' + 
        '<div class="field  frequency form-group required" style="display: none">' + 
        '<label for="frequency">Frequency<span class="required-star">*</span></label>' + 
        '<select id="frequency" name="frequency" class=" form-control required"><option value=""></option>' + 
        '<option value="Weekly">Weekly</option>' + 
        '<option value="Monthly" selected>Monthly</option>' + 
        '<option value="Quarterly">Quarterly</option>' + 
        '<option value="Yearly">Yearly</option>' + 
        '</select>' + 
        '</div>' + 
        '' + 
        '</div>' + 

 '    <div class="my-4 section true-impact">' + 
        '      <div class="field checkbox true-impact" >' + 
        '<label for="true-impact"><input id="true-impact" name="true-impact" type="checkbox" maxlength="255"></input><span class="label">Add [amount] to help offset bank fees</span></label>' + 
        '</div>' + 
        '' + 
        '</div>' + 


        '    ' + 
        '    <div class="section contact">' + 
        '      <div class="field text first-name form-group required" >' + 
        '<input id="first-name" aria-label="first name" placeholder="First Name" name="first-name" class="form-control required" type="text"></input>' + 
        '</div>' + 
        '<div class="field text last-name form-group required" >' + 
        '<input id="last-name" aria-label="last name" name="last-name" placeholder="Last Name" class=" form-control required" type="text"></input>' + 
        '</div>' + 
        '<div class="field email email-address form-group required" >' + 
        '<input id="email-address" aria-label="email address" name="email-address" class="email form-control required" type="email" placeholder="Email Address"></input>' + 
        '</div>' + 
        '' + 
        '</div>' + 


        '    <div class="section payment">' + 
        '      <div class="field text form-group payment required">' + 
        '<label for="card-element"><span class="label"></span></label>' + 
        '<div class="form-control" id="card-element"></div><div id="card-errors" role="alert"></div></div>' + 
        '' + 
        '</div>' + 
         
       
        '    <div class="section captcha">' + 
        '      <label id=\'noCaptchaResponseError\' class=\'error noCaptchaResponseError\' style=\'display: none\'>You must fill out the CAPTCHA</label><div id="captcha16384"></div>' + 
        '' + 
        '</div>' + 
        '    <div class="my-4 btn-group">' + 
    '      <input class="btn btn-submit btn-submit-donation btn-ergatas-primary" type="submit" value="Enter Payment" id="express-submit" disabled="true" />' + 
    '    </div>' + 
    '  </form>' + 
    '</div>' + 
    '<div id="donation-processing-container" style="display: none">' + 
    '  <h2>Processing...</h2><p>Your transaction is being processed. Please do not close your browser or leave this page.</p>' + 

    ' <div  class="text-center" >'+
    '     <img  src="/img/block-spinner2.svg"/>'+
    ' </div>'+
    '</div>' + 
    '' + 
'' +  '';
        var successHtml16384 = '\u003cscript\u003ewindow.location.replace(\'https://ergatas.org\')\u003c/script\u003e';
        ( function($) {
            //if (Bloomerang.useDonationId('16384')) { 
                                      Bloomerang.useDonationId('16384');
                                      Bloomerang.useProcessor('15361', 'StripeConnect');
                                    //} else {
                                      //html16384 = '<p style="color: red">Only one donation or event registration form can be used on each page.</p>';
                                    //};
                                    if (jQuery('#bloomerangForm16384').length) {
                        
                    if (window.ActiveXObject) { // they are using IE < 11, which doesn't support TLS 1.1
                        html16384 = '<p style="color: red">​Your browser does not support the minimum security requirements for keeping your Credit Card information safe when processing payments. Please upgrade ​your browser or download the latest version of' + 
                        ' <a target=\'_blank\' href=\'https://www.google.com/chrome/browser/desktop/\'>Chrome</a> or <a target=\'_blank\' href=\'https://www.mozilla.org/en-US/firefox/new/\'>Firefox</a>.</p>';
                    }
                        jQuery('#bloomerangForm16384').after(html16384);
                         //if (!Bloomerang.SpreedlyScriptLoaded) {
                                            Bloomerang.Util.load('https://core.spreedly.com/iframe/express-2.min.js', 
                                                function() { return SpreedlyExpress != undefined; },
                                                function() {
                                                    SpreedlyExpress.onInit(function() { jQuery('#express-submit').attr('disabled', false); });
                                                    Bloomerang.initSpreedly = function() {
                                                        SpreedlyExpress.init('OqOMv1ksjPtXEYHtCYsVXzEpCbR', { 'company_name': 'Ergatas' });
                                                    };
                                                    Bloomerang.initSpreedly();
                                                });
                                        //}
                                        //Bloomerang.SpreedlyScriptLoaded = true;
                         Bloomerang.Util.requireStripe(function() {
                                        Bloomerang.Util.Stripe = Stripe('pk_live_51HjYRSEmaBejPs5bYFI735wWm8A7HHdWV84gG1f1R2yRnxiNx1Xug8BWC9JhFVg6HhrcWJzVdF0rXDAdkGXoYWbr00Qwn6Yf6f'); 
                                        var elements = Bloomerang.Util.Stripe.elements(); 
                                     
                                        // Create an instance of the card Element.
                                        Bloomerang.Util.StripeCard = elements.create('card', {
                                          hidePostalCode: true,
                                          style: {
                                            base: {
                                              color: "#272D30",
                                              fontSize: "14px",
                                              fontFamily: "'Century Gothic', verdana, sans-serif"
                                            },
                                            invalid: {
                                              color: "#272D30"
                                            }
                                          }
                                        });
                                     
                                        // Add an instance of the card Element into the `card-element` <div>.
                                        Bloomerang.Util.StripeCard.mount('#card-element');
                                     
                                        // Handle real-time validation errors from the card Element.
                                        Bloomerang.Util.StripeCardIsValid = false;
                                        Bloomerang.Util.StripeCard.addEventListener('change', function(event) {
                                          var displayError = document.getElementById('card-errors');
                                          if (event.error) {
                                            displayError.textContent = event.error.message;
                                          } else {
                                            displayError.textContent = '';
                                          }
                                          if (event.complete) {
                                            Bloomerang.Util.StripeCardIsValid = true;
                                          } else {
                                            Bloomerang.Util.StripeCardIsValid = false;
                                          }
                                        });
                                      });

                                      jQuery(".donation-form #express-submit").val("Donate");
                                      jQuery(".registration-form #express-submit").val("Register");
                    };
        //if (Bloomerang.paymentFormLoaded) {
            //return false;
        //}
        Bloomerang.paymentFormLoaded = true;
        window.captchaLoadCallback = function() {
            Bloomerang.gRecaptchaLoaded = true;
        };
        Bloomerang.Util.load('https://www.google.com/recaptcha/api.js?onload=captchaLoadCallback&render=6LdotL0ZAAAAALDh_JBTO_JC-CF4ZnSysamIHV3c',
                function() { return Bloomerang.gRecaptchaLoaded; },
                function() {
                    jQuery('.section.captcha').removeAttr('style');
                    jQuery('form.donation-form').data('captcha-id', grecaptcha.render('captcha16384', { 'sitekey' : '6LdekUcaAAAAAMNEUFCk9aEH1njL9TO8YKuE0GNq' }));
                },
                true,
                true);
        Bloomerang.transactionFee = 0.3; Bloomerang.transactionFeeRate = 0.022; Bloomerang.transactionFeeEft = 
                    Bloomerang.transactionFee = 0.3; Bloomerang.transactionFeeRate = 0.022; Bloomerang.transactionFeeEft = 
        Bloomerang.transactionFee = 0.3; Bloomerang.transactionFeeRate = 0.022; Bloomerang.transactionFeeEft = 
        Bloomerang.useKey('pub_fd3bac55-6583-11eb-ad37-023f69b29baf');
        Bloomerang.Util.getDonationAmount = function() {
          return Number(accounting.unformat(jQuery(".donation-form .section.donation input[name='donation-level']:checked").val() || jQuery(".donation-form #donation-amount").val()));
        };

        // Register proper callbacks for various stages/outcomes of submission
        Bloomerang.Widget.Donation.OnSubmit = function (args) {
            jQuery(".btn-submit-donation").val("Donating...").prop("disabled", true).addClass("disabled");
            var val = function (selector) { return jQuery(selector).val(); };
            var country = val(".donation-form #country");
            var state = Bloomerang.Util.getCorrectState(country, val(".donation-form #state"), val(".donation-form #province"));
            var zipCode = Bloomerang.Util.getCorrectZipCode(country, val(".donation-form #zip-code"), val(".donation-form #postal-code"));
            Bloomerang.Account
                    .individual()
                    .firstName(val(".donation-form #first-name"))
                    .middleName(val(".donation-form #middle-name"))
                    .lastName(val(".donation-form #last-name"))

                    .homeAddress("22885 Kuna Ct",
                                 "Wildomar",
                                 "CA",
                                 "92595",
                                 "USA")

                   // .homeAddress(val(".donation-form #street-address"),
                   //              val(".donation-form #city"),
                   //              state,
                   //              zipCode,
                   //              country)
                    .homeEmail(val(".donation-form #email-address"))
                    //.homePhone(val(".donation-form #phone-number"))
                    .applyDonationCustomFields();

            if (jQuery(".donation-form #consent-all").prop("checked")) {
              Bloomerang.Account.optedInStatus(jQuery(".donation-form #consent-email").prop("checked"),
                                               jQuery(".donation-form #consent-mail").prop("checked"),
                                               jQuery(".donation-form #consent-phone").prop("checked"));
            }

            var amount = Bloomerang.Util.getDonationAmount() + Bloomerang.Util.getDonationTrueImpactAmount();
            if (jQuery(".donation-form #recurring").prop("checked")) {
                Bloomerang.RecurringDonation
                        .amount(amount)
                        .fundId(val(".donation-form #fund"))
                        .note(val(".donation-form #comment"))
                        .frequency(val(".donation-form #frequency") || "Monthly")
                        .startDate(val(".donation-form #start-date"))
                        .applyDonationCustomFields();

                // Need to do a null-check here because they might have a cached version of Bloomerang-v2.js
                if (Bloomerang.RecurringDonation.trueImpactEnabled && Bloomerang.RecurringDonation.trueImpactUsed) {
                  Bloomerang.RecurringDonation
                        .trueImpactEnabled(jQuery(".donation-form .true-impact .fee-amount").length > 0)
                        .trueImpactUsed(jQuery(".donation-form .true-impact input:checked").length > 0);
                }
            } else {
                Bloomerang.Donation
                        .amount(amount)
                        .fundId(val(".donation-form #fund"))
                        .note(val(".donation-form #comment"))
                        .applyDonationCustomFields();

                // Need to do a null-check here because they might have a cached version of Bloomerang-v2.js
                if (Bloomerang.Donation.trueImpactEnabled && Bloomerang.Donation.trueImpactUsed) {
                  Bloomerang.Donation
                        .trueImpactEnabled(jQuery(".donation-form .true-impact .fee-amount").length > 0)
                        .trueImpactUsed(jQuery(".donation-form .true-impact input:checked").length > 0);
                }
            }

            if (jQuery("#donation-form #Checking").is(":checked") ||
                jQuery("#donation-form #Savings").is(":checked")) {
              Bloomerang.Eft
                .accountNumber(val(".donation-form #accountNumber"))
                .routingNumber(val(".donation-form #routingNumber"))
                .type(jQuery("#donation-form .section.payment input[type='radio']:checked").attr("id"));
            }
        };

        Bloomerang.ValidateDonationFormCaptcha = function() {
            if (typeof(grecaptcha) !== "undefined" && jQuery("#captcha" + Bloomerang.Data.WidgetIds.Donation).children().length) {
                var captchaResponse = grecaptcha.getResponse(jQuery(".donation-form").data("captcha-id"));
                if (captchaResponse) {
                    jQuery(".donation-form .noCaptchaResponseError").hide();
                    Bloomerang.captchaResponse(captchaResponse);
                    return true;
                } else {
                    jQuery(".donation-form .noCaptchaResponseError").show();
                    return false;
                }
            } else return true;
        };
        Bloomerang.scrollToElement = function(element) {
            var distance = 100;
            var offset = element.offset().top;
            var offsetTop = offset > distance ? offset - distance : offset;
		        jQuery('html, body').animate({ scrollTop : offsetTop}, 500);
        };
        Bloomerang.Api.OnSuccess = Bloomerang.Widget.Donation.OnSuccess = function (response) {
            jQuery("#donation-processing-container").hide();
            var formContainer = jQuery("#donation-form-container");
            formContainer.show();
            pageState("succeeded");
            //formContainer.html(successHtml16384);
            //Bloomerang.scrollToElement(formContainer);
        };
        Bloomerang.Api.OnError = Bloomerang.Widget.Donation.OnError = function (response) {
            jQuery(".btn-submit-donation").prop("disabled", false).removeClass("disabled");
            Bloomerang.Util.updateDonateButtonText();
            jQuery("#donation-form-container .errors").removeClass("hidden").html(response.Message);
            jQuery("#donation-processing-container").hide();
            jQuery("#donation-form-container").show();
            Bloomerang.scrollToElement(jQuery("#donation-form-container .errors"));
            Bloomerang.cancelFinancialSubmission(jQuery("#donation-form"));
            SpreedlyExpress.unload();
            Bloomerang.initSpreedly();
            if (typeof(grecaptcha) !== "undefined" && jQuery("#captcha" + Bloomerang.Data.WidgetIds.Donation).children().length) {
              grecaptcha.reset(jQuery(".donation-form").data("captcha-id"));
            }
        };
        
        Bloomerang.Util.applyDonationCustomFields = function (obj, type) {
        
            // Clear any fields from a previous failed submission
            obj.clearCustomFields();
        
            // Apply all <input> (not multiselect), <select> and <textarea> fields
            jQuery(".donation-form .section.custom-fields :input:not(a > input, select)[id*=" + type + "]").each(function() {
                if (jQuery(this).val().hasValue()) {
                    obj.customFreeformField(jQuery(this).attr("id").toUntypedValue(), jQuery(this).val());
                }
            });
            
            // Apply all <select> fields
            jQuery(".donation-form .section.custom-fields select[id*=" + type + "]").each(function() {
                if (jQuery(this).val().hasValue()) {
                    obj.customPickField(jQuery(this).attr("id").toUntypedValue(), jQuery(this).val());
                }
            });
                
            // Apply all multiselect fields
            jQuery(".donation-form .section.custom-fields .checkboxes[id*=" + type + "]").each(function() {
                obj.customPickField(jQuery(this).attr("id").toUntypedValue(),
                jQuery.map(jQuery(this).children(".checkbox.selected"), function(v) { return jQuery(v).attr("data-id"); }));
            });
        };
        
        String.prototype.hasValue = function() {
            return (this && jQuery.trim(this)); //IE8 doesn't have a native trim function
        };
        
        Bloomerang.Account.applyDonationCustomFields = function () {
            Bloomerang.Util.applyDonationCustomFields(this, "Account");
            return this;
        };
        
        Bloomerang.Donation.applyDonationCustomFields = function () {
            Bloomerang.Util.applyDonationCustomFields(this, "Transaction");
            return this;
        };
        
        Bloomerang.RecurringDonation.applyDonationCustomFields = function () {
            Bloomerang.Util.applyDonationCustomFields(this, "Transaction");
            return this;
        };
        
        String.prototype.toUntypedValue = function() {
            return this.substring(this.indexOf('_') + 1);
        };
        
        Date.prototype.toDateInputValue = function() {
            var local = new Date(this);
            local.setMinutes(this.getMinutes() - this.getTimezoneOffset());
            return (local.getMonth() + 1) + // Add one to the month because it starts at 0
                    "/" + local.getDate() + "/" + local.getFullYear();
        };
        
        jQuery(document).ready(function() {
            jQuery(".donation-form .field.start-date input").val(new Date().toDateInputValue());
        });
        
        // Hide recurring donation options if recurring donation box is unchecked
        jQuery(".donation-form .field.recurring").change(function() { 
            jQuery(".donation-form .field.recurring").siblings().each(function(i, e) { 
                jQuery(e).toggle();
            }); 
        })
        
        // The other-amount field is only equired when the "Other" donation-level is selected
        var toggleOtherAmountRequired = function () { 
          jQuery(".donation-form #other-amount").toggleClass("required",
            jQuery(".donation-form #other-option").prop("checked"));
          Bloomerang.Util.calculateDonationTrueImpact();
        };
        jQuery(".donation-form .section.donation input[name='donation-level']").change(function() {
           toggleOtherAmountRequired();
           Bloomerang.Util.updateDonateButtonText();
         });

        if (jQuery(".donation-form .true-impact label").length) {
          jQuery(".donation-form .true-impact label")[0].innerHTML = jQuery(".donation-form .true-impact label")[0].innerHTML.replace("[amount]", "<span class='fee-amount'>$0</span>");
        }
        Bloomerang.Util.calculateDonationTrueImpact = function() {
          if (!jQuery(".donation-form .true-impact .fee-amount").length) { return; }
          // Note that we don't really care about JS floating point math. It's OK if the numbers are a couple cents off.
          var amount = Bloomerang.Util.getDonationAmount();
          var isEft = (jQuery("#donation-form #Checking").is(":checked") || jQuery("#donation-form #Savings").is(":checked"));
          var feeRate = isEft ? 0 : Bloomerang.transactionFeeRate;
          var newTotal = (amount + (isEft ? Bloomerang.transactionFeeEft : Bloomerang.transactionFee)) / (1 - feeRate);
          var impactAmount = Number((newTotal - amount).toFixed(2));
          jQuery(".donation-form .true-impact .fee-amount").text(accounting.formatMoney(impactAmount));
          return impactAmount;
        };
        Bloomerang.Util.getDonationTrueImpactAmount = function() {
          if (jQuery(".donation-form .true-impact input:checked").length) {
            return Bloomerang.Util.calculateDonationTrueImpact();
          }
          return 0;
        };
        
        Bloomerang.Util.updateDonateButtonText = function() {
          if (jQuery("#donation-form #Checking").is(":checked") ||
              jQuery("#donation-form #Savings").is(":checked") ||
              Bloomerang.Api.ProcessorType === "StripeConnect") {
            var amount = Bloomerang.Util.getDonationAmount();
            var impactAmount = Bloomerang.Util.getDonationTrueImpactAmount();
            jQuery(".btn-submit-donation").val("Donate " + accounting.formatMoney(amount + impactAmount));
          } else {
            jQuery(".btn-submit-donation").val("Enter Payment");
          }
        };

        // Changing the value of other-amount should change the value of other-option
        jQuery(".donation-form #other-amount").change(function () { 
          jQuery(".donation-form #other-option").val(jQuery(this).val());
          Bloomerang.Util.calculateDonationTrueImpact();
          Bloomerang.Util.updateDonateButtonText();
        });
        
        jQuery(".donation-form #donation-amount").change(function() {
          Bloomerang.Util.calculateDonationTrueImpact();
          Bloomerang.Util.updateDonateButtonText();
        });
        
        // Clicking into the other-amount field should select the other-option
        jQuery(".donation-form #other-amount").click(function() { 
          var option = jQuery(".donation-form #other-option");
          option.prop('checked',true);
          option.parent("label").button("toggle");
          jQuery(".donation-form #other-amount").focus();
          toggleOtherAmountRequired();
          Bloomerang.Util.calculateDonationTrueImpact();
        });

        jQuery.validator.addMethod("phoneUS", function(phone_number, element) {
            var digits = phone_number.replace(/\D/g, "");
            return this.optional(element) || digits.length == 7 || digits.length == 10 || digits.length == 11;
        }, "Please specify a valid phone number or use '+' for international.");

        jQuery.validator.addMethod("phoneInternational", function (phone_number, element) {
            return this.optional(element) || /^\+[0-9\-\(\)\s.]+$/i.test(phone_number);
        }, "Please specify a valid phone number.");
        jQuery.validator.classRuleSettings.phoneInternational = { phoneInternational: true };
        
        jQuery.validator.addMethod("zipcodeUS", function (value, element) {
            return this.optional(element) || /\d{5}-\d{4}$|^\d{5}$/.test(value)
        }, "The specified US ZIP Code is invalid");

        jQuery.validator.addMethod("currency", function (value, element, options) {
            return !value ||
                value
                  .replace("$", "")
                  .replace(".", "")
                  .split(",").join("")
                  .match(/^\d+$/g);
        }, "Not a valid currency");

        jQuery.validator.classRuleSettings.currency = { currency: true };
        
        // Validate the other amount, but only if they selected it
        jQuery.validator.addMethod("otherAmount", function(value, element, param) {
          if (jQuery(".donation-form #other-option").prop("checked")) {
            return jQuery.validator.methods.min.bind(this)(value, element, 1) &&
              jQuery.validator.methods.currency(value, element);
          }
          return true;
        }, "Invalid amount");
        
        jQuery.validator.classRuleSettings.otherAmount = { otherAmount: true };

        jQuery.validator.addMethod("number", function (value, element, options) {
          return !value ||
              value
                .replace(".", "")
                .split(",").join("")
                .match(/^\d+$/g);
        }, "Not a valid number");

        jQuery.validator.classRuleSettings.number = { number: true };
        
        jQuery.validator.addMethod("validYear", function (value, element, options) {
            try {
                return (!value || value.match(/^[1-9]\d\d\d$/)) ? true : false;
            }
            catch (e) {
                return false;
            }
        }, function () { return "Must be a 4 digit year"; });

        jQuery.validator.classRuleSettings.validYear = { validYear: true };
        
        // Validate that the donation amount is at least $1
        jQuery.validator.methods.min = function( value, element, param ) {
          if (typeof (accounting) === "undefined") { // rip out $ and ,
              value = ((value + "") || "").replace(/[\$,]/g, "");
          }
          else { // Use accounting.parse, to handle $ and ,
              value = accounting.parse(value);
          }
          return this.optional( element ) || value >= param;
        };
        jQuery.validator.classRuleSettings.minimum1 = { min: 1 };
        jQuery.validator.messages.min = 'Please enter a value of at least {0}.'

        jQuery(".donation-form #country").change(function(event) {
          var element = jQuery(event.target || event.srcElement); // cross-browser event target selection
          var isInternational = (element.val() != "US" && element.val() != "CA" && element.val() != "BM");
          // TODO: Remove this when we have figured out the canada state/province issue
          Bloomerang.Util.addLog("Pre country change: Country=" + element.val() + ", State=" + jQuery(".donation-form #state").val() + ", Province=" + jQuery(".donation-form #province").val() + ", City=" + jQuery(".donation-form #city").val());
          jQuery(".donation-form #state, .donation-form #province").val(""); // clear the state when the country changes
          jQuery(".donation-form .field.city, .donation-form .field.state, .donation-form .field.province, .donation-form .field.zip-code, .donation-form .field.postal-code").toggle(!isInternational);
          jQuery(".donation-form #street-address").toggleClass("international", isInternational);
          if (element.val() == "BM") {
            jQuery(".donation-form .field.city .label").text(jQuery(".donation-form .field.city input").data("bm-label"));
          } else if (element.val() == "US" || element.val() == "CA") {
            jQuery(".donation-form .field.city .label").text(jQuery(".donation-form .field.city input").data("us-label"));
          }
          if (element.val() == "US") {
            jQuery(".donation-form .field.state, .donation-form .field.zip-code").show();
            jQuery(".donation-form .field.province, .donation-form .field.postal-code").hide();
          } else if (element.val() == "CA") {
            jQuery(".donation-form .field.state, .donation-form .field.zip-code").hide();
            jQuery(".donation-form .field.province, .donation-form .field.postal-code").show();
          } else if (element.val() == "BM") {
            jQuery(".donation-form .field.state, .donation-form .field.province, .donation-form .field.zip-code").hide();
            jQuery(".donation-form .field.postal-code").show();
          } else {
            jQuery(".donation-form #city, .donation-form #postal-code, .donation-form #zip-code").val("");
          }
          jQuery(".donation-form .section.consent").toggleClass("hidden", !Bloomerang.Util.isCountryInEurope(element.val()));
          // TODO: Remove this when we have figured out the canada state/province issue
          Bloomerang.Util.addLog("Post country change: Country=" + element.val() + ", State=" + jQuery(".donation-form #state").val() + ", Province=" + jQuery(".donation-form #province").val()+ ", City=" + jQuery(".donation-form #city").val());
        });

        // TODO: Remove this when we have figured out the canada state/province issue
        // We use the focusin function to save the previous value so we can log out the previous and new values on change
        // https://stackoverflow.com/questions/29118178/input-jquery-get-old-value-before-onchange-and-get-value-after-on-change/29118530
        jQuery(".donation-form #state").focusin(function(e) {
          var element = jQuery(e.target || e.srcElement); // cross-browser event target selection
          element.data('val', element.val());
        });

        // TODO: Remove this when we have figured out the canada state/province issue
        jQuery(".donation-form #state").change(function(e) {
          var element = jQuery(e.target || e.srcElement); // cross-browser event target selection
          var prev = element.data('val');
          var current = element.val();
          var provinceElement = jQuery(".donation-form #province");
          var prevProvince = provinceElement.data('val');
          var currentProvince = provinceElement.val();
          Bloomerang.Util.addLog("State Changed: Target=" + e.target.name + ", PreValue=" + prev + ", Value=" + current + ", Province PreValue =" + prevProvince + ", Province CurrentValue =" + currentProvince);
        });

        // TODO: Remove this when we have figured out the canada state/province issue
        // We use the focusin function to save the previous value so we can log out the previous and new values on change
        // https://stackoverflow.com/questions/29118178/input-jquery-get-old-value-before-onchange-and-get-value-after-on-change/29118530
        jQuery(".donation-form #province").focusin(function(e) {
          var element = jQuery(e.target || e.srcElement); // cross-browser event target selection
          element.data('val', element.val());
        });

        // TODO: Remove this when we have figured out the canada state/province issue
        jQuery(".donation-form #province").change(function(e) {
          var element = jQuery(e.target || e.srcElement); // cross-browser event target selection
          var prev = element.data('val');
          var current = element.val();
          var stateElement = jQuery(".donation-form #state");
          var prevState = stateElement.data('val');
          var currentState = stateElement.val();
          Bloomerang.Util.addLog("Province Changed: Target=" + e.target.name + ", PreValue=" + prev + ", Value=" + current + ", State PrevValue=" + prevState + ", State Current=" + currentState);
        });

        // TODO: Remove this when we have figured out the canada state/province issue
        // We use the focusin function to save the previous value so we can log out the previous and new values on change
        // https://stackoverflow.com/questions/29118178/input-jquery-get-old-value-before-onchange-and-get-value-after-on-change/29118530
        jQuery(".donation-form #city").focusin(function(e) {
          var element = jQuery(e.target || e.srcElement); // cross-browser event target selection
          element.data('val', element.val());
        });

        // TODO: Remove this when we have figured out the canada state/province issue
        jQuery(".donation-form #city").change(function(e) {
          var element = jQuery(e.target || e.srcElement); // cross-browser event target selection
          var prev = element.data('val');
          var current = element.val();
          Bloomerang.Util.addLog("City Changed: Target=" + e.target.name + ", PreValue=" + prev + ", Value=" + current);
        });

        jQuery(".donation-form #phone-number").change(function () {
          var phoneField = jQuery(".donation-form #phone-number");
          var internationalNumber = phoneField.val().substring(0,1) === '+';
          phoneField.toggleClass("phoneUS", !internationalNumber);
          phoneField.toggleClass("phoneInternational", internationalNumber);
        })

        window.collectPayment = function () {
          var form = jQuery("#donation-form");

          if (!Bloomerang.ValidateDonationFormCaptcha()) {
            return false;
          }
  
          if (!form.valid()) {
            return false;
          }
          
          if (Bloomerang.Api.ProcessorType === "StripeConnect" && !Bloomerang.Util.StripeCardIsValid) {
            document.getElementById('card-errors').textContent = "Valid card info is required";
            return false;
          }
  
          if (jQuery("#donation-form #CreditCard").length > 0 && !jQuery("#donation-form #CreditCard").prop("checked")) {
            submitDonation();
          }
          else {
            var val = function (selector) { return jQuery(selector).val(); };
            var amount = Bloomerang.Util.getDonationAmount() + Bloomerang.Util.getDonationTrueImpactAmount();
            var selectedDonationLevel = jQuery(".donation-form .section.donation input[name='donation-level']:checked").parent().text();
            selectedDonationLevel = (selectedDonationLevel.indexOf("-") == -1 ? "" : selectedDonationLevel.substr(selectedDonationLevel.indexOf("-") + 2) );

            var oldMeta = '';
            if (jQuery('meta[name="viewport"]').length) {
              oldMeta = jQuery('meta[name="viewport"]').attr('content');
            } else {
              jQuery('head').append('<meta name="viewport" content="" />');
            }
            jQuery('meta[name="viewport"]').attr('content', 'width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1');
            jQuery('meta[name="viewport"]').attr('content', oldMeta);

            if (Bloomerang.Api.ProcessorType !== "StripeConnect") {
              SpreedlyExpress.setDisplayOptions({
                "amount": accounting.formatMoney(amount),
                "full_name": val(".donation-form #first-name") + " " + val(".donation-form #last-name"),
                "sidebar_bottom_description": selectedDonationLevel,
                "submit_label": "Donate"});
              SpreedlyExpress.setPaymentMethodParams({
                "email": val(".donation-form #email-address"),
                //"phone_number": val(".donation-form #phone-number"),
                //"address1": val(".donation-form #street-address"),
                //"city": val(".donation-form #city"),
                //"state": val(".donation-form #state") || val(".donation-form #province"),
                //"zip": val(".donation-form #zip-code") || val(".donation-form #postal-code"),
                //"country": val(".donation-form #country")
                });

              SpreedlyExpress.onPaymentMethod(function(token, paymentMethod) {
                Bloomerang.CreditCard.spreedlyToken(token);
	              submitDonation();
	            });

              SpreedlyExpress.openView();
            } else {
              submitDonation();
            }
          }
        };

        window.submitDonation = function() {
          if (!Bloomerang.continueFinancialSubmission(jQuery("#donation-form"))) { return false; }
  
          Bloomerang.Api.OnSubmit = Bloomerang.Widget.Donation.OnSubmit;
          Bloomerang.Api.OnSuccess = Bloomerang.Widget.Donation.OnSuccess;
          Bloomerang.Api.OnError = Bloomerang.Widget.Donation.OnError;

          var processingMessage = jQuery("#donation-processing-container");
          processingMessage.show();
          jQuery("#donation-form-container").hide();
          Bloomerang.scrollToElement(processingMessage);
  
          var tmp = jQuery(".donation-form #recurring").prop("checked")
            ? Bloomerang.Api.recurringDonate()
            : Bloomerang.Api.donate();
        };
        
        jQuery("#donation-form #CreditCard").prop("checked", true);
        jQuery("#donation-form .section.payment input[type='radio']").click(function() {
          Bloomerang.Util.calculateDonationTrueImpact();
          Bloomerang.Util.updateDonateButtonText();
          if (jQuery(this).attr("id") == "CreditCard") {
            jQuery("#donation-form .accountNumber, \
                    #donation-form .routingNumber, \
                    #donation-form .sample-check").hide();
          }                        
          else {                   
            jQuery("#donation-form .accountNumber, \
                    #donation-form .routingNumber, \
                    #donation-form .sample-check").show();
            if (jQuery("#donation-form .sample-check").length == 0) {                    
              var checkImage = new Image();
              checkImage.src = 'https://s3-us-west-2.amazonaws.com/bloomerang-public-cdn/public-gallery/SampleCheck.png';
              jQuery(checkImage).addClass("sample-check");
              jQuery("#donation-form .accountNumber").after(checkImage);
            }
          }
          
      });
      
      jQuery("#donation-form #true-impact").change(function() {
        Bloomerang.Util.updateDonateButtonText();
      });

      // Show opt-in options based on the setting of the global opt-in
      jQuery(".donation-form .field.consent-all").change(function() { 
          jQuery(".donation-form .field.consent-all").siblings().each(function(i, e) { 
              jQuery(e).toggle();
          }); 
      });
        
      //calc initial values on load
      Bloomerang.Util.calculateDonationTrueImpact();
      Bloomerang.Util.updateDonateButtonText();
})(jQuery);
    };
    
                var startBloomerangLoad = function() {
                    if (window.bloomerangLoadStarted == undefined) {
                        window.bloomerangLoadStarted = true;
                        var script = document.createElement('script');
                        script.type = 'text/javascript';
                        script.src = 'https://crm.bloomerang.co/Content/Scripts/Api/Bloomerang-v2.js?nocache=2020-10-01';
                        document.getElementsByTagName('head')[0].appendChild(script);
                        waitForBloomerangLoad(function() { Bloomerang.Util.requireJQueryValidationAndStripe(function() { insertForm16384(); })});
                    }
                    else {
                        waitForBloomerangLoad(function() { Bloomerang.Util.requireJQueryValidationAndStripe(function() { insertForm16384(); })});
                    }
                };

                var waitForBloomerangLoad = function(callback) {
                    if (typeof(Bloomerang) === 'undefined' || !Bloomerang._isReady) {
                        setTimeout(function () { waitForBloomerangLoad(callback) }, 500);
                    }
                    else {
                        if (true) {
                            callback();
                        } else {
                            window.bloomerangLoadStarted = undefined;
                            Bloomerang = undefined; // The version of Blomerang.js is not what we want. So blow it away and reload.
                            startBloomerangLoad();
                        }
                    }
                };

                startBloomerangLoad();

}