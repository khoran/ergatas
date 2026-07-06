/**
 * grant-disbursements — Phase 5 staff UI (lifecycle [5]). Records monthly
 * disbursements against a current board approval, within the delegated scope
 * (the server rejects over-cap / suspended / superseded). Shows the selected
 * approval's delegation and the running total for the period.
 *
 * INPUT (params): appState, user
 */
import {ensureFields} from '../shared/shared-utils';
import alertify from 'alertifyjs';

export function register(){
    const name = "grant-disbursements";
    ko.components.register(name, {
        viewModel: function(params){
            const self = this;
            ensureFields(params, ["appState"]);
            self.server = params.appState.server;

            self.approvals = ko.observableArray();
            self.disbursements = ko.observableArray();

            self.approvalId = ko.observable('');
            self.granteeOrg = ko.observable('');
            self.period = ko.observable(new Date().toISOString().slice(0, 7)); // current month
            self.amount = ko.observable('');
            self.method = ko.observable('ACH');
            self.note = ko.observable('');

            self.selectedApproval = ko.computed(() =>
                self.approvals().find(a => a.record_id === self.approvalId()));
            self.delegation = ko.computed(() => {
                const a = self.selectedApproval();
                return (a && a.data && a.data.delegation) || null;
            });

            // keep grantee + reload list in sync with the chosen approval
            self.approvalId.subscribe(() => {
                const a = self.selectedApproval();
                if (a) { self.granteeOrg(a.grantee_org); loadList(); }
            });

            async function loadApprovals(){
                try{ self.approvals(await self.server.authPostJson("/api/grants/approvals", {})); }
                catch(error){ console.error("approvals load failed", error); }
            }
            async function loadList(){
                try{
                    self.disbursements(await self.server.authPostJson("/api/grants/disbursements",
                        { grantee_org: self.granteeOrg() || undefined }));
                }catch(error){ console.error("disbursements load failed", error); }
            }
            loadApprovals();

            self.periodTotal = ko.computed(() =>
                self.disbursements()
                    .filter(d => !self.period() || d.reporting_period === self.period())
                    .reduce((s, d) => s + (Number(d.amount) || 0), 0));

            self.record = async function(){
                if(!self.approvalId()){ alertify.error("Select a board approval"); return; }
                try{
                    const d = await self.server.authPostJson("/api/grants/disbursement", {
                        grantee_org: self.granteeOrg(), board_approval_id: self.approvalId(),
                        reporting_period: self.period(), amount: Number(self.amount()),
                        method: self.method(), note: self.note(),
                    });
                    alertify.success("Disbursement recorded");
                    self.amount(''); self.note('');
                    loadList();
                    return d;
                }catch(error){
                    console.error("disbursement failed", error);
                    alertify.error((error.responseJSON && error.responseJSON.message) || "Disbursement rejected");
                }
            };
        },
        template: require('./grant-disbursements.html'),
    });
}
