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
            self.profileObs = params.profile;
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

            self.hasProfile = ko.pureComputed(function(){
                return self.profileObs != null && self.profileObs() != null && self.profileObs().missionary_profile_key() != null;
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
                const profile = self.profileObs();
                if(profile != null)
                    self.editor.missionary_profile_key(profile.missionary_profile_key());
            };

            self.startEdit = function(post){
                self.editingPostKey(ko.unwrap(post.post_key));
                ko.mapping.fromJS(normalizePost(ko.mapping.toJS(post)),{},self.editor);
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
                const profile = self.profileObs();
                if(profile == null || profile.missionary_profile_key() == null){
                    self.posts([]);
                    return;
                }

                try{
                    self.loading(true);
                    const posts = await self.da.getOwnedPostsByProfileKey(profile.missionary_profile_key());
                    self.posts(posts.map(post => self.mapPost(post)));
                    self.loadedProfileKey(profile.missionary_profile_key());
                }finally{
                    self.loading(false);
                }
            };

            ko.computed(function(){
                if(!self.hasProfile())
                    return;

                const profileKey = self.profileObs().missionary_profile_key();
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
                    draft.missionary_profile_key = self.profileObs().missionary_profile_key();

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

            if(self.hasProfile())
                self.startCreate();
        },
        template: require('./'+name+'.html'),
    });
}