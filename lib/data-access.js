import {AppError} from './app-error.js';

export class FilterAppender{
    constructor(){
    }
    append(fieldName,value){
        throw new AppError("No append method defined for FilterAppender");
    }
}
export class FilterContext{
    constructor(_request){
        this.request=_request;
    }
    get request(){
        return this._request;
    }
    set request(r){
        this._request = r;
    }
}
export class UrlContext{
    constructor(url){
        if(url.indexOf("?") === -1)
            url = url +"?";
        this._url=url;
    }
    get url(){
        return this._url;
    }
    set url(r){
        this._url = r;
    }
}

export class ILikeFilterAppender extends FilterAppender{
    append(context,fieldName,value){
        //context.request = context.request.ilike(fieldName,'*'+value+'*');
        context.url= context.url + fieldName+"=ilike."+"*"+value+"*"+"&";
    }
}
export class FTSFilterAppender extends FilterAppender{
    append(context,fieldName,value){
        //context.url= context.url + fieldName+"=wfts."+value+"&";
        context.url= context.url + "query="+value+"&";
    }
}
export class ContainsFilterAppender extends FilterAppender{
    append(context,fieldName,value){
        //context.request = context.request.in(fieldName,value);
        context.url = context.url + fieldName+"=in.("+value.join(",")+")"+"&";
    }
}
 export class OverlapsFilterAppender extends FilterAppender{
    append(context,fieldName,value){
        //var q = {};
        //q[fieldName] = "ov.{"+value.join(",")+"}";
        //context.request = context.request.query(q);
        context.url = context.url + fieldName+"=ov.{"+value.join(",")+"}"+"&";
    }
}
 export class LessThanFilterAppender extends FilterAppender{
    append(context,fieldName,value){
        //context.request = context.request.lte(fieldName,value);
        context.url= context.url + fieldName+"=lte."+parseInt(value)+"&";
    }
}
 export class GreaterThanFilterAppender extends FilterAppender{
    append(context,fieldName,value){
        //context.request = context.request.gte(fieldName,value);
        context.url= context.url + fieldName+"=gte."+parseInt(value)+"&";
    }
}
export class DataAccess {


    /**
     * 
     * @param {baseURL for postgrest requestes} postgrestBase 
     * @param {a function compatiable with jQuery.ajax} ajaxFn 
     */

