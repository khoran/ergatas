/**
 * grant-step-nav — previous/next navigation between the grant-compliance step
 * pages. Dropped into each grants sub-page template in the dashboard.
 *
 * INPUT (params)
 *   - page    : the current step's dashboard sub-page name (e.g. "grants-board")
 *   - setPage : function(pageName) — switches the dashboard sub-page
 *               (the dashboard's `dashboardPage` observable)
 */
import {ensureFields} from '../shared/shared-utils';
import { GRANT_STEP_PAGES } from './grant-steps';

export function register(){
    const name = "grant-step-nav";
    ko.components.register(name, {
        viewModel: function(params){
            const self = this;
            ensureFields(params, ["page", "setPage"]);
            const page = ko.unwrap(params.page);
            self.setPage = params.setPage;

            const idx = GRANT_STEP_PAGES.findIndex(s => s.page === page);
            self.prev = idx > 0 ? GRANT_STEP_PAGES[idx - 1] : null;
            self.next = (idx >= 0 && idx < GRANT_STEP_PAGES.length - 1) ? GRANT_STEP_PAGES[idx + 1] : null;
            self.stepNumber = idx >= 0 ? idx + 1 : null;
            self.stepCount = GRANT_STEP_PAGES.length;

            self.goPrev = function(){ if(self.prev) self.setPage(self.prev.page); };
            self.goNext = function(){ if(self.next) self.setPage(self.next.page); };
            self.goOverview = function(){ self.setPage("grants-overview"); };
        },
        template: require('./grant-step-nav.html'),
    });
}
