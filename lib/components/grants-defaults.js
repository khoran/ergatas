/**
 * grants-defaults — standing information about Ergatas used to prefill the
 * grant-compliance forms: the board roster (name + role, optionally linked to
 * the member's Ergatas account so site admins / grant staff can grant board
 * access — the FusionAuth BoardMembers group) and a default
 * motion/resolution text. Both prefill the board-approval form (grants-board);
 * staff can still edit them per decision there.
 *
 * Stored in grants.governance_config (board_members / default_motion_text keys)
 * through /api/grants/defaults[/update], which merge only these keys.
 *
 * INPUT (params): appState, user, setPage (optional, to return to the overview),
 *                 hasRole (root view model's role check; gates board-access controls)
 */
import {ensureFields} from '../shared/shared-utils';
import alertify from 'alertifyjs';

export function register(){
    const name = "grants-defaults";
    ko.components.register(name, {
        viewModel: function(params){
            const self = this;
            ensureFields(params, ["appState"]);
            self.server = params.appState.server;
            self.setPage = params.setPage || null;

            // A roster row. user_key optionally links the member to their Ergatas
            // account, which is what board access (the FusionAuth BoardMembers
            // group) is granted to. `account` holds that account's status.
            const member = (m = {}) => {
                const row = {
                    name: ko.observable(m.name || ''), role: ko.observable(m.role || ''),
                    userKey: ko.observable(m.user_key || null),
                    account: ko.observable(null),       // {user_key, found, name, email, in_group}
                    linking: ko.observable(false),
                    term: ko.observable(''), results: ko.observableArray([]),
                    searching: ko.observable(false), searched: ko.observable(false),
                    granting: ko.observable(false),
                };
                row.accountLabel = ko.computed(() => {
                    const a = row.account();
                    if(!row.userKey()) return '';
                    if(!a) return 'user ' + row.userKey();
                    if(!a.found) return 'user ' + row.userKey() + ' (not found)';
                    return (a.name || '(no name)') + (a.email ? ' <' + a.email + '>' : '');
                });
                return row;
            };
            const errorText = error => (error && error.responseJSON && error.responseJSON.message) ||
                (error && error.statusText) || String(error);
            // only site admins and grant staff link accounts and grant board access
            // (the server enforces the same), so board members cannot add board members
            const hasRole = params.hasRole || (() => false);
            self.canManageAccess = ko.pureComputed(() => !!(hasRole('site_admin') || hasRole('grant_staff')));
            self.userLabel = u => (u.name || '(no name)') + (u.email ? ' <' + u.email + '>' : '') + ' · user ' + u.user_key;

            // Board access status for the linked members
            self.refreshAccess = async function(rows){
                rows = (rows || self.boardMembers()).filter(r => r.userKey());
                if(rows.length === 0) return;
                try{
                    const status = await self.server.authPostJson("/api/grants/boardAccess",
                        { user_keys: rows.map(r => r.userKey()) }) || [];
                    rows.forEach(r => r.account(status.find(a => a.user_key === Number(r.userKey())) || null));
                }catch(error){ console.error("board access status failed", error); }
            };
            self.startLink = m => { m.linking(true); m.term(m.name()); m.results([]); m.searched(false); };
            self.cancelLink = m => m.linking(false);
            self.searchLink = async function(m){
                const term = (m.term() || '').trim();
                if(!term) return;
                m.searching(true);
                try{
                    m.results(await self.server.authPostJson("/api/searchUsers", { term }) || []);
                    m.searched(true);
                }catch(error){
                    alertify.error("User search failed: " + errorText(error));
                }finally{
                    m.searching(false);
                }
            };
            self.searchLinkOnEnter = (m, event) => { if(event.key === 'Enter'){ self.searchLink(m); return false; } return true; };
            self.chooseLink = function(user, m){
                m.userKey(user.user_key);
                m.account(Object.assign({ found: true, in_group: false }, user));
                m.linking(false);
                self.refreshAccess([m]);
            };
            self.unlink = m => { m.userKey(null); m.account(null); };
            self.grantAccess = async function(m){
                if(!m.userKey()) return;
                m.granting(true);
                try{
                    const res = await self.server.authPostJson("/api/grants/boardAccess/grant", { user_key: m.userKey() });
                    if(res && res.status === 'failed') alertify.error(res.message);
                    else alertify.success((res && res.message) || "Board access granted");
                    await self.refreshAccess([m]);
                }catch(error){
                    alertify.error("Could not grant board access: " + errorText(error));
                }finally{
                    m.granting(false);
                }
            };

            self.loading = ko.observable(true);
            self.saving = ko.observable(false);
            self.boardMembers = ko.observableArray([]);
            self.motionText = ko.observable('');
            self.legalName = ko.observable('');
            self.address = ko.observable('');
            self.legalNameError = ko.observable('');
            // annual salary-report due date (month/day of the following year)
            self.months = ['January','February','March','April','May','June','July',
                'August','September','October','November','December'].map((n, i) => ({ value: i + 1, name: n }));
            self.days = Array.from({ length: 31 }, (_, i) => i + 1);
            self.deadlineMonth = ko.observable(3);
            self.deadlineDay = ko.observable(31);
            self.legalName.subscribe(() => self.legalNameError(''));

            const apply = (d) => {
                self.boardMembers((d.board_members || []).map(member));
                if(self.boardMembers().length === 0) self.addMember();
                self.refreshAccess();
                self.motionText(d.default_motion_text || '');
                self.legalName(d.grantor_legal_name || '');
                self.address(d.grantor_address || '');
                const rd = d.report_deadline || {};
                self.deadlineMonth(rd.month || 3);
                self.deadlineDay(rd.day || 31);
            };

            self.addMember = () => self.boardMembers.push(member());
            self.removeMember = (m) => self.boardMembers.remove(m);
            self.moveUp = (m) => {
                const i = self.boardMembers.indexOf(m);
                if(i > 0) self.boardMembers.splice(i - 1, 2, m, self.boardMembers()[i - 1]);
            };
            self.goOverview = () => { if(self.setPage) self.setPage('grants-overview'); };

            async function load(){
                try{
                    apply(await self.server.authPostJson("/api/grants/defaults", {}));
                }catch(error){
                    console.error("grants defaults load failed", error);
                    alertify.error("Could not load the saved defaults");
                }finally{
                    self.loading(false);
                }
            }
            load();

            self.save = async function(){
                const members = self.boardMembers()
                    .map(m => Object.assign({ name: m.name().trim(), role: m.role().trim() },
                        m.userKey() ? { user_key: Number(m.userKey()) } : {}))
                    .filter(m => m.name !== '');
                if(self.boardMembers().some(m => !m.name().trim() && m.role().trim())){
                    alertify.error("Each board member with a role needs a name.");
                    return;
                }
                if(!self.legalName().trim()){
                    self.legalNameError("Enter Ergatas's legal name.");
                    alertify.error("Please correct the highlighted fields.");
                    return;
                }
                self.saving(true);
                try{
                    apply(await self.server.authPostJson("/api/grants/defaults/update", {
                        board_members: members,
                        default_motion_text: self.motionText(),
                        grantor_legal_name: self.legalName(),
                        grantor_address: self.address(),
                        report_deadline: { month: Number(self.deadlineMonth()), day: Number(self.deadlineDay()) },
                    }));
                    alertify.success("Defaults saved");
                }catch(error){
                    const msg = (error.responseJSON && error.responseJSON.message) || "Could not save defaults";
                    console.error("grants defaults save failed", error);
                    alertify.error(msg);
                }finally{
                    self.saving(false);
                }
            };
        },
        template: require(`./${name}.html`),
    });
}
