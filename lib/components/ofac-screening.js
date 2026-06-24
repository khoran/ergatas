/**
 * ofac-screening — Phase 1 UI. Lets grant staff:
 *   1. enter a grantee + screening targets (org, directors, officers, owners),
 *   2. run a fuzzy OFAC match preview,
 *   3. disposition each target (clear / potential / confirmed) with a note,
 *   4. finalize an immutable screening record, and
 *   5. capture a due-diligence record.
 *
 * The finalized screening's overall result gates board approval downstream.
 *
 * INPUT (params): appState, user
 */
import {ensureFields} from '../shared/shared-utils';
import alertify from 'alertifyjs';

const RESULT_OPTIONS = ['clear', 'potential_match', 'confirmed_match'];

export function register(){
    const name = "ofac-screening";
    ko.components.register(name, {
        viewModel: function(params){
            const self = this;
            ensureFields(params, ["appState"]);
            self.server = params.appState.server;

            const newTarget = (nm, type) => ({
                name: ko.observable(nm || ''), role: ko.observable(''),
                type: ko.observable(type || 'org'), variants: ko.observable(''),
            });

            self.nonProfits = ko.observableArray();
            self.granteeOrg = ko.observable('');
            self.country = ko.observable('');
            // load the org dropdown source (web.non_profits) and auto-fill country
            self.server.authPostJson("/api/grants/nonProfits", {}).then(self.nonProfits)
                .catch(e => console.error("failed to load non-profits", e));
            self.granteeOrg.subscribe(name => {
                const np = self.nonProfits().find(n => n.registered_name === name);
                if (np) self.country(np.country_code);
            });
            self.targets = ko.observableArray([ newTarget('', 'org') ]);
            self.screened = ko.observable(false);
            self.results = ko.observableArray();      // per-target disposition rows
            self.running = ko.observable(false);
            self.finalized = ko.observable(null);     // resulting record

            // due diligence
            self.ddSummary = ko.observable('');
            self.ddRisk = ko.observable('low');
            self.ddSaved = ko.observable(null);

            // Non-profit registry lookup (IRS/ProPublica), mirroring org-application's
            // non-profit search. The chosen match can be recorded into the vetting summary.
            self.npSelected = ko.observable(null);
            self.npSelectizeOptions = {
                create: false,
                valueField: "ein",
                labelField: "name",
                searchField: ["name", "displayEIN"],
                load: function(query, callback){
                    self.server.postJson("/api/nonProfits", { query: query, state: '' })
                        .then(function(results){ callback(results.organizations); })
                        .fail(function(error){ console.warn("non-profit lookup failed: " + error.message, error); });
                },
                render: {
                    option: function(data, escape){
                        return "<div>" + escape(data.name || '') +
                            "<br/><span style='font-size:0.7em;'>" +
                            escape((data.displayEIN || data.strein || data.ein || '') +
                                ", " + (data.city || '') + ", " + (data.state || '')) +
                            "</span></div>";
                    },
                },
                onItemAdd: function(value){ self.npSelected(this.options[value] || null); },
                onDelete: function(){ self.npSelected(null); },
            };

            // Append the selected registry match to the vetting findings summary.
            self.recordNpFinding = function(){
                const np = self.npSelected();
                if(!np) return;
                const ein = np.displayEIN || np.strein || np.ein;
                const parts = [
                    np.name,
                    ein ? "EIN " + ein : null,
                    [np.city, np.state].filter(Boolean).join(', ') || null,
                    np.ntee_code ? "NTEE " + np.ntee_code : null,
                ].filter(Boolean);
                const line = "Non-profit registry match (ProPublica): " + parts.join('; ') + ".";
                const existing = self.ddSummary();
                self.ddSummary(existing ? existing.replace(/\s*$/, '') + "\n" + line : line);
                alertify.success("Finding added to vetting summary");
            };

            self.resultOptions = RESULT_OPTIONS;

            self.addTarget = () => self.targets.push(newTarget('', 'director'));
            self.removeTarget = (t) => self.targets.remove(t);

            // Run the fuzzy match preview and seed disposition rows.
            self.runScreening = async function(){
                const targets = self.targets()
                    .filter(t => t.name() && t.name().trim())
                    .map(t => ({ name: t.name().trim(), role: t.role(), type: t.type(),
                                 name_variants: (t.variants() || '').split(',').map(s=>s.trim()).filter(Boolean) }));
                if(targets.length === 0){ alertify.error("Add at least one target name"); return; }

                // Preserve the reviewer's existing dispositions/notes across re-runs,
                // keyed by target identity (name|type|role).
                const keyOf = x => (x.name || '') + '|' + (x.type || '') + '|' + (x.role || '');
                const prior = {};
                self.results().forEach(x => { prior[keyOf(x)] = { note: x.disposition_note(), result: x.result() }; });

                self.running(true);
                try{
                    const matches = await self.server.authPostJson("/api/grants/ofac/match", { targets });
                    self.results(matches.map(m => {
                        const auto = m.auto_result === 'clear' ? 'clear' : 'potential_match';
                        const p = prior[keyOf(m)];
                        // Keep the prior disposition, but never silently keep 'clear'
                        // on a target that now has list hits.
                        const result = (p && !(p.result === 'clear' && m.matches.length > 0)) ? p.result : auto;
                        return {
                            name: m.name, role: m.role, type: m.type,
                            matches: m.matches,
                            result: ko.observable(result),
                            disposition_note: ko.observable(p ? p.note : ''),
                        };
                    }));
                    self.targetsSnapshot = targets;
                    self.screened(true);
                }catch(error){
                    console.error("screening failed", error);
                    alertify.error("Screening failed");
                }finally{
                    self.running(false);
                }
            };

            self.overallPreview = ko.computed(() => {
                const r = self.results().map(x => x.result());
                if(r.includes('confirmed_match')) return 'blocked';
                if(r.includes('potential_match')) return 'escalated';
                return r.length ? 'clear' : '';
            });

            // A grantee org must be selected (the <select> caption binds to
            // undefined), and each non-clear disposition needs a note before finalize.
            self.canFinalize = ko.computed(() => {
                if(!self.granteeOrg()) return false;
                if(!self.screened() || self.results().length === 0) return false;
                return self.results().every(x =>
                    x.result() === 'clear' || (x.disposition_note() && x.disposition_note().trim()));
            });

            // Explains why finalize is disabled (a non-clear target needs a note,
            // not necessarily a clear result). '' when finalize is allowed.
            self.gateHint = ko.computed(() => {
                if(self.canFinalize()) return '';
                if(!self.granteeOrg()) return 'Select the grantee organization.';
                if(!self.screened() || self.results().length === 0) return 'Run a screening first.';
                const needNote = self.results()
                    .filter(x => x.result() !== 'clear' && !(x.disposition_note() && x.disposition_note().trim()))
                    .map(x => x.name);
                if(needNote.length) return 'Add a disposition note for: ' + needNote.join(', ') +
                    ' (or mark the target clear).';
                return '';
            });

            self.finalize = async function(){
                if(!self.canFinalize()) return;
                try{
                    const payload = {
                        grantee_org: self.granteeOrg(),
                        country: self.country(),
                        targets: self.targetsSnapshot,
                        results: self.results().map(x => ({
                            name: x.name, result: x.result(), disposition_note: x.disposition_note() })),
                    };
                    const rec = await self.server.authPostJson("/api/grants/screen", payload);
                    self.finalized(rec);
                    alertify.success("Screening recorded (" + rec.overall_result + ")");
                }catch(error){
                    console.error("finalize failed", error);
                    alertify.error("Could not record screening");
                }
            };

            self.saveDueDiligence = async function(){
                if(!self.granteeOrg()){ alertify.error("Select the grantee organization first."); return; }
                try{
                    const dd = await self.server.authPostJson("/api/grants/dueDiligence", {
                        grantee_org: self.granteeOrg(), summary: self.ddSummary(), risk_rating: self.ddRisk() });
                    self.ddSaved(dd);
                    alertify.success("Due diligence recorded");
                }catch(error){
                    console.error("due diligence save failed", error);
                    alertify.error("Could not record due diligence");
                }
            };
        },
        template: require('./ofac-screening.html'),
    });
}
