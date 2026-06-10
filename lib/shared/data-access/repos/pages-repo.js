import { BaseRepo } from './base-repo.js';
import * as H from '../headers.js';

export class PagesRepo extends BaseRepo {
    getPageBySlug(slug){
        return this.client.retry(3,async () =>{
            return this.client.get("/pages_view?slug=eq."+slug,H.single());
        });
    }
    getPageByKey(page_key){
        return this.client.retry(3,async () =>{
            return this.client.get("/pages_view?page_key=eq."+page_key,H.single());
        });
    }
    getPages(){
        return this.client.retry(3,async () =>{
            return this.client.get("/pages_view?order=slug");
        });
    }
    getPageSlugs(){
        return this.client.retry(3,async () =>{
            return this.client.get("/pages_view?select=page_key,slug");
        });
    }
    createPage(slug,data){
        return this.client.retry(3,async () =>{
            return await this.client.authPost("/pages_view?on_conflict=slug",{
                                            slug: slug,
                                            data: data
                                        //}, this.single(this.representation(this.ignoreDups())));
                                        }, H.ignoreDups());
        });
    }
    updatePage(page_key,data){
        return this.client.retry(3,async () =>{
            return await this.client.authPatch("/pages_view?page_key=eq."+page_key,
                                    {data:data}, H.single(H.representation()));
        });
    }
    /**
     * Update a page's slug and data in a single authenticated PATCH.
     * Encapsulates the dbAuthPatch call and header construction.
     * @param {string} page_key
     * @param {string} slug
     * @param {object} data
     */
    updatePageWithSlug(page_key,slug,data){
        return this.client.retry(3,async () =>{
            return await this.client.authPatch("/pages_view?page_key=eq."+page_key,
                                    {slug: slug, data: data}, H.single(H.representation()));
        });
    }
    deletePage(page_key){
        return this.client.retry(3,async () =>{
            return await this.client.authDelete("/pages_view?page_key=eq."+page_key,
                                    H.single(H.representation()));
        });
    }
}
