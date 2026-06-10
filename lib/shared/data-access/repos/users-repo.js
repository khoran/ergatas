import { BaseRepo } from './base-repo.js';
import * as H from '../headers.js';
import {AppError} from '../../../server/app-error.js';

export class UsersRepo extends BaseRepo {
    async createUser(userId){
        return this.client.retry(3,async ()=>{
            var result = await this.client.authPost("/users_view",{external_user_id:userId},
                            H.single(H.representation()));
            if(result != null)
                return result;
            else
                throw new AppError("failed to get newly created user object");
            });

    }
    async getUser(userId){
        return this.client.retry(3,async ()=>{
            //cannot use single here as error is thrown when no result is found
            var result = await this.client.authGet("/users_view?external_user_id=eq."+userId);
            if(result != null)
                return result;
            else
                throw new AppError("no user found with userId "+userId);
            });
    }
    async getUserByKey(user_key){
        return this.client.retry(3,async ()=>{
            var result = await this.client.authGet("/users_view?user_key=eq."+user_key);
            if(result != null)
                return result;
            else
                throw new AppError("no user found with user_key "+user_key);
            });
    }
    getUserInfoByUserId(userId){
        return this.client.retry(3,async () =>{
            return await this.client.authGet("/user_info?external_user_id=eq."+userId,H.single());
        });
    }
    //user_info has permission for ergatas_server to query
    getUserInfoByKey(user_key){
        return this.client.retry(3,async () =>{
            return await this.client.authGet("/user_info?user_key=eq."+user_key,H.single());
        });
    }
   getUsersWithoutEntities(user_key){ //used for user cleanup only
        return this.client.retry(3,async () =>{
            return await this.client.authGet("/user_info?has_profile=eq.false&has_saved_search=eq.false");
        });
    }
    updateUser(user_key,data){
        //these fields are read-only, so must be removed before an update is attempted
        delete data.has_profile;
        delete data.has_saved_search;
        delete data.is_org_admin;
        return this.client.retry(3,async () =>{
            return await this.client.authPatch("/users_view?user_key=eq."+user_key,
                                    data,H.single(H.representation()));
        });
    }
    deleteUser(userId){
        const self=this;

        return this.client.retry(3,async () =>{
            return await this.client.authDelete("/users_view?external_user_id=eq."+userId,
                                    H.single(H.representation()));
        });
    }
}
