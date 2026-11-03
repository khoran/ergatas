/**
 * grants-overview — hub/landing page for the Foreign Grant Compliance area of the
 * dashboard. Links to the organization-independent tools and lists every
 * organization that has started the grant process with its current stage, the
 * next step, agreement acceptance and salary-report status.
 *
 * INPUT (params)
 *   - appState
 *   - user     : logged-in user observable
 *   - setPage  : function(dashboardSubPageName) — switches the dashboard sub-page
 *   - hasRole  : root view model's role check (optional; hides staff-only tools)
 */
import {ensureFields} from '../shared/shared-utils';
import {setBoardIntent, clearBoardIntent} from '../shared/grant-steps';

export function register(){
    const name = "grants-overview";
    ko.components.register(name, {
        viewModel: function(params){
            const self = this;
            ensureFields(params, ["appState"]);
            self.appState = params.appState;
            self.user = params.user;
            self.setPage = params.setPage || function(){};
            // the step tools (screening, agreements) are grant-staff work; board
            // members use the pipeline list and the board pages
            const hasRole = params.hasRole || (() => true);
            self.isStaff = ko.pureComputed(() => !!hasRole('grant_staff'));

            // The organization-independent tools. Board review and annual review
            // are per organization, so they are reached from the pipeline list
            // below rather than from a card.
            self.steps = ko.observableArray([
                { step: 1, title: "Grant agreement",               page: "grants-agreements",  enabled: true,
                  blurb: "Versioned compliance agreement (reporting & legal obligations); carries no fixed grant amount." },
                { step: 2, title: "OFAC & due-diligence screening", page: "grants-screening",   enabled: true,
                  blurb: "Sanctions-screen the grantee, its principals and jurisdiction before any funds move." },
            ]);

            // ---- Pipeline: every organization with a screening on file ----
            clearBoardIntent();   // back on the overview: forget any earlier handoff
            self.pipeline = ko.observableArray([]);
            self.pipelineLoading = ko.observable(true);
            self.pipelineError = ko.observable('');
            self.fmtDate = d => d ? new Date(d).toISOString().slice(0, 10) : '';
            self.agreementText = row => row.agreement.accepted
                ? 'Accepted ' + self.fmtDate(row.agreement.date) + (row.agreement.signer ? ' by ' + row.agreement.signer : '')
                : 'Not accepted';
            self.reportText = row => {
                const r = row.reports;
                if(!r || !r.expected) return '—';
                if(r.due) return r.outstanding.map(o =>
                    o.year + ' report ' + (o.overdue ? 'overdue since ' : 'due ') + o.due_date).join('; ');
                return 'Up to date' + (r.last_year ? ' (last ' + r.last_year + ')' : '') +
                    (r.next ? '; ' + r.next.year + ' report due ' + r.next.due_date : '');
            };
            self.annualText = row => {
                const a = row.annual;
                if(!a) return '';
                return (a.overdue ? 'Annual review overdue since ' : a.due ? 'Annual review due ' : 'Annual review ') + a.due_date;
            };
            self.openNext = function(row){
                const next = row.next || {};
                if(next.review_type) setBoardIntent({ reviewType: next.review_type, granteeOrg: row.grantee_org });
                self.setPage(next.page);
            };
            async function loadPipeline(){
                try{
                    self.pipeline(await self.appState.server.authPostJson("/api/grants/pipeline", {}) || []);
                }catch(error){
                    console.error("grant pipeline load failed", error);
                    self.pipelineError("Could not load the organization list.");
                }finally{
                    self.pipelineLoading(false);
                }
            }
            loadPipeline();

            self.open = function(item){
                if(item && item.enabled) self.setPage(item.page);
            };
        },
        template: require(`./${name}.html`),
    });
}
