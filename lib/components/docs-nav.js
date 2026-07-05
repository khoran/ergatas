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

            self.isActive = (docName) => ko.unwrap(self.current) === docName;

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
            ];
        },
       template: require(`./${name}.html`),
   });
}
