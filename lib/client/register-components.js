// Knockout component registration, split for initial-load performance.
//
// Eager components are everything reachable from the pages a visitor can land
// on cold (home, search, /worker/*, plus the shell's footer): those pages are
// not client-navigated to, so their components must not cost an extra network
// round trip.
//
// Everything else (profile editing, dashboards/admin, org portals, docs) is
// grouped into a few route-aligned chunks and loaded through a custom
// ko.components loader on first instantiation. Knockout caches the resolved
// definition and joins concurrent loads, so each chunk downloads at most once.

import * as profileCollection from  '../components/profile-collection';
import * as searchResultsMap from  '../components/search-results-map';
import * as fileCollection from  '../components/file-collection';
import * as donatePopup from  '../components/donate-popup';
import * as messagePopup from  '../components/message-popup';
import * as messageForm from  '../components/message-form';
import * as newsletterSignup from  '../components/newsletter-signup';
import * as countrySelector from  '../components/country-selector';
import * as searchResults from  '../components/search-results';
import * as worker from  '../components/worker';
import * as cannedSearches from  '../components/canned-searches';
import * as directDonationPopup from  '../components/direct-donation-popup';
import * as tagCloud from '../components/tag-cloud';
import * as workerPrayers from '../components/worker-prayers';

// Deferred components; the key must match the name each module passes to
// ko.components.register. webpackChunkName groups them into one file per
// route cluster.
const lazyComponents = {
    // profile creation/editing and onboarding
    "profile-form":          () => import(/* webpackChunkName: "cmp-profile" */ '../components/profile-form'),
    "location-input":        () => import(/* webpackChunkName: "cmp-profile" */ '../components/location-input'),
    "worker-documents":      () => import(/* webpackChunkName: "cmp-profile" */ '../components/worker-documents'),
    "worker-document-list":  () => import(/* webpackChunkName: "cmp-profile" */ '../components/worker-document-list'),
    "statement-of-faith":    () => import(/* webpackChunkName: "cmp-profile" */ '../components/statement-of-faith'),
    "org-application":       () => import(/* webpackChunkName: "cmp-profile" */ '../components/org-application'),
    // dashboard and admin views
    "dashboard":             () => import(/* webpackChunkName: "cmp-dashboard" */ '../components/dashboard'),
    "donation-list":         () => import(/* webpackChunkName: "cmp-dashboard" */ '../components/donation-list'),
    "managed-profiles-list": () => import(/* webpackChunkName: "cmp-dashboard" */ '../components/managed-profiles-list'),
    "manage-org":            () => import(/* webpackChunkName: "cmp-dashboard" */ '../components/manage-org'),
    "manage-wiki-pages":     () => import(/* webpackChunkName: "cmp-dashboard" */ '../components/manage-wiki-pages'),
    "message-moderation":    () => import(/* webpackChunkName: "cmp-dashboard" */ '../components/message-moderation'),
    "org-editor":            () => import(/* webpackChunkName: "cmp-dashboard" */ '../components/org-editor'),
    "pending-organizations": () => import(/* webpackChunkName: "cmp-dashboard" */ '../components/pending-organizations'),
    "profile-posts-manager": () => import(/* webpackChunkName: "cmp-dashboard" */ '../components/profile-posts-manager'),
    "saved-search-list":     () => import(/* webpackChunkName: "cmp-dashboard" */ '../components/saved-search-list'),
    "favorites":             () => import(/* webpackChunkName: "cmp-dashboard" */ '../components/favorites'),
    "reports":               () => import(/* webpackChunkName: "cmp-dashboard" */ '../components/reports'),
    // org portals, guided search, docs
    "org-portal":            () => import(/* webpackChunkName: "cmp-org" */ '../components/org-portal'),
    "claim-org":             () => import(/* webpackChunkName: "cmp-org" */ '../components/claim-org'),
    "guided-search-form":    () => import(/* webpackChunkName: "cmp-org" */ '../components/guided-search-form'),
    "docs":                  () => import(/* webpackChunkName: "cmp-org" */ '../components/docs'),
    "docs-nav":              () => import(/* webpackChunkName: "cmp-org" */ '../components/docs-nav'),
};

export function registerComponents(){
    [profileCollection,
        searchResultsMap,
        workerPrayers,
        donatePopup,
        messagePopup,
        messageForm,
        searchResults,
        newsletterSignup,
        countrySelector,
        worker,
        cannedSearches,
        directDonationPopup,
        fileCollection,
        tagCloud].forEach(c => c.register())

    // Push (not unshift) so ko's defaultLoader keeps priority for the eagerly
    // registered names above. When a deferred component is first instantiated,
    // import its chunk, let its own register() run, then hand resolution back
    // to the defaultLoader which now finds it in the registry.
    ko.components.loaders.push({
        getConfig: function(name, callback){
            const load = lazyComponents[name];
            if(load == null){
                callback(null);
                return;
            }
            load().then( mod => {
                if(!ko.components.isRegistered(name))
                    mod.register();
                ko.components.defaultLoader.getConfig(name, callback);
            }).catch( error => {
                console.error("failed to load component chunk for "+name, error);
                callback(null);
            });
        }
    });
}
