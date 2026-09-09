/**
 * The dashboard's landing pane. Two things live here:
 *
 *   1. Next steps - a role-aware list of what this user should do next, with
 *      counts. Everything it needs is already known to the client (roles,
 *      profile state, review queues), and it is what keeps the pane from being
 *      empty for users who have no profile of their own (donors, brand new
 *      users, org admins) - the old version rendered nothing at all for them.
 *   2. Stats - page views / donation clicks / prayers over a recent window,
 *      compared against the window before it, with a sparkline. All-time
 *      totals are kept as a smaller secondary figure.
 *
 * Every load here is optional: a failure leaves its item or tile out rather
 * than breaking the pane, since none of it is the reason the user came.
 *
 * INPUT
 * ------
 *      - appState
 *      - user: logged in user (observable)
 *      - userProfile: this user's own profile, or null (observable)
 *      - dashboardPage: the dashboard's current sub-page observable; writing to
 *        it is how a next step sends the user to another dashboard pane
 *      - navigateFn: $root.navigateFn, for steps that leave the dashboard
 *      - hasProfile, hasRole: from the root view model
 */

import * as utils from '../client/client-utils';
import {ensureFields} from '../shared/shared-utils';
import {sparklinePoints,statChange} from '../client/stat-display.js';

const STATS_WINDOW_DAYS = 30;
//a worker whose newest prayer/update is older than this is nudged to post
const STALE_POST_DAYS = 90;

//how the three GA4 metrics are labelled and ordered in the panel
const STAT_TILES = [
    {metric: "pageViews",      label: "Page Views",      icon: "fas fa-eye"},
    {metric: "donationClicks", label: "Donation Clicks", icon: "fas fa-donate"},
    {metric: "prayers",        label: "Prayers",         icon: "fas fa-praying-hands"},
];

