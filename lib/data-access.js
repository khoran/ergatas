import {AppError} from './app-error';

export class DataAccess {
    constructor(postgrestBase){

        this.db= new postgrestClient.default(postgrestBase);
        this.token=undefined; 
    }
    setToken(token){
        this.token=token;
    }
    isAuthenticated(){
        return this.token !== undefined;
    }
    ensureAuthenticated(errorMessage){
        if(! this.isAuthenticated())
            throw new AppError(errorMessage);
    }
    dbGet(url){
        return this.db.get(url);
    }
    dbAuthGet(url){
        this.ensureAuthenticated("authentication required");
        return this.dbGet(url).auth(this.token);
    }
    dbPost(url){
        return this.db.post(url);
    }
    dbAuthPost(url){
        this.ensureAuthenticated("authentication required");
        return this.dbPost(url).auth(this.token);
    }
    dbPatch(url){
        return this.db.patch(url);
    }
    dbAuthPatch(url){
        this.ensureAuthenticated("authentication required");
        return this.dbPatch(url).auth(this.token);
    }

    async retry(numRetries,f,error){
        console.log("running function with retries. "+numRetries+" left");
        if(numRetries <= 0){
            console.error("operation failed after retries",error);
            throw error;
        }
        try{
            return await f();
        }catch(error){
            console.warn("function failed, "+(numRetries-1)+" tries remaining",error);
            return this.retry(numRetries - 1, f,error);
        }
    }

    /// Users
    async createUser(email){
        return this.retry(3,async ()=>{
            var result = await this.dbAuthPost("/users_view").
                set("Prefer","return=representation").
                send({email:email}).
                single();
            if(result != null)
                return result;
            else 
                throw new AppError("failed to get newly created user object");
            });

    }
    async getUser(email){
        return this.retry(3,async ()=>{
            var result = await this.dbAuthGet("/users_view").eq("email",email);
            if(result != null)
                return result;
            else 
                throw new AppError("no user found with email "+email);
            });
    }
    updateUser(user_key,email){

    }
    deleteUser(user_key){

    }
    /// Profiles
    createProfile(data){
        //TODO: make this idempotent. need a secondary key
        return this.retry(3,async () =>{
            return await this.dbAuthPost("/missionary_profiles_view").send(data).
                                    single().set("Prefer","return=representation");
        });
    }
    getProfileByUser(user_key){
        return this.retry(3,async () =>{
            var profileResults = await  this.dbAuthGet("/missionary_profiles_view").eq("user_key",user_key);
            if(profileResults != null)
                return this.updateProfileFields(profileResults);
            else
                throw new AppError("no profile found with user_key "+user_key);
        });
    }
    getProfileByKey(missionary_profile_key){
        return this.retry(3,async () =>{
            var profileResults = await  this.dbGet("/missionary_profiles_view").eq("missionary_profile_key",missionary_profile_key).single();
            if(profileResults != null)
                return this.updateProfileFields(profileResults);
            else
                throw new AppError("no profile found with user_key "+user_key);
        });
    }
    //when fields are added or removed fromo the JSON schema, 
    // apply the update here by adding or removing the required feilds
    updateProfileFields(profile){
        var self=this;
        if(Array.isArray(profile)){ // update each element of array
            return profile.map( p => self.updateProfileFields(p))
        }else{ //update this profile
            //no updates currently
        }
        console.log("upldated profile: ",profile);
        return profile;

    }
    newProfile(){
        return this.retry(3,async () =>{
            var record= await this.dbGet("/new_missionary_profile").single();
            return {
                data:record.data,
                user_key:undefined,
                missionary_profile_key:undefined,
            };
        });
    }
    updateProfile(missionary_profile_key,data){
        return this.retry(3,async () =>{
            return await this.dbAuthPatch("/missionary_profiles_view").send(data).
                                    eq("missionary_profile_key",missionary_profile_key).
                                    single().set("Prefer","return=representation");
        });
    }
    deleteProfile(missionary_profile_key){

    }
    profileSearch(query,name,org,skills,location,profileKeys,supportLevel){
        var request=this.dbGet("/profile_search");

        if(query != null && query !== '')
            request = request.ilike("search_text",'*'+query+'*');
        if(name != null)
            request = request.ilike("missionary_name",'*'+name+'*');
        if(org!= null)
            request = request.ilike("organization_name",'*'+org+'*');
        if(skills!= null && skills.length > 0 )
            request = request.query({"job_catagory_keys": "ov.{"+skills.join(",")+"}"});
        if(location!= null)
            request = request.ilike("location",'*'+location+'*');
        if(profileKeys != null && profileKeys.length > 0)
            request = request.in("missionary_profile_key",profileKeys);
        if(supportLevel != null )
            request = request.lte("current_support_percentage",supportLevel);

        return this.retry(3,async () =>{
            return request.end();
        });

    }
    profileSearchByArea(ne,sw){
        return this.retry(3,async () =>{
            return (await this.dbGet("/rpc/profile_in_box?"+
                                "ne_lat="+ne.lat()+"&"+
                                "ne_long="+ne.lng()+"&"+
                                "sw_lat="+sw.lat()+"&"+
                                "sw_long="+sw.lng())).
                            map(obj => obj.profile_in_box);

        });
    }
    // organizations
    getOrganization(organization_key){

    }
    createOrganization(data){
        return this.retry(3,async () =>{
            return await this.dbAuthPost("/organizations_view").send(data).
                                    single().set("Prefer","return=representation");
        });

    }
    newOrganization(){
        return this.retry(3,async () =>{
            var record= await this.dbGet("/new_organization").single();
            record = record.data;
            record.organization_key=undefined;
            return record;
        });
    }
    updateOrganization(organization_key,data){

    }
    deleteOrganization(organization_key){

    }
    organizationList(){
        return this.retry(3,async () =>{
            return this.dbGet("/organizations_view").end();
        });
    }
    organizationsNeedingReview(){
        return this.retry(3,async () =>{
            return this.dbAuthGet("/pending_organizations_view").end();
        });
    }
    setOrganizationApprovalStatus(organization_key,status){
        return this.retry(3,async () =>{
            return this.dbAuthPatch("/pending_organizations_view").
                send({status:status}).
                eq("organization_key",organization_key);
        });

    }
    jobList(){
        return this.retry(3,async () =>{
            return this.dbGet("/job_catagories_view").end();
        });
    }
    featuredProfiles(){
        return this.retry(3,async () =>{
            return this.dbGet("/featured_profiles").end();
        });
    }



}