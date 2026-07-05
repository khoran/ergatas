import { BaseRepo } from './base-repo.js';
import * as H from '../headers.js';
import * as shape from '../shape.js';

export class PostsRepo extends BaseRepo {
    getOwnedPostsByProfileKey(missionary_profile_key){
        return this.client.retry(3,async () =>{
            const results = await this.client.authGet("/posts_view?missionary_profile_key=eq."+missionary_profile_key+"&order=date_added.desc,post_key.desc");
            return shape.updatePostFields(results || []);
        });
    }
    getPublicPostsByProfileKey(missionary_profile_key){
        return this.client.retry(3,async () =>{
            const results = await this.client.get("/public_posts_view?missionary_profile_key=eq."+missionary_profile_key+"&order=date_added.desc,post_key.desc");
            return shape.updatePostFields(results || []);
        });
    }
    getPublicPrayerPostsByProfileKeys(missionary_profile_keys){
        return this.client.retry(3,async () =>{
            if(!Array.isArray(missionary_profile_keys) || missionary_profile_keys.length === 0)
                return [];

            const keys = missionary_profile_keys
                .map(k => parseInt(k))
                .filter(k => !Number.isNaN(k));

            if(keys.length === 0)
                return [];

            const results = await this.client.post(
                "/rpc/public_prayer_posts_by_profile_keys",
                { missionary_profile_keys: keys },
                null,
                true
            );
            return shape.updatePostFields(results || []);
        });
    }
    getPublicPostsByProfileKeys(missionary_profile_keys){
        return this.client.retry(3,async () =>{
            if(!Array.isArray(missionary_profile_keys) || missionary_profile_keys.length === 0)
                return [];

            const keys = missionary_profile_keys
                .map(k => parseInt(k))
                .filter(k => !Number.isNaN(k));

            if(keys.length === 0)
                return [];

            const results = await this.client.post(
                "/rpc/public_posts_by_profile_keys",
                { missionary_profile_keys: keys },
                null,
                true
            );
            return shape.updatePostFields(results || []);
        });
    }
    createPost(post){
        return this.client.retry(3,async () =>{
            const created = await this.client.authPost("/posts_view",shape.postPayload(post),H.single(H.representation()));
            return shape.updatePostFields(created);
        });
    }
    updatePost(post_key,post){
        return this.client.retry(3,async () =>{
            const updated = await this.client.authPatch("/posts_view?post_key=eq."+post_key,shape.postPayload(post),H.single(H.representation()));
            return shape.updatePostFields(updated);
        });
    }
    deletePost(post_key){
        return this.client.retry(3,async () =>{
            return await this.client.authDelete("/posts_view?post_key=eq."+post_key,H.single(H.representation()));
        });
    }
    getPostPrayerByKey(post_key){
        return this.client.retry(3,async () =>{
            return await this.client.authGet("/posts_prayer_view?post_key=eq."+post_key,H.single());
        });
    }
    updatePostPrayerCount(post_key,prayer_count){
        return this.client.retry(3,async () =>{
            return await this.client.authPatch(
                "/posts_prayer_view?post_key=eq."+post_key,
                {prayer_count: prayer_count},
                H.single(H.representation())
            );
        });
    }
}
