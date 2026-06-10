import {AppError} from '../../server/app-error.js';

// Low-level PostgREST transport. Holds the auth token, the ajax fn, and the
// read-only / auth gates. This class is held privately by the DataAccess facade
// (#client) and injected into the domain repos — application code never sees it.
export class PostgrestClient {

    /**
     * @param {baseURL for postgrest requests} postgrestBase
     * @param {a function compatible with jQuery.ajax} ajaxFn
     */
    constructor(postgrestBase,ajaxFn,refreshAuthFn){
        this.baseUrl = postgrestBase;
        this.token=undefined;
        this.ajax = ajaxFn;
        this.refreshAuth = refreshAuthFn;
        this.read_only = process.env.MAINTENANCE_MODE==="true";
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
    auth(headers){
        headers = headers || {};
        headers['Authorization']= "Bearer "+this.token;
        return headers;
    }
    get(url,headers){
        return this.dbRequest("get",url,null,headers);
    }
    authGet(url,headers){
        this.ensureAuthenticated("authentication required");
        return this.dbRequest("get",url,null,this.auth(headers));
    }
    post(url,data,headers,allowOnReadOnly){
        this.ensureNotReadOnly(allowOnReadOnly);
        return this.dbRequest("post",url,data,headers);
    }
    authPost(url,data,headers){
        this.ensureNotReadOnly();
        this.ensureAuthenticated("authentication required");
        return this.dbRequest("post",url,data,this.auth(headers));
    }
    patch(url,data,headers){
        this.ensureNotReadOnly();
        return this.dbRequest("patch",url,data,headers);
    }
    authPatch(url,data,headers){
        this.ensureNotReadOnly();
        this.ensureAuthenticated("authentication required");
        return this.dbRequest("patch",url,data,this.auth(headers));
    }
    authDelete(url,data,headers){
        this.ensureNotReadOnly();
        this.ensureAuthenticated("authentication required");
        return this.dbRequest("delete",url,data,this.auth(headers));
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
            return this.get("/tags_view?order=name");
        });
    }
}
