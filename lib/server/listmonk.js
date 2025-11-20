import axios from 'axios';
import { AppError } from './app-error.js';

export class ListMonk{
    constructor(username,password,serverURL){
        this.server = axios.create({
            baseURL: serverURL,
            timeout: 10000,
            auth:{
                username: username,
                password: password
            },
            headers: {
                "Content-Type":"application/json",
            }
        })
        this.templates={};

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

            console.log("listmonk response: ",response.status);
            return response.data;
        }catch(error){
            console.error("request to listmonk failed: ",error.toJSON());
            if(error.response && error.response.data && error.response.data.error){
                console.error("response: ",error.response.data.error.message);
                throw error.response.data.error.message;
            }else
                throw error.message;
        }
    }

    async createUser(email){
        console.log("creating user with email "+email);
        await this.sendRequest("POST","/api/subscribers", {email:email});
    }
    async removeUser(email){

        const user = await this.getUser(email);
        if(user != null)
            await this.sendRequest("DELETE","/api/subscribers/"+user.id );
        else
            console.error("failed to delete user with email "+email+", user not found");
    }
    async getUser(email){
        console.log("looking for user "+email);
        const result = await this.sendRequest("GET","/api/subscribers",null,
            {query:`subscribers.email='${email}'`});
        //console.log("getUser: ",result);
        if(result.data && result.data.results 
            && result.data.results.length == 1 ){
            console.log("found user: ",result.data.results[0]);
            return result.data.results[0];
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
    async updateUser(user){
        console.log("updating user: ",user);
        const result = await this.sendRequest("PUT","/api/subscribers/"+user.id,
            {
                email: user.email,
                name: user.name,
                status: user.status,
                lists: user.lists.map(l=>l.id),
                attribs: user.attribs,
                preconfirm_subscriptions: true

            });
        //console.log("updateUser result: ",result);
    }
    async addTags(email,tags){
        console.log("adding tags to "+email,tags);
        const user = await this.getUser(email);

        user.attribs.tags = Array.from(new Set(tags.concat(user.attribs.tags || [])));

        await this.updateUser(user);

        //also add user to list of same name
        await this.addUserToLists(email,user.attribs.tags);
    }
   async addToGroup(email,group){
        console.error("addToGroup not implemented in listmonk")
    }
    async setUserName(email,firstName,lastName){
        const user = await this.getUser(email);
        user.name = `${firstName} ${lastName}`;
        user.attribs.first_name = firstName;
        user.attribs.last_name = lastName;
        await this.updateUser(user);
    }
    // UPDATE LATER
    async getAllMemberEmails(){
        return null;


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
        const result = await this.sendRequest("GET","/api/lists");
        console.log("getList result: ",result);
        if(result != null && result.data && result.data.results){
            //result.items.forEach(i => console.log(i.attributes));
            const list =  result.data.results.find( i => i.name == listName);
            if(list != null )
                return list;
            else
                throw listName+" not found";
        }else{
            console.error("getList: failed get list of lists");
            throw listName+" not found";
        }
    }
     async addUserToLists(email,listNames){
        try{
            const lists = await Promise.all( listNames.map( async (listName) =>  (await this.getList(listName))));
            const user = await this.getUser(email);
            console.log("found lists: ",lists);
            const result = await this.sendRequest("PUT","/api/subscribers/lists",{
                ids:[user.id],
                action: "add",
                status: "confirmed",
                target_list_ids: lists.map(l=>l.id)
            });
            console.log("addUserToList result: ",result);
        }catch(error){
            console.error("failed to add user to lists: ",error);
        }
    }
    async sendCampaign(listName,content,settings){
        console.log("sending campaing to "+listName,settings);
        try{
            const list = await this.getList(listName);
            const send_at = new Date(new Date().getTime() + 60000);
            console.log("found list: ",list);
            const campaign= await this.sendRequest("POST","/api/campaigns",{
                name: settings.title,
                subject:settings.subject_line,
                lists:[list.id],
                from_email: `${settings.from_name} <${settings.reply_to}>`,
                type: "regular",
                content_type:"html",
                body: content,
                //send_at: send_at.toISOString()
            });
            console.log("sendCampaign create email result: ",campaign);

            if(campaign.data)
                await this.sendRequest("PUT","/api/campaigns/"+campaign.data.id+"/status",{
                    campaign_id: campaign.data.id,
                    status: "running",
                })
            else
                console.error("failed to create campaign, no data found in result");
        }catch(error){
            console.error("failed to send campaign to list "+listName,error);
        }
    }

    async loadTemplates(){
        const result = await this.sendRequest("GET","/api/templates");
        //console.log("template list response: ",result);
        if(result.data != null){
            result.data.forEach(template => {
                this.templates[template.name] = template.id;
            });
            console.log("loaded templates: ",this.templates);
        }
    }
    async sendTemplatedEmail(templateName,email,data){
        const templateId = this.templates[templateName];
        if(templateId == null)
            throw new AppError("no email template found with name "+templateName);
        await this.ensureUser(email);
        const result=await this.sendRequest("POST","/api/tx",{
            subscriber_email: email,
            template_id: templateId,
            from_email: "Ergatas <info@ergatas.org>",
            headers:[
                {Bcc: "info@ergatas.org"}
            ],
            data: data,
            content_type: "markdown", 
        });
        console.log("template response: ",result);
    }
}