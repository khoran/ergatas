/**
 * grant-acceptance — Phase 3 grantee clickwrap (lifecycle [4]). The grantee
 * selects the published agreement, reads it, confirms authority + E-SIGN consent,
 * ticks the assent box (unchecked by default), optionally types their name, and
 * submits. The exact text shown is captured with its hash and the session identity.
 *
 * INPUT (params): appState, user
 */
import {ensureFields} from '../shared/shared-utils';
import {sanitizeHtml} from '../client/sanitize';
import alertify from 'alertifyjs';

export function register(){
    const name = "grant-acceptance";
    ko.components.register(name, {
        viewModel: function(params){
            const self = this;
            ensureFields(params, ["appState"]);
            self.server = params.appState.server;

            self.versions = ko.observableArray();
            self.selectedVersionId = ko.observable('');
            self.selectedVersion = ko.computed(() => {
                const vs = self.versions();
                return Array.isArray(vs) ? vs.find(v => v.agreement_version_id === self.selectedVersionId()) : undefined;
            });

            self.nonProfits = ko.observableArray();
            self.granteeOrg = ko.observable('');
            self.country = ko.observable('');
            self.granteeAddress = ko.observable('');
            self.granteeOrg.subscribe(name => {
                const nps = self.nonProfits();
                const np = Array.isArray(nps) ? nps.find(n => n.registered_name === name) : null;
                if (np) self.country(np.country_code);
            });

            // Server-rendered agreement (markdown template with {{tokens}} substituted
            // for this grantee, then converted to HTML). Re-fetched when the version or
            // grantee context changes; sanitized before display.
            self.renderedHtml = ko.observable('');
            self.refreshRendered = async function(){
                if(!self.selectedVersionId() || !self.granteeOrg()){ self.renderedHtml(''); return; }
                try{
                    const r = await self.server.authPostJson("/api/grants/agreements/render", {
                        agreement_version_id:   self.selectedVersionId(),
                        grantee_org_legal_name: self.granteeOrg(),
                        grantee_country:        self.country(),
                        grantee_address:        self.granteeAddress(),
                    });
                    self.renderedHtml(sanitizeHtml(r.html || ''));
                }catch(error){
                    console.error("agreement render failed", error);
                    self.renderedHtml('');
                }
            };
            self.selectedVersionId.subscribe(() => self.refreshRendered());
            self.granteeOrg.subscribe(() => self.refreshRendered());
            self.granteeAddress.subscribe(() => self.refreshRendered());

            // Open a print-ready window of the rendered agreement; the browser's
            // "Save as PDF" produces the downloadable PDF (renders the markdown formatting).
            self.downloadPdf = function(){
                const html = self.renderedHtml();
                if(!html){ alertify.error("Select your organization and the agreement first."); return; }
                const w = window.open('', '_blank');
                if(!w){ alertify.error("Pop-up blocked — allow pop-ups to download the PDF."); return; }
                w.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Grant Agreement</title>' +
                    '<style>body{font-family:Georgia,serif;max-width:800px;margin:2rem auto;padding:0 1rem;line-height:1.5;}' +
                    'h1,h2,h3{font-family:Arial,Helvetica,sans-serif;} hr{margin:2rem 0;border:0;border-top:1px solid #ccc;}</style>' +
                    '</head><body>' + html + '</body></html>');
                w.document.close();
                w.focus();
                w.print();
            };
            self.signerName = ko.observable('');
            self.signerTitle = ko.observable('');
            self.signerEmail = ko.observable('');

            self.authorized = ko.observable(false);     // Screen 1 affirmation
            self.esignConsent = ko.observable(false);   // Screen 2 E-SIGN consent
            self.assent = ko.observable(false);         // Screen 3 assent (default unchecked)
            self.typedSignature = ko.observable('');

            self.recorded = ko.observable(null);

            const ASSENT_TEXT = () => 'I have read and agree to the Grant Agreement (' +
                ((self.selectedVersion() && self.selectedVersion().version_label) || '') + ').';
            self.assentText = ko.computed(ASSENT_TEXT);

            self.canSubmit = ko.computed(() =>
                self.selectedVersionId() && (self.granteeOrg() || '').trim() && (self.signerName() || '').trim()
                && self.authorized() && self.esignConsent() && self.assent());

            (async function load(){
                try{
                    const versions = await self.server.authPostJson("/api/grants/agreements", {});
                    self.versions(Array.isArray(versions) ? versions : []);
                    const nonProfits = await self.server.authPostJson("/api/grants/nonProfits", {});
                    self.nonProfits(Array.isArray(nonProfits) ? nonProfits : []);
                }
                catch(error){ console.error("acceptance load failed", error); }
            })();

            self.submit = async function(){
                if(!self.canSubmit()) return;
                const v = self.selectedVersion();
                try{
                    const rec = await self.server.authPostJson("/api/grants/acceptance", {
                        agreement_version_id: v.agreement_version_id,
                        grantee_org_legal_name: self.granteeOrg(),
                        grantee_country: self.country(),
                        grantee_address: self.granteeAddress(),
                        signer_full_name: self.signerName(),
                        signer_title: self.signerTitle(),
                        signer_email: self.signerEmail(),
                        authorized_representation_confirmed: self.authorized(),
                        consent_to_electronic_records: self.esignConsent(),
                        assent_checkbox_text: [self.assentText()],
                        typed_signature: self.typedSignature(),
                    });
                    self.recorded(rec);
                    alertify.success("Agreement accepted");
                }catch(error){
                    console.error("acceptance failed", error);
                    alertify.error((error.responseJSON && error.responseJSON.message) || "Could not record acceptance");
                }
            };
        },
        template: require('./grant-acceptance.html'),
    });
}
