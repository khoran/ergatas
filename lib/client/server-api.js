
export class ServerAPI{
    constructor(){
        this.token = ko.observable();
        this.recaptchaSiteKey = process.env.GOOGLE_RECAPTCHA_SITE_KEY;
    }
    toString(){
        return "ServerAPI Object";
    }
    postJson(url,data){
        return jQuery.ajax(url,{
            type: "POST",
            contentType: "application/json",
            data:JSON.stringify(data),
            dataType:"json",
        });

        //return this.postJson(url,data);
    }
    authPostJson(url,data,noRefresh){
        console.log("authPostJson: "+url+" noRefresh? ",noRefresh);
        const self= this;

        if(data == null)
            data={};
        data.token = self.token();

        return self.postJson(url,data).
            catch((error) =>{
                //check noRefresh to prevent cycles
                if(noRefresh !== true && error.status === 401){
                    console.log("post to "+url+" failed with 401, refreshing token to try again")
                    return self.refreshToken().
                        then(() => self.authPostJson(url,data,true));
                }else
                    throw error;
            });
    }
    refreshToken(){
        const self=this;
        return self.postJson("/api/refresh").
                    then((result) =>{
                        if(result == null || result.access_token == null){
                            //server returns 200 + noSession for anonymous visitors (avoids a
                            // console-logged 401 on every page load); treat it as a failed refresh
                            throw new Error((result && result.message) || "no session");
                        }
                        self.token(result.access_token);
                        return result;
                    }).catch((error)=>{
                        console.info("failed to refresh token: "+
                            ((error.responseJSON && error.responseJSON.message) || error.message || error.responseText));
                        throw error;
                    });
    }
    sendRecaptcha(action){
        const self=this;
        if(window.grecaptcha == null){ // not loaded yet
            console.warn("skipping recaptcha check as not loaded yet");
            return;
        }
        return new Promise((resolve,reject) =>{
            grecaptcha.ready(async function() {
                try{
                    const token = await grecaptcha.execute(self.recaptchaSiteKey, {action: action});
                    const result =  await self.postJson("/api/recaptcha",{ recaptchaToken:token,action:action });
                    console.info("recaptcha score for "+action+": "+result.score);
                    resolve(result.score);
                }catch(error){
                    reject(error);
                }
            });
        });
    }
}