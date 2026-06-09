/**
 * salary-report-form — Phase 4 grantee UI (lifecycle [6]). Per-employee ledger
 * tying funds sent to funds applied to salary, with live variance, conditional
 * required explanations, a reconciliation banner, two verbatim certifications and
 * a typed signature. Submit is gated until the report reconciles and is certified.
 *
 * INPUT (params): appState, user
 */
import {ensureFields} from '../shared/shared-utils';
import alertify from 'alertifyjs';

const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

// Verbatim certification wording (mirrors lib/server/grants/reports.js).
const CONFIRMATION_1 = 'Each individual listed performed the charitable role funded by this grant during the period.';
const CONFIRMATION_2 = 'The amounts are accurate, the grant funds were used solely for the Charitable Purpose, ' +
    'and no portion was used for any prohibited purpose under the Grant Agreement.';

export function register(){
    const name = "salary-report-form";
    ko.components.register(name, {
        viewModel: function(params){
            const self = this;
            ensureFields(params, ["appState"]);
            self.server = params.appState.server;
            self.CONFIRMATION_1 = CONFIRMATION_1;
            self.CONFIRMATION_2 = CONFIRMATION_2;

            const newLine = () => {
                const o = { employee: ko.observable(''), role: ko.observable(''),
                            sent: ko.observable(0), applied: ko.observable(''), explanation: ko.observable('') };
                o.variance = ko.computed(() => {
                    if (o.applied() === '' || isNaN(Number(o.applied()))) return null;
                    return round2((Number(o.sent()) || 0) - Number(o.applied()));
                });
                o.needsExplanation = ko.computed(() => o.variance() != null && o.variance() !== 0);
                return o;
            };

            self.nonProfits = ko.observableArray();
            self.granteeOrg = ko.observable('');
            self.country = ko.observable('');
            self.server.authPostJson("/api/grants/nonProfits", {}).then(self.nonProfits)
                .catch(e => console.error("failed to load non-profits", e));
            self.granteeOrg.subscribe(name => {
                const np = self.nonProfits().find(n => n.registered_name === name);
                if (np) self.country(np.country_code);
            });
            self.reportingPeriod = ko.observable('');
            self.agreementVersion = ko.observable('');
            self.roleBasedMode = ko.observable(false);
            self.lines = ko.observableArray([ newLine() ]);
            self.cert1 = ko.observable(false);
            self.cert2 = ko.observable(false);
            self.typedSignature = ko.observable('');
            self.recorded = ko.observable(null);

            self.addLine = () => self.lines.push(newLine());
            self.removeLine = (l) => self.lines.remove(l);

            self.totals = ko.computed(() => {
                const t = { sent: 0, applied: 0, variance: 0, complete: true };
                self.lines().forEach(l => {
                    t.sent = round2(t.sent + (Number(l.sent()) || 0));
                    if (l.variance() == null) { t.complete = false; }
                    else { t.applied = round2(t.applied + Number(l.applied())); t.variance = round2(t.variance + l.variance()); }
                });
                return t;
            });

            self.reconciliation = ko.computed(() => {
                const t = self.totals();
                if (!t.complete) return { level: 'info', text: 'Enter every "applied to salary" amount to finish.' };
                if (t.variance === 0) return { level: 'success', text: 'Balanced: all funds sent were applied to salary.' };
                if (t.variance > 0) return { level: 'warning', text: 'Unspent balance of ' + t.variance + ' — per the agreement this must be explained, carried, or returned.' };
                return { level: 'warning', text: 'Applied exceeds sent (topped up from other funds); confirm only grant funds are certified here.' };
            });

            self.canSubmit = ko.computed(() => {
                if (!self.granteeOrg().trim() || !self.reportingPeriod().trim()) return false;
                if (!self.totals().complete) return false;
                if (self.lines().some(l => l.needsExplanation() && !l.explanation().trim())) return false;
                return self.cert1() && self.cert2() && self.typedSignature().trim();
            });

            self.gateHint = ko.computed(() => {
                if (self.canSubmit()) return '';
                if (!self.totals().complete) return 'Enter all "applied" amounts.';
                if (self.lines().some(l => l.needsExplanation() && !l.explanation().trim())) return 'Explain every variance.';
                if (!(self.cert1() && self.cert2())) return 'Confirm both certifications.';
                if (!self.typedSignature().trim()) return 'Type your name to sign.';
                return 'Complete the grantee/period fields.';
            });

            self.submit = async function(){
                if(!self.canSubmit()) return;
                try{
                    const rec = await self.server.authPostJson("/api/grants/salaryReport", {
                        grantee_org: self.granteeOrg(), country: self.country(),
                        reporting_period: self.reportingPeriod(), agreement_version: self.agreementVersion(),
                        role_based_mode: self.roleBasedMode(),
                        lines: self.lines().map(l => ({ employee: l.employee(), role: l.role(),
                            sent: Number(l.sent()) || 0, applied: Number(l.applied()), explanation: l.explanation() })),
                        charitable_use_confirmed: self.cert1(),
                        attestation_confirmed: self.cert2(),
                        typed_signature: self.typedSignature(),
                    });
                    self.recorded(rec);
                    alertify.success("Salary-use report submitted");
                }catch(error){
                    console.error("salary report submit failed", error);
                    alertify.error((error.responseJSON && error.responseJSON.message) || "Could not submit report");
                }
            };
        },
        template: require('./salary-report-form.html'),
    });
}
