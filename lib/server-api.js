import alertify from "alertifyjs";

export class ServerAPI{
    constructor(){
        this.token = ko.observable();

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
                        self.token(result.access_token);
                        return result;
                    }).catch((error)=>{
                        console.warn("failed to refresh token: "+error.responseText);
                        //alertify.error("You're session has expired, please login again");
                        throw error;
                    });
    }

}