// Page/snippet template loading, split for initial-load performance.
//
// Eager pages are the cold-entry ones (home, search, worker) plus the error
// pages the router must be able to show synchronously even when a chunk fails
// to load. Everything else is grouped into a few lazy chunks and fetched on
// first navigation; getPage() returns a Promise and caches the jQuery-wrapped
// template per name.
//
// The maps are explicit (not a webpack context require) so nothing extra gets
// bundled — the old dynamic require pulled in every template eagerly, including
// the index.html shell. A unit test (test/templates.test.js) asserts these maps
// stay in sync with lib/data/page_info.json.
//
// Snippets are imported statically — a dynamic require("../snippet-templates/"
// + name) would make webpack bundle every file in that directory, including the
// server-only email templates.
import messageFormSnippet from '../snippet-templates/message-form.html';

const eagerPages = {
    "home":       require("../page-templates/home.html"),
    "search":     require("../page-templates/search.html"),
    "worker":     require("../page-templates/worker.html"),
    "not-found":  require("../page-templates/not-found.html"),
    "page-error": require("../page-templates/page-error.html"),
};

const lazyPages = {
    // informational pages
    "about":             () => import(/* webpackChunkName: "tpl-static" */ "../page-templates/about.html"),
    "contact":           () => import(/* webpackChunkName: "tpl-static" */ "../page-templates/contact.html"),
    "confirm-sof":       () => import(/* webpackChunkName: "tpl-static" */ "../page-templates/confirm-sof.html"),
    "privacy":           () => import(/* webpackChunkName: "tpl-static" */ "../page-templates/privacy.html"),
    "sof":               () => import(/* webpackChunkName: "tpl-static" */ "../page-templates/sof.html"),
    "terms-of-service":  () => import(/* webpackChunkName: "tpl-static" */ "../page-templates/terms-of-service.html"),
    "verify-email":      () => import(/* webpackChunkName: "tpl-static" */ "../page-templates/verify-email.html"),
    "get-started":       () => import(/* webpackChunkName: "tpl-static" */ "../page-templates/get-started.html"),
    "donate":            () => import(/* webpackChunkName: "tpl-static" */ "../page-templates/donate.html"),
    "profile-saved":     () => import(/* webpackChunkName: "tpl-static" */ "../page-templates/profile-saved.html"),
    "daily-prayer":      () => import(/* webpackChunkName: "tpl-static" */ "../page-templates/daily-prayer.html"),
    "wiki-page":         () => import(/* webpackChunkName: "tpl-static" */ "../page-templates/wiki-page.html"),
    "coming-soon":       () => import(/* webpackChunkName: "tpl-static" */ "../page-templates/coming-soon.html"),
    // experimental home page variant for comparison; accessed directly at /index2, not linked anywhere
    "index2":            () => import(/* webpackChunkName: "tpl-static" */ "../page-templates/index2.html"),
    // authenticated / app pages
    "profile":             () => import(/* webpackChunkName: "tpl-app" */ "../page-templates/profile.html"),
    "organization":        () => import(/* webpackChunkName: "tpl-app" */ "../page-templates/organization.html"),
    "org-application":     () => import(/* webpackChunkName: "tpl-app" */ "../page-templates/org-application.html"),
    "organization-review": () => import(/* webpackChunkName: "tpl-app" */ "../page-templates/organization-review.html"),
    "reports":             () => import(/* webpackChunkName: "tpl-app" */ "../page-templates/reports.html"),
    "message-moderation":  () => import(/* webpackChunkName: "tpl-app" */ "../page-templates/message-moderation.html"),
    "guided-search":       () => import(/* webpackChunkName: "tpl-app" */ "../page-templates/guided-search.html"),
    "dashboard":           () => import(/* webpackChunkName: "tpl-app" */ "../page-templates/dashboard.html"),
    "claim-org":           () => import(/* webpackChunkName: "tpl-app" */ "../page-templates/claim-org.html"),
    // learn section
    "learn":                                    () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn.html"),
    "resources":                                () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/resources.html"),
    "how-does-missionary-support-work":         () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/how-does-missionary-support-work.html"),
    "how-can-i-partner-with-a-missionary":      () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/how-can-i-partner-with-a-missionary.html"),
    "help-for-missionaries":                    () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/help-for-missionaries.html"),
    "engage-in-great-commission":               () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/engage-in-great-commission.html"),
    "matthew-28":                               () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/matthew-28.html"),
    "what-is-the-great-commission":             () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/what-is-the-great-commission.html"),
    "go-into-all-the-world":                    () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/go-into-all-the-world.html"),
    "christian-crowdfunding":                   () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/christian-crowdfunding.html"),
    "ergatas-mobilizer":                        () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/ergatas-mobilizer.html"),
    "search-for-missionaries":                  () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/search-for-missionaries.html"),
    "pray-for-a-missionary":                    () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/pray-for-a-missionary.html"),
    "frontier-people-groups":                   () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/frontier-people-groups.html"),
    "build-your-faith":                         () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/build-your-faith.html"),
    "mission-boards":                           () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/mission-boards.html"),
    "how-can-i-help":                           () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/how-can-i-help.html"),
    "joshua-project":                           () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/joshua-project.html"),
    "rewards-in-heaven":                        () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/rewards-in-heaven.html"),
    "prayer-cards":                             () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/prayer-cards.html"),
    "funding-models":                           () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/funding-models.html"),
    "donation-methods":                         () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/donation-methods.html"),
    "promoter":                                 () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/promoter.html"),
    "display-pages":                            () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/display-pages.html"),
    "engaging-strategic-missionary-partners":   () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/engaging-strategic-missionary-partners.html"),
    "managing-organizations":                   () => import(/* webpackChunkName: "tpl-learn" */ "../page-templates/learn/managing-organizations.html"),
    // docs section (articles loaded by the docs component)
    "docs":                () => import(/* webpackChunkName: "tpl-docs" */ "../page-templates/docs.html"),
    "saved-searches":      () => import(/* webpackChunkName: "tpl-docs" */ "../page-templates/docs/saved-searches.html"),
    "ministry-review":     () => import(/* webpackChunkName: "tpl-docs" */ "../page-templates/docs/ministry-review.html"),
    "dashboard-overview":  () => import(/* webpackChunkName: "tpl-docs" */ "../page-templates/docs/dashboard-overview.html"),
    "favorites":           () => import(/* webpackChunkName: "tpl-docs" */ "../page-templates/docs/favorites.html"),
    "prayers-and-updates": () => import(/* webpackChunkName: "tpl-docs" */ "../page-templates/docs/prayers-and-updates.html"),
    "donations":           () => import(/* webpackChunkName: "tpl-docs" */ "../page-templates/docs/donations.html"),
    "managed-profiles":    () => import(/* webpackChunkName: "tpl-docs" */ "../page-templates/docs/managed-profiles.html"),
    "manage-organization": () => import(/* webpackChunkName: "tpl-docs" */ "../page-templates/docs/manage-organization.html"),
    // "index" (the page shell) and virtual pages (preview, edit) are
    // intentionally absent; aliases resolve before getPage is called.
};

