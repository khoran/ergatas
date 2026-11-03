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
            self.orgsLoaded = ko.observable(false);
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
            // grantee context changes; sanitized before display. hasApproval mirrors the
            // server's acceptance gate: an acceptance must chain to a current approved
            // board decision (which also supplies the amount/schedule/purpose shown).
            self.renderedHtml = ko.observable('');
            self.hasApproval = ko.observable(null);   // null until first render
            self.refreshRendered = async function(){
                if(!self.selectedVersionId() || !self.granteeOrg()){ self.renderedHtml(''); self.hasApproval(null); return; }
                try{
                    const r = await self.server.authPostJson("/api/grants/agreements/render", {
                        agreement_version_id:   self.selectedVersionId(),
                        grantee_org_legal_name: self.granteeOrg(),
                        grantee_country:        self.country(),
                        grantee_address:        self.granteeAddress(),
                        highlight:              true,   // mark substituted values for display
                    });
                    self.renderedHtml(sanitizeHtml(r.html || ''));
                    self.hasApproval(r.has_approval === true);
                }catch(error){
                    console.error("agreement render failed", error);
                    self.renderedHtml('');
                }
            };
            self.selectedVersionId.subscribe(() => self.refreshRendered());
            self.granteeOrg.subscribe(() => self.refreshRendered());
            self.granteeAddress.subscribe(() => self.refreshRendered());

            // Open a print-ready window of the given agreement HTML; the browser's
            // "Save as PDF" produces the downloadable PDF (renders the markdown formatting).
            const printAgreement = function(html){
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
            self.downloadPdf = function(){ printAgreement(self.renderedHtml()); };
            // Download the exact signed document from an already-accepted agreement.
            self.downloadAcceptedPdf = function(){ printAgreement(self.acceptedHtml()); };
            self.signerName = ko.observable('');
            self.signerTitle = ko.observable('');
            self.signerEmail = ko.observable('');

            self.authorized = ko.observable(false);     // Screen 1 affirmation
            self.esignConsent = ko.observable(false);   // Screen 2 E-SIGN consent
            self.assent = ko.observable(false);         // Screen 3 assent (default unchecked)
            self.typedSignature = ko.observable('');

            self.recorded = ko.observable(null);

            // Prior acceptances for this grantee's org(s) (loaded below). When one
            // matches the currently-selected org + version, the page shows a
            // read-only summary instead of the form. A newly-published version has
            // no matching acceptance, so the form re-appears for re-acceptance.
            self.acceptances = ko.observableArray();
            self.viewingAgreement = ko.observable(false);
            self.existingAcceptance = ko.computed(() => {
                const accs = self.acceptances();
                if (!Array.isArray(accs)) return null;
                return accs.find(a => a.grantee_org_legal_name === self.granteeOrg()
                    && a.agreement_version_id === self.selectedVersionId()) || null;
            });
            self.acceptedHtml = ko.computed(() => {
                const a = self.existingAcceptance();
                return a ? sanitizeHtml(a.snapshot_html || '') : '';
            });

            const ASSENT_TEXT = () => 'I have read and agree to the Grant Agreement (' +
                ((self.selectedVersion() && self.selectedVersion().version_label) || '') + ').';
            self.assentText = ko.computed(ASSENT_TEXT);

            // The base compliance agreement can be signed before any board approval
            // or funding exists, so acceptance no longer requires an approval on file.
            self.canSubmit = ko.computed(() =>
                self.selectedVersionId() && (self.granteeOrg() || '').trim() && (self.signerName() || '').trim()
                && self.authorized() && self.esignConsent() && self.assent());

            (async function load(){
                try{
                    const versions = await self.server.authPostJson("/api/grants/agreements", {});
                    self.versions(Array.isArray(versions) ? versions : []);
                    // newest published version pre-selected (the list is newest-first);
                    // the dropdown stays for the rare older/other-language version
                    if(self.versions().length && !self.selectedVersionId())
                        self.selectedVersionId(self.versions()[0].agreement_version_id);

                    // Only organizations this user is a profile manager of (the server
                    // enforces the same rule); with exactly one it is chosen for them.
                    const orgs = await self.server.authPostJson("/api/grants/myGranteeOrgs", {});
                    self.nonProfits(Array.isArray(orgs) ? orgs : []);
                    self.orgsLoaded(true);
                    if(self.nonProfits().length === 1)
                        self.granteeOrg(self.nonProfits()[0].registered_name);

                    // Any agreements this grantee has already accepted (read under
                    // the server role; grantee RLS blocks a direct read).
                    const accs = await self.server.authPostJson("/api/grants/myAcceptances", {});
                    self.acceptances(Array.isArray(accs) ? accs : []);
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