//"3 profiles" / "1 profile"
function plural(count,noun,pluralNoun){
    return count+" "+(count === 1 ? noun : (pluralNoun || noun+"s"));
}
function daysSince(dateValue){
    if(dateValue == null || dateValue === "")
        return null;
    const then = new Date(dateValue);
    if(isNaN(then.getTime()))
        return null;
    return Math.floor((Date.now() - then.getTime()) / (24*60*60*1000));
}
export function register(){
   const name="dashboard-home";
   ko.components.register(name, {
      viewModel: function(params) {
            var self=this;
            console.log("start of "+name);

            ensureFields(params,["appState","user","userProfile","dashboardPage",
                                 "navigateFn","hasProfile","hasRole"]);

            const appState = params.appState;
            const server = appState.server;
            const da = appState.da;
            const userProfile = ko.unwrap(params.userProfile);
            const profileKey = userProfile == null ? null
                                : ko.unwrap(userProfile.missionary_profile_key);

            self.appState = appState;
            self.user = params.user;
            self.userProfile = params.userProfile;
            self.dashboardPage = params.dashboardPage;
            self.navigateFn = params.navigateFn;
            self.hasRole = params.hasRole;
            self.hasProfile = params.hasProfile;
            self.statTiles = STAT_TILES;
            self.windowDays = STATS_WINDOW_DAYS;
            self.sparklinePoints = sparklinePoints;

            //---- loaded data. Each stays null/empty until (and unless) its
            //load succeeds, and every consumer below tolerates that.
            self.stats = ko.observable();          // profile stats + trend
            self.statsLoading = ko.observable(profileKey != null);
            self.posts = ko.observableArray();
            self.donations = ko.observableArray();
            self.managedProfiles = ko.observableArray();
            self.pendingOrgs = ko.observableArray();
            self.queuedMessages = ko.observableArray();
            self.savedSearches = ko.observableArray();
            self.favoriteCount = ko.observable(0);
            self.stepsLoading = ko.observable(true);

            //---- stats panel -------------------------------------------------
            if(profileKey != null){
                utils.pageStatsTrend(server,profileKey,STATS_WINDOW_DAYS).then( stats =>{
                    self.stats(stats);
                    self.statsLoading(false);
                }).catch( error =>{
                    console.error("failed to load profile stats trend",error);
                    self.statsLoading(false);
                });
            }

            self.hasStats = ko.computed(() => self.stats() != null);

            //New gifts started in the window. Deliberately a count and not a
            //dollar total: possible_transactions holds one row per recurring
            //gift rather than one per payment, so summing its amounts would
            //not be the money actually received. The Donations pane, which
            //reads stripe, is where the money lives.
            self.newDonationCount = ko.computed(() =>{
                const cutoff = Date.now() - STATS_WINDOW_DAYS*24*60*60*1000;
                return self.donations().filter( donation =>{
                    const created = new Date(donation.created_on);
                    return ! isNaN(created.getTime()) && created.getTime() >= cutoff;
                }).length;
            });

            //Everything the panel draws, as one list, so the tiles are a single
            //flex row: each entry carries its own already-computed display
            //values and optionally a sparkline (`points`) and a link
            //(`action`), which the template omits when they are absent.
            self.tiles = ko.computed(() =>{
                const stats = self.stats();
                if(stats == null)
                    return [];

                const tiles = STAT_TILES.map( tile =>{
                    const current = (stats.current || {})[tile.metric] || 0;
                    const previous = (stats.previous || {})[tile.metric] || 0;
                    const change = statChange(current,previous);

                    return {
                        label: tile.label,
                        icon: tile.icon,
                        value: current,
                        change: {
                            text: change.text,
                            cssClass: change.direction === "up" ? "text-success" : "text-muted",
                            icon: change.direction === "up" ? "fas fa-arrow-up"
                                    : (change.direction === "down" ? "fas fa-arrow-down"
                                                                   : "fas fa-minus"),
                        },
                        points: sparklinePoints((stats.series || {})[tile.metric]),
                        footnote: ((stats.allTime || {})[tile.metric] || 0)+" all time",
                        action: null,
                    };
                });

                tiles.push({
                    label: "New Donations",
                    icon: "fas fa-hand-holding-heart",
                    value: self.newDonationCount(),
                    //no comparison window: this comes from our own records, not GA4
                    change: null,
                    points: null,
                    footnote: "gifts started",
                    action: {text: "See donations", fn: () => self.dashboardPage('donation-list')},
                });

                return tiles;
            });

            //---- next steps --------------------------------------------------
            //Each entry: what to say, how loudly, and where the button goes.
            self.nextSteps = ko.computed(() =>{
                const steps = [];
                const profile = ko.unwrap(self.userProfile);
                const goToPage = page => () => self.dashboardPage(page);
                const add = step => steps.push(step);

                if(self.hasProfile() && profile != null){
                    const state = ko.unwrap(profile.state);
                    const published = profile.data == null ? null : ko.unwrap(profile.data.published);
                    const staleDays = daysSince(ko.unwrap(profile.last_updated_on));
                    const editProfile = self.navigateFn('profile');

                    if(state === "blocked")
                        add({level:"urgent", icon:"fas fa-ban",
                             title:"Your profile has been disabled",
                             detail:"Get in touch and we will sort out what happened.",
                             actionText:"Contact us", action: self.navigateFn('contact/')});
                    else if(state === "disabled")
                        add({level:"urgent", icon:"fas fa-eye-slash",
                             title:"Your profile has expired",
                             detail:"It is no longer shown in search results. Saving an update puts it back.",
                             actionText:"Update profile", action: editProfile});
                    else if(state === "warning1" || state === "warning2")
                        add({level:"todo", icon:"fas fa-history",
                             title:"Your profile is due for an update",
                             detail: staleDays == null
                                ? "It has been about a year since your last update."
                                : "It has been "+plural(staleDays,"day")+" since your last update."+
                                  " If nothing has changed, just save it again.",
                             actionText:"Update profile", action: editProfile});

                    if(published !== true)
                        add({level:"urgent", icon:"fas fa-upload",
                             title:"Your profile is not published",
                             detail:"Nobody can find it in search until you publish it.",
                             actionText:"Publish profile", action: editProfile});

                    if( ! self.stepsLoading()){
                        const newestPost = self.posts()[0];
                        const postAge = newestPost == null ? null : daysSince(newestPost.date_added);

                        if(self.posts().length === 0)
                            add({level:"todo", icon:"fas fa-praying-hands",
                                 title:"Post your first prayer request or update",
                                 detail:"Supporters who follow you see these, and they give people a reason to come back.",
                                 actionText:"Write a post", action: goToPage('prayers-and-updates')});
                        else if(postAge != null && postAge > STALE_POST_DAYS)
                            add({level:"todo", icon:"fas fa-praying-hands",
                                 title:"Your last update was "+plural(postAge,"day")+" ago",
                                 detail:"Posting something new keeps your supporters in the loop.",
                                 actionText:"Write a post", action: goToPage('prayers-and-updates')});
                    }
                }else if( ! self.hasProfile() && ! (ko.unwrap(self.user) != null &&
                                                    ko.unwrap(self.user).is_org_admin())){
                    add({level:"todo", icon:"fas fa-user-edit",
                         title:"Create your worker profile",
                         detail:"A profile is how donors find you and give to your ministry.",
                         actionText:"Get started", action: self.navigateFn('profile')});
                }

                if( ! self.stepsLoading()){
                    //people following workers rather than raising support: give
                    //them something to do here too
                    if( ! self.hasProfile()){
                        if(self.savedSearches().length === 0)
                            add({level:"todo", icon:"fas fa-save",
                                 title:"Save a search",
                                 detail:"Save the kind of worker you want to support and come back to it any time.",
                                 actionText:"Saved searches", action: goToPage('saved-searches')});
                        if(self.favoriteCount() === 0)
                            add({level:"todo", icon:"fas fa-heart",
                                 title:"Add a worker to your favorites",
                                 detail:"Favorites are the quickest way back to the workers you are praying for.",
                                 actionText:"Find workers", action: self.navigateFn('search/')});
                    }

                    //profile managers: anything in their org needing a look
                    const needsAttention = self.managedProfiles().filter( managed =>
                        managed.published !== true || managed.state === "disabled" ||
                        managed.state === "warning1" || managed.state === "warning2" ||
                        managed.state === "blocked");

                    if(needsAttention.length > 0)
                        add({level:"todo", icon:"fas fa-users",
                             title:plural(needsAttention.length,"managed profile")+" needs attention",
                             detail:"Unpublished, expiring or expired profiles in your organization.",
                             actionText:"Review profiles", action: goToPage('managed-profiles-list')});

                    if(self.pendingOrgs().length > 0)
                        add({level:"urgent", icon:"fas fa-clock",
                             title:plural(self.pendingOrgs().length,"organization")+" awaiting review",
                             detail:"Organizations cannot be used until they are approved or denied.",
                             actionText:"Review organizations", action: goToPage('pending-organizations')});

                    if(self.queuedMessages().length > 0)
                        add({level:"urgent", icon:"fas fa-envelope",
                             title:plural(self.queuedMessages().length,"message")+" awaiting moderation",
                             detail:"Held messages are not delivered to workers until they are approved.",
                             actionText:"Moderate messages", action: goToPage('message-moderation')});
                }

                return steps;
            });
            self.stepClass = function(level){
                if(level === "urgent") return "next-step-urgent";
                if(level === "todo") return "next-step-todo";
                return "";
            };
            //nothing to do, and we are done looking
            self.allCaughtUp = ko.computed(() =>
                ! self.stepsLoading() && self.nextSteps().length === 0);

            //---- loads behind the next-steps list ----------------------------
            //One settle for all of them: individual failures resolve to a
            //default so a single broken queue cannot hide the whole list.
            const optional = (promise,fallback) => promise.catch( error =>{
                console.warn("dashboard-home: optional load failed",error);
                return fallback;
            });
            const loads = [];

            if(profileKey != null){
                //newest first, per getOwnedPostsByProfileKey's ordering
                loads.push(optional(da.getOwnedPostsByProfileKey(profileKey),[])
                            .then( posts => self.posts(posts || [])));
                loads.push(optional(da.getWorkerTransactions(),[])
                            .then( donations => self.donations(
                                Array.isArray(donations) ? donations : [])));
            }
            if(self.hasRole('profile_manager')){
                loads.push(optional(server.authPostJson("/api/getManagedProfiles"),[])
                            .then( profiles => self.managedProfiles(
                                Array.isArray(profiles) ? profiles : [])));
            }
            if(self.hasRole('organization_review')){
                loads.push(optional(da.organizationsNeedingReview(),[])
                            .then( orgs => self.pendingOrgs(orgs || [])));
                loads.push(optional(server.authPostJson("/api/queuedMessages"),[])
                            .then( messages => self.queuedMessages(
                                Array.isArray(messages) ? messages : [])));
            }
            if( ! self.hasProfile()){
                const user = ko.unwrap(self.user);
                if(user != null){
                    //one query serves both donor items: the favorites list is
                    //itself a saved search named "Favorites"
                    loads.push(optional(da.getSavedSearchesByUser(user.user_key()),[])
                        .then( searches =>{
                            searches = searches || [];
                            const favorites = searches.find( search =>
                                search.data != null && search.data.name === "Favorites");
                            const keys = favorites == null || favorites.data.params == null
                                ? [] : favorites.data.params.missionary_profile_keys;

                            self.favoriteCount(Array.isArray(keys) ? keys.length : 0);
                            self.savedSearches(searches.filter( search =>
                                search.data == null || search.data.name !== "Favorites"));
                        }));
                }
            }

            Promise.all(loads).then(() => self.stepsLoading(false));
        },
       template: require(`./${name}.html`),
    });
}