const pageCache = {};

export function initTemplates(client){
    client.pageInfo = require("../data/page_info.json");
    client.templates={snippets:[]};
    client.templates.snippets["message-form"] = jQuery(messageFormSnippet);
}

// Returns a Promise of the jQuery-wrapped template. Callers clone() before
// inserting into the DOM, so the cached copy stays pristine.
export function getPage(client,name){
    if(pageCache[name] != null)
        return Promise.resolve(pageCache[name]);
    if(eagerPages[name] != null){
        pageCache[name] = jQuery(eagerPages[name]);
        return Promise.resolve(pageCache[name]);
    }
    const load = lazyPages[name];
    if(load == null)
        return Promise.reject(new Error("no template for page "+name));
    return load().then( mod => {
        pageCache[name] = jQuery(mod.default != null ? mod.default : mod);
        return pageCache[name];
    });
}

// Synchronous access for the eager pages only — used for error/404 fallbacks
// that must render even when the network (and so a lazy chunk) is unavailable.
export function getPageSync(client,name){
    if(pageCache[name] == null && eagerPages[name] != null)
        pageCache[name] = jQuery(eagerPages[name]);
    return pageCache[name];
}

export function pageExists(client,name){
    return client.pageInfo[name] != null;
}
export function getSnippet(client,name){
    return client.templates.snippets[name];
}
