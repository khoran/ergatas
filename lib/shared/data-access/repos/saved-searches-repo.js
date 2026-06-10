import { BaseRepo } from './base-repo.js';
import * as H from '../headers.js';

export class SavedSearchesRepo extends BaseRepo {
    createSavedSearch(user_key,data){
        return this.client.retry(3,async () =>{
            return await this.client.authPost("/saved_searches_view",{
                                            user_key: user_key,
                                            data: data
                                        }, H.single(H.representation()));
        });
    }
    getSavedSearchesByUser(user_key){
        return this.client.retry(3,async () =>{
            return await  this.client.authGet("/saved_searches_view?order=created_on&user_key=eq."+user_key);
        });
    }
    getSavedSearchesByKey(saved_search_key){
        return this.client.retry(3,async () =>{
            return await  this.client.authGet("/saved_searches_view?saved_search_key=eq."+saved_search_key);
        });
    }
    getSavedSearchesByName(user_key,name){
        return this.client.retry(3,async () =>{
            return await  this.client.get("/saved_searches_view?limit=1&and=(user_key.eq."+user_key+",data->>name.eq."+name+")",H.single());

                //"or=(data->>limit_social_media.eq.false,data->>limit_social_media.is.null)",this.single());
        });
    }

    updateSavedSearch(saved_search_key,data){
        return this.client.retry(3,async () =>{
            return await this.client.authPatch("/saved_searches_view?saved_search_key=eq."+saved_search_key,
                                    {data:data}, H.single(H.representation()));
        });
    }
    deleteSavedSearch(saved_search_key){
        return this.client.retry(3,async () =>{
            return await this.client.authDelete("/saved_searches_view?saved_search_key=eq."+saved_search_key,
                                    H.single(H.representation()));
        });
    }

    getPublicSearch(name){
        return this.client.retry(3,async () =>{
            return await  this.client.get("/public_searches_view?limit=1&search_name=eq."+name,H.single());
        });
    }
    getPublicSearches(){
        return this.client.retry(3,async () =>{
            return await  this.client.get("/public_searches_view");
        });
    }
    createPublicSearch(name,data){
        if(data.name != null)
            delete data.name;

        return this.client.retry(3,async () =>{
            return await this.client.authPost("/manage_public_searches?on_conflict=search_name",{
                                            search_name: name,
                                            data: data
                                        }, H.single(H.representation(H.ignoreDups())));
        });
    }
    //TODO: this is not working yet.
    deletePublicSearch(public_search_key){
        return this.client.retry(3,async () =>{
            return await this.client.authDelete("/manage_public_searches?public_search_key=eq."+public_search_key,
                                    H.single(H.representation()));
        });
    }
}
