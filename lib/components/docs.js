/**
 * Documentation shell. Renders the left-hand docs menu and a content area, and
 * swaps the selected documentation article into the content area in place — no
 * full page navigation, so there is no slide animation or scroll-to-top when
 * moving between docs. Deep links (/docs/<name>) and browser back/forward are
 * honoured by reading the article name from the URL.
 *
 * INPUT
 * ------
 *      - appState
 *      - navigateFn: root navigate function (used by links inside article content)
 *      - getPage:    function(name) returning the (jQuery) page template for an article
 */

import {ensureFields} from '../shared/shared-utils';

function docNameFromUrl(){
    try{
        const parts = (window.location.pathname || '').split('/').filter(p=>p.length>0);
        const idx = parts.indexOf('docs');
        if(idx >= 0 && parts.length > idx+1)
            return parts[idx+1];
    }catch(e){
        console.warn('docs: could not read URL',e);
    }
    return null;
}

export function register(){

   // Injects a documentation article (a cloned page template, or null) into the
   // element and applies bindings exactly once per swap. Unlike the shared `element`
   // binding, this does its work only in `update`, so it is safe when the bound value
   // is already non-null on first render (e.g. a deep link to /docs/<name>).
   ko.bindingHandlers.docsArticle = {
      update: function(element, valueAccessor, allBindings, viewModel){
         const $element = jQuery(element);
         const newEl = ko.unwrap(valueAccessor());
         // tear down any previously-injected article first
         $element.contents().each(function(){ ko.cleanNode(this); });
         $element.empty();
         if(!newEl) return;
         $element.append(newEl);
         ko.applyBindings(viewModel, newEl[0]);
      }
   };

   const name="docs";
   ko.components.register(name, {
      viewModel: function(params) {
            var self=this;
            console.log("start of "+name);

            ensureFields(params,["appState","navigateFn","getPage"]);
            self.appState = params.appState;
            // exposed for bindings re-applied inside injected article content
            self.navigateFn = params.navigateFn;
            self.getPage = params.getPage;

            self.docsPage = ko.observable(docNameFromUrl());

            // The cloned page template for the selected article (or null for the intro).
            self.currentDocPage = ko.computed(function(){
                const n = self.docsPage();
                if(!n) return null;
                try{
                    const tmpl = self.getPage(n);
                    return tmpl ? tmpl.clone() : null;
                }catch(e){
                    console.warn("docs: failed to load article '"+n+"'",e);
                    return null;
                }
            });

            // Menu / intro selection: swap content in place and update the URL without
            // routing (so no reload, slide, or scroll).
            self.selectDoc = function(docName){
                self.docsPage(docName || null);
                const path = docName ? '/docs/'+docName : '/docs';
                try{
                    window.history.pushState({docsPage: docName || null}, '', path);
                }catch(e){
                    console.warn("docs: pushState failed",e);
                }
            };

            // Keep content in sync with browser back/forward.
            self.onPopState = function(){
                self.docsPage(docNameFromUrl());
            };
            window.addEventListener('popstate', self.onPopState);

            self.dispose = function(){
                window.removeEventListener('popstate', self.onPopState);
                if(self.currentDocPage && self.currentDocPage.dispose)
                    self.currentDocPage.dispose();
            };
        },
       template: require(`./${name}.html`),
    });
}
