import { BaseRepo } from './base-repo.js';

export class SearchesRepo extends BaseRepo {
    primarySearch(params,pageSize,sortField,use_or=null,all_profiles=false,profile_sub_search=false){

        var url = "/rpc/primary_search_v3";
        var defaultParams = {
            query: null,
            bounds: null,
            name: null,
            organization_keys: null,
            support_level_lte:null,
            support_level_gte:null,
            job_catagory_keys: null,
            impact_countries: null,
            marital_status: null,
            birth_years: null,
            movement_stages: null,
            tag_keys: null,
            cause_keys: null,
            people_id3_codes: null,
            rol3_codes: null,
            cultural_distances: null,
            missionary_profile_keys: null,
            sort_field: sortField,
            page_size: pageSize,
            use_or: use_or, // combine conditions with 'and' or 'or'.
            all_profiles: all_profiles, //include un-published and disabled profiles
            profile_sub_search: profile_sub_search, //cause missionary_profile_keys to be 'and'ed
        };
        var finalParams = Object.assign({},defaultParams, params);

        //console.debug("search params: ",finalParams);
        return this.client.retry(3,async () =>{
            if(all_profiles)
                return this.client.authPost(url,finalParams);
            else
                return this.client.post(url,finalParams,null,true);
        });
    }
    profilesByLastUpdate(lastUpdatedBefore){
        // excludes profiles at 100% support
        return this.client.retry(3, async ()=>{
            return await this.client.authGet("/profile_statuses?current_support_percentage=lt.100&last_updated_on=lt."+lastUpdatedBefore)
        });
    }
    updateProfileState(missionary_profile_key,state){
        return this.client.retry(3, async ()=>{
            return await this.client.authPatch("/profile_statuses?missionary_profile_key=eq."+missionary_profile_key,
                { state:state });
        });

    }
}
