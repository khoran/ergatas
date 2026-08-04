import * as sharedUtils from '../shared/shared-utils';
import alertify from 'alertifyjs';

/**
 * INPUT params
 *  - appState: AppState object (required) - used to access `da` (data-access)
 *
 * Site-admin dashboard page for the manually-curated social media post queue.
 * Each post has a title, description, optional image URL, optional link URL,
 * and a post date. The /feeds/posts RSS feed exposes the posts whose post_date
 * is the current day, which dlvr.it reads to publish to social media.
 */
export function register(){
    const name = "social-media-posts-manager";
    ko.components.register(name,{
        viewModel: function(params){
            const self = this;

            try{
                sharedUtils.ensureFields(params,['appState']);
            }catch(err){
                console.error(name+" missing params: ",err);
                return;
            }

            self.appState = params.appState;
            self.da = self.appState.da;

            self.posts = ko.observableArray([]);
            self.loading = ko.observable(false);
            self.saving = ko.observable(false);
            self.editingKey = ko.observable(null); // social_media_post_key being edited, or null for new

            const today = new Date().toISOString().slice(0,10);
            self.editor = {
                title: ko.observable(''),
                description: ko.observable(''),
                image_url: ko.observable(''),
                link_url: ko.observable(''),
                post_date: ko.observable(today),
            };

            self.resetEditor = function(){
                self.editingKey(null);
                self.editor.title('');
                self.editor.description('');
                self.editor.image_url('');
                self.editor.link_url('');
                self.editor.post_date(new Date().toISOString().slice(0,10));
            };

            self.loadPosts = async function(){
                self.loading(true);
                try{
                    const results = await self.da.getSocialMediaPosts();
                    self.posts(Array.isArray(results) ? results : (results == null ? [] : [results]));
                }catch(error){
                    console.error("failed to load social media posts: ",error);
                    self.posts([]);
                }finally{
                    self.loading(false);
                }
            };

            self.startEdit = function(p){
                if(!p) return;
                const data = p.data || {};
                self.editingKey(p.social_media_post_key);
                self.editor.title(data.title || '');
                self.editor.description(data.description || '');
                self.editor.image_url(data.image_url || '');
                self.editor.link_url(data.link_url || '');
                self.editor.post_date(p.post_date || new Date().toISOString().slice(0,10));
            };

            self.cancelEdit = function(){
                self.resetEditor();
            };

            self.savePost = async function(){
                const post = {
                    title: (self.editor.title() || '').trim(),
                    description: (self.editor.description() || '').trim(),
                    image_url: (self.editor.image_url() || '').trim(),
                    link_url: (self.editor.link_url() || '').trim(),
                    post_date: self.editor.post_date(),
                };
                if(!post.title || !post.description){
                    alertify.error('Title and description are required');
                    return;
                }
                if(!post.post_date){
                    alertify.error('A post date is required');
                    return;
                }

                self.saving(true);
                try{
                    const key = self.editingKey();
                    if(key != null)
                        await self.da.updateSocialMediaPost(key, post);
                    else
                        await self.da.createSocialMediaPost(post);
                    await self.loadPosts();
                    self.resetEditor();
                    alertify.success('Post saved');
                }catch(err){
                    console.error('failed to save social media post: ',err);
                    alertify.error('Failed to save post: '+(err && err.message || err));
                }finally{
                    self.saving(false);
                }
            };

            self.deletePost = function(p){
                if(!p) return;
                alertify.confirm('Delete Post','Are you sure you want to permanently delete this post?', async function(){
                    try{
                        await self.da.deleteSocialMediaPost(p.social_media_post_key);
                        if(self.editingKey() === p.social_media_post_key)
                            self.resetEditor();
                        await self.loadPosts();
                        alertify.success('Post deleted');
                    }catch(err){
                        console.error('failed to delete social media post: ',err);
                        alertify.error('Failed to delete post: '+(err && err.message || err));
                    }
                }, function(){ /* cancel */ });
            };

            // initial load
            self.loadPosts();
        },
        template: require('./social-media-posts-manager.html')
    });
}
