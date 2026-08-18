/**
 * grants-overview — hub/landing page for the Foreign Grant Compliance area of the
 * dashboard. Shows the per-grantee compliance lifecycle and links to each tool.
 * Individual tools are enabled as their build phase lands.
 *
 * INPUT (params)
 *   - appState
 *   - user     : logged-in user observable
 *   - setPage  : function(dashboardSubPageName) — switches the dashboard sub-page
 */
import {ensureFields} from '../shared/shared-utils';

export function register(){
    const name = "grants-overview";
    ko.components.register(name, {
        viewModel: function(params){
            const self = this;
            ensureFields(params, ["appState"]);
            self.appState = params.appState;
            self.user = params.user;
            self.setPage = params.setPage || function(){};

            // The 7-step evidence-chain lifecycle. `page` is the dashboard
            // sub-page each tool lives on; `enabled` flips on as phases ship.
            self.steps = ko.observableArray([
                { step: 1, title: "Grant agreement",               page: "grants-agreements",  enabled: true,
                  blurb: "Versioned compliance agreement (reporting & legal obligations); carries no fixed grant amount." },
                { step: 2, title: "OFAC & due-diligence screening", page: "grants-screening",   enabled: true,
                  blurb: "Sanctions-screen the grantee, its principals and jurisdiction before any funds move." },
                { step: 3, title: "Board review & approval",        page: "grants-board",       enabled: true,
                  blurb: "Grantee-specific approval recording the exempt-purpose / anti-conduit finding and delegated scope." },
                { step: 4, title: "Annual review",                 page: "grants-board",       enabled: true,
                  blurb: "Re-screen and review reports to renew, modify, suspend or terminate." },
            ]);

            self.open = function(item){
                if(item && item.enabled) self.setPage(item.page);
            };
        },
        template: require(`./${name}.html`),
    });
}
