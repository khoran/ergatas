import { BaseRepo } from './base-repo.js';
import * as H from '../headers.js';
import * as shape from '../shape.js';
import {AppError} from '../../../server/app-error.js';

export class ProfilesRepo extends BaseRepo {
    createProfile(data){
        data.data = shape.normalizeProfileData(data.data);
        return this.client.retry(3,async () =>{
            return await this.client.authPost("/missionary_profiles_view",data,
                                    H.single(H.representation()));
        });
    }

    getUserForPrayerCardDrawing(){
        return this.client.retry(3,async () =>{
            return await this.client.get("/random_profiles?select=external_user_id,user_key,data->>first_name"+
                                    "&data->>prayer_card_drawing=eq.true&limit=1",
                H.single());
        });
    }


    getAllProfileKeys(){
        return this.client.retry(3,async () =>{
            return await this.client.get("/profile_search?select=missionary_profile_key");
        });
    }
    getAllProfileSummaries(){
        return this.client.retry(3,async () =>{
            return await this.client.get("/profile_search?select="+
                "missionary_profile_key,user_key,created_on,last_updated_timestamp,data->>donate_instructions,data->>donation_url,profile_slug");
        });
    }
    getProfileByUser(user_key){
        return this.client.retry(3,async () =>{
            var profileResults = await  this.client.authGet("/missionary_profiles_view?user_key=eq."+user_key);
            if(profileResults != null)
                return shape.updateProfileFields(profileResults);
            else
                throw new AppError("no profile found with user_key "+user_key);
        });
    }
    getProfileByKey(missionary_profile_key){
        return this.client.retry(3,async () =>{
            var profileResults = await  this.client.authGet("/missionary_profiles_view?missionary_profile_key=eq."+missionary_profile_key,
                                                H.single());
            if(profileResults != null)
                return shape.updateProfileFields(profileResults);
            else
                throw new AppError("no profile found with user_key "+user_key);
        });
    }
    profileExists(missionary_profile_key){
        return this.client.retry(3,async () =>{
            var profileCount = await  this.client.get("/profile_search?missionary_profile_key=eq."+missionary_profile_key+"&select=count()",
                                                H.single());
            //console.log("profileExists check result: ",profileCount);
            if(profileCount != null && profileCount.count != null && parseInt(profileCount.count) > 0)
                return true;
            else
                return false;
        });
    }
    getDisplayProfileByKey(missionary_profile_key){
        return this.client.retry(3,async () =>{
            var profileResults = await  this.client.get("/profile_search?missionary_profile_key=eq."+missionary_profile_key,
                                                    H.single());
            if(profileResults != null)
                return shape.updateProfileFields(profileResults);
            else
                throw new AppError("no profile found with user_key "+user_key);
        });
    }
    getProfileBySlug(slug){
        return this.client.retry(3,async () =>{
            var profileResults = await  this.client.get("/profile_search?profile_slug=eq."+slug,
                                                    H.single());
            if(profileResults != null)
                return shape.updateProfileFields(profileResults);
            else
                throw new AppError("no profile found with slug "+slug);
        });
    }
    profileSlugExists(slug, excludeMissionaryProfileKey){
        return this.client.retry(3,async () =>{
            var query = "/all_profile_search?profile_slug=eq."+slug;
            if(excludeMissionaryProfileKey != null){
                query += "&missionary_profile_key=neq."+excludeMissionaryProfileKey;
            }
            var results = await this.client.authGet(query);
            return results != null && results.length > 0;
        });
    }

    // Raw profile preview by key (no field normalization — callers only read
    // user_key / data.organization_key / first_name / last_name / external_user_id).
    getProfilePreviewByKey(missionary_profile_key){
        return this.client.retry(3,async () =>{
            return await this.client.authGet(
                `/all_profile_search?missionary_profile_key=eq.${missionary_profile_key}`,
                H.single()
            );
        });
    }
    listActiveOrgProfiles(organization_key){
        return this.client.retry(3,async () =>{
            return await this.client.authGet(
                `/all_profile_search?data->>organization_key=eq.${organization_key}&state=not.in.(disabled,blocked)`
            );
        });
    }
    getDisplayProfilePreviewByKey(missionary_profile_key){
        return this.client.retry(3,async () =>{
            var profileResults = await  this.client.authGet("/all_profile_search?missionary_profile_key=eq."+missionary_profile_key,
                                                H.single());
            if(profileResults != null)
                return shape.updateProfileFields(profileResults);
            else
                throw new AppError("no profile found with user_key "+user_key);
        });
    }

    getDisplayProfilesByKey(missionary_profile_keys){

        return this.client.retry(3,async () =>{
            var profileResults = await  this.client.get("/profile_search?missionary_profile_key=in.("+
                                                        missionary_profile_keys.join(',')+")");
            if(profileResults != null)
                return profileResults;
            else
                throw new AppError("no profile found with user_key "+user_key);
        });
    }

    newProfile(){
        return this.client.retry(3,async () =>{
            var record= await this.client.get("/new_missionary_profile",H.single());
            return shape.updateProfileFields({
                data:record.data,
                user_key:undefined,
                missionary_profile_key:undefined,
                profile_slug: null,
            });
        });
    }
    updateProfile(missionary_profile_key,data){
        //ensure data types
        data.data.current_support_percentage = parseFloat(data.data.current_support_percentage) || 0;
        data.data = shape.normalizeProfileData(data.data);
        console.log("saving updated profile to profile key "+missionary_profile_key,data);
        return this.client.retry(3,async () =>{
            return await this.client.authPatch("/missionary_profiles_view?missionary_profile_key=eq."+missionary_profile_key,
                                    data,H.single(H.representation()));
        });
    }
    deleteProfile(missionary_profile_key){
        if(missionary_profile_key == null || missionary_profile_key === ""){
            console.log("bad key given to deleteProfile: "+missionary_profile_key);
            return;
        }
        return this.client.retry(3,async () =>{
            return await this.client.authDelete("/missionary_profiles_view?missionary_profile_key=eq."+missionary_profile_key,
                                    H.single(H.representation()));
        });
    }
}
