import { BaseRepo } from './base-repo.js';
import * as H from '../headers.js';
import * as shape from '../shape.js';

export class SocialMediaPostsRepo extends BaseRepo {
    // Whole scheduled queue, newest first — used by the site-admin dashboard.
    getSocialMediaPosts(){
        return this.run(async () =>{
            const results = await this.client.authGet(
                "/social_media_posts_view?order=post_date.desc,social_media_post_key.desc");
            return shape.updateSocialMediaPostFields(results || []);
        });
    }
    // Posts due today, read server-side (ergatas_server role) by the /feeds/posts endpoint.
    getDueSocialMediaPosts(){
        return this.run(async () =>{
            const results = await this.client.authGet("/due_social_media_posts_view");
            return shape.updateSocialMediaPostFields(results || []);
        });
    }
    // A single post whose date has arrived, for the /social-post/:key sharing page.
    getPublishedSocialMediaPost(social_media_post_key){
        return this.run(async () =>{
            const results = await this.client.authGet(
                "/published_social_media_posts_view?social_media_post_key=eq."+social_media_post_key);
            const posts = shape.updateSocialMediaPostFields(results || []);
            return posts.length > 0 ? posts[0] : null;
        });
    }
    createSocialMediaPost(post){
        return this.run(async () =>{
            const created = await this.client.authPost(
                "/social_media_posts_view",shape.socialMediaPostPayload(post),H.single(H.representation()));
            return shape.updateSocialMediaPostFields(created);
        });
    }
    updateSocialMediaPost(social_media_post_key,post){
        return this.run(async () =>{
            const updated = await this.client.authPatch(
                "/social_media_posts_view?social_media_post_key=eq."+social_media_post_key,
                shape.socialMediaPostPayload(post),H.single(H.representation()));
            return shape.updateSocialMediaPostFields(updated);
        });
    }
    deleteSocialMediaPost(social_media_post_key){
        return this.run(async () =>{
            return await this.client.authDelete(
                "/social_media_posts_view?social_media_post_key=eq."+social_media_post_key,
                H.single(H.representation()));
        });
    }
}
