import { BaseRepo } from './base-repo.js';
import * as H from '../headers.js';
import * as shape from '../shape.js';

export class PermissionsRepo extends BaseRepo {
    //profiles permissions
    getUserProfilePermissions(user_key){
        return this.client.retry(3,async () =>{
            return await  this.client.get("/user_profile_permissions_view?user_key=eq."+user_key,
                                    H.single(H.representation()));
        });
    }
    insertUserProfilePermissions(user_key,organization_key, read_only){
        return this.client.retry(3,async () =>{
            return await  this.client.authPost("/user_profile_permissions_view",
                                    {
                                        user_key:user_key,
                                        organization_key:organization_key,
                                        read_only: read_only,
                                    }, H.single(H.representation()));
        });
    }
    getUserOrgSearchFilter(userId){
        return this.client.retry(3,async () =>{
            return shape.singleOrNone(await  this.client.authGet("/user_org_search_filters?external_user_id=eq."+userId));
            //const result = await  this.dbAuthGet("/user_org_search_filters?external_user_id=eq."+userId);
        });
    }
    updateUserOrgSearchFilter(userId,data){
        return this.client.retry(3,async () =>{
            return await  this.client.authPatch("/user_org_search_filters?external_user_id=eq."+userId,
                                    data);
                                    //data,this.single(this.representation()));
        });
    }
    clearUserPermissionCache(user_key){
        return this.client.retry(3,async () =>{
            return await this.client.authDelete("/cached_user_permissions_view?user_key=eq."+user_key,
                                    H.single(H.representation()));
        });
    }
    cacheUserPermissions(user_key,profileKeys){
        //console.log("cacheUserPermissions: profileKeys: ",profileKeys);
        const data = profileKeys.map(profile_key => {
            return {
                user_key: user_key,
                missionary_profile_key: profile_key
            };
        });
        //console.log("cacheUserPermissions: data: ",data);
        return this.client.retry(3,async () =>{
            return this.client.authPost("/cached_user_permissions_view", data);
        });
    }


    insertProfileInvitation(created_by_external_user_id,missionary_profile_key,email){
        return this.client.retry(3,async () =>{
            return await  this.client.authPost("/profile_invitations_view?on_conflict=missionary_profile_key",{
                missionary_profile_key:missionary_profile_key,
                email:email,
                created_by_external_user_id: created_by_external_user_id,
            },H.ignoreDups());
        });
    }
    deleteProfileInvitation(profile_invitation_key){
        return this.client.retry(3,async () =>{
            return await this.client.authDelete("/profile_invitations_view?profile_invitation_key=eq."+profile_invitation_key);
        });
    }
    getProfileInvitations(){
        return this.client.retry(3,async () =>{
            return shape.singleOrNone(await  this.client.authGet("/profile_invitations_view"));
        });
    }
}
