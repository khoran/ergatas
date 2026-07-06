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
            self.meetingDate = ko.observable(new Date().toISOString().slice(0, 10));
            self.meetingReference = ko.observable('');
            self.motionText = ko.observable('');

            // link a prior screening / due-diligence record (by record id) and prior approval (for annual)
            self.screeningId = ko.observable('');
            self.dueDiligenceId = ko.observable('');
            self.priorApprovalId = ko.observable('');
            self.screenings = ko.observableArray();
            self.dueDiligence = ko.observableArray();
            self.approvals = ko.observableArray();

            // Only organizations that already have BOTH a screening and a
            // due-diligence record on file are eligible for board review.
            self.eligibleNonProfits = ko.computed(() => {
                const screened = new Set(self.screenings().map(s => s.grantee_org));
                const vetted = new Set(self.dueDiligence().map(d => d.grantee_org));
                return self.nonProfits().filter(np =>
                    screened.has(np.registered_name) && vetted.has(np.registered_name));
            });

            // The prerequisite records are auto-linked: the dropdowns only offer the
            // selected grantee's records (newest first, matching the server's list
            // order) and the newest one is pre-selected. Staff only touch these to
            // pick an older record deliberately.
            const forOrg = list => ko.computed(() =>
                list().filter(r => r.grantee_org === self.granteeOrg()));
            self.orgScreenings = forOrg(self.screenings);
            self.orgDueDiligence = forOrg(self.dueDiligence);
            self.orgApprovals = forOrg(self.approvals);
            self.granteeOrg.subscribe(() => {
                const latest = list => (list()[0] || {}).record_id || '';
                self.screeningId(latest(self.orgScreenings));
                self.dueDiligenceId(latest(self.orgDueDiligence));
                self.priorApprovalId(latest(self.orgApprovals));
            });

            // new-grant terms
            self.proposedAmount = ko.observable('');
            self.proposedSchedule = ko.observable('');
            self.proposedTerm = ko.observable('');
            self.proposedPurpose = ko.observable('');

            // Prefill the charitable purpose from the selected grantee. A shell
            // non-profit means a parent entity handles the donations — the parent
            // is the Grantee on the agreement, so the purpose names the local
            // organization as its project. Otherwise the Grantee IS the selected
            // organization. Manual edits are kept: only an empty field or a prior
            // prefill is overwritten.
            let lastPurposePrefill = '';
            self.granteeOrg.subscribe(name => {
                const np = self.nonProfits().find(n => n.registered_name === name);
                if(!np) return;
                const base = 'salaries and related employment costs of staff carrying out the ministry of ';
                const prefill = np.is_shell
                    ? base + name + ', a project of the Grantee'
                    : base + 'the Grantee';
                if(!self.proposedPurpose().trim() || self.proposedPurpose() === lastPurposePrefill)
                    self.proposedPurpose(prefill);
                lastPurposePrefill = prefill;
            });

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
            // switching review type invalidates the current outcome — reset to the
            // type's default so a stale value can't be submitted
            self.reviewType.subscribe(() => self.outcome(self.outcomeOptions()[0]));

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
                    self.dueDiligence(await self.server.authPostJson("/api/grants/dueDiligence/list", {}));
                    self.approvals(await self.server.authPostJson("/api/grants/approvals", {}));
                }catch(error){ console.error("board form load failed", error); }
            }
            load();

            // Per-field validation messages. Bound inline next to each field (see
            // the .validation-error-message elements in the template) so the form
            // highlights exactly which field needs attention. Mirrors the server's
            // validate() rules (server stays authoritative).
            const APPROVAL_OUTCOMES = ['approved', 'approved_conditions', 'renewed', 'modified'];
            const CONDITIONAL_OUTCOMES = ['approved_conditions', 'modified'];
            self.fieldErrors = {
                granteeOrg:      ko.observable(''),
                screeningId:     ko.observable(''),
                dueDiligenceId:  ko.observable(''),
                priorApprovalId: ko.observable(''),
                outcome:         ko.observable(''),
                votes:           ko.observable(''),
                quorum:          ko.observable(''),
                exempt:          ko.observable(''),
                conditions:      ko.observable(''),
                delegationScope: ko.observable(''),
            };

            self.validate = function(){
                const fe = self.fieldErrors;
                Object.keys(fe).forEach(k => fe[k](''));   // clear prior messages
                const outcome = self.outcome();

                if(!self.granteeOrg()) fe.granteeOrg('Select an organization.');
                if(!outcome)           fe.outcome('Choose an outcome.');
                if(!self.votes().some(v => v.member_name() && v.member_name().trim()))
                    fe.votes('Record at least one board member.');

                if(self.isNewGrant()){
                    if(!self.screeningId())    fe.screeningId('Select a screening record.');
                    if(!self.dueDiligenceId()) fe.dueDiligenceId('Select a due-diligence record.');
                } else if(!self.priorApprovalId()){
                    fe.priorApprovalId('Select the approval to renew/amend.');
                }

                if(APPROVAL_OUTCOMES.includes(outcome)){
                    if(!self.quorumMet())
                        fe.quorum('Quorum not met for the recorded votes; an approval/renewal requires quorum.');
                    if(!(self.exemptAffirmed() && self.attestationText() && self.attestationText().trim()))
                        fe.exempt('The exempt-purpose & control finding must be affirmed to approve/renew.');
                }
                if(CONDITIONAL_OUTCOMES.includes(outcome) && self.conditions().length === 0)
                    fe.conditions('A conditional/modified outcome requires at least one condition.');
                if(self.delegationAuthorized() && !(self.delegationScope() && self.delegationScope().trim()))
                    fe.delegationScope('Required when delegation is authorized.');

                return Object.keys(fe).every(k => !fe[k]());
            };

            // Clear a field's message as soon as the user changes it.
            [['granteeOrg', self.granteeOrg], ['screeningId', self.screeningId],
             ['dueDiligenceId', self.dueDiligenceId], ['priorApprovalId', self.priorApprovalId],
             ['outcome', self.outcome], ['delegationScope', self.delegationScope]]
                .forEach(([key, obs]) => obs.subscribe(() => self.fieldErrors[key]('')));
            self.exemptAffirmed.subscribe(() => self.fieldErrors.exempt(''));

            self.submit = async function(){
                if(!self.validate()){
                    alertify.error('Please correct the highlighted fields.');
                    return;
                }
                const data = {
                    conditions: self.conditions(),
                    delegation: {
                        authorized: self.delegationAuthorized(),
                        scope: self.delegationScope(),
                        monthly_cap: self.delegationCap() === '' ? null : Number(self.delegationCap()),
                    },
                };
                if(self.isNewGrant()){
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
                    meeting_date: self.meetingDate() || null,
                    meeting_reference: self.meetingReference(), motion_text: self.motionText(),
                    outcome: self.outcome(),
                    ofac_screening_id: self.screeningId() || null,
                    due_diligence_id: self.dueDiligenceId() || null,
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

