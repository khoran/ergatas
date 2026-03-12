import alertify from 'alertifyjs';
import {ensureFields} from '../shared/shared-utils';

function emptyPost(){
    return {
        post_key: null,
        missionary_profile_key: null,
        post_type: 'update',
        date_added: new Date().toISOString().slice(0,10),
        post_content: '',
        prayer_count: 0,
    };
}

function normalizePost(post){
    const normalized = emptyPost();
    const source = post || {};

    normalized.post_key = source.post_key || null;
    normalized.missionary_profile_key = source.missionary_profile_key || null;
    normalized.post_type = source.post_type === 'prayer request' ? 'prayer request' : 'update';
    normalized.date_added = source.date_added || normalized.date_added;
    normalized.post_content = source.post_content || '';
    normalized.prayer_count = parseInt(source.prayer_count) || 0;
    return normalized;
}

export function register(){
    const name = 'profile-posts-manager';

    ko.components.register(name, {
        viewModel: function(params) {
            var self = this;

            ensureFields(params,["appState","profile"]);

            self.appState = params.appState;
            self.da = params.appState.da;
            self.server = params.appState.server;
            self.profileObs = params.profile;
            self.singleProfile = params.singleProfile || ko.observable(true);
            self.profileOptions = ko.observableArray([]);
            self.selectedProfileKey = ko.observable();
            self.loadingProfiles = ko.observable(false);
            self.postTypes = [
                {value: 'update', label: 'Update'},
                {value: 'prayer request', label: 'Prayer Request'},
            ];
            self.loading = ko.observable(false);
            self.saving = ko.observable(false);
            self.editingPostKey = ko.observable(null);
            self.editor = ko.mapping.fromJS(emptyPost());
            self.posts = ko.observableArray([]);
            self.loadedProfileKey = ko.observable(null);
            self.activeProfile = ko.observable(null);

            self.profileKey = function(profile){
                if(profile == null)
                    return null;
                if(typeof profile.missionary_profile_key === 'function')
                    return profile.missionary_profile_key();
                return profile.missionary_profile_key || null;
            };

            self.profileName = function(profile){
                if(profile == null)
                    return '';
                if(typeof profile.missionary_name === 'function')
                    return profile.missionary_name();
                return profile.missionary_name || '';
            };

            self.showProfileSelector = ko.pureComputed(function(){
                return !self.singleProfile();
            });

            self.hasProfile = ko.pureComputed(function(){
                return self.profileKey(self.activeProfile()) != null;
            });

            self.hasPosts = ko.pureComputed(function(){
                return self.posts().length > 0;
            });

            self.resetEditor = function(){
                self.editingPostKey(null);
                ko.mapping.fromJS(emptyPost(),{},self.editor);
            };

            self.startCreate = function(){
                self.resetEditor();
                const profile = self.activeProfile();
                const profileKey = self.profileKey(profile);
                if(profileKey != null)
                    self.editor.missionary_profile_key(profileKey);
            };

            self.scrollEditorIntoView = function(){
                const scrollToEditor = function(){
                    const editorCard = document.getElementById('profile-post-editor-card');
                    if(editorCard == null || typeof editorCard.scrollIntoView !== 'function')
                        return;

                    const rect = editorCard.getBoundingClientRect();
                    const viewHeight = window.innerHeight || document.documentElement.clientHeight;
                    const isFullyVisible = rect.top >= 0 && rect.bottom <= viewHeight;

                    if(!isFullyVisible){
                        editorCard.scrollIntoView({
                            behavior: 'smooth',
                            block: 'start'
                        });
                    }
                };

                if(window.requestAnimationFrame != null)
                    window.requestAnimationFrame(scrollToEditor);
                else
                    window.setTimeout(scrollToEditor, 0);
            };

            self.startEdit = function(post){
                self.editingPostKey(ko.unwrap(post.post_key));
                ko.mapping.fromJS(normalizePost(ko.mapping.toJS(post)),{},self.editor);
                self.scrollEditorIntoView();
            };

            self.mapPost = function(post){
                const mappedPost = ko.mapping.fromJS(normalizePost(post));
                mappedPost.expanded = ko.observable(false);
                return mappedPost;
            };

            self.cancelEdit = function(){
                self.resetEditor();
            };

            self.formatDate = function(value){
                const rawValue = ko.unwrap(value);
                if(rawValue == null || rawValue === '')
                    return 'No date';
                const date = new Date(rawValue);
                if(Number.isNaN(date.getTime()))
                    return rawValue;
                return date.toLocaleDateString();
            };

            self.loadPosts = async function(){
                const profile = self.activeProfile();
                const profileKey = self.profileKey(profile);
                if(profileKey == null){
                    self.posts([]);
                    return;
                }

                try{
                    self.loading(true);
                    const posts = await self.da.getOwnedPostsByProfileKey(profileKey);
                    self.posts(posts.map(post => self.mapPost(post)));
                    self.loadedProfileKey(profileKey);
                }finally{
                    self.loading(false);
                }
            };

            self.loadProfileOptions = async function(){
                if(self.singleProfile())
                    return;

                try{
                    self.loadingProfiles(true);
                    const profiles = await self.server.authPostJson('/api/getManagedProfiles');
                    self.profileOptions((profiles || []).map(profile => ({
                        value: profile.missionary_profile_key,
                        label: profile.missionary_name,
                        profile: ko.mapping.fromJS({
                            missionary_profile_key: profile.missionary_profile_key,
                            missionary_name: profile.missionary_name,
                        }),
                    })));
                }catch(error){
                    console.error('failed to load selectable profiles', error);
                    self.profileOptions([]);
                }finally{
                    self.loadingProfiles(false);
                }
            };

            self.selectedProfileKey.subscribe(function(selectedKey){
                if(selectedKey == null || selectedKey === ''){
                    self.activeProfile(null);
                    self.posts([]);
                    self.loadedProfileKey(null);
                    self.resetEditor();
                    return;
                }

                const profileOption = self.profileOptions().find(option => String(option.value) === String(selectedKey));
                self.activeProfile(profileOption ? profileOption.profile : null);
                self.posts([]);
                self.loadedProfileKey(null);
                self.startCreate();
            });

            ko.computed(function(){
                if(!self.hasProfile())
                    return;

                const profileKey = self.profileKey(self.activeProfile());
                if(profileKey != null && self.loadedProfileKey() !== profileKey)
                    self.loadPosts();
            });

            self.savePost = async function(){
                const draft = normalizePost(ko.mapping.toJS(self.editor));
                if(draft.post_content.trim() === ''){
                    alertify.error('Post content is required');
                    return;
                }

                try{
                    self.saving(true);
                    draft.missionary_profile_key = self.profileKey(self.activeProfile());

                    if(self.editingPostKey() != null)
                        await self.da.updatePost(self.editingPostKey(),draft);
                    else
                        await self.da.createPost(draft);

                    const wasEditing = self.editingPostKey() != null;
                    await self.loadPosts();
                    self.resetEditor();
                    self.startCreate();
                    alertify.success(wasEditing ? 'Post updated' : 'Post created');
                }catch(error){
                    console.error('failed to save profile post',error);
                    alertify.error('Failed to save post');
                }finally{
                    self.saving(false);
                }
            };

            self.deletePost = function(post){
                alertify.confirm('Delete Post','Are you sure you want to delete this post?', async function(){
                    try{
                        self.saving(true);
                        await self.da.deletePost(ko.unwrap(post.post_key));
                        await self.loadPosts();
                        if(self.editingPostKey() === ko.unwrap(post.post_key)){
                            self.resetEditor();
                            self.startCreate();
                        }
                        alertify.success('Post deleted');
                    }catch(error){
                        console.error('failed to delete profile post',error);
                        alertify.error('Failed to delete post');
                    }finally{
                        self.saving(false);
                    }
                }, function(){});
            };

            self.togglePostContent = function(post){
                post.expanded(!post.expanded());
                return false;
            };

            if(self.singleProfile()){
                self.activeProfile(self.profileObs != null ? self.profileObs() : null);
                if(ko.isObservable(self.profileObs)){
                    self.profileObs.subscribe(function(profile){
                        self.activeProfile(profile);
                        self.loadedProfileKey(null);
                    });
                }
            }else{
                self.loadProfileOptions();
            }

            if(self.hasProfile())
                self.startCreate();
        },
        template: require('./'+name+'.html'),
    });
}