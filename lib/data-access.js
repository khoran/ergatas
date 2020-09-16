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
        this._url=url+"?";
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

    constructor(postgrestBase,ajaxFn){

        //this.db= new postgrestClient.default(postgrestBase);
        this.baseUrl = postgrestBase;
        this.token=undefined; 
        this.ajax = ajaxFn;
    }
    dbRequest(type,url,data,extraHeaders){
        var headers = {};
        if(extraHeaders != null)
            headers = extraHeaders;
    
        //headers['Authorization']= "Bearer "+self.token;
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
        //return this.db.get(url);
        return this.dbRequest("get",url,null,headers);
    }
    dbAuthGet(url,headers){
        this.ensureAuthenticated("authentication required");
        //return this.dbGet(url).auth(this.token);
        return this.dbRequest("get",url,null,this.auth(headers));
    }
    dbPost(url,data,headers){
        //return this.db.post(url);
        return this.dbRequest("post",url,data,headers);
    }
    dbAuthPost(url,data,headers){
        this.ensureAuthenticated("authentication required");
        return this.dbRequest("post",url,data,this.auth(headers));
        //return this.dbPost(url).auth(this.token);
    }
    dbPatch(url,data,headers){
        //return this.db.patch(url);
        return this.dbRequest("patch",url,data,headers);
    }
    dbAuthPatch(url,data,headers){
        this.ensureAuthenticated("authentication required");
        return this.dbRequest("patch",url,data,this.auth(headers));
        //return this.dbPatch(url).auth(this.token);
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
                throw new AppError("no user found with email "+email);
            });
    }
    updateUser(user_key,userId){

    }
    deleteUser(user_key){
        const self=this;
        return jQuery.ajax({
            method: "DELETE",
            url: self.baseUrl+"/users_view?user_key=eq."+user_key,
            headers:{
                "Authorization": "Bearer "+self.token
            }
        })
    }
    /// Profiles
    createProfile(data){
        //TODO: make this idempotent. need a secondary key
        return this.retry(3,async () =>{
            return await this.dbAuthPost("/missionary_profiles_view",data,
                                    this.single(this.representation()));
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
    //when fields are added or removed fromo the JSON schema, 
    // apply the update here by adding or removing the required feilds
    updateProfileFields(profile){
        var self=this;
        if(Array.isArray(profile)){ // update each element of array
            return profile.map( p => self.updateProfileFields(p))
        }else{ //update this profile
            if(profile.data.country == null)
                profile.data.country="";
            if(profile.data.donate_instructions == null)
                profile.data.donate_instructions="";

        }
        console.log("updated profile: ",profile);
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
    profileSearch(filters){

        var url = "/profile_search";
        var context = new UrlContext(url);
        var filter;
        for( var i in filters){
            filter = filters[i];
            //console.log("filter: ",filter);
            //console.log("considering filter with value: "+filter.obs(),filter.isDefined());
            if(filter.isDefined())
                filter.addToQuery(context);
        }
        return this.retry(3,async () =>{
            return this.dbGet(context.url);
        });


    }
    profileSearchByArea(c1_lat,c1_long,c2_lat,c2_long){
        return this.retry(3,async () =>{
            return (await this.dbGet("/rpc/profile_in_box?"+
                                "ne_lat="+c1_lat+"&"+
                                "ne_long="+c1_long+"&"+
                                "sw_lat="+c2_lat+"&"+
                                "sw_long="+c2_long)).
                            map(obj => obj.profile_in_box);

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

    }
    createOrganization(data){
        return this.retry(3,async () =>{
            return await this.dbAuthPost("/organizations_view",data,
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
    organizationStatus(ein){
        return this.retry(3,async () =>{
            return await this.dbGet("/unapproved_organizations_view?ein=eq."+ein);
        });
    }
    updateOrganization(organization_key,data){

    }
    deleteOrganization(organization_key){

    }
    organizationList(){
        return this.retry(3,async () =>{
            return this.dbGet("/organizations_view");
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



}
