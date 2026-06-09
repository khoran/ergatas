import * as profileCollection from  '../components/profile-collection';
import * as searchResultsMap from  '../components/search-results-map';
import * as locationInput from  '../components/location-input';
import * as fileCollection from  '../components/file-collection';
import * as donatePopup from  '../components/donate-popup';
import * as messagePopup from  '../components/message-popup';
import * as messageForm from  '../components/message-form';
import * as newsletterSignup from  '../components/newsletter-signup';
import * as sof from  '../components/statement-of-faith';
import * as orgApp from  '../components/org-application';
import * as ergatasDonation from  '../components/ergatas-donation';
import * as countrySelector from  '../components/country-selector';
import * as pendingOrganizations from  '../components/pending-organizations';
import * as reports from  '../components/reports';
import * as profileForm from  '../components/profile-form';
import * as searchResults from  '../components/search-results';
import * as worker from  '../components/worker';
import * as cannedSearches from  '../components/canned-searches';
import * as messageModeration from  '../components/message-moderation';
import * as savedSearchList from  '../components/saved-search-list';
import * as guidedSearchForm from  '../components/guided-search-form';
import * as directDonationPopup from  '../components/direct-donation-popup';
import * as dashboard from  '../components/dashboard';
import * as favorites from  '../components/favorites';
import * as claimOrg from  '../components/claim-org';
import * as orgPortal from  '../components/org-portal';
import * as orgEditor from  '../components/org-editor';
import * as manageWikiPages from  '../components/manage-wiki-pages';
import * as manageOrg from  '../components/manage-org';
import * as managedProfilesList from '../components/managed-profiles-list';
import * as donationList from '../components/donation-list';
import * as workerDocuments from '../components/worker-documents';
import * as workerDocumentList from '../components/worker-document-list';
import * as tagCloud from '../components/tag-cloud';
import * as profilePostsManager from '../components/profile-posts-manager';

// Registers all knockout components. Order preserved from the original main.js.
export function registerComponents(){
    [profileCollection,
        searchResultsMap,
        locationInput,
        reports,
        donatePopup,
        messagePopup,
        messageForm,
        searchResults,
        newsletterSignup,
        sof,
        ergatasDonation,
        orgApp,
        pendingOrganizations,
        countrySelector,
        worker,
        cannedSearches,
        profileForm,
        messageModeration,
        savedSearchList,
        guidedSearchForm,
        directDonationPopup,
        manageOrg,
        donationList,
        managedProfilesList,
        dashboard,
        profilePostsManager,
        favorites,
        claimOrg,
        orgEditor,
        orgPortal,
        manageWikiPages,
        fileCollection,
        tagCloud,
        workerDocuments,
        workerDocumentList].forEach(c => c.register())
}
