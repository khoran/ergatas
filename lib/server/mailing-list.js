
import mailchimp  from "@mailchimp/mailchimp_marketing";
import crypto from 'crypto';

export class MailingList {
    constructor(key, serverURL){
        var self=this;

        mailchimp.setConfig({
            apiKey: key,
            server: serverURL,
        });

        self.mailchimp=mailchimp;



    }

    emailHash(email){
        return crypto.createHash("md5").update(email).digest("hex");
    }

    async removeUser(listId, email){
        var self=this;
        const emailHash = self.emailHash(email);
        const listMember=await self.mailchimp.lists.getListMember(listId,emailHash);
        const tagNames = listMember.tags.map( tag => tag.name);

        //console.local("removing user. tags: ",tagNames);
        // if user has only the single tag "User", then remove.
        // also remove it the only two tags are User and Missionary
        if( (tagNames.length === 1 && tagNames[0]==="User") || 
            (tagNames.length === 2 && tagNames.includes("User") && tagNames.includes("Missionary"))){
            await self.mailchimp.lists.deleteListMember(listId,emailHash);
        }
    }
    async createUser(listId,email){
        var self=this;
        await self.mailchimp.lists.addListMember(listId, {
                email_address:email,
                status:"subscribed",
            });
    }
    async ensureUser(listId,email){
        var self=this;
        if( ! await self.userExists(listId,email))
            await self.createUser(listId,email);
    }
    async addTags(listId,email,tags){
        var self=this;
        //console.local(`adding tags to list id ${listId}, email ${email} tags: `,tags);

        await self.mailchimp.lists.updateListMemberTags(listId,self.emailHash(email),{ 
            tags: tags.map( tag =>{
                return {name:tag,
                        status:"active"};
            })
        });
    }
    async setUserName(listId,email,firstName,lastName){
        var self=this;

        await self.mailchimp.lists.updateListMember(listId,self.emailHash(email),{
            merge_fields:{
                FNAME:firstName,
                LNAME:lastName
            }
        });
    }

    async userExists(listId,email){
        var self=this;
        try{
            await self.mailchimp.lists.getListMember(listId,self.emailHash(email));
            return true;
        }catch(error){
            return false;
        }
    }

}