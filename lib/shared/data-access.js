import {AppError} from '../server/app-error.js';

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
        this.read_only = process.env.MAINTENANCE_MODE==="true";
    }
    toString(){
        return "DataAccess Object";
    }
    dbRequest(type,url,data,extraHeaders){
        var headers = {};
        if(extraHeaders != null)
            headers = extraHeaders;
    
        headers['Content-Type']= "application/json";

        const requestData={
            method: type,
            url: this.baseUrl+url,
            data: data == null ? "" : JSON.stringify(data),
            headers: headers,
        };
        //console.log("db request data: ",requestData);
        return this.ajax(requestData);
    }
    setToken(token){
        this.token=token;
    }
    isAuthenticated(){
        return this.token !== undefined;
    }
    ensureNotReadOnly(allowOnReadOnly=false){
        //console.log("read only state: "+this.read_only);
        if(this.read_only && ! allowOnReadOnly)
            throw AppError("No changes allowed in Maintenance Mode");
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
    dbPost(url,data,headers,allowOnReadOnly){
        this.ensureNotReadOnly(allowOnReadOnly);
        return this.dbRequest("post",url,data,headers);
    }
    dbAuthPost(url,data,headers){
        this.ensureNotReadOnly();
        this.ensureAuthenticated("authentication required");
        return this.dbRequest("post",url,data,this.auth(headers));
    }
    dbPatch(url,data,headers){
        this.ensureNotReadOnly();
        return this.dbRequest("patch",url,data,headers);
    }
    dbAuthPatch(url,data,headers){
        this.ensureNotReadOnly();
        this.ensureAuthenticated("authentication required");
        return this.dbRequest("patch",url,data,this.auth(headers));
    }
    dbAuthDelete(url,data,headers){
        this.ensureNotReadOnly();
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
        this.appendHeader(headers,"Prefer","return=minimal");
        return headers;
    }
    //return full object after insert/update
    representation(headers){
        headers = headers || {};
        this.appendHeader(headers,"Prefer","return=representation");
        return headers;
    }
    ignoreDups(headers){
        headers = headers || {};
        this.appendHeader(headers,"Prefer","resolution=ignore-duplicates");
        return headers;
    }
    setRange(headers,range){
        headers = headers || {};
        if(range != null){
            headers["Range-Unit"]="items";
            headers["Range"]=range;
            this.appendHeader(headers,"Prefer","count=estimated");
        }
        return headers;
    }
    appendHeader(headers,field,content){
        if(headers[field]!=null)
            headers[field]=headers[field]+", "+content;
        else
            headers[field]=content;
    }

    // the 'single" modifier throws an error if 0 results are returned, so this
    // is an alternative to use when 0 or 1 is acceptable. return null for 0 results.
    singleOrNone(result){
        //console.log("singleOrNone called with result: ",result);
        if(result != null && result.length == 1)
            return result[0];
        else if(typeof result === 'object' && Object.keys(result).length > 0)
            return result;
        else if(result.length === 0 || Object.keys(result).length === 0)
            return null;
        else
            throw new AppError("multiple results returned for when only 1 or 0 where expected. "+JSON.stringify(result));
    }

    async retry(numRetries,f,error){
        //console.log("running function with retries. "+numRetries+" left");
        var self=this;
        if(numRetries <= 0){
            console.error("operation failed after retries: "+error.message);
            if(error.response && error.response.data)
                throw error.response.data;
            else
                throw error;
        }
        try{
            return await f();
        }catch(error){
            if(error.status === 401 && this.refreshAuth != null){
                console.info("db: got 401 error, refreshing auth");
                await this.refreshAuth();
            }else if(error.status >= 400 && error.status < 500){
                //don't retry for 400 series errors
                throw error;
            }else
                console.warn("function failed, "+(numRetries-1)+" tries remaining. "+error.message);
                console.log("error: ",error);
            
            return await self.retry(numRetries - 1, f,error);
        }
    }
    async dbReady(){
        return this.retry(300,async () =>{
            return this.dbGet("/tags_view?order=name");
        });
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
            //cannot use single here as error is thrown when no result is found
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
    /*
    getAllUsers(){ //not used
        return this.retry(3,async () =>{
            return await this.dbAuthGet("/user_info");
        });
    }
    //user_info has permission for ergatas_server to query
    getUserInfoByKey(user_key){ //not used
        return this.retry(3,async () =>{
            return await this.dbAuthGet("/user_info?user_key=eq."+user_key,this.single());
        });
    }
    getUsersWithDonation(start,end){ //not used
        var pgDate = d => d.toLocaleString('en-US',{year:'numeric',month:'long',day:'numeric'});

        return this.retry(3,async () =>{
            return await this.dbAuthGet(`/user_info?last_possible_tx_date=gte.${pgDate(start)}&last_possible_tx_date=lte.${pgDate(end)}`);
        });
    }
    */
    getUserInfoByUserId(userId){
        return this.retry(3,async () =>{
            return await this.dbAuthGet("/user_info?external_user_id=eq."+userId,this.single());
        });
    }
   getUsersWithoutEntities(user_key){ //used for user cleanup only
        return this.retry(3,async () =>{
            return await this.dbAuthGet("/user_info?has_profile=eq.false&has_saved_search=eq.false");
        });
    }
    updateUser(user_key,data){
        //these fields are read-only, so must be removed before an update is attempted
        delete data.has_profile;
        delete data.has_saved_search;
        delete data.is_org_admin;
        return this.retry(3,async () =>{
            return await this.dbAuthPatch("/users_view?user_key=eq."+user_key,
                                    data,this.single(this.representation()));
        });
    }
    deleteUser(userId){
        const self=this;
        
        return this.retry(3,async () =>{
            return await this.dbAuthDelete("/users_view?external_user_id=eq."+userId,
                                    this.single(this.representation()));
        });
    }
    /// Profiles
    createProfile(data){
        return this.retry(3,async () =>{
            return await this.dbAuthPost("/missionary_profiles_view",data,
                                    this.single(this.representation()));
        });
    }

    getUserForPrayerCardDrawing(){
        return this.retry(3,async () =>{
            return await this.dbGet("/random_profiles?select=external_user_id,user_key,data->>first_name"+
                                    "&data->>prayer_card_drawing=eq.true&limit=1",
                this.single());
        });
    }


    getAllProfileKeys(){
        return this.retry(3,async () =>{
            return await this.dbGet("/profile_search?select=missionary_profile_key");
        });
    }
    getAllProfileSummaries(){
        return this.retry(3,async () =>{
            return await this.dbGet("/profile_search?select="+
                "missionary_profile_key,user_key,created_on,data->>donate_instructions,data->>donation_url,profile_slug");
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
            var profileResults = await  this.dbAuthGet("/missionary_profiles_view?missionary_profile_key=eq."+missionary_profile_key,
                                                this.single());
            if(profileResults != null)
                return this.updateProfileFields(profileResults);
            else
                throw new AppError("no profile found with user_key "+user_key);
        });
    }
    profileExists(missionary_profile_key){
        return this.retry(3,async () =>{
            var profileCount = await  this.dbGet("/profile_search?missionary_profile_key=eq."+missionary_profile_key+"&select=count()",
                                                this.single());
            //console.log("profileExists check result: ",profileCount);
            if(profileCount != null && profileCount.count != null && parseInt(profileCount.count) > 0)
                return true;
            else
                return false;
        });
    }   
    getDisplayProfileByKey(missionary_profile_key){
        return this.retry(3,async () =>{
            var profileResults = await  this.dbGet("/profile_search?missionary_profile_key=eq."+missionary_profile_key,
                                                    this.single());
            if(profileResults != null)
                return this.updateProfileFields(profileResults);
            else
                throw new AppError("no profile found with user_key "+user_key);
        });
    }
    getProfileBySlug(slug){
        return this.retry(3,async () =>{
            var profileResults = await  this.dbGet("/profile_search?profile_slug=eq."+slug,
                                                    this.single());
            if(profileResults != null)
                return this.updateProfileFields(profileResults);
            else
                throw new AppError("no profile found with slug "+slug);
        });
    }
    profileSlugExists(slug, excludeMissionaryProfileKey){
        return this.retry(3,async () =>{
            var query = "/all_profile_search?profile_slug=eq."+slug;
            if(excludeMissionaryProfileKey != null){
                query += "&missionary_profile_key=neq."+excludeMissionaryProfileKey;
            }
            var results = await this.dbAuthGet(query);
            return results != null && results.length > 0;
        });
    }
 
    getDisplayProfilePreviewByKey(missionary_profile_key){
        return this.retry(3,async () =>{
            var profileResults = await  this.dbAuthGet("/all_profile_search?missionary_profile_key=eq."+missionary_profile_key,
                                                this.single());
            if(profileResults != null)
                return this.updateProfileFields(profileResults);
            else
                throw new AppError("no profile found with user_key "+user_key);
        });
    }
    
    getDisplayProfilesByKey(missionary_profile_keys){

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
        var data;
        var initEmptyString=["country","donate_instructions","country_code","marital_status","video_url",
                                "search_terms"];
        var initEmptyArray=["impact_countries","tag_keys","kids_birth_years","cause_keys","people_id3_codes",
                             "rol3_codes"];
        //console.log("pre-updated profile: ",profile);
        if(Array.isArray(profile)){ // update each element of array
            return profile.map( p => self.updateProfileFields(p))
        }else{ //update this profile
            data = profile.data;

            initEmptyString.forEach( f => {
                if(data[f] == null) 
                    data[f] = "";
            } );
            initEmptyArray.forEach( f => {
                if(data[f] == null) 
                    data[f] = [];
            } );

            if(data.movement_stage == null)
                data.movement_stage= -1;
                
            if(data.limit_social_media == null)
                data.limit_social_media = false;
            
            if(data.on_site_donation == null)
                data.on_site_donation = true;
            
            if(data.use_mpk_prefix == null)
                data.use_mpk_prefix = false;

            if(data.donations_enabled == null)
                data.donations_enabled = true;

        }
        //console.log("updated profile: ",profile);
        return profile;

    }

    updateNonProfitFields(nonProfit){
        var self=this;
        var data;
        //console.log("pre-updated nonProfit: ",nonProfit);

        if(Array.isArray(nonProfit)){ // update each element of array
            return nonProfit.map( o => self.updateNonProfitFields(o))
        }else{ //update this nonProfit
            if(nonProfit.donation_settings == null)
                nonProfit.donation_settings = {};

            data = nonProfit.donation_settings;

            if(data.address_field_status == null)
                data.address_field_status = "optional";

            if(data.phone_field_status == null)
                data.phone_field_status = "hidden";

            if(data.send_receipt == null)
                data.send_receipt = true;

        }
        return nonProfit
    }
    newProfile(){
        return this.retry(3,async () =>{
            var record= await this.dbGet("/new_missionary_profile",this.single());
            return {
                data:record.data,
                user_key:undefined,
                missionary_profile_key:undefined,
                profile_slug: null,
            };
        });
    }
    updateProfile(missionary_profile_key,data){
        //ensure data types
        data.data.current_support_percentage = parseFloat(data.data.current_support_percentage) || 0;
        console.log("saving updated profile to profile key "+missionary_profile_key,data);
        return this.retry(3,async () =>{
            return await this.dbAuthPatch("/missionary_profiles_view?missionary_profile_key=eq."+missionary_profile_key,
                                    data,this.single(this.representation()));
        });
    }
    deleteProfile(missionary_profile_key){
        if(missionary_profile_key == null || missionary_profile_key === ""){
            console.log("bad key given to deleteProfile: "+missionary_profile_key);
            return;
        }
        return this.retry(3,async () =>{
            return await this.dbAuthDelete("/missionary_profiles_view?missionary_profile_key=eq."+missionary_profile_key,
                                    this.single(this.representation()));
        });
    }
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
        return this.retry(3,async () =>{
            if(all_profiles)
                return this.dbAuthPost(url,finalParams);
            else
                return this.dbPost(url,finalParams,null,true);
        });
    }
    profilesByLastUpdate(lastUpdatedBefore){
        // excludes profiles at 100% support
        return this.retry(3, async ()=>{
            return await this.dbAuthGet("/profile_statuses?current_support_percentage=lt.100&last_updated_on=lt."+lastUpdatedBefore)
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
            var data = await this.dbGet("/non_profit_and_organizations_view?organization_key=eq."+organization_key,this.single());
            return this.updateNonProfitFields(data);

        });
    }
    getPlainOrganization(organization_key){
        return this.retry(3,async () =>{
            return await this.dbGet("/organizations_view?organization_key=eq."+organization_key,this.single());
        });
    }
    getNonProfit(non_profit_key){
        return this.retry(3,async () =>{
            var data = await this.dbAuthGet("/non_profits_view?non_profit_key=eq."+non_profit_key,this.single());
            return this.updateNonProfitFields(data);
        });
    }
    getOrganizationBySlug(slug){
        return this.retry(3,async () =>{
            var data = await this.dbGet("/non_profit_and_organizations_view?slug=eq."+slug,this.single());
            return this.updateNonProfitFields(data);
        });
    }
    createNonProfitOrganization(data){
        return this.retry(3,async () =>{
            return await this.dbAuthPost("/non_profit_and_organizations_view",data,
                                    this.single(this.representation()));
        });

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
    unapprovedOrganizationStatus(country_org_id,country_code="usa"){
        return this.retry(3,async () =>{
            return await this.dbGet("/non_profit_and_organizations_view?status=not.eq.approved&country_org_id=eq."+country_org_id+
                                        "&country_code=eq."+country_code);
        });
    }
    updateOrganization(organization_key,data){
        return this.retry(3, async ()=>{
            return await this.dbAuthPatch("/organizations_view?organization_key=eq."+organization_key,
                data);
        });
    }
    updateNonProfit(non_profit_key,data){
        return this.retry(3, async ()=>{
            return await this.dbAuthPatch("/non_profits_view?non_profit_key=eq."+non_profit_key,
                data);
        });
    }
    
    deleteOrganization(organization_key){

    }
    organizationList(){
        return this.retry(3,async () =>{
            return this.dbGet("/non_profit_and_organizations_view?status=eq.approved&order=display_name");
        });
    }
    allOrganizations(){
        return this.retry(3,async () =>{
            return this.dbGet("/organizations_view?order=name");
        });
    }
    sendingOrganizationList(){
        return this.retry(3,async () =>{
            return this.dbGet("/non_profit_and_organizations_view?status=eq.approved&is_sending_org=eq.true&order=display_name");
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
    insertPossibleTransaction(missionary_profile_key,amount,type,stripe_id,confirmed,donor_key){
        return this.retry(3,async () =>{
            if(stripe_id == null)
                return this.dbPost("/possible_transactions_view",
                    {
                        missionary_profile_key: missionary_profile_key,
                        amount: amount,
                        donation_type: type,
                    }, this.minimal());
            else
                return this.dbAuthPost("/possible_transactions_view",
                    {
                        missionary_profile_key: missionary_profile_key,
                        amount: amount,
                        donation_type: type,
                        stripe_id: stripe_id,
                        donor_key: donor_key,
                        confirmed:confirmed,
                    },this.single(this.representation()));

        });
    }
    getPossibleTransaction(possible_transaction_key){
        return this.retry(3,async () =>{
            return this.dbAuthGet("/possible_transactions_view?possible_transaction_key=eq."+possible_transaction_key,
                this.single());
        });
    }
    getPossibleTransactionByStripeId(stripe_id){
        return this.retry(3,async () =>{
            return this.singleOrNone(await this.dbAuthGet("/possible_transactions_view?stripe_id=eq."+stripe_id));
        });
    }
    updatePossibleTransaction(possible_transaction_key,data){
        return this.retry(3,async () =>{
            return this.dbAuthPatch("/possible_transactions_view?possible_transaction_key=eq."+possible_transaction_key, data);
        });
    }
    confirmTransaction(possible_transaction_key){
        //TODO: need more permissions

    }
    getAllStripeTransactions(){
        return this.retry(3,async () =>{
            return this.dbAuthGet("/donations_view?stripe_id=not.is.null");
        });
    }
    getWorkerTransaction(possible_transaction_key){
        //like getPossibleTransaction, but ensures logged in user has permission on this tx
        return this.retry(3,async () =>{
            return this.dbAuthGet("/workers_donations?possible_transaction_key=eq."+possible_transaction_key);
        });
    }
    getWorkerTransactions(){
        return this.retry(3,async () =>{
            // this view only shows records that belong to logged in user. so don't need to filter.
            return this.dbAuthGet("/workers_donations");
        });
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

    getDonors(){
        return this.retry(3,async()=>{
            return this.dbAuthGet("/donors_view");
        });
    }
    getDonor(donor_key){
        return this.retry(3,async()=>{
            return this.dbAuthGet("/donors_view?donor_key=eq."+donor_key, this.single());
        });
    }
    getDonorByCustomerId(stripe_customer_id){
        return this.retry(3,async()=>{
            return this.singleOrNone(await this.dbAuthGet("/donors_view?stripe_customer_id=eq."+stripe_customer_id));
        });
    }
    insertDonor(donor){
        return this.retry(3,async()=>{
            return this.dbAuthPost("/donors_view",donor,
                    this.single(this.representation()));
        });
    }
    updateDonor(donor_key,donor){
        return this.retry(3,async()=>{
            return this.dbAuthPatch("/donors_view?donor_key=eq."+donor_key,donor);
        });
    }

    // push subscriptions

    getPushSubscriptions(lists){
        var query="";
        if(lists.indexOf("daily_prayer_list") !== -1)
          query = query+"daily_prayer_list=eq.true&";

        if(query === "")
         return [];

        return this.retry(3,async()=>{
            return this.dbAuthGet("/push_subs_view?"+query);
        });
    }
    getPushSubscription(push_subscription_key){
        return this.retry(3,async()=>{
            return this.dbAuthGet("/push_subs_view?push_subscription_key=eq."+push_subscription_key,
                                    this.single());
        });
    }

    insertPushSubscription(subscription,lists){
       var data = {
          endpoint: subscription.endpoint,
          subscription: subscription
       };
       console.info("sub lists: ",lists);
       lists = lists || [];
       lists.forEach(list => data[list]=true);

       console.info("data: ",data);

       return this.retry(3,async()=>{
            return this.dbAuthPost("/push_subs_view?on_conflict=endpoint",
                                   data,this.ignoreDups());
        });
    }
    /**
     * listStates: object where keys are list names, and values are true or * false
     */
    updatePushSubscription(subscription,listStates){
       return this.retry(3,async () =>{
            return await this.dbAuthPatch("/push_subs_view?endpoint=eq."+subscription.endpoint,
                                    listStates,this.single(this.representation()));
        });
    }
    deletePushSubscription(subscription){
       return this.retry(3,async () =>{
            return await this.dbAuthDelete("/push_subs_view?endpoint=eq."+subscription.endpoint,
                                    this.single(this.representation()));
        });
    }

    // Message Queue
    insertMessage(external_user_id,fromEmail,name, message){
     return this.retry(3,async () =>{
            return this.dbAuthPost("/message_queue_view",
                    {
                       external_user_id: external_user_id,
                       from_name: name,
                       from_email: fromEmail,
                       message: message
                    });
        });
    }
    getMessage(message_queue_key){
        return this.retry(3,async () =>{
            return this.dbAuthGet("/message_queue_view?message_queue_key=eq."+message_queue_key,this.single());
        });
    }
    getAllMessages(){
        return this.retry(3,async () =>{
            return this.dbAuthGet("/message_queue_view?order=created_on");
        });
    }
    deleteMessage(message_queue_key){
        return this.retry(3,async () =>{
            return this.dbAuthDelete("/message_queue_view?message_queue_key=eq."+message_queue_key);
        });
    }

    // SAVED SEARCHES
    createSavedSearch(user_key,data){
        return this.retry(3,async () =>{
            return await this.dbAuthPost("/saved_searches_view",{
                                            user_key: user_key,
                                            data: data
                                        }, this.single(this.representation()));
        });
    }
    getSavedSearchesByUser(user_key){
        return this.retry(3,async () =>{
            return await  this.dbAuthGet("/saved_searches_view?order=created_on&user_key=eq."+user_key);
        });
    }
    getSavedSearchesByKey(saved_search_key){
        return this.retry(3,async () =>{
            return await  this.dbAuthGet("/saved_searches_view?saved_search_key=eq."+saved_search_key);
        });
    }
    getSavedSearchesByName(user_key,name){
        return this.retry(3,async () =>{
            return await  this.dbAuthGet("/saved_searches_view?limit=1&and=(user_key.eq."+user_key+",data->>name.eq."+name+")",this.single());

                //"or=(data->>limit_social_media.eq.false,data->>limit_social_media.is.null)",this.single());
        });
    }

    updateSavedSearch(saved_search_key,data){
        return this.retry(3,async () =>{
            return await this.dbAuthPatch("/saved_searches_view?saved_search_key=eq."+saved_search_key,
                                    {data:data}, this.single(this.representation()));
        });
    }
    deleteSavedSearch(saved_search_key){
        return this.retry(3,async () =>{
            return await this.dbAuthDelete("/saved_searches_view?saved_search_key=eq."+saved_search_key,
                                    this.single(this.representation()));
        });
    }

    getPublicSearch(name){
        return this.retry(3,async () =>{
            return await  this.dbGet("/public_searches_view?limit=1&search_name=eq."+name,this.single());
        });
    }
    getPublicSearches(){
        return this.retry(3,async () =>{
            return await  this.dbGet("/public_searches_view");
        });
    }
    createPublicSearch(name,data){
        if(data.name != null)
            delete data.name;

        return this.retry(3,async () =>{
            return await this.dbAuthPost("/manage_public_searches?on_conflict=search_name",{
                                            search_name: name,
                                            data: data
                                        }, this.single(this.representation(this.ignoreDups())));
        });
    }
    //TODO: this is not working yet.
    deletePublicSearch(public_search_key){
        return this.retry(3,async () =>{
            return await this.dbAuthDelete("/manage_public_searches?public_search_key=eq."+public_search_key,
                                    this.single(this.representation()));
        });
    }

    // Pages
    getPageBySlug(slug){
        return this.retry(3,async () =>{
            return this.dbGet("/pages_view?slug=eq."+slug,this.single());
        });
    }
    getPageByKey(page_key){
        return this.retry(3,async () =>{
            return this.dbGet("/pages_view?page_key=eq."+page_key,this.single());
        });
    }
    getPages(){
        return this.retry(3,async () =>{
            return this.dbGet("/pages_view?order=slug");
        });
    }
    getPageSlugs(){
        return this.retry(3,async () =>{
            return this.dbGet("/pages_view?select=page_key,slug");
        });
    }
    createPage(slug,data){
        return this.retry(3,async () =>{
            return await this.dbAuthPost("/pages_view?on_conflict=slug",{
                                            slug: slug,
                                            data: data
                                        //}, this.single(this.representation(this.ignoreDups())));
                                        }, this.ignoreDups());
        });
    }
    updatePage(page_key,data){
        return this.retry(3,async () =>{
            return await this.dbAuthPatch("/pages_view?page_key=eq."+page_key,
                                    {data:data}, this.single(this.representation()));
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
        return this.retry(3,async () =>{
            return await this.dbAuthPatch("/pages_view?page_key=eq."+page_key,
                                    {slug: slug, data: data}, this.single(this.representation()));
        });
    }
    deletePage(page_key){
        return this.retry(3,async () =>{
            return await this.dbAuthDelete("/pages_view?page_key=eq."+page_key,
                                    this.single(this.representation()));
        });
    }



    //profiles permissions
    getUserProfilePermissions(user_key){
        return this.retry(3,async () =>{
            return await  this.dbGet("/user_profile_permissions_view?user_key=eq."+user_key,
                                    this.single(this.representation()));
        });
    }
    insertUserProfilePermissions(user_key,organization_key, read_only){
        return this.retry(3,async () =>{
            return await  this.dbAuthPost("/user_profile_permissions_view",
                                    {
                                        user_key:user_key,
                                        organization_key:organization_key,
                                        read_only: read_only,
                                    }, this.single(this.representation()));
        });
    }
    getUserOrgSearchFilter(userId){
        return this.retry(3,async () =>{
            return this.singleOrNone(await  this.dbAuthGet("/user_org_search_filters?external_user_id=eq."+userId));
            //const result = await  this.dbAuthGet("/user_org_search_filters?external_user_id=eq."+userId);
        });
    }
    updateUserOrgSearchFilter(userId,data){
        return this.retry(3,async () =>{
            return await  this.dbAuthPatch("/user_org_search_filters?external_user_id=eq."+userId,
                                    data);
                                    //data,this.single(this.representation()));
        });
    }
    clearUserPermissionCache(user_key){
        return this.retry(3,async () =>{
            return await this.dbAuthDelete("/cached_user_permissions_view?user_key=eq."+user_key,
                                    this.single(this.representation()));
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
        return this.retry(3,async () =>{
            return this.dbAuthPost("/cached_user_permissions_view", data);
        });
    }


    insertProfileInvitation(created_by_external_user_id,missionary_profile_key,email){
        return this.retry(3,async () =>{
            return await  this.dbAuthPost("/profile_invitations_view?on_conflict=missionary_profile_key",{
                missionary_profile_key:missionary_profile_key,
                email:email,
                created_by_external_user_id: created_by_external_user_id,
            },this.ignoreDups());
        });
    }
    deleteProfileInvitation(profile_invitation_key){
        return this.retry(3,async () =>{
            return await this.dbAuthDelete("/profile_invitations_view?profile_invitation_key=eq."+profile_invitation_key);
        });
    }
    getProfileInvitations(){
        return this.retry(3,async () =>{
            return this.singleOrNone(await  this.dbAuthGet("/profile_invitations_view"));
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
            //return this.dbGet("/featured_profiles");
            return this.dbGet("/random_profiles?limit=3");
        });
    }
    randomSharableProfile(){
        return this.retry(3,async () =>{
            // return 1 random profile where limit_social_media is either false or not set
            return this.dbGet("/random_profiles?limit=1&"+
                "or=(data->>limit_social_media.eq.false,data->>limit_social_media.is.null)",this.single());
        });
    }
    tagList(){
        return this.retry(3,async () =>{
            return this.dbGet("/tags_view?order=name");
        });
    }
    causeList(){
        return this.retry(3,async () =>{
            return this.dbGet("/causes_view?order=cause");
        });
    }
    causeCounts(){
        return this.retry(3,async () =>{
            return this.dbGet("/cause_counts_view");
        });
    }
    jobCounts(){
        return this.retry(3,async () =>{
            return this.dbGet("/job_counts_view");
        });
    }
    tagCounts(){
        return this.retry(3,async () =>{
            return this.dbGet("/tag_counts_view");
        });
    }

    peopleGroupsWithWorkers(){
        return this.retry(3,async () =>{
            return this.dbGet("/people_groups_with_workers");
        });
    }
    countriesWithWorkers(){
        return this.retry(3,async () =>{
            return this.dbGet("/countries_with_workers");
        });
    }




}
