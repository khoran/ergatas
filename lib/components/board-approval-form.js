/**
 * board-approval-form — Phase 2 UI (lifecycle [2]/[7]). Records a grantee-specific
 * board decision: per-member votes (with recusal), the verbatim exempt-purpose
 * finding, motion text, conditions, delegated scope, and outcome. Supports both
 * new-grant approvals and annual reviews (which chain to a prior approval).
 *
 * INPUT (params): appState, user
 */
import {ensureFields} from '../shared/shared-utils';
import alertify from 'alertifyjs';

export function register(){
    const name = "board-approval-form";
    ko.components.register(name, {
        viewModel: function(params){
            const self = this;
            ensureFields(params, ["appState"]);
            self.server = params.appState.server;

            const blankVote = () => ({
                member_name: ko.observable(''), board_role: ko.observable(''),
                vote: ko.observable('approve'), conflict_reason: ko.observable(''),
            });

            self.config = ko.observable({});
            self.attestationText = ko.observable('');
            self.nonProfits = ko.observableArray();

            self.reviewType = ko.observable('new_grant');
            self.granteeOrg = ko.observable('');
            self.country = ko.observable('');
            self.granteeOrg.subscribe(name => {
                const np = self.nonProfits().find(n => n.registered_name === name);
                if (np) self.country(np.country_code);
            });
            self.grantReference = ko.observable('');
            self.meetingDate = ko.observable('');
            self.meetingReference = ko.observable('');
            self.motionText = ko.observable('');

            // link a prior screening (by record id) and prior approval (for annual)
            self.screeningId = ko.observable('');
            self.priorApprovalId = ko.observable('');
            self.screenings = ko.observableArray();
            self.approvals = ko.observableArray();

            // new-grant terms / due diligence
            self.ddSummary = ko.observable('');
            self.proposedAmount = ko.observable('');
            self.proposedSchedule = ko.observable('');
            self.proposedTerm = ko.observable('');
            self.proposedPurpose = ko.observable('');

            // annual review fields
            self.reportsReceived = ko.observable('');
            self.reportsExpected = ko.observable('');
            self.reconciliationStatus = ko.observable('balanced');
            self.reScreeningResult = ko.observable('clear');
            self.complianceFlags = ko.observableArray();

            // conditions / delegation
            self.conditions = ko.observableArray([]);
            self.newCondition = ko.observable('');
            self.delegationAuthorized = ko.observable(false);
            self.delegationScope = ko.observable('');
            self.delegationCap = ko.observable('');

            // votes
            self.votes = ko.observableArray([ blankVote() ]);
            self.exemptAffirmed = ko.observable(false);
            self.outcome = ko.observable('approved');
            self.recorded = ko.observable(null);

            self.isNewGrant = ko.computed(() => self.reviewType() === 'new_grant');
            self.outcomeOptions = ko.computed(() => self.isNewGrant()
                ? ['approved', 'approved_conditions', 'deferred', 'denied']
                : ['renewed', 'modified', 'suspended', 'terminated']);

            self.tally = ko.computed(() => {
                const t = { approve: 0, oppose: 0, abstain: 0, recuse: 0 };
                self.votes().forEach(v => { if (t[v.vote()] != null) t[v.vote()]++; });
                return t;
            });
            self.present = ko.computed(() => self.votes().filter(v => v.vote() !== 'recuse').length);
            self.quorumMet = ko.computed(() => self.present() >= (Number(self.config().quorum) || 0));

            self.addVote = () => self.votes.push(blankVote());
            self.removeVote = (v) => self.votes.remove(v);
            self.addCondition = () => { if (self.newCondition().trim()) { self.conditions.push(self.newCondition().trim()); self.newCondition(''); } };
            self.removeCondition = (c) => self.conditions.remove(c);
            self.addFlag = () => self.complianceFlags.push({ flag: ko.observable(''), disposition: ko.observable('') });
            self.removeFlag = (f) => self.complianceFlags.remove(f);

            async function load(){
                try{
                    self.config(await self.server.authPostJson("/api/grants/governance"));
                    self.attestationText((self.config().attestations || {}).exempt_purpose || '');
                    self.nonProfits(await self.server.authPostJson("/api/grants/nonProfits", {}));
                    self.screenings(await self.server.authPostJson("/api/grants/screenings", {}));
                    self.approvals(await self.server.authPostJson("/api/grants/approvals", {}));
                }catch(error){ console.error("board form load failed", error); }
            }
            load();

            self.submit = async function(){
                const data = {
                    conditions: self.conditions(),
                    delegation: {
                        authorized: self.delegationAuthorized(),
                        scope: self.delegationScope(),
                        monthly_cap: self.delegationCap() === '' ? null : Number(self.delegationCap()),
                    },
                };
                if(self.isNewGrant()){
                    data.due_diligence = { summary: self.ddSummary() };
                    data.proposed_terms = {
                        purpose: self.proposedPurpose(), amount: Number(self.proposedAmount()) || self.proposedAmount(),
                        schedule: self.proposedSchedule(), term: self.proposedTerm() };
                } else {
                    data.reports_received = Number(self.reportsReceived());
                    data.reports_expected = Number(self.reportsExpected());
                    data.reconciliation_status = self.reconciliationStatus();
                    data.re_screening = { result: self.reScreeningResult() };
                    data.compliance_flags = self.complianceFlags().map(f => ({ flag: f.flag(), disposition: f.disposition() }));
                }

                const payload = {
                    review_type: self.reviewType(), grantee_org: self.granteeOrg(), country: self.country(),
                    grant_reference: self.grantReference(), meeting_date: self.meetingDate() || null,
                    meeting_reference: self.meetingReference(), motion_text: self.motionText(),
                    outcome: self.outcome(),
                    ofac_screening_id: self.screeningId() || null,
                    exempt_purpose_finding: { affirmed: self.exemptAffirmed(), text: self.attestationText() },
                    votes: self.votes().map(v => ({ member_name: v.member_name(), board_role: v.board_role(),
                        vote: v.vote(), conflict_reason: v.conflict_reason() })),
                    data,
                };

                try{
                    let rec;
                    if(!self.isNewGrant() && self.priorApprovalId()){
                        payload.prior_approval_id = self.priorApprovalId();
                        rec = await self.server.authPostJson("/api/grants/boardApproval/revise", payload);
                    } else {
                        rec = await self.server.authPostJson("/api/grants/boardApproval", payload);
                    }
                    self.recorded(rec);
                    alertify.success("Board decision recorded: " + rec.outcome);
                }catch(error){
                    const msg = (error.responseJSON && error.responseJSON.message) || "Could not record decision";
                    console.error("board submit failed", error);
                    alertify.error(msg);
                }
            };
        },
        template: require('./board-approval-form.html'),
    });
}

