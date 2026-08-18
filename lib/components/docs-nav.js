/**
 * Left-side navigation menu for the documentation shell.
 *
 * INPUT
 * ------
 *      - select:  function(docName | null) — called when a menu entry is clicked.
 *                 Passing null selects the documentation home/intro.
 *      - current: observable holding the currently-shown doc name (null on the intro),
 *                 used to highlight the active entry.
 *      - navigateFn: root navigate function, used for the "Back to Dashboard" link.
 *      - hasRole: function(roleName) → bool (optional). When supplied, role-tagged
 *                 groups are shown only to users holding one of the group's roles.
 *      - onlyGranteeRole: function() → bool (optional). When true, only the grantee
 *                 group is shown (a grantee-only user sees just their guides).
 */

import {ensureFields} from '../shared/shared-utils';

export function register(){
   const name="docs-nav";
   ko.components.register(name, {
      viewModel: function(params) {
            var self=this;

            ensureFields(params,["select","current","navigateFn"]);
            self.select = params.select;
            self.current = params.current;
            self.navigateFn = params.navigateFn;
            self.hasRole = params.hasRole || function(){ return false; };
            self.onlyGranteeRole = params.onlyGranteeRole || function(){ return false; };

            self.isActive = (docName) => ko.unwrap(self.current) === docName;

            // A group with no `roles` is shown to everyone (except grantee-only users);
            // a group with `roles` is shown only to users holding one of those roles.
            self.groups = [
                {group:'Everyday tools', items:[
                    {name:'dashboard-overview',  label:'Using Your Dashboard', icon:'fa-th-large'},
                    {name:'saved-searches',      label:'Saved Searches',       icon:'fa-save'},
                    {name:'favorites',           label:'Favorites',            icon:'fa-heart'},
                    {name:'prayers-and-updates', label:'Prayers and Updates',  icon:'fa-praying-hands'},
                    {name:'donations',           label:'Donations',            icon:'fa-donate'},
                ]},
                {group:'For organization administrators', items:[
                    {name:'manage-organization', label:'Managing Your Organization', icon:'fa-cogs'},
                    {name:'managed-profiles',    label:'Managing Worker Profiles',   icon:'fa-users'},
                    {name:'ministry-review',     label:'Ministry Review',            icon:'fa-file-alt'},
                ]},
                {group:'For grantees', role:'grantee', items:[
                    {name:'grant-acceptance',    label:'Accepting Your Grant Agreement', icon:'fa-file-signature'},
                    {name:'grant-salary-reports',label:'Salary-Use Reports',             icon:'fa-file-invoice-dollar'},
                ]},
                {group:'Grant compliance (staff)', roles:['grant_staff','board_member'], items:[
                    {name:'grant-compliance-overview', label:'Grant Compliance Overview', icon:'fa-hand-holding-usd'},
                    {name:'grant-ofac-screening',      label:'OFAC & Sanctions Screening',icon:'fa-user-shield'},
                    {name:'grant-board-approval',      label:'Board Review & Approval',   icon:'fa-gavel'},
                    {name:'grant-agreements-admin',    label:'Managing Grant Agreements', icon:'fa-file-contract'},
                    {name:'grant-disbursements',       label:'Disbursements',             icon:'fa-money-check-alt'},
                    {name:'grant-salary-reports',      label:'Salary-Use Reports',        icon:'fa-file-invoice-dollar'},
                ]},
            ];

            // Groups the current user should see, with duplicate items (e.g. the
            // shared Salary-Use Reports guide) removed once they've appeared.
            self.visibleGroups = ko.pureComputed(function(){
                var onlyGrantee = self.onlyGranteeRole();
                var seen = {};
                var out = [];
                self.groups.forEach(function(g){
                    var include;
                    if(onlyGrantee)
                        include = (g.role === 'grantee');
                    else if(g.roles == null && g.role == null)
                        include = true;
                    else{
                        var roleList = g.roles || [g.role];
                        include = roleList.some(function(r){ return self.hasRole(r); });
                    }
                    if(!include) return;
                    var items = g.items.filter(function(it){
                        if(seen[it.name]) return false;
                        seen[it.name] = true;
                        return true;
                    });
                    if(items.length) out.push({group: g.group, items: items});
                });
                return out;
            });
        },
       template: require(`./${name}.html`),
   });
}
