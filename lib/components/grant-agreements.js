/**
 * grant-agreements — Phase 3 staff UI. Publish versioned agreement templates
 * (append-only, hashed) and review recorded acceptances.
 *
 * INPUT (params): appState, user
 */
import {ensureFields} from '../shared/shared-utils';
import alertify from 'alertifyjs';

export function register(){
    const name = "grant-agreements";
    ko.components.register(name, {
        viewModel: function(params){
            const self = this;
            ensureFields(params, ["appState"]);
            self.server = params.appState.server;

            self.versions = ko.observableArray();
            self.acceptances = ko.observableArray();

            self.label = ko.observable('');
            self.body = ko.observable('');
            self.termsJson = ko.observable('{}');

            // Pre-fill the publish form from the canonical (counsel-reviewed) template
            // shipped with the server, so staff normally just set a label and publish.
            self.loadTemplate = async function(){
                try{
                    const t = await self.server.authPostJson("/api/grants/agreement/template", {});
                    self.body(t.body);
                    self.termsJson(JSON.stringify(t.terms || {}, null, 2));
                    if(!self.label()) self.label('v1.0 ' + new Date().toISOString().slice(0,10));
                }catch(error){ console.error("template load failed", error); }
            };

            async function load(){
                try{
                    self.versions(await self.server.authPostJson("/api/grants/agreements", {}));
                    self.acceptances(await self.server.authPostJson("/api/grants/acceptances", {}));
                    if(!self.body().trim()) await self.loadTemplate();
                }catch(error){ console.error("agreements load failed", error); }
            }
            load();

            self.publish = async function(){
                if(!self.label().trim() || !self.body().trim()){ alertify.error("Label and body are required"); return; }
                let terms = {};
                try{ terms = JSON.parse(self.termsJson() || '{}'); }
                catch(e){ alertify.error("Terms must be valid JSON"); return; }
                try{
                    const v = await self.server.authPostJson("/api/grants/agreement/publish",
                        { version_label: self.label(), body: self.body(), terms });
                    alertify.success("Published " + v.version_label);
                    self.label(''); self.body('');
                    load();
                }catch(error){
                    console.error("publish failed", error);
                    alertify.error((error.responseJSON && error.responseJSON.message) || "Publish failed");
                }
            };
        },
        template: require('./grant-agreements.html'),
    });
}
