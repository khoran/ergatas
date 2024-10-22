
import alertify from 'alertifyjs';
import * as utils from '../client/client-utils';
import {ensureFields} from '../shared/shared-utils';
/**
 * INPUT
 * -----
 *      - appState
 */

export function register(){
   const NAME="org-editor";

   ko.components.register(NAME, {
       viewModel: function(params) {
            console.log(NAME+" params: ",params);
            var self=this;
            var profileObs;

            ensureFields(params,["appState"]);

            const appState = params.appState
            const da = appState.da;

            self.orgList=ko.observable();
            self.organization_key = ko.observable();
            self.org = ko.observable();
            self.nonProfit = ko.observable();

            da.allOrganizations().then(self.orgList);


            ko.computed(async ()=>{
                console.log("in computed, org key: "+self.organization_key());
                if(self.organization_key() != null){
                    const org = await da.getPlainOrganization(self.organization_key());
                    const nonProfit = await da.getNonProfit(org.non_profit_key);
                    self.org(ko.mapping.fromJS(org));
                    self.nonProfit(ko.mapping.fromJS(nonProfit));

                    console.log("fetch org ",self.org());
                    self.org().search_filter=ko.observable(JSON.stringify(org.search_filter));
                    self.nonProfit().donation_urls=ko.observable(JSON.stringify(nonProfit.donation_urls));
                    console.log("fetch org ",self.org());
                    console.log("fetch non-profit",self.nonProfit());
                }
            })

            self.saveOrg = async function(){
                console.log("Saving org");
                try{
                    const org = ko.mapping.toJS(self.org);
                    org.search_filter = JSON.parse(org.search_filter);
                    await da.updateOrganization(org.organization_key,org);
                    alertify.success("Saved!")
                }catch(error){
                    alertify.error("failed to save Org: "+error);
                }
            }

            self.saveNonProfit= async function(){
                console.log("Saving non-profit");
                try{
                    const nonProfit = ko.mapping.toJS(self.nonProfit);
                    nonProfit.donation_urls = JSON.parse(nonProfit.donation_urls);
                    await da.updateNonProfit(nonProfit.non_profit_key,nonProfit);
                    alertify.success("Saved!")
                }catch(error){
                    alertify.error("failed to save NonProfit: "+error);
                }
            }
        },
        template: html
    });
}

const html = `
<div class="row">
    <div class="col">

        <select class="form-control my-3" data-bind="options: orgList , 
                    value: organization_key,
                    optionsText:'name', 
                    optionsValue:'organization_key',
                    optionsCaption: 'All Organizations...'"></select>
    </div>
</div>
<div class="row">
    <div class="col-lg-5">

        
        <h2>Non Profit</h2>
        <form class="shaded-bg" data-bind="submit: saveNonProfit,with:nonProfit">

            <button class="btn " type="submit"><i title="Save" class="fas fa-save fa-2x"></i>Save</button> 
            <p data-bind="text:non_profit_key"></p>
            <div class='form-group contains-validation-message'>
                <label class="required">Country Code</label>
                <input class='form-control' required  data-bind="value: country_code,validation  "/>
            </div>
            <div class='form-group contains-validation-message'>
                <label class="required">Country Org Id</label>
                <input class='form-control' required  data-bind="value: country_org_id,validation  "/>
            </div>

            <div class='form-group contains-validation-message'>
                <label class="required">Registered Name</label>
                <input class='form-control' required  data-bind="value: registered_name,validation  "/>
            </div>

            <div class='form-group contains-validation-message'>
                <label class="required">City</label>
                <input class='form-control' required  data-bind="value: city,validation  "/>
            </div>
            <div class='form-group contains-validation-message'>
                <label class="required">State</label>
                <input class='form-control' required  data-bind="value: state,validation  "/>
            </div>

            <div class="my-3 form-check">
                <input type="checkbox" class='form-check-input' id="is_shell" checked 
                        data-bind="checked: is_shell"/>
                <label class="form-check-label" for="is_shell">
                    Operates under a parent non-profit organization
                </label>
            </div>

            <div class='form-group contains-validation-message'>
                <label class="">Stripe Account</label>
                <input class='form-control' data-bind="value: stripe_account,validation  "/>
            </div>

            <div class='form-group contains-validation-message'>
                <label  class="">Donation Urls</label>
                <textarea class='form-control' data-bind="value: donation_urls,validation"> </textarea>
            </div>
        </form>
    </div>

    <div class="col-lg-5">
        <h2>Organization</h2>
        <form class="shaded-bg" data-bind="submit: saveOrg,with:org">

            <button class="btn float-right" type="submit"><i title="Save" class="fas fa-save fa-2x"></i> Save</button> 
            <p data-bind="text:organization_key"></p>
            <div class='form-group '>
                <div data-bind="visible: logo_url" style="display:none" class="mb-1">
                    <img height="60" alt="organization logo" data-bind="attr:{src: $root.storage.orgLogoUrl(logo_url())}"/>
                    <br>
                </div>
                <button type="button" class="btn btn-ergatas-secondary-border" data-bind="click: () => $root.storage.browseForLogo($data)">Upload Logo</button>
            </div>
            
            <div class='form-group contains-validation-message'>
                <label class="required">Non-Profit Key</label>
                <input class='form-control' type="number" required  data-bind="value: non_profit_key,validation  "/>
            </div>
            <div class='form-group contains-validation-message'>
                <label class="required">Org Name</label>
                <input class='form-control' required  data-bind="value: name,validation  "/>
            </div>
            <div class='form-group contains-validation-message'>
                <label class="required">Org Website</label>
                <input class='form-control' required  data-bind="value: website,validation  "/>
            </div>
            <div class='form-group contains-validation-message'>
                <label class="required">status</label>
                <input class='form-control' required  data-bind="value: status,validation  "/>
            </div>
            <div class='form-group contains-validation-message'>
                <label>Contact Email</label>
                <input class='form-control' data-bind="value: contact_email,validation  "/>
            </div>
            <div class='form-group contains-validation-message'>
                <label class="">Subdomain</label>
                <input class='form-control' data-bind="value: slug,validation  "/>
            </div>

            <div class="my-3 form-check">
                <input type="checkbox" class='form-check-input' id="is_sending_org" checked 
                        data-bind="checked: is_sending_org"/>
                <label class="form-check-label" for="is_sending_org">
                    Is Sending Org
                </label>
            </div>


            <div class='form-group contains-validation-message'>
                <label for="org_description" class="required">Description </label>
                <textarea class='form-control' required id="org_description" name="org_description" data-bind="value: description,validation">
                </textarea>
            </div>

            <div class='form-group contains-validation-message'>
                <label  class="">Search Filter</label>
                <textarea class='form-control' data-bind="value: search_filter,validation"> </textarea>
            </div>


        </form>
    </div>

</div>



`