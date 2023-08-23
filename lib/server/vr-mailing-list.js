
import axios from 'axios';

export class VRMailingList {
    constructor(key,serverURL){

        this.server = axios.create({
            baseURL: serverURL,
            timeout: 10000,
            headers: {
                "Authorization":"Bearer "+key,
                "Content-Type":"application/json",
            }
        })

    }

    async sendRequest(method,endpoint,data,parameters){
        
        console.log("sendRequest: "+endpoint+", params,data: ",parameters,data);
        try{

            const response = await this.server.request({
                method:method,
                url:endpoint,
                params:parameters,
                data: data,
            });

            console.log("vr response: ",response.status);
            return response.data;
        }catch(error){
            console.error("request to VR failed: ",error.toJSON());
            if(error.response && error.response.data && error.response.data.error){
                console.error("response: ",error.response.data.error.message);
                throw error.response.data.error.message;
            }else
                throw error.message;
        }
    }

    async createUser(email){
        console.log("creating user with email "+email);
        await this.sendRequest("POST","contacts", {email:email});
    }
    async removeUser(email){

        const user = await this.getUser(email);
        if(user != null)
            await this.sendRequest("DELETE","contacts/"+user.id );
        else
            console.error("failed to delete user with email "+email+", user not found");
    }
    async getUser(email){
        const result = await this.sendRequest("GET","contacts",null,{type:"all",email:email})
        //console.log("getUser: ",result);
        if(result.items && result.items.length == 1 && result.items[0].attributes){
            //console.log("found user: ",result.items[0].attributes);
            return result.items[0].attributes;
        }else
            throw "no user found for email "+email;
    }
    async userExists(email){
        return (await this.getUser(email)) != null;
    }
    async ensureUser(email){
        try{
            //this will throw an exception if user is not found.
            await this.getUser(email);
        }catch(error){
            console.log("ensureUser: user not found, creating one");
            await this.createUser(email)
        }
    }
    async addTags(email,tags){
        console.log("adding tags to "+email,tags);
        const user = await this.getUser(email);
        const currentTags = user.custom && user.custom["Tags"] ? user.custom["Tags"].split("|") : [];
        const allTags = new Set(tags.concat(currentTags));

        const result = await this.sendRequest("PUT","contacts/"+user.id,{
            custom:{
                "Tags":Array.from(allTags.values()).join("|")
            }
        });
        //console.log("addTags result: ",result);

        //also add user to list of same name
        tags.forEach( async tag => {
            try{
                await this.addUserToList(email,tag);
            }catch(error){
                throw error;
            }});

    }
    async addUserToList(email,listName){
        const list = await this.getList(listName);
        console.log("found list: ",list);
        const result = await this.sendRequest("POST","lists/"+list.id+"/contacts",{email:email});
        console.log("addUserToList result: ",result);
    }
    async addToGroup(email,group){
        console.error("addToGroup not implemented in VRMailingList")
    }
    async setUserName(email,firstName,lastName){
        const user = await this.getUser(email);
        const result = await this.sendRequest("PUT","contacts/"+user.id,{
            first_name:firstName,
            last_name:lastName,
        });
        //console.log("setUserName result: ",result);
    }
    async getAllMemberEmails(){
        const batchSize = 200;
        var emails = [];

        var result = await this.sendRequest("GET","contacts",null, {status:"active",limit:batchSize});
        if(result && result.items){
            emails = emails.concat( result.items.map(i => i.attributes.email));

            while(result && result.links && result.links.next && result.links.next.url){
                result = await this.sendRequest("GET",result.links.next.url);
                //console.log("getAllMemberEmails: found "+result.items.length+" members");
                emails = emails.concat( result.items.map(i => i.attributes.email));
            }
            return emails;
        }else{
            console.warn("getAllMemberEmails: no results found");
            return [];
        }
    }
    async getList(listName){
        const result = await this.sendRequest("GET","lists");
        //console.log("getList result: ",result);
        if(result != null && result.items){
            //result.items.forEach(i => console.log(i.attributes));
            const list =  result.items.find( i => i.attributes.name == listName);
            if(list != null && list.attributes)
                return list.attributes;
            else
                throw listName+" not found";
        }else{
            console.error("getList: failed get list of lists");
            throw listName+" not found";
        }
    }
    async sendCampaign(listName,content,settings){
        const list = await this.getList(listName);
        //console.log("found list: ",list);
        const emailResult = await this.sendRequest("POST","messages/emails",{
            name: settings.title,
            subject:settings.subject_line,
            from_label: settings.from_name,
            reply_to: settings.reply_to,
            message: content,
        });
        //console.log("sendCampaign create email result: ",emailResult);

        if(emailResult != null && emailResult.url){
            const sendResult = await this.sendRequest("POST",emailResult.url,{list_ids:[String(list.id)]});
            // for testing //const sendResult = await this.sendRequest("POST",emailResult.url+"/test",{recipients:["kevin.horan@ergatas.org"]});
            //console.log("sendCampaign send email result: ",sendResult);
        }else
            throw "failed to create campaign email for "+listName;

    }
}