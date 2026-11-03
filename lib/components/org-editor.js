
import alertify from 'alertifyjs';
import * as utils from '../client/client-utils';
import {ensureFields, allCurrencies} from '../shared/shared-utils';
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

            // Allow deep-linking to a specific org, eg from the pending-organizations
            // page: /dashboard/org-editor?organization_key=123
            const urlOrgKey = new URLSearchParams(window.location.search).get("organization_key");
            if(urlOrgKey != null && urlOrgKey !== "")
                self.organization_key(urlOrgKey);
            self.org = ko.observable();
            self.nonProfit = ko.observable();

            self.currencyData = ko.observable();
            allCurrencies().then(currencyData => self.currencyData(currencyData));
            self.currencySelectizeOptions = ko.pureComputed(() =>
                utils.currencySelectizeOptions((self.currencyData() && self.currencyData().currencies) || []));

            // The "will you send your own tax receipt?" checkbox is the inverse of
            // send_receipt (checked = the org sends its own receipt = send_receipt false).
            self.sendsOwnReceipt = ko.pureComputed({
                read: () => {
                    const np = self.nonProfit();
                    if(np == null || np.donation_settings == null || !ko.isObservable(np.donation_settings.send_receipt))
                        return false;
                    return np.donation_settings.send_receipt() === false;
                },
                write: (checked) => {
                    const np = self.nonProfit();
                    if(np == null || np.donation_settings == null || !ko.isObservable(np.donation_settings.send_receipt))
                        return;
                    np.donation_settings.send_receipt(!checked);
                },
            });

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

            // Single-org autocomplete over the full organization list. Options load
            // async into self.orgList, so populate/refresh them in onInitialize.
            self.orgSelectizeOptions = {
                create: false,
                valueField: "organization_key",
                labelField: "name",
                searchField: ["name"],
                maxItems: 1,
                onInitialize: function(){
                    var api = this;
                    ko.bindingHandlers.selectize.utils.setOptions(api, self.orgList);
                    ko.bindingHandlers.selectize.utils.watchForNewOptions(api, self.orgList);
                    ko.bindingHandlers.selectize.utils.setItems(api, self.organization_key);
                },
                onObsUpdate: function(api, value){
                    api.clear(true);
                    ko.bindingHandlers.selectize.utils.setItems(api, value);
                },
            };


            ko.computed(async ()=>{
                console.log("in computed, org key: "+self.organization_key());
                if(self.organization_key() != null && self.organization_key() !== ""){
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

            // ---- Profile managers of the open organization ----
            // Lists the users with a permission on this organization and lets an
            // admin add one: find a user (by name, email or user key), choose
            // read-only or not, and grant. Granting also adds the user to the
            // FusionAuth "ProfileManagers" group (server side).
            self.managers = {
                list: ko.observableArray([]),
                loading: ko.observable(false),
                adding: ko.observable(false),        // the "Add manager" form is open
                userTerm: ko.observable(''),
                userResults: ko.observableArray([]),
                searching: ko.observable(false),
                searched: ko.observable(false),
                selectedUser: ko.observable(null),
                readOnly: ko.observable(false),
                addToGrantees: ko.observable(false), // also add to the FusionAuth grantees group
                saving: ko.observable(false),
                result: ko.observable(null),         // {ok, lines[]}
            };
            const mg = self.managers;
            mg.readOnly.subscribe(ro => { if(ro) mg.addToGrantees(false); });
            mg.userLabel = u => u ? ((u.name || '(no name)') + (u.email ? ' <' + u.email + '>' : '') + ' · user ' + u.user_key) : '';
            const errorText = error => (error && error.responseJSON && error.responseJSON.message) ||
                (error && error.statusText) || String(error);

            mg.load = async function(){
                const key = self.organization_key();
                if(!key){ mg.list([]); return; }
                mg.loading(true);
                try{
                    const rows = await server.authPostJson("/api/orgManagers", { organization_key: key });
                    if(key === self.organization_key()) mg.list(rows || []);
                }catch(error){
                    console.error("failed to load profile managers", error);
                    mg.list([]);
                }finally{
                    mg.loading(false);
                }
            };
            const resetAddForm = () => {
                mg.selectedUser(null); mg.userResults([]); mg.searched(false);
                mg.userTerm(''); mg.readOnly(false); mg.addToGrantees(false);
            };
            mg.openAdd = () => { resetAddForm(); mg.result(null); mg.adding(true); };
            mg.cancelAdd = () => { resetAddForm(); mg.adding(false); };
            mg.searchUsers = async function(){
                const term = (mg.userTerm() || '').trim();
                if(!term) return;
                mg.searching(true);
                try{
                    const users = await server.authPostJson("/api/searchUsers", { term });
                    mg.userResults(users || []);
                    mg.searched(true);
                    if((users || []).length === 1) mg.selectedUser(users[0]);
                }catch(error){
                    alertify.error("User search failed: " + errorText(error));
                }finally{
                    mg.searching(false);
                }
            };
            mg.searchOnEnter = (data, event) => {
                if(event.key === 'Enter'){ mg.searchUsers(); return false; }
                return true;
            };
            mg.chooseUser = u => mg.selectedUser(u);
            mg.changeUser = () => { mg.selectedUser(null); };

            mg.add = async function(){
                const user = mg.selectedUser(), orgKey = self.organization_key();
                if(!user || !orgKey) return;
                const listed = (self.orgList() || []).find(o => String(o.organization_key) === String(orgKey));
                const orgName = (listed && listed.name) || (self.org() && ko.unwrap(self.org().name)) || ('organization ' + orgKey);
                mg.saving(true); mg.result(null);
                try{
                    const res = await server.authPostJson("/api/grantUserOrgPerm",{
                        user_key: user.user_key,
                        organization_key: orgKey,
                        read_only: mg.readOnly(),
                        add_to_grantees: mg.addToGrantees(),
                    });
                    const group = (res && res.group) || {};
                    const lines = [res && res.permission === 'already'
                        ? mg.userLabel(user) + ' was already a manager of ' + orgName + '.'
                        : mg.userLabel(user) + ' added as a ' + (mg.readOnly() ? 'read-only ' : '') + 'manager of ' + orgName + '.'];
                    if(group.message) lines.push(group.message + '.');
                    const granteeGroup = (res && res.grantee_group) || null;
                    if(granteeGroup && granteeGroup.message) lines.push(granteeGroup.message + '.');
                    const ok = group.status !== 'failed' && !(granteeGroup && granteeGroup.status === 'failed');
                    mg.result({ ok, lines });
                    if(ok) alertify.success("Manager added");
                    else alertify.warning("Manager added, but a FusionAuth group step failed");
                    mg.cancelAdd();
                    mg.load();
                }catch(error){
                    console.error("failed to add manager: ", error && error.responseJSON);
                    alertify.error("Could not add manager: " + errorText(error));
                }finally{
                    mg.saving(false);
                }
            };
            // reload the list whenever another organization is opened
            self.organization_key.subscribe(() => { mg.cancelAdd(); mg.result(null); mg.load(); });
            mg.load();



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

                    // the stripe account may have been set or changed; refresh the
                    // detected bank-account currencies from Stripe
                    if(nonProfit.stripe_account){
                        try{
                            await server.authPostJson("/api/syncOrgCurrencies",
                                {non_profit_key: nonProfit.non_profit_key});
                            const updated = await da.getNonProfit(nonProfit.non_profit_key);
                            self.nonProfit().donation_settings.stripe_currencies(
                                updated.donation_settings.stripe_currencies);
                        }catch(error){
                            console.warn("failed to sync stripe currencies: ",error);
                        }
                    }
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

        <div class="selectize-z1-fix my-3">
            <select class="form-control" placeholder="All Organizations..."
                    data-bind="selectize: organization_key, selectizeOptions: orgSelectizeOptions"></select>
        </div>
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
                <label class="">Detected Stripe Currencies</label>
                <div class="muted-font">
                    Currencies of the bank accounts attached to the Stripe account above.
                    Updated automatically after saving.
                </div>
                <div data-bind="text: donation_settings.stripe_currencies().join(', ') || 'none detected'"></div>
            </div>

            <div class='form-group contains-validation-message selectize-z1-fix' data-bind="if: $component.currencyData() != null">
                <label class="">Native Currencies</label>
                <div class="muted-font">
                    Currencies this organization can accept without a currency exchange.
                </div>
                <select multiple placeholder="Type to search currencies"
                        data-bind="selectize: donation_settings.native_currencies,
                                   selectizeOptions: $component.currencySelectizeOptions()">
                </select>
            </div>

            <div class="my-3 form-check">
                <input type="checkbox" class='form-check-input' id="sends_own_receipt"
                        data-bind="checked: $component.sendsOwnReceipt"/>
                <label class="form-check-label" for="sends_own_receipt">
                    Will you send your own tax receipt to donors within your country?
                </label>
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

        <div class="shaded-bg mt-3 p-3" data-bind="visible: organization_key, with: managers">
            <div class="d-flex justify-content-between align-items-center mb-2">
                <h3 class="mb-0">Profile managers</h3>
                <button type="button" class="btn btn-sm btn-secondary" data-bind="click: openAdd, visible: !adding()">
                    <i class="fas fa-user-plus"></i> Add manager</button>
            </div>

            <!-- Add-manager form for the open organization -->
            <div class="border rounded bg-white p-2 mb-3" data-bind="visible: adding">
                <label for="mgr-user" class="mb-1">User</label>
                <div data-bind="visible: !selectedUser()">
                    <div class="input-group">
                        <input class="form-control" id="mgr-user" placeholder="Name, email or user key"
                               data-bind="textInput: userTerm, event: { keydown: searchOnEnter }"/>
                        <div class="input-group-append">
                            <button type="button" class="btn btn-secondary" data-bind="click: searchUsers, disable: searching">Search</button>
                        </div>
                    </div>
                    <small class="form-text text-muted">Names are matched against worker profiles; an email must match exactly.</small>
                    <div class="list-group mt-2" data-bind="foreach: userResults">
                        <button type="button" class="list-group-item list-group-item-action py-1" data-bind="click: $parent.chooseUser">
                            <span data-bind="text: $parent.userLabel($data)"></span>
                            <small class="d-block muted-font" data-bind="text: profiles.join('; '), visible: profiles.length"></small>
                        </button>
                    </div>
                    <div class="small muted-font mt-1" data-bind="visible: searched() && !searching() && userResults().length === 0">No matching users.</div>
                </div>
                <div class="alert alert-light border d-flex justify-content-between align-items-center py-2 mb-2" data-bind="visible: selectedUser">
                    <span data-bind="text: userLabel(selectedUser())"></span>
                    <button type="button" class="btn btn-sm btn-link" data-bind="click: changeUser">Change</button>
                </div>
                <div class="form-check my-2">
                    <input type="checkbox" id="mgr-read-only" class="form-check-input" data-bind="checked: readOnly">
                    <label for="mgr-read-only" class="form-check-label">Read only (cannot create/edit profiles)</label>
                </div>
                <div class="form-check mb-2">
                    <input type="checkbox" id="mgr-grantee" class="form-check-input" data-bind="checked: addToGrantees, disable: readOnly">
                    <label for="mgr-grantee" class="form-check-label">Also add to the grantees group (can sign the grant
                        agreement and file salary reports for this organization)</label>
                </div>
                <button type="button" class="btn btn-sm btn-secondary" data-bind="click: add, disable: saving() || !selectedUser()">Add as manager</button>
                <button type="button" class="btn btn-sm btn-link" data-bind="click: cancelAdd">Cancel</button>
                <small class="d-block muted-font mt-1">The user is also added to the FusionAuth <code>ProfileManagers</code> group.
                    Grantee access needs full (not read-only) manager access.</small>
            </div>

            <div class="alert py-2" data-bind="visible: result, css: { 'alert-success': result() && result().ok, 'alert-warning': result() && !result().ok }">
                <div data-bind="foreach: result() ? result().lines : []"><div data-bind="text: $data"></div></div>
            </div>

            <div class="muted-font small" data-bind="visible: loading">Loading…</div>
            <div class="muted-font small" data-bind="visible: !loading() && list().length === 0">No profile managers yet.</div>
            <table class="table table-sm mb-0" data-bind="visible: list().length">
                <thead><tr><th>User</th><th>Email</th><th>Access</th></tr></thead>
                <tbody data-bind="foreach: list">
                    <tr>
                        <td><span data-bind="text: name || '(no name)'"></span> <small class="muted-font" data-bind="text: 'user ' + user_key"></small></td>
                        <td data-bind="text: email"></td>
                        <td data-bind="text: read_only ? 'Read only' : 'Manager'"></td>
                    </tr>
                </tbody>
            </table>
        </div>
    </div>



</div>



`