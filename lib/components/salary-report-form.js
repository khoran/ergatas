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

            // View state: 'list' shows the grantee's existing reports; 'form' shows
            // the report form, editable for a new report or read-only when viewing
            // one already filed.
            self.mode = ko.observable('list');
            self.readOnly = ko.observable(false);
            self.reports = ko.observableArray([]);
            self.viewedRecord = ko.observable(null);
            self.fmtDate = ts => ts ? new Date(ts).toLocaleDateString() : '';
            self.reportTotals = r => (r && r.data && r.data.totals) || { sent: 0, applied: 0, variance: 0 };

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
            self.granteeOrg.subscribe(name => {
                const np = self.nonProfits().find(n => n.registered_name === name);
                if (np) self.country(np.country_code);
            });
            self.reportingPeriod = ko.observable('');
            // Reports are annual: the period is a calendar year. Offer the last
            // few years (newest first); a viewed legacy report keeps its own value.
            const thisYear = new Date().getFullYear();
            self.yearOptions = ko.computed(() => {
                const years = [0, 1, 2, 3].map(n => String(thisYear - n));
                const p = self.reportingPeriod();
                if(p && !years.includes(p)) years.push(p);
                return years;
            });
            self.roleBasedMode = ko.observable(false);
            self.lines = ko.observableArray([ newLine() ]);

            // Server-provided context: the current accepted agreement (the report
            // certifies against it; server refuses a report without one) and the
            // per-worker donation totals for the period, which pre-fill "sent" from
            // the org's ACTUAL donations so the grantee reconciles against real
            // receipts instead of typing amounts.
            self.context = ko.observable(null);
            self.hasAcceptance = ko.computed(() => {
                const c = self.context();
                return c ? c.has_acceptance === true : null;
            });
            self.donatedTotal = ko.computed(() => {
                const c = self.context();
                return (c && c.sent && c.sent.total) || 0;
            });
            self.refreshContext = async function(){
                if(self.readOnly()) return;   // viewing a filed report — no live context/prefill
                if(!self.granteeOrg()){ self.context(null); return; }
                try{
                    const c = await self.server.authPostJson("/api/grants/salaryReport/context", {
                        grantee_org: self.granteeOrg(), reporting_period: self.reportingPeriod() });
                    self.context(c);
                    // Pre-fill the ledger from the per-worker donation breakdown, one
                    // line per worker who received a donation this period; never
                    // overwrite rows the grantee has started editing.
                    const by = (c.sent && c.sent.byEmployee) || {};
                    const untouched = self.lines().every(l => !l.employee().trim() && !(Number(l.sent()) > 0) && l.applied() === '');
                    if(Object.keys(by).length && untouched){
                        self.lines(Object.entries(by).map(([employee, sent]) => {
                            const l = newLine(); l.employee(employee); l.sent(sent); return l;
                        }));
                    }
                }catch(error){ console.error("report context load failed", error); }
            };
            self.granteeOrg.subscribe(() => self.refreshContext());
            self.reportingPeriod.subscribe(() => self.refreshContext());
            self.cert1 = ko.observable(false);
            self.cert2 = ko.observable(false);
            self.typedSignature = ko.observable('');
            self.recorded = ko.observable(null);

            // Only organizations this user is a profile manager of (same rule as
            // acceptance; the server enforces it); with exactly one it is chosen.
            self.orgsLoaded = ko.observable(false);
            (async function loadOrgs(){
                try{
                    const orgs = await self.server.authPostJson("/api/grants/myGranteeOrgs", {});
                    self.nonProfits(Array.isArray(orgs) ? orgs : []);
                    self.orgsLoaded(true);
                    if(self.nonProfits().length === 1)
                        self.granteeOrg(self.nonProfits()[0].registered_name);
                }
                catch(error){ console.error("failed to load non-profits", error); }
            })();

            // The grantee's existing reports (server-scoped to their orgs).
            self.loadReports = async function(){
                try{
                    const rows = await self.server.authPostJson("/api/grants/myReports", {});
                    self.reports(Array.isArray(rows) ? rows : []);
                }catch(error){ console.error("failed to load reports", error); self.reports([]); }
            };
            self.loadReports();

            // Blank the form for a NEW report (keeps a single auto-selected org).
            self.resetForm = function(){
                self.readOnly(false);
                self.viewedRecord(null);
                self.reportingPeriod('');
                self.roleBasedMode(false);
                self.lines([ newLine() ]);
                self.cert1(false); self.cert2(false);
                self.typedSignature('');
                self.recorded(null);
                self.granteeOrg(self.nonProfits().length === 1 ? self.nonProfits()[0].registered_name : '');
            };

            // Fill the form (read-only) from a previously filed report row.
            self.fillFromRecord = function(rec){
                self.readOnly(true);                 // set before touching granteeOrg so refreshContext no-ops
                self.viewedRecord(rec);
                const lines = (rec && rec.data && Array.isArray(rec.data.lines)) ? rec.data.lines : [];
                self.granteeOrg(rec.grantee_org || '');
                self.country(rec.country || '');
                self.reportingPeriod(rec.reporting_period || '');
                self.roleBasedMode(rec.role_based_mode === true);
                self.lines(lines.length ? lines.map(l => {
                    const o = newLine();
                    o.employee(l.employee || ''); o.role(l.role || '');
                    o.sent(l.sent || 0); o.applied(l.applied == null ? '' : l.applied);
                    o.explanation(l.explanation || '');
                    return o;
                }) : [ newLine() ]);
                self.cert1(rec.charitable_use_confirmed === true);
                self.cert2(rec.attestation_confirmed === true);
                self.typedSignature(rec.typed_signature || '');
                self.recorded(null);
            };

            self.newReport = function(){ self.resetForm(); self.mode('form'); };
            self.viewReport = function(rec){ self.fillFromRecord(rec); self.mode('form'); };
            self.backToList = function(){ self.mode('list'); self.readOnly(false); self.loadReports(); };

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
                // granteeOrg is undefined (not '') while the <select> shows its caption
                if (!(self.granteeOrg() || '').trim() || !(self.reportingPeriod() || '').trim()) return false;
                if (self.hasAcceptance() !== true) return false;
                if (!self.totals().complete) return false;
                if (self.lines().some(l => l.needsExplanation() && !l.explanation().trim())) return false;
                return self.cert1() && self.cert2() && self.typedSignature().trim();
            });

            self.gateHint = ko.computed(() => {
                if (self.canSubmit()) return '';
                if (!(self.granteeOrg() || '').trim() || !(self.reportingPeriod() || '').trim()) return 'Complete the grantee/period fields.';
                if (self.hasAcceptance() === false) return 'Your organization has no accepted grant agreement on file.';
                if (!self.totals().complete) return 'Enter all "applied" amounts.';
                if (self.lines().some(l => l.needsExplanation() && !l.explanation().trim())) return 'Explain every variance.';
                if (!(self.cert1() && self.cert2())) return 'Confirm both certifications.';
                if (!self.typedSignature().trim()) return 'Type your name to sign.';
                return '';
            });

            self.submit = async function(){
                if(!self.canSubmit()) return;
                try{
                    const rec = await self.server.authPostJson("/api/grants/salaryReport", {
                        grantee_org: self.granteeOrg(), country: self.country(),
                        reporting_period: self.reportingPeriod(),
                        role_based_mode: self.roleBasedMode(),
                        lines: self.lines().map(l => ({ employee: l.employee(), role: l.role(),
                            sent: Number(l.sent()) || 0, applied: Number(l.applied()), explanation: l.explanation() })),
                        charitable_use_confirmed: self.cert1(),
                        attestation_confirmed: self.cert2(),
                        typed_signature: self.typedSignature(),
                    });
                    self.recorded(rec);
                    self.readOnly(true);     // filed — lock it; "Back to list" returns to the index
                    self.loadReports();
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
