import * as utils from '../client/client-utils';

/**
 * INPUT
 * -----
 *      - search: the AppState search object (provides allResults)
 *      - appState: AppState object (provides da, storage, selectProfile)
 *
 * Shows all matching workers that have at least one post, grouped by worker.
 * A top toggle switches between showing prayers, updates, or both (default
 * prayers). Each worker's posts are in a collapsible section, open by default.
 * A download icon exports the current prayer requests as CSV.
 */
export function register(){
    const NAME = "worker-prayers";
    console.log(NAME + " REGISTRATION");

    ko.components.register(NAME, {
        viewModel: function(params){
            var self = this;
            console.log(NAME + " component started", params);

            self.search = params.search;
            self.appState = params.appState;
            self.da = self.appState.da;
            self.server = self.appState.server;

            self.mode = ko.observable('prayers'); // 'prayers' | 'updates' | 'both'
            self.loading = ko.observable(false);
            // groups: [{ profile, posts:[...], collapsed: ko.observable(false) }]
            self.groups = ko.observableArray([]);
            // tracks post keys the user has prayed for this session
            self.prayedPostKeys = ko.observable({});

            self.pictureUrl = x => self.appState.storage.profilePictureUrl(x);
            self.selectProfile = data => self.appState.selectProfile(data);
            self.getProfileUrl = utils.getProfileUrl;

            self.setMode = function(mode){
                self.mode(mode);
            };

            self.hasPrayedForPost = function(postKey){
                return self.prayedPostKeys()[postKey] === true;
            };

            // Increment the prayer count for a post, mirroring the worker page.
            self.prayForPost = async function(post, missionaryProfileKey){
                const postKey = ko.unwrap(post.post_key);
                if(self.hasPrayedForPost(postKey))
                    return;

                try{
                    const updatedPost = await self.server.postJson('/api/profilePostPrayer',{
                        post_key: postKey,
                    });
                    post.prayer_count(parseInt(updatedPost.prayer_count) || (post.prayer_count() + 1));
                    self.prayedPostKeys(Object.assign({}, self.prayedPostKeys(), {[postKey]: true}));
                    dataLayer.push({
                        event: 'prayed',
                        missionary_profile_key: missionaryProfileKey,
                        post_key: postKey,
                    });
                }catch(error){
                    console.error('failed to increment profile post prayer count',error);
                }
            };

            self.toggleCollapsed = function(group){
                group.collapsed(!group.collapsed());
            };

            self.formatPostDate = function(value){
                const raw = ko.unwrap(value);
                if(raw == null || raw === '')
                    return 'No date';
                const date = new Date(raw);
                if(Number.isNaN(date.getTime()))
                    return raw;
                return date.toLocaleDateString();
            };

            function postMatchesMode(post, mode){
                if(mode === 'both') return true;
                if(mode === 'updates') return post.post_type === 'update';
                return post.post_type === 'prayer request'; // 'prayers'
            }

            // Filter each group's posts by the selected mode and drop workers
            // that have no matching posts.
            self.filteredGroups = ko.computed(function(){
                const mode = self.mode();
                return self.groups()
                    .map(function(g){
                        return {
                            profile: g.profile,
                            collapsed: g.collapsed,
                            posts: g.posts.filter(function(p){ return postMatchesMode(p, mode); }),
                        };
                    })
                    .filter(function(g){ return g.posts.length > 0; });
            });

            self.loadPosts = async function(){
                self.loading(true);
                try{
                    const results = self.search.allResults.peek() || [];
                    const keys = results.map(function(r){ return r.missionary_profile_key; });
                    if(keys.length === 0){
                        self.groups([]);
                        return;
                    }

                    const posts = await self.da.getPublicPostsByProfileKeys(keys);
                    const postList = Array.isArray(posts) ? posts : [];

                    // Group posts by profile key, preserving the date-desc order
                    // from the query.
                    const postsByKey = new Map();
                    postList.forEach(function(post){
                        const key = parseInt(post.missionary_profile_key);
                        if(!postsByKey.has(key))
                            postsByKey.set(key, []);
                        // prayer_count is observable so the prayed button can
                        // update the count live; the rest stay plain.
                        postsByKey.get(key).push({
                            post_key: post.post_key,
                            post_type: post.post_type,
                            date_added: post.date_added,
                            post_content: (post.data && post.data.post_content) || post.post_content || '',
                            prayer_count: ko.observable(parseInt(post.prayer_count) || 0),
                        });
                    });

                    const keysWithPosts = [...postsByKey.keys()];
                    if(keysWithPosts.length === 0){
                        self.groups([]);
                        return;
                    }

                    const profiles = await self.da.getDisplayProfilesByKey(keysWithPosts);
                    const profileByKey = new Map((profiles || []).map(function(p){
                        return [parseInt(p.missionary_profile_key), p];
                    }));

                    // Order groups to match the overall search result order.
                    const groups = [];
                    keys.forEach(function(key){
                        const k = parseInt(key);
                        const profile = profileByKey.get(k);
                        const profilePosts = postsByKey.get(k);
                        if(profile && profilePosts && profilePosts.length > 0){
                            groups.push({
                                profile: profile,
                                posts: profilePosts,
                                collapsed: ko.observable(false),
                            });
                        }
                    });
                    self.groups(groups);
                }catch(error){
                    console.error('failed to load worker prayers', error);
                    self.groups([]);
                }finally{
                    self.loading(false);
                }
            };

            // Reload whenever the search results change.
            self.reload = ko.computed(function(){
                self.search.allResults(); // create dependency
                self.loadPosts();
            });

            // Download the current prayer requests as CSV.
            self.downloadCSV = function(){
                const appBase = process.env.APP_BASE || '/';
                const normalizedBase = appBase.endsWith('/') ? appBase : appBase + '/';

                const prayerRequests = [];
                self.groups().forEach(function(group){
                    const data = group.profile.data || {};
                    const profileSlug = group.profile.profile_slug || '';
                    const profileUrl = profileSlug
                        ? new URL(normalizedBase + 'worker/' + profileSlug, window.location.origin).toString()
                        : '';
                    const profileName = ((data.first_name || '') + ' ' + (data.last_name || '')).trim()
                        || ('Profile ' + group.profile.missionary_profile_key);
                    group.posts
                        .filter(function(post){ return post.post_type === 'prayer request'; })
                        .forEach(function(post){
                            prayerRequests.push({
                                profile_name: profileName,
                                profile_url: profileUrl,
                                post_content: post.post_content || '',
                                date_added: post.date_added || '',
                                prayer_count: ko.unwrap(post.prayer_count) || 0,
                            });
                        });
                });

                if(prayerRequests.length === 0){
                    alertify.error('No prayer requests found in current search results.');
                    return;
                }

                const csvRows = [
                    'Profile Name,Post Content,Date Added,Prayer Count,Profile URL',
                    ...prayerRequests.map(function(r){
                        return [
                            '"' + (r.profile_name || '').replace(/"/g,'""') + '"',
                            '"' + (r.post_content || '').replace(/"/g,'""') + '"',
                            '"' + (r.date_added || '').replace(/"/g,'""') + '"',
                            r.prayer_count,
                            '"' + (r.profile_url || '').replace(/"/g,'""') + '"'
                        ].join(',');
                    })
                ];
                const csvContent = csvRows.join('\n');

                const blob = new Blob([csvContent], { type: 'text/csv' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'prayer_requests.csv';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
                alertify.success('Prayer requests downloaded.');
            };

            // Stop computeds from running after the view is torn down.
            self.dispose = function(){
                self.reload.dispose();
                self.filteredGroups.dispose();
            };
        },
        template: require('./worker-prayers.html'),
    });
}