    constructor(postgrestBase,ajaxFn,refreshAuthFn){

        this.baseUrl = postgrestBase;
        this.token=undefined; 
        this.ajax = ajaxFn;
        this.refreshAuth = refreshAuthFn;
    }
    dbRequest(type,url,data,extraHeaders){
        var headers = {};
        if(extraHeaders != null)
            headers = extraHeaders;
    
        headers['Content-Type']= "application/json";

        return this.ajax({
            method: type,
            url: this.baseUrl+url,
            data: data == null ? "" : JSON.stringify(data),
            headers: headers,
        });
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
    dbGet(url,headers){
        return this.dbRequest("get",url,null,headers);
    }
    dbAuthGet(url,headers){
        this.ensureAuthenticated("authentication required");
        return this.dbRequest("get",url,null,this.auth(headers));
    }
    dbPost(url,data,headers){
        return this.dbRequest("post",url,data,headers);
    }
    dbAuthPost(url,data,headers){
        this.ensureAuthenticated("authentication required");
        return this.dbRequest("post",url,data,this.auth(headers));
    }
    dbPatch(url,data,headers){
        return this.dbRequest("patch",url,data,headers);
    }
    dbAuthPatch(url,data,headers){
        this.ensureAuthenticated("authentication required");
        return this.dbRequest("patch",url,data,this.auth(headers));
    }
    dbAuthDelete(url,data,headers){
        this.ensureAuthenticated("authentication required");
        return this.dbRequest("delete",url,data,this.auth(headers));
    }

    auth(headers){
        headers = headers || {};
        headers['Authorization']= "Bearer "+this.token;
        return headers;
    }
    single(headers){
        headers = headers || {};
        headers['Accept']= "application/vnd.pgrst.object+json";
        return headers;
    }
    minimal(headers){
        headers = headers || {};
        headers["Prefer"]="return=minimal";
        return headers;
    }
    representation(headers){
        headers = headers || {};
        headers["Prefer"]="return=representation";
        return headers;
    }
    ignoreDups(headers){
        headers = headers || {};
        headers["Prefer"]="resolution=ignore-duplicates";
        return headers;
    }
    setRange(headers,range){
        headers = headers || {};
        if(range != null){
            headers["Range-Unit"]="items";
            headers["Range"]=range;
            headers["Prefer"]="count=estimated";
        }
        return headers;
    }

    async retry(numRetries,f,error){
        //console.log("running function with retries. "+numRetries+" left");
        var self=this;
        if(numRetries <= 0){
            console.error("operation failed after retries: "+error.message,error);
            throw error;
        }
        try{
            return await f();
        }catch(error){
            if(error.status === 401 && this.refreshAuth != null){
                console.info("db: got 401 error, refreshing auth");
                await this.refreshAuth();
            }else
                console.warn("function failed, "+(numRetries-1)+" tries remaining. "+error.message,error);
            
            return await self.retry(numRetries - 1, f,error);
        }
    }

    /// Users
    async createUser(userId){
        return this.retry(3,async ()=>{
            var result = await this.dbAuthPost("/users_view",{external_user_id:userId},
                            this.single(this.representation()));
            if(result != null)
                return result;
            else 
                throw new AppError("failed to get newly created user object");
            });

    }
    async getUser(userId){
        return this.retry(3,async ()=>{
            var result = await this.dbAuthGet("/users_view?external_user_id=eq."+userId);
            if(result != null)
                return result;
            else 
                throw new AppError("no user found with userId "+userId);
            });
    }
    async getUserByKey(user_key){
        return this.retry(3,async ()=>{
            var result = await this.dbAuthGet("/users_view?user_key=eq."+user_key);
            if(result != null)
                return result;
            else 
                throw new AppError("no user found with user_key "+user_key);
            });
    }
    updateUser(user_key,data){
        return this.retry(3,async () =>{
            return await this.dbAuthPatch("/users_view?user_key=eq."+user_key,
                                    data,this.single(this.representation()));
        });
    }
    deleteUser(user_key){
        const self=this;
        
        return this.retry(3,async () =>{
            return await this.dbAuthDelete("/users_view?user_key=eq."+user_key,
                                    this.single(this.representation()));
        });
    }
    /// Profiles
    createProfile(data){
        //TODO: make this idempotent. need a secondary key
        return this.retry(3,async () =>{
            return await this.dbAuthPost("/missionary_profiles_view",data,
                                    this.single(this.representation()));
        });
    }
    getAllUsers(){
        return this.retry(3,async () =>{
            return await this.dbAuthGet("/user_info");
        });
    }
    getAllProfileKeys(){
        return this.retry(3,async () =>{
            return await this.dbGet("/profile_search?select=missionary_profile_key");
        });
    }
    getProfileByUser(user_key){
        return this.retry(3,async () =>{
            var profileResults = await  this.dbAuthGet("/missionary_profiles_view?user_key=eq."+user_key);
            if(profileResults != null)
                return this.updateProfileFields(profileResults);
            else
                throw new AppError("no profile found with user_key "+user_key);
        });
    }
    getProfileByKey(missionary_profile_key){
        return this.retry(3,async () =>{
            var profileResults = await  this.dbGet("/profile_search?missionary_profile_key=eq."+missionary_profile_key,
                                                    this.single());
            if(profileResults != null)
                return this.updateProfileFields(profileResults);
            else
                throw new AppError("no profile found with user_key "+user_key);
        });
    }
    getProfilesByKey(missionary_profile_keys){

        return this.retry(3,async () =>{
            var profileResults = await  this.dbGet("/profile_search?missionary_profile_key=in.("+
                                                        missionary_profile_keys.join(',')+")");
            if(profileResults != null)
                return profileResults;
            else
                throw new AppError("no profile found with user_key "+user_key);
        });
    }

    //when fields are added or removed from the JSON schema, 
    // apply the update here by adding or removing the required fields
    updateProfileFields(profile){
        var self=this;
        if(Array.isArray(profile)){ // update each element of array
            return profile.map( p => self.updateProfileFields(p))
        }else{ //update this profile
            if(profile.data.country == null)
                profile.data.country="";
            if(profile.data.donate_instructions == null)
                profile.data.donate_instructions="";
            if(profile.data.country_code == null)
                profile.data.country_code="";
            if(profile.data.impact_countries== null)
                profile.data.impact_countries=[];
            if(profile.data.marital_status == null)
                profile.data.marital_status = "";
            if(profile.data.kids_birth_years == null)
                profile.data.kids_birth_years = [];
            if(profile.data.movement_stage == null)
                profile.data.movement_stage= -1;
            if(profile.data.tag_keys== null)
                profile.data.tag_keys = [];

        }
        //console.log("updated profile: ",profile);
        return profile;

    }
    newProfile(){
        return this.retry(3,async () =>{
            var record= await this.dbGet("/new_missionary_profile",this.single());
            return {
                data:record.data,
                user_key:undefined,
                missionary_profile_key:undefined,
            };
        });
    }
    updateProfile(missionary_profile_key,data){
        //ensure data types 
        data.data.current_support_percentage = parseFloat(data.data.current_support_percentage) || 0;
        return this.retry(3,async () =>{
            return await this.dbAuthPatch("/missionary_profiles_view?missionary_profile_key=eq."+missionary_profile_key,
                                    data,this.single(this.representation()));
        });
    }
    deleteProfile(missionary_profile_key){

    }
    primarySearch(filters,pageSize,sortField){

        var url = "/rpc/primary_search";
        var params = {
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
            movement_stage: null,
            sort_field: sortField,
            page_size: pageSize,
        };
        var arraysToCast= ["job_catagory_keys","organization_keys","kids_birth_years"];
        for( var i in filters){
            //if(filters[i].name() === "job_catagory_keys" || filters[i].name() === "organization_keys"){
            if( arraysToCast.indexOf(filters[i].name()) !== -1 ){
                //cast values to int
                params[filters[i].name()] = filters[i].obs()().map((x)=>parseInt(x));
            }else
                params[filters[i].name()] = filters[i].obs()();
        }

        //console.log("search params: ",params);
        return this.retry(3,async () =>{
            return this.dbPost(url,params);
        });
    }
    profilesByLastUpdate(lastUpdatedBefore){
        return this.retry(3, async ()=>{
            return await this.dbAuthGet("/profile_statuses?last_updated_on=lt."+lastUpdatedBefore)
        });
    }
    updateProfileState(missionary_profile_key,state){
        return this.retry(3, async ()=>{
            return await this.dbAuthPatch("/profile_statuses?missionary_profile_key=eq."+missionary_profile_key,
                { state:state });
        });

    }
    // organizations
    getOrganization(organization_key){
        return this.retry(3,async () =>{
            return await this.dbGet("/organizations_view?organization_key=eq."+organization_key,this.single());
        });
    }
    createOrganization(data){
        return this.retry(3,async () =>{
            return await this.dbAuthPost("/create_organizations_view",data,
                                    this.single(this.representation()));
        });

    }
    newOrganization(){
        return this.retry(3,async () =>{
            var record= await this.dbGet("/new_organization",this.single());
            record = record.data;
            record.organization_key=undefined;
            return record;
        });
    }
    unapprovedOrganizationStatus(country_org_id,country_code="usa"){
        return this.retry(3,async () =>{
            return await this.dbGet("/organizations_view?status=not.eq.approved&country_org_id=eq."+country_org_id+
                                        "&country_code=eq."+country_code);
        });
    }
    updateOrganization(organization_key,data){

    }
    deleteOrganization(organization_key){

    }
    organizationList(){
        return this.retry(3,async () =>{
            return this.dbGet("/organizations_view?status=eq.approved&order=display_name");
        });
    }
    organizationsNeedingReview(){
        return this.retry(3,async () =>{
            return this.dbAuthGet("/pending_organizations_view");
        });
    }
    setOrganizationApprovalStatus(organization_key,status){
        return this.retry(3,async () =>{
            return this.dbAuthPatch("/pending_organizations_view?organization_key=eq."+organization_key,
                    {status:status});
        });

    }
    insertOrganizationListener(organization_key,user_key){
        return this.retry(3,async () =>{
            return this.dbAuthPost("/organization_listeners_view?on_conflict=organization_key,user_key",
                    {organization_key: organization_key, user_key,user_key}, this.ignoreDups());
        });
    }
    selectOrganizationListeners(organization_key){
        return this.retry(3,async () =>{
            return this.dbAuthGet("/organization_users_to_notify?organization_key=eq."+organization_key);
        });

    }
    deleteOrganizationListeners(organization_key){
        return this.retry(3,async () =>{
            return this.dbAuthDelete("/organization_listeners_view?organization_key=eq."+organization_key);
        });
 
    }
    selectOrganizationsWithProfiles(){
        return this.retry(3,async () =>{
            return this.dbGet("/organizations_with_profiles?order=name");
        });

    }
 


    // possible transactions
    insertPossibleTransaction(missionary_profile_key,amount,type){
        //TODO: this may be prone to spamming, since we can't require auth here
        return this.retry(3,async () =>{
            return this.dbPost("/possible_transactions_view",
                {
                    missionary_profile_key: missionary_profile_key,
                    amount: amount,
                    donation_type: type
                }, this.minimal());
        });
    }
    confirmTransaction(possible_transaction_key){
        //TODO: need more permissions

    }

    // email hashes
    insertEmailHashMapping(emailAddress,hashedEmail){
        return this.retry(3,async()=>{
            return this.dbAuthPost("/email_hashes_view?on_conflict=email_address",{
                email_address:emailAddress,
                hashed_email_address:hashedEmail
            },this.ignoreDups());
        });
    }
    getEmailHash(hashedEmail){
        return this.retry(3,async()=>{
            return this.dbAuthGet("/email_hashes_view?hashed_email_address=eq."+hashedEmail, this.single());
        });
    }



    // MISC
    jobList(){
        return this.retry(3,async () =>{
            return this.dbGet("/job_catagories_view?order=catagory");
        });
    }
    featuredProfiles(){
        return this.retry(3,async () =>{
            return this.dbGet("/featured_profiles");
        });
    }
    tagList(){
        return this.retry(3,async () =>{
            return this.dbGet("/tags_view?order=name");
        });
    }



}
