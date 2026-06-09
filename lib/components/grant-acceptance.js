/**
 * grant-acceptance — Phase 3 grantee clickwrap (lifecycle [4]). The grantee
 * selects the published agreement, reads it, confirms authority + E-SIGN consent,
 * ticks the assent box (unchecked by default), optionally types their name, and
 * submits. The exact text shown is captured with its hash and the session identity.
 *
 * INPUT (params): appState, user
 */
import {ensureFields} from '../shared/shared-utils';
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
            self.selectedVersion = ko.computed(() =>
                self.versions().find(v => v.agreement_version_id === self.selectedVersionId()));

            self.nonProfits = ko.observableArray();
            self.granteeOrg = ko.observable('');
            self.country = ko.observable('');
            self.granteeOrg.subscribe(name => {
                const np = self.nonProfits().find(n => n.registered_name === name);
                if (np) self.country(np.country_code);
            });
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
                self.selectedVersionId() && self.granteeOrg().trim() && self.signerName().trim()
                && self.authorized() && self.esignConsent() && self.assent());

            (async function load(){
                try{
                    self.versions(await self.server.authPostJson("/api/grants/agreements", {}));
                    self.nonProfits(await self.server.authPostJson("/api/grants/nonProfits", {}));
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
                        signer_full_name: self.signerName(),
                        signer_title: self.signerTitle(),
                        signer_email: self.signerEmail(),
                        authorized_representation_confirmed: self.authorized(),
                        consent_to_electronic_records: self.esignConsent(),
                        assent_checkbox_text: [self.assentText()],
                        agreement_document_snapshot: v.body,
                        grant_terms_snapshot: v.terms,
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
