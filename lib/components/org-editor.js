
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
            const server = appState.server;

            self.orgList=ko.observable();
            self.organization_key = ko.observable();
            self.org = ko.observable();
            self.nonProfit = ko.observable();

            // donation_urls is an array of {url, match_type} objects.
            // match_type controls how strictly a donation URL must match (see non_profits table).
            self.matchTypeOptions = ["domain","full_domain","full_url"];
            self.addDonationUrl = function(){
                self.nonProfit().donation_urls.push({
                    url: ko.observable(""),
                    match_type: ko.observable("domain"),
                });
            };
            self.removeDonationUrl = function(item){
                self.nonProfit().donation_urls.remove(item);
            };

            // search_filter is a JSON object. Its permission-related usages (see the
            // user_org_search_filters view in 20-views.sql and getManagedProfiles in
            // server/utils.js) are three key lists: organization_keys (strings),
            // missionary_profile_keys and ro_profile_keys (numbers). search_filter may also
            // carry general search params (used by org-portal), which are preserved verbatim
            // through searchFilterExtra so editing the key lists never drops them.
            self.searchFilterLists = {
                organization_keys: ko.observableArray([]),
                missionary_profile_keys: ko.observableArray([]),
                ro_profile_keys: ko.observableArray([]),
            };
            self.searchFilterExtra = ko.observable("{}");
            self.addFilterKey = function(listName){
                self.searchFilterLists[listName].push({key: ko.observable("")});
            };
            self.removeFilterKey = function(listName,row){
                self.searchFilterLists[listName].remove(row);
            };
            // Rebuilds the search_filter object from the structured lists + preserved extras.
            self.buildSearchFilter = function(){
                let sf;
                try{ sf = JSON.parse(self.searchFilterExtra() || "{}") || {}; }
                catch(e){ throw new Error("Additional search filter is not valid JSON"); }

                const collect = (listName,asNumber) => self.searchFilterLists[listName]()
                    .map(row => row.key())
                    .filter(v => v != null && String(v).trim() !== "")
                    .map(v => asNumber ? Number(v) : String(v));

                const orgKeys = collect("organization_keys",false);
                const profileKeys = collect("missionary_profile_keys",true);
                const roKeys = collect("ro_profile_keys",true);

                if(orgKeys.length) sf.organization_keys = orgKeys; else delete sf.organization_keys;
                if(profileKeys.length) sf.missionary_profile_keys = profileKeys; else delete sf.missionary_profile_keys;
                if(roKeys.length) sf.ro_profile_keys = roKeys; else delete sf.ro_profile_keys;
                return sf;
            };

            da.allOrganizations().then(self.orgList);


            ko.computed(async ()=>{
                console.log("in computed, org key: "+self.organization_key());
                if(self.organization_key() != null){
                    const org = await da.getPlainOrganization(self.organization_key());
                    const nonProfit = await da.getNonProfit(org.non_profit_key);
                    self.org(ko.mapping.fromJS(org));
                    self.nonProfit(ko.mapping.fromJS(nonProfit));

                    console.log("fetch org ",self.org());
                    self.org().settings=ko.observable(JSON.stringify(org.settings));

                    // Populate the structured search_filter editors; any other keys are kept
                    // in searchFilterExtra so they survive a save.
                    const sf = org.search_filter || {};
                    const keyRows = (arr) => (arr || []).map(v => ({key: ko.observable(v)}));
                    self.searchFilterLists.organization_keys(keyRows(sf.organization_keys));
                    self.searchFilterLists.missionary_profile_keys(keyRows(sf.missionary_profile_keys));
                    self.searchFilterLists.ro_profile_keys(keyRows(sf.ro_profile_keys));
                    const sfExtra = Object.assign({},sf);
                    delete sfExtra.organization_keys;
                    delete sfExtra.missionary_profile_keys;
                    delete sfExtra.ro_profile_keys;
                    self.searchFilterExtra(JSON.stringify(sfExtra));

                    // donation_urls is left as a mapped observableArray of {url, match_type}
                    // objects so it can be edited with the structured fields below.
                    console.log("fetch org ",self.org());
                    console.log("fetch non-profit",self.nonProfit());
                }
            });

            self.permissionForm = ko.observable({
                userKey: ko.observable(),
                orgKey: ko.observable(),
                readOnly: ko.observable(false),
            });



            self.saveOrg = async function(){
                console.log("Saving org");
                try{
                    const org = ko.mapping.toJS(self.org);
                    org.search_filter = self.buildSearchFilter();
                    org.settings = JSON.parse(org.settings);
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
                    await da.updateNonProfit(nonProfit.non_profit_key,nonProfit);
                    alertify.success("Saved!")
                }catch(error){
                    alertify.error("failed to save NonProfit: "+error);
                }
            }
            self.addUserOrg = async function(){
                const fields = self.permissionForm();
                console.log("adding user_profile_permission ",fields.userKey(),fields.orgKey(),fields.readOnly());
                try{
                    await server.authPostJson("/api/grantUserOrgPerm",{
                        user_key: fields.userKey(),
                        organization_key: fields.orgKey(),
                        read_only: fields.readOnly(),
                    });
                    fields.userKey(null);
                    fields.orgKey(null);
                    fields.readOnly(false);
                }catch(error){
                    console.error("failed to set user permission: ", error && error.responseJSON);
                    alertify.error("failed to set user permission: "+ 
                        error && error.responseJSON && error.responseJSON.message);
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

            <div class='form-group'>
                <label class="">Donation Urls</label>
                <div data-bind="foreach: donation_urls">
                    <div class="input-group mb-2">
                        <input class="form-control" type="url" placeholder="https://example.org" data-bind="value: url"/>
                        <select class="form-control" style="max-width:11rem" data-bind="options: $component.matchTypeOptions, value: match_type"></select>
                        <div class="input-group-append">
                            <button class="btn btn-outline-danger" type="button" title="Remove" data-bind="click: $component.removeDonationUrl">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <button class="btn btn-ergatas-secondary-border btn-sm" type="button" data-bind="click: $component.addDonationUrl">Add URL</button>
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

            <label class="font-weight-bold mt-2">Search Filter</label>

            <div class='form-group'>
                <label class="">Managed Organization Keys</label>
                <div data-bind="foreach: $component.searchFilterLists.organization_keys">
                    <div class="input-group mb-2">
                        <input class="form-control" placeholder="organization_key" data-bind="value: key"/>
                        <div class="input-group-append">
                            <button class="btn btn-outline-danger" type="button" title="Remove" data-bind="click: () => $component.removeFilterKey('organization_keys',$data)">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <button class="btn btn-ergatas-secondary-border btn-sm" type="button" data-bind="click: () => $component.addFilterKey('organization_keys')">Add Organization Key</button>
            </div>

            <div class='form-group'>
                <label class="">Managed Profile Keys</label>
                <div data-bind="foreach: $component.searchFilterLists.missionary_profile_keys">
                    <div class="input-group mb-2">
                        <input class="form-control" type="number" placeholder="missionary_profile_key" data-bind="value: key"/>
                        <div class="input-group-append">
                            <button class="btn btn-outline-danger" type="button" title="Remove" data-bind="click: () => $component.removeFilterKey('missionary_profile_keys',$data)">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <button class="btn btn-ergatas-secondary-border btn-sm" type="button" data-bind="click: () => $component.addFilterKey('missionary_profile_keys')">Add Profile Key</button>
            </div>

            <div class='form-group'>
                <label class="">Read-Only Profile Keys</label>
                <div data-bind="foreach: $component.searchFilterLists.ro_profile_keys">
                    <div class="input-group mb-2">
                        <input class="form-control" type="number" placeholder="missionary_profile_key" data-bind="value: key"/>
                        <div class="input-group-append">
                            <button class="btn btn-outline-danger" type="button" title="Remove" data-bind="click: () => $component.removeFilterKey('ro_profile_keys',$data)">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <button class="btn btn-ergatas-secondary-border btn-sm" type="button" data-bind="click: () => $component.addFilterKey('ro_profile_keys')">Add Read-Only Profile Key</button>
            </div>

            <div class='form-group contains-validation-message'>
                <label class="">Additional Search Filter (advanced JSON)</label>
                <textarea class='form-control' data-bind="value: $component.searchFilterExtra,validation"> </textarea>
            </div>

            <div class='form-group contains-validation-message'>
                <label class="">Settings</label>
                <textarea class='form-control' data-bind="value: settings,validation"> </textarea>
            </div>


        </form>
    </div>

    <div class="col" data-bind="with: permissionForm">
        <h1>Permissions</h2>
        <div class="form-group">
            <label for="user_key">user_key</label>
            <input class="form-control" id="user_key" data-bind="value: userKey"/>
        </div>
        <div class="form-group">
            <label for="org_key">organization_key</label>
            <input class="form-control" id="org_key" data-bind="value: orgKey"/>
        </div>
        <div class="form-check " >
            <label for="read_only" class="form-check-label">
                <input type="checkbox" id="read_only" required class="form-check-input mb-3" data-bind="checked: readOnly">
                Read Only (cannot create/edit profiles).
            </label>
        </div>


        <button class="btn btn-secondary" data-bind="click: $parent.addUserOrg">Add</button>
    </div>


</div>



`